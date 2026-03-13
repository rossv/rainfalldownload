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
                                Fetch, visualize, and export precipitation records from multiple live providers: NOAA CDO, USGS NWIS, Synoptic Data, and NOAA HRRR.
                            </p>

                            <div className="space-y-4">
                                <section>
                                    <h3 className="text-foreground font-semibold mb-2">Core workflow</h3>
                                    <ol className="list-decimal ml-5 space-y-1">
                                        <li>Select a provider and enter credentials in <strong>Settings</strong> if needed.</li>
                                        <li>Use <strong>Find Stations</strong> to search by city/ZIP or map. For HRRR, choose a map point.</li>
                                        <li>Review available datatypes and date ranges before requesting data.</li>
                                        <li>Choose date range and units, then click <strong>Fetch Rainfall Data</strong>.</li>
                                        <li>Export the charted results as <strong>CSV</strong> or <strong>SWMM</strong> files.</li>
                                    </ol>
                                </section>

                                <section className="space-y-2">
                                    <h3 className="text-foreground font-semibold">Supported providers</h3>
                                    <ul className="list-disc ml-5 space-y-1">
                                        <li><strong>NOAA CDO:</strong> Station datasets (`GHCND`, `PRECIP_HLY`, `GSOM`, `GSOY`), token required.</li>
                                        <li><strong>USGS NWIS:</strong> Real-time/historical USGS station data, no token required.</li>
                                        <li><strong>Synoptic Data:</strong> Mesonet station metadata/timeseries, token required.</li>
                                        <li><strong>NOAA HRRR:</strong> Gridded rapid-refresh model via `/api/hrrr`, no token required.</li>
                                    </ul>
                                </section>

                                <section className="space-y-2">
                                    <h3 className="text-foreground font-semibold">Credentials and setup links</h3>
                                    <ul className="list-disc ml-5 space-y-1">
                                        <li><strong>NOAA CDO token:</strong> <a className="text-primary hover:underline" href="https://www.ncdc.noaa.gov/cdo-web/token" target="_blank" rel="noreferrer">NCEI CDO</a></li>
                                        <li><strong>Synoptic token:</strong> <a className="text-primary hover:underline" href="https://developers.synopticdata.com/" target="_blank" rel="noreferrer">Synoptic Developer Portal</a></li>
                                        <li><strong>USGS NWIS:</strong> Public endpoints, no key required.</li>
                                        <li><strong>NOAA HRRR:</strong> Public data, but local/deployed `/api/hrrr` backend is required.</li>
                                    </ul>
                                </section>

                                <section className="space-y-2">
                                    <h3 className="text-foreground font-semibold">Provider fit guide</h3>
                                    <ul className="list-disc ml-5 space-y-1">
                                        <li><strong>Long historical station rainfall:</strong> NOAA CDO.</li>
                                        <li><strong>Hydrology and stream/water context:</strong> USGS NWIS.</li>
                                        <li><strong>Dense mesonet station coverage:</strong> Synoptic Data.</li>
                                        <li><strong>Gridded short-term forcing:</strong> NOAA HRRR.</li>
                                    </ul>
                                </section>

                                <div className="bg-muted p-3 rounded-md border border-border text-xs">
                                    <strong>Tip:</strong> If station search returns no results, confirm the selected provider and token first, then retry with a nearby city or map pan.
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'changelog' && (
                        <div className="space-y-8 relative border-l border-border pl-6 ml-2">
                            <div className="relative">
                                <div className="absolute -left-[31px] bg-primary rounded-full h-4 w-4 border-2 border-background" />
                                <h2 className="text-lg font-semibold text-foreground">v2.1.0 - Multi-Provider Documentation Refresh</h2>
                                <p className="text-xs text-muted-foreground mb-3">Released: March 2026</p>
                                <ul className="list-disc ml-4 text-sm text-muted-foreground space-y-1">
                                    <li>Updated in-app help to reflect all currently supported providers.</li>
                                    <li>Clarified credential requirements for NOAA and Synoptic.</li>
                                    <li>Aligned provider guidance with current station/HRRR workflows.</li>
                                </ul>
                            </div>

                            <div className="relative">
                                <div className="absolute -left-[31px] bg-muted-foreground rounded-full h-4 w-4 border-2 border-background" />
                                <h2 className="text-lg font-semibold text-muted-foreground">v2.0.0 - Modern Web App</h2>
                                <p className="text-xs text-muted-foreground mb-3">Released: December 2025</p>
                                <ul className="list-disc ml-4 text-sm text-muted-foreground space-y-1">
                                    <li>Complete rewrite as a web app using React and Vite.</li>
                                    <li>Interactive map selection and modernized UI.</li>
                                    <li>Client-side caching of API requests to save provider quota.</li>
                                    <li>GitHub Pages deployment support.</li>
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
                                <h3 className="text-foreground font-semibold mb-2">Data Sources</h3>
                                <ul className="list-disc ml-5 space-y-1">
                                    <li><a href="https://www.ncdc.noaa.gov/cdo-web/webservices/v2" className="text-primary hover:underline" target="_blank" rel="noreferrer">NOAA CDO API</a></li>
                                    <li><a href="https://waterservices.usgs.gov/" className="text-primary hover:underline" target="_blank" rel="noreferrer">USGS Water Services</a></li>
                                    <li><a href="https://developers.synopticdata.com/" className="text-primary hover:underline" target="_blank" rel="noreferrer">Synoptic Data API</a></li>
                                    <li><a href="https://rapidrefresh.noaa.gov/hrrr/" className="text-primary hover:underline" target="_blank" rel="noreferrer">NOAA HRRR Model Data</a></li>
                                </ul>
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
