from __future__ import annotations
from PyQt5 import QtCore

class MapBridge(QtCore.QObject):
    """Expose map interaction callbacks to Qt."""

    stationClicked = QtCore.pyqtSignal(str)

    @QtCore.pyqtSlot(str)
    def onMarkerClicked(self, sid: str) -> None:
        if sid:
            self.stationClicked.emit(sid)
