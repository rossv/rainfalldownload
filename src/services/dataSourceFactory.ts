import type { Preferences } from '../hooks/usePreferences';
import type { DataType, RainfallData, Station, FetchDataParams } from '../types';
import type { ProviderId } from '../types/providers';
import { NoaaService } from './noaa';

export interface DataSource {
    findStationsByCity: (city: string, limit?: number, buffer?: number) => Promise<Station[]>;
    findStationsByCoords: (lat: number, lon: number, limit?: number, buffer?: number) => Promise<Station[]>;
    getAvailableDataTypes: (stationId: string) => Promise<DataType[]>;
    fetchData: (params: FetchDataParams) => Promise<RainfallData[]>;
}

function buildNoaaService(preferences: Preferences): DataSource | null {
    const token = preferences.providerCredentials.noaa?.token || preferences.providerCredentials.noaa?.apiKey;
    return token ? new NoaaService(token) : null;
}

export function createDataSource(preferences: Preferences): DataSource | null {
    const providerId = preferences.activeProviderId as ProviderId;

    switch (providerId) {
        case 'noaa':
        default:
            return buildNoaaService(preferences);
    }
}
