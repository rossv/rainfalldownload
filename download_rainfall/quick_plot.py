from __future__ import annotations
from pathlib import Path
from typing import Any
from PyQt5 import QtCore, QtWidgets

try:
    from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
    from matplotlib.figure import Figure
    import matplotlib.dates as mdates
except ImportError:
    FigureCanvas = None
    Figure = None
    mdates = None

class QuickPlotDialog(QtWidgets.QDialog):
    def __init__(self, parent: QtWidgets.QWidget, dataframe: Any, path: Path) -> None:
        super().__init__(parent)
        self.setWindowTitle(f"Quick Plot - {path.name}")
        self.resize(900, 600)
        layout = QtWidgets.QVBoxLayout(self)

        if FigureCanvas is None:
            layout.addWidget(QtWidgets.QLabel("Matplotlib is required for plotting."))
            return

        # Dark theme colors
        bg_color = "#1e1e1e"
        fg_color = "#d4d4d4"
        grid_color = "#3e3e42"
        accent_color = "#007acc"

        # Create the figure and canvas
        figure = Figure(figsize=(8, 6), dpi=100)
        figure.patch.set_facecolor(bg_color)
        canvas = FigureCanvas(figure)
        layout.addWidget(canvas)

        # Plot the data
        ax = figure.add_subplot(111)
        ax.set_facecolor(bg_color)
        
        # Plot line with accent color
        ax.plot(dataframe["Datetime"], dataframe["Rainfall"], label="Rainfall", color=accent_color, linewidth=1.5)

        # Format the plot
        ax.set_title(f"Rainfall Data: {path.name}", color=fg_color, fontsize=12, pad=15)
        ax.set_xlabel("Datetime", color=fg_color)
        ax.set_ylabel("Rainfall", color=fg_color)
        
        # Grid and spines
        ax.grid(True, which="both", color=grid_color, linestyle="-", linewidth=0.5)
        for spine in ax.spines.values():
            spine.set_color(grid_color)
            
        # Ticks
        ax.tick_params(axis="x", colors=fg_color)
        ax.tick_params(axis="y", colors=fg_color)
        
        # Format x-axis dates
        locator = mdates.AutoDateLocator()
        formatter = mdates.ConciseDateFormatter(locator)
        ax.xaxis.set_major_locator(locator)
        ax.xaxis.set_major_formatter(formatter)
        
        figure.autofmt_xdate()
        figure.tight_layout()
        canvas.draw()
