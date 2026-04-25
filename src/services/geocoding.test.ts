import { beforeEach, describe, expect, it, vi } from 'vitest';
import { geocodeCity } from './geocoding';
import { getJsonWithRetry } from './http';

vi.mock('./http', () => ({
    getJsonWithRetry: vi.fn()
}));

const mockedGetJsonWithRetry = vi.mocked(getJsonWithRetry);

describe('geocodeCity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('returns an array and caches successful lookups', async () => {
        mockedGetJsonWithRetry.mockResolvedValueOnce([
            { lat: '40.7128', lon: '-74.0060', display_name: 'New York, NY, USA' }
        ]);

        const first = await geocodeCity('New York, NY');
        const second = await geocodeCity('new york, ny');

        expect(first).toHaveLength(1);
        expect(first[0]).toMatchObject({ lat: 40.7128, lon: -74.006 });
        expect(second).toHaveLength(1);
        expect(second[0]).toMatchObject({ lat: 40.7128, lon: -74.006 });
        expect(mockedGetJsonWithRetry).toHaveBeenCalledTimes(1);
        expect(mockedGetJsonWithRetry).toHaveBeenCalledWith('/api/nominatim', {
            params: { q: 'New York, NY', format: 'json', limit: 5 }
        }, { retries: 2, backoffMs: 400 });
    });

    it('deduplicates concurrent requests for the same city', async () => {
        let resolveRequest: ((value: { lat: string; lon: string }[]) => void) | undefined;
        mockedGetJsonWithRetry.mockImplementationOnce(() => new Promise(resolve => {
            resolveRequest = resolve;
        }));

        const firstPromise = geocodeCity('Pittsburgh, PA');
        const secondPromise = geocodeCity('pittsburgh, pa');

        resolveRequest?.([{ lat: '40.4406', lon: '-79.9959' }]);

        const firstResult = await firstPromise;
        const secondResult = await secondPromise;
        expect(firstResult[0]).toMatchObject({ lat: 40.4406, lon: -79.9959 });
        expect(secondResult[0]).toMatchObject({ lat: 40.4406, lon: -79.9959 });
        expect(mockedGetJsonWithRetry).toHaveBeenCalledTimes(1);
    });

    it('returns multiple results for ambiguous queries', async () => {
        mockedGetJsonWithRetry.mockResolvedValueOnce([
            { lat: '39.7817', lon: '-89.6501', display_name: 'Springfield, Illinois, USA' },
            { lat: '37.2153', lon: '-93.2982', display_name: 'Springfield, Missouri, USA' }
        ]);

        const results = await geocodeCity('Springfield');
        expect(results).toHaveLength(2);
        expect(results[0].displayName).toBe('Springfield, Illinois, USA');
        expect(results[1].displayName).toBe('Springfield, Missouri, USA');
    });

    it('returns empty array when no results', async () => {
        mockedGetJsonWithRetry.mockResolvedValueOnce([]);
        const results = await geocodeCity('xyznonexistentplace123');
        expect(results).toEqual([]);
    });
});
