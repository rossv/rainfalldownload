import axios from 'axios';

// Nominatim supports CORS directly - no proxy needed
const NOMINATIM_BASE = import.meta.env.DEV
    ? '/api/nominatim'
    : 'https://nominatim.openstreetmap.org/search';

export async function geocodeCity(city: string): Promise<{ lat: number; lon: number } | null> {
    const query = city.trim();
    if (!query) return null;

    try {
        console.log(`[RainfallDownloader] Geocoding city: ${query}`);
        const geoRes = await axios.get(NOMINATIM_BASE, {
            params: { q: query, format: 'json', limit: 1 },
            timeout: 10000,
            headers: {
                'User-Agent': 'RainfallDownloader/1.0'
            }
        });

        if (Array.isArray(geoRes.data) && geoRes.data.length > 0) {
            const lat = Number(geoRes.data[0].lat);
            const lon = Number(geoRes.data[0].lon);

            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                console.warn('[RainfallDownloader] Geocoding returned invalid coordinates');
                return null;
            }

            console.log('[RainfallDownloader] Geocoding success:', geoRes.data[0]);
            return {
                lat,
                lon
            };
        }

        console.warn('[RainfallDownloader] Geocoding returned no results');
        return null;
    } catch (error) {
        console.error('[RainfallDownloader] Geocoding failed:', error);
        return null;
    }
}

