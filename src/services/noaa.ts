import axios from 'axios';
import type { Station, RainfallData } from '../types';

// Use direct URLs for both dev and prod. Nominatim and NOAA support CORS.
const BASE_NOAA = 'https://www.ncdc.noaa.gov/cdo-web/api/v2';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';

// Simple cache using localStorage
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

export class NoaaService {
    private token: string;

    constructor(token: string) {
        this.token = token;
        console.log(`[RainfallDownloader] Service Initialized. Build: ${new Date().toISOString()}`);
    }

    private get headers() {
        return { token: this.token };
    }





    async request<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
        // Construct full URL with params for the target service
        const url = new URL(`${BASE_NOAA}${endpoint}`);

        // Handle array params (like datatypes) manually to match NOAA expectation if needed,
        // but standard URLSearchParams handles repeats if we append carefully.
        // Assuming simple params for now or let URLSearchParams handle it.
        Object.keys(params).forEach(key => {
            const val = params[key];
            if (Array.isArray(val)) {
                val.forEach(v => url.searchParams.append(key, v));
            } else if (val !== undefined && val !== null) {
                url.searchParams.append(key, String(val));
            }
        });

        const fullTargetUrl = url.toString();
        let requestUrl = fullTargetUrl;

        // If Production, wrap with Proxy
        if (import.meta.env.PROD) {
            // corsproxy.io expects encoded target URL
            requestUrl = `https://corsproxy.io/?${encodeURIComponent(fullTargetUrl)}`;
        }

        // Perform request. Note: we pass empty params because we baked them into the URL.
        const res = await axios.get(requestUrl, {
            headers: this.headers
        });

        return res.data;
    }

    async findStationsByCity(city: string, limit = 20, buffer = 0.25): Promise<Station[]> {
        const cacheKey = `search_${city}_${limit}_${buffer}`;
        const cached = getCache<Station[]>(cacheKey);
        if (cached) return cached;

        // 1. Geocode city
        const geoRes = await axios.get(NOMINATIM_BASE, {
            params: { q: city, format: 'json', limit: 1 }
        });

        if (!geoRes.data || geoRes.data.length === 0) return [];

        const { lat, lon } = geoRes.data[0];
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
