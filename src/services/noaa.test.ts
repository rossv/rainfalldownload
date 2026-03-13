import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { NoaaService } from './noaa';

vi.mock('axios', () => ({
    default: {
        get: vi.fn()
    }
}));

const mockedAxios = axios as unknown as {
    get: ReturnType<typeof vi.fn>;
};

describe('NoaaService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('builds station searches without applying default datatype filters', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                results: []
            }
        });

        const service = new NoaaService('test-token');
        await service.findStationsByCoords(40.7128, -74.0060);

        const url = new URL(mockedAxios.get.mock.calls[0][0]);
        expect(url.pathname).toContain('/stations');
        expect(url.searchParams.get('datasetid')).toBe('GHCND');
        expect(url.searchParams.getAll('datatypeid')).toHaveLength(0);
    });

    it('filters unsupported datatypes from explicit station searches', async () => {
        mockedAxios.get.mockResolvedValue({
            data: {
                results: []
            }
        });

        const service = new NoaaService('test-token');
        await service.findStationsByCoords(40.7128, -74.0060, 20, 0.25, {
            datasetId: 'GHCND',
            datatypes: ['PRCP', 'TMAX']
        });

        const url = new URL(mockedAxios.get.mock.calls[0][0]);
        expect(url.searchParams.getAll('datatypeid')).toEqual(['PRCP']);
    });

    it('paginates large downloads and de-duplicates repeated rows', async () => {
        const firstPage = Array.from({ length: 1000 }, (_, index) => ({
            date: new Date(Date.UTC(2023, 0, 1, index, 0, 0)).toISOString(),
            datatype: 'PRCP',
            value: index
        }));
        const duplicate = firstPage[firstPage.length - 1];
        const extraRecord = {
            date: '2023-02-11T00:00:00',
            datatype: 'PRCP',
            value: '12.5'
        };

        mockedAxios.get
            .mockResolvedValueOnce({
                data: {
                    results: firstPage,
                    metadata: { resultset: { count: 1001 } }
                }
            })
            .mockResolvedValueOnce({
                data: {
                    results: [duplicate, extraRecord],
                    metadata: { resultset: { count: 1001 } }
                }
            });

        const service = new NoaaService('test-token');
        const data = await service.fetchData({
            stationIds: ['GHCND:TEST123'],
            startDate: '2023-01-01',
            endDate: '2023-02-11',
            units: 'standard',
            datatypes: ['PRCP'],
            datasetId: 'GHCND'
        });

        expect(mockedAxios.get).toHaveBeenCalledTimes(2);
        expect(data).toHaveLength(1001);
        expect(data[data.length - 1]?.value).toBe(12.5);
    });

    it('rejects downloads when the NOAA token is missing', async () => {
        const service = new NoaaService('');

        await expect(service.fetchData({
            stationIds: ['GHCND:TEST123'],
            startDate: '2023-01-01',
            endDate: '2023-01-02',
            units: 'standard',
            datatypes: ['PRCP'],
            datasetId: 'GHCND'
        })).rejects.toThrow('NOAA API token is required');
    });
});
