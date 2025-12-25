import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'rainfall_prefs';

import type { ProviderId } from '../services/providers';

interface Preferences {
    apiKey: string;
    providerId: ProviderId;
    units: 'standard' | 'metric';
    darkMode: boolean;
}

const DEFAULT_PREFS: Preferences = {
    apiKey: '',
    providerId: 'noaa',
    units: 'standard',
    darkMode: false
};

interface PreferencesContextValue {
    preferences: Preferences;
    updateApiKey: (key: string) => void;
    setProvider: (providerId: Preferences['providerId']) => void;
    toggleDarkMode: () => void;
    setUnits: (units: 'standard' | 'metric') => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
    const [prefs, setPrefs] = useState<Preferences>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? { ...DEFAULT_PREFS, ...JSON.parse(stored) } : DEFAULT_PREFS;
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

    const updateApiKey = (key: string) => setPrefs(p => ({ ...p, apiKey: key }));
    const setProvider = (providerId: Preferences['providerId']) => setPrefs(p => ({ ...p, providerId }));
    const toggleDarkMode = () => setPrefs(p => ({ ...p, darkMode: !p.darkMode }));
    const setUnits = (units: 'standard' | 'metric') => setPrefs(p => ({ ...p, units }));

    return (
        <PreferencesContext.Provider value={{ preferences: prefs, updateApiKey, setProvider, toggleDarkMode, setUnits }}>
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
