import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvailabilityTimeline } from './AvailabilityTimeline';
import type { DataType, Station } from '../types';

describe('AvailabilityTimeline', () => {
    const station: Station = {
        id: 'STN1',
        name: 'Single Day Station',
        latitude: 0,
        longitude: 0
    };

    const dataType: DataType = {
        id: 'PRCP',
        name: 'Precipitation',
        mindate: '2024-01-01',
        maxdate: '2024-01-01',
        datacoverage: 1
    };

    it('renders a visible width when the availability covers a single day', async () => {
        const user = userEvent.setup();

        render(
            <AvailabilityTimeline
                stations={[station]}
                availability={{ [station.id]: [dataType] }}
                loading={{}}
            />
        );

        const toggle = screen.getByRole('button');
        await user.click(toggle);

        const bars = await screen.findAllByTitle(/Precipitation/);
        const detailBar = bars.find(element => element.getAttribute('title')?.includes('Coverage'));

        expect(detailBar).toBeDefined();

        const widthValue = parseFloat((detailBar as HTMLElement).style.width);
        expect(widthValue).toBeGreaterThan(0);
    });
});
