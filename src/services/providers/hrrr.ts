import type { DataSourceCapabilities } from '../../types';

export const HRRR_CAPABILITIES: DataSourceCapabilities = {
    id: 'hrrr',
    name: 'NOAA HRRR',
    supportsStationSearch: false,
    supportsSpatialSearch: true,
    supportsGridInterpolation: true,
    requiresApiKey: false,
    maxDateRangeDays: 30,
    description: 'High-Resolution Rapid Refresh model grids (hourly analyses and forecasts).'
};
