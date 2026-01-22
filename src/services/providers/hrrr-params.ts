export type HrrrAggregationType = 'sum' | 'average';

export interface HrrrParameterOption {
    id: string;
    label: string;
    units: string;
    sourceField: string;
    unifiedParameter: string;
    aggregation: HrrrAggregationType;
}

export const HRRR_PARAMETER_OPTIONS: HrrrParameterOption[] = [
    {
        id: 'APCP',
        label: 'Total Precipitation',
        units: 'mm',
        sourceField: 'quantitativePrecipitation',
        unifiedParameter: 'PRCP',
        aggregation: 'sum'
    },
    {
        id: 'TMP',
        label: 'Temperature',
        units: '°C',
        sourceField: 'temperature',
        unifiedParameter: 'TMP',
        aggregation: 'average'
    },
    {
        id: 'RH',
        label: 'Relative Humidity',
        units: '%',
        sourceField: 'relativeHumidity',
        unifiedParameter: 'RH',
        aggregation: 'average'
    },
    {
        id: 'WIND',
        label: 'Wind Speed',
        units: 'm/s',
        sourceField: 'windSpeed',
        unifiedParameter: 'WIND',
        aggregation: 'average'
    }
];

export const DEFAULT_HRRR_PARAMETER = 'APCP';
