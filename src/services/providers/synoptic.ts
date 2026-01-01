
import axios from 'axios';
import type { DataSource, DataSourceCapabilities, UnifiedTimeSeries, Station, DataType } from '../../types';

export const SYNOPTIC_CAPABILITIES: DataSourceCapabilities = {
    id: 'synoptic',
    name: 'Synoptic Data',
    description: 'MesoWest and Synoptic Labs weather station data',
    requiresApiKey: true,
    supportsStationSearch: true,
    supportsSpatialSearch: true,
    supportsGridInterpolation: false,
};

export class SynopticService implements DataSource {
    static readonly ID = SYNOPTIC_CAPABILITIES.id;
    static readonly NAME = SYNOPTIC_CAPABILITIES.name;

    readonly id = SynopticService.ID;
    readonly name = SynopticService.NAME;
    readonly capabilities = SYNOPTIC_CAPABILITIES;

    private token: string;

    constructor(options: { token?: string }) {
        this.token = options.token || '';
    }

    async findStations(query: string): Promise<Station[]> {
        if (query.length < 3) return [];

        const url = `https://api.synopticdata.com/v2/stations/metadata?token=${this.token}&stid=${query}`;
        try {
            const res = await axios.get(url);
            if (res.data?.STATION) {
                return res.data.STATION.map((s: any) => this.mapStation(s));
            }
        } catch (e) {
            // ignore
        }
        return [];
    }

    async findStationsByCity(city: string): Promise<Station[]> {
        const coords = await import('../geocoding').then(m => m.geocodeCity(city));
        if (!coords) return [];
        return this.findStationsByCoords(coords.lat, coords.lon);
    }

    async findStationsByCoords(lat: number, lon: number, radiusKm: number = 25): Promise<Station[]> {
        const miles = radiusKm * 0.621371;
        const url = `https://api.synopticdata.com/v2/stations/metadata?token=${this.token}&radius=${lat},${lon},${miles}&limit=100`;

        try {
            const res = await axios.get(url);
            if (res.data?.STATION) {
                return res.data.STATION.map((s: any) => this.mapStation(s));
            }
            return [];
        } catch (e) {
            console.error("Synoptic Search Error", e);
            return [];
        }
    }

    private mapStation(s: any): Station {
        return {
            id: s.STID,
            name: s.NAME,
            latitude: parseFloat(s.LATITUDE),
            longitude: parseFloat(s.LONGITUDE),
            elevation: parseFloat(s.ELEVATION),
            timezone: s.TIMEZONE,
            source: 'SYNOPTIC',
            metadata: {
                mnet_id: s.MNET_ID,
                state: s.STATE,
                status: s.STATUS
            }
        };
    }

    async getAvailableDataTypes(stationId: string): Promise<DataType[]> {
        const url = `https://api.synopticdata.com/v2/stations/metadata?token=${this.token}&stid=${stationId}&complete=1`;
        try {
            const res = await axios.get(url);
            const st = res.data?.STATION?.[0];
            if (st && st.SENSOR_VARIABLES) {
                const types: DataType[] = [];
                Object.keys(st.SENSOR_VARIABLES).forEach(key => {
                    const sensorSet = st.SENSOR_VARIABLES[key];
                    Object.keys(sensorSet).forEach(setKey => {
                        types.push({
                            id: setKey,
                            name: key.replace(/_/g, ' '),
                            datacoverage: 1,
                            mindate: st.PERIOD_OF_RECORD?.start,
                            maxdate: st.PERIOD_OF_RECORD?.end
                        });
                    });
                });
                return types;
            }
        } catch (e) {
            // fallback
        }
        return [];
    }

    async fetchData(options: any): Promise<UnifiedTimeSeries[]> {
        const { stationIds, startDate, endDate, datatypes } = options;
        const stid = stationIds.join(',');

        const start = startDate.replace(/-/g, '') + '0000';
        const end = endDate.replace(/-/g, '') + '2359';

        const vars = datatypes && datatypes.length > 0 ? datatypes.join(',') : 'precip_accum,air_temp';

        const url = `https://api.synopticdata.com/v2/stations/timeseries?token=${this.token}&stid=${stid}&start=${start}&end=${end}&vars=${vars}`;

        try {
            const res = await axios.get(url);
            const results: UnifiedTimeSeries[] = [];

            if (res.data?.STATION) {
                res.data.STATION.forEach((st: any) => {
                    const observations = st.OBSERVATIONS;
                    if (!observations) return;

                    const times = observations.date_time;
                    if (!times) return;

                    Object.keys(observations).forEach(key => {
                        if (key === 'date_time') return;

                        const values = observations[key];
                        if (!values) return;

                        times.forEach((t: string, idx: number) => {
                            const val = values[idx];
                            if (val !== null && val !== undefined) {
                                results.push({
                                    timestamp: t,
                                    value: typeof val === 'number' ? val : parseFloat(val),
                                    interval: 0,
                                    source: 'SYNOPTIC',
                                    stationId: st.STID,
                                    parameter: key,
                                    qualityFlag: ''
                                });
                            }
                        });
                    });
                });
            }
            return results;
        } catch (e) {
            console.error("Synoptic Fetch Failed", e);
            throw e;
        }
    }
}
