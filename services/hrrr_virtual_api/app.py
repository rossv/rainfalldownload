from __future__ import annotations

import math
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional

from fastapi import FastAPI, HTTPException, Query

try:
    from herbie import Herbie
except ImportError:  # pragma: no cover
    Herbie = None


app = FastAPI(title="HRRR virtual API", version="0.1.0")


@dataclass(frozen=True)
class ParameterConfig:
    id: str
    unified_parameter: str
    aggregation: str
    search_string: str
    transform: str = "identity"


PARAMETER_MAP: Dict[str, ParameterConfig] = {
    "APCP": ParameterConfig(
        id="APCP",
        unified_parameter="PRCP",
        aggregation="sum",
        search_string=":APCP:surface:",
        transform="identity",
    ),
    "TMP": ParameterConfig(
        id="TMP",
        unified_parameter="TMP",
        aggregation="average",
        search_string=":TMP:2 m above ground:",
        transform="k_to_c",
    ),
    "RH": ParameterConfig(
        id="RH",
        unified_parameter="RH",
        aggregation="average",
        search_string=":RH:2 m above ground:",
        transform="identity",
    ),
    "WIND": ParameterConfig(
        id="WIND",
        unified_parameter="WIND",
        aggregation="average",
        search_string=":WIND:10 m above ground:",
        transform="identity",
    ),
}

WINDOW_HOURS = {
    "hourly": 1,
    "3-hour": 3,
    "6-hour": 6,
}


def parse_iso_datetime(value: Optional[str], fallback: datetime) -> datetime:
    if not value:
        return fallback
    normalized = value.replace("Z", "+00:00")
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def floor_to_hour(value: datetime) -> datetime:
    return value.replace(minute=0, second=0, microsecond=0)


def iter_hourly(start: datetime, end: datetime) -> Iterable[datetime]:
    current = floor_to_hour(start)
    while current <= end:
        yield current
        current += timedelta(hours=1)


def aggregate_points(points: List[dict], mode: str, window_hours: int, parameter: str) -> List[dict]:
    if window_hours == 1:
        return points

    window_seconds = window_hours * 3600
    buckets: Dict[int, List[float]] = {}

    for point in points:
        ts = datetime.fromisoformat(point["timestamp"].replace("Z", "+00:00"))
        bucket = int(ts.timestamp()) // window_seconds
        buckets.setdefault(bucket, []).append(point["value"])

    aggregated: List[dict] = []
    for bucket, values in sorted(buckets.items(), key=lambda item: item[0]):
        timestamp = datetime.fromtimestamp(bucket * window_seconds, tz=timezone.utc)
        if mode == "sum":
            value = float(sum(values))
        else:
            value = float(sum(values) / len(values))

        aggregated.append(
            {
                "timestamp": timestamp.isoformat().replace("+00:00", "Z"),
                "value": value,
                "interval": window_hours * 60,
                "parameter": parameter,
            }
        )

    return aggregated


def select_nearest_value(data_array, lat: float, lon: float) -> float:
    if "latitude" in data_array.coords and "longitude" in data_array.coords:
        lats = data_array["latitude"].values
        lons = data_array["longitude"].values

        if lats.ndim == 2 and lons.ndim == 2:
            distances = (lats - lat) ** 2 + (lons - lon) ** 2
            idx = int(distances.argmin())
            y, x = divmod(idx, distances.shape[1])
            value = data_array.values[y, x]
        else:
            selected = data_array.sel(latitude=lat, longitude=lon, method="nearest")
            value = selected.values
    elif "lat" in data_array.coords and "lon" in data_array.coords:
        selected = data_array.sel(lat=lat, lon=lon, method="nearest")
        value = selected.values
    else:
        raise ValueError("Unable to locate latitude/longitude coordinates in HRRR dataset.")

    if hasattr(value, "item"):
        value = value.item()

    if value is None or (isinstance(value, float) and math.isnan(value)):
        raise ValueError("HRRR dataset returned an empty value for the selected point.")

    return float(value)


def apply_transform(value: float, transform: str) -> float:
    if transform == "k_to_c":
        return value - 273.15
    return value


def fetch_point_value(
    run_time: datetime,
    lead_hour: int,
    parameter: ParameterConfig,
    lat: float,
    lon: float,
) -> Optional[float]:
    if Herbie is None:
        raise RuntimeError("Herbie dependency is not installed.")

    model = Herbie(
        run_time,
        model="hrrr",
        product="sfc",
        fxx=lead_hour,
        save_dir=os.getenv("HRRR_HERBIE_CACHE", ".cache/herbie"),
        verbose=False,
    )

    dataset = model.xarray(parameter.search_string)
    if dataset is None or len(dataset.data_vars) == 0:
        return None

    first_var = next(iter(dataset.data_vars))
    raw_value = select_nearest_value(dataset[first_var], lat=lat, lon=lon)
    return apply_transform(raw_value, parameter.transform)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/hrrr")
def get_hrrr_series(
    lat: float = Query(...),
    lon: float = Query(...),
    start: Optional[str] = Query(default=None),
    end: Optional[str] = Query(default=None),
    parameters: Optional[str] = Query(default=None),
    productType: str = Query(default="forecast"),
    aggregationWindow: str = Query(default="hourly"),
    leadHours: Optional[str] = Query(default=None),
) -> dict:
    now = datetime.now(timezone.utc)
    start_dt = parse_iso_datetime(start, now - timedelta(hours=24))
    end_dt = parse_iso_datetime(end, now + timedelta(hours=24))

    if end_dt < start_dt:
        raise HTTPException(status_code=400, detail="End date must be after start date.")

    requested_parameters = [p.strip() for p in (parameters or "APCP").split(",") if p.strip()]
    parameter_configs = [PARAMETER_MAP[p] for p in requested_parameters if p in PARAMETER_MAP]
    if not parameter_configs:
        raise HTTPException(status_code=400, detail="No supported parameters requested.")

    window_hours = WINDOW_HOURS.get(aggregationWindow, 1)

    if productType == "analysis":
        lead_hours = [0]
    else:
        parsed = [int(x.strip()) for x in leadHours.split(",")] if leadHours else []
        lead_hours = parsed if parsed else list(range(1, 19))

    run_start = start_dt - timedelta(hours=max(lead_hours))
    run_end = end_dt

    try:
        series: List[dict] = []
        for parameter in parameter_configs:
            by_valid_time: Dict[datetime, tuple[int, float]] = {}

            for run_time in iter_hourly(run_start, run_end):
                for lead in lead_hours:
                    valid_time = run_time + timedelta(hours=lead)
                    if valid_time < start_dt or valid_time > end_dt:
                        continue
                    try:
                        value = fetch_point_value(run_time, lead, parameter, lat=lat, lon=lon)
                    except Exception:
                        continue

                    if value is None:
                        continue

                    prior = by_valid_time.get(valid_time)
                    if prior is None or lead < prior[0]:
                        by_valid_time[valid_time] = (lead, value)

            parameter_points = [
                {
                    "timestamp": ts.isoformat().replace("+00:00", "Z"),
                    "value": value,
                    "interval": 60,
                    "parameter": parameter.unified_parameter,
                }
                for ts, (_lead, value) in sorted(by_valid_time.items(), key=lambda item: item[0])
            ]

            series.extend(
                aggregate_points(
                    parameter_points,
                    mode=parameter.aggregation,
                    window_hours=window_hours,
                    parameter=parameter.unified_parameter,
                )
            )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    station_id = f"hrrr-{lat:.4f}-{lon:.4f}"
    return {"stationId": station_id, "series": series}
