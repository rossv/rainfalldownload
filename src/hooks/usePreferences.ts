import { useState, useEffect } from 'react';

const STORAGE_KEY = 'rainfall_prefs';

interface Preferences {
    apiKey: string;
    units: 'standard' | 'metric';
    darkMode: boolean;
}

const DEFAULT_PREFS: Preferences = {
    apiKey: '',
    units: 'standard',
    darkMode: false
};

export function usePreferences() {
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
    const toggleDarkMode = () => setPrefs(p => ({ ...p, darkMode: !p.darkMode }));
    const setUnits = (units: 'standard' | 'metric') => setPrefs(p => ({ ...p, units }));

    return { preferences: prefs, updateApiKey, toggleDarkMode, setUnits };
}
