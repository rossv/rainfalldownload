"""PyQt5 front-end for download_rainfall."""
from __future__ import annotations
import sys
from pathlib import Path

# Ensure the package root is in sys.path
PKG_ROOT = Path(__file__).resolve().parents[2]
if str(PKG_ROOT) not in sys.path:
    sys.path.insert(0, str(PKG_ROOT))

from hh_tools.gui.download_rainfall.window import main

if __name__ == "__main__":
    main()
