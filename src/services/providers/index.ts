import { NoaaService, NOAA_CAPABILITIES } from '../noaa';
import { NwisService, USGS_CAPABILITIES } from './usgs';
import { SynopticService, SYNOPTIC_CAPABILITIES } from './synoptic';
import type { DataSource, DataSourceCapabilities, DataSourceOptions, ProviderCredentials } from '../../types';

export type ProviderId = 'noaa' | 'usgs_nwis' | 'synoptic';

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
    },
    usgs_nwis: {
        id: 'usgs_nwis',
        name: 'USGS NWIS',
        description: 'Real-time USGS water data (Streamflow, Precip)',
        capabilities: USGS_CAPABILITIES,
        create: (_options) => new NwisService(),
        // No auth needed
    },
    synoptic: {
        id: 'synoptic',
        name: 'Synoptic Data',
        description: 'Mesonet data (requires API Token)',
        capabilities: SYNOPTIC_CAPABILITIES,
        create: ({ credentials }) => new SynopticService({ token: credentials?.token ?? credentials?.apiKey }),
        auth: {
            label: 'Synoptic Token',
            helperText: 'Sign up at Synoptic to get a token.',
            placeholder: 'Paste Synoptic Token',
            signupUrl: 'https://developers.synopticdata.com/'
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
