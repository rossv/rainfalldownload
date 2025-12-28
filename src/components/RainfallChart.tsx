import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useMemo, useState } from 'react';
import { formatDate } from '../lib/dateUtils';
import type { RainfallData, Station } from '../types';

interface ChartProps {
    data: RainfallData[];
    units: 'standard' | 'metric';
    stations: Station[];
    title: string;
}

// Simple color palette for stations
const COLORS = [
    'hsl(var(--primary))',
    '#ef4444', // red-500
    '#22c55e', // green-500
    '#3b82f6', // blue-500
    '#eab308', // yellow-500
    '#a855f7', // purple-500
    '#ec4899', // pink-500
    '#f97316', // orange-500
    '#06b6d4', // cyan-500
    '#84cc16', // lime-500
    '#6366f1', // indigo-500
];

export function RainfallChart({ data, units, stations, title }: ChartProps) {
    const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

    // Safe ID helper for Recharts dataKeys (avoids issues with colons/dots)
    const safeId = (id: string) => String(id).replace(/[:.]/g, '_');

    // Process data into "wide" format for Recharts
    // { date: "2023-01-01", station_A: 1.2, station_B: 0.5, ... }
    const { chartData, stationIds, originalIds, stationStats } = useMemo(() => {
        if (data.length === 0) return { chartData: [], stationIds: [], originalIds: new Map(), stationStats: [] };

        const grouped = new Map<string, any>();
        const ids = new Set<string>();
        const idMap = new Map<string, string>(); // safeId -> originalId
        const stationDataMap = new Map<string, { date: Date, value: number }[]>();

        data.forEach(d => {
            const dateStr = d.date; // Use full ISO string for sorting accurately first
            const dateObj = new Date(d.date);
            // const simpleDateStr = dateStr.split('T')[0]; // Removed unused variable
            // Actually existing chart uses split('T')[0] which implies daily aggregation or simply ignoring time for the axis label if repeated?
            // The original code used: const dateStr = d.date.split('T')[0]; which merges same-day data? 
            // If we have 15-min data, splitting by T[0] would override keys. 
            // LET'S CHECK: The existing code WAS doing grouped.set(dateStr...) 
            // If the data is 15-min, this would clobber previous entries for the same day.
            // Assumption: The previous code might have been assuming daily data or just buggy for sub-daily.
            // Requirement mentions "Peak 1-hr intensity" which implies sub-daily data.
            // FIX: Use full date string as key for unique time points.

            if (!grouped.has(dateStr)) {
                grouped.set(dateStr, { date: d.date });
            }

            if (d.stationId) {
                const sId = safeId(d.stationId);
                grouped.get(dateStr)[sId] = d.value;
                ids.add(sId);
                idMap.set(sId, d.stationId);

                if (!stationDataMap.has(d.stationId)) {
                    stationDataMap.set(d.stationId, []);
                }
                stationDataMap.get(d.stationId)?.push({ date: dateObj, value: d.value });
            }
        });

        // Sort chart data by date
        const sorted = Array.from(grouped.values()).sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // Calculate Stats
        const stats = Array.from(idMap.entries()).map(([safeId, realId]) => {
            const seriesData = stationDataMap.get(realId)?.sort((a, b) => a.date.getTime() - b.date.getTime()) || [];
            if (seriesData.length === 0) return null;

            // 1. Detect Time Step
            let intervalMin = 0;
            if (seriesData.length > 1) {
                // Check first few intervals to guess
                const diffs = [];
                for (let i = 1; i < Math.min(seriesData.length, 5); i++) {
                    diffs.push((seriesData[i].date.getTime() - seriesData[i - 1].date.getTime()) / 60000);
                }
                // Mode or Min? consistent step usually.
                intervalMin = diffs.sort((a, b) => a - b)[0] || 0;
            }

            // 2. Metrics
            const total = seriesData.reduce((sum, d) => sum + d.value, 0);
            const peakVal = Math.max(...seriesData.map(d => d.value));

            let peakIntensity = peakVal;
            let timeStepLabel = "Daily";

            if (intervalMin > 0 && intervalMin < 1400) { // Less than 24h (1440)
                if (intervalMin <= 60) {
                    timeStepLabel = `${Math.round(intervalMin)}m`;
                    peakIntensity = peakVal * (60 / intervalMin);
                } else {
                    timeStepLabel = `${Math.round(intervalMin / 60)}h`;
                    peakIntensity = peakVal * (60 / intervalMin); // Still normalize to hr? Yes usually "intensity" is /hr
                }
            } else if (intervalMin === 0 && seriesData.length === 1) {
                timeStepLabel = "Single";
            }

            // 3. Peak 1-Hr (Rolling Sum)
            let peak1Hr = peakVal; // Default to max single value if we can't do rolling
            if (intervalMin > 0 && intervalMin <= 60) {
                // Rolling window of 60 mins
                // Since data is sorted, we can use a simpler sliding window logic if steps are constant-ish
                // But better to use time-based window
                let maxRolling = 0;
                let windowSum = 0;
                let left = 0;

                for (let right = 0; right < seriesData.length; right++) {
                    windowSum += seriesData[right].value;

                    // Shrink from left if window > 60 mins
                    while (seriesData[right].date.getTime() - seriesData[left].date.getTime() > 60 * 60 * 1000) {
                        windowSum -= seriesData[left].value;
                        left++;
                    }

                    // Only consider it a "full" 1-hr window if we are close to 60m span? 
                    // Or just max accumulating within any 60m window (standard definition).
                    if (windowSum > maxRolling) maxRolling = windowSum;
                }
                peak1Hr = maxRolling;
            } else if (intervalMin > 60) {
                // If step > 60m, Peak 1-Hr is effectively "N/A" or just the peak value (it rained that much in >1hr, so intensity is lower, but Accumulation in 1hr? undefined)
                // We'll just display Peak Value as the closest proxy, or hide it.
                // Actually logic: If data is 2-hrly, max in 1 hr is unknown, but technically <= max value.
                peak1Hr = peakVal;
            }

            return {
                id: realId,
                safeId,
                name: stations.find(s => s.id === realId)?.name || realId,
                total,
                peakIntensity,
                peak1Hr,
                timeStepLabel,
                intervalMin
            };
        }).filter(Boolean);

        return { chartData: sorted, stationIds: Array.from(ids), originalIds: idMap, stationStats: stats };
    }, [data, stations]);

    // Calculate global max Y value for stable axis
    const maxY = useMemo(() => {
        let max = 0;
        chartData.forEach(d => {
            stationIds.forEach(id => {
                const val = Number(d[id]);
                if (!isNaN(val) && val > max) max = val;
            });
        });
        return max > 0 ? max * 1.1 : 'auto'; // 10% padding
    }, [chartData, stationIds]);

    const handleLegendClick = (e: any) => {
        const dataKey = e.dataKey;
        setHiddenSeries(prev => {
            const next = new Set(prev);
            if (next.has(dataKey)) {
                next.delete(dataKey);
            } else {
                next.add(dataKey);
            }
            return next;
        });
    };

    if (data.length === 0) {
        return (
            <div className="h-64 flex items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg bg-muted/10">
                No data to display for {title}
            </div>
        );
    }

    return (
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm flex flex-col md:flex-row gap-4">

            {/* Left Col: Statistics Panel */}
            <div className="w-full md:w-64 max-h-[350px] overflow-y-auto flex-shrink-0 space-y-3 pr-2 border-b md:border-b-0 md:border-r border-border custom-scrollbar">
                <h3 className="font-semibold text-sm sticky top-0 bg-card py-1 z-10">{title} Stats</h3>
                {stationStats.map((stat: any, index: number) => {
                    const color = COLORS[index % COLORS.length];
                    const isHidden = hiddenSeries.has(stat.safeId);

                    return (
                        <div
                            key={stat.id}
                            className={`p-3 rounded-lg border text-sm transition-opacity ${isHidden ? 'opacity-50' : 'opacity-100'}`}
                            style={{ borderColor: isHidden ? 'transparent' : color, backgroundColor: isHidden ? 'transparent' : `${color}10` }} // 10% opacity hex
                        >
                            <div className="font-medium truncate mb-1" title={stat.name} style={{ color: isHidden ? 'inherit' : color }}>
                                {stat.name}
                            </div>
                            <div className="grid grid-cols-2 gap-y-1 gap-x-2 text-xs text-muted-foreground">
                                <div>Total ({units === 'metric' ? 'mm' : 'in'})</div>
                                <div className="text-right font-mono text-foreground">{stat.total.toFixed(2)}</div>

                                {stat.intervalMin > 0 && stat.intervalMin <= 60 && (
                                    <>
                                        <div>Peak Int. (/hr)</div>
                                        <div className="text-right font-mono text-foreground">{stat.peakIntensity.toFixed(2)}</div>

                                        <div>Peak 1-Hr</div>
                                        <div className="text-right font-mono text-foreground">{stat.peak1Hr.toFixed(2)}</div>
                                    </>
                                )}

                                {stat.intervalMin > 60 || stat.intervalMin === 0 ? (
                                    <>
                                        <div>Peak Value</div>
                                        <div className="text-right font-mono text-foreground">{stat.peakIntensity.toFixed(2)}</div>
                                    </>
                                ) : null}

                                <div className="text-[10px] opacity-70 col-span-2 text-right mt-1">
                                    Step: {stat.timeStepLabel}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Right Col: Chart */}
            <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 md:hidden">
                    {title}
                    <span className="text-xs font-normal text-muted-foreground px-2 py-0.5 bg-muted rounded">
                        {units === 'metric' ? 'mm' : 'in'}
                    </span>
                </h3>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 12 }}
                                tickFormatter={(val) => {
                                    const d = new Date(val);
                                    return formatDate(d) +
                                        (d.getHours() !== 0 ? ` ${d.getHours()}h` : '');
                                }}
                                minTickGap={30}
                            />
                            <YAxis
                                tick={{ fontSize: 12 }}
                                width={40}
                                domain={[0, maxY]}
                                tickFormatter={(val) => Number(val).toFixed(2)}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: 'var(--radius)' }}
                                itemStyle={{ color: 'hsl(var(--foreground))' }}
                                labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                                labelFormatter={(label) => {
                                    const d = new Date(label);
                                    return `${formatDate(d)} ${d.toLocaleTimeString()}`;
                                }}
                                filterNull={true}
                                formatter={(value: any, name: any) => {
                                    // Don't show tooltip for hidden series
                                    if (hiddenSeries.has(String(name))) return [undefined, undefined];

                                    const val = Number(value);
                                    const formattedVal = isNaN(val) ? value : val.toFixed(2);
                                    // Look up original ID then find station
                                    const originalId = originalIds.get(String(name));
                                    const station = stations.find(s => s.id === originalId);
                                    return [formattedVal, station ? station.name : (originalId || name)];
                                }}
                            />
                            <Legend
                                onClick={handleLegendClick}
                                wrapperStyle={{ cursor: 'pointer', paddingTop: '10px' }}
                                formatter={(value, entry: any) => {
                                    const { dataKey } = entry;
                                    const originalId = originalIds.get(String(value));
                                    const station = stations.find(s => s.id === originalId);
                                    const isHidden = hiddenSeries.has(dataKey);
                                    return (
                                        <span style={{ opacity: isHidden ? 0.3 : 1, transition: 'opacity 0.2s', fontSize: '12px' }}>
                                            {station ? station.name : (originalId || value)}
                                        </span>
                                    );
                                }}
                            />
                            {stationIds.map((id, index) => {
                                const isHidden = hiddenSeries.has(id);
                                return (
                                    <Bar
                                        key={id}
                                        dataKey={id}
                                        name={id} // We use safe ID as key, but legend formatter handles display
                                        fill={COLORS[index % COLORS.length]}
                                        radius={[2, 2, 0, 0]}
                                        maxBarSize={50}
                                        isAnimationActive={false}
                                        // Use opacity instead of hide to preserve layout space
                                        opacity={isHidden ? 0 : 1}
                                        style={{ pointerEvents: isHidden ? 'none' : 'auto' }}
                                    />
                                );
                            })}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
