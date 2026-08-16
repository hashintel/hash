"""Session variant for manifest-driven optimization studies."""

from __future__ import annotations

import math
import os
from collections.abc import Mapping
from typing import Any

from .errors import PetrinautRunError
from .session import PetrinautSession, _encode_bootstrap_line


class OptimizationSession(PetrinautSession):
    """Own one CLI process initialized with an opaque optimization manifest.

    The manifest is serialized to the CLI's first stdin line (or read by the
    CLI itself when ``manifest_path`` is given). The CLI owns every
    Petrinaut-specific concern: fixed-value injection, scenario compilation,
    simulation, and metric evaluation.
    """

    def __init__(
        self,
        optimization_manifest: Mapping[str, Any] | None = None,
        *,
        manifest_path: str | os.PathLike[str] | None = None,
        **options: Any,
    ) -> None:
        if (optimization_manifest is None) == (manifest_path is None):
            raise ValueError(
                "provide exactly one of optimization_manifest or manifest_path"
            )
        if manifest_path is not None:
            serve_arguments = ("--optimization", os.fspath(manifest_path), "--stdio")
            bootstrap_line = None
        else:
            serve_arguments = ("--optimization-stdin", "--stdio")
            bootstrap_line = _encode_bootstrap_line(
                optimization_manifest, "optimization manifest"
            )
        super().__init__(
            serve_arguments=serve_arguments,
            bootstrap_line=bootstrap_line,
            source_label="optimization manifest",
            **options,
        )

    def describe_optimization(self) -> dict[str, Any]:
        """Return the CLI-owned Optuna study and parameter description."""
        return self._request_object("optimization.describe")

    def evaluate(self, parameter_values: Mapping[str, Any]) -> dict[str, Any]:
        """Evaluate one trial and return the whole result frame.

        Carries per-seed ``replicates`` when the manifest asks for more than one
        seed per trial.
        """
        return self._request_object(
            "optimization.evaluate",
            {"parameterValues": dict(parameter_values)},
        )

    def objective(self, parameter_values: Mapping[str, Any]) -> float:
        """Evaluate one trial and return its finite scalar objective."""
        result = self.evaluate(parameter_values)
        objective = result.get("objective")
        if (
            isinstance(objective, bool)
            or not isinstance(objective, (int, float))
            or not math.isfinite(objective)
        ):
            raise PetrinautRunError(
                "Petrinaut optimization objective is not a finite number"
            )
        return float(objective)
