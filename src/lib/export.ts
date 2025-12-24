import type { RainfallData, Station } from '../types';

export function downloadCSV(stations: Station[], data: RainfallData[]) {
    // If multiple stations, we can add StationID column
    // Format: StationID, Date, Value, DataType
    const headers = ['StationID', 'StationName', 'Datetime', 'Value', 'DataType'].join('\t');
    const rows = data.map(d => {
        const parts = d.stationId?.split(':') || ['', d.stationId || ''];
        const simpleId = parts.length > 1 ? parts[1] : d.stationId;
        const station = stations.find(s => s.id === d.stationId);
        return `${simpleId}\t${station?.name || ''}\t${d.date}\t${d.value}\t${d.datatype || 'PRCP'}`;
    });

    const content = [headers, ...rows].join('\n');
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `rainfall_export_${new Date().toISOString().split('T')[0]}.csv`);
}

export function downloadSWMM(stations: Station[], data: RainfallData[]) {
    // Sort data: Station -> Date
    const sortedData = [...data].sort((a, b) => {
        const sComp = (a.stationId || '').localeCompare(b.stationId || '');
        if (sComp !== 0) return sComp;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    // Format: StationID  Year  Month  Day  Hour  Minute  Value
    const rows = sortedData.map(d => {
        const date = new Date(d.date);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hour = date.getHours();
        const minute = date.getMinutes();

        // SWMM prefers clean IDs
        const id = d.stationId?.replace('GHCND:', '') || 'UNKNOWN';

        return `${id}\t${year}\t${month}\t${day}\t${hour}\t${minute}\t${d.value}`;
    });

    const content = rows.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    // Generate meaningful filename
    let filename = `swmm_rainfall.dat`;
    if (stations.length === 1) {
        // Clean station name for filename
        // Ensure name exists
        const name = stations[0].name || 'STATION';
        const safeName = name.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
        const safeId = stations[0].id.replace('GHCND:', '');
        filename = `${safeId}_${safeName}_SWMM.dat`;
    } else if (stations.length > 1) {
        filename = `Multiple_Stations_SWMM_${new Date().toISOString().split('T')[0]}.dat`;
    }

    console.log(`Downloading SWMM data as: ${filename}`);
    triggerDownload(url, filename);
}

function triggerDownload(url: string, filename: string) {
    const link = document.createElement('a');
    link.href = url;
    // Use both property and attribute for maximum compatibility
    link.download = filename;
    link.setAttribute('download', filename);

    document.body.appendChild(link);
    link.click();

    // Cleanup: Extend timeout to ensure browser has time to capture the blob
    setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }, 5000);
}
