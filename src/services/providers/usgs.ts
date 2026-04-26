
import type { DataSource, DataSourceCapabilities, UnifiedTimeSeries, Station, DataType } from '../../types';
import { getJsonWithRetry } from '../http';

const USGS_DT_CACHE_PREFIX = 'usgs_dt_cache_v1_';
const USGS_DT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function getUsgsCache(key: string): DataType[] | null {
    try {
        const raw = localStorage.getItem(USGS_DT_CACHE_PREFIX + key);
        if (!raw) return null;
        const entry = JSON.parse(raw) as { value: DataType[]; timestamp: number };
        if (Date.now() - entry.timestamp > USGS_DT_CACHE_TTL_MS) {
            localStorage.removeItem(USGS_DT_CACHE_PREFIX + key);
            return null;
        }
        return entry.value;
    } catch {
        return null;
    }
}

function setUsgsCache(key: string, value: DataType[]) {
    try {
        localStorage.setItem(USGS_DT_CACHE_PREFIX + key, JSON.stringify({ value, timestamp: Date.now() }));
    } catch {
        // ignore quota errors
    }
}

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
        const results = await import('../geocoding').then(m => m.geocodeCity(city));
        if (results.length === 0) return [];
        return this.findStationsByCoords(results[0].lat, results[0].lon);
    }

    async findStationsByCoords(lat: number, lon: number, _radiusKm: number = 25): Promise<Station[]> {
        const buffer = 0.25;
        const bBox = `${(lon - buffer).toFixed(4)},${(lat - buffer).toFixed(4)},${(lon + buffer).toFixed(4)},${(lat + buffer).toFixed(4)}`;

        // We use JSON format (default 1.1)
        const jsonUrl = `https://waterservices.usgs.gov/nwis/site/?format=json&bBox=${bBox}&parameterCd=00045,00060,00065&hasDataTypeCd=iv&siteStatus=active`;

        const data = await getJsonWithRetry<any>(jsonUrl, { timeout: 15000 }, { retries: 2 });
        return (data?.value?.timeSeries || []).map((ts: any) => this.mapEstToStation(ts.sourceInfo));
    }

    private async findStationsByStateOrId(siteId: string): Promise<Station[]> {
        const url = `https://waterservices.usgs.gov/nwis/site/?format=json&sites=${siteId}&parameterCd=00045,00060,00065&siteStatus=all`;
        const data = await getJsonWithRetry<any>(url, { timeout: 15000 }, { retries: 2 });
        const series = data?.value?.timeSeries || [];
        if (series.length > 0) {
            const unique = new Map<string, Station>();
            series.forEach((ts: any) => {
                const st = this.mapEstToStation(ts.sourceInfo);
                unique.set(st.id, st);
            });
            return Array.from(unique.values());
        }
        return [];
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

    async getAvailableDataTypes(stationId: string): Promise<DataType[]> {
        const cached = getUsgsCache(stationId);
        if (cached) return cached;

        try {
            const url = `https://waterservices.usgs.gov/nwis/site/?format=json&sites=${stationId}&seriesCatalogOutput=true&siteStatus=all`;
            const data = await getJsonWithRetry<any>(url, { timeout: 15000 }, { retries: 2 });
            const timeSeries: any[] = data?.value?.timeSeries || [];

            const seen = new Map<string, DataType>();
            timeSeries.forEach((ts: any) => {
                const code = ts.variable?.variableCode?.[0]?.value as string | undefined;
                if (!code) return;

                const values = ts.values?.[0];
                const beginDT: string | undefined = values?.qualifier?.[0]?.startDate ?? ts.variable?.variableCode?.[0]?.network;
                // Try to get real dates from the series catalog
                const rawBegin: string | undefined = ts.values?.[0]?.value?.[0]?.dateTime;
                const rawEnd: string | undefined = (() => {
                    const arr: any[] = ts.values?.[0]?.value || [];
                    return arr.length > 0 ? arr[arr.length - 1]?.dateTime : undefined;
                })();

                const mindate = rawBegin
                    ? new Date(rawBegin).toISOString().split('T')[0]
                    : (beginDT ?? '2000-01-01');
                const maxdate = rawEnd
                    ? new Date(rawEnd).toISOString().split('T')[0]
                    : new Date().toISOString().split('T')[0];

                if (!seen.has(code)) {
                    seen.set(code, {
                        id: code,
                        name: ts.variable?.variableName ?? code,
                        datacoverage: 1,
                        mindate,
                        maxdate
                    });
                }
            });

            const result = Array.from(seen.values());
            // Fall back to defaults if catalog returned nothing useful
            const final = result.length > 0 ? result : [
                { id: '00045', name: 'Precipitation', datacoverage: 1, mindate: '2000-01-01', maxdate: new Date().toISOString().split('T')[0] },
                { id: '00060', name: 'Discharge', datacoverage: 1, mindate: '2000-01-01', maxdate: new Date().toISOString().split('T')[0] }
            ];
            setUsgsCache(stationId, final);
            return final;
        } catch {
            return [
                { id: '00045', name: 'Precipitation', datacoverage: 1, mindate: '2000-01-01', maxdate: new Date().toISOString().split('T')[0] },
                { id: '00060', name: 'Discharge', datacoverage: 1, mindate: '2000-01-01', maxdate: new Date().toISOString().split('T')[0] }
            ];
        }
    }

    async fetchData(options: any): Promise<UnifiedTimeSeries[]> {
        const siteList = options.stationIds.join(',');
        const start = options.startDate;
        const end = options.endDate;

        const pCodes = options.datatypes && options.datatypes.length > 0 ? options.datatypes.join(',') : '00045,00060';

        const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${siteList}&startDT=${start}&endDT=${end}&parameterCd=${pCodes}&siteStatus=all`;

        const data = await getJsonWithRetry<any>(url, { timeout: 20000 }, { retries: 2 });
        const timeSeries = data?.value?.timeSeries || [];

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
    }
}
