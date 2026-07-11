"""Merge-tree calibration against a reference layout (W3.2.1 calibration).

``battery calibrate --layout <layout.npz> --manifest <yaml>`` computes
merge-tree leaves and normalized persistence with the PRD default
parameters (grid 1024, blur 4 px, floor_frac 0.005, persistence_frac 0.05,
overridable in the manifest) and checks them against recorded reference
values within tolerances: leaves ±3 %, normalized persistence ±5 %.

Calibration manifest schema (version 1)::

    version: 1
    merge_tree:            # optional overrides of the PRD defaults
      grid_size: 1024
      bandwidth_px: 4.0
      floor_frac: 0.005
      persistence_frac: 0.05
    expected:
      leaf_count: 4
      normalized_persistence: 3.21
    tolerances:            # optional; PRD defaults shown
      leaf_count_frac: 0.03
      normalized_persistence_frac: 0.05

The committed fixture ``fixtures/battery/calibration/`` is a small
deterministic synthetic reference (a few blobs, ~2k points). The operator's
real 986k-point reference layout drops in later using exactly this
mechanism: same command, a bigger layout.npz, and its recorded values.
"""

from __future__ import annotations

from os import PathLike
from typing import Any

import yaml

from atlas_tools.battery.merge_tree import MergeTreeConfig, merge_tree_persistence
from atlas_tools.common.layout import load_layout

TOLERANCE_DEFAULTS: dict[str, float] = {
    "leaf_count_frac": 0.03,
    "normalized_persistence_frac": 0.05,
}


def run_calibration(layout_path: PathLike, manifest_path: PathLike) -> dict[str, Any]:
    """Compute merge-tree stats and compare with the reference manifest."""
    with open(manifest_path, encoding="utf-8") as f:
        manifest = yaml.safe_load(f)
    if not isinstance(manifest, dict) or manifest.get("version") != 1:
        raise ValueError(
            f"{manifest_path}: calibration manifest must declare 'version: 1'"
        )

    expected = manifest.get("expected") or {}
    for key in ("leaf_count", "normalized_persistence"):
        if key not in expected:
            raise ValueError(f"{manifest_path}: expected.{key} is required")

    params = MergeTreeConfig.model_validate(manifest.get("merge_tree") or {})
    tolerances = {**TOLERANCE_DEFAULTS, **(manifest.get("tolerances") or {})}

    artifact = load_layout(layout_path)
    result = merge_tree_persistence(artifact.xy, params)

    checks = []
    for name, actual, frac_key in (
        ("leaf_count", float(result.leaf_count), "leaf_count_frac"),
        (
            "normalized_persistence",
            result.normalized_persistence,
            "normalized_persistence_frac",
        ),
    ):
        exp = float(expected[name])
        frac = float(tolerances[frac_key])
        limit = frac * abs(exp)

        checks.append(
            {
                "name": name,
                "expected": exp,
                "actual": actual,
                "tolerance_frac": frac,
                "abs_limit": limit,
                "pass": bool(abs(actual - exp) <= limit),
            }
        )

    return {
        "pass": all(check["pass"] for check in checks),
        "checks": checks,
        "params": params.model_dump(mode="json"),
        "layout": str(layout_path),
        "manifest": str(manifest_path),
    }
