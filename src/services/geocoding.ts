import { getJsonWithRetry } from './http';

const NOMINATIM_BASE = '/api/nominatim';
const CACHE_PREFIX = 'geocode_cache_v1_';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type GeocodeResult = { lat: number; lon: number };
type CacheEntry<T> = { value: T; timestamp: number };
type NominatimResult = { lat?: string; lon?: string };

const inflightRequests = new Map<string, Promise<GeocodeResult | null>>();

const getCache = (key: string): GeocodeResult | null => {
    try {
        const raw = localStorage.getItem(CACHE_PREFIX + key);
        if (!raw) return null;

        const entry = JSON.parse(raw) as CacheEntry<GeocodeResult>;
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            localStorage.removeItem(CACHE_PREFIX + key);
            return null;
        }

        return entry.value;
    } catch {
        return null;
    }
};

const setCache = (key: string, value: GeocodeResult) => {
    try {
        const entry: CacheEntry<GeocodeResult> = {
            value,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch (error) {
        console.warn('[RainfallDownloader] Geocoding cache write failed.', error);
    }
};

export async function geocodeCity(city: string): Promise<GeocodeResult | null> {
    const query = city.trim();
    if (!query) return null;

    const cacheKey = query.toLowerCase();
    const cached = getCache(cacheKey);
    if (cached) return cached;

    const existing = inflightRequests.get(cacheKey);
    if (existing) return existing;

    const request = (async () => {
        try {
            console.log(`[RainfallDownloader] Geocoding city: ${query}`);
            const payload = await getJsonWithRetry<NominatimResult[]>(NOMINATIM_BASE, {
                params: { q: query, format: 'json', limit: 1 }
            }, { retries: 2, backoffMs: 400 });

            if (!Array.isArray(payload) || payload.length === 0) {
                console.warn('[RainfallDownloader] Geocoding returned no results');
                return null;
            }

            const lat = Number(payload[0]?.lat);
            const lon = Number(payload[0]?.lon);

            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                console.warn('[RainfallDownloader] Geocoding returned invalid coordinates');
                return null;
            }

            const result = { lat, lon };
            setCache(cacheKey, result);
            return result;
        } catch (error) {
            console.error('[RainfallDownloader] Geocoding failed:', error);
            return null;
        } finally {
            inflightRequests.delete(cacheKey);
        }
    })();

    inflightRequests.set(cacheKey, request);
    return request;
}

