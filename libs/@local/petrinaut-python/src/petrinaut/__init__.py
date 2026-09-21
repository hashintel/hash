"""Python bindings for the Petrinaut CLI.

Run simulations and drive optimization studies against a compiled Petrinaut
model from Python, over the CLI's JSON-lines stdio protocol.

A session is a client for one `petrinaut serve` child process that the session
itself owns: it spawns the child for one model (or one optimization manifest),
serializes requests to it, and shuts it down. "Session" rather than "client"
because the object carries that lifecycle, not just the wire format.

Constraints a study carries are readable without a session: `parse_constraint`
turns the protocol's `{code, hir}` pairs into callables that evaluate the HIR
here, as a boolean, a signed margin, or a pydantic validator.

@layerRoot python-bindings
@role Python sessions owning one CLI process each, translating protocol frames into methods and exceptions
"""

from .constraint import (
    Constraint,
    ConstraintViolation,
    ParameterConstraint,
    StateConstraint,
    parse_constraint,
    parse_constraints,
    violations,
)
from .errors import (
    PetrinautClientError,
    PetrinautProtocolError,
    PetrinautRunError,
)
from .hir import HirEvaluationError, evaluate_hir, hir_margin
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
from .symbolic import NotSymbolicError, SymbolicConstraint

__all__ = [
    "Constraint",
    "ConstraintViolation",
    "HirEvaluationError",
    "NotSymbolicError",
    "OptimizationBooleanParameter",
    "OptimizationDescribeResult",
    "OptimizationEvaluateResult",
    "OptimizationFloatParameter",
    "OptimizationIntParameter",
    "OptimizationReplicate",
    "OptimizationSession",
    "ParameterConstraint",
    "PetrinautClientError",
    "PetrinautProtocolError",
    "PetrinautRunError",
    "PetrinautSession",
    "StateConstraint",
    "SymbolicConstraint",
    "evaluate_hir",
    "hir_margin",
    "parse_constraint",
    "parse_constraints",
    "violations",
]
