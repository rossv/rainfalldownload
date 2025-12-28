# Task: Add Loading Spinner for Station Parameter Availability

## Context
When a user selects a station, the application fetches available data types (parameters) for that station from the API. Previously, during this fetch process, the UI would show nothing in the "Selected Stations" list within the "Query Parameters" section until the data returned. The user requested a visual indicator (spinner) to appear "right where the green box would go" while waiting for the API.

## Changes
- **File**: `src/pages/Dashboard.tsx`
- **Component**: `Dashboard` (specifically the "Selected Stations" list rendering logic)
- **Logic**: 
  - Checks the `availabilityLoading` state for the current station `s`.
  - If `availabilityLoading[s.id]` is `true`, renders a small `Loader2` spinner.
  - If `false`, proceeds to render the parameter badges (green boxes) as before.

## Verification
- Verified that `availabilityLoading` is correctly updated during the fetch process (`useEffect` hook).
- Verified that `Loader2` is imported and available.
- Confirmed that the spinner replaces the empty space/badges during the loading phase, providing immediate feedback to the user.
