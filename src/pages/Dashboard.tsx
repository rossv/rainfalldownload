import axios from 'axios';
import { useState, useMemo, useEffect } from 'react';

import { StationMap } from '../components/StationMap';
import { StationList } from '../components/StationList';
import { StationSearch } from '../components/StationSearch';
import { RainfallChart } from '../components/RainfallChart';
import { createProvider, getProviderCapabilities, listProviders } from '../services/providers';
import type { Station, UnifiedTimeSeries, DataSource, HrrrQueryOptions } from '../types';
import { downloadCSV, downloadSWMM } from '../lib/export';
import { Loader2, Download, Search as SearchIcon } from 'lucide-react';
import { AvailabilityTimeline } from '../components/AvailabilityTimeline';
import { StatusCenter } from '../components/StatusCenter';
import { cn } from '../lib/utils';
import { usePreferences } from '../hooks/usePreferences';
import { NOAA_DATATYPE_WHITELIST, NOAA_DATASET_WHITELIST } from '../services/noaa';
import { DEFAULT_HRRR_OPTIONS, HRRR_PARAMETER_OPTIONS } from '../services/providers/hrrr';

export function Dashboard() {
    const { preferences, setUnits, setProvider } = usePreferences();

    const [stations, setStations] = useState<Station[]>([]);
    const [selectedStations, setSelectedStations] = useState<Station[]>([]);
    const [rainfallData, setRainfallData] = useState<UnifiedTimeSeries[]>([]);
    const [dateRange, setDateRange] = useState({ start: '2023-01-01', end: '2023-12-31' });
    const [loading, setLoading] = useState(false);
    const [mapCenter, setMapCenter] = useState<[number, number] | undefined>(undefined);

    // Search State (Hoisted from StationSearch)
    const [searchQuery, setSearchQuery] = useState('');
    const [searchLoading, setSearchLoading] = useState(false);
    const [lastSearchType, setLastSearchType] = useState<'text' | 'coords' | null>(null);
    const [lastSearchCoords, setLastSearchCoords] = useState<[number, number] | null>(null);

    // View Mode: 'discovery' (Map focused) vs 'configuration' (Params focused)
    const [viewMode, setViewMode] = useState<'discovery' | 'configuration'>('discovery');

    const activeCredentials = preferences.credentials[preferences.providerId];

    const dataSource = useMemo<DataSource | null>(
        () => createProvider(preferences.providerId, {
            credentials: activeCredentials,
            apiKey: activeCredentials?.token ?? activeCredentials?.apiKey
        }),
        [activeCredentials, preferences.providerId]
    );

    const providerCapabilities = useMemo(
        () => getProviderCapabilities(preferences.providerId),
        [preferences.providerId]
    );

    const handleStationsFound = (found: Station[], center?: [number, number]) => {
        setStations(found);
        if (center) setMapCenter(center);
    };

    const toggleStation = (station: Station) => {
        setSelectedStations(prev => {
            const exists = prev.find(s => s.id === station.id);
            if (exists) {
                return prev.filter(s => s.id !== station.id);
            }
            return [...prev, station];
        });
    };

    const [stationAvailability, setStationAvailability] = useState<Record<string, import('../types').DataType[]>>({});
    const [availabilityLoading, setAvailabilityLoading] = useState<Record<string, boolean>>({});
    const [statusTasks, setStatusTasks] = useState<{ id: string, message: string, status: 'pending' | 'success' | 'error' }[]>([]);
    const [selectedDataTypes, setSelectedDataTypes] = useState<string[]>(['PRCP']);
    const [datasetId, setDatasetId] = useState<string>(NOAA_DATASET_WHITELIST[0]);
    const [hrrrProductType, setHrrrProductType] = useState(DEFAULT_HRRR_OPTIONS.productType);
    const [hrrrForecastHour, setHrrrForecastHour] = useState(DEFAULT_HRRR_OPTIONS.forecastHour);
    const [hrrrAggregationWindowHours, setHrrrAggregationWindowHours] = useState(DEFAULT_HRRR_OPTIONS.aggregationWindowHours);

    // Track the parameters used for the last successful fetch to determine "staleness"
    const [lastFetchedParams, setLastFetchedParams] = useState<{
        stationIds: string[];
        dateRange: { start: string; end: string };
        dataTypes: string[];
        datasetId: string;
        providerId: string;
        hrrrOptions?: HrrrQueryOptions;
        timestamp: number;
    } | null>(null);

    const datasetOptions = useMemo(() => {
        if (preferences.providerId === 'noaa') {
            return [
                { id: 'GHCND', label: 'Daily (GHCND)', helper: 'Daily summaries for gauge locations.' },
                { id: 'PRECIP_HLY', label: 'Hourly Precip (PRECIP_HLY)', helper: 'Hourly precipitation-only dataset where available.' },
                { id: 'GSOM', label: 'Monthly (GSOM)', helper: 'Monthly climate summaries for long-term trends.' },
                { id: 'GSOY', label: 'Annual (GSOY)', helper: 'Yearly climate summaries from station archives.' }
            ];
        }
        if (preferences.providerId === 'usgs_nwis') {
            return [
                { id: 'iv', label: 'Instantaneous Values', helper: 'Real-time high-frequency data (Precip, Flow, Stage).' }
            ];
        }
        if (preferences.providerId === 'synoptic') {
            return [
                { id: 'timeseries', label: 'Station Time Series', helper: 'Observed weather parameters.' }
            ];
        }
        if (preferences.providerId === 'hrrr') {
            return [
                { id: 'hrrr', label: 'HRRR CONUS Grid', helper: 'High-resolution model output grid.' }
            ];
        }
        return [];
    }, [preferences.providerId]);

    const hrrrOptions = useMemo(() => {
        if (preferences.providerId !== 'hrrr') return undefined;
        return {
            productType: hrrrProductType,
            forecastHour: hrrrForecastHour,
            aggregationWindowHours: hrrrAggregationWindowHours
        };
    }, [hrrrAggregationWindowHours, hrrrForecastHour, hrrrProductType, preferences.providerId]);

    const defaultDataTypes = useMemo(() => {
        if (preferences.providerId === 'hrrr') {
            return [HRRR_PARAMETER_OPTIONS[0].id];
        }
        if (datasetId === 'PRECIP_HLY') return ['HPCP'];
        return ['PRCP'];
    }, [datasetId, preferences.providerId]);

    useEffect(() => {
        if (datasetOptions.length === 0) return;
        if (!datasetOptions.some(option => option.id === datasetId)) {
            setDatasetId(datasetOptions[0].id);
        }
    }, [datasetId, datasetOptions]);

    useEffect(() => {
        if (preferences.providerId !== 'hrrr') return;
        if (hrrrProductType === 'analysis' && hrrrForecastHour !== 0) {
            setHrrrForecastHour(0);
        }
    }, [hrrrForecastHour, hrrrProductType, preferences.providerId]);

    // Auto-select defaults when dataset changes
    useEffect(() => {
        // Clear selected stations to prevent mixing datasets
        setSelectedStations([]);

        if (preferences.providerId === 'noaa') {
            if (datasetId === 'PRECIP_HLY') {
                setSelectedDataTypes(['HPCP']);
            } else {
                setSelectedDataTypes(prev => {
                    const filtered = prev.filter(dt => NOAA_DATATYPE_WHITELIST.includes(dt as typeof NOAA_DATATYPE_WHITELIST[number]) && dt !== 'HPCP');
                    if (filtered.length > 0) return filtered;
                    return ['PRCP'];
                });
            }
            return;
        }

        if (preferences.providerId === 'hrrr') {
            const allowed = new Set(HRRR_PARAMETER_OPTIONS.map(option => option.id));
            setSelectedDataTypes(prev => {
                const filtered = prev.filter(dt => allowed.has(dt));
                if (filtered.length > 0) return filtered;
                return [HRRR_PARAMETER_OPTIONS[0].id];
            });
            return;
        }

        setSelectedDataTypes(prev => (prev.length > 0 ? prev : defaultDataTypes));
    }, [datasetId, defaultDataTypes, preferences.providerId]);

    useEffect(() => {
        setStationAvailability({});
        setAvailabilityLoading({});
    }, [datasetId, preferences.providerId]);

    // --- Search Logic ---

    const searchError = (error: any, defaultMsg: string) => {
        console.error('Search failed:', error);
        if (axios.isAxiosError(error)) {
            console.error('Axios Error Details:', {
                code: error.code,
                message: error.message,
                response: {
                    status: error.response?.status,
                    data: error.response?.data,
                }
            });
        }
        let message = defaultMsg;
        if (axios.isAxiosError(error)) {
            if (error.response?.status === 401) {
                message = 'Invalid API Token. Please check your settings.';
            } else if (error.response?.status === 503) {
                message = 'Selected provider is unavailable.';
            } else if (error.response?.status === 504 || error.code === 'ECONNABORTED') {
                message = 'The provider is responding slowly. Please retry.';
            }
        }
        alert(message);
    };

    const performTextSearch = async (query: string, silent = false) => {
        if (!dataSource || !query.trim()) return;

        // If strict capability checks are needed, add here.
        // Assuming dataSource is valid if we are here.

        if (!silent) setSearchLoading(true);

        try {
            const results = await dataSource.findStationsByCity(query, undefined, undefined, { datasetId, datatypes: selectedDataTypes, hrrrOptions });

            // Calculate center
            let center: [number, number] | undefined;
            if (results.length > 0) {
                const lat = results.reduce((sum, s) => sum + s.latitude, 0) / results.length;
                const lon = results.reduce((sum, s) => sum + s.longitude, 0) / results.length;
                center = [lat, lon];
            }

            handleStationsFound(results, center);
            setLastSearchType('text');
        } catch (error) {
            if (!silent) searchError(error, 'Failed to search stations.');
        } finally {
            if (!silent) setSearchLoading(false);
        }
    };

    const performCoordsSearch = async (lat: number, lon: number, silent = false) => {
        if (!dataSource) return;

        if (!silent) setSearchLoading(true);
        try {
            const results = await dataSource.findStationsByCoords(lat, lon, undefined, undefined, { datasetId, datatypes: selectedDataTypes, hrrrOptions });
            handleStationsFound(results, [lat, lon]);
            setLastSearchType('coords');
            setLastSearchCoords([lat, lon]);
            if (!silent) setSearchQuery(`Location (${lat.toFixed(2)}, ${lon.toFixed(2)})`);
        } catch (error) {
            if (!silent) searchError(error, 'Failed to find stations near location.');
        } finally {
            if (!silent) setSearchLoading(false);
        }
    };

    const handleLocationClick = () => {
        const caps = providerCapabilities;
        const creds = activeCredentials;
        const hasKey = Boolean(creds?.token?.trim() || creds?.apiKey?.trim());

        if (!caps?.supportsStationSearch) {
            alert('The selected provider does not support station search.');
            return;
        }
        if (!hasKey && caps?.requiresApiKey) {
            alert('Add your API Token in Settings before searching.');
            return;
        }

        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }

        setSearchLoading(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                performCoordsSearch(latitude, longitude);
            },
            (error) => {
                console.error(error);
                setSearchLoading(false);
                alert('Location permission denied or unavailable.');
            }
        );
    };


    // Auto-refresh search when Dataset or Datatypes change
    useEffect(() => {
        // Debounce or just run?
        // Run only if we have a valid last search state.
        if (lastSearchType === 'text' && searchQuery) {
            performTextSearch(searchQuery, true); // silent refresh
        } else if (lastSearchType === 'coords' && lastSearchCoords) {
            performCoordsSearch(lastSearchCoords[0], lastSearchCoords[1], true);
        }
    }, [datasetId, dataSource, hrrrOptions, selectedDataTypes]); // filtered to just datasetId change mainly. Added dataSource for safety.

    // -------------------------------------------------------------------------
    // --- Logic Restored (Availability, Fetching, Status) ---
    // -------------------------------------------------------------------------

    // Fetch availability when selected stations change
    useEffect(() => {
        if (!dataSource) return;

        const fetchAvailability = async () => {
            const newTasks: { id: string, message: string, status: 'pending' | 'success' | 'error' }[] = [];

            for (const station of selectedStations) {
                if (stationAvailability[station.id] !== undefined || availabilityLoading[station.id]) continue;

                const taskId = `fetch-avail-${station.id}`;
                newTasks.push({ id: taskId, message: `Checking data for ${station.name}...`, status: 'pending' });
                setAvailabilityLoading(prev => ({ ...prev, [station.id]: true }));

                try {
                    const result = await dataSource.getAvailableDataTypes(station.id, { datasetId, hrrrOptions });

                    // Allow provider to return [] if no data
                    const types = result.map(t => {
                        let minD = t.mindate;
                        let maxD = t.maxdate;
                        if (station.mindate && minD < station.mindate) minD = station.mindate;
                        if (station.maxdate && maxD > station.maxdate) maxD = station.maxdate;
                        return { ...t, mindate: minD, maxdate: maxD };
                    });

                    setStationAvailability(prev => ({ ...prev, [station.id]: types }));
                    setStatusTasks(prev => prev.map(t =>
                        t.id === taskId ? { ...t, status: 'success', message: `Found data for ${station.name}` } : t
                    ));
                    setTimeout(() => {
                        setStatusTasks(prev => prev.filter(t => t.id !== taskId));
                    }, 3000);
                } catch (e) {
                    console.error(e);
                    setStatusTasks(prev => prev.map(t =>
                        t.id === taskId ? { ...t, status: 'error', message: `No data found for ${station.name}` } : t
                    ));
                    setStationAvailability(prev => ({ ...prev, [station.id]: [] }));
                } finally {
                    setAvailabilityLoading(prev => ({ ...prev, [station.id]: false }));
                }
            }

            if (newTasks.length > 0) {
                setStatusTasks(prev => [...prev, ...newTasks]);
            }
        };

        fetchAvailability();
    }, [selectedStations, dataSource, stationAvailability, availabilityLoading, datasetId, hrrrOptions]);

    const availableDataTypes = useMemo(() => {
        const allTypes = new Map<string, import('../types').DataType>();
        selectedStations.forEach(st => {
            const types = stationAvailability[st.id] || [];
            types.forEach(t => {
                if (!allTypes.has(t.id)) allTypes.set(t.id, t);
            });
        });
        return Array.from(allTypes.values());
    }, [selectedStations, stationAvailability]);

    const stationsWithData = useMemo(() => {
        return new Set(rainfallData.map(d => d.stationId).filter(Boolean) as string[]);
    }, [rainfallData]);

    const handleDownloadSingleCSV = (station: Station) => {
        const stationData = rainfallData.filter(d => d.stationId === station.id);
        if (stationData.length > 0) downloadCSV([station], stationData, selectedDataTypes);
    };

    const handleDownloadSingleSWMM = (station: Station) => {
        const stationData = rainfallData.filter(d => d.stationId === station.id);
        if (stationData.length > 0) downloadSWMM([station], stationData, selectedDataTypes);
    };

    const handleFetchData = async () => {
        if (selectedStations.length === 0) return;
        if (!dataSource) {
            alert("Please configure your data provider in Settings first.");
            return;
        }

        setLoading(true);
        const taskId = 'fetch-rain-batch';
        setStatusTasks(prev => prev.filter(t => !t.id.startsWith('err-')));
        setStatusTasks(prev => [...prev, { id: taskId, message: `Downloading data for ${selectedStations.length} stations...`, status: 'pending' }]);

        const fetchStationData = async (station: Station) => {
            try {
                const data = await dataSource.fetchData({
                    stationIds: [station.id],
                    startDate: dateRange.start,
                    endDate: dateRange.end,
                    units: preferences.units,
                    datatypes: selectedDataTypes,
                    datasetId,
                    hrrrOptions
                });
                return { success: true, station, data };
            } catch (error: any) {
                let msg = error.message || 'Unknown error';
                if (error.response) {
                    msg = `HTTP ${error.response.status}`;
                } else if (error.code === 'ECONNABORTED') {
                    msg = 'Timeout';
                }
                return { success: false, station, error: msg };
            }
        };

        const results = await Promise.all(selectedStations.map(fetchStationData));

        const successfulData = results
            .filter((r): r is { success: true, station: Station, data: UnifiedTimeSeries[] } => r.success)
            .flatMap(r => r.data);

        const errors = results
            .filter((r): r is { success: false, station: Station, error: string } => !r.success);

        setRainfallData(successfulData);

        if (errors.length === 0) {
            setStatusTasks(prev => prev.map(t => t.id === taskId ? {
                ...t,
                message: `Loaded ${successfulData.length} records from ${selectedStations.length} stations`,
                status: 'success'
            } : t));
            setTimeout(() => setStatusTasks(prev => prev.filter(t => t.id !== taskId)), 3000);

            setLastFetchedParams({
                stationIds: selectedStations.map(s => s.id).sort(),
                dateRange: { ...dateRange },
                dataTypes: [...selectedDataTypes].sort(),
                datasetId,
                providerId: preferences.providerId,
                hrrrOptions,
                timestamp: Date.now()
            });

        } else {
            const successCount = results.length - errors.length;
            const summaryMsg = successCount > 0
                ? `Partial Success: ${successCount} ok, ${errors.length} failed.`
                : `Failed to download data for all ${errors.length} stations.`;

            setStatusTasks(prev => prev.map(t => t.id === taskId ? {
                ...t,
                message: summaryMsg,
                status: 'error'
            } : t));

            if (successfulData.length > 0) {
                setLastFetchedParams({
                    stationIds: selectedStations.map(s => s.id).sort(),
                    dateRange: { ...dateRange },
                    dataTypes: [...selectedDataTypes].sort(),
                    datasetId,
                    providerId: preferences.providerId,
                    hrrrOptions,
                    timestamp: Date.now()
                });
            }

            const MAX_ERRORS_SHOWN = 5;
            const displayedErrors = errors.slice(0, MAX_ERRORS_SHOWN);
            const newErrorTasks = displayedErrors.map(e => ({
                id: `err-${e.station.id}-${Date.now()}`,
                message: `${e.station.name}: ${e.error}`,
                status: 'error' as const
            }));

            if (errors.length > MAX_ERRORS_SHOWN) {
                newErrorTasks.push({
                    id: `err-more-${Date.now()}`,
                    message: `...and ${errors.length - MAX_ERRORS_SHOWN} more errors.`,
                    status: 'error' as const
                });
            }

            setStatusTasks(prev => [...prev, ...newErrorTasks]);
            setTimeout(() => setStatusTasks(prev => prev.filter(t => t.id !== taskId)), 5000);
            setTimeout(() => setStatusTasks(prev => prev.filter(t => !t.id.startsWith('err-'))), 10000);
        }
        setLoading(false);
    };

    const toggleDataType = (typeId: string) => {
        setSelectedDataTypes(prev =>
            prev.includes(typeId)
                ? (prev.filter(t => t !== typeId).length > 0 ? prev.filter(t => t !== typeId) : defaultDataTypes)
                : [...new Set([...prev, typeId])]
        );
    };

    const fetchStatus = useMemo(() => {
        if (!lastFetchedParams) return 'idle';
        if (rainfallData.length === 0) return 'empty';

        const currentIds = selectedStations.map(s => s.id).sort();
        const prevIds = lastFetchedParams.stationIds;
        const stationsChanged = JSON.stringify(currentIds) !== JSON.stringify(prevIds);
        const dateChanged = dateRange.start !== lastFetchedParams.dateRange.start ||
            dateRange.end !== lastFetchedParams.dateRange.end;
        const typesChanged = JSON.stringify([...selectedDataTypes].sort()) !== JSON.stringify(lastFetchedParams.dataTypes);
        const datasetChanged = datasetId !== lastFetchedParams.datasetId;
        const providerChanged = preferences.providerId !== lastFetchedParams.providerId;
        const hrrrChanged = JSON.stringify(hrrrOptions ?? null) !== JSON.stringify(lastFetchedParams.hrrrOptions ?? null);

        if (stationsChanged || dateChanged || typesChanged || datasetChanged || providerChanged || hrrrChanged) {
            return 'stale';
        }
        return 'fresh';
    }, [rainfallData, lastFetchedParams, selectedStations, dateRange, selectedDataTypes, datasetId, preferences.providerId, hrrrOptions]);

    const dateConstraints = useMemo(() => {
        if (selectedStations.length === 0) return { min: undefined, max: undefined };
        const starts: Date[] = [];
        const ends: Date[] = [];

        selectedStations.forEach(s => {
            const avail = stationAvailability[s.id];
            if (avail && avail.length > 0) {
                avail.forEach(a => {
                    if (a.mindate) starts.push(new Date(a.mindate));
                    if (a.maxdate) ends.push(new Date(a.maxdate));
                });
            } else {
                if (s.mindate) starts.push(new Date(s.mindate));
                if (s.maxdate) ends.push(new Date(s.maxdate));
            }
        });

        if (starts.length === 0) return { min: undefined, max: undefined };
        const minDate = starts.reduce((a, b) => a < b ? a : b);
        const maxDate = ends.reduce((a, b) => a > b ? a : b);

        return {
            min: minDate.toISOString().split('T')[0],
            max: maxDate.toISOString().split('T')[0]
        };
    }, [selectedStations, stationAvailability]);

    const hasData = rainfallData.length > 0;


    return (
        <div className={cn(
            "flex flex-col bg-background p-4 md:p-6 md:pb-8 gap-6 h-full w-full",
            stations.length > 0 ? "overflow-y-auto" : "overflow-hidden" // minor fix for layout
        )}>
            <StatusCenter tasks={statusTasks} />

            {/* Main Content Area - Flex Logic for Animations */}
            <div className={cn(
                "flex flex-col lg:flex-row gap-6 relative transition-[height]",
                stations.length > 0 ? "h-[75vh] shrink-0" : "flex-1 min-h-0"
            )}>

                {/* Left Column: Search & Map */}
                <div
                    className={cn(
                        "flex flex-col gap-4 overflow-hidden transition-all duration-700 ease-in-out h-full min-h-0 relative",
                        viewMode === 'discovery' ? "lg:w-[45%] opacity-100 scale-100" : "lg:w-[15%] opacity-40 hover:opacity-100 cursor-pointer"
                    )}
                    onClick={() => {
                        if (viewMode === 'configuration') setViewMode('discovery');
                    }}
                >
                    {/* Overlay for Show Map */}
                    {viewMode === 'configuration' && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/10 backdrop-blur-[1px] hover:backdrop-blur-none transition-all">
                            <div className="bg-primary/90 text-primary-foreground px-4 py-2 rounded-full font-medium shadow-lg transform -rotate-90 lg:rotate-0 whitespace-nowrap flex items-center gap-2 hover:scale-105 transition-transform">
                                <SearchIcon className="h-4 w-4 rotate-90 lg:rotate-0" /> Show Map
                            </div>
                        </div>
                    )}

                    <div className={cn("flex flex-col gap-4 h-full", viewMode === 'configuration' && "pointer-events-none")}>
                        <section className="flex-none bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">

                            <StationSearch
                                query={searchQuery}
                                onQueryChange={setSearchQuery}
                                onSearch={() => performTextSearch(searchQuery)}
                                onLocationSearch={handleLocationClick}
                                loading={searchLoading}
                                disabled={searchLoading || !dataSource}
                                showTokenWarning={!activeCredentials?.token && providerCapabilities?.requiresApiKey === true}
                                datasetId={datasetId}
                                onDatasetChange={setDatasetId}
                                datasetOptions={datasetOptions}
                                providerId={preferences.providerId}
                                onProviderChange={(val) => setProvider(val as any)}
                                providerOptions={listProviders()}
                            />
                        </section>

                        <div className="flex-1 min-h-[200px] border border-border rounded-xl overflow-hidden shadow-sm relative">
                            <StationMap
                                stations={stations}
                                selectedStations={selectedStations}
                                onToggleStation={toggleStation}
                                center={mapCenter}
                            />
                        </div>
                    </div>
                </div>

                {/* Middle Column: Lists */}
                {/* Always visible but resizes */}
                <div
                    className={cn(
                        "flex flex-col gap-4 overflow-hidden transition-all duration-700 ease-in-out",
                        viewMode === 'discovery' ? "lg:w-[35%]" : "lg:w-[25%]"
                    )}
                >
                    {/* Found Stations List */}
                    <div className="flex-1 min-h-0 border border-border rounded-xl overflow-hidden shadow-sm flex flex-col bg-card">
                        <StationList
                            stations={stations}
                            selectedStations={selectedStations}
                            onToggleStation={toggleStation}
                            dataSource={dataSource}
                        />
                    </div>
                </div>

                {/* Right Column: Query Parameters */}
                <div
                    className={cn(
                        "flex flex-col gap-4 overflow-hidden transition-all duration-700 ease-in-out shadow-xl h-full min-h-0 rounded-xl",
                        viewMode === 'discovery' ? "lg:w-[20%]" : "lg:w-[60%]"
                    )}
                >
                    <section
                        className={cn(
                            "relative flex-1 bg-card border border-border rounded-xl shadow-sm flex flex-col overflow-hidden transition-colors",
                            viewMode === 'discovery' && "bg-muted/30 border-dashed cursor-pointer hover:bg-muted/50 hover:border-primary/50"
                        )}
                        onClick={() => {
                            if (viewMode === 'discovery') setViewMode('configuration');
                        }}
                    >
                        {viewMode === 'discovery' && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-[1px] opacity-0 hover:opacity-100 transition-opacity duration-300">
                                <span className="px-4 py-2 bg-primary text-primary-foreground rounded-full shadow-lg font-medium transform scale-100 hover:scale-105 transition-transform">
                                    Configure Data &rarr;
                                </span>
                            </div>
                        )}

                        <div className={cn(
                            "flex-1 overflow-y-auto p-5 space-y-6 transition-opacity",
                            viewMode === 'discovery' ? "opacity-40 pointer-events-none" : "opacity-100"
                        )}>
                            <div className="flex justify-between items-center">
                                <h2 className="font-semibold text-lg flex items-center gap-2">
                                    {viewMode === 'configuration' && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setViewMode('discovery'); }}
                                            className="p-1 hover:bg-muted rounded-full mr-2 transition-colors"
                                            title="Back to Map"
                                        >
                                            <SearchIcon className="h-4 w-4" />
                                        </button>
                                    )}
                                    Query Parameters
                                </h2>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-4">
                                    {preferences.providerId === 'hrrr' && (
                                        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-sm font-semibold">HRRR Controls</p>
                                                    <p className="text-xs text-muted-foreground">Configure grid product options.</p>
                                                </div>
                                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Model Grid</span>
                                            </div>

                                            <div className="grid gap-3">
                                                <label className="text-xs font-medium text-muted-foreground">Product Type</label>
                                                <select
                                                    value={hrrrProductType}
                                                    onChange={(e) => setHrrrProductType(e.target.value as typeof hrrrProductType)}
                                                    className="px-3 py-2 rounded-md border border-input bg-background text-sm"
                                                >
                                                    <option value="analysis">Analysis (0h)</option>
                                                    <option value="forecast">Forecast</option>
                                                </select>

                                                <label className="text-xs font-medium text-muted-foreground">Forecast Lead Hours</label>
                                                <select
                                                    value={hrrrForecastHour}
                                                    onChange={(e) => setHrrrForecastHour(Number(e.target.value))}
                                                    disabled={hrrrProductType === 'analysis'}
                                                    className="px-3 py-2 rounded-md border border-input bg-background text-sm disabled:opacity-60"
                                                >
                                                    {[0, 1, 2, 3, 6, 9, 12, 15, 18].map(hour => (
                                                        <option key={hour} value={hour}>
                                                            {hour} hour{hour === 1 ? '' : 's'}
                                                        </option>
                                                    ))}
                                                </select>

                                                <label className="text-xs font-medium text-muted-foreground">Aggregation Window (hours)</label>
                                                <select
                                                    value={hrrrAggregationWindowHours}
                                                    onChange={(e) => setHrrrAggregationWindowHours(Number(e.target.value))}
                                                    className="px-3 py-2 rounded-md border border-input bg-background text-sm"
                                                >
                                                    {[1, 3, 6, 12].map(hour => (
                                                        <option key={hour} value={hour}>
                                                            {hour} hour{hour === 1 ? '' : 's'}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Selected Stations (Merged into Timeline) */}
                                {/* The original separate list is removed as requested */}

                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm font-medium mb-1 block">Date Range</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="date"
                                                value={dateRange.start}
                                                min={dateConstraints.min}
                                                max={dateConstraints.max}
                                                onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))}
                                                className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                                            />
                                            <input
                                                type="date"
                                                value={dateRange.end}
                                                min={dateConstraints.min}
                                                max={dateConstraints.max}
                                                onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))}
                                                className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                                            />
                                        </div>
                                        {dateConstraints.min && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Available: {dateConstraints.min} to {dateConstraints.max}
                                            </p>
                                        )}
                                    </div>

                                    {/* AvailabilityTimeline with Integrated Station List */}
                                    <div className="w-full h-full overflow-hidden">
                                        {selectedStations.length > 0 ? (
                                            <AvailabilityTimeline
                                                stations={selectedStations}
                                                availability={stationAvailability}
                                                loading={availabilityLoading}
                                                selectedStart={dateRange.start}
                                                selectedEnd={dateRange.end}
                                                onRangeChange={(start, end) => setDateRange({ start, end })}
                                                onRemoveStation={(station) => toggleStation(station)}
                                                onDownloadCSV={handleDownloadSingleCSV}
                                                onDownloadSWMM={handleDownloadSingleSWMM}
                                                stationsWithData={stationsWithData}
                                                selectedDataTypes={selectedDataTypes}
                                                onToggleDataType={toggleDataType}
                                            />
                                        ) : (
                                            <div className="py-8 flex items-center justify-center text-muted-foreground text-xs italic border border-border/50 border-dashed rounded-xl bg-muted/20">
                                                Select stations to view timeline
                                            </div>
                                        )}
                                    </div>
                                </div>


                                <div>
                                    <label className="text-sm font-medium mb-1 block">Display Units</label>
                                    <div className="flex bg-muted p-1 rounded-lg">
                                        <button
                                            onClick={() => setUnits('standard')}
                                            className={cn(
                                                "flex-1 py-1.5 text-sm rounded-md transition-all",
                                                preferences.units === 'standard' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            Standard (in)
                                        </button>
                                        <button
                                            onClick={() => setUnits('metric')}
                                            className={cn(
                                                "flex-1 py-1.5 text-sm rounded-md transition-all",
                                                preferences.units === 'metric' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            Metric (mm)
                                        </button>
                                    </div>
                                </div>

                            </div>


                        </div>

                        <div className={cn(
                            "p-5 bg-card border-t border-border z-10 shrink-0 flex items-center gap-3 transition-opacity",
                            viewMode === 'discovery' ? "opacity-40 pointer-events-none" : "opacity-100"
                        )}>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleFetchData(); }}
                                disabled={selectedStations.length === 0 || loading}
                                className={cn(
                                    "py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all flex justify-center items-center gap-2 shadow-lg shadow-primary/25",
                                    hasData ? "w-auto px-6 whitespace-nowrap" : "flex-1"
                                )}
                            >
                                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Download className="h-4 w-4" />}
                                <span className="whitespace-nowrap">Fetch Data</span>
                            </button>

                            <div className={cn(
                                "flex gap-2 overflow-hidden transition-all duration-500 ease-in-out",
                                hasData ? "w-auto opacity-100" : "w-0 flex-none opacity-0"
                            )}>
                                <button
                                    onClick={(e) => { e.stopPropagation(); downloadCSV(selectedStations, rainfallData, selectedDataTypes); }}
                                    className="flex-1 max-w-[160px] px-3 py-2 border border-border bg-background hover:bg-accent text-accent-foreground text-xs font-medium rounded-lg transition-colors flex flex-col justify-center items-center gap-1.5 whitespace-normal text-center h-auto leading-tight"
                                    aria-label="Download CSV for selected stations"
                                    title="Download CSV for selected stations"
                                >
                                    <Download className="h-4 w-4 shrink-0" />
                                    <span>Download CSV</span>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); downloadSWMM(selectedStations, rainfallData, selectedDataTypes); }}
                                    className="flex-1 max-w-[160px] px-3 py-2 border border-border bg-background hover:bg-accent text-accent-foreground text-xs font-medium rounded-lg transition-colors flex flex-col justify-center items-center gap-1.5 whitespace-normal text-center h-auto leading-tight"
                                    aria-label="Download SWMM .dat for selected stations"
                                    title="Download SWMM .dat for selected stations"
                                >
                                    <Download className="h-4 w-4 shrink-0" />
                                    <span>Download SWMM</span>
                                </button>
                            </div>

                            {/* Notification Box */}
                            {fetchStatus !== 'idle' && (
                                <div className={cn(
                                    "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border shadow-sm transition-all animate-in fade-in zoom-in duration-300 min-w-0",
                                    fetchStatus === 'fresh' && "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800",
                                    fetchStatus === 'stale' && "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800",
                                    fetchStatus === 'empty' && "bg-muted text-muted-foreground border-border"
                                )}>
                                    <div className={cn(
                                        "w-2 h-2 rounded-full shrink-0",
                                        fetchStatus === 'fresh' && "bg-emerald-500 animate-pulse",
                                        fetchStatus === 'stale' && "bg-amber-500",
                                        fetchStatus === 'empty' && "bg-gray-400"
                                    )} />
                                    <div className="flex flex-col leading-none overflow-hidden text-center">
                                        <span className="font-bold truncate">
                                            {fetchStatus === 'fresh' && "Data Ready"}
                                            {fetchStatus === 'stale' && "Update Needed"}
                                            {fetchStatus === 'empty' && "No Results"}
                                        </span>
                                        {fetchStatus === 'fresh' && <span className="text-[10px] opacity-80 mt-0.5 truncate">Graphs updated below &darr;</span>}
                                        {fetchStatus === 'stale' && <span className="text-[10px] opacity-80 mt-0.5 truncate">Parameters changed</span>}
                                        {fetchStatus === 'empty' && <span className="text-[10px] opacity-80 mt-0.5 truncate">Try different dates</span>}
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </div>

            {/* Bottom Section - Only Charts now */}
            {hasData && (
                <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-10 fade-in duration-700 pt-4 border-t">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-xl font-semibold">Rainfall Analysis</h2>
                        <span className="text-xs text-muted-foreground">{rainfallData.length} records loaded</span>
                    </div>

                    {/* Rainfall Charts - Stacked by Parameter */}
                    <div className="flex flex-col gap-6 mb-12">
                        {Array.from(new Set(rainfallData.map(d => d.parameter || 'PRCP'))).map(dtype => {
                            const chartData = rainfallData.filter(d => (d.parameter || 'PRCP') === dtype);
                            const stationIds = new Set(chartData.map(d => d.stationId));
                            const relevantStations = selectedStations.filter(s => stationIds.has(s.id));

                            // Get friendly name
                            const typeInfo = availableDataTypes.find(t => t.id === dtype);
                            const copyTitle = typeInfo ? `${typeInfo.name} (${dtype})` : dtype;

                            return (
                                <RainfallChart
                                    key={dtype}
                                    data={chartData}
                                    units={preferences.units}
                                    stations={relevantStations}
                                    title={copyTitle}
                                />
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
