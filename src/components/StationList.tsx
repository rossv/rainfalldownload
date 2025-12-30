import { useState, Fragment } from 'react';
import type { Station, DataType, DataSource } from '../types';
import { ChevronDown, ChevronRight, Check, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { formatDate } from '../lib/dateUtils';

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
    const [sortConfig, setSortConfig] = useState<{ key: keyof Station | 'mindate' | 'maxdate'; direction: 'asc' | 'desc' } | null>({ key: 'datacoverage', direction: 'desc' });

    const handleSort = (key: keyof Station | 'mindate' | 'maxdate') => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedStations = [...stations].sort((a, b) => {
        if (!sortConfig) return 0;

        let aValue: any = a[sortConfig.key as keyof Station];
        let bValue: any = b[sortConfig.key as keyof Station];

        // Handle specific date keys if they aren't direct properties (though they seem to be in Station type based on usage)
        // usage: station.mindate, station.maxdate. assuming they are properties.

        if (aValue === undefined || aValue === null) aValue = '';
        if (bValue === undefined || bValue === null) bValue = '';

        if (aValue < bValue) {
            return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
            return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
    });

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

                // Find existing station data to get limits
                const station = stations.find(s => s.id === stationId) || selectedStations.find(s => s.id === stationId);

                const clampedTypes = types.map(t => {
                    let minD = t.mindate;
                    let maxD = t.maxdate;

                    if (station?.mindate && minD < station.mindate) minD = station.mindate;
                    if (station?.maxdate && maxD > station.maxdate) maxD = station.maxdate;

                    return { ...t, mindate: minD, maxdate: maxD };
                });

                setStationDetails(prev => ({ ...prev, [stationId]: clampedTypes }));
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

    const SortIcon = ({ column }: { column: keyof Station | 'mindate' | 'maxdate' }) => {
        if (sortConfig?.key !== column) return <div className="w-4 h-4" />;
        return sortConfig.direction === 'asc' ? <ChevronDown className="h-3 w-3 rotate-180" /> : <ChevronDown className="h-3 w-3" />;
    };

    const renderHeader = (label: string, column: keyof Station | 'mindate' | 'maxdate', width?: string) => (
        <th
            className={`px-4 py-3 font-medium cursor-pointer hover:bg-muted-foreground/10 transition-colors select-none group ${width || ''}`}
            onClick={() => handleSort(column)}
        >
            <div className="flex items-center gap-1">
                {label}
                <SortIcon column={column} />
            </div>
        </th>
    );

    return (
        <div className="h-full flex flex-col border border-border rounded-xl bg-card overflow-hidden shadow-sm">
            <div className="overflow-auto flex-1">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground bg-muted sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-3 font-medium w-10"></th>
                            {renderHeader("Station Name", "name")}
                            {renderHeader("ID", "id", "w-32")}
                            {renderHeader("Coverage", "datacoverage", "w-24")}
                            {renderHeader("Start Date", "mindate", "w-32")}
                            {renderHeader("End Date", "maxdate", "w-32")}
                            <th className="px-4 py-3 font-medium w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {/* Selected Stations Section - always at top if any */}
                        {sortedStations.filter(s => isSelected(s.id)).length > 0 && (
                            <>
                                <tr className="bg-muted/50 border-b-2 border-primary/20">
                                    <td colSpan={7} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-primary">
                                        Selected Stations
                                    </td>
                                </tr>
                                {sortedStations.filter(s => isSelected(s.id)).map((station) => {
                                    const expanded = expandedStationId === station.id;
                                    const loading = loadingDetails === station.id;
                                    const details = stationDetails[station.id];

                                    return (<Fragment key={station.id}>
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
                                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                                                {station.mindate ? formatDate(station.mindate) : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                                                {station.maxdate ? formatDate(station.maxdate) : '-'}
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
                                                <td colSpan={7} className="p-0">
                                                    <div className="p-4 space-y-3">
                                                        <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Available Parameters</h4>
                                                        {loading ? (
                                                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                                                <Loader2 className="h-4 w-4 animate-spin" /> Loading details...
                                                            </div>
                                                        ) : details && details.length > 0 ? (
                                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                                        {details.map(dt => {
                                                            const coveragePercent = dt.datacoverage != null
                                                                ? Math.round(dt.datacoverage * 100)
                                                                : null;

                                                            return (
                                                                <div key={dt.id} className="bg-background border rounded p-2 text-xs shadow-sm">
                                                                    <div className="font-medium text-foreground">{dt.name || dt.id}</div>
                                                                    <div className="text-muted-foreground font-mono mt-1">{dt.id}</div>
                                                                    <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                                                                        <span>{formatDate(dt.mindate)} - {formatDate(dt.maxdate)}</span>
                                                                        <span>{coveragePercent !== null ? `${coveragePercent}%` : 'N/A'}</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                            <div className="text-sm text-muted-foreground italic">No detailed parameter info available.</div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                    );
                                })}
                            </>
                        )}

                        <tr className="bg-muted/20 border-b border-border">
                            <td colSpan={7} className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Other Stations
                            </td>
                        </tr>

                        {sortedStations.filter(s => !isSelected(s.id)).map((station) => {
                            const expanded = expandedStationId === station.id;
                            const loading = loadingDetails === station.id;
                            const details = stationDetails[station.id];

                            return (
                                <Fragment key={station.id}>
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
                                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                                            {station.mindate ? formatDate(station.mindate) : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                                            {station.maxdate ? formatDate(station.maxdate) : '-'}
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
                                            <td colSpan={7} className="p-0">
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
                                                                        <span>{formatDate(dt.mindate)} - {formatDate(dt.maxdate)}</span>
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
                                </Fragment>
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
