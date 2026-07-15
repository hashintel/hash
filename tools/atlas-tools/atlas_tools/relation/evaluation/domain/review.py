"""Define the shared action vocabulary for human placement review."""

from typing import Literal

type HumanPlacementAction = Literal[
    "coincident",
    "proximal",
    "overlay",
    "excluded",
]
