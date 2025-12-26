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

    return (
        <div className="flex flex-col min-h-screen bg-background p-4 md:p-6 gap-6">
            <StatusCenter tasks={statusTasks} />

            {/* Top Grid Section */}
            {/* Use fixed height on large screens to force internal scrolling, stack on mobile */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[70vh] min-h-[600px]">

                {/* Left Column: Search & Map */}
                <div className="flex flex-col gap-4 h-full overflow-hidden">
                    <section className="flex-none bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
                        <h2 className="font-semibold text-lg flex items-center gap-2">
                            <SearchIcon className="h-4 w-4 text-primary" /> Find Stations
                        </h2>
                        <StationSearch
                            dataSource={dataSource}
                            capabilities={providerCapabilities}
                            onStationsFound={handleStationsFound}
                        />
                    </section>

                    <div className="flex-1 min-h-[300px] border border-border rounded-xl overflow-hidden shadow-sm relative">
                        <StationMap
                            stations={stations}
                            selectedStations={selectedStations}
                            onToggleStation={toggleStation}
                            center={mapCenter}
                        />
                    </div>
                </div>

                {/* Middle Column: Lists */}
                <div className="flex flex-col gap-4 h-full overflow-hidden">
                    {/* Found Stations List */}
                    <div className="flex-1 min-h-0 border border-border rounded-xl overflow-hidden shadow-sm flex flex-col">
                        <StationList
                            stations={stations}
                            selectedStations={selectedStations}
                            onToggleStation={toggleStation}
                            dataSource={dataSource}
                        />
                    </div>


                </div>

                {/* Right Column: Query Parameters */}
                <div className="flex flex-col gap-4 h-full overflow-hidden">
                    <section className="flex-1 bg-card border border-border rounded-xl shadow-sm flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            <h2 className="font-semibold text-lg">Query Parameters</h2>
                            <div className="space-y-4">
                                {/* Selected Stations (Compact) */}
                                <div className="border border-border rounded-lg p-3 bg-card/50">
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-sm font-medium">Selected Stations ({selectedStations.length})</label>
                                        <button
                                            onClick={() => setSelectedStations([])}
                                            className="text-[10px] text-muted-foreground hover:text-foreground bg-muted/50 px-2 py-0.5 rounded"
                                        >
                                            Clear
                                        </button>
                                    </div>

                                    <ul className="space-y-1 max-h-[150px] overflow-y-auto pr-1">
                                        {selectedStations.length === 0 ? (
                                            <li className="text-xs text-muted-foreground italic text-center py-2">No stations selected</li>
                                        ) : (
                                            selectedStations.map(s => {
                                                const hasData = stationsWithData.has(s.id);
                                                return (
                                                    <li key={s.id} className="flex justify-between items-center text-xs p-1.5 bg-background rounded border border-border group hover:border-primary/50 transition-colors">
                                                        <div className="overflow-hidden flex-1 min-w-0 mr-2">
                                                            <div className="font-medium truncate leading-tight" title={s.name}>{s.name}</div>
                                                            <div className="text-[10px] text-muted-foreground leading-tight">{s.id}</div>
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {selectedDataTypes.map(typeId => {
                                                                    const isAvailable = stationAvailability[s.id]?.some(dt => dt.id === typeId);
                                                                    if (!isAvailable) return null;
                                                                    return (
                                                                        <span
                                                                            key={typeId}
                                                                            className="px-1 py-0.5 rounded-[2px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[9px] font-mono border border-emerald-200 dark:border-emerald-800 leading-none"
                                                                            title={`${typeId} is available`}
                                                                        >
                                                                            {typeId}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            {hasData && (
                                                                <div className="flex gap-1">
                                                                    <button
                                                                        onClick={() => handleDownloadSingleCSV(s)}
                                                                        className="px-1.5 py-0.5 text-[10px] bg-primary text-primary-foreground border border-primary rounded hover:bg-primary/90 transition-colors font-medium shadow-sm"
                                                                        title="Download CSV"
                                                                    >
                                                                        CSV
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDownloadSingleSWMM(s)}
                                                                        className="px-1.5 py-0.5 text-[10px] bg-primary text-primary-foreground border border-primary rounded hover:bg-primary/90 transition-colors font-medium shadow-sm"
                                                                        title="Download .dat"
                                                                    >
                                                                        DAT
                                                                    </button>
                                                                </div>
                                                            )}
                                                            <button
                                                                onClick={() => toggleStation(s)}
                                                                className="text-muted-foreground hover:text-red-500 hover:bg-red-50 p-0.5 rounded transition-all opacity-60 group-hover:opacity-100"
                                                                title="Remove"
                                                            >
                                                                &times;
                                                            </button>
                                                        </div>
                                                    </li>
                                                );
                                            })
                                        )}
                                    </ul>
                                </div>

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

                                {/* Data Types Selector */}
                                <div>
                                    <label className="text-sm font-medium mb-1 block">Data Types</label>
                                    {availableDataTypes.length > 0 ? (
                                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 text-sm">
                                            {availableDataTypes.map(dt => (
                                                <label key={dt.id} className="flex items-start gap-2 border p-2 rounded-md cursor-pointer hover:bg-accent min-h-[40px]">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedDataTypes.includes(dt.id)}
                                                        onChange={() => toggleDataType(dt.id)}
                                                        className="mt-0.5 rounded border-gray-300 text-primary focus:ring-primary shrink-0"
                                                    />
                                                    <span className="text-xs whitespace-normal leading-tight break-words">
                                                        {dt.name || dt.id} ({dt.id})
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-sm text-muted-foreground italic border border-dashed p-4 rounded-md text-center">
                                            Select stations to see available data types
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="text-sm font-medium mb-1 block">Units</label>
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

                            {rainfallData.length > 0 && selectedStations.length > 0 && (
                                <div className="pt-4 mt-6 border-t border-border space-y-3">
                                    <h3 className="font-semibold text-sm">Export Options</h3>
                                    <div className="grid grid-cols-1 gap-3">
                                        <button
                                            onClick={() => downloadCSV(selectedStations, rainfallData)}
                                            className="w-full py-2 px-4 border border-border hover:bg-accent rounded-lg text-sm font-medium transition-colors text-center"
                                        >
                                            Download Single .csv
                                        </button>
                                        <button
                                            onClick={() => downloadSWMM(selectedStations, rainfallData)}
                                            className="w-full py-2 px-4 border border-border hover:bg-accent rounded-lg text-sm font-medium transition-colors text-center"
                                        >
                                            Download Single .dat
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-5 bg-card border-t border-border z-10 shrink-0">
                            <button
                                onClick={handleFetchData}
                                disabled={selectedStations.length === 0 || loading}
                                className="w-full py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all flex justify-center items-center gap-2 shadow-lg shadow-primary/25"
                            >
                                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Download className="h-4 w-4" />}
                                Fetch Data
                            </button>
                        </div>
                    </section>
                </div>
            </div>

            {/* Bottom Section */}
            <div className="flex flex-col gap-6">
                {/* Availability Timeline */}
                <div className="w-full">
                    {selectedStations.length > 0 ? (
                        <AvailabilityTimeline
                            stations={selectedStations}
                            availability={stationAvailability}
                            loading={availabilityLoading}
                            selectedStart={dateRange.start}
                            selectedEnd={dateRange.end}
                            onRangeChange={(start, end) => setDateRange({ start, end })}
                        />
                    ) : (
                        <div className="py-8 border border-border border-dashed rounded-xl flex items-center justify-center text-muted-foreground text-sm bg-muted/20">
                            Select stations to view data availability timeline
                        </div>
                    )}
                </div>

                {/* Rainfall Charts - Stacked by Datatype */}
                <div className="flex flex-col gap-6 min-h-[400px]">
                    {rainfallData.length > 0 ? (
                        Array.from(new Set(rainfallData.map(d => d.datatype || 'PRCP'))).map(dtype => {
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
                        })
                    ) : (
                        <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground border-dashed">
                            No data loaded. Select stations and click "Fetch Rainfall Data".
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
