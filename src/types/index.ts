export type SourceType = 'NOAA_MRMS' | 'SYNOPTIC' | 'USGS_NWIS' | 'NOAA_CDO' | 'HRRR';

export interface Station {
    id: string;
    source: SourceType;
    name: string;
    latitude: number;
    longitude: number;
    isVirtual?: boolean;
    elevation?: number; // meters
    mindate?: string;
    maxdate?: string;
    datacoverage?: number;
    timezone?: string;
    metadata?: Record<string, any>; // Provider specific (e.g. state, county, networks)
}

export interface DataType {
    id: string;
    name: string;
    mindate: string;
    maxdate: string;
    datacoverage: number;
    units?: string;
}

export interface UnifiedTimeSeries {
    timestamp: string; // ISO 8601 UTC
    value: number; // Normalized value (e.g., mm)
    interval: number; // minutes (5, 15, 60, etc.)
    source: SourceType;
    stationId: string;
    parameter: string; // e.g. 'PRCP', 'flow', 'stage'
    qualityFlag?: string; // Provider specific flag
    originalValue?: number; // If we transformed it
    originalUnits?: string;
}

// Legacy alias to ease initial transition steps, but deprecated
export type RainfallData = UnifiedTimeSeries & {
    /** @deprecated use timestamp */
    date?: string;
    /** @deprecated use value */
    datatype?: string; // mapped to metadata or context
};

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
    datasetId?: string;
}

export * from './data-source';
