from __future__ import annotations
import json
from datetime import datetime
from typing import Dict, Any, List, Optional
from PyQt5 import QtCore, QtGui, QtWidgets

try:
    from PyQt5 import QtWebEngineWidgets
except Exception:
    QtWebEngineWidgets = None

try:
    from PyQt5.QtWebChannel import QWebChannel
except Exception:
    QWebChannel = None

from hh_tools.download_rainfall import (
    available_datasets,
    _normalise_iso_date,
)

from .chart import CoverageChartWidget
from .workers import StationSearchWorker
from .map_widget import MapBridge

class StationListItemWidget(QtWidgets.QWidget):
    """Composite widget showing a station entry with favourite + queue toggles."""

    favorite_toggled = QtCore.pyqtSignal(str, bool)
    queue_toggled = QtCore.pyqtSignal(str, bool)

    def __init__(
        self,
        station_id: str,
        text: str,
        favorite: bool,
        emphasise: bool,
        parent: QtWidgets.QWidget | None = None,
    ) -> None:
        super().__init__(parent)
        self._station_id = station_id
        layout = QtWidgets.QHBoxLayout(self)
        layout.setContentsMargins(4, 0, 4, 0)
        layout.setSpacing(6)

        self._queue_box = QtWidgets.QCheckBox()
        self._queue_box.setToolTip("Select to add this station to the batch queue")
        self._queue_box.toggled.connect(self._emit_queue_toggle)
        layout.addWidget(self._queue_box, 0, QtCore.Qt.AlignVCenter)

        self._label = QtWidgets.QLabel(text)
        self._label.setWordWrap(True)
        layout.addWidget(self._label, 1)

        self._button = QtWidgets.QToolButton()
        self._button.setCheckable(True)
        self._button.setAutoRaise(True)
        self._button.setCursor(QtGui.QCursor(QtCore.Qt.PointingHandCursor))
        self._button.clicked.connect(self._emit_toggle)
        layout.addWidget(self._button, 0, QtCore.Qt.AlignRight)

        layout.addStretch(0)

        self.set_emphasis(emphasise)
        self.set_favorite(favorite)
        self.set_queue_checked(False)

    def set_text(self, text: str) -> None:
        self._label.setText(text)

    def set_emphasis(self, emphasise: bool) -> None:
        font = self._label.font()
        font.setBold(bool(emphasise))
        self._label.setFont(font)

    def set_favorite(self, favorite: bool) -> None:
        blocker = QtCore.QSignalBlocker(self._button)
        self._button.setChecked(bool(favorite))
        del blocker
        self._update_star_icon()

    def set_queue_checked(self, checked: bool) -> None:
        blocker = QtCore.QSignalBlocker(self._queue_box)
        self._queue_box.setChecked(bool(checked))
        del blocker

    def is_queue_checked(self) -> bool:
        return self._queue_box.isChecked()

    def _update_star_icon(self) -> None:
        if self._button.isChecked():
            self._button.setText("★")
            self._button.setToolTip("Remove from favorites")
        else:
            self._button.setText("☆")
            self._button.setToolTip("Add to favorites")

    def _emit_toggle(self) -> None:
        self._update_star_icon()
        self.favorite_toggled.emit(self._station_id, self._button.isChecked())

    def _emit_queue_toggle(self, checked: bool) -> None:
        self.queue_toggled.emit(self._station_id, bool(checked))


class StationSearchPanel(QtWidgets.QWidget):
    station_selected = QtCore.pyqtSignal(str, list)
    message = QtCore.pyqtSignal(str)
    table_row_selected = QtCore.pyqtSignal(dict)
    queue_selection_changed = QtCore.pyqtSignal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QtWidgets.QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)

        search_layout = QtWidgets.QHBoxLayout()
        self.city_edit = QtWidgets.QLineEdit()
        self.search_btn = QtWidgets.QPushButton("Search")
        self.city_edit.returnPressed.connect(self._start_search)
        search_layout.setContentsMargins(0, 0, 0, 0)
        search_layout.setSpacing(6)
        search_layout.addWidget(self.city_edit)
        search_layout.addWidget(self.search_btn)

        self.list = QtWidgets.QListWidget()
        self.list.setMaximumHeight(120)
        self.list.itemDoubleClicked.connect(self._list_chosen)
        self.list.currentItemChanged.connect(self._selection_changed)

        self.favorites_list = QtWidgets.QListWidget()
        self.favorites_list.setMaximumHeight(120)
        self.favorites_list.itemDoubleClicked.connect(self._favorite_item_chosen)
        self.favorites_list.currentItemChanged.connect(
            self._favorite_selection_changed
        )

        self._lists_tab = QtWidgets.QTabWidget()
        results_container = QtWidgets.QWidget()
        results_layout = QtWidgets.QVBoxLayout(results_container)
        results_layout.setContentsMargins(0, 0, 0, 0)
        results_layout.addWidget(self.list)
        self._lists_tab.addTab(results_container, "Results")

        favorites_container = QtWidgets.QWidget()
        favorites_layout = QtWidgets.QVBoxLayout(favorites_container)
        favorites_layout.setContentsMargins(0, 0, 0, 0)
        self.favorites_placeholder = QtWidgets.QLabel(
            "No favorites yet. Tap ☆ to save a station."
        )
        self.favorites_placeholder.setAlignment(QtCore.Qt.AlignCenter)
        self.favorites_placeholder.setWordWrap(True)
        favorites_layout.addWidget(self.favorites_placeholder)
        favorites_layout.addWidget(self.favorites_list)
        self._lists_tab.addTab(favorites_container, "Favorites")

        top_widget = QtWidgets.QWidget()
        top_layout = QtWidgets.QVBoxLayout(top_widget)
        top_layout.setContentsMargins(0, 0, 0, 0)
        top_layout.setSpacing(6)
        top_layout.addLayout(search_layout)
        top_layout.addWidget(self._lists_tab)

        if QtWebEngineWidgets is not None:
            self.map_view = QtWebEngineWidgets.QWebEngineView()
            self.map_view.loadFinished.connect(self._map_load_finished)
        else:
            self.map_view = QtWidgets.QLabel("Map preview unavailable")
            self.map_view.setAlignment(QtCore.Qt.AlignCenter)
        self.map_view.setMinimumHeight(160)
        map_container = QtWidgets.QWidget()
        map_layout = QtWidgets.QVBoxLayout(map_container)
        map_layout.setContentsMargins(0, 0, 0, 0)
        map_layout.addWidget(self.map_view)

        self.table = QtWidgets.QTableWidget(0, 4)
        self.table.setMinimumHeight(240)
        self.table.setHorizontalHeaderLabels(["Dataset", "Datatype", "Earliest", "Latest"])
        header = self.table.horizontalHeader()
        header.setSectionResizeMode(QtWidgets.QHeaderView.ResizeToContents)
        header.setStretchLastSection(True)
        self.table.setSelectionBehavior(QtWidgets.QAbstractItemView.SelectRows)
        self.table.setSelectionMode(QtWidgets.QAbstractItemView.SingleSelection)
        self.table.itemSelectionChanged.connect(self._table_selection_changed)

        self.coverage_title = QtWidgets.QLabel("Data coverage preview")
        self.coverage_title.setStyleSheet("font-weight: bold;")
        self.coverage_chart = CoverageChartWidget(self)

        self.progress = QtWidgets.QProgressBar()
        self.progress.setVisible(False)
        self.progress.setSizePolicy(
            QtWidgets.QSizePolicy.Preferred, QtWidgets.QSizePolicy.Fixed
        )

        bottom_widget = QtWidgets.QWidget()
        bottom_layout = QtWidgets.QVBoxLayout(bottom_widget)
        bottom_layout.setContentsMargins(0, 0, 0, 0)
        bottom_layout.setSpacing(6)
        bottom_layout.addWidget(self.table)
        bottom_layout.addWidget(self.coverage_title)
        bottom_layout.addWidget(self.coverage_chart)
        bottom_layout.addWidget(self.progress)

        self._splitter = QtWidgets.QSplitter(QtCore.Qt.Vertical)
        self._splitter.setChildrenCollapsible(False)
        self._splitter.addWidget(top_widget)
        self._splitter.addWidget(map_container)
        self._splitter.addWidget(bottom_widget)
        self._splitter.setStretchFactor(0, 0)
        self._splitter.setStretchFactor(1, 1)
        self._splitter.setStretchFactor(2, 0)
        layout.addWidget(self._splitter)

        self.token = ""
        self._stations: Dict[str, Dict[str, Any]] = {}
        self._favorites_settings = QtCore.QSettings(
            "HHTools", "DownloadRainfallFavorites"
        )
        self._layout_settings = QtCore.QSettings(
            "HHTools", f"{self.__class__.__name__}Layout"
        )
        self._favorites: Dict[str, Dict[str, Any]] = {}
        self._favorite_ids: list[str] = []
        self._map_stations: List[Dict[str, Any]] = []
        self._map_bridge: MapBridge | None = None
        self._web_channel = None
        self._map_ready = False
        self._pending_selection: tuple[str, bool] | None = None
        self._queue_checked_ids: set[str] = set()
        if QtWebEngineWidgets is not None and QWebChannel is not None:
            self._map_bridge = MapBridge(self)
            self._map_bridge.stationClicked.connect(self._map_station_clicked)
            self._web_channel = QWebChannel(self.map_view.page())
            self._web_channel.registerObject("bridge", self._map_bridge)
            self.map_view.page().setWebChannel(self._web_channel)
        self._search_worker: StationSearchWorker | None = None
        self.search_btn.clicked.connect(self._start_search)
        self.coverage_chart.set_message("Select a dataset and datatype to preview coverage.")
        self._load_favorites()
        self._restore_splitter_sizes()

    def set_token(self, token: str) -> None:
        self.token = token

    # Coverage preview helpers ----------------------------------------
    def show_coverage_message(self, text: str) -> None:
        self.coverage_chart.set_message(text)

    def show_coverage_loading(self, text: str) -> None:
        self.coverage_chart.show_loading(text)

    def show_coverage_bins(self, bins: list[dict[str, object]], span_years: int) -> None:
        self.coverage_chart.set_bins(bins, span_years)

    def _start_search(self):
        city = self.city_edit.text().strip()
        token = self.token.strip()
        if not city or not token:
            self.message.emit("Enter city and API key before searching.")
            return
        self.message.emit(f"Searching stations near {city}...")
        self._lists_tab.setCurrentIndex(0)
        self.list.clear()
        self.table.setRowCount(0)
        self._stations.clear()
        self._update_map([])
        self.show_coverage_message("Select a dataset and datatype to preview coverage.")
        self.progress.setRange(0, 0)
        self.progress.setVisible(True)
        if self._queue_checked_ids:
            self._queue_checked_ids.clear()
            self.queue_selection_changed.emit(0)
        if self._search_worker:
            self._search_worker.requestInterruption()
        worker = StationSearchWorker(city, token, self)
        worker.result_ready.connect(self._search_completed)
        worker.error.connect(self._search_error)
        worker.message.connect(self._relay_search_message)
        worker.finished.connect(self._search_worker_finished)
        self._search_worker = worker
        worker.start()

    # Favourite helpers ------------------------------------------------
    def _is_favorite(self, station_id: str) -> bool:
        return bool(station_id) and station_id in self._favorites

    def _load_favorites(self) -> None:
        raw = self._favorites_settings.value("stations", "[]")
        if isinstance(raw, str):
            try:
                entries = json.loads(raw)
            except Exception:
                entries = []
        elif isinstance(raw, list):
            entries = [entry for entry in raw if isinstance(entry, dict)]
        else:
            entries = []
        self._favorites.clear()
        self._favorite_ids = []
        for entry in entries:
            sid = str(entry.get("id")) if entry.get("id") is not None else ""
            if not sid:
                continue
            entry["id"] = sid
            self._favorites[sid] = entry
            self._favorite_ids.append(sid)
        self._refresh_favorites_list()

    def _save_favorites(self) -> None:
        payload = [
            self._favorites[sid]
            for sid in self._favorite_ids
            if sid in self._favorites
        ]
        try:
            serialized = json.dumps(payload)
        except TypeError:
            serialized = "[]"
        self._favorites_settings.setValue("stations", serialized)

    def _refresh_favorites_list(self) -> None:
        current = self.favorites_list.currentItem()
        current_id = current.data(QtCore.Qt.UserRole) if current else ""
        self.favorites_list.blockSignals(True)
        self.favorites_list.clear()
        for sid in self._favorite_ids:
            station = self._favorites.get(sid)
            if not station:
                continue
            self._add_station_to_list(self.favorites_list, station)
        self.favorites_list.blockSignals(False)
        if current_id:
            self._select_in_list(self.favorites_list, current_id)
        has_favorites = bool(self._favorite_ids)
        self.favorites_placeholder.setVisible(not has_favorites)
        self.favorites_list.setVisible(has_favorites)
        self._sync_star_states()
        self._sync_queue_states()

    @staticmethod
    def _serialise_station(station: Dict[str, Any]) -> Dict[str, Any]:
        def _convert(value: Any) -> Any:
            if isinstance(value, dict):
                return {k: _convert(v) for k, v in value.items()}
            if isinstance(value, list):
                return [_convert(v) for v in value]
            if isinstance(value, (str, int, float, bool)) or value is None:
                return value
            return str(value)

        return {k: _convert(v) for k, v in station.items()}

    def _add_station_to_list(
        self,
        list_widget: QtWidgets.QListWidget,
        station: Dict[str, Any],
    ) -> QtWidgets.QListWidgetItem:
        item = QtWidgets.QListWidgetItem()
        item.setData(QtCore.Qt.UserRole, station.get("id"))
        list_widget.addItem(item)
        widget = StationListItemWidget(
            station.get("id", ""),
            self._format_item_text(station),
            self._is_favorite(station.get("id", "")),
            self._should_emphasise(station),
            list_widget,
        )
        widget.favorite_toggled.connect(self._favorite_toggled)
        widget.queue_toggled.connect(self._queue_toggled)
        list_widget.setItemWidget(item, widget)
        widget.set_queue_checked(station.get("id") in self._queue_checked_ids)
        item.setSizeHint(widget.sizeHint())
        tooltip = self._tooltip_for_station(station)
        if tooltip:
            item.setToolTip(tooltip)
            widget.setToolTip(tooltip)
        else:
            widget.setToolTip(self._format_item_text(station))
        return item

    def _update_item_widget(
        self,
        list_widget: QtWidgets.QListWidget,
        item: QtWidgets.QListWidgetItem,
        station: Dict[str, Any],
        tooltip: str | None,
    ) -> None:
        text = self._format_item_text(station)
        widget = list_widget.itemWidget(item)
        emphasise = self._should_emphasise(station)
        favourite = self._is_favorite(station.get("id", ""))
        if isinstance(widget, StationListItemWidget):
            item.setText("")
            widget.set_text(text)
            widget.set_emphasis(emphasise)
            widget.set_favorite(favourite)
            widget.set_queue_checked(station.get("id") in self._queue_checked_ids)
            if tooltip:
                widget.setToolTip(tooltip)
            elif text:
                widget.setToolTip(text)
        else:
            item.setText(text)
            font = item.font()
            font.setBold(emphasise)
            item.setFont(font)
        if tooltip is not None:
            item.setToolTip(tooltip)

    def _update_station_entry(
        self,
        list_widget: QtWidgets.QListWidget,
        sid: str,
        station: Dict[str, Any],
        tooltip: str | None,
    ) -> None:
        for idx in range(list_widget.count()):
            item = list_widget.item(idx)
            if item.data(QtCore.Qt.UserRole) == sid:
                self._update_item_widget(list_widget, item, station, tooltip)
                break

    def _sync_star_states(self) -> None:
        favorites = set(self._favorite_ids)
        for widget in (self.list, self.favorites_list):
            for idx in range(widget.count()):
                item = widget.item(idx)
                station_id = item.data(QtCore.Qt.UserRole)
                star = widget.itemWidget(item)
                if isinstance(star, StationListItemWidget):
                    star.set_favorite(station_id in favorites)

    def _sync_queue_states(self) -> None:
        selected = set(self._queue_checked_ids)
        for widget in (self.list, self.favorites_list):
            for idx in range(widget.count()):
                item = widget.item(idx)
                station_id = item.data(QtCore.Qt.UserRole)
                cell = widget.itemWidget(item)
                if isinstance(cell, StationListItemWidget):
                    cell.set_queue_checked(station_id in selected)

    def _favorite_toggled(self, station_id: str, checked: bool) -> None:
        if checked:
            station = self._stations.get(station_id) or self._favorites.get(station_id)
            if not station:
                return
            snapshot = self._serialise_station(station)
            if station_id not in self._favorites:
                self._favorite_ids.append(station_id)
            self._favorites[station_id] = snapshot
        else:
            if station_id in self._favorites:
                self._favorite_ids = [
                    sid for sid in self._favorite_ids if sid != station_id
                ]
                self._favorites.pop(station_id, None)
        if not checked and station_id in self._queue_checked_ids:
            self._queue_checked_ids.discard(station_id)
        self._save_favorites()
        self._refresh_favorites_list()

    def _queue_toggled(self, station_id: str, checked: bool) -> None:
        if not station_id:
            return
        if checked:
            self._queue_checked_ids.add(station_id)
        else:
            self._queue_checked_ids.discard(station_id)
        self.queue_selection_changed.emit(len(self._queue_checked_ids))

    def _favorite_item_chosen(self, item: QtWidgets.QListWidgetItem) -> None:
        if item is None:
            return
        sid = item.data(QtCore.Qt.UserRole)
        datasets = self._ensure_station_datasets(sid)
        self.station_selected.emit(sid, datasets)

    def _favorite_selection_changed(self, current, _previous) -> None:
        if current is None:
            return
        sid = current.data(QtCore.Qt.UserRole)
        datasets = self._ensure_station_datasets(sid)
        self._populate_table(datasets)
        if sid in self._stations:
            self._highlight_marker(sid)

    def get_queue_selection(self) -> List[Dict[str, Any]]:
        ordered_ids: list[str] = []
        selected = set(self._queue_checked_ids)
        for widget in (self.list, self.favorites_list):
            for idx in range(widget.count()):
                item = widget.item(idx)
                sid = item.data(QtCore.Qt.UserRole)
                if sid in selected and sid not in ordered_ids:
                    ordered_ids.append(sid)
        for sid in self._queue_checked_ids:
            if sid not in ordered_ids:
                ordered_ids.append(sid)
        results: List[Dict[str, Any]] = []
        for sid in ordered_ids:
            station = self._stations.get(sid) or self._favorites.get(sid)
            if isinstance(station, dict):
                results.append(dict(station))
        return results

    def clear_queue_selection(self) -> None:
        if not self._queue_checked_ids:
            return
        self._queue_checked_ids.clear()
        self._sync_queue_states()
        self.queue_selection_changed.emit(0)

    def get_station_label(self, station_id: str) -> str:
        station = self._stations.get(station_id) or self._favorites.get(station_id)
        if isinstance(station, dict):
            name = str(station.get("name") or "")
            if name:
                return f"{station_id} — {name}"
        return station_id

    def get_station_metadata(self, station_id: str) -> Dict[str, Any]:
        station = self._stations.get(station_id) or self._favorites.get(station_id)
        if isinstance(station, dict):
            return dict(station)
        return {}

    def _select_in_list(
        self, list_widget: QtWidgets.QListWidget, station_id: str
    ) -> None:
        for idx in range(list_widget.count()):
            item = list_widget.item(idx)
            if item.data(QtCore.Qt.UserRole) == station_id:
                list_widget.setCurrentItem(item)
                break

    def _update_favorite_record(self, station_id: str, station: Dict[str, Any]) -> None:
        if station_id not in self._favorites:
            return
        self._favorites[station_id] = self._serialise_station(station)
        self._save_favorites()
        self._refresh_favorites_list()

    def save_layout_state(self) -> None:
        self._layout_settings.setValue("splitter_sizes", self._splitter.sizes())

    # Internal helpers -------------------------------------------------
    def _restore_splitter_sizes(self) -> None:
        default = [200, 180, 280]
        if self._splitter.count() == len(default):
            self._splitter.setSizes(default)
        raw = self._layout_settings.value("splitter_sizes")
        sizes = self._coerce_sizes(raw, self._splitter.count())
        if sizes:
            self._splitter.setSizes(sizes)

    @staticmethod
    def _coerce_sizes(raw: object, expected: int) -> list[int]:
        if not raw:
            return []
        items: list[object]
        if isinstance(raw, str):
            items = [part.strip() for part in raw.split(",") if part.strip()]
        elif isinstance(raw, (list, tuple)):
            items = list(raw)
        else:
            return []
        result: list[int] = []
        for item in items:
            try:
                result.append(int(float(item)))
            except (TypeError, ValueError):
                return []
        if len(result) != expected or not any(result):
            return []
        return result

    def _tooltip_for_station(self, station: Dict[str, Any]) -> str:
        datasets = station.get("datasets") or []
        lines: list[str] = []
        for dataset in datasets:
            if not isinstance(dataset, dict):
                continue
            ds_id = dataset.get("id") or "?"
            mn = dataset.get("mindate") or "?"
            mx = dataset.get("maxdate") or "?"
            lines.append(f"{ds_id}: {mn} to {mx}")
        return "\n".join(lines)

    def _should_emphasise(self, station: Dict[str, Any]) -> bool:
        coverage = station.get("datacoverage") or 0
        mindate = station.get("mindate")
        maxdate = station.get("maxdate")
        years = 0.0
        try:
            years = (
                datetime.fromisoformat(str(maxdate))
                - datetime.fromisoformat(str(mindate))
            ).days / 365.25
        except Exception:
            years = 0.0
        return coverage >= 0.9 or years >= 10

    def _relay_search_message(self, text: str) -> None:
        if self.sender() is not self._search_worker:
            return
        if text:
            self.message.emit(text)

    def _search_error(self, text: str) -> None:
        if self.sender() is not self._search_worker:
            return
        self.progress.setVisible(False)
        if text:
            self.message.emit(text)

    def _search_worker_finished(self) -> None:
        worker = self.sender()
        if worker is self._search_worker:
            self._search_worker = None
        if isinstance(worker, QtCore.QThread):
            worker.deleteLater()

    def _search_completed(self, stations: List[Dict[str, Any]]):
        if self.sender() is not self._search_worker:
            return
        self.progress.setVisible(False)
        valid_stations: list[Dict[str, Any]] = []
        for station in stations:
            sid = station.get("id")
            if not sid:
                continue
            entry = dict(station)
            entry["id"] = sid
            valid_stations.append(entry)

        if not valid_stations:
            self.message.emit("No stations found.")
            self._update_map([])
            return

        self.list.clear()
        self._stations = {station["id"]: station for station in valid_stations}
        favorites_updated = False
        for station in valid_stations:
            self._add_station_to_list(self.list, station)
            sid = station["id"]
            if sid in self._favorites:
                self._favorites[sid] = self._serialise_station(station)
                favorites_updated = True

        if favorites_updated:
            self._save_favorites()
            self._refresh_favorites_list()

        self._update_map(valid_stations)
        self.message.emit(
            "Stations shown in bold have ≥90% data coverage or at least ten years of records. Select a station to view available datasets."
        )

    def _update_map(self, stations: List[Dict[str, Any]]) -> None:
        """Render a simple map showing station locations."""
        if QtWebEngineWidgets is None:
            return  # Web engine support not available

        self._map_ready = False
        self._map_stations = stations

        if not stations:
            self._pending_selection = None
            self.map_view.setHtml(
                """
                <html>
                  <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100%;font-family:sans-serif;color:#666;background:#f0f0f0;">
                    <span>No stations to display</span>
                  </body>
                </html>
                """
            )
            return

        pts = [
            (
                s.get("latitude"),
                s.get("longitude"),
                s.get("id"),
                s.get("name", ""),
            )
            for s in stations
            if s.get("latitude") is not None and s.get("longitude") is not None
        ]
        if not pts:
            self._pending_selection = None
            self.map_view.setHtml(
                """
                <html>
                  <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100%;font-family:sans-serif;color:#666;background:#f0f0f0;">
                    <span>Selected stations have no location data</span>
                  </body>
                </html>
                """
            )
            return

        marker_data = [
            {
                "lat": float(lat),
                "lon": float(lon),
                "id": sid,
                "label": f"{sid} — {name}" if name else sid,
            }
            for lat, lon, sid, name in pts
        ]
        markers_json = json.dumps(marker_data).replace("</", "<\\/")

        bridge_script = ""
        if QWebChannel is not None and self._map_bridge is not None:
            bridge_script = """
          <script src="qrc:///qtwebchannel/qwebchannel.js"></script>
          <script>
            if (typeof qt !== 'undefined' && qt.webChannelTransport) {
              new QWebChannel(qt.webChannelTransport, function(channel) {
                window.bridge = channel.objects.bridge || null;
              });
            }
          </script>
            """

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="
            default-src 'self' https://unpkg.com;
            img-src 'self' data: https://*.basemaps.cartocdn.com https://cartodb-basemaps-a.global.ssl.fastly.net https://cartodb-basemaps-b.global.ssl.fastly.net https://cartodb-basemaps-c.global.ssl.fastly.net https://cartodb-basemaps-d.global.ssl.fastly.net https://unpkg.com;
            style-src 'self' 'unsafe-inline' https://unpkg.com;
            script-src 'self' 'unsafe-inline' https://unpkg.com qrc:;">
          <link
            rel="stylesheet"
            href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          />
          <style>
            html, body, #map {{
              height: 100%;
              margin: 0;
            }}
            body {{
              background: #f0f0f0;
            }}
            .selected-marker {{
              filter: drop-shadow(0 0 6px #00bcd4);
              transform: scale(1.15);
            }}
          </style>
        </head>
        <body>
          <div id="map"></div>
          <script
            src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
          ></script>
        {bridge_script}
          <script>
            window.bridge = window.bridge || null;
            const markers = {markers_json};
            const map = L.map('map', {{ zoomControl: true }});
            const tileLayer = L.tileLayer('https://{{s}}.basemaps.cartocdn.com/light_all/{{z}}/{{x}}/{{y}}{{r}}.png', {{
              maxZoom: 19,
              subdomains: 'abcd',
              attribution: '© OpenStreetMap contributors © CARTO'
            }});
            tileLayer.addTo(map);

            const markerLookup = new Map();
            let selectedMarker = null;

            function applySelection(entry, pan) {{
              if (!entry) {{
                if (selectedMarker && selectedMarker.marker && selectedMarker.marker._icon) {{
                  selectedMarker.marker._icon.classList.remove('selected-marker');
                }}
                selectedMarker = null;
                return false;
              }}
              if (selectedMarker && selectedMarker.marker && selectedMarker.marker._icon) {{
                selectedMarker.marker._icon.classList.remove('selected-marker');
              }}
              selectedMarker = entry;
              if (entry.marker && entry.marker._icon) {{
                entry.marker._icon.classList.add('selected-marker');
              }}
              if (pan && entry.marker && entry.marker.getLatLng) {{
                map.panTo(entry.marker.getLatLng());
              }}
              if (entry.marker && entry.marker.openPopup) {{
                entry.marker.openPopup();
              }}
              return true;
            }}

            window.highlightStation = function(id, pan) {{
              const entry = markerLookup.get(id || '');
              return applySelection(entry, pan !== false);
            }};

            window.clearStationSelection = function() {{
              applySelection(null, false);
            }};

            const latLngs = markers.map(m => [m.lat, m.lon]);
            if (latLngs.length === 1) {{
              map.setView(latLngs[0], 10);
            }} else {{
              map.fitBounds(L.latLngBounds(latLngs), {{padding: [20, 20]}});
            }}

            markers.forEach(m => {{
              const tooltip = m.id || 'Station';
              const label = m.label || tooltip;
              const marker = L.marker([m.lat, m.lon]).addTo(map);
              marker.bindTooltip(tooltip);
              marker.bindPopup(label);
              const entry = {{ marker, id: m.id }};
              markerLookup.set(m.id, entry);
              marker.on('click', () => {{
                applySelection(entry, true);
                if (window.bridge && window.bridge.onMarkerClicked) {{
                  window.bridge.onMarkerClicked(m.id);
                }}
              }});
            }});
          </script>
        </body>
        </html>
        """

        self.map_view.setHtml(html, QtCore.QUrl("https://hh-tools.local/"))

    def _format_item_text(self, st: dict) -> str:
        return (
            f"{st['id']} — {st.get('name','')} ("
            f"{st.get('mindate','?')} to {st.get('maxdate','?')}; "
            f"{st.get('datacoverage',0):.0%})"
        )

    def _map_load_finished(self, ok: bool) -> None:
        self._map_ready = bool(ok)
        if ok and self._pending_selection:
            sid, pan = self._pending_selection
            self._pending_selection = None
            self._highlight_marker(sid, pan=pan)

    def _map_station_clicked(self, sid: str) -> None:
        if not sid:
            return
        for i in range(self.list.count()):
            item = self.list.item(i)
            if item.data(QtCore.Qt.UserRole) == sid:
                self.list.setCurrentItem(item)
                self.list.scrollToItem(item, QtWidgets.QAbstractItemView.PositionAtCenter)
                break

    def _highlight_marker(self, sid: str, pan: bool = True) -> None:
        if QtWebEngineWidgets is None or not sid:
            return
        if not self._map_ready:
            self._pending_selection = (sid, pan)
            return
        script = f"window.highlightStation && window.highlightStation({json.dumps(sid)}, {str(bool(pan)).lower()});"
        self.map_view.page().runJavaScript(script)

    def _ensure_station_datasets(self, station_id: str) -> List[Dict[str, Any]]:
        if not station_id:
            return []

        station = self._stations.get(station_id)
        if isinstance(station, dict) and station.get("datasets"):
            return list(station.get("datasets") or [])

        favorite_entry = self._favorites.get(station_id)
        if isinstance(favorite_entry, dict) and favorite_entry.get("datasets"):
            return self._store_station_datasets(
                station_id, favorite_entry.get("datasets") or []
            )

        token = self.token.strip()
        if not token:
            self.message.emit("Enter an API key before fetching datasets.")
            return []

        self.message.emit(f"Fetching datasets for {station_id}…")
        self.progress.setRange(0, 0)
        self.progress.setVisible(True)
        try:
            raw_datasets = available_datasets(station_id, token)
        except Exception as exc:
            self.message.emit(
                f"Failed to fetch datasets for {station_id}: {exc}"
            )
            raw_datasets = []
        finally:
            self.progress.setVisible(False)

        datasets = self._store_station_datasets(station_id, raw_datasets)
        if datasets:
            self.message.emit(
                f"Datasets retrieved for {station_id} ({len(datasets)} found)."
            )
        else:
            self.message.emit(
                "No datasets were returned for {station_id}. The station may not provide dataset metadata or the request may have failed.".format(
                    station_id=station_id
                )
            )
        return datasets

    def _selection_changed(self, current, _prev):
        if current is None:
            return
        sid = current.data(QtCore.Qt.UserRole)
        datasets = self._ensure_station_datasets(sid)
        self._populate_table(datasets)
        self._highlight_marker(sid)

    def _populate_table(self, datasets):
        self.table.setRowCount(0)
        for d in datasets:
            ds_label = f"{d['id']} - {d.get('name','')}" if d.get('name') else d['id']
            dtypes = d.get('filtered_datatypes') or d.get('datatypes') or []
            ds_mindate = d.get('mindate')
            ds_maxdate = d.get('maxdate')
            if (not ds_mindate or not ds_maxdate) and dtypes:
                dt_dates = [
                    (dt.get('mindate'), dt.get('maxdate'))
                    for dt in dtypes
                    if dt.get('mindate') and dt.get('maxdate')
                ]
                if dt_dates:
                    ds_mindate = ds_mindate or min(mn for mn, _ in dt_dates)
                    ds_maxdate = ds_maxdate or max(mx for _, mx in dt_dates)
            base_payload = {
                'dataset_id': d.get('id'),
                'dataset_mindate': ds_mindate,
                'dataset_maxdate': ds_maxdate,
                'dataset_obj': d,
            }
            if not dtypes:
                row = self.table.rowCount(); self.table.insertRow(row)
                item_ds = QtWidgets.QTableWidgetItem(ds_label)
                item_ds.setData(QtCore.Qt.UserRole, dict(base_payload))
                self.table.setItem(row, 0, item_ds)
                item_dt = QtWidgets.QTableWidgetItem("—")
                item_dt.setData(QtCore.Qt.UserRole, dict(base_payload))
                self.table.setItem(row, 1, item_dt)
                item_min = QtWidgets.QTableWidgetItem(d.get('mindate','') or "—")
                item_min.setData(QtCore.Qt.UserRole, dict(base_payload))
                self.table.setItem(row, 2, item_min)
                item_max = QtWidgets.QTableWidgetItem(d.get('maxdate','') or "—")
                item_max.setData(QtCore.Qt.UserRole, dict(base_payload))
                self.table.setItem(row, 3, item_max)
            else:
                for dt in dtypes:
                    row = self.table.rowCount(); self.table.insertRow(row)
                    payload = dict(base_payload)
                    payload.update(
                        {
                            'datatype_id': dt.get('id'),
                            'datatype_mindate': dt.get('mindate'),
                            'datatype_maxdate': dt.get('maxdate'),
                        }
                    )
                    item_ds = QtWidgets.QTableWidgetItem(ds_label)
                    item_ds.setData(QtCore.Qt.UserRole, dict(payload))
                    self.table.setItem(row, 0, item_ds)
                    dt_label = f"{dt['id']} - {dt.get('name','')}" if dt.get('name') else dt['id']
                    item_dtype = QtWidgets.QTableWidgetItem(dt_label)
                    item_dtype.setData(QtCore.Qt.UserRole, dict(payload))
                    self.table.setItem(row, 1, item_dtype)
                    item_min = QtWidgets.QTableWidgetItem(dt.get('mindate','') or "—")
                    item_min.setData(QtCore.Qt.UserRole, dict(payload))
                    self.table.setItem(row, 2, item_min)
                    item_max = QtWidgets.QTableWidgetItem(dt.get('maxdate','') or "—")
                    item_max.setData(QtCore.Qt.UserRole, dict(payload))
                    self.table.setItem(row, 3, item_max)

    @staticmethod
    def _to_qdate(value: Optional[str]) -> QtCore.QDate:
        if not value:
            return QtCore.QDate()
        date = QtCore.QDate.fromString(str(value), "yyyy-MM-dd")
        if date.isValid():
            return date
        return QtCore.QDate()

    def _table_selection_changed(self) -> None:
        row = self.table.currentRow()
        if row < 0:
            self.table_row_selected.emit({})
            self.coverage_chart.set_message(
                "Select a dataset and datatype to preview coverage."
            )
            return
        item = self.table.item(row, 0)
        if item is None:
            self.table_row_selected.emit({})
            self.coverage_chart.set_message(
                "Select a dataset and datatype to preview coverage."
            )
            return
        payload = item.data(QtCore.Qt.UserRole) or {}
        if not isinstance(payload, dict):
            self.table_row_selected.emit({})
            self.coverage_chart.set_message(
                "Select a dataset and datatype to preview coverage."
            )
            return
        current_item = self.list.currentItem() or self.favorites_list.currentItem()
        sid = current_item.data(QtCore.Qt.UserRole) if current_item else ""
        datasets: List[Dict[str, Any]] = []
        if sid:
            station_data = self._stations.get(sid, {})
            datasets = list(station_data.get("datasets") or [])
            if not datasets and sid in self._favorites:
                fav_data = self._favorites.get(sid, {})
                datasets = list(fav_data.get("datasets") or [])
        self.table_row_selected.emit(
            {"payload": dict(payload), "station_id": sid, "datasets": datasets}
        )

    def get_station_datasets(self, station_id: str) -> List[Dict[str, Any]]:
        return self._ensure_station_datasets(station_id)

    def _store_station_datasets(
        self, sid: str, datasets: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        if not sid:
            return []

        normalised: List[Dict[str, Any]] = []
        for dataset in datasets:
            if not isinstance(dataset, dict):
                continue
            ds_item: Dict[str, Any] = dict(dataset)
            ds_item["id"] = ds_item.get("id") or ""
            ds_item["mindate"] = _normalise_iso_date(ds_item.get("mindate"))
            ds_item["maxdate"] = _normalise_iso_date(ds_item.get("maxdate"))

            raw_dtypes = ds_item.get("datatypes") or []
            datatypes: List[Dict[str, Any]] = []
            for dtype in raw_dtypes:
                if not isinstance(dtype, dict):
                    continue
                dt_item: Dict[str, Any] = dict(dtype)
                dt_item["id"] = dt_item.get("id") or ""
                dt_item["mindate"] = _normalise_iso_date(dt_item.get("mindate"))
                dt_item["maxdate"] = _normalise_iso_date(dt_item.get("maxdate"))
                datatypes.append(dt_item)

            raw_filtered = ds_item.get("filtered_datatypes") or datatypes
            filtered_dtypes: List[Dict[str, Any]] = []
            for dtype in raw_filtered:
                if not isinstance(dtype, dict):
                    continue
                dt_item: Dict[str, Any] = dict(dtype)
                dt_item["id"] = dt_item.get("id") or ""
                dt_item["mindate"] = _normalise_iso_date(dt_item.get("mindate"))
                dt_item["maxdate"] = _normalise_iso_date(dt_item.get("maxdate"))
                filtered_dtypes.append(dt_item)

            ds_item["datatypes"] = datatypes
            ds_item["filtered_datatypes"] = filtered_dtypes
            normalised.append(ds_item)

        station = self._stations.get(sid)
        if station is None:
            station = dict(self._favorites.get(sid) or {})
            station["id"] = sid
            self._stations[sid] = station

        station["datasets"] = normalised

        ds_dates = [
            (d.get("mindate"), d.get("maxdate"))
            for d in normalised
            if d.get("mindate") and d.get("maxdate")
        ]
        if ds_dates:
            station["mindate"] = min(d[0] for d in ds_dates)
            station["maxdate"] = max(d[1] for d in ds_dates)

        tooltip = (
            "\n".join(
                f"{d['id']}: {d.get('mindate','?')} to {d.get('maxdate','?')}"
                for d in normalised
            )
            or "No datasets"
        )

        self._update_station_entry(self.list, sid, station, tooltip)
        self._update_station_entry(self.favorites_list, sid, station, tooltip)
        self._update_favorite_record(sid, station)
        return normalised

    def _list_chosen(self, item):
        sid = item.data(QtCore.Qt.UserRole)
        datasets = self._ensure_station_datasets(sid)
        self.station_selected.emit(sid, datasets)

    def update_station_datatypes(
        self,
        sid: str,
        dataset_id: str,
        datatypes: List[Dict[str, Any]],
        filtered: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        st = self._stations.get(sid)
        if not st:
            return
        for dataset in st.get("datasets", []) or []:
            if dataset.get("id") == dataset_id:
                dataset["datatypes"] = datatypes
                dataset["filtered_datatypes"] = filtered if filtered is not None else datatypes
                dates = [
                    (d.get("mindate"), d.get("maxdate"))
                    for d in datatypes
                    if d.get("mindate") and d.get("maxdate")
                ]
                if dates:
                    dataset["mindate"] = min(d[0] for d in dates)
                    dataset["maxdate"] = max(d[1] for d in dates)
                break
        if (
            self.list.currentItem()
            and self.list.currentItem().data(QtCore.Qt.UserRole) == sid
        ):
            self._populate_table(st.get("datasets") or [])
        tip = (
            "\n".join(
                f"{d['id']}: {d.get('mindate','?')} to {d.get('maxdate','?')}"
                for d in st.get("datasets", []) or []
            )
            or "No datasets"
        )
        self._update_station_entry(self.list, sid, st, tip)
        self._update_favorite_record(sid, st)
