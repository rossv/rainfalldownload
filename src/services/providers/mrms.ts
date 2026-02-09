
import type { DataSource, DataSourceCapabilities, UnifiedTimeSeries, Station, DataType } from '../../types';

export const MRMS_CAPABILITIES: DataSourceCapabilities = {
    id: 'noaa_mrms',
    name: 'NOAA MRMS',
    description: 'Multi-Radar/Multi-Sensor System (Coming Soon)',
    requiresApiKey: false,
    supportsStationSearch: false,
    supportsSpatialSearch: true,
    supportsGridInterpolation: true,
    maxDateRangeDays: 7,
};

export class MrmsService implements DataSource {
    static readonly ID = MRMS_CAPABILITIES.id;
    static readonly NAME = MRMS_CAPABILITIES.name;

    readonly id = MrmsService.ID;
    readonly name = MrmsService.NAME;
    readonly capabilities = MRMS_CAPABILITIES;

    constructor() {
    }

    async findStations(_query: string): Promise<Station[]> {
        return [];
    }

    async findStationsByCity(_city: string): Promise<Station[]> {
        return [];
    }

    async findStationsByCoords(_lat: number, _lon: number): Promise<Station[]> {
        // Grid-based, so no "stations". Returns virtual stations or grid centers?
        return [];
    }

    async getAvailableDataTypes(_stationId: string): Promise<DataType[]> {
        return [
            { id: 'PrecipRate', name: 'Precipitation Rate', datacoverage: 1, mindate: '2020-01-01', maxdate: new Date().toISOString() }
        ];
    }

    async fetchData(_options: any): Promise<UnifiedTimeSeries[]> {
        // Not implemented (Requires GRIB2 decoding)
        console.warn("MRMS Fetching not implemented yet");
        return [];
    }
}
