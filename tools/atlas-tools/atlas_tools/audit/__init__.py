"""Prefix representation audit.

The audit measures the information ceiling of truncated-and-renormalized embedding
prefixes. Map neighbor recall can never exceed prefix neighbor recall, so prefix recall
is an upper bound for any layout built from the same prefixes.

See :mod:`atlas_tools.audit.runner` for the pipeline and the blockwise memory bounds;
:mod:`atlas_tools.audit.metrics` for the metric definitions and implementations;
:mod:`atlas_tools.audit.evaluation` for the typed report and provenance models;
:mod:`atlas_tools.audit.cli` for the ``audit`` console entry point.
"""

from atlas_tools.audit.evaluation import RunnerProvenance, RunnerReport
from atlas_tools.audit.runner import run_audit

__all__ = ["RunnerProvenance", "RunnerReport", "run_audit"]
