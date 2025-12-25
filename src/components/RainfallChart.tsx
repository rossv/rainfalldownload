import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useMemo } from 'react';
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

    // Safe ID helper for Recharts dataKeys (avoids issues with colons/dots)
    const safeId = (id: string) => String(id).replace(/[:.]/g, '_');

    // Process data into "wide" format for Recharts
    // { date: "2023-01-01", station_A: 1.2, station_B: 0.5, ... }
    const { chartData, stationIds, originalIds } = useMemo(() => {
        if (data.length === 0) return { chartData: [], stationIds: [], originalIds: new Map() };

        const grouped = new Map<string, any>();
        const ids = new Set<string>();
        const idMap = new Map<string, string>(); // safeId -> originalId

        data.forEach(d => {
            const dateStr = d.date.split('T')[0];
            if (!grouped.has(dateStr)) {
                grouped.set(dateStr, { date: d.date });
            }
            if (d.stationId) {
                const sId = safeId(d.stationId);
                grouped.get(dateStr)[sId] = d.value;
                ids.add(sId);
                idMap.set(sId, d.stationId);
            }
        });

        // Sort by date
        const sorted = Array.from(grouped.values()).sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        return { chartData: sorted, stationIds: Array.from(ids), originalIds: idMap };
    }, [data]);

    if (data.length === 0) {
        return (
            <div className="h-64 flex items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg bg-muted/10">
                No data to display for {title}
            </div>
        );
    }

    return (
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
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
                            tickFormatter={(val) => new Date(val).toLocaleDateString()}
                            minTickGap={30}
                        />
                        <YAxis
                            tick={{ fontSize: 12 }}
                            width={40}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: 'var(--radius)' }}
                            itemStyle={{ color: 'hsl(var(--foreground))' }}
                            labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                            labelFormatter={(label) => new Date(label).toDateString()}
                            formatter={(value: any, name: any) => {
                                const val = Number(value);
                                // Look up original ID then find station
                                const originalId = originalIds.get(String(name));
                                const station = stations.find(s => s.id === originalId);
                                return [isNaN(val) ? value : val, station ? station.name : (originalId || name)];
                            }}
                        />
                        <Legend
                            formatter={(value) => {
                                const originalId = originalIds.get(String(value));
                                const station = stations.find(s => s.id === originalId);
                                return station ? station.name : (originalId || value);
                            }}
                        />
                        {stationIds.map((id, index) => (
                            <Bar
                                key={id}
                                dataKey={id}
                                name={id} // We use safe ID as key, but legend formatter handles display
                                fill={COLORS[index % COLORS.length]}
                                radius={[2, 2, 0, 0]}
                                maxBarSize={50}
                                isAnimationActive={false}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
