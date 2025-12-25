import { NoaaService, NOAA_CAPABILITIES } from '../noaa';
import type { DataSource, DataSourceCapabilities, DataSourceOptions } from '../../types';

export type ProviderId = 'noaa';

export interface ProviderDefinition {
    id: ProviderId;
    name: string;
    description?: string;
    capabilities: DataSourceCapabilities;
    create: (options: DataSourceOptions) => DataSource;
}

const providers: Record<ProviderId, ProviderDefinition> = {
    noaa: {
        id: 'noaa',
        name: 'NOAA Climate Data Online',
        description: 'GHCND station data via the NOAA CDO API',
        capabilities: NOAA_CAPABILITIES,
        create: ({ apiKey }) => new NoaaService(apiKey || '')
    }
};

export function createProvider(id: ProviderId, options: DataSourceOptions): DataSource | null {
    const provider = providers[id];
    if (!provider) return null;
    if (provider.capabilities.requiresApiKey && !options.apiKey) return null;
    return provider.create(options);
}

export function listProviders(): ProviderDefinition[] {
    return Object.values(providers);
}

export function getProviderCapabilities(id: ProviderId): DataSourceCapabilities | null {
    const provider = providers[id];
    return provider ? provider.capabilities : null;
}
