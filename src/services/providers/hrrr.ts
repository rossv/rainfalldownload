import type { DataQueryOptions, DataSource, DataSourceCapabilities, DataType, FetchDataParams, Station, UnifiedTimeSeries } from '../../types';

export const HRRR_CAPABILITIES: DataSourceCapabilities = {
    id: 'hrrr',
    name: 'NOAA HRRR',
    description: 'High-Resolution Rapid Refresh gridded analysis/forecast data',
    requiresApiKey: false,
    supportsStationSearch: false,
    supportsSpatialSearch: true,
    supportsGridInterpolation: true,
    maxDateRangeDays: 7,
};

export class HrrrService implements DataSource {
    static readonly ID = HRRR_CAPABILITIES.id;
    static readonly NAME = HRRR_CAPABILITIES.name;

    readonly id = HrrrService.ID;
    readonly name = HrrrService.NAME;
    readonly capabilities = HRRR_CAPABILITIES;

    async findStationsByCity(_city: string, _limit = 20, _buffer = 0.25, _options?: DataQueryOptions): Promise<Station[]> {
        return [];
    }

    async findStationsByCoords(_lat: number, _lon: number, _limit = 20, _buffer = 0.25, _options?: DataQueryOptions): Promise<Station[]> {
        return [];
    }

    async getAvailableDataTypes(_stationId: string, _options?: DataQueryOptions): Promise<DataType[]> {
        return [];
    }

    async fetchData(_params: FetchDataParams & DataQueryOptions): Promise<UnifiedTimeSeries[]> {
        return [];
    }
}
