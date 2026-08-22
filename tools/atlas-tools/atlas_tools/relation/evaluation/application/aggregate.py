"""Aggregate one completed grid into durable classifier soft labels."""

from functools import partial
from pathlib import Path

import trio

from atlas_tools.relation.evaluation.analysis.api import soft_labels
from atlas_tools.relation.evaluation.application.analysis_artifact import SoftLabelsArtifact
from atlas_tools.relation.evaluation.application.analysis_codec import (
    write_soft_labels_async,
)
from atlas_tools.relation.evaluation.application.completed import (
    load_completed_grid_async,
)

_SOURCE_NAMES = (
    "cards.jsonl",
    "imported-votes.jsonl",
    "judges-panel",
    "votes.jsonl",
)


async def aggregate_soft_labels_async(
    *,
    run_directory: Path,
    cards_directory: Path,
    config_path: Path,
    output_path: Path,
) -> SoftLabelsArtifact:
    """Validate a grid, derive every label, and publish one bound Parquet.

    All eligible cards remain in the training population. Placement-vote
    count is the downstream weight; unclear responses and abstentions are
    retained as ambiguity evidence rather than projected into a placement.

    Raises:
        ValueError: The completed grid or derived label contract is invalid.
        OSError: The artifact cannot be read, written, or synchronized.

    """
    completed = await load_completed_grid_async(
        run_directory=run_directory,
        cards_directory=cards_directory,
        config_path=config_path,
    )
    sources = {name: completed.manifest.source_hashes[name] for name in _SOURCE_NAMES}
    return await write_soft_labels_async(
        output_path,
        soft_labels(completed.analysis),
        source_hashes=sources,
    )


def aggregate_soft_labels(
    *,
    run_directory: Path,
    cards_directory: Path,
    config_path: Path,
    output_path: Path,
) -> SoftLabelsArtifact:
    """Run soft-label aggregation from a synchronous process boundary."""
    operation = partial(
        aggregate_soft_labels_async,
        run_directory=run_directory,
        cards_directory=cards_directory,
        config_path=config_path,
        output_path=output_path,
    )
    return trio.run(operation)
