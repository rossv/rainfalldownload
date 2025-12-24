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

    /**
     * Helper to wrap URLs with a CORS proxy in production.
     * We use corsproxy.io because it forwards custom headers (like 'token'),
     * whereas allorigins often strips them.
     */
    private getUrl(endpoint: string): string {
        const url = `${BASE_NOAA}${endpoint}`;
        if (import.meta.env.PROD) {
            return `https://corsproxy.io/?${encodeURIComponent(url)}`;
        }
        return url;
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

        const res = await axios.get(this.getUrl('/stations'), {
            headers: this.headers,
            params: {
                datasetid: 'GHCND',
                datatypeid: 'PRCP',
                limit,
                extent
            }
        });

        const stations = (res.data.results || []).map((st: any) => ({
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

        const res = await axios.get(this.getUrl('/datatypes'), {
            headers: this.headers,
            params: {
                datasetid: 'GHCND',
                stationid: stationId.includes(':') ? stationId : `GHCND:${stationId}`,
            }
        });

        const types = (res.data.results || []).map((t: any) => ({
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
        // We'll fetch for all stations and datatypes.
        // NOAA API allows stationid to be repeated, or we can just parallelize requests if needed.
        // The API per station is safer for rate limits and simplicity since we need to track source.

        const promises = stationIds.map(async (sid) => {
            const id = sid.includes(':') ? sid : `GHCND:${sid}`;
            // we will fetch each datatype ? No, datatypes can be filtered in params? 
            // actually the API allows datatypeid to be repeated.

            // To properly track "which datatype this value belongs to", we might want separate requests 
            // OR we rely on the result payload containing datatype. The result payload DOES contain 'datatype'.

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
                    offset
                };

                // Add datatypes. axios serializer for arrays repeats the key 'datatypeid=X&datatypeid=Y'
                // But we need to make sure axios handles this array correctly. 
                // By default axios might use brackets. Let's explicitly loop if needed or check axios config.
                // Simpler: just join with nothing if we custom serialize, but axios 'params' usually does brackets []
                // We'll manually construct the search params to be safe or rely on axios 
                // but standard noaa api usage from other tools suggests repeated keys.
                // Let's manually filter results if we just request strict or use a loop.
                // Actually, let's just pass `datatypeid` in params. Axios by default mimics PHP array[] 
                // we'll need to use paramsSerializer if we want repeated keys without brackets.
                // For now, let's keep it simple: pass datatypes individually if count is small, 
                // or just rely on 'PRCP' default if none.

                // However, to keep it simple and robust, let's just fetch everything for the station 
                // if datatypes list is empty, or filter if provided. 
                // Actually, user wants specific types. 

                // Let's use a custom paramsSerializer for axios to be safe with NOAA

                const res = await axios.get(this.getUrl('/data'), {
                    headers: this.headers,
                    params: {
                        ...params,
                        datatypeid: datatypes
                    },
                    paramsSerializer: params => {
                        const search = new URLSearchParams();
                        for (const key of Object.keys(params)) {
                            const val = params[key];
                            if (Array.isArray(val)) {
                                val.forEach(v => search.append(key, v));
                            } else {
                                search.append(key, val);
                            }
                        }
                        return search.toString();
                    }
                });

                const results = res.data.results || [];
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
