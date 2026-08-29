"""Session variant for manifest-driven optimization studies."""

from __future__ import annotations

import json
import math
import os
from collections.abc import Mapping
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

from ._transport import encode_bootstrap_line
from .errors import PetrinautProtocolError, PetrinautRunError
from .models import OptimizationDescribeResult, OptimizationEvaluateResult
from .session import PetrinautSession

_ModelT = TypeVar("_ModelT", bound=BaseModel)

_ONE_SOURCE = "provide exactly one of optimization_manifest or manifest_path"


class OptimizationSession(PetrinautSession):
    """Own one CLI process initialized with an opaque optimization manifest.

    The manifest is serialized to the CLI's first stdin line (or read by the
    CLI itself when ``manifest_path`` is given). The CLI owns every
    Petrinaut-specific concern: fixed-value injection, scenario compilation,
    simulation, and metric evaluation.

    A manifest embeds a model, and the CLI serves both from one process, so
    every :class:`~petrinaut.session.PetrinautSession` method works here too;
    only this class can answer the `optimization.*` methods. Pick the class by
    naming what the process serves: a model, or a manifest.
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
            bootstrap_line = encode_bootstrap_line(
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
        self._timeout_configured = False

    @staticmethod
    def from_manifest(
        manifest: Mapping[str, Any], **options: Any
    ) -> OptimizationSession:
        """Serve a manifest object sent as the first stdin line.

        The mirror of :meth:`PetrinautSession.from_model`, so both classes
        construct the same way: name the source, get the session.
        """
        return OptimizationSession(manifest, **options)

    @staticmethod
    def from_manifest_file(
        path: str | os.PathLike[str], **options: Any
    ) -> OptimizationSession:
        """Serve a manifest file, YAML or JSON, read by the CLI itself.

        The mirror of :meth:`PetrinautSession.from_model_file`.
        """
        return OptimizationSession(manifest_path=path, **options)

    def describe(self) -> OptimizationDescribeResult:
        """Return the CLI-owned Optuna study and parameter description."""
        # The generated model bounds seedsPerTrial to the CLI's 1-100 range,
        # so an out-of-range value already failed validation in `_validated`.
        result = self._validated("optimization.describe", OptimizationDescribeResult)
        seeds_per_trial = (
            1 if result.study.seedsPerTrial is None else result.study.seedsPerTrial
        )
        # One evaluate may run this many seeded simulations, sequentially in
        # the worst case, so the per-response deadline scales with it.
        self._transport.request_timeout_seconds = (
            self._transport.base_request_timeout_seconds * seeds_per_trial
        )
        self._timeout_configured = True
        return result

    # The previous name; prefer `describe()`, which maps 1:1 to the protocol's
    # `optimization.describe` and reads without repeating the class name.
    describe_optimization = describe

    def evaluate(
        self, parameter_values: Mapping[str, Any]
    ) -> OptimizationEvaluateResult:
        """Evaluate one trial and return the whole result frame.

        Carries per-seed ``replicates`` when the manifest asks for more than one
        seed per trial.
        """
        if not self._timeout_configured:
            # A seeded trial needs the scaled deadline before its first
            # evaluation, so an un-described session describes once here.
            self.describe()
        return self._validated(
            "optimization.evaluate",
            OptimizationEvaluateResult,
            {"parameterValues": dict(parameter_values)},
        )

    def objective(self, parameter_values: Mapping[str, Any]) -> float:
        """Evaluate one trial and return its finite scalar objective."""
        objective = self.evaluate(parameter_values).objective
        # JSON cannot carry Infinity or NaN, but Python's parser admits both,
        # and a non-finite objective would corrupt an Optuna study silently.
        if not math.isfinite(objective):
            raise PetrinautRunError(
                "Petrinaut optimization objective is not a finite number"
            )
        return objective

    def _validated(
        self,
        method: str,
        model: type[_ModelT],
        params: Mapping[str, Any] | None = None,
    ) -> _ModelT:
        """One request whose result must match the protocol schema.

        A result that does not is the child breaking its contract, so the
        session closes, exactly as for a malformed frame.
        """
        result = self._request_object(method, params)
        try:
            # Validated as JSON in strict mode: the wire is JSON from a process
            # this session started, so a value needing cross-type coercion (a
            # string where a number belongs) is a contract bug to surface, not
            # input to repair. JSON mode still admits what JSON cannot express
            # natively, such as enum members arriving as their string values.
            return model.model_validate_json(json.dumps(result), strict=True)
        except ValidationError as error:
            self.close(graceful=False)
            raise PetrinautProtocolError(
                f"{method} result does not match the protocol schema: {error}"
            ) from error
