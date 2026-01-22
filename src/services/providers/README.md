# Data providers

Providers implement the shared `DataSource` contract in `src/types/data-source.ts`. Use the factory utilities in `src/services/providers/index.ts` to register new providers and expose their capabilities.

## Adding a provider quickly
1. Copy `provider-template.ts` into a new file (for example, `gpm.ts`).
2. Fill in the `TEMPLATE_CAPABILITIES` values with the provider ID, name, and capability flags.
3. Implement the interface methods with API calls that return the shared `Station`, `DataType`, and `RainfallData` structures.
4. Register the provider in `index.ts` by adding it to the `providers` map and exporting any capability metadata you need in the UI.
5. Surface any provider-specific requirements (API keys, coordinate inputs, grid interpolation) via the `DataSourceCapabilities` flags so the UI can adjust affordances automatically.

## HRRR provider notes
The HRRR provider (`src/services/providers/hrrr.ts`) represents NOAA High-Resolution Rapid Refresh gridded fields. HRRR is grid-based rather than station-based, so it does not support station search (`supportsStationSearch: false`). Instead, it enables spatial search and grid interpolation (`supportsSpatialSearch: true`, `supportsGridInterpolation: true`) so the UI can request data at or around a coordinate without relying on station IDs.

Because HRRR is gridded, configuration focuses on spatial queries (lat/lon + buffer or bounding boxes) and any data type mappings needed for HRRR variables. Unlike station sources, there is no station metadata lookup, and any returned time series should be labeled with the `HRRR` source type for downstream mapping.
