import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Station, UnifiedTimeSeries } from '../types';
import { downloadCSV } from './export';

const saveAsMock = vi.fn();

vi.mock('file-saver', () => ({
    saveAs: (...args: unknown[]) => saveAsMock(...args)
}));

async function blobToUtf8(blob: Blob): Promise<string> {
    if (typeof blob.text === 'function') {
        return await blob.text();
    }

    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
    });
}

describe('downloadCSV', () => {
    beforeEach(() => {
        saveAsMock.mockReset();
    });

    it('escapes commas and quotes in station names for single-station CSV exports', async () => {
        const stations: Station[] = [{
            id: 'GHCND:TEST001',
            name: 'Station "Alpha", East',
            source: 'NOAA_CDO',
            latitude: 40,
            longitude: -73
        }];

        const data: UnifiedTimeSeries[] = [{
            timestamp: '2026-01-01T00:00:00.000Z',
            value: 1.2,
            interval: 1440,
            source: 'NOAA_CDO',
            stationId: 'GHCND:TEST001',
            parameter: 'PRCP'
        }];

        downloadCSV(stations, data);

        expect(saveAsMock).toHaveBeenCalledTimes(1);

        const [blobArg] = saveAsMock.mock.calls[0] as [Blob, string];
        const csv = await blobToUtf8(blobArg);

        expect(csv).toContain('TEST001,"Station ""Alpha"", East",2026-01-01 00:00:00,1.2,PRCP');
    });

    it('escapes station headers with commas in multi-station CSV exports', async () => {
        const stations: Station[] = [
            {
                id: 'GHCND:ONE,1',
                name: 'One',
                source: 'NOAA_CDO',
                latitude: 40,
                longitude: -73
            },
            {
                id: 'GHCND:TWO',
                name: 'Two',
                source: 'NOAA_CDO',
                latitude: 40,
                longitude: -73
            }
        ];

        const data: UnifiedTimeSeries[] = [
            {
                timestamp: '2026-01-01T00:00:00.000Z',
                value: 0.5,
                interval: 1440,
                source: 'NOAA_CDO',
                stationId: 'GHCND:ONE,1',
                parameter: 'PRCP'
            },
            {
                timestamp: '2026-01-01T00:00:00.000Z',
                value: 0.7,
                interval: 1440,
                source: 'NOAA_CDO',
                stationId: 'GHCND:TWO',
                parameter: 'PRCP'
            }
        ];

        downloadCSV(stations, data);

        const [blobArg] = saveAsMock.mock.calls[0] as [Blob, string];
        const csv = await blobToUtf8(blobArg);

        expect(csv.split('\n')[0]).toBe('Timestamp,"ONE,1 (PRCP)",TWO (PRCP)');
    });
});
