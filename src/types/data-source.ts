import type { DataType, FetchDataParams, RainfallData, Station } from './index';

export interface DataSourceCapabilities {
    id: string;
    name: string;
    supportsStationSearch: boolean;
    supportsGridInterpolation: boolean;
    requiresApiKey: boolean;
    description?: string;
}

export interface DataSourceOptions {
    apiKey?: string;
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
