"""Python bindings for the Petrinaut CLI.

Run simulations and drive optimization studies against a compiled Petrinaut
model from Python, over the CLI's JSON-lines stdio protocol.

@layerRoot python-bindings
@role Python sessions owning one CLI process each, translating protocol frames into methods and exceptions.
"""

from .errors import (
    PetrinautClientError,
    PetrinautProtocolError,
    PetrinautRunError,
)
from .models import (
    OptimizationBooleanParameter,
    OptimizationDescribeResult,
    OptimizationEvaluateResult,
    OptimizationFloatParameter,
    OptimizationIntParameter,
    OptimizationReplicate,
)
from .optimization import OptimizationSession
from .session import PetrinautSession

__all__ = [
    "OptimizationBooleanParameter",
    "OptimizationDescribeResult",
    "OptimizationEvaluateResult",
    "OptimizationFloatParameter",
    "OptimizationIntParameter",
    "OptimizationReplicate",
    "OptimizationSession",
    "PetrinautClientError",
    "PetrinautProtocolError",
    "PetrinautRunError",
    "PetrinautSession",
]
