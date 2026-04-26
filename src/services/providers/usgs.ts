
import type { DataSource, DataSourceCapabilities, UnifiedTimeSeries, Station, DataType } from '../../types';
import { getJsonWithRetry } from '../http';

/**
 * Base URL for USGS WaterServices.
 * In dev mode, routes through Vite proxy to avoid CORS issues.
 * The proxy rewrites /api/usgs → waterservices.usgs.gov/nwis.
 * In production, this must be configured via VITE_USGS_PROXY_BASE
 * (e.g., a CORS proxy or serverless function).
 */
const BASE_USGS = import.meta.env.VITE_USGS_PROXY_BASE
    ?? (import.meta.env.DEV ? '/api/usgs' : 'https://waterservices.usgs.gov/nwis');

const USGS_DT_CACHE_PREFIX = 'usgs_dt_cache_v1_';
const USGS_DT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PARAMETER_CODES = '00045,00060,00065';

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

/** Check if a search query looks like a USGS site number (8-15 digits). */
export function isUsgsSiteId(query: string): boolean {
    return /^\d{8,15}$/.test(query.trim());
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
        if (isUsgsSiteId(query)) {
            return this.findStationsBySiteId(query.trim());
        }
        return [];
    }

    async findStationsByCity(city: string): Promise<Station[]> {
        // If the query looks like a USGS site number, do a direct lookup
        if (isUsgsSiteId(city)) {
            return this.findStationsBySiteId(city.trim());
        }
        const results = await import('../geocoding').then(m => m.geocodeCity(city));
        if (results.length === 0) return [];
        return this.findStationsByCoords(results[0].lat, results[0].lon);
    }

    async findStationsByCoords(lat: number, lon: number, _radiusKm: number = 25): Promise<Station[]> {
        const buffer = 0.25;
        const bBox = `${(lon - buffer).toFixed(4)},${(lat - buffer).toFixed(4)},${(lon + buffer).toFixed(4)},${(lat + buffer).toFixed(4)}`;

        const url = `${BASE_USGS}/iv/?format=json&bBox=${bBox}&parameterCd=${DEFAULT_PARAMETER_CODES}&siteStatus=active`;

        const data = await getJsonWithRetry<any>(url, { timeout: 15000 }, { retries: 2 });
        return this.extractStationsFromTimeSeries(data);
    }

    /**
     * Look up a single USGS site by its numeric site ID (e.g. 03049500).
     */
    async findStationsBySiteId(siteId: string): Promise<Station[]> {
        const url = `${BASE_USGS}/iv/?format=json&sites=${siteId}&parameterCd=${DEFAULT_PARAMETER_CODES}&siteStatus=all&period=P1D`;
        try {
            const data = await getJsonWithRetry<any>(url, { timeout: 15000 }, { retries: 2 });
            return this.extractStationsFromTimeSeries(data);
        } catch {
            // If IV endpoint fails (e.g. no instantaneous data), try the site endpoint
            return this.findStationsBySiteService(siteId);
        }
    }

    /**
     * Fallback: use the USGS site service which returns RDB format, parsed as text.
     */
    private async findStationsBySiteService(siteId: string): Promise<Station[]> {
        const url = `${BASE_USGS}/site/?format=rdb&sites=${siteId}&siteOutput=expanded&siteStatus=all`;
        try {
            const response = await getJsonWithRetry<any>(url, {
                timeout: 15000,
                responseType: 'text'
            }, { retries: 2 });

            // Parse RDB format (tab-delimited, comment lines start with #)
            const text = typeof response === 'string' ? response : String(response);
            return this.parseRdbSites(text);
        } catch {
            return [];
        }
    }

    /**
     * Parse USGS RDB format site data into Station objects.
     */
    private parseRdbSites(rdbText: string): Station[] {
        const lines = rdbText.split('\n').filter(line => !line.startsWith('#') && line.trim().length > 0);
        if (lines.length < 2) return [];

        const headers = lines[0].split('\t').map(h => h.trim());
        // Line 1 is format descriptors (e.g. "5s\t15s\t..."), skip it
        const dataLines = lines.slice(2);

        const getIdx = (name: string) => headers.indexOf(name);
        const siteNoIdx = getIdx('site_no');
        const stationNmIdx = getIdx('station_nm');
        const latIdx = getIdx('dec_lat_va');
        const lonIdx = getIdx('dec_long_va');
        const altIdx = getIdx('alt_va');

        if (siteNoIdx === -1) return [];

        const stations: Station[] = [];
        for (const line of dataLines) {
            const cols = line.split('\t');
            const siteNo = cols[siteNoIdx]?.trim();
            if (!siteNo) continue;

            const lat = latIdx >= 0 ? parseFloat(cols[latIdx]) : 0;
            const lon = lonIdx >= 0 ? parseFloat(cols[lonIdx]) : 0;
            const alt = altIdx >= 0 ? parseFloat(cols[altIdx]) : undefined;

            if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

            stations.push({
                id: siteNo,
                name: stationNmIdx >= 0 ? cols[stationNmIdx]?.trim() || `USGS ${siteNo}` : `USGS ${siteNo}`,
                latitude: lat,
                longitude: lon,
                elevation: Number.isFinite(alt) ? alt : undefined,
                source: 'USGS_NWIS',
                metadata: {}
            });
        }

        return stations;
    }

    /**
     * Extract unique stations from USGS WaterML 1.1 JSON timeSeries response.
     */
    private extractStationsFromTimeSeries(data: any): Station[] {
        const series = data?.value?.timeSeries || [];
        const unique = new Map<string, Station>();
        series.forEach((ts: any) => {
            const st = this.mapSourceInfoToStation(ts.sourceInfo);
            if (st.id !== 'unknown') {
                unique.set(st.id, st);
            }
        });
        return Array.from(unique.values());
    }

    private mapSourceInfoToStation(sourceInfo: any): Station {
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
            const url = `${BASE_USGS}/site/?format=json&sites=${stationId}&seriesCatalogOutput=true&siteStatus=all`;
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

        const url = `${BASE_USGS}/iv/?format=json&sites=${siteList}&startDT=${start}&endDT=${end}&parameterCd=${pCodes}&siteStatus=all`;

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
