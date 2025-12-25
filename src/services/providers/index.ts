import { NoaaService, NOAA_CAPABILITIES } from '../noaa';
import type { DataSource, DataSourceCapabilities, DataSourceOptions, ProviderCredentials } from '../../types';

export type ProviderId = 'noaa';

export interface ProviderDefinition {
    id: ProviderId;
    name: string;
    description?: string;
    capabilities: DataSourceCapabilities;
    create: (options: DataSourceOptions) => DataSource;
    auth?: {
        label: string;
        helperText?: string;
        placeholder?: string;
        signupUrl?: string;
    };
}

const providers: Record<ProviderId, ProviderDefinition> = {
    noaa: {
        id: 'noaa',
        name: 'NOAA Climate Data Online',
        description: 'GHCND station data via the NOAA CDO API',
        capabilities: NOAA_CAPABILITIES,
        create: ({ apiKey, credentials }) => {
            const token = credentials?.token ?? credentials?.apiKey ?? apiKey ?? '';
            return new NoaaService(token);
        },
        auth: {
            label: 'NOAA CDO Token',
            helperText: 'Generate a free NOAA token to unlock station search and downloads.',
            placeholder: 'Paste your NOAA token',
            signupUrl: 'https://www.ncdc.noaa.gov/cdo-web/token'
        }
    }
};

export function createProvider(id: ProviderId, options: DataSourceOptions): DataSource | null {
    const provider = providers[id];
    if (!provider) return null;
    const credentials: ProviderCredentials | undefined = options.credentials;
    const token = credentials?.token ?? credentials?.apiKey ?? options.apiKey;
    if (provider.capabilities.requiresApiKey && !token) return null;
    return provider.create(options);
}

export function listProviders(): ProviderDefinition[] {
    return Object.values(providers);
}

export function getProviderCapabilities(id: ProviderId): DataSourceCapabilities | null {
    const provider = providers[id];
    return provider ? provider.capabilities : null;
}
