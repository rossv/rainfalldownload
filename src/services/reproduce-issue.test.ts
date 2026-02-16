
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { NoaaService } from './noaa';

vi.mock('axios');

describe('NoaaService Reproduction', () => {
    let service: NoaaService;
    const mockToken = 'test-token';

    beforeEach(() => {
        vi.resetAllMocks();
        localStorage.clear();
        service = new NoaaService(mockToken);
        (axios.get as any).mockResolvedValue({ data: { results: [] } });
    });

    it('should construct correct URL for GHCND station search', async () => {
        const lat = 40.7128; // NYC
        const lon = -74.0060;

        await service.findStationsByCoords(lat, lon);

        expect(axios.get).toHaveBeenCalled();
        const callArgs = (axios.get as any).mock.calls[0];
        const urlStr = callArgs[0] as string;
        // const config = callArgs[1];

        // Decoded URL for easier reading
        const url = new URL(urlStr);

        console.log('Generated URL:', url.toString());
        console.log('Params:', Object.fromEntries(url.searchParams.entries()));

        expect(url.pathname).toContain('/stations');
        expect(url.searchParams.get('datasetid')).toBe('GHCND');
        // By design we don't apply default datatype filtering unless explicitly requested.
        expect(url.searchParams.getAll('datatypeid')).toHaveLength(0);
        expect(url.searchParams.get('limit')).toBeDefined();
        expect(url.searchParams.get('extent')).toBeDefined();
    });

    it('should construct correct URL for GHCND with explicit datatypes', async () => {
        const lat = 40.7128;
        const lon = -74.0060;

        await service.findStationsByCoords(lat, lon, 20, 0.25, { datasetId: 'GHCND', datatypes: ['PRCP', 'TMAX'] });

        const callArgs = (axios.get as any).mock.calls[0];
        const urlStr = callArgs[0] as string;
        const url = new URL(urlStr);

        console.log('Generated URL (Explicit Types):', url.toString());

        const types = url.searchParams.getAll('datatypeid');
        expect(types).toContain('PRCP');
        expect(types).not.toContain('TMAX');
        expect(types.length).toBe(1);
    });
});
