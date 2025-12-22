# theme.py
from PyQt5 import QtCore, QtGui, QtWidgets

def apply_dark_palette(app: QtWidgets.QApplication) -> None:
    """Apply a modern dark theme to the application."""
    app.setStyle("Fusion")
    app.setAttribute(QtCore.Qt.AA_UseHighDpiPixmaps, True)

    # Modern Dark Palette
    # Backgrounds: #1e1e1e (window), #252526 (base), #2d2d30 (alternate)
    # Accents: #007acc (highlight), #3e3e42 (button)
    # Text: #d4d4d4 (text), #858585 (disabled)

    palette = QtGui.QPalette()
    
    # Base colors
    palette.setColor(QtGui.QPalette.Window, QtGui.QColor("#1e1e1e"))
    palette.setColor(QtGui.QPalette.WindowText, QtGui.QColor("#d4d4d4"))
    palette.setColor(QtGui.QPalette.Base, QtGui.QColor("#252526"))
    palette.setColor(QtGui.QPalette.AlternateBase, QtGui.QColor("#2d2d30"))
    palette.setColor(QtGui.QPalette.ToolTipBase, QtGui.QColor("#2d2d30"))
    palette.setColor(QtGui.QPalette.ToolTipText, QtGui.QColor("#d4d4d4"))
    palette.setColor(QtGui.QPalette.Text, QtGui.QColor("#d4d4d4"))
    
    # Button colors
    palette.setColor(QtGui.QPalette.Button, QtGui.QColor("#3e3e42"))
    palette.setColor(QtGui.QPalette.ButtonText, QtGui.QColor("#d4d4d4"))
    palette.setColor(QtGui.QPalette.BrightText, QtGui.QColor("#ffffff"))
    
    # Highlight colors
    palette.setColor(QtGui.QPalette.Highlight, QtGui.QColor("#007acc"))
    palette.setColor(QtGui.QPalette.HighlightedText, QtGui.QColor("#ffffff"))
    palette.setColor(QtGui.QPalette.Link, QtGui.QColor("#3794ff"))
    palette.setColor(QtGui.QPalette.LinkVisited, QtGui.QColor("#3794ff"))

    # Disabled colors
    palette.setColor(QtGui.QPalette.Disabled, QtGui.QPalette.WindowText, QtGui.QColor("#858585"))
    palette.setColor(QtGui.QPalette.Disabled, QtGui.QPalette.Text, QtGui.QColor("#858585"))
    palette.setColor(QtGui.QPalette.Disabled, QtGui.QPalette.ButtonText, QtGui.QColor("#858585"))
    palette.setColor(QtGui.QPalette.Disabled, QtGui.QPalette.Highlight, QtGui.QColor("#2d2d30"))
    palette.setColor(QtGui.QPalette.Disabled, QtGui.QPalette.HighlightedText, QtGui.QColor("#858585"))

    app.setPalette(palette)
    apply_global_styles(app)


def apply_global_styles(app: QtWidgets.QApplication) -> None:
    """App-wide QSS for a modern look."""
    qss = """
    * {
        font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 10pt;
    }
    
    QMainWindow, QDialog {
        background-color: #1e1e1e;
    }

    QWidget {
        color: #d4d4d4;
    }

    /* ---- Toolbar ---- */
    QToolBar { background: #252526; border: none; padding: 6px; }
    QToolBar QToolButton { padding: 6px 10px; border-radius: 4px; }
    QToolBar QToolButton:hover  { background: #3e3e42; }
    QToolBar QToolButton:pressed{ background: #007acc; }

    /* ---- Header ---- */
    #header { color: #ffffff; font-size: 22pt; font-weight: 750; padding: 6px 2px 2px 2px; }

    /* --- Inputs --- */
    QLineEdit, QDateEdit, QComboBox, QSpinBox, QDoubleSpinBox {
        background-color: #3c3c3c;
        border: 1px solid #3e3e42;
        border-radius: 4px;
        padding: 4px 8px;
        selection-background-color: #007acc;
        min-height: 20px;
    }
    QLineEdit:focus, QDateEdit:focus, QComboBox:focus {
        border: 1px solid #007acc;
        background-color: #252526;
    }
    QLineEdit:disabled, QDateEdit:disabled, QComboBox:disabled {
        background-color: #2d2d30;
        color: #858585;
        border: 1px solid #2d2d30;
    }

    /* --- Buttons --- */
    QPushButton {
        background-color: #3e3e42;
        border: 1px solid #3e3e42;
        border-radius: 4px;
        padding: 5px 15px;
        color: #d4d4d4;
    }
    QPushButton:hover {
        background-color: #4e4e52;
        border: 1px solid #4e4e52;
    }
    QPushButton:pressed {
        background-color: #007acc;
        border: 1px solid #007acc;
        color: #ffffff;
    }
    QPushButton:disabled {
        background-color: #2d2d30;
        border: 1px solid #2d2d30;
        color: #858585;
    }
    QToolButton {
        background-color: transparent;
        border: none;
        border-radius: 4px;
        padding: 4px;
    }
    QToolButton:hover {
        background-color: #3e3e42;
    }
    QToolButton:pressed {
        background-color: #007acc;
    }

    /* --- Lists & Tables --- */
    QListWidget, QTableWidget, QTreeWidget, QPlainTextEdit {
        background-color: #252526;
        border: 1px solid #3e3e42;
        border-radius: 4px;
        gridline-color: #3e3e42;
    }
    QHeaderView::section {
        background-color: #2d2d30;
        border: none;
        border-right: 1px solid #3e3e42;
        border-bottom: 1px solid #3e3e42;
        padding: 4px;
        font-weight: bold;
    }
    QTableWidget::item {
        padding: 4px;
    }
    QTableWidget::item:selected, QListWidget::item:selected {
        background-color: #007acc;
        color: #ffffff;
    }

    /* --- Scrollbars --- */
    QScrollBar:vertical {
        background: #1e1e1e;
        width: 12px;
        margin: 0px;
    }
    QScrollBar::handle:vertical {
        background: #424242;
        min-height: 20px;
        border-radius: 6px;
        margin: 2px;
    }
    QScrollBar::handle:vertical:hover {
        background: #686868;
    }
    QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
        height: 0px;
    }
    QScrollBar:horizontal {
        background: #1e1e1e;
        height: 12px;
        margin: 0px;
    }
    QScrollBar::handle:horizontal {
        background: #424242;
        min-width: 20px;
        border-radius: 6px;
        margin: 2px;
    }
    QScrollBar::handle:horizontal:hover {
        background: #686868;
    }
    QScrollBar::add-line:horizontal, QScrollBar::sub-line:horizontal {
        width: 0px;
    }

    /* --- Tabs --- */
    QTabWidget::pane {
        border: 1px solid #3e3e42;
        border-radius: 4px;
        top: -1px; 
    }
    QTabBar::tab {
        background: #2d2d30;
        border: 1px solid #3e3e42;
        border-bottom: none;
        border-top-left-radius: 4px;
        border-top-right-radius: 4px;
        padding: 6px 12px;
        margin-right: 2px;
        color: #858585;
    }
    QTabBar::tab:selected {
        background: #1e1e1e;
        border-bottom: 1px solid #1e1e1e; 
        color: #d4d4d4;
        font-weight: bold;
    }
    QTabBar::tab:hover:!selected {
        background: #3e3e42;
        color: #d4d4d4;
    }

    /* --- GroupBox --- */
    QGroupBox {
        border: 1px solid #3e3e42;
        border-radius: 4px;
        margin-top: 20px;
        font-weight: bold;
    }
    QGroupBox::title {
        subcontrol-origin: margin;
        subcontrol-position: top left;
        padding: 0 5px;
        left: 10px;
    }

    /* --- Splitter --- */
    QSplitter::handle {
        background-color: #3e3e42;
    }
    QSplitter::handle:hover {
        background-color: #007acc;
    }
    
    /* --- Tooltips --- */
    QToolTip {
        background-color: #252526;
        color: #d4d4d4;
        border: 1px solid #3e3e42;
        padding: 4px;
    }
    
    /* --- Custom Card (for Launcher) --- */
    #card {
        background-color: #252526;
        border: 1px solid #3e3e42;
        border-radius: 8px;
    }
    #card:hover {
        border: 1px solid #007acc;
        background-color: #2d2d30;
    }
    #pinBadge { color: #FFD166; font-size: 13pt; margin-right: 2px; }

    /* Icon button inside a card */
    QFrame#card QToolButton {
        padding: 0px; margin: 0px; border: none; border-radius: 12px;
        background: transparent;
    }
    QFrame#card QToolButton:hover  { background: rgba(255,255,255,0.07); }
    QFrame#card QToolButton:pressed{ background: rgba(42,130,218,0.35); }

    /* Text inside cards */
    QFrame#card QLabel { color: #eaeaea; }

    /* Scroll/status */
    QScrollArea { border: none; background: transparent; }
    QStatusBar { background: #252526; border-top: 1px solid #3e3e42; color: #d4d4d4; }
    """
    app.setStyleSheet(qss)
