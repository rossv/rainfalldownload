import type { DataSource, DataSourceCapabilities, UnifiedTimeSeries, Station, DataType, HrrrQueryOptions } from '../../types';

export interface HrrrParameterOption {
    id: string;
    name: string;
    units: string;
    unifiedParameter: string;
}

export const HRRR_PARAMETER_OPTIONS: HrrrParameterOption[] = [
    {
        id: 'APCP_ACCUM',
        name: 'Accumulated Precipitation',
        units: 'mm',
        unifiedParameter: 'PRCP'
    },
    {
        id: 'SNOW_ACCUM',
        name: 'Accumulated Snowfall',
        units: 'mm',
        unifiedParameter: 'SNOW'
    },
    {
        id: 'REFC',
        name: 'Composite Reflectivity',
        units: 'dBZ',
        unifiedParameter: 'REFC'
    },
    {
        id: 'TCDC',
        name: 'Total Cloud Cover',
        units: '%',
        unifiedParameter: 'TCDC'
    }
];

const HRRR_PARAMETER_MAP = new Map(HRRR_PARAMETER_OPTIONS.map(option => [option.id, option.unifiedParameter]));

export const DEFAULT_HRRR_OPTIONS: HrrrQueryOptions = {
    productType: 'analysis',
    forecastHour: 0,
    aggregationWindowHours: 1
};

export const HRRR_CAPABILITIES: DataSourceCapabilities = {
    id: 'hrrr',
    name: 'NOAA HRRR',
    description: 'High-Resolution Rapid Refresh (HRRR) grid products',
    requiresApiKey: false,
    supportsStationSearch: true,
    supportsSpatialSearch: true,
    supportsGridInterpolation: true,
    maxDateRangeDays: 2
};

export const mapHrrrParameterToUnified = (parameterId: string) => {
    return HRRR_PARAMETER_MAP.get(parameterId) ?? parameterId;
};

const buildVirtualStation = (lat: number, lon: number, label: string): Station => {
    const roundedLat = Number(lat.toFixed(4));
    const roundedLon = Number(lon.toFixed(4));
    return {
        id: `hrrr_${roundedLat}_${roundedLon}`,
        name: `${label} (${roundedLat}, ${roundedLon})`,
        latitude: roundedLat,
        longitude: roundedLon,
        source: 'NOAA_HRRR',
        metadata: {
            provider: 'HRRR'
        }
    };
};

const normalizeHrrrDatatypes = (datatypes?: string[]) => {
    if (!datatypes || datatypes.length === 0) return [HRRR_PARAMETER_OPTIONS[0].id];
    const allowed = new Set(HRRR_PARAMETER_OPTIONS.map(option => option.id));
    const filtered = datatypes.filter(type => allowed.has(type));
    return filtered.length > 0 ? Array.from(new Set(filtered)) : [HRRR_PARAMETER_OPTIONS[0].id];
};

export class HrrrService implements DataSource {
    static readonly ID = HRRR_CAPABILITIES.id;
    static readonly NAME = HRRR_CAPABILITIES.name;

    readonly id = HrrrService.ID;
    readonly name = HrrrService.NAME;
    readonly capabilities = HRRR_CAPABILITIES;

    async findStationsByCity(city: string): Promise<Station[]> {
        const coords = await import('../geocoding').then(m => m.geocodeCity(city));
        if (!coords) return [];
        return [buildVirtualStation(coords.lat, coords.lon, `HRRR Grid near ${city}`)];
    }

    async findStationsByCoords(lat: number, lon: number): Promise<Station[]> {
        return [buildVirtualStation(lat, lon, 'HRRR Grid Point')];
    }

    async getAvailableDataTypes(_stationId: string): Promise<DataType[]> {
        const maxDate = new Date();
        const minDate = new Date();
        minDate.setDate(maxDate.getDate() - (HRRR_CAPABILITIES.maxDateRangeDays ?? 2));

        return HRRR_PARAMETER_OPTIONS.map(option => ({
            id: option.id,
            name: option.name,
            units: option.units,
            datacoverage: 1,
            mindate: minDate.toISOString(),
            maxdate: maxDate.toISOString()
        }));
    }

    async fetchData(options: any): Promise<UnifiedTimeSeries[]> {
        const hrrrOptions: HrrrQueryOptions = options.hrrrOptions ?? DEFAULT_HRRR_OPTIONS;
        const selectedTypes = normalizeHrrrDatatypes(options.datatypes);
        const unifiedParameters = selectedTypes.map(mapHrrrParameterToUnified);

        console.info('[HRRR] Fetching grid data (not yet implemented)', {
            stationIds: options.stationIds,
            startDate: options.startDate,
            endDate: options.endDate,
            selectedTypes,
            unifiedParameters,
            hrrrOptions
        });

        return [];
    }
}
