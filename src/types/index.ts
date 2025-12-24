export interface Station {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    mindate?: string;
    maxdate?: string;
    datacoverage?: number;
}

export interface DataType {
    id: string;
    name: string;
    mindate: string;
    maxdate: string;
    datacoverage: number;
}

export interface RainfallData {
    date: string; // ISO 
    value: number; // value
    stationId?: string;
    datatype?: string;
}

export interface StationSearchParams {
    city: string;
    limit?: number;
    buffer?: number;
}

export interface FetchDataParams {
    stationIds: string[];
    startDate: string;
    endDate: string;
    units?: 'standard' | 'metric';
    datatypes?: string[];
}
