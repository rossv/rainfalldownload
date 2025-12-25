# Data providers

Providers implement the shared `DataSource` contract in `src/types/data-source.ts`. Use the factory utilities in `src/services/providers/index.ts` to register new providers and expose their capabilities.

## Adding a provider quickly
1. Copy `provider-template.ts` into a new file (for example, `gpm.ts`).
2. Fill in the `TEMPLATE_CAPABILITIES` values with the provider ID, name, and capability flags.
3. Implement the interface methods with API calls that return the shared `Station`, `DataType`, and `RainfallData` structures.
4. Register the provider in `index.ts` by adding it to the `providers` map and exporting any capability metadata you need in the UI.
5. Surface any provider-specific requirements (API keys, coordinate inputs, grid interpolation) via the `DataSourceCapabilities` flags so the UI can adjust affordances automatically.
