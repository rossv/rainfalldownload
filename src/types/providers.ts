export type ProviderId = 'noaa';

export interface ProviderCredentialBlob {
    token?: string;
    apiKey?: string;
    username?: string;
    [key: string]: string | undefined;
}
