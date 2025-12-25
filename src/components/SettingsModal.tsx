import { Settings as SettingsIcon, X, Eye, EyeOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ProviderDefinition, ProviderId } from '../services/providers';
import type { ProviderCredentials } from '../types/data-source';

interface SettingsProps {
    credentials: Record<ProviderId, ProviderCredentials>;
    providerId: ProviderId;
    providers: ProviderDefinition[];
    onSave: (values: { credentials: Record<ProviderId, ProviderCredentials>; providerId: ProviderId }) => void;
    isOpen: boolean;
    onClose: () => void;
}

export function SettingsModal({ credentials: initialCredentials, providerId, providers, onSave, isOpen, onClose }: SettingsProps) {
    const [provider, setProvider] = useState<ProviderId>(providerId);
    const [credentials, setCredentials] = useState<Record<ProviderId, ProviderCredentials>>(initialCredentials);
    const [showPassword, setShowPassword] = useState(false);

    const providerDefinition = useMemo(() => providers.find(p => p.id === provider), [providers, provider]);
    const currentCredentials = credentials[provider] ?? {};
    const credentialValue = currentCredentials.token ?? currentCredentials.apiKey ?? '';

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
                        <label className="block text-sm font-medium mb-1">Provider</label>
                        <select
                            value={provider}
                            onChange={(e) => setProvider(e.target.value as ProviderId)}
                            className="w-full px-3 py-2 rounded-md border border-input bg-background"
                        >
                            {providers.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-muted-foreground mt-1">
                            Choose a data provider. Additional sources such as GPM or Meteostat can be added later.
                        </p>
                    </div>

                    <div>
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <label className="block text-sm font-medium">{providerDefinition?.auth?.label ?? 'API Token'}</label>
                            {providerDefinition?.auth?.signupUrl && (
                                <a
                                    href={providerDefinition.auth.signupUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-primary hover:underline"
                                >
                                    Get a key
                                </a>
                            )}
                        </div>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={credentialValue}
                                onChange={(e) => setCredentials(prev => ({
                                    ...prev,
                                    [provider]: {
                                        ...(prev[provider] ?? {}),
                                        token: e.target.value,
                                        apiKey: e.target.value
                                    }
                                }))}
                                className="w-full px-3 py-2 pr-10 rounded-md border border-input bg-background"
                                placeholder={providerDefinition?.auth?.placeholder ?? "Enter your token..."}
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
                            {providerDefinition?.auth?.helperText ?? (
                                providerDefinition?.capabilities.requiresApiKey
                                    ? 'Required to fetch data. Grab a key from the provider.'
                                    : 'Optional depending on provider requirements.'
                            )}
                        </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-4">
                        <button onClick={onClose} className="px-4 py-2 hover:bg-muted rounded-md transition-colors">Cancel</button>
                        <button
                            onClick={() => {
                                const cleaned = {
                                    ...credentials,
                                    [provider]: {
                                        ...(credentials[provider] ?? {}),
                                        token: credentialValue.trim(),
                                        apiKey: credentialValue.trim()
                                    }
                                };
                                onSave({ credentials: cleaned, providerId: provider });
                                onClose();
                            }}
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
