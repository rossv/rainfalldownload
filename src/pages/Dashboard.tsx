import { useState, useMemo, useEffect } from 'react';

import { StationMap } from '../components/StationMap';
import { StationList } from '../components/StationList';
import { StationSearch } from '../components/StationSearch';
import { RainfallChart } from '../components/RainfallChart';
import { createProvider, getProviderCapabilities } from '../services/providers';
import type { Station, RainfallData, DataSource } from '../types';
import { downloadCSV, downloadSWMM } from '../lib/export';
import { Loader2, Download, Search as SearchIcon } from 'lucide-react';
import { AvailabilityTimeline } from '../components/AvailabilityTimeline';
import { StatusCenter } from '../components/StatusCenter';
import { cn } from '../lib/utils';
import { usePreferences } from '../hooks/usePreferences';

export function Dashboard() {
    const { preferences, setUnits } = usePreferences();

    const [stations, setStations] = useState<Station[]>([]);
    const [selectedStations, setSelectedStations] = useState<Station[]>([]);
    const [rainfallData, setRainfallData] = useState<RainfallData[]>([]);
    const [dateRange, setDateRange] = useState({ start: '2023-01-01', end: '2023-12-31' });
    const [loading, setLoading] = useState(false);
    const [mapCenter, setMapCenter] = useState<[number, number] | undefined>(undefined);

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

    // Track the parameters used for the last successful fetch to determine "staleness"
    const [lastFetchedParams, setLastFetchedParams] = useState<{
        stationIds: string[];
        dateRange: { start: string; end: string };
        dataTypes: string[];
        timestamp: number;
    } | null>(null);

    // Fetch availability when selected stations change
    useEffect(() => {
        if (!dataSource) return;

        const fetchAvailability = async () => {
            const newTasks: { id: string, message: string, status: 'pending' | 'success' | 'error' }[] = [];

            for (const station of selectedStations) {
                if (stationAvailability[station.id] !== undefined || availabilityLoading[station.id]) continue;

                // Add task
                const taskId = `fetch-avail-${station.id}`;
                newTasks.push({ id: taskId, message: `Checking data for ${station.name}...`, status: 'pending' });

                // Set granular loading
                setAvailabilityLoading(prev => ({ ...prev, [station.id]: true }));

                try {
                    const result = await dataSource.getAvailableDataTypes(station.id);

                    // Clamp datatype dates to station's overall valid range
                    // This fixes the issue where NOAA API returns global dataset dates (e.g. 1781) for individual datatypes
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

                    // Remove success task after a delay
                    setTimeout(() => {
                        setStatusTasks(prev => prev.filter(t => t.id !== taskId));
                    }, 3000);

                } catch (e) {
                    console.error(e);
                    setStatusTasks(prev => prev.map(t =>
                        t.id === taskId ? { ...t, status: 'error', message: `No data found for ${station.name}` } : t
                    ));
                    setStationAvailability(prev => ({ ...prev, [station.id]: [] })); // Mark as checked but empty
                } finally {
                    setAvailabilityLoading(prev => ({ ...prev, [station.id]: false }));
                }
            }

            if (newTasks.length > 0) {
                setStatusTasks(prev => [...prev, ...newTasks]);
            }
        };

        fetchAvailability();
    }, [selectedStations, dataSource, stationAvailability, availabilityLoading]);

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
        if (stationData.length > 0) downloadCSV([station], stationData);
    };

    const handleDownloadSingleSWMM = (station: Station) => {
        const stationData = rainfallData.filter(d => d.stationId === station.id);
        if (stationData.length > 0) downloadSWMM([station], stationData);
    };

    const handleFetchData = async () => {
        if (selectedStations.length === 0) return;
        if (!dataSource) {
            alert("Please configure your data provider in Settings first.");
            return;
        }

        setLoading(true);
        const taskId = 'fetch-rain-batch';
        // Clear old specific error tasks if any
        setStatusTasks(prev => prev.filter(t => !t.id.startsWith('err-')));
        setStatusTasks(prev => [...prev, { id: taskId, message: `Downloading data for ${selectedStations.length} stations...`, status: 'pending' }]);

        const fetchStationData = async (station: Station) => {
            try {
                // We fetch one by one to isolate errors
                const data = await dataSource.fetchData({
                    stationIds: [station.id],
                    startDate: dateRange.start,
                    endDate: dateRange.end,
                    units: preferences.units,
                    datatypes: selectedDataTypes
                });
                return { success: true, station, data };
            } catch (error: any) {
                let msg = error.message || 'Unknown error';
                // enhance error message if possible
                if (error.response) {
                    msg = `HTTP ${error.response.status}`;
                    if (error.response.statusText) msg += ` ${error.response.statusText}`;
                } else if (error.code === 'ECONNABORTED') {
                    msg = 'Timeout';
                }
                return { success: false, station, error: msg };
            }
        };

        const results = await Promise.all(selectedStations.map(fetchStationData));

        const successfulData = results
            .filter((r): r is { success: true, station: Station, data: RainfallData[] } => r.success)
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

            // Update last fetched params on full success
            setLastFetchedParams({
                stationIds: selectedStations.map(s => s.id).sort(),
                dateRange: { ...dateRange },
                dataTypes: [...selectedDataTypes].sort(),
                timestamp: Date.now()
            });

        } else {
            // Partial or full failure
            const successCount = results.length - errors.length;
            const summaryMsg = successCount > 0
                ? `Partial Success: ${successCount} ok, ${errors.length} failed.`
                : `Failed to download data for all ${errors.length} stations.`;

            setStatusTasks(prev => prev.map(t => t.id === taskId ? {
                ...t,
                message: summaryMsg,
                status: 'error'
            } : t));

            // If we got some data, still update the params so the UI shows "Data Ready" (even if partial)
            if (successfulData.length > 0) {
                setLastFetchedParams({
                    stationIds: selectedStations.map(s => s.id).sort(),
                    dateRange: { ...dateRange },
                    dataTypes: [...selectedDataTypes].sort(),
                    timestamp: Date.now()
                });
            }

            // Add detailed error tasks (limit to 5 to avoid spam)
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

            // Clear summary after 5s
            setTimeout(() => setStatusTasks(prev => prev.filter(t => t.id !== taskId)), 5000);

            // Clear detailed errors after 10s
            setTimeout(() => setStatusTasks(prev => prev.filter(t => !t.id.startsWith('err-'))), 10000);
        }
        setLoading(false);
    };

    const toggleDataType = (typeId: string) => {
        setSelectedDataTypes(prev =>
            prev.includes(typeId)
                ? prev.filter(t => t !== typeId)
                : [...prev, typeId]
        );
    };

    // Determine Fetch Status
    const fetchStatus = useMemo(() => {
        if (!lastFetchedParams) return 'idle';

        // 1. Check if we have data
        if (rainfallData.length === 0) return 'empty';

        // 2. Check if params have changed
        const currentIds = selectedStations.map(s => s.id).sort();
        const prevIds = lastFetchedParams.stationIds;
        const stationsChanged = JSON.stringify(currentIds) !== JSON.stringify(prevIds);

        const dateChanged = dateRange.start !== lastFetchedParams.dateRange.start ||
            dateRange.end !== lastFetchedParams.dateRange.end;

        const typesChanged = JSON.stringify([...selectedDataTypes].sort()) !== JSON.stringify(lastFetchedParams.dataTypes);

        if (stationsChanged || dateChanged || typesChanged) {
            return 'stale';
        }

        return 'fresh';
    }, [rainfallData, lastFetchedParams, selectedStations, dateRange, selectedDataTypes]);

    const dateConstraints = useMemo(() => {
        if (selectedStations.length === 0) return { min: undefined, max: undefined };

        // Collect all start and end dates from availability data if loaded, otherwise fall back to station metadata
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

        // Find overall min and max
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
            hasData ? "overflow-y-auto" : "overflow-hidden"
        )}>
            <StatusCenter tasks={statusTasks} />

            {/* Main Content Area - Flex Logic for Animations */}
            <div className={cn(
                "flex flex-col lg:flex-row gap-6 relative transition-[height]",
                hasData ? "h-[60vh] shrink-0" : "flex-1 min-h-0"
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
                                dataSource={dataSource}
                                capabilities={providerCapabilities}
                                onStationsFound={handleStationsFound}
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
                                    onClick={(e) => { e.stopPropagation(); downloadCSV(selectedStations, rainfallData); }}
                                    className="flex-1 px-4 py-3 border border-border bg-background hover:bg-accent text-accent-foreground font-medium rounded-lg transition-colors flex justify-center items-center gap-2 whitespace-nowrap"
                                >
                                    <Download className="h-4 w-4" /> Download Single .csv
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); downloadSWMM(selectedStations, rainfallData); }}
                                    className="flex-1 px-4 py-3 border border-border bg-background hover:bg-accent text-accent-foreground font-medium rounded-lg transition-colors flex justify-center items-center gap-2 whitespace-nowrap"
                                >
                                    <Download className="h-4 w-4" /> Download Single .dat
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

                    {/* Rainfall Charts - Stacked by Datatype */}
                    <div className="flex flex-col gap-6 mb-12">
                        {Array.from(new Set(rainfallData.map(d => d.datatype || 'PRCP'))).map(dtype => {
                            const chartData = rainfallData.filter(d => (d.datatype || 'PRCP') === dtype);
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
