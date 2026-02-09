
import type { DataSource, DataSourceCapabilities, UnifiedTimeSeries, Station, DataType } from '../../types';
import { formatAxiosError, getJsonWithRetry } from '../http';

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
        if (!this.token) return [];

        try {
            const data = await getJsonWithRetry<any>('https://api.synopticdata.com/v2/stations/metadata', {
                params: { token: this.token, stid: query }
            });
            if (data?.STATION) {
                return data.STATION.map((s: any) => this.mapStation(s));
            }
        } catch (e) {
            console.warn(formatAxiosError(e, 'Synoptic station lookup failed'));
        }
        return [];
    }

    async findStationsByCity(city: string): Promise<Station[]> {
        const coords = await import('../geocoding').then(m => m.geocodeCity(city));
        if (!coords) return [];
        return this.findStationsByCoords(coords.lat, coords.lon);
    }

    async findStationsByCoords(lat: number, lon: number, radiusKm: number = 25): Promise<Station[]> {
        if (!this.token) return [];
        const miles = radiusKm * 0.621371;

        try {
            const data = await getJsonWithRetry<any>('https://api.synopticdata.com/v2/stations/metadata', {
                params: {
                    token: this.token,
                    radius: `${lat},${lon},${miles}`,
                    limit: 100
                }
            });
            if (data?.STATION) {
                return data.STATION.map((s: any) => this.mapStation(s));
            }
            return [];
        } catch (e) {
            console.warn(formatAxiosError(e, 'Synoptic search failed'));
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
        if (!this.token) return [];
        try {
            const data = await getJsonWithRetry<any>('https://api.synopticdata.com/v2/stations/metadata', {
                params: {
                    token: this.token,
                    stid: stationId,
                    complete: 1
                }
            });
            const st = data?.STATION?.[0];
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
            console.warn(formatAxiosError(e, 'Synoptic datatype lookup failed'));
        }
        return [];
    }

    async fetchData(options: any): Promise<UnifiedTimeSeries[]> {
        if (!this.token) {
            throw new Error('Synoptic API token is required.');
        }
        const { stationIds, startDate, endDate, datatypes } = options;
        const stid = stationIds.join(',');

        const start = startDate.replace(/-/g, '') + '0000';
        const end = endDate.replace(/-/g, '') + '2359';

        const vars = datatypes && datatypes.length > 0 ? datatypes.join(',') : 'precip_accum,air_temp';

        try {
            const data = await getJsonWithRetry<any>('https://api.synopticdata.com/v2/stations/timeseries', {
                params: {
                    token: this.token,
                    stid,
                    start,
                    end,
                    vars
                }
            }, { retries: 3 });
            const results: UnifiedTimeSeries[] = [];

            if (data?.STATION) {
                data.STATION.forEach((st: any) => {
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
            console.warn(formatAxiosError(e, 'Synoptic fetch failed'));
            throw new Error('Synoptic fetch failed. Please check your token and try again.');
        }
    }
}
