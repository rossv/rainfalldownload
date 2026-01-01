import { saveAs } from 'file-saver';
import type { UnifiedTimeSeries, Station } from '../types';

// Helper to format date nicely: YYYY-MM-DD HH:mm:ss
function formatDate(isoString: string): string {
    const d = new Date(isoString);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function downloadCSV(stations: Station[], data: UnifiedTimeSeries[], datatypes?: string[]) {
    // Note: datatypes arg is essentially parameters now
    const activeParameters = datatypes?.length
        ? datatypes
        : Array.from(new Set(data.map(d => d.parameter || 'PRCP')));

    const filteredData = datatypes?.length
        ? data.filter(d => activeParameters.includes(d.parameter || 'PRCP'))
        : data;

    if (filteredData.length === 0) return;

    if (stations.length > 1) {
        // Wide format: Timestamp, Station1, Station2, ...
        // Sort timestamps
        const allTimestamps = Array.from(new Set(filteredData.map(d => d.timestamp))).sort();

        // Map data: Timestamp -> (StationID|Parameter) -> Value
        const valueMap = new Map<string, Map<string, number>>();
        filteredData.forEach(d => {
            if (!valueMap.has(d.timestamp)) {
                valueMap.set(d.timestamp, new Map());
            }
            if (d.stationId) {
                const param = d.parameter || 'PRCP';
                const mapKey = `${d.stationId}|${param}`;
                valueMap.get(d.timestamp)!.set(mapKey, d.value);
            }
        });

        // Create headers for each station/parameter combination
        const stationHeaders = stations.flatMap(s => {
            const parts = s.id.split(':');
            const simpleId = parts.length > 1 ? parts[1] : s.id;
            return activeParameters.map(param => ({
                key: `${s.id}|${param}`,
                label: `${simpleId} (${param})`
            }));
        });
        // Using comma for standard CSV column separation
        const headers = ['Timestamp', ...stationHeaders.map(h => h.label)].join(',');

        const rows = allTimestamps.map(ts => {
            // Clean date format
            const rowValues = [formatDate(ts)];
            const dateValues = valueMap.get(ts);
            stationHeaders.forEach(h => {
                const val = dateValues?.get(h.key);
                rowValues.push(val !== undefined ? val.toString() : '');
            });
            return rowValues.join(',');
        });

        const content = [headers, ...rows].join('\n');
        // Add BOM for Excel compatibility
        const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });

        const filename = `Rainfall_Data_Multiple_Stations_${new Date().toISOString().split('T')[0]}.csv`;
        saveAs(blob, filename);
    } else {
        // Single station / List format
        // Format: StationID, StationName, Timestamp, Value, Parameter
        const headers = ['StationID', 'StationName', 'Timestamp', 'Value', 'Parameter'].join(',');
        const rows = filteredData.map(d => {
            const parts = d.stationId?.split(':') || ['', d.stationId || ''];
            const simpleId = parts.length > 1 ? parts[1] : d.stationId;
            const station = stations.find(s => s.id === d.stationId);
            return `${simpleId},"${station?.name || ''}",${formatDate(d.timestamp)},${d.value},${d.parameter || 'PRCP'}`;
        });

        const content = [headers, ...rows].join('\n');
        // Add BOM for Excel compatibility
        const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });

        // Single station filename generation
        let filename = `rainfall_export_${new Date().toISOString().split('T')[0]}.csv`;
        if (stations.length === 1) {
            const s = stations[0];
            const rawName = String(s.name || 'Station').trim();
            const safeName = rawName.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');

            filename = `${safeName}_${new Date().toISOString().split('T')[0]}.csv`;
        }

        saveAs(blob, filename);
    }
}

export function downloadSWMM(stations: Station[], data: UnifiedTimeSeries[], datatypes?: string[]) {
    // Mapping datatypes -> parameters
    const filteredData = datatypes?.length
        ? data.filter(d => datatypes.includes(d.parameter || 'PRCP'))
        : data;

    if (filteredData.length === 0) return;

    // Sort data: Station -> Timestamp
    const sortedData = [...filteredData].sort((a, b) => {
        const pA = a.parameter || 'PRCP';
        const pB = b.parameter || 'PRCP';
        const typeComp = pA.localeCompare(pB);
        if (typeComp !== 0) return typeComp;

        const sComp = (a.stationId || '').localeCompare(b.stationId || '');
        if (sComp !== 0) return sComp;
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    // Format: StationID Tab Year Month Day Hour Minute Tab Value
    const formattedRows = sortedData.map(d => {
        const param = d.parameter || 'PRCP';
        const date = new Date(d.timestamp);
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hour = date.getHours().toString().padStart(2, '0');
        const minute = date.getMinutes().toString().padStart(2, '0');

        const id = d.stationId?.replace('GHCND:', '') || 'UNKNOWN';

        return `${param}\t${id}\t${year} ${month} ${day} ${hour} ${minute}\t${d.value}`;
    });

    const content = formattedRows.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

    let filename = `swmm_rainfall.dat`;
    if (stations.length === 1) {
        const name = stations[0].name || 'STATION';
        const safeName = name.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
        filename = `${safeName}_SWMM.dat`;
    } else if (stations.length > 1) {
        filename = `Multiple_Stations_SWMM_${new Date().toISOString().split('T')[0]}.dat`;
    }

    saveAs(blob, filename);
}
