# Rainfall Downloader

[![Built with React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=121212)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Rainfall Downloader is a web app for finding stations (or virtual grid points), charting precipitation-related series, and exporting CSV/SWMM files for modeling workflows.

## Live providers

- `NOAA CDO` (token required): station datasets including `GHCND`, `PRECIP_HLY`, `GSOM`, and `GSOY`
- `USGS NWIS` (no token): station search and IV time-series endpoints
- `Synoptic Data` (token required): station metadata and timeseries
- `NOAA HRRR` (no token): gridded analysis/forecast data through `/api/hrrr`

## Getting started

### Prerequisites

- Node.js 20+ and npm
- Optional provider credentials:
  - NOAA CDO token: <https://www.ncdc.noaa.gov/cdo-web/token>
  - Synoptic token: <https://developers.synopticdata.com/>

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

The dev server runs at <http://localhost:5173/rainfalldownload/#/>.

### Configure provider credentials

1. Open **Settings** in the app header.
2. Select a provider.
3. Enter credentials if that provider requires them (NOAA, Synoptic).
4. Preferences are stored in `localStorage`.

### Optional API base URL overrides

You can override built-in NOAA and geocoding endpoints using Vite env vars:

- `VITE_NOAA_PROXY_BASE`
  - Default in dev: `/api/noaa`
  - Default in production build: `https://www.ncdc.noaa.gov/cdo-web/api/v2`
- `VITE_NOMINATIM_PROXY_BASE`
  - Default in dev: `/api/nominatim`
  - Default in production build: `https://nominatim.openstreetmap.org/search`

Recommended: keep using proxy routes in production deployments when possible so you can manage headers, quotas, and request policies centrally.

## Usage

1. Pick a provider in **Settings** or the provider selector.
2. Search by city/ZIP, coordinates, or map interaction (capabilities vary by provider).
3. Select stations (or an HRRR point), choose date range and data types.
4. Click **Fetch Rainfall Data**.
5. Export results as CSV or SWMM.

## Provider notes

| Provider | Search mode | Typical cadence | Credentials | Notes |
| --- | --- | --- | --- | --- |
| NOAA CDO | Station + spatial | Daily/hourly, dataset-dependent | NOAA token | Supports dataset/datatype filters and station availability timelines. |
| USGS NWIS | Station + spatial | Near real-time IV | None | Focused on NWIS parameter codes such as precipitation and discharge. |
| Synoptic Data | Station + spatial | Provider/network dependent | Synoptic token | Data type names reflect Synoptic sensor variables. |
| NOAA HRRR | Spatial point only | Hourly runs | None | Uses `/api/hrrr` proxy and a backend HRRR service. |

### NOAA dataset and datatype behavior

- Supported datasets: `GHCND`, `PRECIP_HLY`, `GSOM`, `GSOY`
- NOAA datatype whitelist includes: `PRCP`, `SNOW`, `SNWD`, `WESD`, `WESF`, `HPCP`, `QPCP`
- For NOAA, dataset/datatype choices are included in cache keys to avoid stale mixups.

## HRRR proxy setup

HRRR frontend requests go to `/api/hrrr`. That proxy validates input and forwards requests to the Python service in `services/hrrr_virtual_api`.

Recommended environment variables:

- `HRRR_USER_AGENT`: forwarded as `X-HRRR-User-Agent`
- `HRRR_SERVICE_URL`: backend endpoint (default: `http://127.0.0.1:8000/hrrr`)
- `HRRR_PROXY_TARGET`: local serverless target used by Vite dev proxy (default: `http://localhost:3000`)

## Deployment

- Build: `npm run build`
- Preview: `npm run preview`
- Vite base path defaults to `/rainfalldownload/` (see `vite.config.ts`).
- If deploying under a different path, update `base` in `vite.config.ts`.

## Key features

- Multi-provider data access with per-provider credentials/settings
- Interactive map and station/point selection
- Availability and data-type aware workflows
- CSV and SWMM export
- Light/dark theme + unit preferences
