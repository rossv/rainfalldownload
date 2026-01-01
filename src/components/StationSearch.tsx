import { Search, Loader2, MapPin } from 'lucide-react';

interface StationSearchProps {
    query: string;
    onQueryChange: (val: string) => void;
    onSearch: () => void;
    onLocationSearch: () => void;
    loading: boolean;
    disabled: boolean;
    showTokenWarning: boolean;
    datasetId?: string;
    onDatasetChange?: (val: string) => void;
    datasetOptions?: { id: string, label: string }[];
}

export function StationSearch({
    query,
    onQueryChange,
    onSearch,
    onLocationSearch,
    loading,
    disabled,
    showTokenWarning,
    datasetId,
    onDatasetChange,
    datasetOptions
}: StationSearchProps) {
    return (
        <div className="flex flex-col gap-2">
            <form onSubmit={(e) => { e.preventDefault(); onSearch(); }} className="flex flex-wrap gap-2">
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
                <input
                    type="text"
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    placeholder="Find Stations"
                    className="flex-1 min-w-0 px-4 py-1 rounded-md border border-input bg-background/50 hover:bg-background focus:ring-2 focus:ring-ring transition-all"
                />
                <button
                    type="button"
                    onClick={onLocationSearch}
                    disabled={disabled}
                    title="Use my location"
                    className="px-3 py-1 bg-secondary text-secondary-foreground border border-input rounded-md hover:bg-secondary/80 disabled:opacity-50 transition-colors flex items-center justify-center"
                >
                    <MapPin className="h-4 w-4" />
                </button>
                <button
                    type="submit"
                    disabled={disabled}
                    className="px-4 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                    {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Search className="h-4 w-4" />}
                    Search
                </button>
            </form>
            {showTokenWarning && (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 animate-in fade-in slide-in-from-top-1">
                    Add your API Token in Settings (top right) to search for stations with this provider.
                </p>
            )}
        </div>
    );
}
