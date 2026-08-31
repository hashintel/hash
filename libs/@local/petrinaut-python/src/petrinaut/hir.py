"""Evaluation of serialized HIR expressions — Petrinaut's shared expression
representation (``hir/hir.ts`` in ``@hashintel/petrinaut-core`` owns the
grammar). The optimization protocol carries constraints as ``{code, hir}``
pairs; this module evaluates the ``hir`` side so Python consumers need no
TypeScript frontend.

Two evaluation modes:

- :func:`evaluate_hir` / :meth:`Constraint.__call__` — the expression's
  value; for a constraint, ``True`` means satisfied.
- :meth:`Constraint.margin` — a signed robustness margin (``>= 0`` means
  satisfied): comparisons yield signed slack, ``&&`` combines by ``min``,
  ``||`` by ``max``, ``!`` negates. This is the learnable signal constrained
  samplers (e.g. Optuna's ``constraints_func``, which expects violation
  ``<= 0`` — i.e. ``-margin``) consume. The same walk evaluated over
  intervals instead of scalars would bound a constraint over a whole
  parameter box; that extension is deliberately not implemented yet.

Unknown or non-deterministic node kinds (distributions, UUID generation)
raise :class:`HirEvaluationError` — evaluators must reject what they do not
know rather than guess.
"""

# pyright: reportUnknownArgumentType=false, reportUnknownLambdaType=false
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false
# The module is a walker over untyped JSON (the serialized HIR grammar is
# owned by TypeScript); values are dynamically checked at each node instead.
from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

from .models import OptimizationConstraint

__all__ = ["Constraint", "HirEvaluationError", "evaluate_hir"]

Scalar = float | int | bool

_MAX_RANGE_LENGTH = 1_000_000

#: Node kinds that cannot appear in a deterministic constraint.
_REJECTED_KINDS = frozenset(
    {"distribution", "distributionMap", "uuidGenerate", "uuidFrom"}
)


class HirEvaluationError(Exception):
    """A serialized HIR expression could not be evaluated."""


def _js_round(value: float) -> float:
    """ECMAScript ``Math.round``: half-up toward positive infinity (Python's
    ``round`` is banker's)."""
    if isinstance(value, float) and not math.isfinite(value):
        return value  # JS: round(±Infinity) is ±Infinity, round(NaN) is NaN
    return math.floor(value + 0.5)


def _js_sign(value: float) -> float:
    if value > 0:
        return 1
    if value < 0:
        return -1
    return value  # preserves 0 / -0 / NaN like JS


def _is_odd_integer(value: float) -> bool:
    return math.isfinite(value) and value == int(value) and int(value) % 2 == 1


def _js_pow(base: float, exponent: float) -> float:
    """ECMAScript exponentiation (``**`` and ``Math.pow``): IEEE-754 via
    ``math.pow``, never raising and never going complex, with the spec's
    deviations from C ``pow`` restored."""
    base = float(base)
    exponent = float(exponent)
    # JS: any NaN exponent, and ±Infinity exponents on a |base| of exactly
    # 1, yield NaN where C pow returns 1.
    if math.isnan(exponent) or (math.isinf(exponent) and abs(base) == 1):
        return math.nan
    try:
        return math.pow(base, exponent)
    except OverflowError:
        # Finite operands overflowing a double: ±Infinity, negative only
        # for a negative base raised to an odd integer.
        negative = base < 0 and _is_odd_integer(exponent)
        return -math.inf if negative else math.inf
    except ValueError:
        if base == 0 and exponent < 0:
            # JS: 0 ** negative is Infinity; -0 flips the sign through an
            # odd integer exponent.
            negative = math.copysign(1.0, base) < 0 and _is_odd_integer(exponent)
            return -math.inf if negative else math.inf
        # Negative base with a non-integer exponent, and other domain
        # errors: NaN in JS.
        return math.nan


def _js_log(fn: Any) -> Any:
    """JS ``Math.log`` family: 0 yields -Infinity and negatives yield NaN,
    where Python raises for both."""

    def wrapped(value: float) -> float:
        if value == 0:
            return -math.inf
        if value < 0:
            return math.nan
        return fn(value)  # type: ignore[no-any-return]

    return wrapped


def _js_grows(fn: Any, *, odd: bool) -> Any:
    """JS ``Math.exp``/``cosh``/``sinh``: a result too large for a double is
    ±Infinity, where Python raises OverflowError. ``odd`` functions take the
    argument's sign."""

    def wrapped(value: float) -> float:
        try:
            return fn(value)  # type: ignore[no-any-return]
        except OverflowError:
            return math.copysign(math.inf, value) if odd else math.inf

    return wrapped


def _js_integral(fn: Any) -> Any:
    """JS ``Math.ceil``/``floor``/``trunc`` pass non-finite values through,
    where Python raises."""

    def wrapped(value: float) -> float:
        if isinstance(value, float) and not math.isfinite(value):
            return value
        return fn(value)  # type: ignore[no-any-return]

    return wrapped


_MATH_FNS: dict[str, Any] = {
    "abs": abs,
    "acos": math.acos,
    "asin": math.asin,
    "atan": math.atan,
    "atan2": math.atan2,
    "cbrt": lambda x: math.copysign(abs(x) ** (1 / 3), x),
    "ceil": _js_integral(math.ceil),
    "cos": math.cos,
    "cosh": _js_grows(math.cosh, odd=False),
    "exp": _js_grows(math.exp, odd=False),
    "floor": _js_integral(math.floor),
    "hypot": math.hypot,
    "log": _js_log(math.log),
    "log10": _js_log(math.log10),
    "log2": _js_log(math.log2),
    "max": max,
    "min": min,
    "pow": _js_pow,
    "round": _js_round,
    "sign": _js_sign,
    "sin": math.sin,
    "sinh": _js_grows(math.sinh, odd=True),
    "sqrt": math.sqrt,
    "tan": math.tan,
    "tanh": math.tanh,
    "trunc": _js_integral(math.trunc),
}

_CONSTANTS = {
    "PI": math.pi,
    "E": math.e,
    "Infinity": math.inf,
    "NaN": math.nan,
}


def _strict_slack(slack: float) -> float:
    """A strict comparison is violated at the boundary, so its margin must
    go negative there: a zero slack becomes the smallest representable step
    below zero, keeping "margin >= 0 iff satisfied" exact for ``<``, ``>``
    and ``!=`` while staying negligible for any consumer of magnitudes."""
    if slack != 0.0:
        return slack
    return -math.ulp(1.0)


def _strict_equal(left: Any, right: Any) -> bool:
    """ECMAScript strict equality on the value kinds HIR produces: booleans
    never equal numbers (`1 === true` is false in JS, unlike Python)."""
    if isinstance(left, bool) != isinstance(right, bool):
        return False
    return left == right  # type: ignore[no-any-return]


def _range(args: list[float]) -> list[float]:
    """The scenario ``range(...)`` helper, matching the TypeScript
    implementation (Python-style bounds, fractional steps allowed)."""
    for argument in args:
        if not math.isfinite(argument):
            raise HirEvaluationError("range() arguments must be finite numbers.")
    start = args[0] if len(args) > 1 else 0
    end = args[1] if len(args) > 1 else args[0]
    step = args[2] if len(args) > 2 else 1
    if step == 0:
        raise HirEvaluationError("range() step must not be zero.")
    maximum_length = max(0, math.ceil((end - start) / step))
    if maximum_length > _MAX_RANGE_LENGTH:
        raise HirEvaluationError(
            f"range() would produce {maximum_length} elements, exceeding the "
            f"limit of {_MAX_RANGE_LENGTH}."
        )
    values: list[float] = []
    for i in range(maximum_length):
        value = start + i * step
        if value >= end if step > 0 else value <= end:
            break
        values.append(value)
    return values


class _Evaluator:
    def __init__(
        self,
        scenario: Mapping[str, Scalar],
        parameters: Mapping[str, Scalar],
        locals_: dict[str, Any],
    ) -> None:
        self.scenario = scenario
        self.parameters = parameters
        self.locals = locals_

    def eval(self, node: Mapping[str, Any]) -> Any:
        kind = node.get("kind")
        if not isinstance(kind, str):
            raise HirEvaluationError(f"Malformed HIR node: {node!r}")
        if kind in _REJECTED_KINDS:
            raise HirEvaluationError(
                f'HIR node kind "{kind}" is not evaluable in a constraint'
            )
        if kind in ("numberLit", "boolLit", "stringLit"):
            return node["value"]
        if kind == "constant":
            return _CONSTANTS[node["name"]]
        if kind == "localRef":
            name = node["name"]
            if name not in self.locals:
                raise HirEvaluationError(f'Unbound local "{name}"')
            return self.locals[name]
        if kind == "paramRef":
            name = node["name"]
            if name not in self.parameters:
                raise HirEvaluationError(f'Unknown net parameter "{name}"')
            return self.parameters[name]
        if kind == "scenarioRef":
            name = node["name"]
            if name not in self.scenario:
                raise HirEvaluationError(f'Unknown scenario parameter "{name}"')
            return self.scenario[name]
        if kind == "rangeCall":
            return _range([float(self.eval(argument)) for argument in node["args"]])
        if kind == "fieldAccess":
            target = self.eval(node["target"])
            field = node["field"]
            if not isinstance(target, Mapping) or field not in target:
                raise HirEvaluationError(f'No field "{field}" on {target!r}')
            return target[field]
        if kind == "indexAccess":
            target = self.eval(node["target"])
            index = int(self.eval(node["index"]))
            if not isinstance(target, list) or not 0 <= index < len(target):
                raise HirEvaluationError(f"Index {index} out of range")
            return target[index]
        if kind == "length":
            target = self.eval(node["target"])
            if not isinstance(target, (list, str)):
                raise HirEvaluationError(
                    ".length target is not an array or string"
                )
            return len(target)
        if kind == "stringCall":
            target = self.eval(node["target"])
            argument = self.eval(node["argument"])
            if not isinstance(target, str) or not isinstance(argument, str):
                raise HirEvaluationError(
                    f".{node['fn']}(...) is only available on strings"
                )
            fn = node["fn"]
            if fn == "startsWith":
                return target.startswith(argument)
            if fn == "endsWith":
                return target.endswith(argument)
            if fn == "includes":
                return argument in target
            raise HirEvaluationError(f"unsupported string method {fn!r}")
        if kind == "unary":
            operand = self.eval(node["operand"])
            op = node["op"]
            if op == "-":
                return -operand
            if op == "+":
                return +operand
            return not operand
        if kind == "binary":
            return self._binary(node)
        if kind == "cond":
            taken = (
                node["thenBranch"]
                if self.eval(node["condition"])
                else node["elseBranch"]
            )
            return self.eval(taken)
        if kind == "let":
            saved = dict(self.locals)
            try:
                for binding in node["bindings"]:
                    self.locals[binding["name"]] = self.eval(binding["value"])
                return self.eval(node["body"])
            finally:
                self.locals = saved
        if kind == "mathCall":
            fn = node["fn"]
            if fn == "random":
                raise HirEvaluationError(
                    "Math.random() is not evaluable in a constraint"
                )
            args = [self.eval(argument) for argument in node["args"]]
            try:
                return _MATH_FNS[fn](*args)
            except (ValueError, OverflowError):
                return math.nan
        if kind == "recordLit":
            return {
                entry["key"]: self.eval(entry["value"]) for entry in node["entries"]
            }
        if kind == "arrayLit":
            return [self.eval(element) for element in node["elements"]]
        if kind == "arrayMap":
            return self._array_map(node)
        if kind == "arrayReduce":
            return self._array_reduce(node)
        if kind == "arrayConcat":
            left = self.eval(node["left"])
            right = self.eval(node["right"])
            if not isinstance(left, list) or not isinstance(right, list):
                raise HirEvaluationError(".concat operands must be arrays")
            return [*left, *right]
        raise HirEvaluationError(f'Unknown HIR node kind "{kind}"')

    def _binary(self, node: Mapping[str, Any]) -> Any:
        op = node["op"]
        left = self.eval(node["left"])
        if op == "&&":
            return self.eval(node["right"]) if left else left
        if op == "||":
            return left if left else self.eval(node["right"])
        right = self.eval(node["right"])
        if op == "==":
            return _strict_equal(left, right)
        if op == "!=":
            return not _strict_equal(left, right)
        if op == "+":
            return left + right
        if op == "-":
            return left - right
        if op == "*":
            return left * right
        if op == "/":
            if right == 0:
                # ECMAScript division never raises.
                if left == 0:
                    return math.nan
                return math.copysign(math.inf, left) * math.copysign(1, right)
            return left / right
        if op == "%":
            if right == 0:
                return math.nan
            # ECMAScript remainder takes the dividend's sign (math.fmod).
            return math.fmod(left, right)
        if op == "**":
            # Through the JS-faithful pow: Python's `**` raises on overflow
            # and 0**negative, and goes complex for a negative base with a
            # fractional exponent, where JS yields ±Infinity / NaN.
            return _js_pow(left, right)
        if op == "<":
            return left < right
        if op == "<=":
            return left <= right
        if op == ">":
            return left > right
        if op == ">=":
            return left >= right
        raise HirEvaluationError(f'Unknown binary operator "{op}"')

    def _array_map(self, node: Mapping[str, Any]) -> list[Any]:
        target = self.eval(node["target"])
        if not isinstance(target, list):
            raise HirEvaluationError(".map target is not an array")
        param = node["param"]["name"]
        index_param = (node.get("indexParam") or {}).get("name")
        out: list[Any] = []
        saved = dict(self.locals)
        try:
            for index, element in enumerate(target):
                self.locals[param] = element
                if index_param is not None:
                    self.locals[index_param] = index
                out.append(self.eval(node["body"]))
        finally:
            self.locals = saved
        return out

    def _array_reduce(self, node: Mapping[str, Any]) -> Any:
        target = self.eval(node["target"])
        if not isinstance(target, list):
            raise HirEvaluationError(".reduce target is not an array")
        accumulator = self.eval(node["initial"])
        acc_param = node["accParam"]["name"]
        param = node["param"]["name"]
        index_param = (node.get("indexParam") or {}).get("name")
        saved = dict(self.locals)
        try:
            for index, element in enumerate(target):
                self.locals[acc_param] = accumulator
                self.locals[param] = element
                if index_param is not None:
                    self.locals[index_param] = index
                accumulator = self.eval(node["body"])
        finally:
            self.locals = saved
        return accumulator

    # -- Signed margins ----------------------------------------------------

    def margin(self, node: Mapping[str, Any]) -> float:
        """Robustness of a boolean expression: ``>= 0`` iff it evaluates to
        ``True``, with magnitude measuring the distance to the boundary.
        Comparisons yield signed slack; ``&&`` = ``min``, ``||`` = ``max``,
        ``!`` negates; a plain boolean is ``±inf`` (no boundary to measure)."""
        kind = node.get("kind")
        if kind == "binary":
            op = node["op"]
            if op == "&&":
                return min(self.margin(node["left"]), self.margin(node["right"]))
            if op == "||":
                return max(self.margin(node["left"]), self.margin(node["right"]))
            if op in ("<", "<="):
                slack = float(self.eval(node["right"])) - float(
                    self.eval(node["left"])
                )
                return slack if op == "<=" else _strict_slack(slack)
            if op in (">", ">="):
                slack = float(self.eval(node["left"])) - float(
                    self.eval(node["right"])
                )
                return slack if op == ">=" else _strict_slack(slack)
            if op == "==":
                left, right = self.eval(node["left"]), self.eval(node["right"])
                if isinstance(left, bool) or isinstance(right, bool):
                    return math.inf if _strict_equal(left, right) else -math.inf
                return -abs(float(left) - float(right))
            if op == "!=":
                left, right = self.eval(node["left"]), self.eval(node["right"])
                if isinstance(left, bool) or isinstance(right, bool):
                    return math.inf if not _strict_equal(left, right) else -math.inf
                return _strict_slack(abs(float(left) - float(right)))
        if kind == "unary" and node["op"] == "!":
            return -self.margin(node["operand"])
        if kind == "cond":
            taken = (
                node["thenBranch"]
                if self.eval(node["condition"])
                else node["elseBranch"]
            )
            return self.margin(taken)
        if kind == "let":
            saved = dict(self.locals)
            try:
                for binding in node["bindings"]:
                    self.locals[binding["name"]] = self.eval(binding["value"])
                return self.margin(node["body"])
            finally:
                self.locals = saved
        # A boolean leaf (literal, parameter, field): no boundary to measure.
        value = self.eval(node)
        if not isinstance(value, bool):
            raise HirEvaluationError(
                f"margin() requires a boolean expression, got a {type(value).__name__}"
            )
        return math.inf if value else -math.inf


def _function_body(fn: Mapping[str, Any]) -> Mapping[str, Any]:
    if fn.get("hirVersion") != 1:
        raise HirEvaluationError(
            f"Unsupported HIR version {fn.get('hirVersion')!r} (expected 1)"
        )
    body = fn.get("body")
    if not isinstance(body, Mapping):
        raise HirEvaluationError("HIR function has no body")
    return body


def evaluate_hir(
    fn: Mapping[str, Any],
    *,
    scenario: Mapping[str, Scalar] | None = None,
    parameters: Mapping[str, Scalar] | None = None,
    locals_: Mapping[str, Any] | None = None,
) -> Any:
    """Evaluate one serialized HIR function body.

    ``scenario`` binds ``scenario.<name>`` reads, ``parameters`` binds
    ``parameters.<name>`` reads, ``locals_`` binds the function's declared
    parameters (e.g. a metric-surface ``state`` record, as plain dicts and
    lists).
    """
    body = _function_body(fn)
    return _Evaluator(scenario or {}, parameters or {}, dict(locals_ or {})).eval(body)


class Constraint:
    """One optimization constraint, usable as a plain function.

    >>> constraint = Constraint(described.constraints.parameterSpace[0])
    >>> constraint(scenario={"min_load": 2, "max_load": 8})
    True
    >>> constraint.margin(scenario={"min_load": 2, "max_load": 8})
    6.0
    """

    def __init__(self, constraint: OptimizationConstraint | Mapping[str, Any]) -> None:
        if isinstance(constraint, OptimizationConstraint):
            data = constraint.model_dump()
        else:
            data = dict(constraint)
        self.id: str = data["id"]
        self.name: str | None = data.get("name")
        self.code: str = data["code"]
        self.hir: Mapping[str, Any] = data["hir"]

    def __call__(
        self,
        scenario: Mapping[str, Scalar] | None = None,
        parameters: Mapping[str, Scalar] | None = None,
        state: Mapping[str, Any] | None = None,
    ) -> bool:
        """Whether the constraint is satisfied. ``state`` binds a
        metric-surface state-space constraint's ``state`` parameter."""
        locals_: dict[str, Any] = {}
        if state is not None:
            params = self.hir.get("params") or []
            state_name = params[0]["name"] if params else "state"
            locals_[state_name] = state
        value = evaluate_hir(
            self.hir, scenario=scenario, parameters=parameters, locals_=locals_
        )
        if not isinstance(value, bool):
            raise HirEvaluationError(
                f'Constraint "{self.id}" produced a {type(value).__name__}, '
                "expected a boolean"
            )
        return value

    def margin(
        self,
        scenario: Mapping[str, Scalar] | None = None,
        parameters: Mapping[str, Scalar] | None = None,
        state: Mapping[str, Any] | None = None,
    ) -> float:
        """Signed robustness margin: ``>= 0`` iff satisfied. Feed ``-margin``
        to consumers that expect violation ``<= 0`` (Optuna's
        ``constraints_func``)."""
        locals_: dict[str, Any] = {}
        if state is not None:
            params = self.hir.get("params") or []
            state_name = params[0]["name"] if params else "state"
            locals_[state_name] = state
        body = _function_body(self.hir)
        return _Evaluator(scenario or {}, parameters or {}, locals_).margin(body)
