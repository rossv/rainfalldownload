import type { DataQueryOptions, DataSource, DataSourceCapabilities, FetchDataParams, Station, DataType } from '../../types';

const TEMPLATE_CAPABILITIES: DataSourceCapabilities = {
    id: 'provider-id',
    name: 'Provider Name',
    supportsStationSearch: true,
    supportsSpatialSearch: false,
    supportsGridInterpolation: false,
    requiresApiKey: false,
    description: 'Short description of the upstream API or dataset'
};

/**
 * Skeleton provider for quickly adding new data sources (e.g., GPM, Open-Meteo, Meteostat).
 * Implement each method with provider-specific API calls while honoring the shared return types.
 */
export class TemplateProvider implements DataSource {
    readonly id = TEMPLATE_CAPABILITIES.id;
    readonly name = TEMPLATE_CAPABILITIES.name;
    readonly capabilities = TEMPLATE_CAPABILITIES;

    async findStationsByCity(_city: string, _limit = 20, _buffer = 0.25, _options?: DataQueryOptions): Promise<Station[]> {
        throw new Error('Station search not yet implemented for this provider');
    }

    async findStationsByCoords(_lat: number, _lon: number, _limit = 20, _buffer = 0.25, _options?: DataQueryOptions): Promise<Station[]> {
        throw new Error('Station search not yet implemented for this provider');
    }

    async getAvailableDataTypes(_stationId: string, _options?: DataQueryOptions): Promise<DataType[]> {
        throw new Error('Availability lookup not yet implemented for this provider');
    }

    async fetchData(_params: FetchDataParams & DataQueryOptions): Promise<import('../../types').UnifiedTimeSeries[]> {
        throw new Error('Data fetch not yet implemented for this provider');
    }
}
