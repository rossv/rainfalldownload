import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import type { RainfallData } from '../types';

interface ChartProps {
    data: RainfallData[];
    units: 'standard' | 'metric';
}

export function RainfallChart({ data, units }: ChartProps) {
    if (data.length === 0) {
        return (
            <div className="h-64 flex items-center justify-center text-muted-foreground border border-dashed border-border rounded-lg">
                No data to display
            </div>
        );
    }

    return (
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Precipitation History</h3>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis
                            dataKey="date"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(val) => new Date(val).toLocaleDateString()}
                        />
                        <YAxis
                            label={{ value: units === 'metric' ? 'mm' : 'in', angle: -90, position: 'insideLeft' }}
                            tick={{ fontSize: 12 }}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: 'var(--radius)' }}
                            itemStyle={{ color: 'hsl(var(--foreground))' }}
                            labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                            labelFormatter={(label) => new Date(label).toDateString()}
                        />
                        <Legend />
                        <Bar dataKey="value" name="Precipitation" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
