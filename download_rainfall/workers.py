from __future__ import annotations
from datetime import datetime
from typing import Optional, List, Dict, Any, Tuple
from PyQt5 import QtCore

from hh_tools.download_rainfall import (
    available_datatypes_with_extents,
    find_stations_by_city,
    has_data_in_range,
    _normalise_iso_date,
    station_period_of_record,
)

class CoverageProbeWorker(QtCore.QThread):
    """Check whether data exists for yearly/decadal bins in the background."""

    coverage_ready = QtCore.pyqtSignal(list, int)
    failed = QtCore.pyqtSignal(str)

    def __init__(
        self,
        station: str,
        dataset: str,
        datatype: str,
        token: str,
        start: str,
        end: str,
        parent: QtCore.QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._station = station
        self._dataset = dataset
        self._datatype = datatype
        self._token = token
        self._start = start
        self._end = end

    @staticmethod
    def _build_bins(start_year: int, end_year: int) -> tuple[list[tuple[str, int, int]], int]:
        span = max(1, end_year - start_year + 1)
        if span <= 20:
            step = 1
        elif span <= 60:
            step = 5
        else:
            step = 10
        bins: list[tuple[str, int, int]] = []
        year = start_year - (start_year % step)
        while year <= end_year:
            bin_start = max(start_year, year)
            bin_end = min(end_year, year + step - 1)
            if step == 1 or bin_start == bin_end:
                label = str(bin_start)
            else:
                label = f"{bin_start}–{bin_end}"
            bins.append((label, bin_start, bin_end))
            year += step
        return bins, step

    def run(self) -> None:
        try:
            start_year = datetime.strptime(self._start, "%Y-%m-%d").year
            end_year = datetime.strptime(self._end, "%Y-%m-%d").year
        except ValueError:
            self.failed.emit("Coverage preview unavailable – invalid date range.")
            return
        if end_year < start_year:
            self.failed.emit("Coverage preview unavailable – invalid date range.")
            return
        bins, step = self._build_bins(start_year, end_year)
        results: list[dict[str, object]] = []
        for label, year_start, year_end in bins:
            if self.isInterruptionRequested():
                return
            start = f"{year_start:04d}-01-01"
            end = f"{year_end:04d}-12-31"
            try:
                has_data = has_data_in_range(
                    self._station,
                    self._dataset,
                    self._datatype,
                    start,
                    end,
                    self._token,
                )
            except Exception as exc:
                self.failed.emit(f"Coverage preview failed: {exc}")
                return
            results.append(
                {
                    "label": label,
                    "value": 100.0 if has_data else 0.0,
                    "start": year_start,
                    "end": year_end,
                }
            )
        if not results:
            self.failed.emit("Coverage preview unavailable for this selection.")
            return
        self.coverage_ready.emit(results, step)


class StationSearchWorker(QtCore.QThread):
    """Background worker that performs city based station lookups."""

    result_ready = QtCore.pyqtSignal(list)
    error = QtCore.pyqtSignal(str)
    message = QtCore.pyqtSignal(str)

    def __init__(self, city: str, token: str, parent: Optional[QtCore.QObject] = None):
        super().__init__(parent)
        self._city = city
        self._token = token

    def run(self) -> None:
        headers = {"token": self._token}
        try:
            stations = find_stations_by_city(self._city, headers, limit=20)
        except Exception as exc:
            self.error.emit(f"Station search failed: {exc}")
            return

        if not stations and not self.isInterruptionRequested():
            self.message.emit("No stations found, expanding search radius...")
            try:
                stations = find_stations_by_city(
                    self._city,
                    headers,
                    buffer=1.0,
                    limit=20,
                )
            except Exception as exc:
                self.error.emit(f"Station search failed: {exc}")
                return

        if self.isInterruptionRequested():
            return

        self.result_ready.emit(stations)


class DatatypeFetcher(QtCore.QThread):
    datatypes_ready = QtCore.pyqtSignal(str, str, list)
    error = QtCore.pyqtSignal(str, str, str)

    def __init__(
        self,
        station: str,
        dataset: str,
        token: str,
        dataset_mindate: str | None = None,
        dataset_maxdate: str | None = None,
        parent: Optional[QtCore.QObject] = None,
    ):
        super().__init__(parent)
        self._station = station
        self._dataset = dataset
        self._token = token
        self._dataset_mindate = dataset_mindate
        self._dataset_maxdate = dataset_maxdate

    def run(self) -> None:
        try:
            dtypes = available_datatypes_with_extents(
                self._station,
                self._dataset,
                self._token,
                dataset_mindate=self._dataset_mindate,
                dataset_maxdate=self._dataset_maxdate,
            )
        except Exception as exc:
            self.error.emit(self._station, self._dataset, str(exc))
            return
        # Determine a reasonable period of record for the station across
        # the selected dataset.
        try:
            station_min, station_max = station_period_of_record(
                self._station, self._dataset, self._token, timeout=20
            )
        except Exception:
            station_min = None
            station_max = None
        # Normalise the station period of record
        if station_min:
            station_min = _normalise_iso_date(station_min)
        if station_max:
            station_max = _normalise_iso_date(station_max)
        normalised: list[dict] = []
        for dtype in dtypes:
            dt_item = dict(dtype)
            # Normalise the datatype dates returned by the API
            dt_item["mindate"] = _normalise_iso_date(dt_item.get("mindate"))
            dt_item["maxdate"] = _normalise_iso_date(dt_item.get("maxdate"))
            # If the datatype period appears missing or implausibly early
            # (e.g. before 1800) then substitute the station period of
            # record obtained above.
            md = dt_item.get("mindate") or ""
            if not md or (len(md) >= 10 and md < "1800-01-01"):
                if station_min:
                    dt_item["mindate"] = station_min
            mx = dt_item.get("maxdate") or ""
            if not mx or (len(mx) >= 10 and mx < "1800-01-01"):
                if station_max:
                    dt_item["maxdate"] = station_max
            normalised.append(dt_item)
        self.datatypes_ready.emit(self._station, self._dataset, normalised)
