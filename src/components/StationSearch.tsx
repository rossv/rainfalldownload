import { Search, Loader2, MapPin } from 'lucide-react';

interface StationSearchProps {
    query: string;
    onQueryChange: (val: string) => void;
    onSearch: () => void;
    onLocationSearch: () => void;
    loading: boolean;
    disabled: boolean;
    showTokenWarning: boolean;
    showCoordinateInput?: boolean;
    coordinateLat?: string;
    coordinateLon?: string;
    coordinateError?: string | null;
    onCoordinateChange?: (field: 'lat' | 'lon', value: string) => void;
    onCoordinateSubmit?: () => void;
    onCoordinateClear?: () => void;
    disableTextSearch?: boolean;
    datasetId?: string;
    onDatasetChange?: (val: string) => void;
    datasetOptions?: { id: string, label: string }[];
    providerId?: string;
    onProviderChange?: (val: any) => void;
    providerOptions?: { id: string, name: string }[];
}

export function StationSearch({
    query,
    onQueryChange,
    onSearch,
    onLocationSearch,
    loading,
    disabled,
    showTokenWarning,
    showCoordinateInput = false,
    coordinateLat,
    coordinateLon,
    coordinateError,
    onCoordinateChange,
    onCoordinateSubmit,
    onCoordinateClear,
    disableTextSearch = false,
    datasetId,
    onDatasetChange,
    datasetOptions,
    providerId,
    onProviderChange,
    providerOptions
}: StationSearchProps) {
    const showTextSearch = !disableTextSearch;

    return (
        <div className="flex flex-col gap-2">
            <form onSubmit={(e) => { e.preventDefault(); onSearch(); }} className="flex flex-wrap gap-2">
                {providerId && onProviderChange && providerOptions && (
                    <select
                        value={providerId}
                        onChange={(e) => onProviderChange(e.target.value)}
                        className="px-3 py-1 rounded-md border border-input bg-primary/5 hover:bg-primary/10 transition-colors text-xs font-semibold text-primary outline-none focus:ring-2 focus:ring-primary/20"
                        title="Select Data Provider"
                    >
                        {providerOptions.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                )}
                {datasetId && onDatasetChange && datasetOptions && (
                    <select
                        value={datasetId}
                        onChange={(e) => onDatasetChange(e.target.value)}
                        className="px-3 py-1 rounded-md border border-input bg-background/50 hover:bg-background focus:ring-2 focus:ring-ring transition-all text-xs max-w-[200px] font-medium"
                        title="Select Dataset"
                    >
                        {datasetOptions.map(opt => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                    </select>
                )}
                {showTextSearch && (
                    <>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => onQueryChange(e.target.value)}
                            placeholder="Find Stations"
                            aria-label="Search stations"
                            className="flex-1 min-w-0 px-4 py-1 rounded-md border border-input bg-background/50 hover:bg-background focus:ring-2 focus:ring-ring transition-all"
                        />
                        <button
                            type="button"
                            onClick={onLocationSearch}
                            disabled={disabled}
                            title="Use my location"
                            aria-label="Search stations near my location"
                            className="px-3 py-1 bg-secondary text-secondary-foreground border border-input rounded-md hover:bg-secondary/80 disabled:opacity-50 transition-colors flex items-center justify-center"
                        >
                            <MapPin className="h-4 w-4" />
                        </button>
                        <button
                            type="submit"
                            disabled={disabled}
                            aria-label="Search stations"
                            className="px-4 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2 whitespace-nowrap"
                        >
                            {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Search className="h-4 w-4" />}
                            Search
                        </button>
                    </>
                )}
            </form>
            {showCoordinateInput && (
                <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Point Selection
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Latitude (-90 to 90)"
                            value={coordinateLat ?? ''}
                            onChange={(e) => onCoordinateChange?.('lat', e.target.value)}
                            aria-label="Latitude"
                            className="flex-1 min-w-[150px] px-3 py-1 rounded-md border border-input bg-background/70 focus:ring-2 focus:ring-ring transition-all text-sm"
                        />
                        <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Longitude (-180 to 180)"
                            value={coordinateLon ?? ''}
                            onChange={(e) => onCoordinateChange?.('lon', e.target.value)}
                            aria-label="Longitude"
                            className="flex-1 min-w-[150px] px-3 py-1 rounded-md border border-input bg-background/70 focus:ring-2 focus:ring-ring transition-all text-sm"
                        />
                        <button
                            type="button"
                            onClick={onCoordinateSubmit}
                            className="px-3 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm whitespace-nowrap"
                        >
                            Set Point
                        </button>
                        <button
                            type="button"
                            onClick={onCoordinateClear}
                            className="px-3 py-1 border border-input bg-background rounded-md hover:bg-accent transition-colors text-sm whitespace-nowrap"
                        >
                            Clear
                        </button>
                    </div>
                    {coordinateError && (
                        <p className="text-xs text-rose-600">{coordinateError}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Click the map or enter coordinates to create a virtual station.
                    </p>
                </div>
            )}
            {showTokenWarning && (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 animate-in fade-in slide-in-from-top-1">
                    Add your API token or key in Settings (top right) to search for stations with this provider.
                </p>
            )}
        </div>
    );
}
