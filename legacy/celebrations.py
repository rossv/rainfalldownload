"""Utilities for celebratory status messages in the GUIs."""

from __future__ import annotations

import random

__all__ = ["completion_art"]

_ASCII_ARTS = [
    "\n".join(
        [
            r" \o/  RUN COMPLETE!",
            "  |     High five!",
            " / " + "\\",
        ]
    ),
    "\n".join(
        [
            "   /\\/\\/\\  Woohoo!",
            " ( ^_^ )  All done!",
            "     \\/\\/",
        ]
    ),
    "\n".join(
        [
            "+--------------+",
            "| YOU DID IT |",
            "+--------------+",
            "    \\(^o^)/",
        ]
    ),
    "\n".join(
        [
            "* * * * * * * *",
            "*  RUN DONE  *",
            "* * * * * * * *",
            "      /\\_/\\   ",
            "      \\/  \\/   "
        ]
    ),
    "\n".join(
        [
            "=~=~=~=~=~=~=",
            "|   RUN SUCCESS!   |",
            "=~=~=~=~=~=~=",
            "    \\(^_^)/",
        ]
    ),
]


def completion_art() -> str:
    """Return a celebratory ASCII art message for successful runs."""

    return random.choice(_ASCII_ARTS)

