# HRRR Virtual API Service

This FastAPI service powers `/api/hrrr` by reading HRRR model fields through [Herbie](https://github.com/blaylockbk/Herbie) and returning a point time-series payload compatible with the frontend `stationId + series` contract.

## Endpoint

`GET /hrrr`

Query params:
- `lat`, `lon`
- `start`, `end` (ISO timestamp/date)
- `parameters` (`APCP,TMP,RH,WIND`)
- `productType` (`analysis` or `forecast`)
- `aggregationWindow` (`hourly`, `3-hour`, `6-hour`)
- `leadHours` (comma-separated forecast lead hours)

Response shape:

```json
{
  "stationId": "hrrr-39.7392--104.9903",
  "series": [
    {
      "timestamp": "2026-01-01T00:00:00Z",
      "value": 0.0,
      "interval": 60,
      "parameter": "PRCP"
    }
  ]
}
```

## Run locally

From the repository root:

```bash
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
source .venv/bin/activate
```

Then install dependencies and run:

```bash
pip install -r services/hrrr_virtual_api/requirements.txt
uvicorn services.hrrr_virtual_api.app:app --host 0.0.0.0 --port 8000
```

Optional env vars:
- `HRRR_HERBIE_CACHE`: cache directory for downloaded GRIB data.

## Integration with `/api/hrrr`

Set:
- `HRRR_SERVICE_URL=http://127.0.0.1:8000/hrrr`
- `HRRR_PROXY_TARGET` to your serverless host during local UI development.
- `HRRR_USER_AGENT` if you want a custom downstream identifier header.
