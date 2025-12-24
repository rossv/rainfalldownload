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
                                This comprehensive tool allows you to easily fetch, visualize, and export precipitation data from NOAA's extensive database.
                            </p>

                            <div className="space-y-4">
                                <section>
                                    <h3 className="text-foreground font-semibold mb-2">1. Find Stations</h3>
                                    <ul className="list-disc ml-5 space-y-1">
                                        <li>Use the <strong>Find Stations</strong> panel to search by city, zip code, or manually navigate the map.</li>
                                        <li>Stations will appear on the map as markers. Click on them to see details.</li>
                                    </ul>
                                </section>

                                <section>
                                    <h3 className="text-foreground font-semibold mb-2">2. Select Stations</h3>
                                    <ul className="list-disc ml-5 space-y-1">
                                        <li>Click on a station marker or select it from the list to add it to your selection.</li>
                                        <li>You can select multiple stations to compare data or download in bulk.</li>
                                    </ul>
                                </section>

                                <section>
                                    <h3 className="text-foreground font-semibold mb-2">3. Configure Query</h3>
                                    <ul className="list-disc ml-5 space-y-1">
                                        <li><strong>Date Range:</strong> Choose the start and end dates for your data.</li>
                                        <li><strong>Data Types:</strong> Select specific data types (e.g., Precipitation, Snowfall) available for the selected stations.</li>
                                        <li><strong>Units:</strong> Toggle between Standard (inches) and Metric (mm).</li>
                                    </ul>
                                </section>

                                <section>
                                    <h3 className="text-foreground font-semibold mb-2">4. Fetch & Export</h3>
                                    <ul className="list-disc ml-5 space-y-1">
                                        <li>Click <strong>Fetch Rainfall Data</strong> to retrieve the records.</li>
                                        <li>Visualize the data on the interactive chart.</li>
                                        <li>Export the data as a <strong>CSV</strong> file or in <strong>SWMM</strong> format for hydraulic modeling.</li>
                                    </ul>
                                </section>

                                <div className="bg-muted p-3 rounded-md border border-border text-xs">
                                    <strong>Note:</strong> You need a valid NOAA API Token to fetch data. Get one for free from NCDC NOAA and enter it in the Settings menu.
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
                            <p className="italic text-foreground">
                                "I wrote this, Ross Volkwein with AI code assistance."
                            </p>

                            <hr className="border-border" />

                            <section>
                                <h3 className="text-foreground font-semibold mb-2">Original Legacy</h3>
                                <p>
                                    This application builds upon the work of the <a href="https://pypi.org/project/swmmtoolbox/" className="text-primary hover:underline" target="_blank" rel="noreferrer">swmmtoolbox</a> library by
                                    <strong className="text-foreground"> Tim Cera</strong>. The legacy Python application provided the foundation for the logic used to communicate with the NOAA CDO API.
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
