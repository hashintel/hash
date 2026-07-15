"""Load, validate, and publish the policy-report artifact stack.

The composition facade loads a completed grid exactly once. Optional gold and
classifier inputs are then validated against that immutable snapshot.
`report.meta.json` is published last and binds deterministic ASCII JSON and
Markdown content to every transitive source hash available at this boundary.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from functools import partial
from pathlib import Path

import trio

from atlas_tools.relation.evaluation.analysis.api import (
    PolicyReport,
    PolicyReportWithoutGold,
    PublishedPolicyReport,
    build_policy_report,
    policy_report_bytes,
    render_published_policy_report_markdown,
    without_gold_measurements,
)
from atlas_tools.relation.evaluation.application._analysis_codec import (
    atomic_replace,
    canonical_json_bytes,
    read_bytes,
    require_exact_mapping,
    sha256_bytes,
    verify_content_hashes,
    verify_expected_sources,
)
from atlas_tools.relation.evaluation.application._policy_report_metadata import (
    POLICY_REPORT_ALGORITHMS,
    REPORT_JSON_FILENAME,
    REPORT_MARKDOWN_FILENAME,
    REPORT_METADATA_FILENAME,
    LoadedPolicyReportMetadata,
    PolicyReportMetadata,
    expected_policy_report_algorithms,
    expected_policy_report_schema_hashes,
    load_policy_report_metadata,
    policy_report_schema_hashes,
)
from atlas_tools.relation.evaluation.application._policy_report_source import (
    LoadedGold,
    report_source_hashes,
)
from atlas_tools.relation.evaluation.application._policy_report_source import (
    load_gold as _load_gold,
)
from atlas_tools.relation.evaluation.application._policy_report_source import (
    load_snapshot_inputs as _load_snapshot_inputs,
)
from atlas_tools.relation.evaluation.application.analysis_artifact import (
    ClassifierBundle,
    hash_mapping,
)
from atlas_tools.relation.evaluation.application.completed import (
    CompletedGrid,
    load_completed_grid_async,
)
from atlas_tools.relation.evaluation.domain.api import Sha256Hex


@dataclass(frozen=True, slots=True, kw_only=True)
class PolicyReportArtifact:
    """A fully validated report and all of its durable paths."""

    directory: Path
    report_json_path: Path
    report_markdown_path: Path
    metadata_path: Path
    metadata: LoadedPolicyReportMetadata
    report: PublishedPolicyReport


def load_gold(path: Path) -> LoadedGold:
    """Load strict JSONL gold labels through the report application facade."""
    return _load_gold(path)


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


def _publish_report(
    *,
    completed: CompletedGrid,
    gold: LoadedGold | None,
    classifier: ClassifierBundle | None,
    output_directory: Path,
) -> PolicyReportArtifact:
    if classifier is not None:
        _validate_classifier(completed, classifier)
    measured_report = build_policy_report(
        completed.analysis,
        () if gold is None else gold.rows,
        completed.prepared.config.report,
        rubric_version=completed.prepared.config.rubric_version,
        classifier_predictions=(None if classifier is None else classifier.fit.out_of_fold),
    )
    report: PublishedPolicyReport = (
        measured_report if gold is not None else without_gold_measurements(measured_report)
    )
    report_json = policy_report_bytes(report)
    report_markdown = render_published_policy_report_markdown(report).encode("ascii")
    metadata = PolicyReportMetadata(
        schema_hashes=policy_report_schema_hashes(report.schema_version),
        algorithms=POLICY_REPORT_ALGORITHMS,
        algorithm_hash=hash_mapping(POLICY_REPORT_ALGORITHMS),
        source_hashes=report_source_hashes(completed, gold, classifier),
        content_hashes={
            REPORT_JSON_FILENAME: sha256_bytes(report_json),
            REPORT_MARKDOWN_FILENAME: sha256_bytes(report_markdown),
        },
        report_schema_version=report.schema_version,
        gold_state="not-provided" if gold is None else "evaluated",
        gold_rows=None if gold is None else len(gold.rows),
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
    gold: LoadedGold | None,
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


async def write_policy_report_from_grid_async(
    *,
    completed: CompletedGrid,
    gold_path: Path | None = None,
    output_directory: Path,
    classifier_directory: Path | None = None,
    closure_directory: Path | None = None,
    soft_labels_path: Path | None = None,
    resolutions_directory: Path | None = None,
    coincident_reviews_directory: Path | None = None,
    deliverables_directory: Path | None = None,
) -> PolicyReportArtifact:
    """Publish a report from one already validated completed-grid snapshot.

    Raises:
        ValueError: Gold, classifier, grid, or durable report contracts differ.
        OSError: Report files cannot be durably published.

    """
    gold, classifier = await _load_snapshot_inputs(
        gold_path=gold_path,
        classifier_directory=classifier_directory,
        closure_directory=closure_directory,
        soft_labels_path=soft_labels_path,
        resolutions_directory=resolutions_directory,
        coincident_reviews_directory=coincident_reviews_directory,
        deliverables_directory=deliverables_directory,
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
    gold_path: Path | None = None,
    output_directory: Path,
    classifier_directory: Path | None = None,
    closure_directory: Path | None = None,
    soft_labels_path: Path | None = None,
    resolutions_directory: Path | None = None,
    coincident_reviews_directory: Path | None = None,
    deliverables_directory: Path | None = None,
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
        closure_directory=closure_directory,
        soft_labels_path=soft_labels_path,
        resolutions_directory=resolutions_directory,
        coincident_reviews_directory=coincident_reviews_directory,
        deliverables_directory=deliverables_directory,
    )
    return trio.run(operation)


async def write_policy_report_async(
    *,
    run_directory: Path,
    cards_directory: Path,
    config_path: Path,
    gold_path: Path | None = None,
    output_directory: Path,
    classifier_directory: Path | None = None,
    closure_directory: Path | None = None,
    soft_labels_path: Path | None = None,
    resolutions_directory: Path | None = None,
    coincident_reviews_directory: Path | None = None,
    deliverables_directory: Path | None = None,
) -> PolicyReportArtifact:
    """Load independent inputs concurrently and publish one policy report.

    The completed grid is loaded exactly once. Requested gold and classifier
    bytes are read concurrently with that snapshot and validated before publication.

    Raises:
        ValueError: A completed-grid, gold, classifier, or report contract fails.
        OSError: Report files cannot be durably published.

    """
    completed_values: list[CompletedGrid] = []
    snapshot_values: list[tuple[LoadedGold | None, ClassifierBundle | None]] = []

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
                closure_directory=closure_directory,
                soft_labels_path=soft_labels_path,
                resolutions_directory=resolutions_directory,
                coincident_reviews_directory=coincident_reviews_directory,
                deliverables_directory=deliverables_directory,
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
    gold_path: Path | None = None,
    output_directory: Path,
    classifier_directory: Path | None = None,
    closure_directory: Path | None = None,
    soft_labels_path: Path | None = None,
    resolutions_directory: Path | None = None,
    coincident_reviews_directory: Path | None = None,
    deliverables_directory: Path | None = None,
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
        closure_directory=closure_directory,
        soft_labels_path=soft_labels_path,
        resolutions_directory=resolutions_directory,
        coincident_reviews_directory=coincident_reviews_directory,
        deliverables_directory=deliverables_directory,
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
    metadata = load_policy_report_metadata(metadata_path)
    require_exact_mapping(
        metadata.schema_hashes,
        expected_policy_report_schema_hashes(metadata),
        label="policy-report schema hashes",
    )
    require_exact_mapping(
        metadata.algorithms,
        expected_policy_report_algorithms(metadata),
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
        report: PublishedPolicyReport = (
            PolicyReport.model_validate_json(report_json, strict=True)
            if metadata.gold_state == "evaluated"
            else PolicyReportWithoutGold.model_validate_json(report_json, strict=True)
        )
    except ValueError as error:
        raise ValueError(f"invalid policy report JSON {report_json_path}: {error}") from error
    if report_json != policy_report_bytes(report):
        raise ValueError("policy report JSON is not canonical")
    expected_markdown = render_published_policy_report_markdown(report).encode("ascii")
    if report_markdown != expected_markdown:
        raise ValueError("policy report Markdown differs from its machine report")
    if metadata.gold_state == "evaluated":
        if not isinstance(report, PolicyReport) or metadata.gold_rows != report.gold_cards:
            raise ValueError("policy report metadata gold state differs from report")
    elif not isinstance(report, PolicyReportWithoutGold):
        raise ValueError("policy report metadata gold state differs from report")
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
