"""Load report inputs and bind their exact source identities."""

from dataclasses import dataclass
from pathlib import Path

import trio

from atlas_tools.relation.evaluation.analysis.api import GoldLabel
from atlas_tools.relation.evaluation.application._analysis_codec import (
    canonical_json_bytes,
    read_bytes,
    sha256_bytes,
)
from atlas_tools.relation.evaluation.application.analysis_artifact import ClassifierBundle
from atlas_tools.relation.evaluation.application.analysis_codec import (
    load_classifier_bundle_async,
)
from atlas_tools.relation.evaluation.application.completed import CompletedGrid
from atlas_tools.relation.evaluation.domain.api import Sha256Hex
from atlas_tools.relation.family_closure.api import verify_family_closure


@dataclass(frozen=True, slots=True, kw_only=True)
class LoadedGold:
    """A strict gold export and the identity of its exact bytes."""

    path: Path
    content_hash: Sha256Hex
    rows: tuple[GoldLabel, ...]


def report_source_hashes(
    completed: CompletedGrid,
    gold: LoadedGold | None,
    classifier: ClassifierBundle | None,
) -> dict[str, Sha256Hex]:
    sources = {
        "grid/config": completed.prepared.loaded_config.content_hash,
        "grid/manifest-contract": sha256_bytes(canonical_json_bytes(completed.manifest)),
        **{
            f"grid/{name}": content_hash
            for name, content_hash in completed.manifest.source_hashes.items()
        },
    }
    if gold is not None:
        sources["gold.jsonl"] = gold.content_hash
    if classifier is not None:
        sources["classifier/metadata"] = classifier.metadata.metadata_hash
        sources.update(
            {
                f"classifier/{name}": content_hash
                for name, content_hash in classifier.metadata.content_hashes.items()
            }
        )
    return sources


def load_gold(path: Path) -> LoadedGold:
    """Load strict JSONL gold labels and normalize them by relation ID.

    An empty file is a valid zero-sample cohort. Blank records, duplicate
    relations, malformed JSON, and schema coercion are rejected.

    Raises:
        ValueError: The file cannot be read or a record violates the contract.

    """
    payload = read_bytes(path)
    rows: list[GoldLabel] = []
    seen: set[str] = set()
    for line_number, line in enumerate(payload.splitlines(), start=1):
        if not line.strip():
            raise ValueError(f"gold JSONL contains a blank record at line {line_number}")
        try:
            row = GoldLabel.model_validate_json(line, strict=True)
        except ValueError as error:
            raise ValueError(f"invalid gold JSONL line {line_number}: {error}") from error
        if row.relation_id in seen:
            raise ValueError(f"gold JSONL repeats relation {row.relation_id}")
        seen.add(row.relation_id)
        rows.append(row)
    ordered = tuple(sorted(rows, key=lambda row: row.relation_id))
    return LoadedGold(path=path, content_hash=sha256_bytes(payload), rows=ordered)


async def load_gold_async(path: Path) -> LoadedGold:
    """Load strict gold labels without blocking Trio's event loop."""
    return await trio.to_thread.run_sync(load_gold, path, abandon_on_cancel=False)


def _validate_classifier_paths(
    *,
    classifier_directory: Path | None,
    closure_directory: Path | None,
    soft_labels_path: Path | None,
    resolutions_directory: Path | None,
    coincident_reviews_directory: Path | None,
    deliverables_directory: Path | None,
) -> None:
    if (classifier_directory is None) != (closure_directory is None):
        raise ValueError("classifier and family closure must be provided together")
    if resolutions_directory is not None and soft_labels_path is None:
        raise ValueError("target resolutions require soft labels")
    if (coincident_reviews_directory is None) != (deliverables_directory is None):
        raise ValueError("Coincident reviews and grid deliverables must be provided together")
    if coincident_reviews_directory is not None and soft_labels_path is None:
        raise ValueError("Coincident reviews require soft labels")
    if classifier_directory is None and (
        resolutions_directory is not None or coincident_reviews_directory is not None
    ):
        raise ValueError("reviewed targets require a classifier")


async def _load_classifier(
    *,
    classifier_directory: Path,
    closure_directory: Path,
    soft_labels_path: Path | None,
    resolutions_directory: Path | None,
    coincident_reviews_directory: Path | None,
    deliverables_directory: Path | None,
) -> ClassifierBundle:
    closure = await trio.to_thread.run_sync(
        verify_family_closure,
        closure_directory,
        abandon_on_cancel=False,
    )
    return await load_classifier_bundle_async(
        classifier_directory,
        closure=closure,
        soft_labels=soft_labels_path,
        resolutions_directory=resolutions_directory,
        coincident_reviews_directory=coincident_reviews_directory,
        deliverables_directory=deliverables_directory,
    )


def _loaded_gold(path: Path | None, values: list[LoadedGold]) -> LoadedGold | None:
    if path is None:
        if values:
            raise AssertionError("gold loaded without a requested path")
        return None
    if len(values) != 1:
        raise AssertionError("parallel gold loader did not return exactly once")
    return values[0]


async def load_snapshot_inputs(
    *,
    gold_path: Path | None,
    classifier_directory: Path | None,
    closure_directory: Path | None,
    soft_labels_path: Path | None,
    resolutions_directory: Path | None,
    coincident_reviews_directory: Path | None,
    deliverables_directory: Path | None,
) -> tuple[LoadedGold | None, ClassifierBundle | None]:
    """Load optional gold and a classifier bound to its verified closure."""
    _validate_classifier_paths(
        classifier_directory=classifier_directory,
        closure_directory=closure_directory,
        soft_labels_path=soft_labels_path,
        resolutions_directory=resolutions_directory,
        coincident_reviews_directory=coincident_reviews_directory,
        deliverables_directory=deliverables_directory,
    )
    gold_values: list[LoadedGold] = []
    classifier_values: list[ClassifierBundle] = []

    async def load_gold_value(path: Path) -> None:
        gold_values.append(await load_gold_async(path))

    async def load_classifier_value() -> None:
        if classifier_directory is None or closure_directory is None:
            raise AssertionError("classifier loader started without both artifact directories")
        classifier_values.append(
            await _load_classifier(
                classifier_directory=classifier_directory,
                closure_directory=closure_directory,
                soft_labels_path=soft_labels_path,
                resolutions_directory=resolutions_directory,
                coincident_reviews_directory=coincident_reviews_directory,
                deliverables_directory=deliverables_directory,
            )
        )

    async with trio.open_nursery() as nursery:
        if gold_path is not None:
            nursery.start_soon(load_gold_value, gold_path)
        if classifier_directory is not None:
            nursery.start_soon(load_classifier_value)
    gold = _loaded_gold(gold_path, gold_values)
    if classifier_directory is None:
        if classifier_values:
            raise AssertionError("classifier loaded without a requested directory")
        classifier = None
    else:
        if len(classifier_values) != 1:
            raise AssertionError("parallel classifier loader did not return exactly once")
        classifier = classifier_values[0]
    return gold, classifier
