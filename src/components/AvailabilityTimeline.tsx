import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { differenceInDays, parseISO, min, max } from 'date-fns';
import type { Station, DataType } from '../types';

interface AvailabilityTimelineProps {
    stations: Station[];
    availability: Record<string, DataType[]>;
    loading: Record<string, boolean>;
}

export function AvailabilityTimeline({ stations, availability, loading }: AvailabilityTimelineProps) {
    const [expandedStations, setExpandedStations] = useState<Set<string>>(new Set());

    const toggleExpand = (stationId: string) => {
        setExpandedStations(prev => {
            const next = new Set(prev);
            if (next.has(stationId)) next.delete(stationId);
            else next.add(stationId);
            return next;
        });
    };

    // calculate global min/max dates to define the timeline range
    const { minDate, maxDate, totalDays } = useMemo(() => {
        let dates: Date[] = [];
        Object.values(availability).flat().forEach(d => {
            if (d.mindate) dates.push(parseISO(d.mindate));
            if (d.maxdate) dates.push(parseISO(d.maxdate));
        });

        // Default range if no data
        if (dates.length === 0) {
            const now = new Date();
            dates = [new Date(now.getFullYear() - 1, 0, 1), now];
        }

        const minD = min(dates);
        const maxD = max(dates);
        // Add minimal buffer
        return {
            minDate: minD,
            maxDate: maxD,
            totalDays: Math.max(1, differenceInDays(maxD, minD))
        };
    }, [availability]);

    const getPositionStyle = (start: string, end: string) => {
        const startDate = parseISO(start);
        const endDate = parseISO(end);

        const startDiff = differenceInDays(startDate, minDate);
        const duration = differenceInDays(endDate, startDate);

        const left = Math.max(0, (startDiff / totalDays) * 100);
        const dayWidth = 100 / Math.max(totalDays, 1);
        const width = Math.min(100 - left, Math.max(dayWidth, (duration / totalDays) * 100));

        return { left: `${left}%`, width: `${width}%` };
    };

    const years = useMemo(() => {
        const y = [];
        for (let i = minDate.getFullYear(); i <= maxDate.getFullYear(); i++) {
            y.push(i);
        }
        // Filter to avoid overcrowding. Aim for max ~15 ticks.
        const stride = Math.ceil(y.length / 15);
        return y.filter((_, i) => i % stride === 0);
    }, [minDate, maxDate]);

    if (stations.length === 0) return null;

    return (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm overflow-hidden flex flex-col h-full">
            <h2 className="font-semibold text-lg mb-4">Data Availability Timeline</h2>

            <div className="flex-1 overflow-auto">
                <div className="min-w-[600px] relative pb-6">
                    {/* Time Axis Header */}
                    <div className="flex border-b border-border mb-2 pb-1 relative h-6 text-xs text-muted-foreground select-none">
                        {years.map(year => {
                            const yearDate = new Date(year, 0, 1);
                            if (yearDate < minDate) return null;
                            const diff = differenceInDays(yearDate, minDate);
                            const left = (diff / totalDays) * 100;
                            if (left > 100) return null;

                            return (
                                <div
                                    key={year}
                                    className="absolute transform -translate-x-1/2 border-l border-border pl-1"
                                    style={{ left: `${left}%` }}
                                >
                                    {year}
                                </div>
                            )
                        })}
                    </div>

                    {/* Stations */}
                    <div className="space-y-4">
                        {stations.map(station => {
                            const dataTypes = availability[station.id] || [];
                            const isLoading = loading[station.id];
                            const isExpanded = expandedStations.has(station.id);

                            // Calculate overall coverage for summary bar
                            // Simple approach: Union of all ranges is hard visually, lets just take min of all mins and max of all maxs for summary
                            // Or better: don't show a bar, just the container. 
                            // Let's show a "faded" bar representing the full extent.
                            let stationMin = minDate; // placeholder
                            let stationMax = minDate; // placeholder
                            let hasData = dataTypes.length > 0;

                            if (hasData) {
                                const sDates = dataTypes.map(d => parseISO(d.mindate));
                                const eDates = dataTypes.map(d => parseISO(d.maxdate));
                                stationMin = min(sDates);
                                stationMax = max(eDates);
                            }

                            return (
                                <div key={station.id} className="relative group">
                                    {/* Station Header Row */}
                                    <div className="flex items-center gap-2 mb-1">
                                        <button
                                            onClick={() => toggleExpand(station.id)}
                                            className="p-1 hover:bg-muted rounded transition-colors"
                                        >
                                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm truncate" title={station.name}>
                                                {station.name}
                                                {isLoading && <span className="ml-2 text-xs text-muted-foreground animate-pulse">Checking availability...</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Summary Timeline Track */}
                                    <div className="h-6 relative bg-muted/30 rounded-full w-full mb-1">
                                        {hasData && (
                                            <div
                                                className="absolute top-1 bottom-1 bg-primary/20 rounded-full"
                                                style={getPositionStyle(stationMin.toISOString(), stationMax.toISOString())}
                                            />
                                        )}
                                    </div>

                                    {/* Details (Accordion) */}
                                    {isExpanded && (
                                        <div className="ml-8 space-y-1 animate-in slide-in-from-top-2 fade-in duration-200">
                                            {hasData ? dataTypes.map(dt => (
                                                <div key={dt.id} className="grid grid-cols-[100px_1fr] items-center gap-4 text-xs">
                                                    <div className="truncate font-medium text-muted-foreground" title={dt.name}>{dt.id}</div>
                                                    <div className="h-4 relative w-full bg-muted/20 rounded">
                                                        <div
                                                            className="absolute h-full rounded bg-primary/60 hover:bg-primary transition-colors cursor-help"
                                                            style={getPositionStyle(dt.mindate, dt.maxdate)}
                                                            title={`${dt.name}\n${dt.mindate} to ${dt.maxdate}\nCoverage: ${(dt.datacoverage * 100).toFixed(1)}%`}
                                                        />
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="text-xs text-muted-foreground italic">No availability data found.</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
