# Rainfall Downloader

[![Built with React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=121212)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Rainfall Downloader is a lightweight web app for exploring and exporting precipitation data from NOAA's Climate Data Online (CDO) API. Use the interactive map to find weather stations, visualize availability, and pull ready-to-use CSV or SWMM time series for your modeling workflows. A roadmap for additional providers is included below so you can choose the right source for your use case.

## Overview
- Search for NOAA weather stations by city, ZIP code, or map navigation.
- Inspect station metadata and data-type availability timelines before downloading.
- Fetch precipitation records for one or more stations and visualize them immediately.
- Export downloads as CSV or SWMM-formatted time series for hydraulic models.

## Getting Started

### Prerequisites
- Node.js 20+ and npm
- A NOAA CDO API token (free from the [NCEI CDO portal](https://www.ncdc.noaa.gov/cdo-web/token))

### Install dependencies
```bash
npm install
```

### Configure your API token
1. Start the app (see below) and open the **Settings** menu in the header.
2. Paste your NOAA API token and choose your preferred units (Standard or Metric).
3. Preferences are stored in `localStorage`; you can update or clear them at any time.

### Get free provider tokens (for current and upcoming sources)
- **NOAA CDO (live in-app):** Request a token from the [NCEI CDO portal](https://www.ncdc.noaa.gov/cdo-web/token), then paste it into **Settings**.
- **NASA GPM IMERG via Earthdata (roadmap):** Create an [Earthdata Login](https://urs.earthdata.nasa.gov/), approve the "GPM IMERG" application when prompted, and generate an app-specific token under **Applications → Authorized Apps**.
- **Meteostat (roadmap):** No token required for the public API. Keep a contact email handy to set the `User-Agent` header if your organization requires it.
- **OpenWeatherMap (roadmap):** Sign up for a free account, create an API key under **My API keys**, and confirm you are on the "Free" tier (1,000 calls/day at 1 Hz).

### Run the app locally
```bash
npm run dev
```
The dev server runs at http://localhost:5173/. Vite proxies NOAA and Nominatim requests during development, so API calls work without extra configuration.

## Usage
1. **Find stations:** Use the search panel to locate stations by place name/ZIP or pan the map. Results appear as markers and in the station list.
2. **Check availability:** Select stations to view their data-type timelines and valid date ranges before requesting data.
3. **Fetch data:** Choose a date range, units, and data types (e.g., PRCP) and click **Fetch Rainfall Data**.
4. **Export:** Download results as CSV or SWMM format from the export buttons beneath the chart.

## Providers, resolution, and limitations
Rainfall Downloader currently ships with NOAA CDO, with additional sources in the roadmap so you can balance coverage, latency, and credentials.

| Provider | Spatial / Temporal resolution | Latency | Credentials | Known limitations |
| --- | --- | --- | --- | --- |
| **NOAA CDO (live)** | Station locations; daily/hourly precipitation depending on station | ~24 hours for most stations | NOAA CDO token | Station availability varies; gaps in historical records; per-token daily request limits |
| **NASA GPM IMERG (roadmap)** | 0.1° gridded; 30-minute and daily | ~12–24 hours after observation | Earthdata Login with app token | Best-effort gauge adjustment; coastal bias in some tiles; rolling retention differs by product (Late vs. Final) |
| **Meteostat (roadmap)** | Weather stations; hourly and daily | ~1–3 hours behind real time | No token required | Coverage densest in Europe/NA; some stations drop to daily only; rate limits apply to bulk pulls |
| **OpenWeatherMap (roadmap)** | Point queries; 1-hour precip from current/forecast; aggregated daily | Minutes for current/forecast; daily archives may lag | API key (Free tier supported) | Free tier call caps; forecast skill varies by region; archived history is limited without paid plan |

### Units, coverage, and data nuances
- **NOAA CDO:** Returns precipitation in tenths of millimeters (metric) or hundredths of inches (standard) per station; set the unit preference in **Settings**.
- **NASA GPM IMERG:** Delivers gridded millimeters; conversion to inches will be handled in-app when added.
- **Meteostat:** Provides metric units by default; convert to inches if needed when exporting.
- **OpenWeatherMap:** Returns millimeters for `rain`/`snow` fields; daily aggregates vary by endpoint (e.g., One Call 3.0 vs. history API).

### Provider selection matrix
Use this quick guide to pick the right source for your scenario:

| Use case | Recommended provider | Why |
| --- | --- | --- |
| Hydrologic modeling near a known gauge | NOAA CDO | Station-based quality control and long archives |
| Broad spatial coverage over ungauged basins | NASA GPM IMERG | Global gridded product with consistent spatial resolution |
| Rapid updates for recent events in Europe/NA | Meteostat | Frequent refresh with dense regional station network |
| Quick-look current/forecast precipitation | OpenWeatherMap | Simple point queries with low-latency current/forecast data |

### Roadmap and onboarding
- **Current:** NOAA CDO download, visualization, and export are supported today.
- **Planned:** NASA GPM IMERG, Meteostat, and OpenWeatherMap connectors with per-source unit conversion and coverage indicators inside the app.
- **Getting ready:** Acquire the free tokens listed above now so you can plug them in as each connector ships.

## Deployment
- Build the production bundle with `npm run build`; preview locally with `npm run preview`.
- The Vite config sets `base: '/rainfallldownload/'` for GitHub Pages. If you deploy under a different path, update `base` in `vite.config.ts` to match your hosting URL.
- All NOAA requests occur client-side; ensure your deployment domain is allowed to call the CDO API and remind users to supply their own tokens.

## Key Features at a Glance
- Interactive Leaflet map for spatial station selection.
- Station list with quick toggles and selection persistence.
- Availability timelines to avoid empty queries.
- Status center for background task feedback.
- Dual-unit support and dark mode preference.
- CSV and SWMM exports for downstream modeling.
