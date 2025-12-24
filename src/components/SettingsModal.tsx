import { Settings as SettingsIcon, X, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

interface SettingsProps {
    apiKey: string;
    onSave: (key: string) => void;
    isOpen: boolean;
    onClose: () => void;
}

export function SettingsModal({ apiKey, onSave, isOpen, onClose }: SettingsProps) {
    const [key, setKey] = useState(apiKey);
    const [showPassword, setShowPassword] = useState(false);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-lg shadow-lg max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <SettingsIcon className="h-5 w-5" /> Settings
                    </h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">NOAA API Token</label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={key}
                                onChange={(e) => setKey(e.target.value)}
                                className="w-full px-3 py-2 pr-10 rounded-md border border-input bg-background"
                                placeholder="Enter your token..."
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Required to fetch data. Get one at <a href="https://www.ncdc.noaa.gov/cdo-web/token" target="_blank" rel="noreferrer" className="underline hover:text-primary">NCDC NOAA</a>.
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <button onClick={onClose} className="px-4 py-2 hover:bg-muted rounded-md transition-colors">Cancel</button>
                        <button
                            onClick={() => { onSave(key.trim()); onClose(); }}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
