import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Station } from '../types';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import { formatDate } from '../lib/dateUtils';

// Fix Leaflet default icon issue in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

let GreyIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    className: 'leaflet-marker-grey' // Defined in CSS with filter: grayscale(100%)
});

let RedIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    className: 'leaflet-marker-red' // CSS filter: hue-rotate
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapProps {
    stations: Station[];
    selectedStations: Station[];
    onToggleStation: (station: Station) => void;
    center?: [number, number];
}

function MapUpdater({ center }: { center?: [number, number] }) {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.flyTo(center, 10);
        }
    }, [center, map]);
    return null;
}

export function StationMap({ stations, selectedStations, onToggleStation, center }: MapProps) {
    const [darkMode, setDarkMode] = useState(document.documentElement.classList.contains('dark'));
    const [hoveredStation, setHoveredStation] = useState<Station | null>(null);

    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    setDarkMode(document.documentElement.classList.contains('dark'));
                }
            });
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });

        return () => observer.disconnect();
    }, []);

    // Calculate one year ago from today
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const thresholdDateStr = oneYearAgo.toISOString().split('T')[0];

    // Determines which station to show in overlay: hovered or last selected (optional, or just hovered)
    // Let's show hovered. If none hovered, maybe show nothing or help text.
    // Plan said: "Displays details of the currently hovered station (or last selected if none hovered)."

    // For simplicity and clarity, let's prioritize hovered, then fall back to the most recently selected one if any.
    const activeDisplayStation = hoveredStation || (selectedStations.length > 0 ? selectedStations[selectedStations.length - 1] : null);

    return (
        <div className="h-full w-full rounded-lg overflow-hidden border border-border shadow-sm relative group">
            <style>{`
                .leaflet-marker-grey {
                    filter: grayscale(100%);
                }
                .leaflet-marker-red {
                    filter: hue-rotate(140deg) saturate(3) brightness(0.7); /* Adjust to make it red. Default blue is around 210deg. Red is 0. */
                    /* Blue (210) + 150 = 360 (Red). */
                }
            `}</style>
            <MapContainer
                center={center || [39.8283, -98.5795]}
                zoom={center ? 10 : 4}
                style={{ height: '100%', width: '100%' }}
                className="z-0"
            >
                {darkMode ? (
                    <TileLayer
                        key="dark"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    />
                ) : (
                    <TileLayer
                        key="light"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                )}
                <MapUpdater center={center} />
                {stations.map(st => {
                    const isSelected = selectedStations.some(s => s.id === st.id);

                    // Check if data is old (older than 1 year)
                    // If maxdate is missing, treat as old
                    let isOld = true;
                    if (st.maxdate) {
                        isOld = st.maxdate < thresholdDateStr;
                    }

                    // Icon selection logic
                    let icon = DefaultIcon;
                    if (isSelected) {
                        icon = RedIcon;
                    } else if (isOld) {
                        icon = GreyIcon;
                    }

                    return (
                        <Marker
                            key={st.id}
                            position={[st.latitude, st.longitude]}
                            opacity={isSelected ? 1.0 : 0.6}
                            icon={icon}
                            eventHandlers={{
                                click: () => onToggleStation(st),
                                mouseover: () => setHoveredStation(st),
                                mouseout: () => setHoveredStation(null)
                            }}
                        >

                        </Marker>
                    )
                })}
            </MapContainer>

            {/* Station Status Overlay */}
            <div className="absolute bottom-4 left-4 z-20 bg-background/90 backdrop-blur-sm border border-border p-4 rounded-lg shadow-lg max-w-xs transition-all duration-300 pointer-events-none">
                {activeDisplayStation ? (
                    <div className="space-y-1">
                        <h3 className="font-bold text-sm leading-tight text-foreground">{activeDisplayStation.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">ID: {activeDisplayStation.id}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
                            <div>
                                <span className="text-muted-foreground">Coverage:</span>
                                <span className="ml-1 font-medium">{(activeDisplayStation.datacoverage ? activeDisplayStation.datacoverage * 100 : 0).toFixed(2)}%</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground mr-1">Dates:</span>
                                <span className="font-medium">{formatDate(activeDisplayStation.mindate)} - {formatDate(activeDisplayStation.maxdate)}</span>
                            </div>
                        </div>
                        <div className="pt-2 text-[10px] text-muted-foreground italic">
                            {selectedStations.some(s => s.id === activeDisplayStation.id) ? "Selected" : "Click pin to select"}
                        </div>
                    </div>
                ) : (
                    <div className="text-xs text-muted-foreground italic">
                        Hover over a station to see details.
                    </div>
                )}
            </div>
        </div>
    );
}
