import { useState } from 'react';
import axios from 'axios';
import { Search, Loader2, MapPin } from 'lucide-react';

import type { Station, DataSource, DataSourceCapabilities } from '../types';
import { usePreferences } from '../hooks/usePreferences';

interface SearchProps {
    dataSource: DataSource | null;
    capabilities: DataSourceCapabilities | null;
    onStationsFound: (stations: Station[], cityCenter?: [number, number]) => void;
}

export function StationSearch({ dataSource, capabilities, onStationsFound }: SearchProps) {
    const { preferences } = usePreferences();
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    const activeCredentials = preferences.credentials[preferences.providerId];
    const hasApiKey = Boolean(activeCredentials?.token?.trim() || activeCredentials?.apiKey?.trim());
    const searchEnabled = capabilities?.supportsStationSearch !== false;

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        if (!searchEnabled) {
            alert('The selected provider does not support station search.');
            return;
        }

        if (!hasApiKey && capabilities?.requiresApiKey) {
            alert('Add your API Token in Settings before searching.');
            return;
        }

        if (!dataSource) {
            alert('Data provider unavailable. Please configure Settings.');
            return;
        }

        setLoading(true);
        setSearched(false);
        try {
            const stations = await dataSource.findStationsByCity(query);

            // Calculate approximate center if stations found, else rely on map default
            let center: [number, number] | undefined;
            if (stations.length > 0) {
                // simple average
                const lat = stations.reduce((sum, s) => sum + s.latitude, 0) / stations.length;
                const lon = stations.reduce((sum, s) => sum + s.longitude, 0) / stations.length;
                center = [lat, lon];
            }

            onStationsFound(stations, center);
            setSearched(true);
        } catch (error) {
            console.error('Search failed:', error);
            if (axios.isAxiosError(error)) {
                console.error('Axios Error Details:', {
                    code: error.code,
                    message: error.message,
                    response: {
                        status: error.response?.status,
                        statusText: error.response?.statusText,
                        data: error.response?.data,
                        headers: error.response?.headers
                    }
                });
            }
            let message = 'Failed to search stations.';
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 401) {
                    message = 'Invalid API Token. Please check your settings.';
                } else if (error.response?.status === 503) {
                    message = 'Selected provider is unavailable.';
                } else if (error.response?.status === 504 || error.code === 'ECONNABORTED') {
                    message = 'The provider is responding slowly. The request timed out—please retry in a moment.';
                }
            }
            alert(message);
        } finally {
            setLoading(false);
        }
    };

    const handleLocation = () => {
        if (!searchEnabled) {
            alert('The selected provider does not support station search.');
            return;
        }

        if (!hasApiKey && capabilities?.requiresApiKey) {
            alert('Add your API Token in Settings before searching.');
            return;
        }

        if (!dataSource) {
            alert('Data provider unavailable. Please configure Settings.');
            return;
        }

        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }

        setLoading(true);
        setSearched(false);

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const { latitude, longitude } = position.coords;
                    const stations = await dataSource.findStationsByCoords(latitude, longitude);
                    onStationsFound(stations, [latitude, longitude]);
                    setSearched(true);
                    setQuery(`Current Location (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`);
                } catch (error) {
                    console.error(error);
                    alert('Failed to find stations near your location.');
                } finally {
                    setLoading(false);
                }
            },
            (error) => {
                console.error(error);
                setLoading(false);
                if (error.code === error.PERMISSION_DENIED) {
                    alert('Location permission denied. Please enable location services.');
                } else {
                    alert('Unable to retrieve your location.');
                }
            }
        );
    };

    return (
        <div className="flex flex-col gap-4">
            <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter a city (e.g., Asheville, NC)"
                    className="flex-1 min-w-0 px-4 py-2 rounded-md border border-input bg-background/50 hover:bg-background focus:ring-2 focus:ring-ring transition-all"
                />
                <button
                    type="button"
                    onClick={handleLocation}
                    disabled={loading || !searchEnabled || (!hasApiKey && capabilities?.requiresApiKey)}
                    title="Use my location"
                    className="px-3 py-2 bg-secondary text-secondary-foreground border border-input rounded-md hover:bg-secondary/80 disabled:opacity-50 transition-colors flex items-center justify-center"
                >
                    <MapPin className="h-4 w-4" />
                </button>
                <button
                    type="submit"
                    disabled={loading || !searchEnabled || (!hasApiKey && capabilities?.requiresApiKey)}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                    {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Search className="h-4 w-4" />}
                    Search
                </button>
            </form>
            {!hasApiKey && capabilities?.requiresApiKey && (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 animate-in fade-in slide-in-from-top-1">
                    Add your API Token in Settings (top right) to search for stations with this provider.
                </p>
            )}
            {searched && (
                <p className="text-sm text-muted-foreground animate-in fade-in slide-in-from-top-1">
                    Search complete. Check the map for results.
                </p>
            )}
        </div>
    );
}
