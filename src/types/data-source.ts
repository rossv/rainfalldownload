import type { DataType, FetchDataParams, UnifiedTimeSeries, Station } from './index';

export interface DataSourceCapabilities {
    id: string;
    name: string;
    supportsStationSearch: boolean;
    supportsSpatialSearch: boolean;
    supportsGridInterpolation: boolean;
    requiresApiKey: boolean;
    description?: string;
    maxDateRangeDays?: number;
}

export interface ProviderCredentials {
    /**
     * Primary token or API key used to authenticate with the provider.
     */
    token?: string;
    apiKey?: string;
    username?: string;
}

export interface DataSourceOptions {
    apiKey?: string;
    credentials?: ProviderCredentials;
}

export interface DataQueryOptions {
    datasetId?: string;
    datatypes?: string[];
}

export interface DataSource {
    readonly id: string;
    readonly name: string;
    readonly capabilities: DataSourceCapabilities;

    findStationsByCity(city: string, limit?: number, buffer?: number, options?: DataQueryOptions): Promise<Station[]>;
    findStationsByCoords(lat: number, lon: number, limit?: number, buffer?: number, options?: DataQueryOptions): Promise<Station[]>;
    getAvailableDataTypes(stationId: string, options?: DataQueryOptions): Promise<DataType[]>;
    fetchData(params: FetchDataParams & DataQueryOptions): Promise<UnifiedTimeSeries[]>;
}
