import { useState } from 'react';
import type { Station, DataType, DataSource } from '../types';
import { ChevronDown, ChevronRight, Check, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface StationListProps {
    stations: Station[];
    selectedStations: Station[];
    onToggleStation: (station: Station) => void;
    dataSource: DataSource | null;
}

export function StationList({ stations, selectedStations, onToggleStation, dataSource }: StationListProps) {
    const [expandedStationId, setExpandedStationId] = useState<string | null>(null);
    const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
    const [stationDetails, setStationDetails] = useState<Record<string, DataType[]>>({});

    const isSelected = (id: string) => selectedStations.some(s => s.id === id);

    const toggleExpand = async (stationId: string) => {
        if (expandedStationId === stationId) {
            setExpandedStationId(null);
            return;
        }

        if (!dataSource) {
            alert('Configure your data provider in Settings to load station details.');
            return;
        }

        setExpandedStationId(stationId);

        // Fetch details if not already cached in local state
        if (!stationDetails[stationId]) {
            setLoadingDetails(stationId);
            try {
                const types = await dataSource.getAvailableDataTypes(stationId);
                setStationDetails(prev => ({ ...prev, [stationId]: types }));
            } catch (error) {
                console.error("Failed to fetch station details", error);
            } finally {
                setLoadingDetails(null);
            }
        }
    };

    if (stations.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 border border-dashed rounded-xl">
                <p>No stations found.</p>
                <p className="text-sm">Search for a city to see results.</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col border border-border rounded-xl bg-card overflow-hidden shadow-sm">
            <div className="overflow-auto flex-1">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground bg-muted sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-3 font-medium w-10"></th>
                            <th className="px-4 py-3 font-medium">Station Name</th>
                            <th className="px-4 py-3 font-medium w-32">ID</th>
                            <th className="px-4 py-3 font-medium w-24">Coverage</th>
                            <th className="px-4 py-3 font-medium w-48">Date Range</th>
                            <th className="px-4 py-3 font-medium w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {stations.filter(s => isSelected(s.id)).length > 0 && (
                            <>
                                <tr className="bg-muted/50 border-b-2 border-primary/20">
                                    <td colSpan={6} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary">
                                        Selected Stations
                                    </td>
                                </tr>
                                {stations.filter(s => isSelected(s.id)).map((station) => {
                                    const expanded = expandedStationId === station.id;
                                    const loading = loadingDetails === station.id;
                                    const details = stationDetails[station.id];

                                    return (
                                        <div key={station.id} style={{ display: 'contents' }}>
                                            <tr className={cn("hover:bg-muted/50 transition-colors bg-muted/30 border-l-4 border-l-primary")}>
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => onToggleStation(station)}
                                                        className={cn(
                                                            "w-5 h-5 rounded border flex items-center justify-center transition-colors bg-primary border-primary text-primary-foreground"
                                                        )}
                                                        title="Deselect"
                                                    >
                                                        <Check className="h-3 w-3" />
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 font-medium">{station.name}</td>
                                                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{station.id}</td>
                                                <td className="px-4 py-3">
                                                    {station.datacoverage ? `${Math.round(station.datacoverage * 100)}%` : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-muted-foreground">
                                                    {station.mindate && station.maxdate ? (
                                                        <div className="flex flex-col text-xs">
                                                            <span>{station.mindate}</span>
                                                            <span>{station.maxdate}</span>
                                                        </div>
                                                    ) : '-'}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => toggleExpand(station.id)}
                                                        disabled={!dataSource}
                                                        className="p-1 hover:bg-accent rounded-md transition-colors text-muted-foreground"
                                                    >
                                                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                    </button>
                                                </td>
                                            </tr>
                                            {expanded && (
                                                <tr className="bg-muted/30 border-l-4 border-l-primary">
                                                    <td colSpan={6} className="p-0">
                                                        <div className="p-4 space-y-3">
                                                            <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Available Parameters</h4>
                                                            {loading ? (
                                                                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading details...
                                                                </div>
                                                            ) : details && details.length > 0 ? (
                                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                                                    {details.map(dt => (
                                                                        <div key={dt.id} className="bg-background border rounded p-2 text-xs shadow-sm">
                                                                            <div className="font-medium text-foreground">{dt.name || dt.id}</div>
                                                                            <div className="text-muted-foreground font-mono mt-1">{dt.id}</div>
                                                                            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                                                                                <span>{dt.mindate} - {dt.maxdate}</span>
                                                                                <span>{Math.round(dt.datacoverage * 100)}%</span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <div className="text-sm text-muted-foreground italic">No detailed parameter info available.</div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </div>
                                    );
                                })}
                                <tr className="bg-muted/20 border-b border-border">
                                    <td colSpan={6} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                        Other Stations
                                    </td>
                                </tr>
                            </>
                        )}
                        {stations.filter(s => !isSelected(s.id)).map((station) => {
                            const expanded = expandedStationId === station.id;
                            const loading = loadingDetails === station.id;
                            const details = stationDetails[station.id];

                            return (
                                <div key={station.id} style={{ display: 'contents' }}>
                                    <tr className="hover:bg-muted/50 transition-colors">
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => onToggleStation(station)}
                                                className="w-5 h-5 rounded border border-input hover:border-primary flex items-center justify-center transition-colors"
                                                title="Select"
                                            >
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 font-medium">{station.name}</td>
                                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{station.id}</td>
                                        <td className="px-4 py-3">
                                            {station.datacoverage ? `${Math.round(station.datacoverage * 100)}%` : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {station.mindate && station.maxdate ? (
                                                <div className="flex flex-col text-xs">
                                                    <span>{station.mindate}</span>
                                                    <span>{station.maxdate}</span>
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => toggleExpand(station.id)}
                                                disabled={!dataSource}
                                                className="p-1 hover:bg-accent rounded-md transition-colors text-muted-foreground"
                                            >
                                                {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                            </button>
                                        </td>
                                    </tr>
                                    {expanded && (
                                        <tr className="bg-muted/30">
                                            <td colSpan={6} className="p-0">
                                                <div className="p-4 space-y-3">
                                                    <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Available Parameters</h4>
                                                    {loading ? (
                                                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                                            <Loader2 className="h-4 w-4 animate-spin" /> Loading details...
                                                        </div>
                                                    ) : details && details.length > 0 ? (
                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                                            {details.map(dt => (
                                                                <div key={dt.id} className="bg-background border rounded p-2 text-xs shadow-sm">
                                                                    <div className="font-medium text-foreground">{dt.name || dt.id}</div>
                                                                    <div className="text-muted-foreground font-mono mt-1">{dt.id}</div>
                                                                    <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                                                                        <span>{dt.mindate} - {dt.maxdate}</span>
                                                                        <span>{Math.round(dt.datacoverage * 100)}%</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="text-sm text-muted-foreground italic">No detailed parameter info available.</div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </div>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="p-2 border-t border-border bg-muted/20 text-xs text-muted-foreground flex justify-between items-center">
                <span>Total Stations: {stations.length}</span>
                <span>{selectedStations.length} selected</span>
            </div>
        </div>
    );
}
