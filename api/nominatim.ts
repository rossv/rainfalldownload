const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_USER_AGENT = 'rainfall-downloader/2.0 (nominatim-proxy)';
const FETCH_TIMEOUT_MS = 10000;

const sendJson = (res: any, status: number, payload: unknown) => {
    if (res) {
        res.status(status).json(payload);
        return;
    }

    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
};

const fetchWithTimeout = async (url: URL, init: RequestInit) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
};

export default async function handler(req: any, res?: any) {
    const method = req?.method ?? 'GET';
    if (method !== 'GET') {
        return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const requestUrl = new URL(req?.url ?? 'http://localhost', 'http://localhost');
    const targetUrl = new URL(NOMINATIM_SEARCH_URL);

    requestUrl.searchParams.forEach((value, key) => {
        if (value.trim() !== '') {
            targetUrl.searchParams.append(key, value);
        }
    });

    if (!targetUrl.searchParams.has('format')) {
        targetUrl.searchParams.set('format', 'json');
    }

    let upstream: Response;
    try {
        upstream = await fetchWithTimeout(targetUrl, {
            headers: {
                'Accept': 'application/json',
                'Accept-Language': req?.headers?.['accept-language'] ?? 'en-US,en;q=0.9',
                'User-Agent': process.env.NOMINATIM_USER_AGENT ?? DEFAULT_USER_AGENT
            }
        });
    } catch {
        return sendJson(res, 502, { error: 'Failed to reach Nominatim.' });
    }

    const body = await upstream.text();
    const contentType = upstream.headers.get('content-type') ?? 'application/json; charset=utf-8';

    if (res) {
        res.status(upstream.status);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.send(body);
        return;
    }

    return new Response(body, {
        status: upstream.status,
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=300'
        }
    });
}
