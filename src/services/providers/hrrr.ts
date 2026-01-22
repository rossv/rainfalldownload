import type { DataQueryOptions, DataSource, DataSourceCapabilities, FetchDataParams, UnifiedTimeSeries, Station, DataType } from '../../types';

export const HRRR_CAPABILITIES: DataSourceCapabilities = {
    id: 'noaa_hrrr',
    name: 'NOAA HRRR',
    description: 'High-Resolution Rapid Refresh (grid-based)',
    requiresApiKey: false,
    supportsStationSearch: false,
    supportsSpatialSearch: true,
    supportsGridInterpolation: true,
    maxDateRangeDays: 10
};

type HrrrSeriesPoint = {
    timestamp: string;
    value: number;
    qualityFlag?: string;
};

type HrrrSeries = {
    parameter: string;
    intervalMinutes?: number;
    units?: string;
    values: HrrrSeriesPoint[];
};

type HrrrApiResponse = {
    series: HrrrSeries[];
};

type HrrrFetchParams = FetchDataParams &
    DataQueryOptions & {
        lat?: number;
        lon?: number;
    };

function parseLatLon(stationId?: string): { lat: number; lon: number } | null {
    if (!stationId) return null;
    const delimiter = stationId.includes(',') ? ',' : stationId.includes(':') ? ':' : null;
    if (!delimiter) return null;
    const [latRaw, lonRaw] = stationId.split(delimiter).map(value => value.trim());
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
}

function resolveCoordinates(params: HrrrFetchParams): { lat: number; lon: number; stationId: string } {
    if (Number.isFinite(params.lat) && Number.isFinite(params.lon)) {
        const lat = params.lat as number;
        const lon = params.lon as number;
        return { lat, lon, stationId: params.stationIds?.[0] ?? `${lat},${lon}` };
    }

    const fromStation = parseLatLon(params.stationIds?.[0]);
    if (fromStation) {
        return { ...fromStation, stationId: params.stationIds?.[0] ?? `${fromStation.lat},${fromStation.lon}` };
    }

    throw new Error('HRRR requires lat/lon (pass lat/lon or stationIds[0] as "lat,lon").');
}

function deriveIntervalMinutes(series: HrrrSeries): number {
    if (series.intervalMinutes) return series.intervalMinutes;
    if (series.values.length < 2) return 60;
    const first = Date.parse(series.values[0].timestamp);
    const second = Date.parse(series.values[1].timestamp);
    if (!Number.isFinite(first) || !Number.isFinite(second)) return 60;
    const minutes = Math.round((second - first) / 60000);
    return minutes > 0 ? minutes : 60;
}

export class HrrrService implements DataSource {
    static readonly ID = HRRR_CAPABILITIES.id;
    static readonly NAME = HRRR_CAPABILITIES.name;

    readonly id = HrrrService.ID;
    readonly name = HrrrService.NAME;
    readonly capabilities = HRRR_CAPABILITIES;

    async findStationsByCity(_city: string): Promise<Station[]> {
        return [];
    }

    async findStationsByCoords(lat: number, lon: number): Promise<Station[]> {
        return [
            {
                id: `${lat},${lon}`,
                name: `HRRR Grid Point (${lat.toFixed(3)}, ${lon.toFixed(3)})`,
                latitude: lat,
                longitude: lon,
                source: 'NOAA_HRRR',
                metadata: {
                    type: 'grid'
                }
            }
        ];
    }

    async getAvailableDataTypes(_stationId: string): Promise<DataType[]> {
        return [
            {
                id: 'APCP_surface',
                name: 'Total Precipitation',
                datacoverage: 1,
                mindate: '2020-01-01',
                maxdate: new Date().toISOString(),
                units: 'kg/m^2'
            }
        ];
    }

    async fetchData(params: HrrrFetchParams): Promise<UnifiedTimeSeries[]> {
        const { lat, lon, stationId } = resolveCoordinates(params);
        const parameters = params.datatypes && params.datatypes.length > 0 ? params.datatypes : ['APCP_surface'];
        const query = new URLSearchParams({
            lat: lat.toString(),
            lon: lon.toString(),
            start: params.startDate,
            end: params.endDate,
            params: parameters.join(',')
        });

        const response = await fetch(`/api/hrrr?${query.toString()}`);
        if (!response.ok) {
            throw new Error(`HRRR proxy error: ${response.status} ${response.statusText}`);
        }

        const payload = (await response.json()) as HrrrApiResponse;
        const results: UnifiedTimeSeries[] = [];

        payload.series.forEach(series => {
            const interval = deriveIntervalMinutes(series);
            series.values.forEach(point => {
                if (point.value === null || point.value === undefined) return;
                results.push({
                    timestamp: point.timestamp,
                    value: Number(point.value),
                    interval,
                    source: 'NOAA_HRRR',
                    stationId,
                    parameter: series.parameter,
                    qualityFlag: point.qualityFlag,
                    originalUnits: series.units
                });
            });
        });

        return results;
    }
}
