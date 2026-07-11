"""Threshold gates and the hard no-structure-from-noise differential.

Gate config schema (version 1), embedded in the suite YAML::

    gates:
      - metric: knn_recall_15      # any metric name from results.parquet
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

Semantics:

- Gate values aggregate the with-edges variant as the *mean across seed
  reruns* per (engine, shape). The per-metric spread (max - min across
  seeds) is the rerun-noise floor; it annotates every gate entry and every
  comparative number in the report (W3.2.7).
- A gated metric that is unavailable on a gated shape (value None/NaN)
  fails that gate entry: the battery fails closed rather than skipping.
- ``baseline_margin`` fails closed when the baseline engine is not part of
  the run.
- An engine passes overall iff every applicable gate entry passes AND the
  noise differential passes.

No-structure-from-noise differential (W3.2.8, hard, always on):

On every ``noise_edges`` dataset in the suite, an engine configuration that
uses edges MUST NOT improve community separation (silhouette) or merge-tree
normalized persistence beyond the rerun-noise floor relative to the same
engine with edges disabled. Rules per engine:

- command does not reference ``{edges}``: trivially passes (the engine
  cannot manufacture structure from edges it never sees).
- command references ``{edges}`` but no ``command_no_edges`` is defined:
  FAILS as "not evaluable" — fail closed.
- otherwise: for silhouette and normalized_persistence,
  ``mean_with_edges <= mean_no_edges + floor + eps`` must hold, where
  ``floor`` is the no-edges spread across seed reruns. This is a pass/fail
  gate, not a reported number.
"""

from typing import Any

import pandas as pd

from atlas_tools.battery.engine_runner import EngineSpec

NOISE_SHAPE = "noise_edges"
NOISE_DIFFERENTIAL_METRICS = ("silhouette", "normalized_persistence")
_EPS = 1e-9

GATE_TYPES = ("min", "max", "baseline_margin")


def validate_gates_config(gates: list[dict[str, Any]], suite_shapes: list[str]) -> None:
    for i, gate in enumerate(gates):
        if "metric" not in gate:
            raise ValueError(f"gate #{i}: missing 'metric'")
        gate_type = gate.get("type")
        if gate_type not in GATE_TYPES:
            raise ValueError(
                f"gate #{i} ({gate['metric']}): type must be one of"
                f" {GATE_TYPES}, got {gate_type!r}"
            )
        if gate_type in ("min", "max") and "value" not in gate:
            raise ValueError(f"gate #{i} ({gate['metric']}): missing 'value'")
        if gate_type == "baseline_margin":
            if "baseline" not in gate or "margin" not in gate:
                raise ValueError(
                    f"gate #{i} ({gate['metric']}): baseline_margin needs"
                    " 'baseline' and 'margin'"
                )
            if gate.get("direction", "higher") not in ("higher", "lower"):
                raise ValueError(
                    f"gate #{i} ({gate['metric']}): direction must be"
                    " 'higher' or 'lower'"
                )
        for shape in gate.get("shapes") or []:
            if shape not in suite_shapes:
                raise ValueError(
                    f"gate #{i} ({gate['metric']}): shape {shape!r} not in"
                    f" suite shapes {suite_shapes}"
                )


def _stat(
    df: pd.DataFrame,
    engine: str,
    shape: str,
    metric: str,
    variant: str = "edges",
) -> tuple[float, float, int] | None:
    """(mean, spread=max-min across seed reruns, count) or None."""
    sel = df[
        (df["engine"] == engine)
        & (df["shape"] == shape)
        & (df["metric"] == metric)
        & (df["variant"] == variant)
    ]["value"].dropna()
    if len(sel) == 0:
        return None
    return float(sel.mean()), float(sel.max() - sel.min()), int(len(sel))


def _evaluate_gate_entry(
    df: pd.DataFrame,
    gate: dict[str, Any],
    engine: str,
    shape: str,
    engine_names: set[str],
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "metric": gate["metric"],
        "type": gate["type"],
        "engine": engine,
        "shape": shape,
    }
    stat = _stat(df, engine, shape, gate["metric"])
    if stat is None:
        entry.update(
            {
                "pass": False,
                "value": None,
                "noise_floor": None,
                "reason": "metric not available for this shape (fail closed)",
            }
        )
        return entry
    mean, spread, count = stat
    entry.update({"value": mean, "noise_floor": spread, "n_reruns": count})

    if gate["type"] == "min":
        threshold = float(gate["value"])
        entry["threshold"] = threshold
        entry["pass"] = bool(mean >= threshold)
        entry["reason"] = (
            f"mean {mean:.4f} (±{spread:.4f} rerun floor)"
            f" {'>=' if entry['pass'] else '<'} min {threshold}"
        )
    elif gate["type"] == "max":
        threshold = float(gate["value"])
        entry["threshold"] = threshold
        entry["pass"] = bool(mean <= threshold)
        entry["reason"] = (
            f"mean {mean:.4f} (±{spread:.4f} rerun floor)"
            f" {'<=' if entry['pass'] else '>'} max {threshold}"
        )
    else:  # baseline_margin
        baseline = gate["baseline"]
        margin = float(gate["margin"])
        direction = gate.get("direction", "higher")
        entry["baseline"] = baseline
        entry["margin"] = margin
        entry["direction"] = direction
        if baseline not in engine_names:
            entry.update(
                {
                    "pass": False,
                    "reason": f"baseline engine {baseline!r} not in run (fail closed)",
                }
            )
            return entry
        base_stat = _stat(df, baseline, shape, gate["metric"])
        if base_stat is None:
            entry.update(
                {
                    "pass": False,
                    "reason": f"baseline {baseline!r} has no value for this"
                    " shape (fail closed)",
                }
            )
            return entry
        base_mean, base_spread, _ = base_stat
        entry["baseline_value"] = base_mean
        entry["baseline_noise_floor"] = base_spread
        if direction == "higher":
            entry["pass"] = bool(mean >= base_mean - margin)
            cmp = ">=" if entry["pass"] else "<"
            entry["reason"] = (
                f"mean {mean:.4f} (±{spread:.4f}) {cmp} baseline"
                f" {base_mean:.4f} (±{base_spread:.4f}) - margin {margin}"
            )
        else:
            entry["pass"] = bool(mean <= base_mean + margin)
            cmp = "<=" if entry["pass"] else ">"
            entry["reason"] = (
                f"mean {mean:.4f} (±{spread:.4f}) {cmp} baseline"
                f" {base_mean:.4f} (±{base_spread:.4f}) + margin {margin}"
            )
    return entry


def _noise_differential(
    df: pd.DataFrame, spec: EngineSpec, noise_shapes: list[str]
) -> dict[str, Any]:
    if not noise_shapes:
        return {
            "pass": True,
            "evaluated": False,
            "reason": "suite contains no noise_edges dataset;"
            " differential not evaluated",
        }
    if not spec.uses_edges:
        return {
            "pass": True,
            "evaluated": True,
            "reason": "engine command does not consume {edges};"
            " differential trivially passes",
        }
    if spec.command_no_edges is None:
        return {
            "pass": False,
            "evaluated": False,
            "reason": "not evaluable (fail closed): engine consumes {edges}"
            " but defines no command_no_edges",
        }
    checks = []
    ok = True
    for shape in noise_shapes:
        for metric in NOISE_DIFFERENTIAL_METRICS:
            with_stat = _stat(df, spec.name, shape, metric, variant="edges")
            no_stat = _stat(df, spec.name, shape, metric, variant="no_edges")
            if with_stat is None or no_stat is None:
                ok = False
                checks.append(
                    {
                        "shape": shape,
                        "metric": metric,
                        "pass": False,
                        "reason": "missing with-edges or no-edges runs (fail closed)",
                    }
                )
                continue
            with_mean, _, _ = with_stat
            no_mean, no_spread, _ = no_stat
            improved = with_mean > no_mean + no_spread + _EPS
            if improved:
                ok = False
            checks.append(
                {
                    "shape": shape,
                    "metric": metric,
                    "with_edges": with_mean,
                    "no_edges": no_mean,
                    "noise_floor": no_spread,
                    "pass": not improved,
                    "reason": (
                        f"with-edges {with_mean:.4f}"
                        f" {'>' if improved else '<='} no-edges"
                        f" {no_mean:.4f} + floor {no_spread:.4f}"
                    ),
                }
            )
    return {
        "pass": ok,
        "evaluated": True,
        "reason": "edges must not improve silhouette or normalized"
        " persistence on noise_edges beyond the rerun-noise floor",
        "checks": checks,
    }


def evaluate_gates(
    df: pd.DataFrame,
    engines: list[EngineSpec],
    *,
    suite_shapes: list[str],
    gate_configs: list[dict[str, Any]],
) -> dict[str, Any]:
    """Evaluate all configured gates plus the hard noise differential.

    Returns the ``gates.json`` payload: structured pass/fail with reasons,
    per engine.
    """
    noise_shapes = [s for s in suite_shapes if s == NOISE_SHAPE]
    engine_names = {spec.name for spec in engines}

    engines_out: dict[str, Any] = {}
    for spec in engines:
        entries = []
        for gate in gate_configs:
            shapes = gate.get("shapes") or suite_shapes
            for shape in shapes:
                entries.append(
                    _evaluate_gate_entry(df, gate, spec.name, shape, engine_names)
                )
        differential = _noise_differential(df, spec, noise_shapes)
        overall = all(e["pass"] for e in entries) and differential["pass"]
        engines_out[spec.name] = {
            "pass": overall,
            "gates": entries,
            "noise_differential": differential,
        }
    return {"version": 1, "engines": engines_out}
