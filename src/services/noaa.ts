import axios from 'axios';
import type { DataSource, DataType, FetchDataParams, Station, UnifiedTimeSeries } from '../types';
import { geocodeCity } from './geocoding';
import type { DataQueryOptions, DataSourceCapabilities } from '../types/data-source';

const BASE_NOAA = '/api/noaa';

const CACHE_PREFIX = 'noaa_cache_v6_';
const CACHE_TTL = 24 * 60 * 60 * 1000;
const DEFAULT_DATASET = 'GHCND';
const DEFAULT_SEARCH_LIMIT = 20;
const DEFAULT_SEARCH_BUFFER = 0.25;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;
const MAX_PAGE_SIZE = 1000;
const MAX_PAGE_REQUESTS = 25;
const MAX_SEARCH_LIMIT = 1000;

export const NOAA_DATASET_WHITELIST = [DEFAULT_DATASET, 'PRECIP_HLY', 'GSOM', 'GSOY'] as const;
export const NOAA_DATATYPE_WHITELIST = ['PRCP', 'SNOW', 'SNWD', 'WESD', 'WESF', 'HPCP', 'QPCP'] as const;

type NoaaDatasetId = typeof NOAA_DATASET_WHITELIST[number];
type NoaaDatatypeId = typeof NOAA_DATATYPE_WHITELIST[number];

interface CacheEntry<T> {
    value: T;
    timestamp: number;
}

interface AxiosLikeError {
    code?: string;
    message?: string;
    response?: {
        status?: number;
        statusText?: string;
        data?: unknown;
        headers?: Record<string, string | undefined>;
    };
}

interface NoaaEnvelope<T> {
    results?: T[];
    metadata?: {
        resultset?: {
            count?: number;
            limit?: number;
            offset?: number;
        };
    };
}

interface NoaaStationRecord {
    id?: string;
    name?: string;
    latitude?: number;
    longitude?: number;
    elevation?: number;
    elevationUnit?: string;
    mindate?: string;
    maxdate?: string;
    datacoverage?: number;
}

interface NoaaDataTypeRecord {
    id?: string;
    name?: string;
    mindate?: string;
    maxdate?: string;
    datacoverage?: number;
}

interface NoaaDataRecord {
    date?: string;
    datatype?: string;
    value?: number | string;
    attributes?: string;
}

function getCache<T>(key: string): T | null {
    try {
        const item = localStorage.getItem(CACHE_PREFIX + key);
        if (!item) return null;

        const entry: CacheEntry<T> = JSON.parse(item);
        if (Date.now() - entry.timestamp > CACHE_TTL) {
            localStorage.removeItem(CACHE_PREFIX + key);
            return null;
        }
        return entry.value;
    } catch {
        return null;
    }
}

function setCache<T>(key: string, value: T) {
    try {
        const entry: CacheEntry<T> = {
            value,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch (error: any) {
        if (error?.name === 'QuotaExceededError' || error?.code === 22 || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
            const cacheKeys: string[] = [];
            for (let index = 0; index < localStorage.length; index += 1) {
                const storageKey = localStorage.key(index);
                if (storageKey?.startsWith(CACHE_PREFIX)) {
                    cacheKeys.push(storageKey);
                }
            }

            cacheKeys.forEach(storageKey => localStorage.removeItem(storageKey));

            try {
                const entry: CacheEntry<T> = { value, timestamp: Date.now() };
                localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
            } catch (retryError) {
                console.warn('[RainfallDownloader] NOAA cache write failed after clearing cache.', retryError);
            }
        } else {
            console.warn('[RainfallDownloader] NOAA cache write failed.', error);
        }
    }
}

const isAxiosLikeError = (error: unknown): error is AxiosLikeError => (
    typeof error === 'object' &&
    error !== null &&
    ('message' in error || 'response' in error || 'code' in error)
);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const toIsoTimestamp = (value: string) => {
    const normalized = value.includes('T') ? value : `${value}T00:00:00`;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return null;
    return normalized;
};

export const NOAA_CAPABILITIES: DataSourceCapabilities = {
    id: 'noaa',
    name: 'NOAA NCDC',
    supportsStationSearch: true,
    supportsSpatialSearch: true,
    supportsGridInterpolation: false,
    requiresApiKey: true,
    description: 'NOAA Climate Data Online station datasets (GHCND, PRECIP_HLY, GSOM, GSOY)'
};

export class NoaaService implements DataSource {
    static readonly ID = NOAA_CAPABILITIES.id;
    static readonly NAME = NOAA_CAPABILITIES.name;

    private token: string;

    readonly id = NoaaService.ID;
    readonly name = NoaaService.NAME;
    readonly capabilities: DataSourceCapabilities = NOAA_CAPABILITIES;

    constructor(token: string) {
        this.token = token.trim();
        console.log(`[RainfallDownloader] NOAA service initialized. Build: ${new Date().toISOString()}`);
    }

    private get headers() {
        return {
            Accept: 'application/json',
            token: this.token
        };
    }

    private ensureToken() {
        if (!this.token) {
            throw new Error('NOAA API token is required. Add it in Settings before searching or downloading data.');
        }
    }

    private normalizeDatasetId(datasetId?: string): NoaaDatasetId {
        const normalized = datasetId ?? DEFAULT_DATASET;
        return NOAA_DATASET_WHITELIST.includes(normalized as NoaaDatasetId)
            ? normalized as NoaaDatasetId
            : DEFAULT_DATASET;
    }

    private getDefaultDatatype(datasetId: string): NoaaDatatypeId {
        if (datasetId === 'PRECIP_HLY') return 'HPCP';
        return 'PRCP';
    }

    private normalizeDatatypes(datatypes?: string[], datasetId?: string) {
        const defaultType = this.getDefaultDatatype(datasetId || DEFAULT_DATASET);
        const input = datatypes && datatypes.length > 0 ? datatypes : [defaultType];

        const normalized = input.filter(dt => NOAA_DATATYPE_WHITELIST.includes(dt as NoaaDatatypeId));

        if (normalized.length === 0) return [defaultType];
        return Array.from(new Set(normalized));
    }

    private normalizeLimit(limit?: number) {
        if (!Number.isFinite(limit)) return DEFAULT_SEARCH_LIMIT;
        return Math.max(1, Math.min(MAX_SEARCH_LIMIT, Math.floor(limit as number)));
    }

    private normalizeBuffer(buffer?: number) {
        if (!Number.isFinite(buffer)) return DEFAULT_SEARCH_BUFFER;
        return Math.max(0.01, Math.min(5, buffer as number));
    }

    private normalizeDate(value: string, label: string) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw new Error(`${label} must use YYYY-MM-DD format.`);
        }

        const parsed = new Date(`${value}T00:00:00Z`);
        if (Number.isNaN(parsed.getTime())) {
            throw new Error(`${label} is invalid.`);
        }

        return value;
    }

    private buildUrl(endpoint: string, params: Record<string, unknown> = {}) {
        const url = new URL(`${BASE_NOAA}${endpoint}`, window.location.origin);

        Object.entries(params).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                value.forEach(item => {
                    if (item !== undefined && item !== null && `${item}`.trim() !== '') {
                        url.searchParams.append(key, String(item));
                    }
                });
                return;
            }

            if (value !== undefined && value !== null && `${value}`.trim() !== '') {
                url.searchParams.append(key, String(value));
            }
        });

        return url.toString();
    }

    private async wait(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private isRetryableError(error: unknown) {
        if (!isAxiosLikeError(error)) return false;

        const status = error.response?.status;
        if (status === undefined) return true;
        return status === 408 || status === 425 || status === 429 || status >= 500;
    }

    private getRetryDelayMs(attempt: number, error: unknown) {
        if (isAxiosLikeError(error)) {
            const retryAfter = error.response?.headers?.['retry-after'];
            if (retryAfter) {
                const seconds = Number(retryAfter);
                if (Number.isFinite(seconds)) {
                    return Math.max(500, seconds * 1000);
                }

                const retryTime = new Date(retryAfter).getTime();
                if (Number.isFinite(retryTime)) {
                    return Math.max(500, retryTime - Date.now());
                }
            }
        }

        return Math.min(1000 * Math.pow(2, attempt), 8000);
    }

    private parsePayload<T>(payload: unknown, context: string): T {
        if (typeof payload === 'string') {
            try {
                return JSON.parse(payload) as T;
            } catch {
                throw new Error(`${context} returned invalid JSON.`);
            }
        }

        if (payload && typeof payload === 'object') {
            return payload as T;
        }

        throw new Error(`${context} returned an unexpected response.`);
    }

    private extractErrorMessage(error: unknown, context: string) {
        if (!isAxiosLikeError(error)) {
            return `${context} failed unexpectedly.`;
        }

        const status = error.response?.status;
        const data = error.response?.data;
        const apiMessage = typeof data === 'string'
            ? data
            : (data as Record<string, unknown> | undefined)?.message ??
            (data as Record<string, unknown> | undefined)?.developerMessage ??
            (data as Record<string, unknown> | undefined)?.error;

        if (status === 401 || status === 403) {
            return 'NOAA rejected the request. Check that your API token is valid and active.';
        }

        if (status === 429) {
            return 'NOAA rate-limited the request. Please wait a moment and try again.';
        }

        if (status === 400 && typeof apiMessage === 'string' && apiMessage.trim()) {
            return `NOAA rejected the request: ${apiMessage.trim()}`;
        }

        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return `${context} timed out. NOAA may be responding slowly.`;
        }

        if (typeof apiMessage === 'string' && apiMessage.trim()) {
            return `${context} failed: ${apiMessage.trim()}`;
        }

        if (status) {
            return `${context} failed with HTTP ${status}${error.response?.statusText ? ` ${error.response.statusText}` : ''}.`;
        }

        return `${context} failed due to a network error.`;
    }

    private async executeRequest<T>(url: string, context: string): Promise<T> {
        let lastError: unknown;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
            try {
                const response = await axios.get(url, {
                    headers: this.headers,
                    timeout: REQUEST_TIMEOUT_MS
                });
                return this.parsePayload<T>(response.data, context);
            } catch (error) {
                lastError = error;
                if (!this.isRetryableError(error) || attempt === MAX_RETRIES - 1) {
                    throw new Error(this.extractErrorMessage(error, context));
                }

                const delay = this.getRetryDelayMs(attempt, error);
                console.warn(`[RainfallDownloader] NOAA request retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms.`);
                await this.wait(delay);
            }
        }

        throw new Error(this.extractErrorMessage(lastError, context));
    }

    private async request<T>(endpoint: string, params: Record<string, unknown> = {}, context = 'NOAA request'): Promise<T> {
        this.ensureToken();

        const targetUrl = this.buildUrl(endpoint, params);
        return this.executeRequest<T>(targetUrl, context);
    }

    async findStationsByCity(city: string, limit = DEFAULT_SEARCH_LIMIT, buffer = DEFAULT_SEARCH_BUFFER, options: DataQueryOptions = {}): Promise<Station[]> {
        if (!city.trim()) return [];

        const datasetId = this.normalizeDatasetId(options.datasetId);
        const datatypes = this.normalizeDatatypes(options.datatypes, datasetId);
        const cacheKey = `search_${city.trim().toLowerCase()}_${limit}_${buffer}_${datasetId}_${datatypes.join(',')}`;
        const cached = getCache<Station[]>(cacheKey);
        if (cached) return cached;

        const coords = await geocodeCity(city.trim());
        if (!coords) return [];

        const stations = await this.findStationsByCoords(coords.lat, coords.lon, limit, buffer, options);
        setCache(cacheKey, stations);
        return stations;
    }

    async findStationsByCoords(lat: number, lon: number, limit = DEFAULT_SEARCH_LIMIT, buffer = DEFAULT_SEARCH_BUFFER, options: DataQueryOptions = {}): Promise<Station[]> {
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            throw new Error('Latitude and longitude must be valid decimal degrees.');
        }

        const datasetId = this.normalizeDatasetId(options.datasetId);
        const datatypes = this.normalizeDatatypes(options.datatypes, datasetId);
        const normalizedLimit = this.normalizeLimit(limit);
        const normalizedBuffer = this.normalizeBuffer(buffer);
        const cacheKey = `search_coords_${lat.toFixed(4)}_${lon.toFixed(4)}_${normalizedLimit}_${normalizedBuffer}_${datasetId}_${datatypes.join(',')}`;
        const cached = getCache<Station[]>(cacheKey);
        if (cached) return cached;

        const extent = `${lat - normalizedBuffer},${lon - normalizedBuffer},${lat + normalizedBuffer},${lon + normalizedBuffer}`;
        const shouldFilterDatatypes = options.datatypes && options.datatypes.length > 0;

        const data = await this.request<NoaaEnvelope<NoaaStationRecord>>('/stations', {
            datasetid: datasetId,
            datatypeid: shouldFilterDatatypes ? datatypes : undefined,
            limit: normalizedLimit,
            extent
        }, 'NOAA station search');

        if (data.results !== undefined && !Array.isArray(data.results)) {
            throw new Error('NOAA station search returned an invalid payload.');
        }

        const deduped = new Map<string, Station>();
        (data.results ?? [])
            .map((station): Station | null => {
                if (!station.id || !isFiniteNumber(station.latitude) || !isFiniteNumber(station.longitude)) {
                    return null;
                }

                return {
                    id: station.id,
                    source: 'NOAA_CDO',
                    name: station.name || station.id,
                    latitude: station.latitude,
                    longitude: station.longitude,
                    elevation: isFiniteNumber(station.elevation) ? station.elevation : undefined,
                    mindate: station.mindate,
                    maxdate: station.maxdate,
                    datacoverage: isFiniteNumber(station.datacoverage) ? station.datacoverage : undefined,
                    metadata: {
                        datacoverage: station.datacoverage,
                        elevationUnit: station.elevationUnit
                    }
                };
            })
            .filter((station): station is Station => station !== null)
            .sort((left, right) => {
                const coverageDelta = (right.datacoverage ?? 0) - (left.datacoverage ?? 0);
                if (coverageDelta !== 0) return coverageDelta;

                const leftDistance = Math.abs(left.latitude - lat) + Math.abs(left.longitude - lon);
                const rightDistance = Math.abs(right.latitude - lat) + Math.abs(right.longitude - lon);
                return leftDistance - rightDistance;
            })
            .forEach(station => {
                if (!deduped.has(station.id)) {
                    deduped.set(station.id, station);
                }
            });

        const stations = Array.from(deduped.values());

        setCache(cacheKey, stations);
        return stations;
    }

    private resolveStationId(datasetId: string, stationId: string): string {
        // ... (existing logic same)
        // If dataset is GHCND, we generally expect GHCND: or RAW ids.
        // But if dataset is PRECIP_HLY, we need COOP: or WBAN: prefixes usually.

        // 1. If stationId already has a prefix that looks compatible, trust it.
        // PRECIP_HLY uses COOP: and WBAN:
        if (datasetId === 'PRECIP_HLY') {
            if (stationId.startsWith('COOP:') || stationId.startsWith('WBAN:')) {
                return stationId;
            }
        }

        // 2. Strip existing prefix to analyze raw ID
        const rawId = stationId.includes(':') ? stationId.split(':')[1] : stationId;

        if (datasetId === 'PRECIP_HLY') {
            // Heuristic for GHCND -> PRECIP_HLY conversion
            // GHCND:USC00xxxxxx -> COOP:xxxxxx (6 digits)
            if (rawId.startsWith('USC00')) {
                return `COOP:${rawId.substring(5)}`;
            }
            // GHCND:USW00xxxxx -> WBAN:xxxxx (5 digits)
            if (rawId.startsWith('USW00')) {
                return `WBAN:${rawId.substring(5)}`;
            }

            // If raw ID is numeric and 6 chars, treat as COOP?
            if (/^\d{6}$/.test(rawId)) return `COOP:${rawId}`;
            // If raw ID is numeric and 5 chars, treat as WBAN?
            if (/^\d{5}$/.test(rawId)) return `WBAN:${rawId}`;

            // Fallback: If we can't determine, try COOP if purely numeric, else legacy behavior
            // We previously forced COOP: here, but that breaks alphanumeric IDs (like CoCoRaHS US1...)
            // which definitely aren't COOP numeric IDs.
            // Better to standard prefixing if heuristics fail.
            return `${datasetId}:${rawId}`;
        }

        // Default: Ensure using the requested dataset as prefix if no other logic applies
        // This was the old behavior (e.g. GHCND:ID -> GSOM:ID)
        // Check if GSOM/GSOY use GHCND IDs? Usually yes.
        return `${datasetId}:${rawId}`;
    }

    async getAvailableDataTypes(stationId: string, options: DataQueryOptions = {}): Promise<DataType[]> {
        const datasetId = this.normalizeDatasetId(options.datasetId);
        const cacheKey = `datatypes_${stationId}_${datasetId}`;
        const cached = getCache<DataType[]>(cacheKey);
        if (cached) return cached;

        const queryStationId = this.resolveStationId(datasetId, stationId);

        const data = await this.request<NoaaEnvelope<NoaaDataTypeRecord>>('/datatypes', {
            datasetid: datasetId,
            stationid: queryStationId,
        }, `NOAA datatype lookup for ${stationId}`);

        if (data.results !== undefined && !Array.isArray(data.results)) {
            throw new Error('NOAA datatype lookup returned an invalid payload.');
        }

        const types = Array.from(new Map(
            (data.results ?? [])
                .filter((record): record is Required<Pick<NoaaDataTypeRecord, 'id' | 'name' | 'mindate' | 'maxdate'>> & NoaaDataTypeRecord => (
                    Boolean(record.id && record.name && record.mindate && record.maxdate)
                ))
                .map(record => [record.id, {
                    id: record.id,
                    name: record.name,
                    mindate: record.mindate,
                    maxdate: record.maxdate,
                    datacoverage: isFiniteNumber(record.datacoverage) ? record.datacoverage : 0
                } satisfies DataType])
        ).values());

        setCache(cacheKey, types);
        return types;
    }

    async fetchData({ stationIds, startDate, endDate, units = 'standard', datatypes = ['PRCP'], datasetId }: FetchDataParams & DataQueryOptions): Promise<UnifiedTimeSeries[]> {
        if (!stationIds || stationIds.length === 0) return [];

        const normalizedDataset = this.normalizeDatasetId(datasetId);
        const normalizedDatatypes = this.normalizeDatatypes(datatypes, normalizedDataset);
        const normalizedStartDate = this.normalizeDate(startDate, 'Start date');
        const normalizedEndDate = this.normalizeDate(endDate, 'End date');

        if (normalizedStartDate > normalizedEndDate) {
            throw new Error('Start date must be on or before end date.');
        }

        const uniqueStationIds = Array.from(new Set(stationIds.filter(Boolean)));
        const promises = uniqueStationIds.map(async (sid) => {
            const id = this.resolveStationId(normalizedDataset, sid);
            const cacheKey = `data_${sid}_${normalizedStartDate}_${normalizedEndDate}_${units}_${normalizedDataset}_${normalizedDatatypes.join(',')}`;
            const cached = getCache<UnifiedTimeSeries[]>(cacheKey);
            if (cached) return cached;

            let offset = 1;
            const allResults: NoaaDataRecord[] = [];

            for (let page = 0; page < MAX_PAGE_REQUESTS; page += 1) {
                const data = await this.request<NoaaEnvelope<NoaaDataRecord>>('/data', {
                    datasetid: normalizedDataset,
                    stationid: id,
                    startdate: normalizedStartDate,
                    enddate: normalizedEndDate,
                    units: units === 'metric' ? 'metric' : 'standard',
                    limit: MAX_PAGE_SIZE,
                    offset,
                    datatypeid: normalizedDatatypes
                }, `NOAA data download for ${sid}`);

                if (data.results !== undefined && !Array.isArray(data.results)) {
                    throw new Error(`NOAA data download for ${sid} returned an invalid payload.`);
                }

                const results = data.results ?? [];
                allResults.push(...results);

                const totalCount = data.metadata?.resultset?.count;
                const reachedLastPage = results.length < MAX_PAGE_SIZE;
                const reachedKnownTotal = Number.isFinite(totalCount) && allResults.length >= (totalCount as number);

                if (results.length === 0 || reachedLastPage || reachedKnownTotal) break;
                offset += results.length;
            }

            const data = Array.from(new Map(
                allResults
                    .map(record => {
                        const timestamp = record.date ? toIsoTimestamp(record.date) : null;
                        const parameter = typeof record.datatype === 'string' && record.datatype.trim()
                            ? record.datatype
                            : this.getDefaultDatatype(normalizedDataset);
                        const value = typeof record.value === 'string' ? Number(record.value) : record.value;

                        if (!timestamp || !Number.isFinite(value)) {
                            return null;
                        }

                        return {
                            timestamp,
                            value: value as number,
                            interval: normalizedDataset === 'PRECIP_HLY' ? 60 : 1440,
                            source: 'NOAA_CDO' as const,
                            stationId: sid,
                            parameter,
                            qualityFlag: typeof record.attributes === 'string' ? record.attributes : undefined,
                            date: timestamp,
                            datatype: parameter,
                            originalValue: value as number,
                            originalUnits: units
                        } as UnifiedTimeSeries;
                    })
                    .filter((record): record is UnifiedTimeSeries => record !== null)
                    .map(record => [`${record.stationId}|${record.parameter}|${record.timestamp}`, record])
            ).values()).sort((a, b) => {
                const timestampDelta = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
                if (timestampDelta !== 0) return timestampDelta;
                return a.parameter.localeCompare(b.parameter);
            });

            setCache(cacheKey, data);
            return data;
        });

        const results = await Promise.all(promises);
        return results.flat();
    }
}
