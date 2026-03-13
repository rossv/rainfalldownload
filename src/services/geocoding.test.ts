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

    it('uses the proxy endpoint and caches successful lookups', async () => {
        mockedGetJsonWithRetry.mockResolvedValueOnce([{ lat: '40.7128', lon: '-74.0060' }]);

        const first = await geocodeCity('New York, NY');
        const second = await geocodeCity('new york, ny');

        expect(first).toEqual({ lat: 40.7128, lon: -74.006 });
        expect(second).toEqual({ lat: 40.7128, lon: -74.006 });
        expect(mockedGetJsonWithRetry).toHaveBeenCalledTimes(1);
        expect(mockedGetJsonWithRetry).toHaveBeenCalledWith('/api/nominatim', {
            params: { q: 'New York, NY', format: 'json', limit: 1 }
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

        await expect(firstPromise).resolves.toEqual({ lat: 40.4406, lon: -79.9959 });
        await expect(secondPromise).resolves.toEqual({ lat: 40.4406, lon: -79.9959 });
        expect(mockedGetJsonWithRetry).toHaveBeenCalledTimes(1);
    });
});
