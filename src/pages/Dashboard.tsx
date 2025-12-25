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

    const dataSource = useMemo<DataSource | null>(
        () => createProvider(preferences.providerId, { apiKey: preferences.apiKey }),
        [preferences.apiKey, preferences.providerId]
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

    const handleFetchData = async () => {
        if (selectedStations.length === 0) return;
        if (!dataSource) {
            alert("Please configure your data provider in Settings first.");
            return;
        }

        setLoading(true);
        setStatusTasks(prev => [...prev, { id: 'fetch-rain', message: 'Downloading rainfall data...', status: 'pending' }]);

        try {
            const data = await dataSource.fetchData({
                stationIds: selectedStations.map(s => s.id),
                startDate: dateRange.start,
                endDate: dateRange.end,
                units: preferences.units,
                datatypes: selectedDataTypes
            });
            setRainfallData(data);
            setStatusTasks(prev => prev.map(t => t.id === 'fetch-rain' ? { ...t, message: `Loaded ${data.length} records`, status: 'success' } : t));
        } catch (e) {
            console.error(e);
            setStatusTasks(prev => prev.map(t => t.id === 'fetch-rain' ? { ...t, message: 'Failed to download data', status: 'error' } : t));
        } finally {
            setLoading(false);
            setTimeout(() => setStatusTasks(prev => prev.filter(t => t.id !== 'fetch-rain')), 3000);
        }
    };

    const toggleDataType = (typeId: string) => {
        setSelectedDataTypes(prev =>
            prev.includes(typeId)
                ? prev.filter(t => t !== typeId)
                : [...prev, typeId]
        );
    };

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

                    {/* Selected Stations Persistent List */}
                    <section className="flex-none h-1/3 min-h-[200px] bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col gap-3 overflow-hidden">
                        <div className="flex justify-between items-center flex-none">
                            <h2 className="font-semibold text-lg">Selected Stations ({selectedStations.length})</h2>
                            <button
                                onClick={() => setSelectedStations([])}
                                className="text-xs text-muted-foreground hover:text-foreground"
                            >
                                Clear All
                            </button>
                        </div>
                        <ul className="space-y-2 overflow-y-auto pr-2 flex-1">
                            {selectedStations.length === 0 ? (
                                <li className="text-sm text-muted-foreground italic text-center py-4">No stations selected</li>
                            ) : (
                                selectedStations.map(s => (
                                    <li key={s.id} className="flex justify-between items-center text-sm p-2 bg-muted rounded-md border border-border">
                                        <div className="overflow-hidden">
                                            <div className="font-medium truncate" title={s.name}>{s.name}</div>
                                            <div className="text-xs text-muted-foreground">{s.id}</div>
                                        </div>
                                        <button
                                            onClick={() => toggleStation(s)}
                                            className="text-muted-foreground hover:text-red-500 ml-2"
                                            title="Remove"
                                        >
                                            &times;
                                        </button>
                                    </li>
                                ))
                            )}
                        </ul>
                    </section>
                </div>

                {/* Right Column: Query Parameters */}
                <div className="flex flex-col gap-4 h-full overflow-hidden">
                    <section className="flex-1 bg-card border border-border rounded-xl p-5 shadow-sm space-y-4 overflow-y-auto">
                        <h2 className="font-semibold text-lg">Query Parameters</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-sm font-medium mb-1 block">Date Range</label>
                                <div className="flex gap-2">
                                    <input
                                        type="date"
                                        value={dateRange.start}
                                        onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))}
                                        className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                                    />
                                    <input
                                        type="date"
                                        value={dateRange.end}
                                        onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))}
                                        className="flex-1 px-3 py-2 rounded-md border border-input bg-background text-sm"
                                    />
                                </div>
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

                            <button
                                onClick={handleFetchData}
                                disabled={selectedStations.length === 0 || loading}
                                className="w-full py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all flex justify-center items-center gap-2 shadow-lg shadow-primary/25 mt-4"
                            >
                                {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Download className="h-4 w-4" />}
                                Fetch Rainfall Data
                            </button>
                        </div>

                        {rainfallData.length > 0 && selectedStations.length > 0 && (
                            <div className="pt-4 mt-6 border-t border-border space-y-3">
                                <h3 className="font-semibold text-sm">Export Options</h3>
                                <div className="grid grid-cols-1 gap-3">
                                    <button
                                        onClick={() => downloadCSV(selectedStations, rainfallData)}
                                        className="w-full py-2 px-4 border border-border hover:bg-accent rounded-lg text-sm font-medium transition-colors text-center"
                                    >
                                        Download .csv
                                    </button>
                                    <button
                                        onClick={() => downloadSWMM(selectedStations, rainfallData)}
                                        className="w-full py-2 px-4 border border-border hover:bg-accent rounded-lg text-sm font-medium transition-colors text-center"
                                    >
                                        Download SWMM .dat
                                    </button>
                                </div>
                            </div>
                        )}
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
                        />
                    ) : (
                        <div className="py-8 border border-border border-dashed rounded-xl flex items-center justify-center text-muted-foreground text-sm bg-muted/20">
                            Select stations to view data availability timeline
                        </div>
                    )}
                </div>

                {/* Rainfall Chart */}
                <div className="min-h-[400px]">
                    <RainfallChart data={rainfallData} units={preferences.units} />
                </div>
            </div>
        </div>
    );
}
