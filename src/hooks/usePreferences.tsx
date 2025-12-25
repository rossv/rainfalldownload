import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getProviderDefinition, PROVIDERS } from '../lib/providers';
import type { ProviderCredentialBlob, ProviderId } from '../types/providers';

const STORAGE_KEY = 'rainfall_prefs';

export interface Preferences {
    activeProviderId: ProviderId;
    providerCredentials: Record<ProviderId, ProviderCredentialBlob>;
    units: 'standard' | 'metric';
    darkMode: boolean;
}

const DEFAULT_PROVIDER_CREDENTIALS: Record<ProviderId, ProviderCredentialBlob> = PROVIDERS.reduce(
    (acc, provider) => {
        acc[provider.id] = provider.credentialFields.reduce<ProviderCredentialBlob>((fields, field) => {
            fields[field.key as string] = '';
            return fields;
        }, {});
        return acc;
    },
    {} as Record<ProviderId, ProviderCredentialBlob>
);

const DEFAULT_PREFS: Preferences = {
    activeProviderId: PROVIDERS[0].id,
    providerCredentials: DEFAULT_PROVIDER_CREDENTIALS,
    units: 'standard',
    darkMode: false
};

interface PreferencesContextValue {
    preferences: Preferences;
    updateProviderCredentials: (id: ProviderId, credentials: ProviderCredentialBlob) => void;
    setActiveProvider: (id: ProviderId) => void;
    toggleDarkMode: () => void;
    setUnits: (units: 'standard' | 'metric') => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
    const [prefs, setPrefs] = useState<Preferences>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            const parsed = stored ? JSON.parse(stored) : {};

            const migratedCredentials: Record<ProviderId, ProviderCredentialBlob> = {
                ...DEFAULT_PROVIDER_CREDENTIALS,
                ...(parsed.providerCredentials || {})
            };

            if (parsed.apiKey && !migratedCredentials.noaa?.token) {
                migratedCredentials.noaa = { ...migratedCredentials.noaa, token: parsed.apiKey };
            }

            const activeProviderId = (parsed.activeProviderId || DEFAULT_PREFS.activeProviderId) as ProviderId;

            return {
                ...DEFAULT_PREFS,
                ...parsed,
                activeProviderId: getProviderDefinition(activeProviderId).id,
                providerCredentials: migratedCredentials
            };
        } catch {
            return DEFAULT_PREFS;
        }
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
        if (prefs.darkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [prefs]);

    const updateProviderCredentials = (id: ProviderId, credentials: ProviderCredentialBlob) => {
        setPrefs(p => ({
            ...p,
            providerCredentials: {
                ...DEFAULT_PROVIDER_CREDENTIALS,
                ...p.providerCredentials,
                [id]: {
                    ...(p.providerCredentials[id] || {}),
                    ...credentials
                }
            }
        }));
    };

    const setActiveProvider = (id: ProviderId) => setPrefs(p => ({ ...p, activeProviderId: id }));
    const toggleDarkMode = () => setPrefs(p => ({ ...p, darkMode: !p.darkMode }));
    const setUnits = (units: 'standard' | 'metric') => setPrefs(p => ({ ...p, units }));

    return (
        <PreferencesContext.Provider value={{ preferences: prefs, updateProviderCredentials, setActiveProvider, toggleDarkMode, setUnits }}>
            {children}
        </PreferencesContext.Provider>
    );
}

export function usePreferences() {
    const context = useContext(PreferencesContext);
    if (!context) {
        throw new Error('usePreferences must be used within a PreferencesProvider');
    }
    return context;
}
