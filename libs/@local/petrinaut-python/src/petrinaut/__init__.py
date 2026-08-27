"""Python bindings for the Petrinaut CLI.

Run simulations and drive optimization studies against a compiled Petrinaut
model from Python, over the CLI's JSON-lines stdio protocol.

A session is a client for one `petrinaut serve` child process that the session
itself owns: it spawns the child for one model (or one optimization manifest),
serializes requests to it, and shuts it down. "Session" rather than "client"
because the object carries that lifecycle, not just the wire format.

@layerRoot python-bindings
@role Python sessions owning one CLI process each, translating protocol frames into methods and exceptions
"""

from .errors import (
    PetrinautClientError,
    PetrinautProtocolError,
    PetrinautRunError,
)
from .hir import Constraint, HirEvaluationError, evaluate_hir
from .models import (
    OptimizationBooleanParameter,
    OptimizationConstraint,
    OptimizationConstraints,
    OptimizationDescribeResult,
    OptimizationEvaluateResult,
    OptimizationFloatParameter,
    OptimizationIntParameter,
    OptimizationReplicate,
)
from .optimization import OptimizationSession
from .session import PetrinautSession

__all__ = [
    "Constraint",
    "HirEvaluationError",
    "OptimizationBooleanParameter",
    "OptimizationConstraint",
    "OptimizationConstraints",
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
    "evaluate_hir",
]
