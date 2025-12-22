#!/usr/bin/env python3
"""Utilities for downloading rainfall data.

This module provides a small wrapper around the NOAA CDO web API and a generic
fallback service used in the tests.  The public functions are intentionally
simple so that they can be unit tested without relying on the network.
"""

from __future__ import annotations

import argparse
import datetime
import io
import json
import logging
import os
import re
import sys
import threading
import time
from pathlib import Path
from typing import Iterable, List, Tuple

import pandas as pd
import requests

# Base URLs used by the helpers below
NOAA_URL = "https://www.ncdc.noaa.gov/cdo-web/api/v2/data"
STATION_URL = "https://www.ncdc.noaa.gov/cdo-web/api/v2/stations"


_CACHE_TTL_SECONDS = 24 * 60 * 60  # 24 hours
_CACHE_LOCK = threading.RLock()
_CACHE_DATA: dict[str, dict[str, object]] | None = None
_ORIGINAL_REQUESTS_GET = requests.get


def _cache_enabled() -> bool:
    return requests.get is _ORIGINAL_REQUESTS_GET


def _cache_dir() -> Path:
    root = os.environ.get("HH_TOOLS_CACHE_DIR")
    if root:
        return Path(root)
    
    # Use LOCALAPPDATA on Windows if available
    if sys.platform == "win32":
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            return Path(local_app_data) / "hh_tools"
            
    return Path.home() / ".cache" / "hh_tools"


def _cache_path() -> Path:
    return _cache_dir() / "download_rainfall_cache.json"


def _load_cache_unlocked() -> dict[str, dict[str, object]]:
    global _CACHE_DATA
    if _CACHE_DATA is not None:
        return _CACHE_DATA
    path = _cache_path()
    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except FileNotFoundError:
        payload = {}
    except Exception:
        payload = {}
    if isinstance(payload, dict):
        _CACHE_DATA = payload
    else:
        _CACHE_DATA = {}
    return _CACHE_DATA


def _save_cache_unlocked() -> None:
    data = _CACHE_DATA or {}
    path = _cache_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        with tmp.open("w", encoding="utf-8") as handle:
            json.dump(data, handle)
        tmp.replace(path)
    except Exception as exc:
        # Log the error but don't crash the app
        logging.warning(f"Failed to save cache to {path}: {exc}")


def _cache_key(*parts: object) -> str:
    return json.dumps(parts, ensure_ascii=False, separators=(",", ":"))


def _cache_get(*parts: object) -> object | None:
    if not _cache_enabled():
        return None
    key = _cache_key(*parts)
    now = time.time()
    with _CACHE_LOCK:
        store = _load_cache_unlocked()
        entry = store.get(key)
        if not isinstance(entry, dict):
            return None
        expires = float(entry.get("expires", 0.0))
        if expires and expires < now:
            store.pop(key, None)
            _save_cache_unlocked()
            return None
        value = entry.get("value")
    try:
        return json.loads(json.dumps(value))
    except Exception:
        return value


def _cache_set(value: object, *parts: object) -> None:
    if not _cache_enabled():
        return
    key = _cache_key(*parts)
    now = time.time()
    expires = now + _CACHE_TTL_SECONDS
    try:
        serialisable = json.loads(json.dumps(value))
    except Exception:
        serialisable = value
    with _CACHE_LOCK:
        store = _load_cache_unlocked()
        store[key] = {"value": serialisable, "expires": expires}
        _save_cache_unlocked()


_ISO_DATE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})")


def _normalise_iso_date(value: str | None) -> str:
    """Return ``value`` truncated to ``YYYY-MM-DD`` if possible."""

    if not value:
        return ""

    text = str(value).strip()
    if not text:
        return ""

    match = _ISO_DATE_RE.match(text)
    if match:
        return match.group(1)

    adjusted = text.replace("Z", "+00:00")
    try:
        return datetime.datetime.fromisoformat(adjusted).date().isoformat()
    except ValueError:
        pass

    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue

    return text


def _coerce_date(value: str | None) -> datetime.date | None:
    """Convert ``value`` into a :class:`~datetime.date` if possible."""

    normalised = _normalise_iso_date(value)
    if not normalised:
        return None
    try:
        return datetime.date.fromisoformat(normalised)
    except ValueError:
        return None


def _truncate(message: str, length: int = 160) -> str:
    """Return ``message`` shortened to ``length`` characters."""

    if len(message) <= length:
        return message
    return message[: length - 1].rstrip() + "…"


def _format_http_error(exc: requests.HTTPError) -> str:
    """Create a concise, human friendly description of ``exc``."""

    response = exc.response
    if response is None:
        return f"HTTP error while fetching rainfall data: {exc}"

    status = response.status_code
    detail = (response.reason or "").strip()

    if not detail:
        content_type = response.headers.get("Content-Type", "").lower()
        if "application/json" in content_type:
            try:
                payload = response.json()
            except ValueError:
                payload = None
            if isinstance(payload, dict):
                for key in ("message", "detail", "error"):
                    value = payload.get(key)
                    if isinstance(value, str) and value.strip():
                        detail = value.strip()
                        break
        if not detail:
            text = (response.text or "").strip()
            if text:
                detail = text.splitlines()[0].strip()

    detail = _truncate(detail)

    hint = ""
    if status in {401, 403}:
        hint = " Check that your API token is valid."
    elif status == 404:
        hint = " Check the station ID, dataset and datatype."

    if detail:
        message = f"Server returned HTTP {status}: {detail}"
    else:
        message = f"Server returned HTTP {status}."
    return message + hint


def _is_no_data_error(exc: ValueError) -> bool:
    return "no rainfall data" in str(exc).lower()


def fetch_rainfall(
    station: str,
    start: str,
    end: str,
    api_key: str,
    *,
    url: str = "https://example.com/rainfall",
    dataset: str | None = None,
    datatype: str | None = None,
    units: str = "in",
    timeout: int = 30,
    chunk_days: int | None = None,
) -> pd.DataFrame:
    """Fetch rainfall for ``station`` between ``start`` and ``end``.

    This function is the main entry point for retrieving rainfall data.  It
    supports multiple back ends and automatically falls back to NOAA’s newer
    Access Data Service (ADS) when the legacy CDO API cannot satisfy the
    request (for example, certain Community Collaborative Rain, Hail & Snow
    (CoCoRaHS) stations are unavailable via the CDO API).  The behaviour
    changes depending on ``url``:

    * When ``url`` is :data:`NOAA_URL` the request follows the requirements of
      the NOAA CDO API (token header, dataset and datatype identifiers, etc.).
      The function will transparently page through all results when more than
      1,000 records are returned and will optionally chunk long date ranges
      into smaller segments via the ``chunk_days`` argument.
    * For any other URL a small dummy service is assumed which simply echoes
      back ``station``, ``start`` and ``end``.  The tests monkey‑patch
      :func:`requests.get` so no external HTTP requests are made.

    Parameters
    ----------
    station: str
        Station identifier (with or without dataset prefix).
    start: str
        Inclusive start of the date range in ISO (YYYY‑MM‑DD) format.  If the
        start date is after the end date a :class:`ValueError` is raised.
    end: str
        Inclusive end of the date range in ISO (YYYY‑MM‑DD) format.
    api_key: str
        Token used by the CDO API; ignored when using the ADS fallback.
    url: str, optional
        Base URL for the rainfall service.  Defaults to the dummy service.
    dataset: str, optional
        Dataset identifier required by the CDO API.  Ignored for the dummy
        service.  When using the ADS fallback the dataset is assumed to be
        ``daily‑summaries`` which maps to the legacy GHCND dataset.
    datatype: str, optional
        Data type identifier required by the CDO API.  Ignored for the dummy
        service.  When using the ADS fallback the data type is passed via the
        ``dataTypes`` parameter.
    units: str, optional
        Either ``"mm"`` or ``"in"``.  Controls whether metric (millimetres)
        or standard (inches) values are returned.  Defaults to inches.
    timeout: int, optional
        Timeout in seconds for each network request.  Defaults to 30.
    chunk_days: int, optional
        When provided and using the CDO API, requests will be broken into
        segments no longer than this many days.  For example, a value of 365
        will fetch each calendar year separately.  This can improve
        reliability for very long ranges or large result sets.  If
        ``None`` (default) the entire range is requested in one go.

    Returns
    -------
    pandas.DataFrame
        A two‑column DataFrame with ``Datetime`` and ``Rainfall`` columns,
        sorted chronologically.

    Raises
    ------
    ValueError
        If no rainfall data could be retrieved or the response format is
        unsupported.
    requests.HTTPError
        For HTTP errors encountered when contacting the rainfall service.  If
        the CDO API returns a 400 or 404 the ADS fallback will be tried
        automatically before re‑raising.
    """

    if url == NOAA_URL:
        # Validate required parameters for CDO requests
        if dataset is None or datatype is None:
            raise ValueError(
                "dataset and datatype must be provided for NOAA requests"
            )

        def _fetch_noaa_segment(seg_start: str, seg_end: str) -> pd.DataFrame:
            """Inner helper for fetching a single segment from the CDO API.

            Splitting the request into multiple smaller segments helps avoid
            server‑side limitations (such as maximum result count) and
            improves reliability when retrieving long date ranges.  On
            HTTP 400/404 errors an empty DataFrame is returned so that the
            caller can decide whether to fallback to the ADS service.
            """
            stationid_local = station if ":" in station else f"{dataset}:{station}"
            limit_local = 1000
            params_local = {
                "datasetid": dataset,
                "stationid": stationid_local,
                "datatypeid": datatype,
                "startdate": seg_start,
                "enddate": seg_end,
                "units": "metric" if units == "mm" else "standard",
                "limit": limit_local,
            }
            headers_local = {"token": api_key}
            offset_local = 1
            collected: list[dict[str, object]] = []
            total_count_local: int | None = None
            while True:
                try:
                    resp = requests.get(
                        url,
                        params={**params_local, "offset": offset_local},
                        headers=headers_local,
                        timeout=timeout,
                    )
                    resp.raise_for_status()
                except requests.HTTPError as exc:
                    # On 400 or 404 errors break out so the fallback can run
                    if exc.response is not None and exc.response.status_code in {400, 404}:
                        return pd.DataFrame()
                    raise
                content_type_local = resp.headers.get("Content-Type", "")
                if "application/json" not in content_type_local:
                    raise ValueError("Unsupported response format")
                payload_local = resp.json() or {}
                metadata_local = payload_local.get("metadata")
                if isinstance(metadata_local, dict):
                    resultset_local = metadata_local.get("resultset")
                    if isinstance(resultset_local, dict):
                        count_local = resultset_local.get("count")
                        if isinstance(count_local, int):
                            total_count_local = count_local
                page_records_local = (
                    payload_local.get("results") or payload_local.get("data") or []
                )
                if not isinstance(page_records_local, list):
                    page_records_local = []
                collected.extend(page_records_local)
                if not page_records_local:
                    break
                if len(page_records_local) < limit_local:
                    break
                if (
                    total_count_local is not None
                    and offset_local + limit_local > total_count_local
                ):
                    break
                offset_local += limit_local
            return pd.DataFrame.from_records(collected)

        # Break the request into chunks if chunk_days is specified
        all_frames: list[pd.DataFrame] = []
        if chunk_days:
            try:
                start_date_full = _coerce_date(start)
                end_date_full = _coerce_date(end)
            except Exception:
                start_date_full = None
                end_date_full = None
            if start_date_full and end_date_full and start_date_full <= end_date_full:
                current_start = start_date_full
                one_day = datetime.timedelta(days=chunk_days)
                while current_start <= end_date_full:
                    current_end = min(current_start + one_day - datetime.timedelta(days=1), end_date_full)
                    segment_df = _fetch_noaa_segment(
                        current_start.isoformat(), current_end.isoformat()
                    )
                    if segment_df is not None and not segment_df.empty:
                        all_frames.append(segment_df)
                    current_start = current_end + datetime.timedelta(days=1)
        else:
            df_single = _fetch_noaa_segment(start, end)
            if df_single is not None and not df_single.empty:
                all_frames.append(df_single)

        # If nothing was retrieved from the CDO API and we are dealing with the
        # official NOAA endpoint, attempt to fallback to the Access Data Service.
        if not all_frames:
            try:
                fallback = _fetch_rainfall_ads_fallback(
                    station=station,
                    start=start,
                    end=end,
                    datatype=datatype,
                    units=units,
                    timeout=timeout,
                )
                if not fallback.empty:
                    return fallback.sort_values("Datetime").reset_index(drop=True)
            except Exception:
                # Propagate the original error when fallback fails
                pass
            # At this point either the fallback failed or there was no data
            raise ValueError("No rainfall data returned")

        df = pd.concat(all_frames, ignore_index=True)
    else:
        params = {
            "station": station,
            "start": start,
            "end": end,
            "token": api_key,
        }
        response = requests.get(url, params=params, timeout=timeout)
        response.raise_for_status()

        content_type = response.headers.get("Content-Type", "")
        if "application/json" in content_type:
            payload = response.json()
            records = payload.get("results") or payload.get("data") or []
            if not records:
                raise ValueError("No rainfall data returned")
            df = pd.DataFrame.from_records(records)
        elif "text/csv" in content_type:
            df = pd.read_csv(io.StringIO(response.text))
        else:
            raise ValueError("Unsupported response format")

    # Normalise column names
    if "date" in df.columns:
        df["Datetime"] = pd.to_datetime(df["date"]).dt.tz_localize(None)
    elif "Datetime" in df.columns:
        df["Datetime"] = pd.to_datetime(df["Datetime"]).dt.tz_localize(None)
    else:
        raise ValueError("Response missing 'date' field")

    if "value" in df.columns:
        df["Rainfall"] = df["value"]
    elif "Rainfall" not in df.columns:
        raise ValueError("Response missing 'value' field")

    result = df[["Datetime", "Rainfall"]]
    return result.sort_values("Datetime").reset_index(drop=True)


def search_stations(token: str, query: str, *, timeout: int = 30) -> pd.DataFrame:
    """Search for stations whose name contains ``query``.

    Returns a :class:`pandas.DataFrame` with columns ``id`` and ``name``.  The
    function only performs a basic case-insensitive filter of the returned
    results so that it behaves deterministically for the unit tests.
    """

    params = {
        "datasetid": "GHCND",
        "datatypeid": "PRCP",
        "limit": 1000,
        "q": query,
    }
    headers = {"token": token}
    r = requests.get(STATION_URL, headers=headers, params=params, timeout=timeout)
    r.raise_for_status()
    data = r.json().get("results", [])
    df = pd.DataFrame(data)

    # Ensure required columns are present
    if df.empty or not {"id", "name"}.issubset(df.columns):
        return pd.DataFrame(columns=["id", "name"])

    df = df[["id", "name"]]
    mask = (
        df["name"].str.contains(query, case=False, na=False, regex=False)
        | df["id"].str.contains(query, case=False, na=False, regex=False)
    )
    return df[mask].reset_index(drop=True)


def find_stations_by_city(
    city: str,
    headers: dict,
    *,
    buffer: float = 0.25,
    timeout: int = 30,
    limit: int = 20,
) -> list[dict[str, object]]:
    """Locate stations near ``city`` using a simple bounding box search.

    The function first geocodes the city name via OpenStreetMap's Nominatim
    service and then queries the NOAA station endpoint for stations within a
    latitude/longitude extent.  ``limit`` controls the maximum number of
    stations returned (defaulting to 20) which keeps the GUI responsive when
    plotting results on a map.  A list of dictionaries is returned where each
    entry contains the
    station ``id``, ``name``, ``latitude`` and ``longitude`` as well as the
    station's ``mindate``/``maxdate`` range and ``datacoverage`` value.  The
    ``headers`` argument mirrors the historic interface used by the GUI and
    typically contains the NOAA API token.
    """

    cache_key = ("station_search", city.strip().lower(), round(buffer, 4), int(limit))
    cached = _cache_get(*cache_key)
    if isinstance(cached, list):
        return [dict(item) for item in cached if isinstance(item, dict)]

    geo_url = "https://nominatim.openstreetmap.org/search"
    geo_params = {"q": city, "format": "json", "limit": 1}
    # Nominatim requires a custom user agent with contact information
    geo_headers = {"User-Agent": "hh-tools/1.0 (https://example.com)"}
    try:
        r = requests.get(geo_url, params=geo_params, headers=geo_headers, timeout=timeout)
        r.raise_for_status()
    except requests.RequestException:
        return []

    results = r.json()
    if not results:
        return []

    try:
        lat = float(results[0]["lat"])
        lon = float(results[0]["lon"])
        print(f"DEBUG: Geocoded '{city}' to lat={lat}, lon={lon}")
    except (KeyError, TypeError, ValueError):
        return []
    # The NOAA CDO API expects the extent in ``minLon,minLat,maxLon,maxLat`` order
    # (i.e. longitude/latitude pairs).  The previous implementation used
    # ``minLon,maxLon,minLat,maxLat`` which swapped the middle latitude/longitude
    # values and produced unpredictable search results when the bounding box was
    # applied server-side.
    extent = f"{lon-buffer},{lat-buffer},{lon+buffer},{lat+buffer}"
    params = {
        "datasetid": "GHCND",
        "datatypeid": "PRCP",
        "limit": limit,
        "extent": extent,
    }
    r = requests.get(STATION_URL, headers=headers, params=params, timeout=timeout)
    r.raise_for_status()

    data = r.json().get("results", [])
    stations = [
        {
            "id": st["id"],
            "name": st.get("name", ""),
            "latitude": st.get("latitude"),
            "longitude": st.get("longitude"),
            "mindate": _normalise_iso_date(st.get("mindate")),
            "maxdate": _normalise_iso_date(st.get("maxdate")),
            "datacoverage": st.get("datacoverage"),
        }
        for st in data
    ]
    _cache_set(stations, *cache_key)
    return stations


def available_datasets(
    station: str, token: str, *, timeout: int = 30
) -> List[dict[str, str]]:
    """Return dataset metadata available for ``station``.

    The function queries the NOAA ``datasets`` endpoint using the provided
    ``station`` identifier and returns a list of dictionaries.  Each dictionary
    contains the dataset ``id``, ``name`` and the earliest (``mindate``) and
    latest (``maxdate``) available dates.  The ``station`` may already include
    a dataset prefix; if not, it is used as-is which mirrors NOAA's behaviour.
    """

    cache_key = ("datasets", station)
    cached = _cache_get(*cache_key)
    if isinstance(cached, list):
        results: list[dict[str, str]] = []
        for entry in cached:
            if isinstance(entry, dict):
                results.append({str(k): entry.get(k) for k in ("id", "name", "mindate", "maxdate")})
        if results:
            return results

    headers = {"token": token}
    params = {"stationid": station, "limit": 1000}
    url = "https://www.ncdc.noaa.gov/cdo-web/api/v2/datasets"
    r = requests.get(url, headers=headers, params=params, timeout=timeout)
    r.raise_for_status()
    data = r.json().get("results", [])
    datasets = [
        {
            "id": d["id"],
            "name": d.get("name", ""),
            "mindate": _normalise_iso_date(d.get("mindate")),
            "maxdate": _normalise_iso_date(d.get("maxdate")),
        }
        for d in data
    ]
    _cache_set(datasets, *cache_key)
    return datasets


def available_datatypes(
    station: str, dataset: str, token: str, *, timeout: int = 30
) -> List[Tuple[str, str]]:
    """Return datatype identifiers and names for ``station`` and ``dataset``.

    The datatypes endpoint is queried with both the ``station`` and ``dataset``
    parameters which ensures that only datatypes relevant to the chosen dataset
    are returned.  A list of ``(id, name)`` tuples is provided.
    """

    stationid = station if ":" in station else f"{dataset}:{station}"
    cache_key = ("datatypes", stationid, dataset)
    cached = _cache_get(*cache_key)
    if isinstance(cached, list):
        tuples: list[Tuple[str, str]] = []
        for entry in cached:
            if isinstance(entry, (list, tuple)) and len(entry) >= 2:
                tuples.append((str(entry[0]), str(entry[1])))
        if tuples:
            return tuples

    headers = {"token": token}
    params = {"stationid": stationid, "datasetid": dataset, "limit": 1000}
    url = "https://www.ncdc.noaa.gov/cdo-web/api/v2/datatypes"
    r = requests.get(url, headers=headers, params=params, timeout=timeout)
    r.raise_for_status()
    data = r.json().get("results", [])
    results = [(d["id"], d.get("name", "")) for d in data]
    serialisable = [[item[0], item[1]] for item in results]
    _cache_set(serialisable, *cache_key)
    return results


def _write_tsf(path: Path, station: str, df: pd.DataFrame) -> None:
    with open(path, "w") as f:
        f.write(f"IDs:\t{station}\n")
        f.write("\n")
        f.write("Datetime\tRainfall\n")
        for _, row in df.iterrows():
            f.write(f"{row['Datetime']}\t{row['Rainfall']}\n")


def _write_swmm(path: Path, df: pd.DataFrame) -> None:
    with open(path, "w") as f:
        f.write("[TIMESERIES]\n")
        for _, row in df.iterrows():
            f.write(f"RAINFALL {row['Datetime']:%Y-%m-%d %H:%M} {row['Rainfall']}\n")

def _stationid_with_dataset(station: str, dataset: str) -> str:
    return station if ":" in station else f"{dataset}:{station}"

# ---------------------------------------------------------------------------
# New helper: find station-specific date range
# ---------------------------------------------------------------------------
def station_date_range(
    station: str,
    dataset: str,
    datatype: str | None,
    token: str,
    *,
    start: str | None = None,
    end: str | None = None,
    timeout: int = 30,
) -> tuple[str | None, str | None]:
    """Return the earliest and latest observation dates for a station.

    This helper performs two lightweight queries against the NOAA CDO API
    to determine the true period of record for a given station, dataset and
    optional datatype.  It orders the results by date ascending and
    descending, requesting only a single record in each direction.  If
    successful, the ISO (YYYY‑MM‑DD) timestamps of the earliest and latest
    observations are returned.  When no data is available or an error
    occurs the corresponding return value will be ``None``.

    Parameters
    ----------
    station: str
        Station identifier.  A dataset prefix may be included; if
        missing it will be added automatically.
    dataset: str
        Dataset identifier (e.g. ``GHCND``).
    datatype: str, optional
        Datatype identifier to restrict the search (e.g. ``PRCP``).  If
        ``None`` all datatypes are considered.
    token: str
        NOAA CDO API token.
    start: str, optional
        Optional start date to constrain the search (ISO formatted).  If
        provided, observations before this date will not be considered.
    end: str, optional
        Optional end date to constrain the search (ISO formatted).
    timeout: int, optional
        Timeout in seconds for each HTTP request.  Defaults to 30.

    Returns
    -------
    tuple
        ``(mindate, maxdate)`` where each element is an ISO formatted
        date string or ``None`` if unavailable.
    """
    stationid = _stationid_with_dataset(station, dataset)
    headers = {"token": token}

    def _query(order: str) -> str | None:
        params: dict[str, object] = {
            "datasetid": dataset,
            "stationid": stationid,
            "limit": 1,
            "sortfield": "date",
            "sortorder": order,
        }
        if datatype:
            params["datatypeid"] = datatype
        if start:
            params["startdate"] = start
        if end:
            params["enddate"] = end
        try:
            resp = requests.get(NOAA_URL, headers=headers, params=params, timeout=timeout)
            resp.raise_for_status()
            results = (resp.json() or {}).get("results") or []
            if not results:
                return None
            # Extract and normalise the first record's date field
            date_value = results[0].get("date")
            return _normalise_iso_date(str(date_value))
        except Exception:
            return None

    earliest = _query("asc")
    latest = _query("desc")
    return earliest, latest


def station_period_of_record(
    station: str,
    dataset: str,
    token: str,
    *,
    timeout: int = 30,
) -> tuple[str | None, str | None]:
    """Return the period of record for a station within a dataset.

    Unlike :func:`station_date_range`, which queries the ``data`` endpoint and
    attempts to sort individual observations, this helper leverages the
    ``stations`` endpoint of the NOAA CDO API.  When queried with both
    ``datasetid`` and ``stationid``, the API returns dataset‑specific
    metadata for the station, including the ``mindate`` and ``maxdate``.
    These values correspond to the earliest and latest observations for the
    specified dataset across all datatypes.  This call is inexpensive and
    suitable for determining a reasonable date range without scanning
    individual records.  On success, the ISO (YYYY‑MM‑DD) timestamps of
    the minimum and maximum dates are returned.  When no data is available
    or an error occurs, ``None`` is returned for the corresponding value.

    Parameters
    ----------
    station: str
        Station identifier.  A dataset prefix may be included; if missing
        it will be added automatically.
    dataset: str
        Dataset identifier (e.g. ``GHCND``).
    token: str
        NOAA CDO API token.
    timeout: int, optional
        Timeout in seconds for the HTTP request.  Defaults to 30.

    Returns
    -------
    tuple
        ``(mindate, maxdate)`` where each element is an ISO formatted date
        string or ``None`` if unavailable.
    """
    stationid = _stationid_with_dataset(station, dataset)
    params = {
        "datasetid": dataset,
        "stationid": stationid,
        "limit": 1,
    }
    headers = {"token": token}
    try:
        resp = requests.get(STATION_URL, headers=headers, params=params, timeout=timeout)
        resp.raise_for_status()
        results = (resp.json() or {}).get("results") or []
        if not results:
            return None, None
        rec = results[0]
        min_date = _normalise_iso_date(rec.get("mindate"))
        max_date = _normalise_iso_date(rec.get("maxdate"))
        return min_date or None, max_date or None
    except Exception:
        return None, None

def available_datatypes_with_extents(
    station: str,
    dataset: str,
    token: str,
    *,
    timeout: int = 30,
    dataset_mindate: str | None = None,
    dataset_maxdate: str | None = None,
):
    """Return datatype metadata enriched with dataset level date ranges."""

    pairs = available_datatypes(station, dataset, token, timeout=timeout)
    mindate = _normalise_iso_date(dataset_mindate)
    maxdate = _normalise_iso_date(dataset_maxdate)
    return [
        {
            "id": dt_id,
            "name": dt_name,
            "mindate": mindate,
            "maxdate": maxdate,
        }
        for dt_id, dt_name in pairs
    ]


def _clamp_date_range_to_dataset(
    station: str,
    dataset: str,
    token: str,
    start: str,
    end: str,
    *,
    timeout: int = 30,
) -> tuple[str, str, bool, str | None]:
    """Clamp ``start``/``end`` to the available range for ``dataset``."""

    start_date = _coerce_date(start)
    end_date = _coerce_date(end)
    if start_date and end_date and start_date > end_date:
        return start, end, False, "No rainfall data is available for the selected date range."

    try:
        stationid = _stationid_with_dataset(station, dataset)
        datasets = available_datasets(stationid, token, timeout=timeout)
    except requests.RequestException:
        return start, end, False, None

    info = None
    for entry in datasets:
        if isinstance(entry, dict) and str(entry.get("id")) == str(dataset):
            info = entry
            break

    if not info:
        return start, end, False, None

    ds_min = _coerce_date(info.get("mindate"))
    ds_max = _coerce_date(info.get("maxdate"))

    changed = False

    if start_date and ds_min and start_date < ds_min:
        start_date = ds_min
        changed = True

    if end_date and ds_max and end_date > ds_max:
        end_date = ds_max
        changed = True

    if start_date and end_date and start_date > end_date:
        if ds_min and ds_max:
            message = (
                "No rainfall data is available for the selected date range. "
                f"Available coverage is {ds_min.isoformat()} to {ds_max.isoformat()}."
            )
        else:
            message = "No rainfall data is available for the selected date range."
        return start, end, False, message

    new_start = start_date.isoformat() if start_date else start
    new_end = end_date.isoformat() if end_date else end

    return new_start, new_end, changed, None


def has_data_in_range(
    station: str,
    dataset: str,
    datatype: str,
    start: str,
    end: str,
    token: str,
    *,
    timeout: int = 20,
) -> bool:
    stationid = _stationid_with_dataset(station, dataset)
    headers = {"token": token}
    params = {
        "datasetid": dataset,
        "datatypeid": datatype,
        "stationid": stationid,
        "startdate": start,
        "enddate": end,
        "limit": 1,
    }
    try:
        r = requests.get(NOAA_URL, headers=headers, params=params, timeout=timeout)
        r.raise_for_status()
        res = (r.json() or {}).get("results") or []
        if res:
            return True
        # No result returned from the CDO API – attempt to query the ADS fallback
        try:
            # Use the fallback with a very small window to minimise overhead
            df = _fetch_rainfall_ads_fallback(
                station=station,
                start=start,
                end=end,
                datatype=datatype,
                units="in",  # units are irrelevant for a yes/no check
                timeout=timeout,
            )
            return not df.empty
        except Exception:
            return False
    except requests.RequestException:
        return False


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _fetch_rainfall_ads_fallback(
    station: str,
    start: str,
    end: str,
    *,
    datatype: str | None,
    units: str,
    timeout: int,
) -> pd.DataFrame:
    """Fetch rainfall using the NCEI Access Data Service (ADS).

    Some stations (notably CoCoRaHS identifiers) are not served via the CDO
    API.  The Access Data Service provides a separate interface that does not
    require an API token.  This helper normalises the ADS response into the
    canonical ``Datetime``/``Rainfall`` format.

    Parameters
    ----------
    station: str
        The station identifier.  Both plain and dataset‑prefixed identifiers
        are accepted.  If a prefix is present only the raw station code is
        forwarded to ADS.
    start: str
        Start date in ISO format (YYYY‑MM‑DD).
    end: str
        End date in ISO format (YYYY‑MM‑DD).
    datatype: str, optional
        Data type identifier (e.g. ``PRCP``).  Some datasets may return
        multiple precipitation columns; if not provided the helper will fall
        back to standard names.
    units: str
        ``"mm"`` for metric units or ``"in"`` for inches.  Controls the
        ``units`` parameter passed to ADS (``metric`` or ``standard``).
    timeout: int
        Network timeout in seconds.

    Returns
    -------
    pandas.DataFrame
        DataFrame with ``Datetime`` and ``Rainfall`` columns, or an empty
        frame if no data were returned.
    """
    # Remove any dataset prefix from the station ID.  ADS expects raw
    # identifiers (e.g. "US1PAAL0001" not "GHCND:US1PAAL0001").
    if ":" in station:
        _, raw_id = station.split(":", 1)
    else:
        raw_id = station

    # ADS uses ``daily‑summaries`` as the equivalent dataset for GHCND
    # (Daily Summaries).  The ``datatype`` is forwarded via ``dataTypes``.
    params: dict[str, str] = {
        "dataset": "daily-summaries",
        "stations": raw_id,
        "startDate": start,
        "endDate": end,
        "units": "metric" if units == "mm" else "standard",
        "format": "json",
    }
    if datatype:
        params["dataTypes"] = datatype
    ads_url = "https://www.ncei.noaa.gov/access/services/data/v1"
    resp = requests.get(ads_url, params=params, timeout=timeout)
    # On 400/404 simply return an empty DataFrame to signal failure
    try:
        resp.raise_for_status()
    except requests.HTTPError as exc:
        if exc.response is not None and exc.response.status_code in {400, 404}:
            return pd.DataFrame()
        raise
    # The ADS can return JSON (list of records) or CSV; attempt JSON first
    df_records: pd.DataFrame
    try:
        data = resp.json()
        if not data:
            return pd.DataFrame()
        df_records = pd.DataFrame.from_records(data)
    except ValueError:
        # Fallback to CSV parsing
        df_records = pd.read_csv(io.StringIO(resp.text))
    if df_records.empty:
        return pd.DataFrame()
    # Identify the date column (ADS uses DATE) and normalise to Datetime
    date_col: str | None = None
    for candidate in ("DATE", "date", "Date"):
        if candidate in df_records.columns:
            date_col = candidate
            break
    if date_col is None:
        # Without a date column we cannot proceed
        raise ValueError("Response missing date field")
    df_records["Datetime"] = pd.to_datetime(df_records[date_col]).dt.tz_localize(None)
    # Identify the rainfall value column
    rainfall_col: str | None = None
    # Check exact matches first
    if datatype:
        for candidate in (datatype, datatype.upper(), datatype.lower()):
            if candidate in df_records.columns:
                rainfall_col = candidate
                break
    if rainfall_col is None:
        # Fallback to common precipitation names
        for candidate in (
            "PRCP",
            "prcp",
            "PRCP_MM",
            "PRCP_IN",
            "PRECIP",
            "precipitation",
            "value",
        ):
            if candidate in df_records.columns:
                rainfall_col = candidate
                break
    if rainfall_col is None:
        raise ValueError("Response missing rainfall field")
    # Convert rainfall to numeric; coercing errors to NaN
    df_records["Rainfall"] = pd.to_numeric(df_records[rainfall_col], errors="coerce")
    return df_records[["Datetime", "Rainfall"]]

def main(argv: Iterable[str] | None = None) -> None:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    ap.add_argument("--station", required=True, help="Station identifier")
    ap.add_argument("--start", required=True, help="Start date/time (YYYY-MM-DD or ISO)")
    ap.add_argument("--end", required=True, help="End date/time (YYYY-MM-DD or ISO)")
    ap.add_argument("--api-key", required=True, help="NOAA API token")
    ap.add_argument("--output", required=True, help="Output file path")
    ap.add_argument(
        "--format",
        choices=["csv", "tsf", "swmm"],
        default="csv",
        help="Output format",
    )
    ap.add_argument(
        "--units", choices=["mm", "in"], default="in", help="Units for rainfall values"
    )
    ap.add_argument(
        "--chunk-days",
        type=int,
        default=None,
        metavar="N",
        help=(
            "Optional: split CDO requests into N‑day segments.  Useful for very long "
            "ranges or to work around API limitations.  Ignored for non‑NOAA sources."
        ),
    )
    ap.add_argument("--source", default="noaa", help="Data source identifier")
    ap.add_argument("--dataset", default="GHCND", help="NOAA dataset identifier")
    ap.add_argument("--datatype", default="PRCP", help="NOAA datatype identifier")
    ap.add_argument("-v", "--verbose", action="store_true", help="Enable debug logging")
    ap.add_argument("-q", "--quiet", action="store_true", help="Suppress non-error output")
    args = ap.parse_args(list(argv) if argv is not None else None)

    level = logging.INFO
    if args.verbose:
        level = logging.DEBUG
    elif args.quiet:
        level = logging.ERROR
    logging.basicConfig(level=level, format="%(message)s")

    url = NOAA_URL if args.source.lower() == "noaa" else "https://example.com/rainfall"
    start = args.start
    end = args.end

    if url == NOAA_URL:
        start, end, changed, error_message = _clamp_date_range_to_dataset(
            args.station,
            args.dataset,
            args.api_key,
            start,
            end,
        )
        if error_message:
            logging.error(error_message)
            raise SystemExit(2)
        if changed:
            logging.info(
                "Adjusted date range to %s → %s based on dataset availability.",
                start,
                end,
            )

    try:
        df = fetch_rainfall(
            args.station,
            start,
            end,
            args.api_key,
            url=url,
            dataset=args.dataset,
            datatype=args.datatype,
            units=args.units,
            chunk_days=args.chunk_days,
        )
    except ValueError as exc:
        if _is_no_data_error(exc):
            logging.error(
                "No rainfall data was returned for the requested station and date range."
            )
            raise SystemExit(2)
        logging.error("Failed to fetch rainfall data: %s", exc)
        raise SystemExit(1)
    except requests.Timeout:
        logging.error(
            "The request to the rainfall service timed out. Please try again later."
        )
        raise SystemExit(1)
    except requests.HTTPError as exc:
        logging.error(_format_http_error(exc))
        raise SystemExit(1)
    except requests.RequestException as exc:
        logging.error("Network error while fetching rainfall data: %s", exc)
        raise SystemExit(1)
    except Exception as exc:  # pragma: no cover - unexpected error handler
        logging.error("Unexpected error while fetching rainfall data: %s", exc)
        raise SystemExit(1)

    out_path = Path(args.output)
    if out_path.suffix == "":
        out_path = out_path.with_suffix(f".{args.format}")

    try:
        if args.format == "csv":
            df.to_csv(out_path, index=False)
        elif args.format == "tsf":
            _write_tsf(out_path, args.station, df)
        else:  # swmm
            _write_swmm(out_path, df)
    except OSError as exc:
        logging.error("Unable to write output file %s: %s", out_path, exc)
        raise SystemExit(1)
    except Exception as exc:  # pragma: no cover - unexpected error handler
        logging.error("Unexpected error while saving rainfall data: %s", exc)
        raise SystemExit(1)

    logging.info(f"Saved {len(df)} rows to {out_path}")


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())

