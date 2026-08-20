"""Session variant for manifest-driven optimization studies."""

from __future__ import annotations

import math
import os
from collections.abc import Mapping
from typing import Any

from .errors import PetrinautRunError
from .session import PetrinautSession, _encode_bootstrap_line

_ONE_SOURCE = "provide exactly one of optimization_manifest or manifest_path"


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
        # Branching on each argument in turn, rather than on a combined check,
        # so the payload is known to be present where it is encoded.
        if optimization_manifest is not None:
            if manifest_path is not None:
                raise ValueError(_ONE_SOURCE)
            serve_arguments = ("--optimization-stdin", "--stdio")
            bootstrap_line = _encode_bootstrap_line(
                optimization_manifest, "optimization manifest"
            )
        elif manifest_path is not None:
            serve_arguments = ("--optimization", os.fspath(manifest_path), "--stdio")
            bootstrap_line = None
        else:
            raise ValueError(_ONE_SOURCE)
        super().__init__(
            serve_arguments=serve_arguments,
            bootstrap_line=bootstrap_line,
            source_label="optimization manifest",
            **options,
        )

    def describe(self) -> dict[str, Any]:
        """Return the CLI-owned Optuna study and parameter description."""
        return self._request_object("optimization.describe")

    # The previous name; prefer `describe()`, which maps 1:1 to the protocol's
    # `optimization.describe` and reads without repeating the class name.
    describe_optimization = describe

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
