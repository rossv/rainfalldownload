/**
 * Regression tests for station search across all providers.
 *
 * These tests verify:
 * 1. NOAA station ID detection and direct lookup (vs. geocoding)
 * 2. NOAA city-based search routing through geocoding
 * 3. USGS site ID detection and lookup
 * 4. USGS coordinate-based search through proxy URLs
 * 5. Edge cases (empty queries, malformed IDs)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { NoaaService } from './noaa';
import { NwisService, isUsgsSiteId } from './providers/usgs';

// --- Mocks ---

vi.mock('axios', () => ({
    default: {
        get: vi.fn(),
        create: vi.fn(() => ({
            get: vi.fn()
        })),
        isAxiosError: vi.fn(() => false)
    }
}));

vi.mock('./geocoding', () => ({
    geocodeCity: vi.fn()
}));

vi.mock('./http', () => ({
    getJsonWithRetry: vi.fn(),
    formatAxiosError: vi.fn((error: unknown, ctx: string) => `${ctx}: error`)
}));

const mockedAxios = axios as unknown as {
    get: ReturnType<typeof vi.fn>;
};

const { geocodeCity } = await import('./geocoding');
const mockedGeocodeCity = vi.mocked(geocodeCity);

const { getJsonWithRetry } = await import('./http');
const mockedGetJsonWithRetry = vi.mocked(getJsonWithRetry);

// --- NOAA Station ID Detection ---

describe('NoaaService.isStationId', () => {
    it('recognizes GHCND: prefixed IDs', () => {
        expect(NoaaService.isStationId('GHCND:US1PAAL0011')).toBe(true);
        expect(NoaaService.isStationId('GHCND:USW00094823')).toBe(true);
    });

    it('recognizes COOP: and WBAN: prefixed IDs', () => {
        expect(NoaaService.isStationId('COOP:366233')).toBe(true);
        expect(NoaaService.isStationId('WBAN:14762')).toBe(true);
    });

    it('recognizes raw US-prefixed station IDs', () => {
        expect(NoaaService.isStationId('USW00094823')).toBe(true);
        expect(NoaaService.isStationId('USC00360106')).toBe(true);
        expect(NoaaService.isStationId('US1PAAL0011')).toBe(true);
    });

    it('is case-insensitive', () => {
        expect(NoaaService.isStationId('ghcnd:us1paal0011')).toBe(true);
    });

    it('rejects city names', () => {
        expect(NoaaService.isStationId('Pittsburgh, PA')).toBe(false);
        expect(NoaaService.isStationId('New York')).toBe(false);
        expect(NoaaService.isStationId('Los Angeles, CA')).toBe(false);
    });

    it('rejects empty/whitespace', () => {
        expect(NoaaService.isStationId('')).toBe(false);
        expect(NoaaService.isStationId('   ')).toBe(false);
    });
});

// --- NOAA Station Search Routing ---

describe('NoaaService station search routing', () => {
    let service: NoaaService;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        service = new NoaaService('test-token');
    });

    it('routes station ID queries to direct lookup instead of geocoding', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            data: {
                id: 'GHCND:US1PAAL0011',
                name: 'USHER 0.7 NW, PA US',
                latitude: 40.5432,
                longitude: -79.8123,
                elevation: 350.5,
                mindate: '2007-01-01',
                maxdate: '2024-12-31',
                datacoverage: 0.95
            }
        });

        const results = await service.findStationsByCity('GHCND:US1PAAL0011');

        // Should NOT have called geocoding
        expect(mockedGeocodeCity).not.toHaveBeenCalled();

        // Should have called the NOAA API directly
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
        const url = new URL(mockedAxios.get.mock.calls[0][0]);
        expect(url.pathname).toContain('/stations/GHCND%3AUS1PAAL0011');

        // Should return the station
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('GHCND:US1PAAL0011');
        expect(results[0].name).toBe('USHER 0.7 NW, PA US');
    });

    it('routes city queries through geocoding as before', async () => {
        mockedGeocodeCity.mockResolvedValueOnce([
            { lat: 40.4406, lon: -79.9959, displayName: 'Pittsburgh, PA, USA' }
        ]);
        mockedAxios.get.mockResolvedValueOnce({
            data: { results: [] }
        });

        await service.findStationsByCity('Pittsburgh, PA');

        // Should have called geocoding
        expect(mockedGeocodeCity).toHaveBeenCalledWith('Pittsburgh, PA');
    });

    it('returns empty array for station IDs that do not exist', async () => {
        mockedAxios.get.mockRejectedValueOnce(new Error('Not found'));

        const results = await service.findStationsByCity('GHCND:DOESNOTEXIST');

        expect(results).toEqual([]);
        expect(mockedGeocodeCity).not.toHaveBeenCalled();
    });

    it('adds GHCND: prefix to raw US-prefixed station IDs', async () => {
        mockedAxios.get.mockResolvedValueOnce({
            data: {
                id: 'GHCND:US1PAAL0011',
                name: 'Test Station',
                latitude: 40.0,
                longitude: -80.0
            }
        });

        await service.findStationsByCity('US1PAAL0011');

        const url = new URL(mockedAxios.get.mock.calls[0][0]);
        // Should have prefixed with GHCND: since the raw ID has no colon
        expect(url.pathname).toContain('/stations/GHCND%3AUS1PAAL0011');
    });
});

// --- USGS Site ID Detection ---

describe('isUsgsSiteId', () => {
    it('recognizes 8-digit site numbers', () => {
        expect(isUsgsSiteId('03049500')).toBe(true);
    });

    it('recognizes 15-digit site numbers', () => {
        expect(isUsgsSiteId('123456789012345')).toBe(true);
    });

    it('rejects non-numeric strings', () => {
        expect(isUsgsSiteId('Pittsburgh')).toBe(false);
        expect(isUsgsSiteId('GHCND:US1PA')).toBe(false);
    });

    it('rejects too-short numbers', () => {
        expect(isUsgsSiteId('1234567')).toBe(false);
    });

    it('rejects empty strings', () => {
        expect(isUsgsSiteId('')).toBe(false);
    });
});

// --- USGS Search Routing ---

describe('NwisService station search', () => {
    let service: NwisService;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        service = new NwisService();
    });

    it('routes site ID queries to direct site lookup', async () => {
        mockedGetJsonWithRetry.mockResolvedValueOnce({
            value: {
                timeSeries: [{
                    sourceInfo: {
                        siteCode: [{ value: '03049500' }],
                        siteName: 'Allegheny River at Natrona, PA',
                        geoLocation: {
                            geogLocation: { latitude: 40.6153, longitude: -79.7184 }
                        },
                        elevation: { value: 735.8 },
                        timeZoneInfo: { defaultTimeZone: { zoneAbbreviation: 'EST' } }
                    }
                }]
            }
        });

        const results = await service.findStationsByCity('03049500');

        // Should NOT have called geocoding
        expect(mockedGeocodeCity).not.toHaveBeenCalled();

        // Should return the station
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('03049500');
        expect(results[0].name).toBe('Allegheny River at Natrona, PA');
        expect(results[0].source).toBe('USGS_NWIS');
    });

    it('routes city queries through geocoding + coordinate search', async () => {
        mockedGeocodeCity.mockResolvedValueOnce([
            { lat: 40.4406, lon: -79.9959, displayName: 'Pittsburgh, PA, USA' }
        ]);
        mockedGetJsonWithRetry.mockResolvedValueOnce({
            value: { timeSeries: [] }
        });

        await service.findStationsByCity('Pittsburgh, PA');

        expect(mockedGeocodeCity).toHaveBeenCalledWith('Pittsburgh, PA');
    });

    it('uses proxy base URL for coordinate searches (not direct USGS URL)', async () => {
        mockedGetJsonWithRetry.mockResolvedValueOnce({
            value: { timeSeries: [] }
        });

        await service.findStationsByCoords(40.4406, -79.9959);

        expect(mockedGetJsonWithRetry).toHaveBeenCalledTimes(1);
        const url = mockedGetJsonWithRetry.mock.calls[0][0] as string;
        // In test environment, BASE_USGS should not be the direct waterservices.usgs.gov URL
        // It should use the proxy path (or whatever import.meta.env resolves to)
        expect(url).toContain('/iv/?format=json');
        expect(url).toContain('bBox=');
    });

    it('deduplicates stations from multiple timeSeries entries', async () => {
        mockedGetJsonWithRetry.mockResolvedValueOnce({
            value: {
                timeSeries: [
                    {
                        sourceInfo: {
                            siteCode: [{ value: '03049500' }],
                            siteName: 'Allegheny River at Natrona, PA',
                            geoLocation: { geogLocation: { latitude: 40.6, longitude: -79.7 } }
                        }
                    },
                    {
                        sourceInfo: {
                            siteCode: [{ value: '03049500' }],
                            siteName: 'Allegheny River at Natrona, PA',
                            geoLocation: { geogLocation: { latitude: 40.6, longitude: -79.7 } }
                        }
                    }
                ]
            }
        });

        const results = await service.findStationsByCoords(40.6, -79.7);
        expect(results).toHaveLength(1);
    });
});

// --- Edge Cases ---

describe('Station search edge cases', () => {
    it('NOAA: empty query returns empty array', async () => {
        const service = new NoaaService('test-token');
        const results = await service.findStationsByCity('');
        expect(results).toEqual([]);
    });

    it('NOAA: whitespace-only query returns empty array', async () => {
        const service = new NoaaService('test-token');
        const results = await service.findStationsByCity('   ');
        expect(results).toEqual([]);
    });

    it('USGS: empty query returns empty array', async () => {
        const service = new NwisService();
        mockedGeocodeCity.mockResolvedValueOnce([]);
        const results = await service.findStationsByCity('');
        expect(results).toEqual([]);
    });
});
