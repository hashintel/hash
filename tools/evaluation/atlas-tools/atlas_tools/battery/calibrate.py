"""Merge-tree calibration against a reference layout (W3.2.1 calibration).

``battery calibrate --layout <layout.npz> --manifest <yaml>`` computes
merge-tree leaves and normalized persistence with the PRD default
parameters (grid 1024, blur 4 px, floor_frac 0.005, persistence_frac 0.05,
overridable in the manifest) and checks them against recorded reference
values within tolerances: leaves ±3 %, normalized persistence ±5 %.

Calibration manifest schema (version 1, :class:`CalibrationManifest`)::

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

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, PositiveFloat

from atlas_tools.battery.datasets import StrPath
from atlas_tools.battery.merge_tree import MergeTreeConfig, merge_tree_persistence
from atlas_tools.battery.metrics import MetricName
from atlas_tools.common.layout import load_layout


class CalibrationExpected(BaseModel):
    """Recorded reference values of the calibration layout."""

    leaf_count: float
    normalized_persistence: float

    model_config = ConfigDict(extra="forbid")


class CalibrationTolerances(BaseModel):
    """Relative tolerances (PRD defaults: leaves ±3 %, persistence ±5 %)."""

    leaf_count_frac: PositiveFloat = 0.03
    normalized_persistence_frac: PositiveFloat = 0.05

    model_config = ConfigDict(extra="forbid")


class CalibrationManifest(BaseModel):
    """Versioned calibration reference (see module docstring for YAML)."""

    version: Literal[1]
    merge_tree: MergeTreeConfig = Field(default_factory=MergeTreeConfig)
    expected: CalibrationExpected
    tolerances: CalibrationTolerances = Field(default_factory=CalibrationTolerances)

    model_config = ConfigDict(extra="forbid")


class CalibrationCheck(BaseModel):
    """One computed value compared against its recorded reference."""

    name: MetricName
    expected: float
    actual: float
    tolerance_frac: float
    abs_limit: float
    passed: bool


class CalibrationReport(BaseModel):
    """The ``battery calibrate`` verdict (JSON-printed by the CLI)."""

    passed: bool
    checks: list[CalibrationCheck]
    merge_tree: MergeTreeConfig
    layout: Path
    manifest: Path


def load_calibration_manifest(path: StrPath) -> CalibrationManifest:
    """Load and validate a versioned calibration manifest YAML."""
    with open(path, encoding="utf-8") as file:
        data = yaml.safe_load(file)

    return CalibrationManifest.model_validate(data)


def _check(
    name: MetricName, *, expected: float, actual: float, tolerance_frac: float
) -> CalibrationCheck:
    limit = tolerance_frac * abs(expected)

    return CalibrationCheck(
        name=name,
        expected=expected,
        actual=actual,
        tolerance_frac=tolerance_frac,
        abs_limit=limit,
        passed=abs(actual - expected) <= limit,
    )


def run_calibration(layout_path: StrPath, manifest_path: StrPath) -> CalibrationReport:
    """Compute merge-tree stats and compare with the reference manifest."""
    manifest = load_calibration_manifest(manifest_path)

    artifact = load_layout(Path(layout_path))
    result = merge_tree_persistence(artifact.xy, manifest.merge_tree)

    checks = [
        _check(
            MetricName.leaf_count,
            expected=manifest.expected.leaf_count,
            actual=float(result.leaf_count),
            tolerance_frac=manifest.tolerances.leaf_count_frac,
        ),
        _check(
            MetricName.normalized_persistence,
            expected=manifest.expected.normalized_persistence,
            actual=result.normalized_persistence,
            tolerance_frac=manifest.tolerances.normalized_persistence_frac,
        ),
    ]

    return CalibrationReport(
        passed=all(check.passed for check in checks),
        checks=checks,
        merge_tree=manifest.merge_tree,
        layout=Path(layout_path),
        manifest=Path(manifest_path),
    )
