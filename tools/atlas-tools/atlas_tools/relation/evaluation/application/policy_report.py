"""Load, validate, and publish the policy-report artifact stack.

The composition facade loads a completed grid exactly once. Gold and an
optional classifier bundle are then validated against that immutable snapshot.
`report.meta.json` is published last and binds deterministic ASCII JSON and
Markdown content to every transitive source hash available at this boundary.
"""

import json
from collections.abc import Mapping
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from typing import Literal

import trio
from pydantic import NonNegativeInt

from atlas_tools.relation.evaluation.analysis.api import (
    GoldLabel,
    PolicyReport,
    build_policy_report,
    render_policy_report_markdown,
)
from atlas_tools.relation.evaluation.application._analysis_codec import (
    atomic_replace,
    canonical_json_bytes,
    load_model,
    read_bytes,
    require_exact_mapping,
    sha256_bytes,
    verify_content_hashes,
    verify_expected_sources,
)
from atlas_tools.relation.evaluation.application.analysis_artifact import (
    ArtifactMetadata,
    ClassifierBundle,
    hash_mapping,
)
from atlas_tools.relation.evaluation.application.analysis_codec import (
    load_classifier_bundle_async,
)
from atlas_tools.relation.evaluation.application.completed import (
    CompletedGrid,
    load_completed_grid_async,
)
from atlas_tools.relation.evaluation.domain.api import Sha256Hex

REPORT_JSON_FILENAME = "report.json"
REPORT_MARKDOWN_FILENAME = "report.md"
REPORT_METADATA_FILENAME = "report.meta.json"

_ALGORITHMS = {
    "analysis": "independent-gold-policy-report-v1",
    "json": "canonical-ascii-json-v1",
    "markdown": "deterministic-ascii-markdown-v1",
    "publication": "atomic-manifest-last-v1",
}
_METADATA_SCHEMA = {
    "artifact": "relation-policy-report",
    "fields": {
        "algorithm_hash": "sha256",
        "algorithms": "map[string,string]",
        "artifact": "literal[relation-policy-report]",
        "classifier_state": "literal[not-provided,evaluated]",
        "content_hashes": "map[string,sha256]",
        "gold_rows": "non-negative-int",
        "metadata_hash": "computed-sha256",
        "report_schema_version": "literal[1]",
        "schema_hashes": "map[string,sha256]",
        "schema_version": "literal[1]",
        "source_hashes": "map[string,sha256]",
    },
    "schema_version": 1,
}
_MARKDOWN_SCHEMA = {
    "encoding": "ascii",
    "renderer": _ALGORITHMS["markdown"],
    "trailing_newline": True,
}


def _schema_hash(value: object) -> Sha256Hex:
    return sha256_bytes(canonical_json_bytes(value))


_SCHEMA_HASHES = {
    "metadata": _schema_hash(_METADATA_SCHEMA),
    "report_json": _schema_hash(PolicyReport.model_json_schema()),
    "report_markdown": _schema_hash(_MARKDOWN_SCHEMA),
}


class PolicyReportMetadata(ArtifactMetadata):
    """Metadata binding both report renderings to exact validated inputs."""

    artifact: Literal["relation-policy-report"] = "relation-policy-report"
    report_schema_version: Literal[1] = 1
    gold_rows: NonNegativeInt
    classifier_state: Literal["not-provided", "evaluated"]


@dataclass(frozen=True, slots=True, kw_only=True)
class LoadedGold:
    """A strict gold export and the identity of its exact bytes."""

    path: Path
    content_hash: Sha256Hex
    rows: tuple[GoldLabel, ...]


@dataclass(frozen=True, slots=True, kw_only=True)
class PolicyReportArtifact:
    """A fully validated report and all of its durable paths."""

    directory: Path
    report_json_path: Path
    report_markdown_path: Path
    metadata_path: Path
    metadata: PolicyReportMetadata
    report: PolicyReport


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
    """Load strict gold labels without blocking Trio's event loop.

    Raises:
        ValueError: The file cannot be read or a record violates the contract.

    """
    return await trio.to_thread.run_sync(load_gold, path, abandon_on_cancel=False)


def _validate_classifier(completed: CompletedGrid, bundle: ClassifierBundle) -> None:
    config = completed.prepared.config
    if bundle.metadata.config != config.classifier:
        raise ValueError("classifier bundle uses a different classifier configuration")
    if bundle.metadata.rows != len(completed.analysis.cards):
        raise ValueError("classifier bundle does not cover the completed grid")
    sources = bundle.metadata.source_hashes
    if sources.get("grid-config") != completed.prepared.loaded_config.content_hash:
        raise ValueError("classifier bundle belongs to a different grid configuration")
    for name in ("cards.jsonl", "imported-votes.jsonl", "judges-panel", "votes.jsonl"):
        expected = completed.manifest.source_hashes[name]
        if sources.get(f"grid/{name}") != expected:
            raise ValueError(f"classifier bundle does not bind completed grid source {name}")


def _source_hashes(
    completed: CompletedGrid,
    gold: LoadedGold,
    classifier: ClassifierBundle | None,
) -> dict[str, Sha256Hex]:
    sources = {
        "gold.jsonl": gold.content_hash,
        "grid/config": completed.prepared.loaded_config.content_hash,
        "grid/manifest-contract": sha256_bytes(canonical_json_bytes(completed.manifest)),
        **{
            f"grid/{name}": content_hash
            for name, content_hash in completed.manifest.source_hashes.items()
        },
    }
    if classifier is not None:
        sources["classifier/metadata"] = classifier.metadata.metadata_hash
        sources.update(
            {
                f"classifier/{name}": content_hash
                for name, content_hash in classifier.metadata.content_hashes.items()
            }
        )
    return sources


def _report_bytes(report: PolicyReport) -> bytes:
    payload = json.dumps(
        report.model_dump(mode="json"),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    ).encode("ascii")
    return payload + b"\n"


def _publish_report(
    *,
    completed: CompletedGrid,
    gold: LoadedGold,
    classifier: ClassifierBundle | None,
    output_directory: Path,
) -> PolicyReportArtifact:
    if classifier is not None:
        _validate_classifier(completed, classifier)
    report = build_policy_report(
        completed.analysis,
        gold.rows,
        completed.prepared.config.report,
        rubric_version=completed.prepared.config.rubric_version,
        classifier_predictions=(None if classifier is None else classifier.fit.out_of_fold),
    )
    report_json = _report_bytes(report)
    report_markdown = render_policy_report_markdown(report).encode("ascii")
    metadata = PolicyReportMetadata(
        schema_hashes=_SCHEMA_HASHES,
        algorithms=_ALGORITHMS,
        algorithm_hash=hash_mapping(_ALGORITHMS),
        source_hashes=_source_hashes(completed, gold, classifier),
        content_hashes={
            REPORT_JSON_FILENAME: sha256_bytes(report_json),
            REPORT_MARKDOWN_FILENAME: sha256_bytes(report_markdown),
        },
        gold_rows=len(gold.rows),
        classifier_state=report.classifier_state,
    )
    report_json_path = output_directory / REPORT_JSON_FILENAME
    report_markdown_path = output_directory / REPORT_MARKDOWN_FILENAME
    metadata_path = output_directory / REPORT_METADATA_FILENAME
    atomic_replace(report_json_path, report_json)
    atomic_replace(report_markdown_path, report_markdown)
    atomic_replace(
        metadata_path,
        canonical_json_bytes(metadata) + b"\n",
    )
    return PolicyReportArtifact(
        directory=output_directory,
        report_json_path=report_json_path,
        report_markdown_path=report_markdown_path,
        metadata_path=metadata_path,
        metadata=metadata,
        report=report,
    )


async def _publish_report_async(
    *,
    completed: CompletedGrid,
    gold: LoadedGold,
    classifier: ClassifierBundle | None,
    output_directory: Path,
) -> PolicyReportArtifact:
    publish = partial(
        _publish_report,
        completed=completed,
        gold=gold,
        classifier=classifier,
        output_directory=output_directory,
    )
    return await trio.to_thread.run_sync(publish, abandon_on_cancel=False)


async def _load_snapshot_inputs(
    *,
    gold_path: Path,
    classifier_directory: Path | None,
) -> tuple[LoadedGold, ClassifierBundle | None]:
    gold_values: list[LoadedGold] = []
    classifier_values: list[ClassifierBundle] = []

    async def load_gold_value() -> None:
        gold_values.append(await load_gold_async(gold_path))

    async def load_classifier_value() -> None:
        if classifier_directory is None:
            raise AssertionError("classifier loader started without a directory")
        classifier_values.append(await load_classifier_bundle_async(classifier_directory))

    async with trio.open_nursery() as nursery:
        nursery.start_soon(load_gold_value)
        if classifier_directory is not None:
            nursery.start_soon(load_classifier_value)
    if len(gold_values) != 1:
        raise AssertionError("parallel gold loader did not return exactly once")
    if classifier_directory is None:
        if classifier_values:
            raise AssertionError("classifier loaded without a requested directory")
        classifier = None
    else:
        if len(classifier_values) != 1:
            raise AssertionError("parallel classifier loader did not return exactly once")
        classifier = classifier_values[0]
    return gold_values[0], classifier


async def write_policy_report_from_grid_async(
    *,
    completed: CompletedGrid,
    gold_path: Path,
    output_directory: Path,
    classifier_directory: Path | None = None,
) -> PolicyReportArtifact:
    """Publish a report from one already validated completed-grid snapshot.

    Raises:
        ValueError: Gold, classifier, grid, or durable report contracts differ.
        OSError: Report files cannot be durably published.

    """
    gold, classifier = await _load_snapshot_inputs(
        gold_path=gold_path,
        classifier_directory=classifier_directory,
    )
    return await _publish_report_async(
        completed=completed,
        gold=gold,
        classifier=classifier,
        output_directory=output_directory,
    )


def write_policy_report_from_grid(
    *,
    completed: CompletedGrid,
    gold_path: Path,
    output_directory: Path,
    classifier_directory: Path | None = None,
) -> PolicyReportArtifact:
    """Publish a report from a completed snapshot in a synchronous process.

    Raises:
        ValueError: Gold, classifier, grid, or durable report contracts differ.
        OSError: Report files cannot be durably published.

    """
    operation = partial(
        write_policy_report_from_grid_async,
        completed=completed,
        gold_path=gold_path,
        output_directory=output_directory,
        classifier_directory=classifier_directory,
    )
    return trio.run(operation)


async def write_policy_report_async(
    *,
    run_directory: Path,
    cards_directory: Path,
    config_path: Path,
    gold_path: Path,
    output_directory: Path,
    classifier_directory: Path | None = None,
) -> PolicyReportArtifact:
    """Load independent inputs concurrently and publish one policy report.

    The completed grid is loaded exactly once. Gold and classifier bytes are
    read concurrently with that snapshot and are validated before publication.

    Raises:
        ValueError: A completed-grid, gold, classifier, or report contract fails.
        OSError: Report files cannot be durably published.

    """
    completed_values: list[CompletedGrid] = []
    snapshot_values: list[tuple[LoadedGold, ClassifierBundle | None]] = []

    async def load_completed_value() -> None:
        completed_values.append(
            await load_completed_grid_async(
                run_directory=run_directory,
                cards_directory=cards_directory,
                config_path=config_path,
            )
        )

    async def load_snapshot_values() -> None:
        snapshot_values.append(
            await _load_snapshot_inputs(
                gold_path=gold_path,
                classifier_directory=classifier_directory,
            )
        )

    async with trio.open_nursery() as nursery:
        nursery.start_soon(load_completed_value)
        nursery.start_soon(load_snapshot_values)
    if len(completed_values) != 1 or len(snapshot_values) != 1:
        raise AssertionError("parallel report loaders did not each return exactly once")
    gold, classifier = snapshot_values[0]
    return await _publish_report_async(
        completed=completed_values[0],
        gold=gold,
        classifier=classifier,
        output_directory=output_directory,
    )


def write_policy_report(
    *,
    run_directory: Path,
    cards_directory: Path,
    config_path: Path,
    gold_path: Path,
    output_directory: Path,
    classifier_directory: Path | None = None,
) -> PolicyReportArtifact:
    """Load and publish a CLI-grade policy report synchronously.

    Raises:
        ValueError: A completed-grid, gold, classifier, or report contract fails.
        OSError: Report files cannot be durably published.

    """
    operation = partial(
        write_policy_report_async,
        run_directory=run_directory,
        cards_directory=cards_directory,
        config_path=config_path,
        gold_path=gold_path,
        output_directory=output_directory,
        classifier_directory=classifier_directory,
    )
    return trio.run(operation)


def load_policy_report_artifact(
    directory: Path,
    *,
    expected_source_hashes: Mapping[str, Sha256Hex] | None = None,
) -> PolicyReportArtifact:
    """Load a report after validating metadata, bytes, schema, and rendering.

    Raises:
        ValueError: Metadata, content, source expectations, or rendering differ.

    """
    report_json_path = directory / REPORT_JSON_FILENAME
    report_markdown_path = directory / REPORT_MARKDOWN_FILENAME
    metadata_path = directory / REPORT_METADATA_FILENAME
    metadata = load_model(metadata_path, PolicyReportMetadata)
    require_exact_mapping(
        metadata.schema_hashes,
        _SCHEMA_HASHES,
        label="policy-report schema hashes",
    )
    require_exact_mapping(
        metadata.algorithms,
        _ALGORITHMS,
        label="policy-report algorithms",
    )
    verify_expected_sources(metadata.source_hashes, expected_source_hashes)
    report_json = read_bytes(report_json_path)
    report_markdown = read_bytes(report_markdown_path)
    verify_content_hashes(
        metadata.content_hashes,
        {
            REPORT_JSON_FILENAME: report_json,
            REPORT_MARKDOWN_FILENAME: report_markdown,
        },
    )
    try:
        report = PolicyReport.model_validate_json(report_json, strict=True)
    except ValueError as error:
        raise ValueError(f"invalid policy report JSON {report_json_path}: {error}") from error
    if report_json != _report_bytes(report):
        raise ValueError("policy report JSON is not canonical")
    expected_markdown = render_policy_report_markdown(report).encode("ascii")
    if report_markdown != expected_markdown:
        raise ValueError("policy report Markdown differs from its machine report")
    if metadata.gold_rows != report.gold_cards:
        raise ValueError("policy report metadata gold count differs from report")
    if metadata.classifier_state != report.classifier_state:
        raise ValueError("policy report metadata classifier state differs from report")
    return PolicyReportArtifact(
        directory=directory,
        report_json_path=report_json_path,
        report_markdown_path=report_markdown_path,
        metadata_path=metadata_path,
        metadata=metadata,
        report=report,
    )


async def load_policy_report_artifact_async(
    directory: Path,
    *,
    expected_source_hashes: Mapping[str, Sha256Hex] | None = None,
) -> PolicyReportArtifact:
    """Validate a policy-report artifact without blocking Trio's event loop.

    Raises:
        ValueError: Metadata, content, source expectations, or rendering differ.

    """
    expected = None if expected_source_hashes is None else dict(expected_source_hashes)
    operation = partial(
        load_policy_report_artifact,
        directory,
        expected_source_hashes=expected,
    )
    return await trio.to_thread.run_sync(operation, abandon_on_cancel=False)
