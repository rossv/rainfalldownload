import { DEFAULT_HRRR_PARAMETER, HRRR_PARAMETER_OPTIONS, type HrrrParameterOption } from '../src/services/providers/hrrr-params';

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

const addDaysUtc = (date: Date, days: number) => {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
};

const parseDurationMinutes = (duration: string | undefined): number => {
    if (!duration) return 60;
    const match = duration.match(/P(?:\d+Y)?(?:\d+M)?(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
    if (!match) return 60;
    const hours = match[1] ? Number(match[1]) : 0;
    const minutes = match[2] ? Number(match[2]) : 0;
    const total = hours * 60 + minutes;
    return total > 0 ? total : 60;
};

const parseValidTime = (validTime: string) => {
    const [start, duration] = validTime.split('/');
    const timestamp = new Date(start);
    const interval = parseDurationMinutes(duration);
    return { timestamp, interval };
};

const buildStationId = (lat: number, lon: number) => {
    const roundedLat = lat.toFixed(4);
    const roundedLon = lon.toFixed(4);
    return `hrrr-${roundedLat}-${roundedLon}`;
};

const aggregateSeries = (
    series: Array<{ timestamp: Date; value: number; interval: number }>,
    option: HrrrParameterOption,
    windowHours: number
): HrrrSeriesPoint[] => {
    const windowMs = windowHours * 60 * 60 * 1000;
    const buckets = new Map<number, Array<{ timestamp: Date; value: number; interval: number }>>();

    series.forEach(point => {
        const bucketKey = Math.floor(point.timestamp.getTime() / windowMs);
        const existing = buckets.get(bucketKey) ?? [];
        existing.push(point);
        buckets.set(bucketKey, existing);
    });

    return Array.from(buckets.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([bucketKey, points]) => {
            const timestamp = new Date(bucketKey * windowMs);
            const values = points.map(p => p.value);
            const value = option.aggregation === 'sum'
                ? values.reduce((sum, v) => sum + v, 0)
                : values.reduce((sum, v) => sum + v, 0) / values.length;

            return {
                timestamp: timestamp.toISOString(),
                value,
                interval: windowHours * 60,
                parameter: option.unifiedParameter
            };
        });
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

    const userAgent = process.env.HRRR_USER_AGENT ?? DEFAULT_USER_AGENT;
    const parameterOptions = new Map(HRRR_PARAMETER_OPTIONS.map(option => [option.id, option]));
    const requestedParameters = parseStringList(parametersRaw);
    const parameters = (requestedParameters.length > 0 ? requestedParameters : [DEFAULT_HRRR_PARAMETER])
        .filter(param => parameterOptions.has(param));

    if (parameters.length === 0) {
        return sendJson(res, 400, { error: 'No supported parameters requested.' });
    }

    const pointResponse = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
        headers: { 'User-Agent': userAgent }
    });

    if (!pointResponse.ok) {
        return sendJson(res, pointResponse.status, { error: 'Failed to resolve grid point.' });
    }

    const pointData = await pointResponse.json();
    const gridId = pointData?.properties?.gridId;
    const gridX = pointData?.properties?.gridX;
    const gridY = pointData?.properties?.gridY;

    if (!gridId || gridX === undefined || gridY === undefined) {
        return sendJson(res, 500, { error: 'Grid metadata unavailable from NOAA.' });
    }

    const gridResponse = await fetch(`https://api.weather.gov/gridpoints/${gridId}/${gridX},${gridY}`, {
        headers: { 'User-Agent': userAgent }
    });

    if (!gridResponse.ok) {
        return sendJson(res, gridResponse.status, { error: 'Failed to fetch HRRR grid data.' });
    }

    const gridData = await gridResponse.json();
    const properties = gridData?.properties ?? {};
    const now = new Date();
    const windowHours = aggregationWindow === '6-hour' ? 6 : aggregationWindow === '3-hour' ? 3 : 1;

    const series = parameters.flatMap(parameterId => {
        const option = parameterOptions.get(parameterId);
        if (!option) return [];

        const values = properties?.[option.sourceField]?.values ?? [];
        const points = values
            .map((entry: { validTime: string; value: number | null }) => {
                if (entry.value === null || entry.value === undefined) return null;
                const { timestamp, interval } = parseValidTime(entry.validTime);
                return { timestamp, interval, value: entry.value };
            })
            .filter((entry: { timestamp: Date; interval: number; value: number } | null) => {
                if (!entry) return false;
                if (startDate && entry.timestamp < startDate) return false;
                if (endDate && entry.timestamp > addDaysUtc(endDate, 1)) return false;
                if (productType === 'analysis' && entry.timestamp > now) return false;
                if (productType === 'forecast' && entry.timestamp < now) return false;
                if (leadHours.length > 0) {
                    const lead = Math.round((entry.timestamp.getTime() - now.getTime()) / (60 * 60 * 1000));
                    if (!leadHours.includes(lead)) return false;
                }
                return true;
            }) as Array<{ timestamp: Date; interval: number; value: number }>;

        if (windowHours === 1) {
            return points.map(point => ({
                timestamp: point.timestamp.toISOString(),
                value: point.value,
                interval: point.interval,
                parameter: option.unifiedParameter
            }));
        }

        return aggregateSeries(points, option, windowHours);
    });

    const response: HrrrResponse = {
        stationId: buildStationId(lat, lon),
        series
    };

    return sendJson(res, 200, response);
}
