"""A parameter constraint as a SymPy relation, for the things evaluation
cannot do: solve for the feasible interval of one parameter, simplify a
compound condition, or hand the feasible region to a symbolic tool.

Only the arithmetic subset translates: numbers, the scenario and net
parameters (one real symbol each, named as authored), the ``Math`` functions
with a symbolic counterpart, comparisons, ``&&``/``||``/``!``, ternaries, and
``const`` bindings by substitution. Arrays, records, strings, ``range()``,
and ``Math.random`` raise :class:`NotSymbolicError`; state constraints are
never symbolic.

Booleans and numbers are kept apart the way SymPy needs them: a ternary
whose arms are conditions becomes ``ITE``, one whose arms are numbers
becomes ``Piecewise``, and ``==``/``!=`` over conditions become
``Equivalent``/``Xor``. Arithmetic follows ECMAScript where SymPy's default
differs: ``%`` is the truncated remainder (the dividend's sign) and
``Math.cbrt`` is the real cube root.

The translation is exact mathematics over the reals. It does not carry
ECMAScript's floating-point edges (NaN, signed zero, overflow), and a
comparison at an exact boundary of ``Math.log10``/``Math.log2`` may need
``simplify`` or ``nsimplify`` before SymPy decides it; ask the evaluator when
those matter.

SymPy is an optional dependency: ``petrinaut-python[sympy]``.
"""

# pyright: reportMissingTypeStubs=false, reportUnknownMemberType=false
# pyright: reportUnknownVariableType=false, reportUnknownArgumentType=false
# SymPy ships no type information; every value it hands back is Any.
from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from . import models as m
from .hir import HirExpr

__all__ = ["NotSymbolicError", "SymbolicConstraint", "to_sympy"]

_BOOLEAN_BINARY_OPS = frozenset({"<", "<=", ">", ">=", "==", "!=", "&&", "||"})


class NotSymbolicError(ValueError):
    """The constraint reads something SymPy cannot represent."""


@dataclass(frozen=True)
class SymbolicConstraint:
    """A SymPy relation plus the symbols it was built over."""

    expression: Any
    """A SymPy ``Boolean`` (a relation, or ``And``/``Or``/``Not`` of them)."""
    scenario: dict[str, Any] = field(default_factory=dict)
    """Scenario parameter identifier → ``Symbol``."""
    parameters: dict[str, Any] = field(default_factory=dict)
    """Net parameter name → ``Symbol``."""

    @property
    def symbols(self) -> list[Any]:
        """Every symbol, scenario parameters first, in first-use order."""
        return [*self.scenario.values(), *self.parameters.values()]


def to_sympy(constraint: m.ParameterConstraint) -> SymbolicConstraint:
    """Translate one parameter constraint. Raises :class:`ImportError` when
    SymPy is not installed and :class:`NotSymbolicError` when the condition
    leaves the arithmetic subset."""
    try:
        import sympy
    except ImportError as error:  # pragma: no cover - exercised without the extra
        raise ImportError(
            "SymPy is not installed; install the `sympy` extra of petrinaut-python"
        ) from error
    translator = _Translator(sympy)
    expression = translator.expr(constraint.hir.body)
    return SymbolicConstraint(expression, translator.scenario, translator.parameters)


class _Translator:
    def __init__(self, sympy: Any) -> None:
        self.sympy = sympy
        self.scenario: dict[str, Any] = {}
        self.parameters: dict[str, Any] = {}
        self.locals: dict[str, Any] = {}
        #: Names of ``const`` bindings whose value is a condition.
        self.boolean_locals: set[str] = set()
        sp = sympy

        def hypot(*args: Any) -> Any:
            return sp.sqrt(sum(argument**2 for argument in args))

        def log10(value: Any) -> Any:
            return sp.log(value, 10)

        def log2(value: Any) -> Any:
            return sp.log(value, 2)

        def js_round(value: Any) -> Any:
            # ECMAScript Math.round is floor(x + 1/2) over the reals.
            return sp.floor(value + sp.Rational(1, 2))

        def cbrt(value: Any) -> Any:
            # The real cube root; sp.cbrt is the principal complex root.
            return sp.real_root(value, 3)

        self.math_fns: dict[str, Callable[..., Any]] = {
            "abs": sp.Abs,
            "acos": sp.acos,
            "asin": sp.asin,
            "atan": sp.atan,
            "atan2": sp.atan2,
            "cbrt": cbrt,
            "ceil": sp.ceiling,
            "cos": sp.cos,
            "cosh": sp.cosh,
            "exp": sp.exp,
            "floor": sp.floor,
            "hypot": hypot,
            "log": sp.log,
            "log10": log10,
            "log2": log2,
            "max": sp.Max,
            "min": sp.Min,
            "pow": sp.Pow,
            "round": js_round,
            "sign": sp.sign,
            "sin": sp.sin,
            "sinh": sp.sinh,
            "sqrt": sp.sqrt,
            "tan": sp.tan,
            "tanh": sp.tanh,
            "trunc": self._trunc,
        }

    def _trunc(self, value: Any) -> Any:
        sp = self.sympy
        return sp.sign(value) * sp.floor(sp.Abs(value))

    def _symbol(self, table: dict[str, Any], other: dict[str, Any], name: str) -> Any:
        if name not in table:
            if name in other:
                raise NotSymbolicError(
                    f'"{name}" names both a scenario parameter and a net parameter'
                )
            table[name] = self.sympy.Symbol(name, real=True)
        return table[name]

    def _number(self, value: float) -> Any:
        sp = self.sympy
        if math.isnan(value):
            return sp.nan
        if math.isinf(value):
            return sp.oo if value > 0 else -sp.oo
        if value == int(value):
            return sp.Integer(int(value))
        return sp.Float(value)

    def is_boolean(self, node: HirExpr) -> bool:
        """Whether the node is a condition rather than a number, read off the
        structure: HIR carries no types, and a bare parameter reads as a
        number unless the other side of an operator says otherwise."""
        match node:
            case m.HirBoolLit():
                return True
            case m.HirBinary():
                return node.op.value in _BOOLEAN_BINARY_OPS
            case m.HirUnary():
                return node.op.value == "!"
            case m.HirCond():
                return self.is_boolean(node.thenBranch) or self.is_boolean(
                    node.elseBranch
                )
            case m.HirLet():
                return self.is_boolean(node.body)
            case m.HirLocalRef():
                return node.name in self.boolean_locals
            case _:
                return False

    def expr(self, node: HirExpr) -> Any:
        sp = self.sympy
        match node:
            case m.HirNumberLit():
                return self._number(node.value)
            case m.HirBoolLit():
                return sp.true if node.value else sp.false
            case m.HirConstant():
                return {
                    "PI": sp.pi,
                    "E": sp.E,
                    "Infinity": sp.oo,
                    "NaN": sp.nan,
                }[node.name.value]
            case m.HirScenarioRef():
                return self._symbol(self.scenario, self.parameters, node.name)
            case m.HirParamRef():
                return self._symbol(self.parameters, self.scenario, node.name)
            case m.HirLocalRef():
                if node.name not in self.locals:
                    raise NotSymbolicError(f'Unbound local "{node.name}"')
                return self.locals[node.name]
            case m.HirUnary():
                operand = self.expr(node.operand)
                op = node.op.value
                if op == "!":
                    return self._logic(sp.Not, operand)
                return -operand if op == "-" else operand
            case m.HirBinary():
                return self._binary(node)
            case m.HirCond():
                condition = self.expr(node.condition)
                then_branch = self.expr(node.thenBranch)
                else_branch = self.expr(node.elseBranch)
                if self.is_boolean(node):
                    # A condition-valued ternary must stay a Boolean: a
                    # Piecewise in a condition position is rewritten by SymPy
                    # and loses its own condition.
                    return self._logic(sp.ITE, condition, then_branch, else_branch)
                return sp.Piecewise((then_branch, condition), (else_branch, True))
            case m.HirLet():
                saved_locals = dict(self.locals)
                saved_booleans = set(self.boolean_locals)
                try:
                    for binding in node.bindings:
                        self.locals[binding.name] = self.expr(binding.value)
                        if self.is_boolean(binding.value):
                            self.boolean_locals.add(binding.name)
                        else:
                            self.boolean_locals.discard(binding.name)
                    return self.expr(node.body)
                finally:
                    self.locals = saved_locals
                    self.boolean_locals = saved_booleans
            case m.HirMathCall():
                fn = node.fn.value
                if fn not in self.math_fns:
                    raise NotSymbolicError(f"Math.{fn}() has no symbolic form")
                return self.math_fns[fn](
                    *(self.expr(argument) for argument in node.args)
                )
            case _:
                raise NotSymbolicError(
                    f'HIR node kind "{node.kind}" has no symbolic form'
                )

    def _condition(self, expression: Any) -> Any:
        """A relation as a Boolean SymPy can put in a condition position. A
        Piecewise operand folds into a Piecewise of relations, which SymPy
        rewrites lossily under a condition, so it becomes a chain of ITEs;
        an arm-less remainder reads as false."""
        sp = self.sympy
        folded = sp.piecewise_fold(expression)
        if not isinstance(folded, sp.Piecewise):
            return folded
        result: Any = None
        for arm_expression, arm_condition in reversed(folded.args):
            if result is None:
                result = (
                    arm_expression
                    if arm_condition == sp.true
                    else sp.ITE(arm_condition, arm_expression, sp.false)
                )
            else:
                result = sp.ITE(arm_condition, arm_expression, result)
        return result

    def _logic(self, connective: Any, *operands: Any) -> Any:
        """Apply a Boolean connective; SymPy's TypeError for a non-Boolean
        operand is the subset's boundary, so it is reported as such."""
        try:
            return connective(*operands)
        except TypeError as error:
            raise NotSymbolicError(str(error)) from error

    def _binary(self, node: m.HirBinary) -> Any:
        sp = self.sympy
        left = self.expr(node.left)
        right = self.expr(node.right)
        op = node.op.value
        if op == "&&":
            return self._logic(sp.And, left, right)
        if op == "||":
            return self._logic(sp.Or, left, right)
        if op == "+":
            return left + right
        if op == "-":
            return left - right
        if op == "*":
            return left * right
        if op == "/":
            return left / right
        if op == "%":
            # ECMAScript remainder takes the dividend's sign; sp.Mod takes
            # the divisor's. The truncated remainder is p - q * trunc(p / q).
            return left - right * self._trunc(left / right)
        if op == "**":
            return sp.Pow(left, right)
        if op in ("==", "!="):
            if self.is_boolean(node.left) or self.is_boolean(node.right):
                connective = sp.Equivalent if op == "==" else sp.Xor
                return self._logic(connective, left, right)
            return self._condition(
                sp.Eq(left, right) if op == "==" else sp.Ne(left, right)
            )
        relation = {"<": sp.Lt, "<=": sp.Le, ">": sp.Gt, ">=": sp.Ge}[op]
        return self._condition(relation(left, right))
