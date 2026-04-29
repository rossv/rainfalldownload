# CLAUDE.md

This file provides guidance for AI assistants working in this repository.

## Project overview

**Rainfall Downloader** is a browser-based web app (React 19 + TypeScript + Vite) for discovering weather stations or virtual grid points, charting precipitation series, and exporting CSV/SWMM/JSON files for hydrological modeling workflows.

Live at: `https://rossv.github.io/rainfalldownload/#/`

Key providers:
- **NOAA CDO** (token required): GHCND, PRECIP_HLY, GSOM, GSOY datasets
- **USGS NWIS** (no token): real-time streamflow/precipitation IV endpoints
- **Synoptic Data** (token required): mesonet station time-series
- **NOAA HRRR** (no token): gridded analysis/forecast via Python backend

## Repository structure

```
rainfalldownload/
├── api/                         # Serverless API proxy handlers
│   ├── hrrr.ts                  # HRRR proxy (validates + forwards to Python service)
│   ├── nominatim.ts             # Geocoding proxy (OpenStreetMap Nominatim)
│   └── noaa/[...path].ts        # NOAA CDO proxy
├── docs/
│   └── STATION_SEARCH.md        # Station search architecture notes
├── services/
│   └── hrrr_virtual_api/        # FastAPI Python service for HRRR gridded data
│       ├── app.py               # FastAPI app entry point
│       └── requirements.txt
├── src/
│   ├── assets/                  # SVG images
│   ├── components/              # React components
│   │   ├── AvailabilityTimeline.tsx  # Data availability/coverage visualization
│   │   ├── HelpModal.tsx             # Help documentation modal
│   │   ├── Layout.tsx                # Main layout wrapper + header navigation
│   │   ├── RainfallChart.tsx         # Recharts time-series visualization
│   │   ├── SettingsModal.tsx         # Provider settings + auth token input
│   │   ├── StationList.tsx           # Station selection list with metadata
│   │   ├── StationMap.tsx            # Leaflet map component
│   │   ├── StationSearch.tsx         # Search input with provider selection
│   │   └── StatusCenter.tsx          # Status/loading indicator
│   ├── hooks/
│   │   ├── usePreferences.tsx        # Global settings context + localStorage
│   │   └── useFocusTrap.ts           # Accessibility: focus management for modals
│   ├── lib/                     # Utilities
│   │   ├── dateUtils.ts         # Date formatting (avoids timezone shifts)
│   │   ├── export.ts            # CSV / SWMM / JSON export logic
│   │   └── utils.ts             # cn() Tailwind class merger
│   ├── pages/
│   │   └── Dashboard.tsx        # Main page; orchestrates all state
│   ├── services/
│   │   ├── geocoding.ts         # Nominatim geocoding (7-day TTL cache)
│   │   ├── http.ts              # Axios instance with retry logic
│   │   ├── noaa.ts              # NOAA CDO service
│   │   └── providers/           # One file per data provider
│   │       ├── README.md        # Provider architecture documentation
│   │       ├── hrrr-params.ts   # HRRR parameter definitions
│   │       ├── hrrr.ts          # HRRR gridded data provider
│   │       ├── index.ts         # Provider registry (ProviderId, listProviders)
│   │       ├── mrms.ts          # MRMS stub (not yet implemented)
│   │       ├── provider-template.ts  # Skeleton for new providers
│   │       ├── synoptic.ts      # Synoptic Labs mesonet provider
│   │       └── usgs.ts          # USGS NWIS provider
│   ├── test/
│   │   └── setup.ts             # Vitest + jest-dom setup, localStorage mock
│   ├── types/
│   │   ├── index.ts             # Core domain types (Station, UnifiedTimeSeries, …)
│   │   └── data-source.ts       # DataSource interface all providers implement
│   ├── App.tsx                  # Root: HashRouter + PreferencesProvider
│   └── main.tsx                 # React DOM entry point
├── legacy/                      # Archived PyQt desktop app (not active)
├── public/                      # Static assets (favicon.png, vite.svg)
├── .github/workflows/deploy.yml # GitHub Pages CI/CD
├── .vscode/                     # VS Code tasks + launch config
├── AGENTS.md                    # Agent workflow notes
├── CHANGELOG.md                 # Version history
├── index.html                   # Vite HTML entry
├── postcss.config.js
├── vite.config.ts               # Vite + dev proxy config
├── tailwind.config.js           # Tailwind (dark mode: class)
├── eslint.config.js             # ESLint 9 flat config
├── tsconfig.app.json            # Strict TypeScript config for src/
├── tsconfig.node.json           # TypeScript config for build tooling
└── package.json                 # Scripts and dependencies
```

## Development commands

```bash
npm install           # Install dependencies (Node 20+ required)
npm run dev           # Dev server → http://localhost:5173/rainfalldownload/#/
npm run lint          # ESLint check
npm test              # Run Vitest test suite (vitest run)
npm run build         # tsc -b && vite build → dist/
npm run preview       # Preview production build locally
```

## Technology stack

| Layer | Technology |
|---|---|
| UI | React 19, TypeScript ~5.9 |
| Build | Vite 7, PostCSS, Autoprefixer |
| Styling | Tailwind CSS 3 (dark mode via `class`), `class-variance-authority` |
| Routing | React Router 7 (HashRouter — required for GitHub Pages) |
| Charts | Recharts 3 |
| Maps | Leaflet + React-Leaflet 5 |
| HTTP | Axios 1.13 with retry (see `src/services/http.ts`) |
| Icons | lucide-react |
| Dates | date-fns 4 |
| Export | file-saver |
| Testing | Vitest 4 + React Testing Library 16 (jsdom environment) |
| Linting | ESLint 9 flat config + typescript-eslint |
| Backend | FastAPI + Uvicorn + Herbie (Python, optional) |

## TypeScript conventions

- **Strict mode is enforced.** `noUnusedLocals`, `noUnusedParameters`, `noImplicitAny` are all active. Every new symbol must be used.
- Target: ES2022. Do not add polyfills.
- Prefer `interface` for object shapes that may be extended; `type` for unions and aliases.
- All providers implement `DataSource` from `src/types/data-source.ts`. New providers must satisfy this interface.
- Core domain types live in `src/types/index.ts`. Add new shared types there; keep provider-specific types in their own file.

## React conventions

- Functional components only with explicit props interfaces.
- Global state via `PreferencesProvider` (`src/hooks/usePreferences.tsx`). Preferences are persisted in `localStorage` under key `rainfall_prefs`.
- Keep page-level state in `Dashboard.tsx`. Only lift state when two sibling components need it.
- Use `React.memo` / `useMemo` / `useCallback` only when a measurable performance problem exists.

## Data provider pattern

Every data source implements `DataSource` (`src/types/data-source.ts`):

```ts
interface DataSource {
    readonly id: string;
    readonly name: string;
    readonly capabilities: DataSourceCapabilities;

    findStationsByCity(city: string, limit?: number, buffer?: number, options?: DataQueryOptions): Promise<Station[]>;
    findStationsByCoords(lat: number, lon: number, limit?: number, buffer?: number, options?: DataQueryOptions): Promise<Station[]>;
    getAvailableDataTypes(stationId: string, options?: DataQueryOptions): Promise<DataType[]>;
    fetchData(params: FetchDataParams & DataQueryOptions): Promise<UnifiedTimeSeries[]>;
}
```

`DataSourceCapabilities` carries `id`, `name`, `supportsStationSearch`, `supportsSpatialSearch`, `supportsGridInterpolation`, `requiresApiKey`, and optional `maxDateRangeDays`.

Provider files live in `src/services/providers/`. When adding a new provider:
1. Create `src/services/providers/<name>.ts` implementing `DataSource`.
2. Add its `SourceType` literal to `src/types/index.ts`.
3. Register it in `src/services/providers/index.ts` (the `listProviders()` registry).
4. Write unit tests in `src/services/<name>.test.ts`.

Current registered providers (`ProviderId`): `'noaa'` | `'usgs_nwis'` | `'synoptic'` | `'hrrr'`

## Preferences and global state

`usePreferences()` (from `src/hooks/usePreferences.tsx`) exposes:

```ts
interface Preferences {
    providerId: ProviderId;
    credentials: Record<ProviderId, ProviderCredentials>;  // token, apiKey, username per provider
    units: 'standard' | 'metric';
    darkMode: boolean;
    defaultDatasetId: string;
    defaultDataTypes: string[];
}
```

Mutators: `updateCredentials(providerId, creds)`, `setProvider(providerId)`, `toggleDarkMode()`, `setUnits(units)`, `setDefaultDataset(datasetId, dataTypes)`.

Migration: on load, any legacy top-level `apiKey` in stored JSON is promoted to `credentials[providerId].token`.

## Caching rules

- NOAA CDO responses: 24-hour TTL in `localStorage`; cache keys include dataset and datatype to avoid stale mixups. Cache version is currently `v6` — bump when the response shape changes.
- Nominatim geocoding: **7-day TTL** in `localStorage` (key prefix `geocode_cache_v1_`); in-flight deduplication prevents duplicate concurrent requests.
- Gracefully handle `QuotaExceededError` on localStorage writes — the existing `http.ts` helper already does this.

## Styling rules

- Use Tailwind utility classes. Do not write raw CSS unless Tailwind cannot express it.
- Custom semantic color tokens (`primary`, `secondary`, `muted`, etc.) are defined in `tailwind.config.js` using HSL CSS variables. Use these tokens instead of hard-coded colors so that both light and dark themes work.
- Dark mode: toggled by adding the `dark` class to `<html>`. Do not use `prefers-color-scheme` media queries directly.
- Use the `cn()` helper (`src/lib/utils.ts`, built on `clsx` + `tailwind-merge`) whenever class names are conditional.

## Testing expectations

- Tests live alongside source: `src/**/*.test.{ts,tsx}`.
- Test environment is `jsdom`. Do not make real network calls in unit tests — mock Axios or provider methods.
- Use `@testing-library/react` for component tests. Query by accessible role/label, not by CSS selector.
- Test the public interface of each provider service. For chart/UI components, test that correct props render correctly and that user events fire callbacks.

## API proxy handlers (`api/`)

These serverless handlers proxy external APIs to avoid CORS issues and centralize credential handling:
- Validate required query parameters early and return 400 errors with clear messages.
- Set appropriate timeout values and forward relevant headers.
- Return JSON consistently — `{ error: string }` on failure.

In development, Vite's `server.proxy` config (in `vite.config.ts`) routes:
- `/api/hrrr` → `HRRR_PROXY_TARGET` (default `http://localhost:3000`)
- `/api/noaa` → `https://www.ncdc.noaa.gov/cdo-web/api/v2`
- `/api/usgs` → `https://waterservices.usgs.gov/nwis`
- `/api/nominatim` → `https://nominatim.openstreetmap.org/search`

Do not hardcode API base URLs in frontend code; use the `VITE_NOAA_PROXY_BASE` / `VITE_NOMINATIM_PROXY_BASE` env vars (already wired in the services).

## HRRR backend service

The Python FastAPI service lives in `services/hrrr_virtual_api/`. It is **optional** — the app degrades gracefully when it is unavailable.

Run locally:
```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\Activate.ps1
pip install -r services/hrrr_virtual_api/requirements.txt
uvicorn services.hrrr_virtual_api.app:app --host 0.0.0.0 --port 8000
```

Relevant env vars:
- `HRRR_SERVICE_URL` — backend endpoint (default: `http://127.0.0.1:8000/hrrr`)
- `HRRR_PROXY_TARGET` — Vite dev proxy target (default: `http://localhost:3000`)
- `HRRR_HERBIE_CACHE` — GRIB cache directory (default: `.cache/herbie`)
- `HRRR_USER_AGENT` — forwarded as `X-HRRR-User-Agent`

HRRR supports parameters: `APCP` (precipitation, default), `TMP`, `RH`, `WIND`. Virtual station IDs are derived from lat/lon. Maximum date range is 30 days.

## Export formats

Export logic lives in `src/lib/export.ts`:
- Files are written with a UTF-8 BOM for Excel compatibility.
- Wide format (multiple stations) and tall format (single station) are both supported for CSV.
- SWMM and JSON export are also available.
- Filenames include the export date: `Rainfall_Data_Multiple_Stations_YYYY-MM-DD.csv`.

## CI / deployment

GitHub Actions (`.github/workflows/deploy.yml`) triggers on pushes to `main` and manual dispatch:
1. `npm ci`
2. `npm run build`
3. Deploys `dist/` to GitHub Pages.

The Vite `base` is `/rainfalldownload/`. Routing uses `HashRouter` so that GitHub Pages single-page-app serving works without a custom `404.html`.

**Do not change the `base` value** without also updating the deployment target.

## Branch workflow

- Default branch: `main`
- Feature branches: descriptive prefix, e.g. `feat/`, `fix/`, `docs/`
- AI agent branches: `claude/<description>-<id>` (auto-generated)
- All CI runs against `main`. Open a PR to merge feature branches.

## What not to do

- Do not add `// @ts-ignore` or `any` to silence TypeScript errors — fix the type.
- Do not introduce raw `fetch()` calls; use the shared Axios instance in `src/services/http.ts` which has retry logic and timeout handling.
- Do not hardcode colors or pixel values — use Tailwind tokens.
- Do not commit NOAA tokens, Synoptic tokens, or any other credentials. Credentials are runtime-only, stored in `localStorage`.
- Do not change `HashRouter` to `BrowserRouter` — it will break GitHub Pages routing.
- Do not modify `.github/workflows/deploy.yml` without verifying the Node version and build output path still match.
- Do not use the old `DataSource` method names (`searchStations`, `getDataTypes`) — the current interface uses `findStationsByCity`, `findStationsByCoords`, and `getAvailableDataTypes`.
