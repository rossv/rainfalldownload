import axios from 'axios';
import type { Station, RainfallData, DataSource } from '../types';
import type { DataSourceCapabilities } from '../types/data-source';

// NOAA-specific constants kept private to the provider implementation.
const BASE_NOAA = 'https://www.ncdc.noaa.gov/cdo-web/api/v2';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';

const CACHE_PREFIX = 'noaa_cache_';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

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
    supportsGridInterpolation: false,
    requiresApiKey: true,
    description: 'NOAA Climate Data Online (GHCND)'
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

    async findStationsByCity(city: string, limit = 20, buffer = 0.25): Promise<Station[]> {
        const cacheKey = `search_${city}_${limit}_${buffer}`;
        const cached = getCache<Station[]>(cacheKey);
        if (cached) return cached;

        // 1. Geocode city
        // Strategy: Try DIRECT first (browsers often allow it), fallback to PROXY.
        let lat: string, lon: string;

        try {
            console.log(`[RainfallDownloader] Geocoding city (Direct): ${city}`);
            const geoRes = await axios.get(NOMINATIM_BASE, {
                params: { q: city, format: 'json', limit: 1 }
            });
            if (!geoRes.data || geoRes.data.length === 0) return [];
            lat = geoRes.data[0].lat;
            lon = geoRes.data[0].lon;
        } catch (directError) {
            console.warn('[RainfallDownloader] Direct Nominatim failed, trying proxy...', directError);
            // Fallback: Use our robust request method but pointing to Nominatim
            // We need to manually construct the nominatim URL because request() assumes BASE_NOAA.
            // Actually, let's just do a manual proxy fetch similar to request() logic but simplified for this one-off.

            const targetUrl = new URL(NOMINATIM_BASE);
            targetUrl.searchParams.append('q', city);
            targetUrl.searchParams.append('format', 'json');
            targetUrl.searchParams.append('limit', '1');

            const fullTargetUrl = targetUrl.toString();
            // Use corsproxy.io as reliable fallback for nominatim
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(fullTargetUrl)}`;

            const geoRes = await this.fetchWithRetry(proxyUrl, {});
            // Note: Nominatim response is array
            if (!geoRes.data || geoRes.data.length === 0) return [];
            lat = geoRes.data[0].lat;
            lon = geoRes.data[0].lon;
        }

        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);

        return this.findStationsByCoords(latNum, lonNum, limit, buffer);
    }

    async findStationsByCoords(lat: number, lon: number, limit = 20, buffer = 0.25): Promise<Station[]> {
        const cacheKey = `search_coords_${lat}_${lon}_${limit}_${buffer}`;
        const cached = getCache<Station[]>(cacheKey);
        if (cached) return cached;

        // extent order: minLat, minLon, maxLat, maxLon
        const extent = `${lat - buffer},${lon - buffer},${lat + buffer},${lon + buffer}`;

        const data: any = await this.request('/stations', {
            datasetid: 'GHCND',
            datatypeid: 'PRCP',
            limit,
            extent
        });

        const stations = (data.results || []).map((st: any) => ({
            id: st.id,
            name: st.name || '',
            latitude: st.latitude,
            longitude: st.longitude,
            mindate: st.mindate,
            maxdate: st.maxdate,
            datacoverage: st.datacoverage
        }));

        setCache(cacheKey, stations);
        return stations;
    }

    async getAvailableDataTypes(stationId: string): Promise<import('../types').DataType[]> {
        const cacheKey = `datatypes_${stationId}`;
        const cached = getCache<import('../types').DataType[]>(cacheKey);
        if (cached) return cached;

        const data: any = await this.request('/datatypes', {
            datasetid: 'GHCND',
            stationid: stationId.includes(':') ? stationId : `GHCND:${stationId}`,
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

    async fetchData({ stationIds, startDate, endDate, units = 'standard', datatypes = ['PRCP'] }: import('../types').FetchDataParams): Promise<RainfallData[]> {
        const promises = stationIds.map(async (sid) => {
            const id = sid.includes(':') ? sid : `GHCND:${sid}`;
            const cacheKey = `data_${sid}_${startDate}_${endDate}_${units}_${datatypes.join(',')}`;
            const cached = getCache<RainfallData[]>(cacheKey);
            if (cached) return cached;

            const limit = 1000;
            let offset = 1;
            let allResults: any[] = [];

            while (true) {
                const params: any = {
                    datasetid: 'GHCND',
                    stationid: id,
                    startdate: startDate,
                    enddate: endDate,
                    units: units === 'metric' ? 'metric' : 'standard',
                    limit,
                    offset,
                    datatypeid: datatypes // Array handling in request() covers this
                };

                const data: any = await this.request('/data', params);
                const results = data.results || [];
                allResults = [...allResults, ...results];

                if (results.length < limit) break;
                offset += limit;
                if (offset > 10000) break; // safety
            }

            const data: RainfallData[] = allResults.map((r: any) => ({
                date: r.date,
                value: r.value,
                datatype: r.datatype,
                stationId: sid
            })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            setCache(cacheKey, data);
            return data;
        });

        const results = await Promise.all(promises);
        return results.flat();
    }
}
