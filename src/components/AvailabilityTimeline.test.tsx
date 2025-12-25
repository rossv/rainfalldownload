import { render, screen, fireEvent } from '@testing-library/react';
import { AvailabilityTimeline } from './AvailabilityTimeline';
import type { Station, DataType } from '../types';

describe('AvailabilityTimeline', () => {
    it('renders a bar with visible width when mindate equals maxdate', () => {
        const stations: Station[] = [
            { id: 'station-1', name: 'Single Day Station', latitude: 0, longitude: 0 }
        ];

        const singleDayRange: DataType[] = [
            {
                id: 'PRCP',
                name: 'Precipitation',
                mindate: '2025-01-01',
                maxdate: '2025-01-01',
                datacoverage: 1
            }
        ];

        const availability: Record<string, DataType[]> = {
            'station-1': singleDayRange
        };

        const loading: Record<string, boolean> = {
            'station-1': false
        };

        render(
            <AvailabilityTimeline
                stations={stations}
                availability={availability}
                loading={loading}
            />
        );

        fireEvent.click(screen.getByRole('button'));

        const bar = screen.getByTitle(/Precipitation\s+2025-01-01 to 2025-01-01\s+Coverage/);
        const width = parseFloat((bar as HTMLElement).style.width);

        expect(width).toBeGreaterThan(0);
    });
});
