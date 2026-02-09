import axios from 'axios';

const NOMINATIM_BASE = import.meta.env.DEV
    ? '/api/nominatim'
    : 'https://nominatim.openstreetmap.org/search';

async function fetchWithRetry(url: string, options: any = {}, retries = 3): Promise<any> {
    let attempt = 0;
    while (attempt < retries) {
        try {
            return await axios.get(url, options);
        } catch (error: any) {
            attempt++;
            const status = error.response?.status;
            // Retry on 5xx or network errors
            if ((status && status < 500 && status !== 429) || attempt >= retries) {
                throw error;
            }
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

export async function geocodeCity(city: string): Promise<{ lat: number; lon: number } | null> {
    // 1. Try Direct
    try {
        const geoRes = await axios.get(NOMINATIM_BASE, {
            params: { q: city, format: 'json', limit: 1 }
        });
        if (geoRes.data && geoRes.data.length > 0) {
            return {
                lat: parseFloat(geoRes.data[0].lat),
                lon: parseFloat(geoRes.data[0].lon)
            };
        }
    } catch (e) {
        console.warn('Direct geocoding failed, trying proxy...', e);
    }

    // 2. Try Proxy
    try {
        const targetUrl = new URL(NOMINATIM_BASE, window.location.origin);
        targetUrl.searchParams.append('q', city);
        targetUrl.searchParams.append('format', 'json');
        targetUrl.searchParams.append('limit', '1');

        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl.toString())}`;
        const geoRes = await fetchWithRetry(proxyUrl);

        if (geoRes.data && geoRes.data.length > 0) {
            return {
                lat: parseFloat(geoRes.data[0].lat),
                lon: parseFloat(geoRes.data[0].lon)
            };
        }
    } catch (e) {
        console.error('Proxy geocoding failed', e);
    }

    return null;
}
