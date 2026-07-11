"""W1 prefix representation audit.

Measures the information ceiling of truncated-and-renormalized embedding
prefixes. Map neighbor recall can never exceed prefix neighbor recall, so
every projector gate downstream references these numbers.

See :mod:`atlas_tools.audit.runner` for the pipeline, exact metric
definitions, and the blockwise scale math; :mod:`atlas_tools.audit.metrics`
for the metric implementations; :mod:`atlas_tools.audit.cli` for the
``audit`` console entry point.
"""

from atlas_tools.audit.runner import run_audit

__all__ = ["run_audit"]
