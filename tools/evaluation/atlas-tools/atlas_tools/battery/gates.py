"""Threshold gates and the hard no-structure-from-noise differential.

Gate config schema (version 1), embedded in the suite YAML::

    gates:
      - metric: knn_recall_15      # any metric column from results.parquet
        type: min                  # candidate mean across seeds >= value
        value: 0.15
        shapes: [clique_communities, ...]   # optional scope; default: all
      - metric: pendant_diffusion
        type: max                  # candidate mean across seeds <= value
        value: 0.6
        shapes: [bipartite_star]
      - metric: normalized_persistence
        type: baseline_margin      # candidate >= baseline - margin
        baseline: pca2d            # engine name that must be in the run
        margin: 0.5
        direction: higher          # optional; 'lower' flips to
                                   # candidate <= baseline + margin

``type`` discriminates the :data:`GateConfig` union (:class:`MinGate`, :class:`MaxGate`,
:class:`BaselineMarginGate`); the union itself is the dispatch mechanism. Cross-field
consistency with the suite (every gate shape is a suite shape, every gated knn k is a computed
``knn_ks`` entry) is enforced by the ``Suite`` model at load time.

Semantics:

- Gate values aggregate the with-edges variant as the *mean across seed reruns* per (engine,
  shape). The per-metric spread (max - min across seeds) is the rerun-noise floor; it annotates
  every gate outcome and every comparative number in the report.
- A gated metric that is unavailable on a gated shape (value None/NaN) fails that gate outcome:
  the battery fails closed rather than skipping.
- ``baseline_margin`` fails closed when the baseline engine is not part of the run.
- An engine passes overall exactly when every applicable gate outcome passes and the noise
  differential passes.

No-structure-from-noise differential (hard, always on):

On every ``noise_edges`` dataset in the suite, an engine configuration that uses edges may not
improve community separation (silhouette) or merge-tree normalized persistence beyond the
rerun-noise floor relative to the same engine with edges disabled. Rules per engine:

- A command that never references ``{edges}`` passes trivially: the engine cannot manufacture
  structure from edges it never sees.
- A command that references ``{edges}`` without defining ``command_no_edges`` fails as "not
  evaluable"; the differential fails closed.
- Otherwise ``mean_with_edges <= mean_no_edges + floor + eps`` must hold for silhouette and for
  normalized_persistence, where ``floor`` is the no-edges spread across seed reruns. This is a
  pass/fail verdict, not a reported number.

``gates.json`` is the JSON dump of :class:`GatesReport`.
"""

from abc import ABC
from collections.abc import Sequence
from typing import Annotated, Final, Literal, assert_never

import pandas as pd
from pydantic import BaseModel, ConfigDict, Field

from atlas_tools.battery.engine_runner import EngineSpec
from atlas_tools.battery.metrics import MetricId, MetricName, metric_column

NOISE_SHAPE: Final = "noise_edges"
NOISE_DIFFERENTIAL_METRICS: Final = (
    MetricName.silhouette,
    MetricName.normalized_persistence,
)
_EPS: Final = 1e-9

type Variant = Literal["edges", "no_edges"]
"""Run variant: the engine command as configured vs its edges-disabled twin."""


class AbstractGate(BaseModel, ABC):
    """Fields shared by every gate kind; unknown keys are rejected."""

    metric: MetricId
    # None = every suite shape. Membership in the suite's shapes is checked
    # by the Suite model at load time.
    shapes: list[str] | None = Field(default=None, min_length=1)

    model_config = ConfigDict(extra="forbid")


class MinGate(AbstractGate):
    """Candidate mean across seed reruns must be >= ``value``."""

    type: Literal["min"] = "min"
    value: float


class MaxGate(AbstractGate):
    """Candidate mean across seed reruns must be <= ``value``."""

    type: Literal["max"] = "max"
    value: float


class BaselineMarginGate(AbstractGate):
    """Candidate must stay within ``margin`` of a baseline engine's mean.

    With ``direction='higher'`` the candidate mean must satisfy ``candidate >= baseline -
    margin``, guarding against loss of structure relative to the baseline. With
    ``direction='lower'`` it must satisfy ``candidate <= baseline + margin``.
    """

    type: Literal["baseline_margin"] = "baseline_margin"
    baseline: str
    margin: float
    direction: Literal["higher", "lower"] = "higher"


type GateConfig = Annotated[
    MinGate | MaxGate | BaselineMarginGate,
    Field(discriminator="type"),
]
"""Discriminated union over the gate kinds; the union itself is the dispatch mechanism."""


class MetricStat(BaseModel):
    """A metric aggregated across seed reruns for one (engine, shape)."""

    mean: float
    # max - min across seed reruns: the rerun-noise floor.
    spread: float
    n_reruns: int


class GateOutcome(BaseModel):
    """One gate evaluated against one (engine, shape) cell."""

    gate: GateConfig
    engine: str
    shape: str
    # None = the gated metric produced no value on this shape (fail closed).
    observed: MetricStat | None
    # Baseline engine stats; only populated by baseline_margin gates.
    baseline: MetricStat | None = None
    passed: bool
    reason: str


class NoiseDifferentialCheck(BaseModel):
    """One (shape, metric) comparison of with-edges vs no-edges runs."""

    shape: str
    metric: MetricName
    with_edges: MetricStat | None
    no_edges: MetricStat | None
    passed: bool
    reason: str


class NoiseDifferential(BaseModel):
    """The hard no-structure-from-noise verdict for one engine."""

    passed: bool
    evaluated: bool
    reason: str
    checks: list[NoiseDifferentialCheck] = Field(default_factory=list)


class EngineGateReport(BaseModel):
    """All gate outcomes plus the noise differential for one engine."""

    passed: bool
    gates: list[GateOutcome]
    noise_differential: NoiseDifferential


class GatesReport(BaseModel):
    """The ``gates.json`` payload: per-engine pass/fail with reasons."""

    version: Literal[1] = 1
    engines: dict[str, EngineGateReport]


def _rerun_stat(
    frame: pd.DataFrame,
    engine: str,
    shape: str,
    column: str,
    variant: Variant = "edges",
) -> MetricStat | None:
    """Aggregate a metric's mean and rerun-noise spread across seed reruns; None when absent."""
    selection = frame[
        (frame["engine"] == engine)
        & (frame["shape"] == shape)
        & (frame["metric"] == column)
        & (frame["variant"] == variant)
    ]["value"].dropna()

    if len(selection) == 0:
        return None

    return MetricStat(
        mean=float(selection.mean()),
        spread=float(selection.max() - selection.min()),
        n_reruns=len(selection),
    )


def _evaluate_gate(
    frame: pd.DataFrame,
    gate: GateConfig,
    engine: str,
    shape: str,
    engine_names: set[str],
) -> GateOutcome:
    observed = _rerun_stat(frame, engine, shape, metric_column(gate.metric))

    def outcome(*, passed: bool, reason: str, baseline: MetricStat | None = None) -> GateOutcome:
        return GateOutcome(
            gate=gate,
            engine=engine,
            shape=shape,
            observed=observed,
            baseline=baseline,
            passed=passed,
            reason=reason,
        )

    if observed is None:
        return outcome(
            passed=False,
            reason="metric not available for this shape (fail closed)",
        )

    match gate:
        case MinGate(value=threshold):
            passed = observed.mean >= threshold
            comparator = ">=" if passed else "<"

            return outcome(
                passed=passed,
                reason=f"mean {observed.mean:.4f} (±{observed.spread:.4f}"
                f" rerun floor) {comparator} min {threshold}",
            )

        case MaxGate(value=threshold):
            passed = observed.mean <= threshold
            comparator = "<=" if passed else ">"

            return outcome(
                passed=passed,
                reason=f"mean {observed.mean:.4f} (±{observed.spread:.4f}"
                f" rerun floor) {comparator} max {threshold}",
            )

        case BaselineMarginGate(baseline=baseline_name, margin=margin, direction=direction):
            if baseline_name not in engine_names:
                return outcome(
                    passed=False,
                    reason=f"baseline engine {baseline_name!r} not in run (fail closed)",
                )

            baseline = _rerun_stat(frame, baseline_name, shape, metric_column(gate.metric))
            if baseline is None:
                return outcome(
                    passed=False,
                    reason=f"baseline {baseline_name!r} has no value for this shape (fail closed)",
                )

            if direction == "higher":
                passed = observed.mean >= baseline.mean - margin
                comparator = ">=" if passed else "<"
                margin_note = f"- margin {margin}"
            else:
                passed = observed.mean <= baseline.mean + margin
                comparator = "<=" if passed else ">"
                margin_note = f"+ margin {margin}"

            return outcome(
                passed=passed,
                baseline=baseline,
                reason=f"mean {observed.mean:.4f} (±{observed.spread:.4f})"
                f" {comparator} baseline {baseline.mean:.4f}"
                f" (±{baseline.spread:.4f}) {margin_note}",
            )

        case _:
            assert_never(gate)


def _noise_differential(
    frame: pd.DataFrame, spec: EngineSpec, noise_shapes: Sequence[str]
) -> NoiseDifferential:
    if not noise_shapes:
        return NoiseDifferential(
            passed=True,
            evaluated=False,
            reason="suite contains no noise_edges dataset; differential not evaluated",
        )

    if not spec.uses_edges:
        return NoiseDifferential(
            passed=True,
            evaluated=True,
            reason="engine command does not consume {edges}; differential trivially passes",
        )

    if spec.command_no_edges is None:
        return NoiseDifferential(
            passed=False,
            evaluated=False,
            reason="not evaluable (fail closed): engine consumes {edges}"
            " but defines no command_no_edges",
        )

    checks: list[NoiseDifferentialCheck] = []

    for shape in noise_shapes:
        for metric in NOISE_DIFFERENTIAL_METRICS:
            with_edges = _rerun_stat(frame, spec.name, shape, metric.value, variant="edges")
            no_edges = _rerun_stat(frame, spec.name, shape, metric.value, variant="no_edges")

            if with_edges is None or no_edges is None:
                checks.append(
                    NoiseDifferentialCheck(
                        shape=shape,
                        metric=metric,
                        with_edges=with_edges,
                        no_edges=no_edges,
                        passed=False,
                        reason="missing with-edges or no-edges runs (fail closed)",
                    )
                )
                continue

            improved = with_edges.mean > no_edges.mean + no_edges.spread + _EPS
            checks.append(
                NoiseDifferentialCheck(
                    shape=shape,
                    metric=metric,
                    with_edges=with_edges,
                    no_edges=no_edges,
                    passed=not improved,
                    reason=(
                        f"with-edges {with_edges.mean:.4f}"
                        f" {'>' if improved else '<='} no-edges"
                        f" {no_edges.mean:.4f} + floor {no_edges.spread:.4f}"
                    ),
                )
            )

    return NoiseDifferential(
        passed=all(check.passed for check in checks),
        evaluated=True,
        reason="edges must not improve silhouette or normalized"
        " persistence on noise_edges beyond the rerun-noise floor",
        checks=checks,
    )


def evaluate_gates(
    frame: pd.DataFrame,
    engines: Sequence[EngineSpec],
    *,
    suite_shapes: Sequence[str],
    gate_configs: Sequence[GateConfig],
) -> GatesReport:
    """Evaluate all configured gates plus the hard noise differential."""
    noise_shapes = [shape for shape in suite_shapes if shape == NOISE_SHAPE]
    engine_names = {spec.name for spec in engines}

    engine_reports: dict[str, EngineGateReport] = {}

    for spec in engines:
        outcomes = [
            _evaluate_gate(frame, gate, spec.name, shape, engine_names)
            for gate in gate_configs
            for shape in (gate.shapes if gate.shapes is not None else suite_shapes)
        ]
        differential = _noise_differential(frame, spec, noise_shapes)

        engine_reports[spec.name] = EngineGateReport(
            passed=all(outcome.passed for outcome in outcomes) and differential.passed,
            gates=outcomes,
            noise_differential=differential,
        )

    return GatesReport(version=1, engines=engine_reports)
