import axios from 'axios';
import type { Station, DataSource } from '../types';
import type { DataQueryOptions, DataSourceCapabilities } from '../types/data-source';

// NOAA-specific constants kept private to the provider implementation.
const BASE_NOAA = 'https://www.ncdc.noaa.gov/cdo-web/api/v2';

const CACHE_PREFIX = 'noaa_cache_v5_';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const DEFAULT_DATASET = 'GHCND';

export const NOAA_DATASET_WHITELIST = [DEFAULT_DATASET, 'PRECIP_HLY', 'GSOM', 'GSOY'] as const;
export const NOAA_DATATYPE_WHITELIST = ['PRCP', 'SNOW', 'SNWD', 'WESD', 'WESF', 'HPCP', 'QPCP'] as const;

interface CacheEntry<T> {
    value: T;
    timestamp: number;
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
    } catch (e) {
        console.warn('Cache write failed', e);
    }
}

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
        this.token = token;
        console.log(`[RainfallDownloader] Service Initialized. Build: ${new Date().toISOString()}`);
    }

    private get headers() {
        return { token: this.token };
    }

    private normalizeDatasetId(datasetId?: string) {
        return NOAA_DATASET_WHITELIST.includes((datasetId ?? DEFAULT_DATASET) as typeof NOAA_DATASET_WHITELIST[number])
            ? (datasetId ?? DEFAULT_DATASET)
            : DEFAULT_DATASET;
    }

    private getDefaultDatatype(datasetId: string): string {
        if (datasetId === 'PRECIP_HLY') return 'HPCP';
        if (datasetId === 'PRECIP_15') return 'QPCP';
        return 'PRCP';
    }

    private normalizeDatatypes(datatypes?: string[], datasetId?: string) {
        const defaultType = this.getDefaultDatatype(datasetId || DEFAULT_DATASET);
        const input = datatypes && datatypes.length > 0 ? datatypes : [defaultType];

        const normalized = input.filter(dt => NOAA_DATATYPE_WHITELIST.includes(dt as typeof NOAA_DATATYPE_WHITELIST[number]));

        if (normalized.length === 0) return [defaultType];
        // Deduplicate while preserving order
        return Array.from(new Set(normalized));
    }





    private async wait(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async fetchWithRetry(url: string, options: any, retries = 3): Promise<any> {
        let attempt = 0;
        while (attempt < retries) {
            try {
                return await axios.get(url, options);
            } catch (error: any) {
                attempt++;
                // Retry on 5xx errors or network errors (which often appear as status 0 or undefined in axios)
                const status = error.response?.status;
                const isRetryable = !status || status >= 500 || status === 429;

                if (!isRetryable || attempt >= retries) {
                    throw error;
                }

                const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
                console.warn(`[RainfallDownloader] Request failed, retrying in ${delay}ms... (Attempt ${attempt}/${retries})`);
                await this.wait(delay);
            }
        }
    }

    async request<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
        // Construct full URL with params for the target service
        const url = new URL(`${BASE_NOAA}${endpoint}`);

        Object.keys(params).forEach(key => {
            const val = params[key];
            if (Array.isArray(val)) {
                val.forEach(v => url.searchParams.append(key, v));
            } else if (val !== undefined && val !== null) {
                url.searchParams.append(key, String(val));
            }
        });

        const fullTargetUrl = url.toString();

        // Always try direct NOAA endpoint first with a short timeout, regardless of environment.
        try {
            const res = await this.fetchWithRetry(fullTargetUrl, {
                headers: this.headers,
                timeout: 5000
            });
            return res.data;
        } catch (error) {
            console.warn('[RainfallDownloader] Direct NOAA request failed, attempting proxies...', error);
        }

        // Fallback Strategy
        const proxies = [
            `https://corsproxy.io/?${encodeURIComponent(fullTargetUrl)}`,
            `https://thingproxy.freeboard.io/fetch/${fullTargetUrl}`
        ];

        let lastError;

        for (const proxyUrl of proxies) {
            try {
                console.log(`[RainfallDownloader] Attempting via proxy: ${proxyUrl}`);
                // allorigins doesn't always support custom headers nicely, but we try.
                // Note: NOAA requires 'token' header. corsproxy.io forwards it. allorigins might not.
                // If allorigins fails to forward header, NOAA returns 400/401.
                const res = await this.fetchWithRetry(proxyUrl, {
                    headers: this.headers,
                    timeout: 5000
                });
                return res.data;
            } catch (error) {
                console.warn(`[RainfallDownloader] Proxy failed: ${proxyUrl}`, error);
                lastError = error;
                // If it's a 401/403 (Auth), switching proxy won't help, so throw immediately to avoid wasting time?
                // Actually 504 is our main enemy. We continue.
            }
        }

        throw lastError;
    }

    async findStationsByCity(city: string, limit = 20, buffer = 0.25, options: DataQueryOptions = {}): Promise<Station[]> {
        const datasetId = this.normalizeDatasetId(options.datasetId);
        const datatypes = this.normalizeDatatypes(options.datatypes, datasetId);

        const cacheKey = `search_${city}_${limit}_${buffer}_${datasetId}_${datatypes.join(',')}`;
        const cached = getCache<Station[]>(cacheKey);
        if (cached) return cached;

        let lat: string, lon: string;

        try {
            console.log(`[RainfallDownloader] Geocoding city: ${city}`);
            const coords = await import('./geocoding').then(m => m.geocodeCity(city));
            if (!coords) return [];
            lat = coords.lat.toString();
            lon = coords.lon.toString();
        } catch (error) {
            console.warn('[RainfallDownloader] Geocoding failed', error);
            return [];
        }

        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);

        return this.findStationsByCoords(latNum, lonNum, limit, buffer, options);
    }

    async findStationsByCoords(lat: number, lon: number, limit = 20, buffer = 0.25, options: DataQueryOptions = {}): Promise<Station[]> {
        const datasetId = this.normalizeDatasetId(options.datasetId);
        const datatypes = this.normalizeDatatypes(options.datatypes, datasetId);

        const cacheKey = `search_coords_${lat}_${lon}_${limit}_${buffer}_${datasetId}_${datatypes.join(',')}`;
        const cached = getCache<Station[]>(cacheKey);
        if (cached) return cached;

        // extent order: minLat, minLon, maxLat, maxLon
        const extent = `${lat - buffer},${lon - buffer},${lat + buffer},${lon + buffer}`;

        const data: any = await this.request('/stations', {
            datasetid: datasetId,
            datatypeid: datatypes,
            limit,
            extent
        });

        const stations: Station[] = (data.results || []).map((st: any) => ({
            id: st.id,
            source: 'NOAA_CDO',
            name: st.name || '',
            latitude: st.latitude,
            longitude: st.longitude,
            elevation: st.elevation,
            mindate: st.mindate,
            maxdate: st.maxdate,
            datacoverage: st.datacoverage,
            metadata: {
                datacoverage: st.datacoverage,
                elevationUnit: st.elevationUnit
            }
        }));

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

    async getAvailableDataTypes(stationId: string, options: DataQueryOptions = {}): Promise<import('../types').DataType[]> {
        const datasetId = this.normalizeDatasetId(options.datasetId);
        const cacheKey = `datatypes_${stationId}_${datasetId}`;
        const cached = getCache<import('../types').DataType[]>(cacheKey);
        if (cached) return cached;

        const queryStationId = this.resolveStationId(datasetId, stationId);

        const data: any = await this.request('/datatypes', {
            datasetid: datasetId,
            stationid: queryStationId,
        });

        const types = (data.results || []).map((t: any) => ({
            id: t.id,
            name: t.name,
            mindate: t.mindate,
            maxdate: t.maxdate,
            datacoverage: t.datacoverage
        }));

        setCache(cacheKey, types);
        return types;
    }

    async fetchData({ stationIds, startDate, endDate, units = 'standard', datatypes = ['PRCP'], datasetId }: import('../types').FetchDataParams & DataQueryOptions): Promise<import('../types').UnifiedTimeSeries[]> {
        const normalizedDataset = this.normalizeDatasetId(datasetId);
        const normalizedDatatypes = this.normalizeDatatypes(datatypes, normalizedDataset);

        const promises = stationIds.map(async (sid) => {
            const id = this.resolveStationId(normalizedDataset, sid);
            const cacheKey = `data_${sid}_${startDate}_${endDate}_${units}_${normalizedDataset}_${normalizedDatatypes.join(',')}`;
            const cached = getCache<import('../types').UnifiedTimeSeries[]>(cacheKey);
            if (cached) return cached;

            const limit = 1000;
            let offset = 1;
            let allResults: any[] = [];

            while (true) {
                const params: any = {
                    datasetid: normalizedDataset,
                    stationid: id,
                    startdate: startDate,
                    enddate: endDate,
                    units: units === 'metric' ? 'metric' : 'standard',
                    limit,
                    offset,
                    datatypeid: normalizedDatatypes // Array handling in request() covers this
                };

                const data: any = await this.request('/data', params);
                const results = data.results || [];
                allResults = [...allResults, ...results];

                if (results.length < limit) break;
                offset += limit;
                if (offset > 10000) break; // safety
            }

            const data: import('../types').UnifiedTimeSeries[] = allResults.map((r: any) => ({
                timestamp: r.date,
                value: r.value,
                interval: normalizedDataset === 'PRECIP_HLY' ? 60 : 1440, // Crude approx: HLY is hourly, others daily
                source: 'NOAA_CDO' as const,
                stationId: sid,
                parameter: r.datatype,
                qualityFlag: r.attributes, // Store raw attributes string
                // Map legacy fields for temporary compat if needed by consumers using UnifiedTimeSeries as generic bucket
                date: r.date,
                datatype: r.datatype,
                originalValue: r.value,
                originalUnits: units // 'metric' or 'standard'
            })).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            setCache(cacheKey, data);
            return data;
        });

        const results = await Promise.all(promises);
        return results.flat();
    }
}
