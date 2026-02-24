import axios from 'axios';

// Nominatim supports CORS directly - no proxy needed
const NOMINATIM_BASE = import.meta.env.DEV
    ? '/api/nominatim'
    : 'https://nominatim.openstreetmap.org/search';

export async function geocodeCity(city: string): Promise<{ lat: number; lon: number } | null> {
    try {
        console.log(`[RainfallDownloader] Geocoding city: ${city}`);
        const geoRes = await axios.get(NOMINATIM_BASE, {
            params: { q: city, format: 'json', limit: 1 },
            timeout: 10000,
            headers: {
                // Nominatim requires a User-Agent for identification
                'User-Agent': 'RainfallDownloader/1.0'
            }
        });

        if (geoRes.data && geoRes.data.length > 0) {
            console.log(`[RainfallDownloader] Geocoding success:`, geoRes.data[0]);
            return {
                lat: parseFloat(geoRes.data[0].lat),
                lon: parseFloat(geoRes.data[0].lon)
            };
        }

        console.warn('[RainfallDownloader] Geocoding returned no results');
        return null;
    } catch (error) {
        console.error('[RainfallDownloader] Geocoding failed:', error);
        return null;
    }
}

