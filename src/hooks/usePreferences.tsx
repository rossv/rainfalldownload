import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'rainfall_prefs';

import { listProviders, type ProviderId } from '../services/providers';
import type { ProviderCredentials } from '../types/data-source';

interface Preferences {
    providerId: ProviderId;
    credentials: Record<ProviderId, ProviderCredentials>;
    units: 'standard' | 'metric';
    darkMode: boolean;
}

const buildDefaultCredentials = (): Record<ProviderId, ProviderCredentials> => {
    return listProviders().reduce((acc, provider) => {
        acc[provider.id] = { token: '', apiKey: '' };
        return acc;
    }, {} as Record<ProviderId, ProviderCredentials>);
};

type StoredPreferences = Partial<Preferences> & { apiKey?: string };

const isStoredPreferences = (value: unknown): value is StoredPreferences => {
    return typeof value === 'object' && value !== null;
};

const DEFAULT_PREFS: Preferences = {
    providerId: 'noaa',
    credentials: buildDefaultCredentials(),
    units: 'standard',
    darkMode: false
};

const withDefaults = (stored: unknown): Preferences => {
    const defaults = { ...DEFAULT_PREFS, credentials: buildDefaultCredentials() };

    if (!isStoredPreferences(stored)) return defaults;

    const providerId: ProviderId = listProviders().some(p => p.id === stored.providerId) ? stored.providerId : defaults.providerId;

    const credentials: Record<ProviderId, ProviderCredentials> = {
        ...defaults.credentials,
        ...(stored.credentials ?? {})
    };

    // Migration path: old prefs stored apiKey at the top level
    if (typeof stored.apiKey === 'string') {
        credentials[providerId] = {
            ...(credentials[providerId] ?? {}),
            token: stored.apiKey,
            apiKey: stored.apiKey
        };
    }

    return {
        providerId,
        credentials,
        units: stored.units === 'metric' ? 'metric' : 'standard',
        darkMode: Boolean(stored.darkMode)
    };
};

interface PreferencesContextValue {
    preferences: Preferences;
    updateCredentials: (providerId: ProviderId, credentials: ProviderCredentials) => void;
    setProvider: (providerId: Preferences['providerId']) => void;
    toggleDarkMode: () => void;
    setUnits: (units: 'standard' | 'metric') => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
    const [prefs, setPrefs] = useState<Preferences>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? withDefaults(JSON.parse(stored)) : DEFAULT_PREFS;
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

    const updateCredentials = (providerId: ProviderId, credentials: ProviderCredentials) => setPrefs(p => ({
        ...p,
        credentials: {
            ...p.credentials,
            [providerId]: {
                ...(p.credentials[providerId] ?? {}),
                ...credentials
            }
        }
    }));
    const setProvider = (providerId: Preferences['providerId']) => setPrefs(p => ({
        ...p,
        providerId,
        credentials: {
            ...buildDefaultCredentials(),
            ...p.credentials
        }
    }));
    const toggleDarkMode = () => setPrefs(p => ({ ...p, darkMode: !p.darkMode }));
    const setUnits = (units: 'standard' | 'metric') => setPrefs(p => ({ ...p, units }));

    return (
        <PreferencesContext.Provider value={{ preferences: prefs, updateCredentials, setProvider, toggleDarkMode, setUnits }}>
            {children}
        </PreferencesContext.Provider>
    );
}

// Hooks are exported from this module alongside the provider for convenience in consumers.
// eslint-disable-next-line react-refresh/only-export-components
export function usePreferences() {
    const context = useContext(PreferencesContext);
    if (!context) {
        throw new Error('usePreferences must be used within a PreferencesProvider');
    }
    return context;
}
