# Rainfall Downloader

[![Built with React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=121212)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Rainfall Downloader is a lightweight web app for exploring and exporting precipitation data from NOAA's Climate Data Online (CDO) API. Use the interactive map to find weather stations, visualize availability, and pull ready-to-use CSV or SWMM time series for your modeling workflows.

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
