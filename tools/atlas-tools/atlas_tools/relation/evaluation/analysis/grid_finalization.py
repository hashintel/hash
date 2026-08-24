"""Expose the lightweight analysis required to finalize a grid run.

This boundary excludes classifier, plotting, Parquet, and report modules so
pilot and completed-run paths do not initialize optional numerical stacks.
"""

from atlas_tools.relation.evaluation.analysis.economics import (
    VoteEconomics,
    vote_economics,
)
from atlas_tools.relation.evaluation.analysis.grid import GridAnalysis, analyze_grid

__all__ = [
    "GridAnalysis",
    "VoteEconomics",
    "analyze_grid",
    "vote_economics",
]
