import { saveAs } from 'file-saver';
import type { RainfallData, Station } from '../types';

// Helper to format date nicely: YYYY-MM-DD HH:mm:ss
function formatDate(isoString: string): string {
    const d = new Date(isoString);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function downloadCSV(stations: Station[], data: RainfallData[]) {
    if (stations.length > 1) {
        // Wide format: Date, Station1, Station2, ...
        // Sort dates
        const allDates = Array.from(new Set(data.map(d => d.date))).sort();

        // Map data: Date -> StationID -> Value
        const valueMap = new Map<string, Map<string, number>>();
        data.forEach(d => {
            if (!valueMap.has(d.date)) {
                valueMap.set(d.date, new Map());
            }
            if (d.stationId) {
                valueMap.get(d.date)!.set(d.stationId, d.value);
            }
        });

        // Create headers
        const stationHeaders = stations.map(s => {
            const parts = s.id.split(':');
            return parts.length > 1 ? parts[1] : s.id;
        });
        // Using comma for standard CSV column separation
        const headers = ['Date', ...stationHeaders].join(',');

        const rows = allDates.map(date => {
            // Clean date format
            const rowValues = [formatDate(date)];
            const dateValues = valueMap.get(date);
            stations.forEach(s => {
                const val = dateValues?.get(s.id);
                // Handle 0 vs undefined/null carefully if needed, but here undefined means no data
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
        // Format: StationID, Date, Value, DataType
        // Using comma to be consistent with "CSV"
        const headers = ['StationID', 'StationName', 'Datetime', 'Value', 'DataType'].join(',');
        const rows = data.map(d => {
            const parts = d.stationId?.split(':') || ['', d.stationId || ''];
            const simpleId = parts.length > 1 ? parts[1] : d.stationId;
            const station = stations.find(s => s.id === d.stationId);
            return `${simpleId},"${station?.name || ''}",${formatDate(d.date)},${d.value},${d.datatype || 'PRCP'}`;
        });

        const content = [headers, ...rows].join('\n');
        // Add BOM for Excel compatibility
        const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' });

        // Single station filename generation
        let filename = `rainfall_export_${new Date().toISOString().split('T')[0]}.csv`;
        if (stations.length === 1) {
            const s = stations[0];
            // Ensure name is a string and trim it. Remove any weird control chars.
            const rawName = String(s.name || 'Station').trim();
            const safeName = rawName.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');

            filename = `${safeName}_${new Date().toISOString().split('T')[0]}.csv`;
        }

        saveAs(blob, filename);
    }
}

export function downloadSWMM(stations: Station[], data: RainfallData[]) {
    // Vertical stacking for all stations (User request: separate blocks for each station)
    // Format: StationID  Year  Month  Day  Hour  Minute  Value
    // Zero padded dates/times

    // Sort data: Station -> Date
    const sortedData = [...data].sort((a, b) => {
        const sComp = (a.stationId || '').localeCompare(b.stationId || '');
        if (sComp !== 0) return sComp;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
    });



    // User requested format example: RG1        1998 06 13 02 00             0.01
    // It looks like fixed width or tab separated. Standard SWMM usually handles whitespace.
    // Let's use tabs to be safe and clean, but space out the date parts as requested "1998 06 13 02 00".

    // Format: StationID Tab Year Month Day Hour Minute Tab Value
    const formattedRows = sortedData.map(d => {
        const date = new Date(d.date);
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hour = date.getHours().toString().padStart(2, '0');
        const minute = date.getMinutes().toString().padStart(2, '0');

        const id = d.stationId?.replace('GHCND:', '') || 'UNKNOWN';

        return `${id}\t${year} ${month} ${day} ${hour} ${minute}\t${d.value}`;
    });


    const content = formattedRows.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });

    // Generate meaningful filename
    let filename = `swmm_rainfall.dat`;
    if (stations.length === 1) {
        const name = stations[0].name || 'STATION';
        // Clean filename
        const safeName = name.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');

        filename = `${safeName}_SWMM.dat`;
    } else if (stations.length > 1) {
        filename = `Multiple_Stations_SWMM_${new Date().toISOString().split('T')[0]}.dat`;
    }

    saveAs(blob, filename);
}
