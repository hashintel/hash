"""Python bindings for the Petrinaut CLI.

Run simulations and drive optimization studies against a compiled Petrinaut
model from Python, over the CLI's JSON-lines stdio protocol.
"""

from .errors import (
    PetrinautClientError,
    PetrinautProtocolError,
    PetrinautRunError,
)
from .optimization import OptimizationSession
from .session import PetrinautSession

__all__ = [
    "OptimizationSession",
    "PetrinautClientError",
    "PetrinautProtocolError",
    "PetrinautRunError",
    "PetrinautSession",
]
