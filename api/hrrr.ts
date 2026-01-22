const DEFAULT_HRRR_NCSS_URL =
  'https://thredds.ucar.edu/thredds/ncss/grib/NCEP/HRRR/CONUS_2p5km/Best';

type HrrrQuery = {
  lat: number;
  lon: number;
  start: string;
  end: string;
  parameters: string[];
};

type HrrrSeriesPoint = {
  timestamp: string;
  value: number;
  qualityFlag?: string;
};

type HrrrSeries = {
  parameter: string;
  intervalMinutes: number;
  units?: string;
  values: HrrrSeriesPoint[];
};

type HrrrResponse = {
  query: HrrrQuery;
  series: HrrrSeries[];
};

const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.HRRR_CORS_ORIGIN ?? '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function parseParameters(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(value => String(value).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
  }
  return [];
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseIntervalMinutes(values: HrrrSeriesPoint[]): number {
  if (values.length < 2) return 60;
  const first = Date.parse(values[0].timestamp);
  const second = Date.parse(values[1].timestamp);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return 60;
  const minutes = Math.round((second - first) / 60000);
  return minutes > 0 ? minutes : 60;
}

function parseCsvSeries(csv: string, parameters: string[]): HrrrSeries[] {
  const lines = csv
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));

  if (lines.length === 0) return [];
  const header = lines.shift()?.split(',').map(col => col.trim()) ?? [];
  const timeIndex = header.findIndex(col => col.startsWith('time'));

  const parameterIndexes = parameters.reduce<Record<string, { index: number; units?: string }>>((acc, param) => {
    const index = header.findIndex(col => col.startsWith(param));
    if (index >= 0) {
      const unitsMatch = header[index].match(/\[(.+)\]$/);
      acc[param] = { index, units: unitsMatch?.[1] };
    }
    return acc;
  }, {});

  const seriesMap = parameters.reduce<Record<string, HrrrSeries>>((acc, param) => {
    acc[param] = {
      parameter: param,
      intervalMinutes: 60,
      units: parameterIndexes[param]?.units,
      values: []
    };
    return acc;
  }, {});

  for (const line of lines) {
    const columns = line.split(',').map(col => col.trim());
    const timestamp = timeIndex >= 0 ? columns[timeIndex] : undefined;
    if (!timestamp) continue;
    for (const param of parameters) {
      const index = parameterIndexes[param]?.index ?? -1;
      if (index < 0) continue;
      const value = toNumber(columns[index]);
      if (value === null) continue;
      seriesMap[param].values.push({ timestamp, value });
    }
  }

  return Object.values(seriesMap).map(series => ({
    ...series,
    intervalMinutes: parseIntervalMinutes(series.values)
  }));
}

async function parseRequest(req: Request): Promise<HrrrQuery> {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const lat = toNumber(url.searchParams.get('lat'));
    const lon = toNumber(url.searchParams.get('lon'));
    const start = url.searchParams.get('start') ?? '';
    const end = url.searchParams.get('end') ?? '';
    const parameters = parseParameters(url.searchParams.getAll('params').length > 0
      ? url.searchParams.getAll('params')
      : url.searchParams.get('params') ?? url.searchParams.get('parameters'));

    if (lat === null || lon === null || !start || !end || parameters.length === 0) {
      throw new Error('Missing required query parameters.');
    }
    return { lat, lon, start, end, parameters };
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const lat = toNumber(body.lat);
  const lon = toNumber(body.lon);
  const start = typeof body.start === 'string' ? body.start : '';
  const end = typeof body.end === 'string' ? body.end : '';
  const parameters = parseParameters(body.parameters ?? body.params);

  if (lat === null || lon === null || !start || !end || parameters.length === 0) {
    throw new Error('Missing required JSON body parameters.');
  }
  return { lat, lon, start, end, parameters };
}

async function fetchHrrrSeries(query: HrrrQuery): Promise<HrrrSeries[]> {
  const baseUrl = process.env.HRRR_NCSS_BASE_URL ?? DEFAULT_HRRR_NCSS_URL;
  const url = new URL(baseUrl);
  url.searchParams.set('latitude', query.lat.toString());
  url.searchParams.set('longitude', query.lon.toString());
  url.searchParams.set('time_start', query.start);
  url.searchParams.set('time_end', query.end);
  url.searchParams.set('accept', 'csv');
  query.parameters.forEach(param => url.searchParams.append('var', param));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`HRRR upstream error: ${response.status} ${response.statusText}`);
  }
  const csv = await response.text();
  return parseCsvSeries(csv, query.parameters);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const query = await parseRequest(req);
    const series = await fetchHrrrSeries(query);
    const payload: HrrrResponse = { query, series };
    return Response.json(payload, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 400, headers: corsHeaders });
  }
}
