import type { ProviderCredentialBlob, ProviderId } from '../types/providers';

export interface ProviderField {
    key: keyof ProviderCredentialBlob | string;
    label: string;
    placeholder?: string;
    type?: 'text' | 'password';
    helperText?: string;
    signupUrl?: string;
    optional?: boolean;
}

export interface ProviderDefinition {
    id: ProviderId;
    name: string;
    tagline: string;
    credentialFields: ProviderField[];
}

export const PROVIDERS: ProviderDefinition[] = [
    {
        id: 'noaa',
        name: 'NOAA Climate Data Online',
        tagline: 'Daily precipitation and climate observations from NOAA CDO.',
        credentialFields: [
            {
                key: 'token',
                label: 'NOAA API Token',
                placeholder: 'Enter your token...',
                type: 'password',
                helperText: 'Required to fetch data. Get one from NOAA.',
                signupUrl: 'https://www.ncdc.noaa.gov/cdo-web/token'
            }
        ]
    }
];

export function getProviderDefinition(id: ProviderId): ProviderDefinition {
    return PROVIDERS.find(p => p.id === id) ?? PROVIDERS[0];
}

export function hasRequiredCredentials(
    providerId: ProviderId,
    credentials: Record<ProviderId, ProviderCredentialBlob>
): boolean {
    const provider = getProviderDefinition(providerId);
    const providerCreds = credentials[providerId] || {};

    return !provider.credentialFields.some(field => {
        if (field.optional) return false;
        const value = providerCreds[field.key as string];
        return !String(value ?? '').trim();
    });
}
