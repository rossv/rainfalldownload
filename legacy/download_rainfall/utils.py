from __future__ import annotations
import os
import sys
from pathlib import Path
from PyQt5 import QtCore

# Adjust PKG_ROOT to point to the root of the repo (src/hh_tools is 3 levels down from src/hh_tools/gui/download_rainfall?)
# src/hh_tools/gui/download_rainfall/utils.py
# parents[0] = download_rainfall
# parents[1] = gui
# parents[2] = hh_tools
# parents[3] = src
PKG_ROOT = Path(__file__).resolve().parents[3]

# Icons are in src/hh_tools/gui/icons
ICON_DIR = Path(__file__).resolve().parents[1] / "icons"

def process_environment() -> QtCore.QProcessEnvironment:
    """Return an environment with ``PKG_ROOT`` on ``PYTHONPATH``."""
    env = QtCore.QProcessEnvironment.systemEnvironment()
    pythonpath = env.value("PYTHONPATH", "")
    paths = [str(PKG_ROOT)]
    if pythonpath:
        for item in pythonpath.split(os.pathsep):
            if item and item not in paths:
                paths.append(item)
    env.insert("PYTHONPATH", os.pathsep.join(paths))
    return env
