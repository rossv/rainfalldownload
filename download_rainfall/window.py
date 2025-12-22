from __future__ import annotations
import sys
import os
import re
import subprocess
from datetime import datetime, date
from pathlib import Path
from typing import Optional, Tuple, Dict, Any, List

from PyQt5 import QtCore, QtGui, QtWidgets

from hh_tools.download_rainfall import (
    available_datasets,
    has_data_in_range,
    _normalise_iso_date,
)

from .utils import process_environment, ICON_DIR
from .search_panel import StationSearchPanel
from .workers import CoverageProbeWorker, DatatypeFetcher
from .quick_plot import QuickPlotDialog

# Placeholder for completion art
def completion_art() -> str:
    return r"""
       _      _      _
     _( )_  _( )_  _( )_
    (_(%)_)(_(%)_)(_(%)_)
      (_)\    (_)\    (_)\ 
          |       |       |
          |       |       |
    """

class DownloadRainfallWindow(QtWidgets.QWidget):
    def __init__(self) -> None:
        super().__init__()

        self.setWindowTitle("Download Rainfall")
        self.setWindowIcon(QtGui.QIcon(str(ICON_DIR / "download_rainfall.ico")))
        self.settings = QtCore.QSettings("HHTools", self.__class__.__name__)
        geo = self.settings.value("geometry")
        if geo:
            self.restoreGeometry(geo)

        outer_layout = QtWidgets.QVBoxLayout(self)
        outer_layout.setContentsMargins(9, 9, 9, 9)
        outer_layout.setSpacing(6)
        self._main_splitter = QtWidgets.QSplitter(QtCore.Qt.Horizontal, self)
        self._main_splitter.setChildrenCollapsible(False)
        outer_layout.addWidget(self._main_splitter, 1)
        form_widget = QtWidgets.QWidget(self)
        form = QtWidgets.QFormLayout(form_widget)
        self._main_splitter.addWidget(form_widget)
        self.search_panel = StationSearchPanel(self)
        self._main_splitter.addWidget(self.search_panel)
        self._main_splitter.setStretchFactor(0, 0)
        self._main_splitter.setStretchFactor(1, 1)

        self.status_bar = QtWidgets.QStatusBar(self)
        self.status_bar.setSizeGripEnabled(False)
        outer_layout.addWidget(self.status_bar)
        self._ready_timer = QtCore.QTimer(self)
        self._ready_timer.setSingleShot(True)
        self._ready_timer.timeout.connect(self._set_ready)

        # --- Station ---
        self.station_edit = QtWidgets.QLineEdit(self.settings.value("station", ""))
        self.station_edit.setToolTip("Station identifier")
        self.station_edit.editingFinished.connect(self._populate_datasets)
        form.addRow("Station", self.station_edit)

        # --- Dates ---
        today = QtCore.QDate.currentDate()
        self.start_date = QtWidgets.QDateEdit(today)
        self.start_date.dateChanged.connect(self._dataset_changed)
        self.start_date.setCalendarPopup(True)
        self.start_date.setMaximumDate(today)
        self.end_date = QtWidgets.QDateEdit(today)
        self.end_date.dateChanged.connect(self._dataset_changed)
        self.end_date.setCalendarPopup(True)
        self.end_date.setMaximumDate(today)
        # Default to the previous calendar month when the tool opens so the
        # initial date range is immediately useful.
        form.addRow("Start date", self.start_date)
        form.addRow("End date", self.end_date)

        btn_yesterday = QtWidgets.QPushButton("Yesterday")
        btn_yesterday.clicked.connect(self._set_yesterday)
        btn_last_week = QtWidgets.QPushButton("Last Week")
        btn_last_week.clicked.connect(self._set_last_week)
        btn_last_month = QtWidgets.QPushButton("Last Month")
        btn_last_month.clicked.connect(self._set_last_month)
        shortcut_layout = QtWidgets.QHBoxLayout()
        shortcut_layout.addWidget(btn_yesterday)
        shortcut_layout.addWidget(btn_last_week)
        shortcut_layout.addWidget(btn_last_month)
        form.addRow("Quick dates", shortcut_layout)

        # --- API key ---
        self.api_edit = QtWidgets.QLineEdit()
        self.api_edit.setToolTip("API key for NOAA service")
        self.api_edit.setText(self.settings.value("api_key", ""))
        self.api_save = QtWidgets.QCheckBox("Remember key")
        self.api_save.setChecked(bool(self.settings.value("api_key", "")))
        self.api_request_btn = QtWidgets.QPushButton("Get Key")
        self.api_request_btn.setToolTip("Request a free API key from NOAA")
        self.api_request_btn.clicked.connect(
            lambda: QtGui.QDesktopServices.openUrl(
                QtCore.QUrl("https://www.ncdc.noaa.gov/cdo-web/token")
            )
        )
        api_layout = QtWidgets.QHBoxLayout()
        api_layout.addWidget(self.api_edit)
        api_layout.addWidget(self.api_save)
        api_layout.addWidget(self.api_request_btn)
        form.addRow("API key", api_layout)

        # --- Source ---
        self.source_combo = QtWidgets.QComboBox()
        self.source_combo.addItems(
            ["Demo (no API key required)", "NOAA (requires free token)"]
        )
        self.source_combo.setCurrentIndex(1)
        self.source_combo.currentIndexChanged.connect(self._refresh_coverage_preview)
        form.addRow("Source", self.source_combo)

        self.dataset_combo = QtWidgets.QComboBox()
        self.dataset_combo.currentIndexChanged.connect(self._dataset_changed)
        form.addRow("Dataset", self.dataset_combo)

        self.datatype_combo = QtWidgets.QComboBox()
        self.datatype_combo.currentIndexChanged.connect(self._refresh_coverage_preview)
        form.addRow("Datatype", self.datatype_combo)

        # Restore splitter sizes before showing the window
        self._main_splitter.setSizes([360, 640])
        saved_sizes = self.settings.value("main_splitter_sizes")
        sizes = StationSearchPanel._coerce_sizes(
            saved_sizes, self._main_splitter.count()
        )
        if sizes:
            self._main_splitter.setSizes(sizes)

        # Default to the previous calendar month after dependent widgets exist so
        # signal handlers can safely access them during initialization.
        self._set_last_month()

        # --- Output ---
        self.output_edit = QtWidgets.QLineEdit(self.settings.value("output_path", ""))
        browse_out = QtWidgets.QPushButton("Browse")
        browse_out.clicked.connect(self._choose_output)
        out_layout = QtWidgets.QHBoxLayout()
        out_layout.addWidget(self.output_edit)
        out_layout.addWidget(browse_out)
        form.addRow("Output file", out_layout)

        self.format_combo = QtWidgets.QComboBox()
        self.format_combo.addItems(["csv", "tsf", "swmm"])
        form.addRow("Format", self.format_combo)

        self.units_combo = QtWidgets.QComboBox()
        self.units_combo.addItems(["mm", "in"])
        self.units_combo.setCurrentText("in")
        form.addRow("Units", self.units_combo)

        # --- Batch queue ---
        queue_widget = QtWidgets.QWidget()
        queue_layout = QtWidgets.QVBoxLayout(queue_widget)
        queue_layout.setContentsMargins(0, 0, 0, 0)
        queue_layout.setSpacing(6)
        self.queue_selection_label = QtWidgets.QLabel(
            "Select stations with the checkboxes in the search panel."
        )
        self.queue_selection_label.setWordWrap(True)
        queue_layout.addWidget(self.queue_selection_label)

        queue_button_layout = QtWidgets.QHBoxLayout()
        self.add_queue_btn = QtWidgets.QPushButton("Add to Queue")
        self.add_queue_btn.setEnabled(False)
        self.add_queue_btn.clicked.connect(self._add_selected_to_queue)
        queue_button_layout.addWidget(self.add_queue_btn)

        self.start_queue_btn = QtWidgets.QPushButton("Start Queue")
        self.start_queue_btn.setEnabled(False)
        self.start_queue_btn.clicked.connect(self._start_queue)
        queue_button_layout.addWidget(self.start_queue_btn)

        self.remove_queue_btn = QtWidgets.QPushButton("Remove Selected")
        self.remove_queue_btn.setEnabled(False)
        self.remove_queue_btn.clicked.connect(self._remove_queue_item)
        queue_button_layout.addWidget(self.remove_queue_btn)

        self.clear_queue_btn = QtWidgets.QPushButton("Clear Queue")
        self.clear_queue_btn.setEnabled(False)
        self.clear_queue_btn.clicked.connect(self._clear_queue)
        queue_button_layout.addWidget(self.clear_queue_btn)
        queue_layout.addLayout(queue_button_layout)

        self.queue_placeholder = QtWidgets.QLabel(
            "Queue is empty. Use 'Add to Queue' to stage downloads."
        )
        self.queue_placeholder.setAlignment(QtCore.Qt.AlignCenter)
        self.queue_placeholder.setWordWrap(True)
        self.queue_placeholder.setStyleSheet("color: palette(mid); font-style: italic;")
        queue_layout.addWidget(self.queue_placeholder)

        self.queue_list = QtWidgets.QListWidget()
        self.queue_list.setSelectionMode(QtWidgets.QAbstractItemView.SingleSelection)
        self.queue_list.setVisible(False)
        self.queue_list.itemSelectionChanged.connect(self._queue_item_selection_changed)
        queue_layout.addWidget(self.queue_list)

        form.addRow("Batch queue", queue_widget)

        # --- Buttons ---
        self.run_btn = QtWidgets.QPushButton("Run")
        self.run_btn.clicked.connect(self._run)
        self.show_output_btn = QtWidgets.QPushButton("Show in Folder")
        self.show_output_btn.setVisible(False)
        self.show_output_btn.setEnabled(False)
        self.show_output_btn.clicked.connect(self._show_in_folder)
        self.quick_plot_btn = QtWidgets.QPushButton("Quick Plot")
        self.quick_plot_btn.setVisible(False)
        self.quick_plot_btn.setEnabled(False)
        self.quick_plot_btn.clicked.connect(self._quick_plot)
        self.cancel_btn = QtWidgets.QPushButton("Cancel")
        self.cancel_btn.setEnabled(False)
        self.cancel_btn.clicked.connect(self._cancel)
        self.help_btn = QtWidgets.QPushButton("Help")
        self.help_btn.clicked.connect(self._show_help)
        btn_layout = QtWidgets.QHBoxLayout()
        btn_layout.addWidget(self.run_btn)
        btn_layout.addWidget(self.show_output_btn)
        btn_layout.addWidget(self.quick_plot_btn)
        btn_layout.addWidget(self.cancel_btn)
        btn_layout.addWidget(self.help_btn)
        form.addRow(btn_layout)

        # --- Progress & Output ---
        self.progress = QtWidgets.QProgressBar()
        self.progress.setRange(0, 0)
        self.progress.setVisible(False)
        form.addRow(self.progress)

        self.output_box = QtWidgets.QPlainTextEdit(readOnly=True)
        form.addRow(self.output_box)

        # Process
        self.process = QtCore.QProcess(self)
        self.process.setProcessEnvironment(process_environment())
        self.process.readyReadStandardOutput.connect(self._handle_stdout)
        self.process.readyReadStandardError.connect(self._handle_stderr)
        self.process.finished.connect(self._process_finished)
        self._pending_output_path: Path | None = None
        self._pending_output_format: str | None = None
        self._last_output_path: Path | None = None
        self._last_output_format: str | None = None
        self.search_panel.station_selected.connect(self._station_chosen)
        self.search_panel.table_row_selected.connect(self._table_row_selected)
        self.search_panel.message.connect(self._handle_panel_message)
        self.search_panel.queue_selection_changed.connect(
            self._update_queue_selection_hint
        )
        self.api_edit.textChanged.connect(self.search_panel.set_token)
        self.api_edit.editingFinished.connect(self._refresh_coverage_preview)
        self.search_panel.set_token(self.api_edit.text().strip())
        self._datatype_fetcher: Optional[DatatypeFetcher] = None
        self._pending_autofill_range: Optional[Tuple[QtCore.QDate, QtCore.QDate]] = None
        self._pending_datatype_id: Optional[str] = None
        self._active_dataset_id: Optional[str] = None
        self._last_process_error = ""
        self._coverage_worker: Optional[CoverageProbeWorker] = None
        self._coverage_worker_token = 0
        self._queue: list[Dict[str, Any]] = []
        self._queue_active = False
        self._queue_total = 0
        self._current_job: Dict[str, Any] | None = None

        self._set_ready()
        self._update_queue_selection_hint(0)
        self._refresh_queue_view()

    def _set_ready(self) -> None:
        self._ready_timer.stop()
        self.status_bar.showMessage("Ready.")

    def _set_status(self, message: str, *, timeout: int | None = None) -> None:
        if timeout is None:
            timeout = 5000
        self.status_bar.showMessage(message)
        if timeout <= 0:
            self._ready_timer.stop()
        else:
            self._ready_timer.start(timeout)

    # --- Helpers ---
    def _set_post_download_actions(
        self, path: Path | None, fmt: str | None
    ) -> None:
        if path is None:
            self._last_output_path = None
            self._last_output_format = None
            self.show_output_btn.setVisible(False)
            self.show_output_btn.setEnabled(False)
            self.quick_plot_btn.setVisible(False)
            self.quick_plot_btn.setEnabled(False)
            return

        resolved = Path(path)
        fmt_text = (fmt or resolved.suffix.lstrip(".")).lower()
        self._last_output_path = resolved
        self._last_output_format = fmt_text
        self.show_output_btn.setVisible(True)
        self.show_output_btn.setEnabled(True)
        self.quick_plot_btn.setVisible(True)
        supported = fmt_text in {"csv", "tsf", "swmm"}
        self.quick_plot_btn.setEnabled(supported and resolved.exists())

    def _handle_panel_message(self, message: str) -> None:
        text = message.strip()
        if not text:
            return
        timeout = 0 if text.endswith("...") or text.endswith("…") else None
        self._set_status(text, timeout=timeout)
        lower = text.lower()
        if lower.startswith("no ") or "failed" in lower or "error" in lower or lower.startswith(
            "enter "
        ):
            self.output_box.appendPlainText(text)

    def _cancel_coverage_worker(self) -> None:
        if self._coverage_worker:
            worker = self._coverage_worker
            if worker.isRunning():
                worker.requestInterruption()
            else:
                worker.deleteLater()
            self._coverage_worker = None
            self._coverage_worker_token += 1

    def _coverage_finished(self) -> None:
        worker = self.sender()
        if isinstance(worker, QtCore.QThread):
            worker.deleteLater()
        if isinstance(worker, CoverageProbeWorker) and worker is self._coverage_worker:
            self._coverage_worker = None

    def _on_coverage_ready(
        self, token: int, bins: list[dict[str, object]], span_years: int
    ) -> None:
        if token != self._coverage_worker_token:
            return
        self.search_panel.show_coverage_bins(bins, span_years)

    def _on_coverage_failed(self, token: int, message: str) -> None:
        if token != self._coverage_worker_token:
            return
        self.search_panel.show_coverage_message(message)

    def _refresh_coverage_preview(self) -> None:
        self._cancel_coverage_worker()
        # Ensure the preview only runs for NOAA datasets where we have an API key.
        if "NOAA" not in self.source_combo.currentText():
            self.search_panel.show_coverage_message(
                "Coverage preview is only available for NOAA datasets."
            )
            return
        token = self.api_edit.text().strip()
        if not token:
            self.search_panel.show_coverage_message(
                "Enter your NOAA token to check coverage."
            )
            return
        station = self.station_edit.text().strip()
        if not station:
            self.search_panel.show_coverage_message(
                "Select a station to preview coverage."
            )
            return
        data = self.dataset_combo.currentData()
        dataset = None
        dataset_info: dict | None = None
        if isinstance(data, dict):
            dataset = data.get("id")
            dataset_info = data
        elif isinstance(data, str):
            dataset = data
        if not dataset:
            self.search_panel.show_coverage_message("Select a dataset to preview coverage.")
            return
        dtype = self.datatype_combo.currentData()
        if not dtype:
            self.search_panel.show_coverage_message("Select a datatype to preview coverage.")
            return
        datatype = str(dtype)

        def _to_date(value: str | None) -> date | None:
            if not value:
                return None
            try:
                return datetime.strptime(value, "%Y-%m-%d").date()
            except ValueError:
                return None

        dataset_start = _to_date(_normalise_iso_date((dataset_info or {}).get("mindate")))
        dataset_end = _to_date(_normalise_iso_date((dataset_info or {}).get("maxdate")))

        dtype_info: dict | None = None
        if dataset_info:
            for entry in (dataset_info.get("datatypes") or []) + (
                dataset_info.get("filtered_datatypes") or []
            ):
                if isinstance(entry, dict) and entry.get("id") == datatype:
                    dtype_info = entry
                    break
        dtype_start = _to_date(_normalise_iso_date((dtype_info or {}).get("mindate")))
        dtype_end = _to_date(_normalise_iso_date((dtype_info or {}).get("maxdate")))

        start_date = dtype_start or dataset_start
        end_date = dtype_end or dataset_end

        user_start = _to_date(self.start_date.date().toString("yyyy-MM-dd"))
        user_end = _to_date(self.end_date.date().toString("yyyy-MM-dd"))
        if user_start and (not start_date or user_start > start_date):
            start_date = user_start
        if user_end and (not end_date or user_end < end_date):
            end_date = user_end

        if not start_date or not end_date:
            self.search_panel.show_coverage_message(
                "Coverage preview unavailable for this selection."
            )
            return
        if end_date < start_date:
            self.search_panel.show_coverage_message(
                "Coverage preview unavailable – check the selected dates."
            )
            return

        start = start_date.strftime("%Y-%m-%d")
        end = end_date.strftime("%Y-%m-%d")

        self.search_panel.show_coverage_loading("Checking coverage history…")
        worker = CoverageProbeWorker(
            station,
            str(dataset),
            datatype,
            token,
            start,
            end,
            self,
        )
        self._coverage_worker_token += 1
        token_value = self._coverage_worker_token
        worker.coverage_ready.connect(
            lambda bins, span, token=token_value: self._on_coverage_ready(
                token, bins, span
            )
        )
        worker.failed.connect(
            lambda message, token=token_value: self._on_coverage_failed(token, message)
        )
        worker.finished.connect(self._coverage_finished)
        self._coverage_worker = worker
        worker.start()

    def _filter_datatypes_by_date(
        self, dtypes: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        if not dtypes:
            return []
        start_q = self.start_date.date()
        end_q = self.end_date.date()
        out = []
        for dt in dtypes:
            if not isinstance(dt, dict):
                continue
            mn = _normalise_iso_date(dt.get("mindate"))
            mx = _normalise_iso_date(dt.get("maxdate"))
            if mn:
                dt["mindate"] = mn
            if mx:
                dt["maxdate"] = mx
            min_q = StationSearchPanel._to_qdate(mn) if mn else QtCore.QDate()
            max_q = StationSearchPanel._to_qdate(mx) if mx else QtCore.QDate()
            if min_q.isValid() and max_q.isValid():
                ok = (min_q <= end_q) and (max_q >= start_q)
            else:
                ok = True
            if ok:
                out.append(dt)
        return out

    # --- Date helpers ---
    def _set_yesterday(self):
        if hasattr(self, "progress"):
            self.progress.setRange(0, 0)
            self.progress.setVisible(True)
        d = QtCore.QDate.currentDate().addDays(-1)
        self.start_date.setDate(d)
        self.end_date.setDate(d)

    def _set_last_week(self):
        if hasattr(self, "progress"):
            self.progress.setRange(0, 0)
            self.progress.setVisible(True)
        today = QtCore.QDate.currentDate()
        start_this_week = today.addDays(-today.dayOfWeek() + 1)
        start = start_this_week.addDays(-7)
        self.start_date.setDate(start)
        self.end_date.setDate(start.addDays(6))

    def _set_last_month(self):
        if hasattr(self, "progress"):
            self.progress.setRange(0, 0)
            self.progress.setVisible(True)
        today = QtCore.QDate.currentDate()
        first_this_month = QtCore.QDate(today.year(), today.month(), 1)
        start = first_this_month.addMonths(-1)
        end = first_this_month.addDays(-1)
        self.start_date.setDate(start)
        self.end_date.setDate(end)

    # --- Run ---
    def _choose_output(self):
        start = self.settings.value("output_path", self.settings.value("last_dir", ""))
        filters = (
            "CSV files (*.csv);;TSF files (*.tsf);;SWMM files (*.inp);;All files (*.*)"
        )
        path, selected_filter = QtWidgets.QFileDialog.getSaveFileName(
            self, "Select output file", start, filters
        )
        if path:
            if selected_filter.startswith("CSV") and not path.endswith(".csv"):
                path += ".csv"
            elif selected_filter.startswith("TSF") and not path.endswith(".tsf"):
                path += ".tsf"
            elif selected_filter.startswith("SWMM") and not path.endswith(".inp"):
                path += ".inp"
            self.output_edit.setText(path)
            self.settings.setValue("output_path", path)
            self.settings.setValue("last_dir", str(Path(path).parent))

    def _show_in_folder(self) -> None:
        if not self._last_output_path:
            return
        path = Path(self._last_output_path)
        target = path if path.is_dir() else path.parent
        if not target.exists():
            QtWidgets.QMessageBox.warning(
                self,
                "Folder Not Found",
                f"The folder {target} could not be located.",
            )
            self._set_post_download_actions(None, None)
            return
        try:
            if sys.platform.startswith("win"):
                if path.is_file():
                    subprocess.Popen(["explorer", "/select,", str(path)])
                else:
                    subprocess.Popen(["explorer", str(target)])
            elif sys.platform == "darwin":
                if path.is_file():
                    subprocess.Popen(["open", "-R", str(path)])
                else:
                    subprocess.Popen(["open", str(target)])
            else:
                subprocess.Popen(["xdg-open", str(target)])
        except Exception:
            QtGui.QDesktopServices.openUrl(
                QtCore.QUrl.fromLocalFile(str(target))
            )

    def _quick_plot(self) -> None:
        if not self._last_output_path:
            return
        path = Path(self._last_output_path)
        fmt = (self._last_output_format or path.suffix.lstrip(".")).lower()
        if fmt not in {"csv", "tsf", "swmm"}:
            QtWidgets.QMessageBox.information(
                self,
                "Quick Plot",
                "Quick plots are only available for CSV, TSF, or SWMM outputs.",
            )
            return
        if not path.exists():
            QtWidgets.QMessageBox.warning(
                self,
                "File Missing",
                f"The downloaded file {path} could not be found.",
            )
            self._set_post_download_actions(None, None)
            return
        try:
            dataframe = self._load_timeseries_for_plot(path, fmt)
        except ImportError as exc:
            QtWidgets.QMessageBox.warning(
                self,
                "Quick Plot Unavailable",
                f"Quick plots require pandas: {exc}",
            )
            return
        except Exception as exc:
            QtWidgets.QMessageBox.warning(
                self,
                "Quick Plot Failed",
                f"Unable to prepare plot data: {exc}",
            )
            return
        if dataframe.empty:
            QtWidgets.QMessageBox.information(
                self,
                "Quick Plot",
                "No rainfall data was found in the downloaded file.",
            )
            return
        try:
            dialog = QuickPlotDialog(self, dataframe, path)
        except ImportError as exc:
            QtWidgets.QMessageBox.warning(
                self,
                "Quick Plot Unavailable",
                str(exc),
            )
            return
        dialog.exec_()

    def _load_timeseries_for_plot(self, path: Path, fmt: str):
        import pandas as pd

        fmt = fmt.lower()
        if fmt == "csv":
            df = pd.read_csv(path)
        elif fmt == "tsf":
            df = pd.read_csv(path, sep="\t", skiprows=2)
        elif fmt == "swmm":
            timestamps: list[datetime] = []
            values: list[float] = []
            with open(path, "r", encoding="utf-8", errors="ignore") as handle:
                for line in handle:
                    line = line.strip()
                    if not line or line.startswith("["):
                        continue
                    parts = line.split()
                    if len(parts) >= 4 and parts[0].upper() == "RAINFALL":
                        try:
                            moment = datetime.strptime(
                                " ".join(parts[1:3]), "%Y-%m-%d %H:%M"
                            )
                            value = float(parts[3])
                        except ValueError:
                            continue
                        timestamps.append(moment)
                        values.append(value)
            df = pd.DataFrame({"Datetime": timestamps, "Rainfall": values})
        else:
            raise ValueError(f"Unsupported format '{fmt}' for quick plot")

        if df.empty:
            return df

        if "Datetime" not in df.columns or "Rainfall" not in df.columns:
            raise ValueError("Expected 'Datetime' and 'Rainfall' columns in the output")

        df = df.copy()
        df["Datetime"] = pd.to_datetime(df["Datetime"], errors="coerce")
        df["Rainfall"] = pd.to_numeric(df["Rainfall"], errors="coerce")
        df = df.dropna(subset=["Datetime", "Rainfall"])
        df = df.sort_values("Datetime").reset_index(drop=True)
        return df[["Datetime", "Rainfall"]]

    # --- Queue helpers ---
    def _update_queue_selection_hint(self, count: int) -> None:
        if count <= 0:
            self.queue_selection_label.setText(
                "Select stations with the checkboxes in the search panel."
            )
            self.add_queue_btn.setEnabled(False)
        else:
            plural = "s" if count != 1 else ""
            self.queue_selection_label.setText(
                f"{count} station{plural} selected for batch download."
            )
            self.add_queue_btn.setEnabled(True)

    def _queue_item_selection_changed(self) -> None:
        has_selection = self.queue_list.currentRow() >= 0
        self.remove_queue_btn.setEnabled(has_selection and bool(self._queue))

    def _refresh_queue_view(self) -> None:
        has_items = bool(self._queue)
        self.queue_placeholder.setVisible(not has_items)
        self.queue_list.setVisible(has_items)
        self.queue_list.blockSignals(True)
        self.queue_list.clear()
        for index, job in enumerate(self._queue, start=1):
            item = QtWidgets.QListWidgetItem(self._format_queue_item(index, job))
            item.setData(QtCore.Qt.UserRole, index - 1)
            self.queue_list.addItem(item)
        self.queue_list.blockSignals(False)
        self.start_queue_btn.setEnabled(bool(self._queue) and not self._queue_active)
        self.clear_queue_btn.setEnabled(bool(self._queue))
        self.remove_queue_btn.setEnabled(
            self.queue_list.currentRow() >= 0 and bool(self._queue)
        )

    def _format_queue_item(self, position: int, job: Dict[str, Any]) -> str:
        station = job.get("station_label") or job.get("station")
        dataset = job.get("dataset_label") or job.get("dataset")
        datatype = job.get("datatype_label") or job.get("datatype")
        start = job.get("start")
        end = job.get("end")
        output = Path(job.get("output", "")).name
        summary = f"{station}"
        if dataset and datatype:
            summary += f" • {dataset}/{datatype}"
        if start and end:
            summary += f" • {start} → {end}"
        if output:
            summary += f" → {output}"
        return f"{position}. {summary}"

    def _derive_queue_output_path(
        self, base: Path, fmt: str, station_id: str
    ) -> Path:
        safe_station = re.sub(r"[^A-Za-z0-9_.-]+", "_", station_id) or "station"
        suffix = base.suffix if base.suffix else f".{fmt}"
        if base.exists() and base.is_dir():
            return base / f"{safe_station}{suffix}"
        if base.suffix:
            return base.with_name(f"{base.stem}_{safe_station}{base.suffix}")
        parent = base.parent if str(base.parent) not in {"", "."} else Path.cwd()
        stem = base.name or "rainfall"
        return parent / f"{stem}_{safe_station}{suffix}"

    def _ensure_unique_output(self, path: Path) -> Path:
        existing = {
            str(job.get("output"))
            for job in self._queue
            if job.get("output") is not None
        }
        if self._current_job and self._current_job.get("output"):
            existing.add(str(self._current_job["output"]))
        candidate = path
        counter = 1
        while str(candidate) in existing:
            candidate = candidate.with_name(
                f"{candidate.stem}_{counter}{candidate.suffix}"
            )
            counter += 1
        return candidate

    def _collect_form_values(self) -> Optional[Dict[str, Any]]:
        start = self.start_date.date().toString("yyyy-MM-dd")
        end = self.end_date.date().toString("yyyy-MM-dd")
        today = QtCore.QDate.currentDate()
        if self.end_date.date() > today:
            QtWidgets.QMessageBox.warning(
                self, "Invalid End Date", "End date cannot be after today."
            )
            return None
        api = self.api_edit.text().strip()
        output_text = self.output_edit.text().strip()
        if not output_text:
            QtWidgets.QMessageBox.warning(
                self, "Missing parameters", "Fill all required fields."
            )
            return None
        dataset_data = self.dataset_combo.currentData()
        dataset_id = dataset_data.get("id") if isinstance(dataset_data, dict) else dataset_data
        dataset_label = self.dataset_combo.currentText()
        datatype_id = self.datatype_combo.currentData()
        datatype_label = self.datatype_combo.currentText()
        if not dataset_id or not datatype_id:
            QtWidgets.QMessageBox.warning(
                self, "Missing parameters", "Select dataset and datatype."
            )
            return None
        source_text = self.source_combo.currentText()
        source = "noaa" if "NOAA" in source_text else "example"
        if source == "noaa" and not api:
            QtWidgets.QMessageBox.warning(
                self, "Missing API token", "Enter your NOAA API token."
            )
            return None
        return {
            "start": start,
            "end": end,
            "api": api,
            "output": output_text,
            "dataset": str(dataset_id),
            "dataset_label": dataset_label,
            "datatype": str(datatype_id),
            "datatype_label": datatype_label,
            "format": self.format_combo.currentText().lower(),
            "units": self.units_combo.currentText(),
            "source": source,
            "source_label": source_text,
        }

    def _build_job_payload(
        self,
        station_id: str,
        *,
        station_label: str | None = None,
        output_path: Path | None = None,
        common_values: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        values = common_values or self._collect_form_values()
        if values is None:
            return None
        station = station_id.strip()
        if not station:
            QtWidgets.QMessageBox.warning(
                self, "Missing parameters", "Select a station before proceeding."
            )
            return None
        output = Path(output_path or values["output"])
        job = {
            "station": station,
            "station_label": station_label or station,
            "dataset": values["dataset"],
            "dataset_label": values["dataset_label"],
            "datatype": values["datatype"],
            "datatype_label": values["datatype_label"],
            "start": values["start"],
            "end": values["end"],
            "api": values["api"],
            "output": output,
            "format": values["format"],
            "units": values["units"],
            "source": values["source"],
            "source_label": values["source_label"],
        }
        job["args"] = self._build_process_args(job)
        return job

    def _build_process_args(self, job: Dict[str, Any]) -> List[str]:
        return [
            "--station",
            job["station"],
            "--start",
            job["start"],
            "--end",
            job["end"],
            "--api-key",
            job["api"],
            "--output",
            str(job["output"]),
            "--format",
            job["format"],
            "--units",
            job["units"],
            "--source",
            job["source"],
            "--dataset",
            job["dataset"],
            "--datatype",
            job["datatype"],
        ]

    def _add_selected_to_queue(self) -> None:
        selections = self.search_panel.get_queue_selection()
        if not selections:
            QtWidgets.QMessageBox.information(
                self,
                "No Stations Selected",
                "Use the checkboxes in the search results to select stations before adding them to the queue.",
            )
            return
        values = self._collect_form_values()
        if values is None:
            return
        base_output = Path(values["output"])
        added = 0
        for station in selections:
            sid = str(station.get("id") or "").strip()
            if not sid:
                continue
            datasets = self.search_panel.get_station_datasets(sid)
            if datasets:
                dataset_ids = {str(d.get("id")) for d in datasets if d.get("id")}
                if values["dataset"] not in dataset_ids:
                    self.output_box.appendPlainText(
                        f"⚠️ Skipping {sid}: dataset {values['dataset']} not available."
                    )
                    continue
                matching_dataset = next(
                    (d for d in datasets if str(d.get("id")) == values["dataset"]),
                    None,
                )
                if matching_dataset:
                    datatypes = [
                        str(dt.get("id"))
                        for dt in (
                            matching_dataset.get("filtered_datatypes")
                            or matching_dataset.get("datatypes")
                            or []
                        )
                        if isinstance(dt, dict)
                    ]
                    if datatypes and values["datatype"] not in datatypes:
                        self.output_box.appendPlainText(
                            f"⚠️ Skipping {sid}: datatype {values['datatype']} not available."
                        )
                        continue
            output_path = self._derive_queue_output_path(base_output, values["format"], sid)
            output_path = self._ensure_unique_output(output_path)
            label = self.search_panel.get_station_label(sid)
            job = self._build_job_payload(
                sid,
                station_label=label,
                output_path=output_path,
                common_values=values,
            )
            if not job:
                continue
            self._queue.append(job)
            added += 1
            self.output_box.appendPlainText(
                f"➕ Added {label} ({values['dataset']}/{values['datatype']}) to the queue → {output_path.name}"
            )
        if added:
            if self._queue_active:
                self._queue_total += added
            self._refresh_queue_view()
            self.search_panel.clear_queue_selection()
        else:
            QtWidgets.QMessageBox.information(
                self,
                "Queue",
                "No stations were added to the queue. Ensure the selected stations support the chosen dataset and datatype.",
            )

    def _start_queue(self) -> None:
        if self._queue_active:
            return
        if not self._queue:
            QtWidgets.QMessageBox.information(
                self, "Queue", "Add at least one station to the queue first."
            )
            return
        self._queue_active = True
        self._queue_total = len(self._queue)
        self.run_btn.setEnabled(False)
        self.start_queue_btn.setEnabled(False)
        self.output_box.appendPlainText(
            f"▶ Starting queue with {self._queue_total} job(s)."
        )
        self._set_status("Starting batch downloads…", timeout=0)
        self._start_next_job()

    def _start_next_job(self) -> None:
        while self._queue:
            job = self._queue.pop(0)
            position = max(1, self._queue_total - len(self._queue))
            job["queue_position"] = position
            job["queue_total"] = max(self._queue_total, position + len(self._queue))
            self._refresh_queue_view()
            if self._launch_job(job, from_queue=True):
                return
        # Queue exhausted
        self._queue_active = False
        self._queue_total = 0
        self._current_job = None
        self.run_btn.setEnabled(True)
        self.start_queue_btn.setEnabled(bool(self._queue))
        self.cancel_btn.setEnabled(False)
        self.progress.setVisible(False)
        if not self._queue:
            self._set_status("Queue complete.", timeout=6000)
        self._refresh_queue_view()

    def _launch_job(self, job: Dict[str, Any], *, from_queue: bool) -> bool:
        station_label = job.get("station_label") or job.get("station")
        prefix = ""
        if from_queue:
            prefix = (
                f"Queue {job.get('queue_position', 1)}/{job.get('queue_total', 1)} – "
            )
        if job.get("source") == "noaa":
            try:
                has_data = has_data_in_range(
                    job["station"],
                    job["dataset"],
                    job["datatype"],
                    job["start"],
                    job["end"],
                    job["api"],
                )
            except Exception as exc:
                has_data = True
                self.output_box.appendPlainText(
                    f"⚠️ Coverage check failed (continuing download): {exc}"
                )
            if not has_data:
                warning = (
                    "⚠️ Warning: No data points were found for the selected range."
                )
                if from_queue:
                    self.output_box.appendPlainText(
                        f"{prefix}{warning} Attempting download anyway."
                    )
                else:
                    response = QtWidgets.QMessageBox.question(
                        self,
                        "No Data Found",
                        warning
                        + "\n\nDo you want to attempt the download anyway?",
                        QtWidgets.QMessageBox.Yes | QtWidgets.QMessageBox.No,
                        QtWidgets.QMessageBox.No,
                    )
                    if response == QtWidgets.QMessageBox.No:
                        self._set_status("Download cancelled before start.", timeout=6000)
                        return False
        output_path: Path = job["output"]
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            self.output_box.appendPlainText(
                f"❌ Unable to prepare output folder for {station_label}: {exc}"
            )
            if not from_queue:
                QtWidgets.QMessageBox.warning(
                    self,
                    "Output Error",
                    f"Unable to prepare output folder: {exc}",
                )
            return False
        self._set_post_download_actions(None, None)
        self._pending_output_path = output_path
        self._pending_output_format = job["format"]
        self._current_job = job
        self._last_process_error = ""
        message = (
            f"{prefix}Fetching rainfall data for {station_label} "
            f"({job['start']} → {job['end']}) → {output_path.name}"
        )
        self.output_box.appendPlainText(message)
        self._set_status(message, timeout=0)
        self.run_btn.setEnabled(False)
        self.progress.setVisible(True)
        self.cancel_btn.setEnabled(True)
        self.process.start(
            sys.executable, ["-m", "hh_tools.download_rainfall", *job["args"]]
        )
        return True

    def _clear_queue(self) -> None:
        if not self._queue:
            return
        self._queue.clear()
        self._refresh_queue_view()
        if not self._queue_active:
            self.start_queue_btn.setEnabled(False)

    def _remove_queue_item(self) -> None:
        row = self.queue_list.currentRow()
        if row < 0 or row >= len(self._queue):
            return
        job = self._queue.pop(row)
        label = job.get("station_label") or job.get("station")
        self.output_box.appendPlainText(f"➖ Removed {label} from the queue.")
        self._refresh_queue_view()

    def _run(self):
        station = self.station_edit.text().strip()
        if not station:
            QtWidgets.QMessageBox.warning(
                self, "Missing parameters", "Select a station before downloading."
            )
            return

        values = self._collect_form_values()
        if values is None:
            return

        if self.api_save.isChecked():
            self.settings.setValue("api_key", values["api"])

        self.settings.setValue("station", station)

        label = self.search_panel.get_station_label(station)
        job = self._build_job_payload(
            station,
            station_label=label,
            common_values=values,
        )
        if not job:
            return

        if not self._launch_job(job, from_queue=False):
            return

    def _populate_datasets(self) -> None:
        station = self.station_edit.text().strip()
        token = self.api_edit.text().strip()
        if not station or not token:
            return
        datasets = self.search_panel.get_station_datasets(station)
        if not datasets:
            return
        self._populate_dataset_combo(datasets)

    def _find_dataset_index(self, dataset_id: str) -> int:
        for i in range(self.dataset_combo.count()):
            data = self.dataset_combo.itemData(i)
            if isinstance(data, dict) and data.get("id") == dataset_id:
                return i
            if isinstance(data, str) and data == dataset_id:
                return i
        return -1

    def _find_datatype_index(self, datatype_id: str) -> int:
        for i in range(self.datatype_combo.count()):
            data = self.datatype_combo.itemData(i)
            if isinstance(data, str) and data == datatype_id:
                return i
        return -1

    def _select_datatype_by_id(self, datatype_id: str) -> None:
        idx = self._find_datatype_index(datatype_id)
        if idx >= 0:
            self.datatype_combo.setCurrentIndex(idx)

    def _table_row_selected(self, data: dict) -> None:
        if not data:
            return
        station_id = data.get("station_id")
        if station_id:
            self.station_edit.setText(station_id)
            self.settings.setValue("station", station_id)
        payload = data.get("payload") or {}
        dataset_id = payload.get("dataset_id")
        datatype_id = payload.get("datatype_id")
        datasets = data.get("datasets") or []
        if datasets:
            self._populate_dataset_combo(datasets)
        if dataset_id:
            idx = self._find_dataset_index(dataset_id)
            if idx >= 0:
                self.dataset_combo.setCurrentIndex(idx)
        if datatype_id:
            self._pending_datatype_id = datatype_id
            self._select_datatype_by_id(datatype_id)
        if payload.get("datatype_mindate") and payload.get("datatype_maxdate"):
            self._pending_autofill_range = (
                StationSearchPanel._to_qdate(payload["datatype_mindate"]),
                StationSearchPanel._to_qdate(payload["datatype_maxdate"]),
            )
        elif payload.get("dataset_mindate") and payload.get("dataset_maxdate"):
            self._pending_autofill_range = (
                StationSearchPanel._to_qdate(payload["dataset_mindate"]),
                StationSearchPanel._to_qdate(payload["dataset_maxdate"]),
            )
        if self._pending_autofill_range:
            start, end = self._pending_autofill_range
            if start.isValid() and end.isValid():
                self.start_date.setDate(start)
                self.end_date.setDate(end)
            self._pending_autofill_range = None

    def _populate_dataset_combo(self, datasets: List[Dict[str, Any]]) -> None:
        current_id = None
        curr_data = self.dataset_combo.currentData()
        if isinstance(curr_data, dict):
            current_id = curr_data.get("id")
        elif isinstance(curr_data, str):
            current_id = curr_data
        self.dataset_combo.blockSignals(True)
        self.dataset_combo.clear()
        for d in datasets:
            label = f"{d['id']} - {d.get('name','')}" if d.get("name") else d["id"]
            self.dataset_combo.addItem(label, d)
        self.dataset_combo.blockSignals(False)
        if current_id:
            idx = self._find_dataset_index(current_id)
            if idx >= 0:
                self.dataset_combo.setCurrentIndex(idx)
        if self.dataset_combo.currentIndex() < 0 and self.dataset_combo.count() > 0:
            self.dataset_combo.setCurrentIndex(0)
        self._dataset_changed()

    def _dataset_changed(self) -> None:
        data = self.dataset_combo.currentData()
        if not data:
            self.datatype_combo.clear()
            return
        dataset_id = data.get("id") if isinstance(data, dict) else data
        if dataset_id != self._active_dataset_id:
            self._active_dataset_id = dataset_id
            self._populate_datatypes(dataset_id, data if isinstance(data, dict) else {})
        else:
            self._apply_datatypes(data if isinstance(data, dict) else {})
        self._refresh_coverage_preview()

    def _populate_datatypes(self, dataset_id: str, dataset_obj: Dict[str, Any]) -> None:
        datatypes = dataset_obj.get("datatypes") or []
        if datatypes:
            self._apply_datatypes(dataset_obj)
            return
        token = self.api_edit.text().strip()
        station = self.station_edit.text().strip()
        if not token or not station:
            self._apply_datatypes(dataset_obj)
            return
        if self._datatype_fetcher:
            if self._datatype_fetcher.isRunning():
                return
            self._datatype_fetcher = None
        self.datatype_combo.clear()
        self.datatype_combo.addItem("Loading datatypes...", None)
        self.datatype_combo.setEnabled(False)
        self._set_status(f"Fetching datatypes for {dataset_id}...")
        fetcher = DatatypeFetcher(
            station,
            dataset_id,
            token,
            dataset_mindate=dataset_obj.get("mindate"),
            dataset_maxdate=dataset_obj.get("maxdate"),
            parent=self,
        )
        fetcher.datatypes_ready.connect(self._datatypes_ready)
        fetcher.error.connect(self._datatypes_error)
        fetcher.finished.connect(self._datatype_fetch_finished)
        self._datatype_fetcher = fetcher
        fetcher.start()

    def _datatype_fetch_finished(self) -> None:
        self.datatype_combo.setEnabled(True)
        self._datatype_fetcher = None
        self._set_status("Ready.")

    def _datatypes_ready(
        self, station: str, dataset: str, datatypes: List[Dict[str, Any]]
    ) -> None:
        self.search_panel.update_station_datatypes(station, dataset, datatypes)
        current_data = self.dataset_combo.currentData()
        if isinstance(current_data, dict) and current_data.get("id") == dataset:
            self._apply_datatypes(current_data)

    def _datatypes_error(self, station: str, dataset: str, error: str) -> None:
        self.output_box.appendPlainText(
            f"⚠️ Failed to fetch datatypes for {dataset}: {error}"
        )
        self.datatype_combo.clear()
        self.datatype_combo.addItem("Error loading datatypes", None)

    def _apply_datatypes(self, dataset_obj: Dict[str, Any]) -> None:
        current_dt_id = self.datatype_combo.currentData()
        if self._pending_datatype_id:
            current_dt_id = self._pending_datatype_id
            self._pending_datatype_id = None
        all_datatypes = dataset_obj.get("datatypes") or []
        filtered = self._filter_datatypes_by_date(all_datatypes)
        self.search_panel.update_station_datatypes(
            self.station_edit.text().strip(),
            str(dataset_obj.get("id")),
            all_datatypes,
            filtered=filtered,
        )
        self.datatype_combo.blockSignals(True)
        self.datatype_combo.clear()
        if not filtered:
            if all_datatypes:
                self.datatype_combo.addItem(
                    "(No datatypes in date range)", None
                )
            else:
                self.datatype_combo.addItem("(No datatypes available)", None)
        else:
            for dt in filtered:
                label = (
                    f"{dt['id']} - {dt.get('name','')}" if dt.get("name") else dt["id"]
                )
                self.datatype_combo.addItem(label, dt["id"])
        self.datatype_combo.blockSignals(False)
        if current_dt_id:
            self._select_datatype_by_id(str(current_dt_id))
        if self.datatype_combo.currentIndex() < 0 and self.datatype_combo.count() > 0:
            self.datatype_combo.setCurrentIndex(0)

    def _station_chosen(self, sid: str, datasets: list) -> None:
        self.station_edit.setText(sid)
        self.settings.setValue("station", sid)
        if datasets:
            self._populate_dataset_combo(datasets)
        else:
            self.dataset_combo.clear()
            self.datatype_combo.clear()

    def _handle_stdout(self) -> None:
        data = self.process.readAllStandardOutput()
        text = bytes(data).decode("utf-8", errors="replace").strip()
        if text:
            self.output_box.appendPlainText(text)

    def _handle_stderr(self) -> None:
        data = self.process.readAllStandardError()
        text = bytes(data).decode("utf-8", errors="replace").strip()
        if text:
            self._last_process_error += text + "\n"
            self.output_box.appendPlainText(f"STDERR: {text}")

    def _process_finished(self, exit_code: int, _exit_status: int) -> None:
        self.run_btn.setEnabled(True)
        self.progress.setVisible(False)
        self.cancel_btn.setEnabled(False)

        if exit_code == 0:
            self.output_box.appendPlainText(completion_art())
            self.output_box.appendPlainText("Download completed successfully.")
            self._set_status("Download finished.", timeout=10000)
            if self._pending_output_path:
                self._set_post_download_actions(
                    self._pending_output_path, self._pending_output_format
                )
            if self._queue_active:
                QtCore.QTimer.singleShot(1000, self._start_next_job)
        else:
            self.output_box.appendPlainText(
                f"Process failed with exit code {exit_code}."
            )
            self._set_status("Download failed.", timeout=0)
            if self._queue_active:
                self.output_box.appendPlainText(
                    "⚠️ Queue job failed. Proceeding to next job..."
                )
                QtCore.QTimer.singleShot(2000, self._start_next_job)
            else:
                QtWidgets.QMessageBox.critical(
                    self,
                    "Download Failed",
                    f"The download process exited with code {exit_code}.\n\nError output:\n{self._last_process_error.strip()}",
                )

    def closeEvent(self, event: QtGui.QCloseEvent) -> None:
        if self.process.state() != QtCore.QProcess.NotRunning:
            self.process.kill()
        if self._search_worker and self._search_worker.isRunning():
            self._search_worker.requestInterruption()
            self._search_worker.wait(1000)
        if self._coverage_worker and self._coverage_worker.isRunning():
            self._coverage_worker.requestInterruption()
            self._coverage_worker.wait(1000)
        if self._datatype_fetcher and self._datatype_fetcher.isRunning():
            self._datatype_fetcher.quit()
            self._datatype_fetcher.wait(1000)
        self.search_panel.save_layout_state()
        self.settings.setValue("geometry", self.saveGeometry())
        self.settings.setValue("main_splitter_sizes", self._main_splitter.sizes())
        event.accept()

    def _cancel(self) -> None:
        if self.process.state() != QtCore.QProcess.NotRunning:
            self.process.kill()
            self.output_box.appendPlainText("Process cancelled by user.")
            self._set_status("Cancelled.", timeout=5000)
        if self._queue_active:
            self._queue_active = False
            self.output_box.appendPlainText("⏹ Queue stopped by user.")
            self._refresh_queue_view()

    def _show_help(self) -> None:
        QtWidgets.QMessageBox.information(
            self,
            "Help",
            "1. Enter a city to search for stations.\n"
            "2. Select a station from the list or map.\n"
            "3. Choose a dataset (e.g., GHCND) and datatype (e.g., PRCP).\n"
            "4. Enter your NOAA API key (request one from ncdc.noaa.gov).\n"
            "5. Select start/end dates.\n"
            "6. Click 'Run' to download data.\n\n"
            "Batch Mode:\n"
            "• Use checkboxes in the search list to select multiple stations.\n"
            "• Click 'Add to Queue' to stage them.\n"
            "• Click 'Start Queue' to download all selected stations sequentially.\n\n"
            "Map:\n"
            "• Click markers to select stations.\n"
            "• Selected stations are highlighted in blue.",
        )

def main() -> None:
    app = QtWidgets.QApplication(sys.argv)
    app.setWindowIcon(QtGui.QIcon(str(ICON_DIR / "download_rainfall.ico")))
    from hh_tools.gui.theme import apply_dark_palette
    apply_dark_palette(app)
    win = DownloadRainfallWindow()
    win.show()
    if os.environ.get("HH_LAUNCHER"):
        # If launched from the master launcher, tell it we're ready
        # (This is a placeholder for any IPC mechanism if needed)
        pass
    sys.exit(app.exec_())

if __name__ == "__main__":
    main()
