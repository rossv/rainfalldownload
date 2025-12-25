import { Outlet, Link } from 'react-router-dom';
import { CloudRain, Settings as SettingsIcon, Moon, Sun, HelpCircle } from 'lucide-react'; // Renamed Settings to SettingsIcon to avoid conflict if any, though it wasn't conflicted before. Actually Layout used Settings as icon name.
import { usePreferences } from '../hooks/usePreferences';
import { SettingsModal } from './SettingsModal';
import { HelpModal } from './HelpModal';
import { useMemo, useState } from 'react';
import { listProviders } from '../services/providers';

export function Layout() {
    const { preferences, toggleDarkMode, updateCredentials, setProvider } = usePreferences();
    const [showSettings, setShowSettings] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const providers = listProviders();
    const activeProvider = providers.find(p => p.id === preferences.providerId);
    const credentialsVersion = useMemo(() => JSON.stringify(preferences.credentials), [preferences.credentials]);

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col font-sans transition-colors duration-200">
            <header className="border-b border-border bg-card p-4 sticky top-0 z-30 shadow-sm backdrop-blur-md bg-opacity-80">
                <div className="container mx-auto flex justify-between items-center">
                    <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                        <div className="bg-primary/10 p-2 rounded-lg">
                            <CloudRain className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
                                Rainfall Downloader
                            </h1>
                            <p className="text-xs text-muted-foreground">
                                {activeProvider ? `Using ${activeProvider.name}. Configure providers in Settings.` : 'Multi-provider rainfall data interface'}
                            </p>
                        </div>
                    </Link>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowHelp(true)}
                            className="text-sm font-medium hover:text-primary transition-colors hidden md:flex items-center gap-1 mr-4"
                        >
                            <HelpCircle className="h-4 w-4" /> Help
                        </button>
                        <button
                            onClick={toggleDarkMode}
                            className="p-2 hover:bg-muted rounded-full transition-colors"
                            title="Toggle Theme"
                        >
                            {preferences.darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                        </button>
                        <button
                            onClick={() => setShowSettings(true)}
                            className="p-2 hover:bg-muted rounded-full transition-colors"
                            title="Settings"
                        >
                            <SettingsIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1">
                <Outlet context={{ preferences }} />
            </main>

            <footer className="border-t border-border p-6 bg-card mt-auto">
                <div className="container mx-auto flex flex-col md:flex-row justify-between items-center text-sm text-muted-foreground gap-4">
                    <p>© 2025 Rainfall Downloader. Open Source.</p>
                    <div className="flex gap-4">
                        <button onClick={() => setShowHelp(true)} className="hover:text-foreground transition-colors">Help & Info</button>
                    </div>
                </div>
            </footer>

            <SettingsModal
                key={`${preferences.providerId}-${credentialsVersion}-${showSettings ? 'open' : 'closed'}`}
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
                providerId={preferences.providerId}
                providers={providers}
                credentials={preferences.credentials}
                onSave={({ credentials, providerId }) => {
                    Object.entries(credentials).forEach(([id, creds]) => {
                        updateCredentials(id as (typeof providers)[number]['id'], creds);
                    });
                    setProvider(providerId);
                }}
            />

            <HelpModal
                isOpen={showHelp}
                onClose={() => setShowHelp(false)}
            />
        </div>
    );
}


