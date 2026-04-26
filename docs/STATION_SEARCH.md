# Station Search

This document describes how station search works across the different data providers in the Rainfall Downloader application.

## Overview

The station search functionality allows users to find weather/hydrological stations by:
- **City or location name** (e.g., "Pittsburgh, PA") — geocoded via Nominatim, then used for coordinate-based station search.
- **Station ID** — direct lookup by provider-specific station identifier.
- **Coordinates** — latitude/longitude bounding box search.
- **Browser geolocation** — uses the device's GPS to find nearby stations.

## Provider-Specific Behavior

### NOAA Climate Data Online

**Search by city:** Query → Nominatim geocoding → NOAA `/stations` endpoint with bounding box.

**Search by station ID:** The search bar detects known station ID patterns and routes directly to the NOAA `/stations/{id}` endpoint. Recognized patterns:

| Pattern | Example | Description |
|---------|---------|-------------|
| `GHCND:*` | `GHCND:US1PAAL0011` | GHCND-prefixed station ID |
| `COOP:*` | `COOP:366233` | COOP network station |
| `WBAN:*` | `WBAN:14762` | Weather Bureau Army Navy ID |
| `USW0*` | `USW00094823` | US Weather station (raw) |
| `USC0*` | `USC00360106` | US Cooperative station (raw) |
| `US1*` | `US1PAAL0011` | CoCoRaHS station (raw) |

Raw IDs (without `:`) are automatically prefixed with the current dataset (e.g., `GHCND:`).

**Requires:** NOAA CDO API token (free, from [NOAA CDO Token](https://www.ncdc.noaa.gov/cdo-web/token)).

### USGS NWIS

**Search by city:** Query → Nominatim geocoding → USGS IV endpoint with bounding box.

**Search by site number:** If the query is 8–15 digits, it's treated as a USGS site number and looked up directly via the IV endpoint.

| Pattern | Example | Description |
|---------|---------|-------------|
| `\d{8,15}` | `03049500` | USGS numeric site ID |

**Does NOT require an API key.**

### Synoptic Data

**Search by city:** Query → Nominatim geocoding → Synoptic metadata endpoint with radius search.

**Requires:** Synoptic API token.

### NOAA HRRR

**Point selection only** — does not support traditional station search. Users click the map or enter coordinates to create a virtual station.

## CORS Proxy Configuration

Several external APIs do not support CORS (Cross-Origin Resource Sharing), so the dev server proxies these requests:

| Proxy Path | Target | Purpose |
|------------|--------|---------|
| `/api/noaa` | `https://www.ncdc.noaa.gov/cdo-web/api/v2` | NOAA CDO API |
| `/api/usgs` | `https://waterservices.usgs.gov/nwis` | USGS WaterServices |
| `/api/nominatim` | `https://nominatim.openstreetmap.org/search` | Geocoding |
| `/api/hrrr` | Configurable via `HRRR_PROXY_TARGET` | HRRR data service |

These are configured in `vite.config.ts` under `server.proxy`.

### Production CORS

For production builds (e.g., GitHub Pages), NOAA and Nominatim proxies must be configured via environment variables:
- `VITE_NOAA_PROXY_BASE` — e.g., a Cloudflare Worker URL
- `VITE_USGS_PROXY_BASE` — e.g., a serverless proxy
- `VITE_NOMINATIM_PROXY_BASE` — Nominatim supports CORS natively, so this may not be needed

## Troubleshooting

### "Add your API token" warning
The NOAA and Synoptic providers require API tokens. Click the gear icon (Settings) in the top right to add your token.

### Station search returns no results
1. **Check your API token** — an invalid token returns empty results silently.
2. **Try a broader search** — some areas have sparse station coverage.
3. **Check the dataset** — stations available in GHCND may not be in PRECIP_HLY.
4. **Try a station ID** — if you know the exact station ID, type it directly.

### USGS search fails in production
USGS WaterServices does not support CORS. If `VITE_USGS_PROXY_BASE` is not configured, USGS requests will fail in production builds. See [CORS Proxy Configuration](#cors-proxy-configuration) above.

### Network errors / timeouts
All providers implement retry logic with exponential backoff. If you see persistent timeouts:
- NOAA: The CDO API can be slow; retries up to 3 times with 1-8 second delays.
- USGS: Retries up to 2 times.
- Nominatim: Retries up to 2 times with 400ms backoff.

## Architecture

```
User Search Query
       │
       ├── Station ID detected? ──→ Direct /stations/{id} lookup
       │
       └── Location name ──→ Nominatim geocoding
                                    │
                                    └── Coordinates ──→ /stations?extent=bbox
```

Each provider implements the `DataSource` interface defined in `src/types/data-source.ts`:
- `findStationsByCity(city)` — text search (geocodes then delegates to coords)
- `findStationsByCoords(lat, lon)` — bounding box search
- `getAvailableDataTypes(stationId)` — what parameters a station supports
- `fetchData(params)` — download actual time series data
