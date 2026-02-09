import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';

const DEFAULT_TIMEOUT_MS = 10000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const http = axios.create({
    timeout: DEFAULT_TIMEOUT_MS
});

const isRetryableStatus = (status?: number) => {
    if (!status) return true;
    return status === 408 || status === 429 || status >= 500;
};

const shouldRetry = (error: AxiosError) => {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return true;
    return isRetryableStatus(error.response?.status);
};

export const formatAxiosError = (error: unknown, context: string) => {
    if (!axios.isAxiosError(error)) {
        return `${context}: Unexpected error.`;
    }
    const status = error.response?.status;
    const statusText = error.response?.statusText ?? 'Unknown error';
    return `${context}: ${status ? `${status} ${statusText}` : 'Network/timeout error'}.`;
};

export async function getJsonWithRetry<T>(
    url: string,
    config: AxiosRequestConfig = {},
    options: { retries?: number; backoffMs?: number } = {}
): Promise<T> {
    const retries = options.retries ?? 2;
    const backoffMs = options.backoffMs ?? 500;
    let attempt = 0;
    let lastError: AxiosError | null = null;

    while (attempt <= retries) {
        try {
            const response = await http.get<T>(url, config);
            return response.data;
        } catch (error) {
            if (!axios.isAxiosError(error)) {
                throw error;
            }
            lastError = error;
            if (!shouldRetry(error) || attempt >= retries) {
                throw error;
            }
            const delay = backoffMs * Math.pow(2, attempt);
            await sleep(delay);
        }
        attempt += 1;
    }

    if (lastError) {
        throw lastError;
    }
    throw new Error('Request failed unexpectedly.');
}

export default http;
