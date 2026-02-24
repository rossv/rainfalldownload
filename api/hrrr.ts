import { DEFAULT_HRRR_PARAMETER, HRRR_PARAMETER_OPTIONS } from '../src/services/providers/hrrr-params';

type HrrrSeriesPoint = {
    timestamp: string;
    value: number;
    interval: number;
    parameter: string;
};

type HrrrResponse = {
    stationId: string;
    series: HrrrSeriesPoint[];
};

const DEFAULT_USER_AGENT = 'rainfall-downloader/2.0 (hrrr-proxy)';
const DEFAULT_SERVICE_URL = 'http://127.0.0.1:8000/hrrr';
const FETCH_TIMEOUT_MS = 30000;

const parseNumberList = (value: string | undefined): number[] => {
    if (!value) return [];
    return value
        .split(',')
        .map(item => Number(item.trim()))
        .filter(num => Number.isFinite(num));
};

const parseStringList = (value: string | undefined): string[] => {
    if (!value) return [];
    return value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
};

const getQueryValue = (req: any, key: string) => {
    if (req?.query?.[key]) return req.query[key];
    if (req?.url) {
        const url = new URL(req.url, 'http://localhost');
        return url.searchParams.get(key) ?? undefined;
    }
    return undefined;
};

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

const fetchWithTimeout = async (url: string, init: RequestInit) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
};

const toQueryString = (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
            search.set(key, String(value));
        }
    });
    return search.toString();
};

export default async function handler(req: any, res?: any) {
    const method = req?.method ?? 'GET';
    if (method !== 'GET') {
        return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const lat = Number(getQueryValue(req, 'lat'));
    const lon = Number(getQueryValue(req, 'lon'));
    const start = getQueryValue(req, 'start');
    const end = getQueryValue(req, 'end');
    const parametersRaw = getQueryValue(req, 'parameters');
    const productType = getQueryValue(req, 'productType') ?? 'forecast';
    const aggregationWindow = getQueryValue(req, 'aggregationWindow') ?? 'hourly';
    const leadHours = parseNumberList(getQueryValue(req, 'leadHours'));

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return sendJson(res, 400, { error: 'lat and lon are required query parameters.' });
    }

    const startDate = start ? new Date(start) : undefined;
    const endDate = end ? new Date(end) : undefined;

    if (startDate && Number.isNaN(startDate.getTime())) {
        return sendJson(res, 400, { error: 'Invalid start date.' });
    }
    if (endDate && Number.isNaN(endDate.getTime())) {
        return sendJson(res, 400, { error: 'Invalid end date.' });
    }
    if (startDate && endDate && endDate < startDate) {
        return sendJson(res, 400, { error: 'End date must be after start date.' });
    }

    const parameterOptions = new Map(HRRR_PARAMETER_OPTIONS.map(option => [option.id, option]));
    const requestedParameters = parseStringList(parametersRaw);
    const parameters = (requestedParameters.length > 0 ? requestedParameters : [DEFAULT_HRRR_PARAMETER])
        .filter(param => parameterOptions.has(param));

    if (parameters.length === 0) {
        return sendJson(res, 400, { error: 'No supported parameters requested.' });
    }

    const userAgent = process.env.HRRR_USER_AGENT ?? DEFAULT_USER_AGENT;
    const serviceUrl = process.env.HRRR_SERVICE_URL ?? DEFAULT_SERVICE_URL;
    const requestQuery = toQueryString({
        lat,
        lon,
        start,
        end,
        parameters: parameters.join(','),
        productType,
        aggregationWindow,
        leadHours: leadHours.length > 0 ? leadHours.join(',') : undefined
    });

    let serviceResponse: Response;
    try {
        serviceResponse = await fetchWithTimeout(`${serviceUrl}?${requestQuery}`, {
            headers: {
                'Accept': 'application/json',
                'X-HRRR-User-Agent': userAgent
            }
        });
    } catch {
        return sendJson(res, 502, { error: 'Failed to reach HRRR backend service.' });
    }

    let payload: unknown;
    try {
        payload = await serviceResponse.json();
    } catch {
        return sendJson(res, 502, { error: 'HRRR backend service returned an invalid JSON payload.' });
    }

    if (!serviceResponse.ok) {
        const serviceError = payload && typeof payload === 'object'
            ? ((payload as { error?: string; detail?: string }).error ?? (payload as { detail?: string }).detail)
            : undefined;
        return sendJson(res, serviceResponse.status, {
            error: serviceError ?? 'HRRR backend service request failed.'
        });
    }

    const typedPayload = payload as Partial<HrrrResponse>;
    if (!typedPayload.stationId || !Array.isArray(typedPayload.series)) {
        return sendJson(res, 502, { error: 'HRRR backend service payload is missing stationId or series.' });
    }

    return sendJson(res, 200, typedPayload as HrrrResponse);
}
