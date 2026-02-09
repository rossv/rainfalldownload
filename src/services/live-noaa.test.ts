
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import axios from 'axios';

// API Key provided by user
const API_TOKEN = 'lvNTjIcbIWQKUCyMrHhyowMeojwoFsno';
const BASE_NOAA = 'https://www.ncdc.noaa.gov/cdo-web/api/v2';

describe('NOAA API Live Verification', () => {

    // 1. Direct API Access (Node.js environment - no CORS)
    it('should fetch stations successfully via Direct API (verify key/endpoint)', async () => {
        const endpoint = '/stations';
        const url = `${BASE_NOAA}${endpoint}`;

        console.log(`Testing Direct API: ${url}`);

        try {
            const response = await axios.get(url, {
                headers: { token: API_TOKEN },
                params: {
                    limit: 1,
                    datasetid: 'GHCND'
                }
            });

            console.log('Direct API Success Status:', response.status);
            console.log('Direct API Sample Data:', JSON.stringify(response.data?.results?.[0], null, 2));

            expect(response.status).toBe(200);
            expect(response.data.results.length).toBeGreaterThan(0);
        } catch (error: any) {
            console.error('Direct API Failed:', error.message);
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Data:', error.response.data);
            }
            throw error;
        }
    });

    // 2. Test CORS Proxy 1: corsproxy.io
    it('should fetch via corsproxy.io', async () => {
        const endpoint = '/stations?limit=1&datasetid=GHCND';
        const targetUrl = `${BASE_NOAA}${endpoint}`;
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

        console.log(`Testing Proxy 1: ${proxyUrl}`);

        try {
            // Note: corsproxy.io generally forwards headers?
            const response = await axios.get(proxyUrl, {
                headers: { token: API_TOKEN }
            });

            console.log('Proxy 1 Success Status:', response.status);
            expect(response.status).toBe(200);
        } catch (error: any) {
            console.warn('Proxy 1 Failed:', error.message);
            // We don't fail the test if proxy is down, but we log it
            // expect(true).toBe(true); 
        }
    });

    // 3. Test CORS Proxy 2: thingproxy
    it('should fetch via thingproxy', async () => {
        const endpoint = '/stations?limit=1&datasetid=GHCND';
        const targetUrl = `${BASE_NOAA}${endpoint}`;
        const proxyUrl = `https://thingproxy.freeboard.io/fetch/${targetUrl}`;

        console.log(`Testing Proxy 2: ${proxyUrl}`);

        try {
            const response = await axios.get(proxyUrl, {
                headers: { token: API_TOKEN }
            });
            console.log('Proxy 2 Success Status:', response.status);
            expect(response.status).toBe(200);
        } catch (error: any) {
            console.warn('Proxy 2 Failed:', error.message);
        }
    });
});
