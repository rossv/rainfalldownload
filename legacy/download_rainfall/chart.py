from __future__ import annotations
from PyQt5 import QtCore, QtGui, QtWidgets

class CoverageChartWidget(QtWidgets.QWidget):
    """Simple bar chart that visualises data coverage percentages."""

    def __init__(self, parent: QtWidgets.QWidget | None = None) -> None:
        super().__init__(parent)
        self._bins: list[dict[str, object]] = []
        self._message = "Select a dataset and datatype to preview coverage."
        self._loading = False
        self._bin_span_years = 1
        self.setMinimumHeight(140)

    def sizeHint(self) -> QtCore.QSize:
        return QtCore.QSize(360, 160)

    # Public API ---------------------------------------------------------
    def set_message(self, text: str) -> None:
        self._bins = []
        self._message = text
        self._loading = False
        self.update()

    def show_loading(self, text: str) -> None:
        self._bins = []
        self._message = text
        self._loading = True
        self.update()

    def set_bins(self, bins: list[dict[str, object]], span_years: int) -> None:
        """
        Populate the widget with coverage information.

        Instead of drawing a complex bar chart, summarise the available
        coverage as a simple message.  The earliest and latest labels are
        extracted from the ``bins`` argument and the mean coverage
        percentage is computed.  The message is displayed in place of the
        bar chart to provide users with an immediate understanding of
        data availability.
        """
        self._bins = []  # Do not render bars – only show summary text
        self._bin_span_years = max(1, span_years)
        self._loading = False
        # Compute earliest and latest labels if available
        if bins:
            try:
                earliest = bins[0].get("label") or ""
                latest = bins[-1].get("label") or ""
                values = [float(b.get("value", 0)) for b in bins if b.get("value") is not None]
                avg_cov = sum(values) / len(values) if values else 0.0
                self._message = f"Available: {earliest} → {latest} (avg. {avg_cov:.0f}% coverage)"
            except Exception:
                self._message = "Data coverage information unavailable."
        else:
            self._message = "No coverage data available for this selection."
        self.update()

    # Painting -----------------------------------------------------------
    def paintEvent(self, event: QtGui.QPaintEvent) -> None:
        painter = QtGui.QPainter(self)
        painter.setRenderHint(QtGui.QPainter.Antialiasing)

        rect = self.rect()
        painter.fillRect(rect, self.palette().brush(QtGui.QPalette.Base))
        chart_rect = rect.adjusted(12, 12, -12, -12)

        if not self._bins:
            painter.setPen(self.palette().color(QtGui.QPalette.Text))
            if not self._message:
                self._message = "No coverage data available for this selection."
            flags = QtCore.Qt.AlignCenter | QtCore.Qt.TextWordWrap
            painter.drawText(chart_rect, flags, self._message)
            return

        axis_rect = chart_rect.adjusted(36, 8, -12, -36)
        if axis_rect.width() <= 0 or axis_rect.height() <= 0:
            return

        mid = self.palette().color(QtGui.QPalette.Mid)
        painter.setPen(QtGui.QPen(mid, 1))
        painter.drawLine(axis_rect.bottomLeft(), axis_rect.bottomRight())
        painter.drawLine(axis_rect.bottomLeft(), axis_rect.topLeft())

        guide_pen = QtGui.QPen(self.palette().color(QtGui.QPalette.Midlight))
        guide_pen.setStyle(QtCore.Qt.DashLine)
        for pct in range(25, 100, 25):
            y = axis_rect.bottom() - (axis_rect.height() * (pct / 100.0))
            painter.setPen(guide_pen)
            painter.drawLine(QtCore.QLineF(axis_rect.left(), y, axis_rect.right(), y))
            painter.setPen(self.palette().color(QtGui.QPalette.Text))
            painter.drawText(
                QtCore.QPointF(axis_rect.left() - 8, y + 4),
                f"{pct}%",
            )

        count = len(self._bins)
        bar_width = axis_rect.width() / max(1, count)
        colours = {
            "high": QtGui.QColor("#4caf50"),
            "medium": QtGui.QColor("#fdd835"),
            "low": QtGui.QColor("#f44336"),
        }

        for index, entry in enumerate(self._bins):
            value = float(entry.get("value", 0))
            label = str(entry.get("label", index))
            height = axis_rect.height() * max(0.0, min(100.0, value)) / 100.0
            left = axis_rect.left() + (index * bar_width) + (bar_width * 0.15)
            bar_rect = QtCore.QRectF(
                left,
                axis_rect.bottom() - height,
                bar_width * 0.7,
                height,
            )
            if value >= 75:
                colour = colours["high"]
            elif value >= 25:
                colour = colours["medium"]
            else:
                colour = colours["low"]
            painter.setPen(QtCore.Qt.NoPen)
            painter.setBrush(colour)
            painter.drawRoundedRect(bar_rect, 3, 3)

            painter.setPen(self.palette().color(QtGui.QPalette.Text))
            metrics = painter.fontMetrics()
            if bar_width < 36:
                painter.save()
                painter.translate(
                    axis_rect.left() + (index + 0.5) * bar_width,
                    axis_rect.bottom() + 12,
                )
                painter.rotate(-45)
                painter.drawText(QtCore.QPointF(0, 0), label)
                painter.restore()
            else:
                text_rect = QtCore.QRectF(
                    axis_rect.left() + index * bar_width,
                    axis_rect.bottom() + 4,
                    bar_width,
                    metrics.height() * 2,
                )
                painter.drawText(text_rect, QtCore.Qt.AlignHCenter | QtCore.Qt.AlignTop, label)

        footer = "Each bar represents {} year{} of data.".format(
            self._bin_span_years,
            "" if self._bin_span_years == 1 else "s",
        )
        painter.setPen(self.palette().color(QtGui.QPalette.Mid))
        painter.drawText(
            QtCore.QRectF(chart_rect.left(), chart_rect.bottom() - 20, chart_rect.width(), 20),
            QtCore.Qt.AlignRight | QtCore.Qt.AlignVCenter,
            footer,
        )
