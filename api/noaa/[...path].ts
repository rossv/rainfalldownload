const NOAA_BASE_URL = 'https://www.ncdc.noaa.gov/cdo-web/api/v2';
const FETCH_TIMEOUT_MS = 20000;

const getPathSegments = (req: any): string[] => {
    const rawPath = req?.query?.path;
    if (Array.isArray(rawPath)) {
        return rawPath.filter(Boolean);
    }
    if (typeof rawPath === 'string' && rawPath.trim()) {
        return rawPath.split('/').filter(Boolean);
    }

    if (req?.url) {
        const url = new URL(req.url, 'http://localhost');
        const [, , , ...segments] = url.pathname.split('/');
        return segments.filter(Boolean);
    }

    return [];
};

const buildTargetUrl = (req: any, pathSegments: string[]) => {
    const safePath = pathSegments.map(segment => encodeURIComponent(segment)).join('/');
    const targetUrl = new URL(`${NOAA_BASE_URL}/${safePath}`);

    const queryEntries = req?.query && typeof req.query === 'object'
        ? Object.entries(req.query)
        : Array.from(new URL(req?.url ?? '/', 'http://localhost').searchParams.entries());

    queryEntries.forEach(([key, value]) => {
        if (key === 'path') return;

        if (Array.isArray(value)) {
            value.forEach(item => {
                if (item !== undefined && item !== null && `${item}`.trim() !== '') {
                    targetUrl.searchParams.append(key, String(item));
                }
            });
            return;
        }

        if (value !== undefined && value !== null && `${value}`.trim() !== '') {
            targetUrl.searchParams.append(key, String(value));
        }
    });

    return targetUrl;
};

const sendResponse = async (res: any, upstream: Response) => {
    const body = await upstream.text();
    const contentType = upstream.headers.get('content-type') ?? 'application/json; charset=utf-8';

    if (res) {
        res.status(upstream.status);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-store');
        res.send(body);
        return;
    }

    return new Response(body, {
        status: upstream.status,
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'no-store'
        }
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
        if (res) {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const pathSegments = getPathSegments(req);
    if (pathSegments.length === 0) {
        if (res) {
            res.status(400).json({ error: 'NOAA endpoint path is required.' });
            return;
        }
        return new Response(JSON.stringify({ error: 'NOAA endpoint path is required.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const targetUrl = buildTargetUrl(req, pathSegments);
    const token = req?.headers?.token ?? req?.headers?.Token ?? req?.headers?.['x-noaa-token'];

    let upstream: Response;
    try {
        upstream = await fetchWithTimeout(targetUrl, {
            headers: {
                'Accept': 'application/json',
                ...(token ? { token: String(token) } : {})
            }
        });
    } catch {
        if (res) {
            res.status(502).json({ error: 'Failed to reach NOAA.' });
            return;
        }
        return new Response(JSON.stringify({ error: 'Failed to reach NOAA.' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    return sendResponse(res, upstream);
}
