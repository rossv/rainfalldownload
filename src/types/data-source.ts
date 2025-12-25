import type { DataType, FetchDataParams, RainfallData, Station } from './index';

export interface DataSourceCapabilities {
    id: string;
    name: string;
    supportsStationSearch: boolean;
    supportsGridInterpolation: boolean;
    requiresApiKey: boolean;
    description?: string;
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

export interface DataSource {
    readonly id: string;
    readonly name: string;
    readonly capabilities: DataSourceCapabilities;

    findStationsByCity(city: string, limit?: number, buffer?: number): Promise<Station[]>;
    findStationsByCoords(lat: number, lon: number, limit?: number, buffer?: number): Promise<Station[]>;
    getAvailableDataTypes(stationId: string): Promise<DataType[]>;
    fetchData(params: FetchDataParams): Promise<RainfallData[]>;
}
