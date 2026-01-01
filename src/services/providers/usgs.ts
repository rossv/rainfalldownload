
import axios from 'axios';
import type { DataSource, DataSourceCapabilities, UnifiedTimeSeries, Station, DataType } from '../../types';

export const USGS_CAPABILITIES: DataSourceCapabilities = {
    id: 'usgs_nwis',
    name: 'USGS NWIS',
    description: 'Real-time and historical data from USGS National Water Information System',
    requiresApiKey: false,
    supportsStationSearch: true,
    supportsSpatialSearch: true,
    supportsGridInterpolation: false,
    maxDateRangeDays: 120, // IV data typical limit for high freq
};

export class NwisService implements DataSource {
    static readonly ID = USGS_CAPABILITIES.id;
    static readonly NAME = USGS_CAPABILITIES.name;

    readonly id = NwisService.ID;
    readonly name = NwisService.NAME;
    readonly capabilities = USGS_CAPABILITIES;

    constructor() {
    }

    async findStations(query: string): Promise<Station[]> {
        if (/^\d{8,15}$/.test(query.trim())) {
            return this.findStationsByStateOrId(query.trim());
        }
        return [];
    }

    async findStationsByCity(city: string): Promise<Station[]> {
        const coords = await import('../geocoding').then(m => m.geocodeCity(city));
        if (!coords) return [];
        return this.findStationsByCoords(coords.lat, coords.lon);
    }

    async findStationsByCoords(lat: number, lon: number, _radiusKm: number = 25): Promise<Station[]> {
        const buffer = 0.25;
        const bBox = `${(lon - buffer).toFixed(4)},${(lat - buffer).toFixed(4)},${(lon + buffer).toFixed(4)},${(lat + buffer).toFixed(4)}`;

        // We use JSON format (default 1.1)
        const jsonUrl = `https://waterservices.usgs.gov/nwis/site/?format=json&bBox=${bBox}&parameterCd=00045,00060,00065&hasDataTypeCd=iv&siteStatus=active`;

        try {
            const response = await axios.get(jsonUrl);

            if (!response.data || !response.data.value || !response.data.value.timeSeries) {
                return (response.data?.value?.timeSeries || []).map((ts: any) => this.mapEstToStation(ts.sourceInfo));
            }
            // If the primary path works (it should be response.data.value.timeSeries)
            return (response.data.value.timeSeries || []).map((ts: any) => this.mapEstToStation(ts.sourceInfo));
        } catch (e) {
            console.error("USGS Search failed", e);
            return [];
        }
    }

    private async findStationsByStateOrId(siteId: string): Promise<Station[]> {
        const url = `https://waterservices.usgs.gov/nwis/site/?format=json&sites=${siteId}&parameterCd=00045,00060,00065&siteStatus=all`;
        try {
            const response = await axios.get(url);
            const series = response.data?.value?.timeSeries || [];
            if (series.length > 0) {
                const unique = new Map<string, Station>();
                series.forEach((ts: any) => {
                    const st = this.mapEstToStation(ts.sourceInfo);
                    unique.set(st.id, st);
                });
                return Array.from(unique.values());
            }
            return [];
        } catch (e) {
            console.error(e);
            return [];
        }
    }

    private mapEstToStation(sourceInfo: any): Station {
        const loc = sourceInfo.geoLocation?.geogLocation || {};
        return {
            id: sourceInfo.siteCode?.[0]?.value || 'unknown',
            name: sourceInfo.siteName || 'Unknown USGS Site',
            latitude: loc.latitude || 0,
            longitude: loc.longitude || 0,
            elevation: sourceInfo.elevation?.value,
            timezone: sourceInfo.timeZoneInfo?.defaultTimeZone?.zoneAbbreviation,
            source: 'USGS_NWIS',
            metadata: {
                agency: sourceInfo.siteProperty?.find((p: any) => p.name === 'agencyCode')?.value,
            }
        };
    }

    async getAvailableDataTypes(_stationId: string): Promise<DataType[]> {
        // Mocking available types as checking catalog is expensive/complex in this pass
        return [
            { id: '00045', name: 'Precipitation', datacoverage: 1, mindate: '2000-01-01', maxdate: new Date().toISOString() },
            { id: '00060', name: 'Discharge', datacoverage: 1, mindate: '2000-01-01', maxdate: new Date().toISOString() }
        ];
    }

    async fetchData(options: any): Promise<UnifiedTimeSeries[]> {
        const siteList = options.stationIds.join(',');
        const start = options.startDate;
        const end = options.endDate;

        const pCodes = options.datatypes && options.datatypes.length > 0 ? options.datatypes.join(',') : '00045,00060';

        const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${siteList}&startDT=${start}&endDT=${end}&parameterCd=${pCodes}&siteStatus=all`;

        try {
            const response = await axios.get(url);
            const timeSeries = response.data?.value?.timeSeries || [];

            const results: UnifiedTimeSeries[] = [];

            timeSeries.forEach((ts: any) => {
                const sourceInfo = ts.sourceInfo;
                const variable = ts.variable;
                const values = ts.values?.[0]?.value || [];

                const siteId = sourceInfo.siteCode?.[0]?.value;
                const paramCode = variable.variableCode?.[0]?.value;
                // const _paramName = variable.variableName;
                const unit = variable.unit?.unitCode;

                values.forEach((v: any) => {
                    results.push({
                        timestamp: new Date(v.dateTime).toISOString(),
                        value: parseFloat(v.value),
                        interval: 15,
                        source: 'USGS_NWIS',
                        stationId: siteId,
                        parameter: paramCode,
                        qualityFlag: v.qualifiers?.[0],
                        originalUnits: unit
                    });
                });
            });

            return results;
        } catch (e) {
            console.error("USGS Fetch Data Failed", e);
            throw e;
        }
    }
}
