import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RainfallChart } from './RainfallChart';
import type { RainfallData, Station } from '../types';

// Mock Recharts ResponsiveContainer
vi.mock('recharts', async () => {
    const OriginalModule = await vi.importActual('recharts');
    return {
        ...OriginalModule,
        ResponsiveContainer: ({ children }: any) => (
            <div style={{ width: 800, height: 600 }}>
                {React.cloneElement(children, { width: 800, height: 600 })}
            </div>
        ),
    };
});

describe('RainfallChart WESD Rendering', () => {
    const stations: Station[] = [{
        id: 'GHCND.USW00094846',
        name: 'Test Station',
        latitude: 0,
        longitude: 0
    }];

    const wesdData: RainfallData[] = [
        {
            date: '2023-01-01T00:00:00',
            value: 5.5,
            datatype: 'WESD',
            stationId: 'GHCND.USW00094846'
        },
        {
            date: '2023-01-02T00:00:00',
            value: 10.0,
            datatype: 'WESD',
            stationId: 'GHCND.USW00094846'
        }
    ];

    it('renders bars for WESD data', async () => {
        const { container } = render(
            <RainfallChart
                data={wesdData}
                units="standard"
                stations={stations}
                title="Water Equivalent of Snow Depth (WESD)"
            />
        );

        // Check if title is present
        expect(screen.getByText('Water Equivalent of Snow Depth (WESD)')).toBeInTheDocument();

        // Search for bars by class name that Recharts uses
        // Note: In newer Recharts, bars are paths. 
        // We can inspect the DOM more generically if class names are unstable.
        // But usually .recharts-bar-rectangle is reliable.
        const bars = container.querySelectorAll('.recharts-bar-rectangle');
        expect(bars.length).toBeGreaterThan(0);
    });
});
