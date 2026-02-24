import type { DataQueryOptions, DataSource, DataSourceCapabilities, DataType, FetchDataParams, Station, UnifiedTimeSeries } from '../../types';
import { formatAxiosError, getJsonWithRetry } from '../http';
import { DEFAULT_HRRR_PARAMETER, HRRR_PARAMETER_OPTIONS } from './hrrr-params';

export const HRRR_CAPABILITIES: DataSourceCapabilities = {
    id: 'hrrr',
    name: 'NOAA HRRR',
    description: 'High-Resolution Rapid Refresh gridded analysis/forecast data',
    requiresApiKey: false,
    supportsStationSearch: false,
    supportsSpatialSearch: true,
    supportsGridInterpolation: true,
    maxDateRangeDays: 30,
};

export class HrrrService implements DataSource {
    static readonly ID = HRRR_CAPABILITIES.id;
    static readonly NAME = HRRR_CAPABILITIES.name;

    readonly id = HrrrService.ID;
    readonly name = HrrrService.NAME;
    readonly capabilities = HRRR_CAPABILITIES;

    async findStationsByCity(_city: string, _limit = 20, _buffer = 0.25, _options?: DataQueryOptions): Promise<Station[]> {
        return [];
    }

    async findStationsByCoords(_lat: number, _lon: number, _limit = 20, _buffer = 0.25, _options?: DataQueryOptions): Promise<Station[]> {
        return [];
    }

    async getAvailableDataTypes(_stationId: string, _options?: DataQueryOptions): Promise<DataType[]> {
        const today = new Date();
        const start = new Date(today);
        start.setUTCDate(start.getUTCDate() - 2);
        const minDate = start.toISOString().split('T')[0];
        const maxDate = today.toISOString().split('T')[0];

        return HRRR_PARAMETER_OPTIONS.map(option => ({
            id: option.id,
            name: `${option.label} (${option.units})`,
            datacoverage: 1,
            mindate: minDate,
            maxdate: maxDate,
            units: option.units
        }));
    }

    async fetchData(params: FetchDataParams & DataQueryOptions): Promise<UnifiedTimeSeries[]> {
        const stationId = params.stationIds?.[0] ?? 'hrrr-virtual';
        const hrrrOptions = params.hrrr ?? {};
        const latitude = hrrrOptions.latitude;
        const longitude = hrrrOptions.longitude;

        if (latitude === undefined || longitude === undefined) {
            throw new Error('HRRR requests require latitude/longitude coordinates.');
        }

        const parameterOptions = new Map(HRRR_PARAMETER_OPTIONS.map(option => [option.id, option]));
        const requested = hrrrOptions.parameters ?? params.datatypes ?? [DEFAULT_HRRR_PARAMETER];
        const parameters = requested.filter(param => parameterOptions.has(param));
        const finalParameters = parameters.length > 0 ? parameters : [DEFAULT_HRRR_PARAMETER];

        let payload: {
            stationId?: string;
            series: Array<{ timestamp: string; value: number; interval: number; parameter: string }>;
        };
        try {
            payload = await getJsonWithRetry('/api/hrrr', {
                params: {
                    lat: latitude,
                    lon: longitude,
                    start: params.startDate,
                    end: params.endDate,
                    parameters: finalParameters.join(','),
                    productType: hrrrOptions.productType ?? 'forecast',
                    leadHours: hrrrOptions.leadHours?.join(','),
                    aggregationWindow: hrrrOptions.aggregationWindow ?? 'hourly'
                }
            }, { retries: 2 });
        } catch (error) {
            console.warn(formatAxiosError(error, 'HRRR request failed'));
            throw new Error('HRRR request failed. Please try again.');
        }

        const { series, stationId: apiStationId } = payload as {
            stationId?: string;
            series: Array<{ timestamp: string; value: number; interval: number; parameter: string }>;
        };

        const normalizedStationId = apiStationId ?? stationId;

        return series.map(point => ({
            timestamp: point.timestamp,
            value: point.value,
            interval: point.interval,
            source: 'HRRR',
            stationId: normalizedStationId,
            parameter: point.parameter
        }));
    }
}
