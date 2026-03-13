# Data providers

Providers implement the shared `DataSource` contract in `src/types/data-source.ts`. Registration lives in `src/services/providers/index.ts`.

## Current provider modules

- `noaa` via `src/services/noaa.ts`
- `usgs_nwis` via `src/services/providers/usgs.ts`
- `synoptic` via `src/services/providers/synoptic.ts`
- `hrrr` via `src/services/providers/hrrr.ts`

## Adding a provider quickly

1. Copy `provider-template.ts` into a new file (for example, `gpm.ts`).
2. Set `DataSourceCapabilities` (search mode, auth requirements, range limits).
3. Implement `findStationsByCity`, `findStationsByCoords`, `getAvailableDataTypes`, and `fetchData`.
4. Register the provider in `index.ts` (`ProviderId`, provider definition map, and factory wiring).
5. Add auth metadata (`label`, `helperText`, `signupUrl`) when credentials are needed so `SettingsModal` can render the right fields.

## Capability expectations

- Station-based providers should return stable station IDs and source tags for export/chart grouping.
- Spatial-only providers (like HRRR) should set `supportsStationSearch: false`, `supportsSpatialSearch: true`, and provide virtual station IDs.
- Datatype IDs should be provider-native where possible; the UI stores selections per provider.
