import { Settings as SettingsIcon, X, Eye, EyeOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ProviderCredentialBlob, ProviderId } from '../types/providers';
import { getProviderDefinition, PROVIDERS } from '../lib/providers';
import type { Preferences } from '../hooks/usePreferences';

interface SettingsProps {
    preferences: Preferences;
    onSaveCredentials: (id: ProviderId, credentials: ProviderCredentialBlob) => void;
    onProviderChange: (id: ProviderId) => void;
    isOpen: boolean;
    onClose: () => void;
}

export function SettingsModal({ preferences, onSaveCredentials, onProviderChange, isOpen, onClose }: SettingsProps) {
    const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
    const [selectedProviderId, setSelectedProviderId] = useState<ProviderId>(preferences.activeProviderId);
    const [credentialDraft, setCredentialDraft] = useState<ProviderCredentialBlob>({});

    const activeProvider = useMemo(
        () => getProviderDefinition(selectedProviderId),
        [selectedProviderId]
    );

    useEffect(() => {
        if (!isOpen) return;
        setSelectedProviderId(preferences.activeProviderId);
        setCredentialDraft(preferences.providerCredentials[preferences.activeProviderId] || {});
    }, [isOpen, preferences]);

    const handleFieldChange = (key: string, value: string) => {
        setCredentialDraft(prev => ({
            ...prev,
            [key]: value
        }));
    };

    const toggleVisibility = (key: string) => {
        setShowPassword(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleProviderSelect = (id: ProviderId) => {
        setSelectedProviderId(id);
        setCredentialDraft(preferences.providerCredentials[id] || {});
    };

    const handleSave = () => {
        const trimmedCredentials: ProviderCredentialBlob = {};
        activeProvider.credentialFields.forEach(field => {
            const value = credentialDraft[field.key as string];
            trimmedCredentials[field.key as string] = typeof value === 'string' ? value.trim() : value;
        });

        onSaveCredentials(selectedProviderId, trimmedCredentials);
        onProviderChange(selectedProviderId);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-lg shadow-lg max-w-xl w-full p-6 animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <SettingsIcon className="h-5 w-5" /> Settings
                    </h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="space-y-5">
                    <div className="space-y-2">
                        <label className="block text-sm font-medium mb-1">Data Provider</label>
                        <select
                            value={selectedProviderId}
                            onChange={(e) => handleProviderSelect(e.target.value as ProviderId)}
                            className="w-full px-3 py-2 rounded-md border border-input bg-background"
                        >
                            {PROVIDERS.map(provider => (
                                <option key={provider.id} value={provider.id}>{provider.name}</option>
                            ))}
                        </select>
                        <p className="text-xs text-muted-foreground">{activeProvider.tagline}</p>
                    </div>

                    <div className="space-y-3">
                        {activeProvider.credentialFields.map(field => (
                            <div key={field.key} className="space-y-1">
                                <label className="block text-sm font-medium">{field.label}</label>
                                <div className="relative">
                                    <input
                                        type={field.type === 'password' && !showPassword[field.key as string] ? 'password' : 'text'}
                                        value={credentialDraft[field.key as string] || ''}
                                        onChange={(e) => handleFieldChange(field.key as string, e.target.value)}
                                        className="w-full px-3 py-2 pr-10 rounded-md border border-input bg-background"
                                        placeholder={field.placeholder}
                                    />
                                    {field.type === 'password' && (
                                        <button
                                            type="button"
                                            onClick={() => toggleVisibility(field.key as string)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            {showPassword[field.key as string] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    )}
                                </div>
                                {field.helperText && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {field.helperText}
                                        {field.signupUrl && (
                                            <>
                                                {' '}
                                                <a
                                                    href={field.signupUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="underline hover:text-primary"
                                                >
                                                    Sign up
                                                </a>
                                            </>
                                        )}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <button onClick={onClose} className="px-4 py-2 hover:bg-muted rounded-md transition-colors">Cancel</button>
                        <button
                            onClick={handleSave}
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
