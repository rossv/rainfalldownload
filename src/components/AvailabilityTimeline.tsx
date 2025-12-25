import { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { differenceInDays, parseISO, min, max } from 'date-fns';
import type { Station, DataType } from '../types';

interface AvailabilityTimelineProps {
    stations: Station[];
    availability: Record<string, DataType[]>;
    loading: Record<string, boolean>;
    selectedStart?: string;
    selectedEnd?: string;
    onRangeChange?: (start: string, end: string) => void;
}

export function AvailabilityTimeline({ stations, availability, loading, selectedStart, selectedEnd, onRangeChange }: AvailabilityTimelineProps) {
    const [expandedStations, setExpandedStations] = useState<Set<string>>(new Set());

    // Drag state
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartDate, setDragStartDate] = useState<Date | null>(null);

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
        const minWidthPercent = 0.5; // ensure single-day/very short ranges stay visible
        const width = Math.min(
            100 - left,
            Math.max(minWidthPercent, (duration / totalDays) * 100)
        );

        return { left: `${left}% `, width: `${width}% ` };
    };

    // Selection Box Style
    const selectionStyle = useMemo(() => {
        if (!selectedStart || !selectedEnd) return null;
        return getPositionStyle(selectedStart, selectedEnd);
    }, [selectedStart, selectedEnd, minDate, totalDays]);

    const years = useMemo(() => {
        const y = [];
        for (let i = minDate.getFullYear(); i <= maxDate.getFullYear(); i++) {
            y.push(i);
        }
        // Filter to avoid overcrowding. Aim for max ~15 ticks.
        const stride = Math.ceil(y.length / 15);
        return y.filter((_, i) => i % stride === 0);
    }, [minDate, maxDate]);

    // Drag handlers
    // Actually standard ref is easier.

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!onRangeChange) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        const percent = Math.max(0, Math.min(1, x / width));

        // Calculate date from percentage
        const daysOffset = Math.round(percent * totalDays);
        const date = new Date(minDate);
        date.setDate(date.getDate() + daysOffset);

        setDragStartDate(date);
        setIsDragging(true);

        // Initial click starts a 1-day range or point
        onRangeChange(date.toISOString().split('T')[0], date.toISOString().split('T')[0]);
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDragging || !dragStartDate || !onRangeChange) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        const percent = Math.max(0, Math.min(1, x / width));

        const daysOffset = Math.round(percent * totalDays);
        const currentDate = new Date(minDate);
        currentDate.setDate(currentDate.getDate() + daysOffset);

        let start = dragStartDate;
        let end = currentDate;

        if (currentDate < dragStartDate) {
            start = currentDate;
            end = dragStartDate;
        }

        onRangeChange(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setDragStartDate(null);
    };

    // Add global mouse up listener to handle drag end outside component
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mouseup', handleMouseUp);
            return () => window.removeEventListener('mouseup', handleMouseUp);
        }
    }, [isDragging]);

    if (stations.length === 0) return null;

    return (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm overflow-hidden flex flex-col h-full select-none">
            <h2 className="font-semibold text-lg mb-4 flex justify-between items-center">
                <span>Data Availability Timeline</span>
                {selectedStart && selectedEnd && (
                    <span className="text-xs font-normal text-primary bg-primary/10 px-2 py-1 rounded">
                        Selected: {selectedStart} to {selectedEnd}
                    </span>
                )}
            </h2>

            <div className="flex-1 overflow-auto relative">
                <div
                    className="min-w-[600px] relative pb-6 cursor-crosshair"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                >
                    {/* Selection Overlay Background (optional highlight for entire column) */}
                    {selectionStyle && (
                        <div
                            className="absolute top-0 bottom-6 bg-yellow-500/10 z-0 pointer-events-none border-x border-yellow-500/30"
                            style={selectionStyle}
                        />
                    )}

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
                                    style={{ left: `${left}% ` }}
                                >
                                    {year}
                                </div>
                            )
                        })}
                    </div>

                    {/* Stations */}
                    <div className="space-y-4 relative z-10 pointer-events-none">
                        {/* We use pointer-events-none on the content so clicks pass through to the container for dragging, 
                            but we need to re-enable pointer-events for the expand buttons */}
                        {stations.map(station => {
                            const dataTypes = availability[station.id] || [];
                            const isLoading = loading[station.id];
                            const isExpanded = expandedStations.has(station.id);

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
                                    <div
                                        className="flex items-center gap-2 mb-1 pointer-events-auto cursor-default"
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleExpand(station.id); }}
                                            className="p-1 hover:bg-muted rounded transition-colors cursor-pointer"
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
                                        <div className="space-y-1 animate-in slide-in-from-top-2 fade-in duration-200 pointer-events-auto mt-1">
                                            {hasData ? dataTypes.map(dt => (
                                                <div key={dt.id} className="relative h-5 w-full bg-muted/20 rounded flex items-center">
                                                    {/* Label Overlay */}
                                                    <div
                                                        className="absolute left-1 z-20 text-[10px] font-bold text-foreground/70 bg-background/50 backdrop-blur-[1px] px-1 rounded pointer-events-none select-none border border-border/20 shadow-sm"
                                                        title={dt.name}
                                                    >
                                                        {dt.id}
                                                    </div>

                                                    {/* Bar Track */}
                                                    <div className="absolute inset-0 w-full rounded">
                                                        <div
                                                            className="absolute h-full rounded bg-blue-500/60 hover:bg-blue-600 transition-colors cursor-help border border-blue-600/20"
                                                            style={getPositionStyle(dt.mindate, dt.maxdate)}
                                                            title={`${dt.name} \n${dt.mindate} to ${dt.maxdate} \nCoverage: ${(dt.datacoverage * 100).toFixed(1)}% `}
                                                        />
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="text-xs text-muted-foreground italic px-2">No availability data found.</div>
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
