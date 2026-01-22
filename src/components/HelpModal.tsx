import { X, HelpCircle, FileText, Info } from 'lucide-react';
import { useState } from 'react';

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type Tab = 'help' | 'changelog' | 'acknowledgements';

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
    const [activeTab, setActiveTab] = useState<Tab>('help');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border rounded-lg shadow-lg max-w-2xl w-full flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center p-6 border-b border-border">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <HelpCircle className="h-5 w-5" /> Help & Information
                    </h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex border-b border-border">
                    <button
                        onClick={() => setActiveTab('help')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'help'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                    >
                        <HelpCircle className="h-4 w-4" /> Help
                    </button>
                    <button
                        onClick={() => setActiveTab('changelog')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'changelog'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                    >
                        <FileText className="h-4 w-4" /> Changelog
                    </button>
                    <button
                        onClick={() => setActiveTab('acknowledgements')}
                        className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'acknowledgements'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                    >
                        <Info className="h-4 w-4" /> Acknowledgements
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar">
                    {activeTab === 'help' && (
                        <div className="space-y-6 text-sm text-muted-foreground">
                            <p className="text-foreground text-base font-medium">
                                Welcome to the Rainfall Downloader!
                            </p>
                            <p>
                                Fetch, visualize, and export precipitation records. NOAA CDO works today; additional providers are on the roadmap so you can pick the source that matches your coverage, latency, and credential needs.
                            </p>

                            <div className="space-y-4">
                                <section>
                                    <h3 className="text-foreground font-semibold mb-2">Core workflow</h3>
                                    <ol className="list-decimal ml-5 space-y-1">
                                        <li>Use <strong>Find Stations</strong> to search by city/ZIP or pan the map, then select station markers.</li>
                                        <li>Review availability timelines to confirm date ranges and data types (e.g., PRCP).</li>
                                        <li>Choose date range, units (Standard/Metric), and data types, then click <strong>Fetch Rainfall Data</strong>.</li>
                                        <li>Export the charted results as <strong>CSV</strong> or <strong>SWMM</strong> files.</li>
                                    </ol>
                                </section>

                                <section className="space-y-2">
                                    <h3 className="text-foreground font-semibold">Supported & upcoming providers</h3>
                                    <ul className="list-disc ml-5 space-y-1">
                                        <li><strong>NOAA CDO (live):</strong> Station-based daily/hourly precipitation; ~24 h latency; requires a free CDO token.</li>
                                        <li><strong>NOAA HRRR (roadmap):</strong> 3 km rapid-refresh model grids; updates hourly with ~18 h forecasts; rolling ~30-day archive.</li>
                                        <li><strong>NASA GPM IMERG (roadmap):</strong> 0.1° gridded, 30-min/daily; ~12–24 h latency; requires Earthdata Login token.</li>
                                        <li><strong>Meteostat (roadmap):</strong> Station hourly/daily; ~1–3 h latency; no token; best coverage in Europe/NA.</li>
                                        <li><strong>OpenWeatherMap (roadmap):</strong> Point current/forecast hourly precip; minute-level latency; free API key; daily archives limited.</li>
                                    </ul>
                                    <p className="text-xs">Known limits: per-token request caps (NOAA), coastal bias in some IMERG tiles, Meteostat station gaps, and OWM free-tier call limits.</p>
                                </section>

                                <section className="space-y-2">
                                    <h3 className="text-foreground font-semibold">Get free tokens</h3>
                                    <ul className="list-disc ml-5 space-y-1">
                                        <li><strong>NOAA CDO:</strong> Request a token at <a className="text-primary hover:underline" href="https://www.ncdc.noaa.gov/cdo-web/token" target="_blank" rel="noreferrer">NCEI CDO</a>, then paste it into <strong>Settings</strong>.</li>
                                        <li><strong>NASA Earthdata:</strong> Create an <a className="text-primary hover:underline" href="https://urs.earthdata.nasa.gov/" target="_blank" rel="noreferrer">Earthdata Login</a>, approve the GPM IMERG app, and generate an app-specific token.</li>
                                        <li><strong>Meteostat:</strong> No key required; keep a contact email ready for the `User-Agent` header if requested.</li>
                                        <li><strong>OpenWeatherMap:</strong> Sign up, create a key under <em>My API keys</em>, and verify the free-tier limits (1k calls/day at 1 Hz).</li>
                                    </ul>
                                </section>

                                <section className="space-y-2">
                                    <h3 className="text-foreground font-semibold">Units, resolution, and latency</h3>
                                    <ul className="list-disc ml-5 space-y-1">
                                        <li><strong>Units:</strong> NOAA returns tenths of mm (metric) or hundredths of inches (standard). IMERG/Meteostat use mm; OWM `rain`/`snow` fields are mm.</li>
                                        <li><strong>Resolution:</strong> NOAA is station-based; IMERG is 0.1° grids; Meteostat covers stations; OWM is point current/forecast.</li>
                                        <li><strong>Latency:</strong> NOAA ~24 h; HRRR updates hourly; IMERG ~12–24 h (Late/Final); Meteostat ~1–3 h; OWM near-real-time for current/forecast.</li>
                                    </ul>
                                </section>

                                <section className="space-y-2">
                                    <h3 className="text-foreground font-semibold">Pick the right provider</h3>
                                    <ul className="list-disc ml-5 space-y-1">
                                        <li><strong>Known gauge near your site:</strong> NOAA CDO for QC’d station records and long archives.</li>
                                        <li><strong>Short-term modeled precip or forecasts:</strong> NOAA HRRR for rapid-refresh gridded guidance.</li>
                                        <li><strong>Ungauged basin or gridded forcing:</strong> NASA GPM IMERG for uniform coverage.</li>
                                        <li><strong>Fast updates in Europe/NA:</strong> Meteostat for frequent refreshes.</li>
                                        <li><strong>Quick-look or forecasts:</strong> OpenWeatherMap for near-term point precipitation.</li>
                                    </ul>
                                </section>

                                <div className="bg-muted p-3 rounded-md border border-border text-xs">
                                    <strong>Tip:</strong> Enter your NOAA token in <strong>Settings</strong> today, and pre-stage Earthdata/OWM credentials so you can plug them in as new connectors land.
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'changelog' && (
                        <div className="space-y-8 relative border-l border-border pl-6 ml-2">
                            <div className="relative">
                                <div className="absolute -left-[31px] bg-primary rounded-full h-4 w-4 border-2 border-background" />
                                <h2 className="text-lg font-semibold text-foreground">v2.0.0 - Modern Web App</h2>
                                <p className="text-xs text-muted-foreground mb-3">Released: December 2025</p>
                                <ul className="list-disc ml-4 text-sm text-muted-foreground space-y-1">
                                    <li>Complete rewrite as a Progressive Web App (PWA) using React & Vite.</li>
                                    <li>New modern "DesignStorms" inspired UI with Dark Mode.</li>
                                    <li>Interactive map selection using Leaflet.</li>
                                    <li>Instant chart visualization.</li>
                                    <li>Client-side caching of API requests to save quota.</li>
                                    <li>Github Pages deployment support.</li>
                                </ul>
                            </div>

                            <div className="relative">
                                <div className="absolute -left-[31px] bg-muted-foreground rounded-full h-4 w-4 border-2 border-background" />
                                <h2 className="text-lg font-semibold text-muted-foreground">v1.x - Legacy Python App</h2>
                                <p className="text-xs text-muted-foreground mb-3">Released: 2021</p>
                                <ul className="list-disc ml-4 text-sm text-muted-foreground space-y-1">
                                    <li>Desktop GUI built with PyQt5.</li>
                                    <li>Basic station search and CSV downloading.</li>
                                    <li>Support for SWMM timeseries format.</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {activeTab === 'acknowledgements' && (
                        <div className="space-y-6 text-sm text-muted-foreground">
                            <section>
                                <h3 className="text-foreground font-semibold mb-2">Created By</h3>
                                <p>
                                    Ross Volkwein
                                </p>
                            </section>

                            <section>
                                <h3 className="text-foreground font-semibold mb-2">Development</h3>
                                <p>
                                    This application was built with the assistance of AI coding assistants.
                                </p>
                            </section>

                            <section>
                                <h3 className="text-foreground font-semibold mb-2">Data Source</h3>
                                <p>
                                    All weather data is provided by the <a href="https://www.ncdc.noaa.gov/cdo-web/webservices/v2" className="text-primary hover:underline" target="_blank" rel="noreferrer">NOAA National Centers for Environmental Information (NCEI)</a> via their Climate Data Online (CDO) API.
                                </p>
                            </section>

                            <section>
                                <h3 className="text-foreground font-semibold mb-2">Technology Stack</h3>
                                <p>
                                    Built with React, TypeScript, Tailwind CSS, Leaflet, and Recharts.
                                </p>
                            </section>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-border bg-card/50 flex justify-end rounded-b-lg">
                    <button onClick={onClose} className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
