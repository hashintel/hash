"""Constraints as callables. A constraint is a boolean condition authored in
Petrinaut and carried as ``{code, hir}``; it comes in two shapes, told apart
by ``space``:

- :class:`ParameterConstraint` ranges over the parameter space and is
  called with a ``scenario`` mapping (plus the net ``parameters``). It can
  be checked before anything runs, so it doubles as a validator.
- :class:`StateConstraint` ranges over the simulation state and is called
  with a ``state`` record (plus the net ``parameters``).

Both are pydantic models: parsing one validates the whole HIR tree node by
node, and both expose the same four readings of a condition — the boolean
(:meth:`__call__`), the signed margin (:meth:`margin`, ``>= 0`` iff
satisfied), the violation Optuna-style constrained samplers consume
(:meth:`violation`, ``<= 0`` iff satisfied), and a check that raises
(:meth:`check`). :meth:`validator` packages the check for pydantic's
``AfterValidator``. A parameter constraint can also be read symbolically
through :meth:`ParameterConstraint.to_sympy`.

>>> constraint = parse_constraint(described.constraints[0])
>>> constraint(scenario={"min_load": 2, "max_load": 8})
True
>>> constraint.margin(scenario={"min_load": 2, "max_load": 8})
6.0
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from typing import TYPE_CHECKING, Annotated, Any, TypeAlias

from pydantic import Field, TypeAdapter

from . import models as m
from .hir import HirEvaluationError, Scalar, Value, evaluate_hir, hir_margin

if TYPE_CHECKING:
    from .symbolic import SymbolicConstraint

__all__ = [
    "Constraint",
    "ConstraintViolation",
    "ParameterConstraint",
    "StateConstraint",
    "parse_constraint",
    "parse_constraints",
    "violations",
]


class ConstraintViolation(ValueError):
    """A constraint check failed. ``margin`` says by how much (negative)."""

    def __init__(
        self, constraint: ParameterConstraint | StateConstraint, margin: float
    ) -> None:
        self.constraint = constraint
        self.margin = margin
        label = constraint.name or constraint.id
        super().__init__(
            f'Constraint "{label}" is violated (margin {margin:g}): {constraint.code}'
        )


def _as_bool(
    constraint: m.ParameterConstraint | m.StateConstraint, value: Value
) -> bool:
    if not isinstance(value, bool):
        raise HirEvaluationError(
            f'Constraint "{constraint.id}" produced a {type(value).__name__}, expected a boolean'
        )
    return value


class ParameterConstraint(m.ParameterConstraint):
    """One boolean condition over the parameter space: an expression over
    ``scenario.*`` and ``parameters.*``, checkable before a run starts."""

    def __call__(
        self,
        scenario: Mapping[str, Scalar],
        parameters: Mapping[str, Scalar] | None = None,
    ) -> bool:
        """Whether the constraint holds for these parameter values."""
        return _as_bool(
            self, evaluate_hir(self.hir, scenario=scenario, parameters=parameters)
        )

    def margin(
        self,
        scenario: Mapping[str, Scalar],
        parameters: Mapping[str, Scalar] | None = None,
    ) -> float:
        """Signed robustness margin: ``>= 0`` iff satisfied, its magnitude
        the distance to the boundary."""
        return hir_margin(self.hir, scenario=scenario, parameters=parameters)

    def violation(
        self,
        scenario: Mapping[str, Scalar],
        parameters: Mapping[str, Scalar] | None = None,
    ) -> float:
        """``-margin``: ``<= 0`` iff satisfied, the sign convention of
        Optuna's ``constraints_func``."""
        return -self.margin(scenario, parameters)

    def check(
        self,
        scenario: Mapping[str, Scalar],
        parameters: Mapping[str, Scalar] | None = None,
    ) -> None:
        """Raise :class:`ConstraintViolation` unless the constraint holds."""
        margin = self.margin(scenario, parameters)
        if margin < 0:
            raise ConstraintViolation(self, margin)

    def validator(
        self, parameters: Mapping[str, Scalar] | None = None
    ) -> Callable[[Mapping[str, Scalar]], Mapping[str, Scalar]]:
        """The check as a pydantic ``AfterValidator`` body: returns the
        scenario mapping when the constraint holds, raises otherwise (a
        :class:`ConstraintViolation`, which pydantic reports as a
        validation error).

        >>> Scenario = Annotated[dict[str, float], AfterValidator(constraint.validator())]
        """

        def validate(scenario: Mapping[str, Scalar]) -> Mapping[str, Scalar]:
            self.check(scenario, parameters)
            return scenario

        return validate

    def to_sympy(self) -> SymbolicConstraint:
        """The condition as a SymPy relation over one symbol per parameter.
        Needs the ``sympy`` extra; raises :class:`~petrinaut.symbolic.NotSymbolicError`
        when the condition reads something SymPy cannot represent."""
        from .symbolic import to_sympy

        return to_sympy(self)


class StateConstraint(m.StateConstraint):
    """One boolean condition over the simulation state, authored like a
    metric body and observed while a run goes."""

    def _locals(self, state: Mapping[str, Any]) -> dict[str, Value]:
        # The metric surface declares the state record as its first parameter.
        name = self.hir.params[0].name if self.hir.params else "state"
        return {name: dict(state)}

    def __call__(
        self,
        state: Mapping[str, Any],
        parameters: Mapping[str, Scalar] | None = None,
    ) -> bool:
        """Whether the constraint holds for this state record (places keyed
        by name, each with ``count`` and ``tokens``)."""
        return _as_bool(
            self,
            evaluate_hir(self.hir, parameters=parameters, locals_=self._locals(state)),
        )

    def margin(
        self,
        state: Mapping[str, Any],
        parameters: Mapping[str, Scalar] | None = None,
    ) -> float:
        """Signed robustness margin: ``>= 0`` iff satisfied."""
        return hir_margin(self.hir, parameters=parameters, locals_=self._locals(state))

    def violation(
        self,
        state: Mapping[str, Any],
        parameters: Mapping[str, Scalar] | None = None,
    ) -> float:
        """``-margin``: ``<= 0`` iff satisfied."""
        return -self.margin(state, parameters)

    def check(
        self,
        state: Mapping[str, Any],
        parameters: Mapping[str, Scalar] | None = None,
    ) -> None:
        """Raise :class:`ConstraintViolation` unless the constraint holds."""
        margin = self.margin(state, parameters)
        if margin < 0:
            raise ConstraintViolation(self, margin)

    def validator(
        self, parameters: Mapping[str, Scalar] | None = None
    ) -> Callable[[Mapping[str, Any]], Mapping[str, Any]]:
        """The check as a pydantic ``AfterValidator`` body over a state record."""

        def validate(state: Mapping[str, Any]) -> Mapping[str, Any]:
            self.check(state, parameters)
            return state

        return validate


Constraint: TypeAlias = ParameterConstraint | StateConstraint

_CONSTRAINT_ADAPTER: TypeAdapter[Constraint] = TypeAdapter(
    Annotated[ParameterConstraint | StateConstraint, Field(discriminator="space")]
)


def parse_constraint(
    data: Mapping[str, Any] | m.ParameterConstraint | m.StateConstraint,
) -> Constraint:
    """One constraint as a callable, from a protocol model or a mapping.
    Validation covers the whole HIR tree and raises
    :class:`pydantic.ValidationError` for anything outside the grammar."""
    if isinstance(data, (ParameterConstraint, StateConstraint)):
        return data
    if isinstance(data, (m.ParameterConstraint, m.StateConstraint)):
        data = data.model_dump()
    return _CONSTRAINT_ADAPTER.validate_python(data)


def parse_constraints(
    items: Iterable[Mapping[str, Any] | m.ParameterConstraint | m.StateConstraint]
    | None,
) -> list[Constraint]:
    """Every constraint of a describe result (or any list) as callables;
    ``None`` reads as no constraints."""
    return [parse_constraint(item) for item in items or ()]


def violations(
    constraints: Iterable[Constraint],
    *,
    scenario: Mapping[str, Scalar] | None = None,
    parameters: Mapping[str, Scalar] | None = None,
    state: Mapping[str, Any] | None = None,
) -> list[float]:
    """One signed violation per constraint, in order, ``<= 0`` iff
    satisfied: the sequence a constrained sampler consumes. Parameter
    constraints read ``scenario``; state constraints read ``state``, and
    asking for one without a state is an error rather than a skipped entry,
    so the sequence keeps one slot per constraint."""
    out: list[float] = []
    for constraint in constraints:
        if isinstance(constraint, ParameterConstraint):
            if scenario is None:
                raise ValueError(
                    f'Parameter constraint "{constraint.id}" needs a scenario'
                )
            out.append(constraint.violation(scenario, parameters))
        else:
            if state is None:
                raise ValueError(f'State constraint "{constraint.id}" needs a state')
            out.append(constraint.violation(state, parameters))
    return out
