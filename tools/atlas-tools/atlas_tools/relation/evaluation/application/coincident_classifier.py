"""Verify Coincident reviews against exact classifier and grid inputs."""

from collections.abc import Mapping, Sequence
from pathlib import Path
from types import MappingProxyType

from pydantic import ValidationError

from atlas_tools.common import canonical_json_bytes, sha256_bytes, sha256_file
from atlas_tools.relation.evaluation.application.analysis_artifact import (
    ClassifierCoincidentReviewBinding,
    SoftLabelsArtifact,
)
from atlas_tools.relation.evaluation.application.coincident_review import (
    COINCIDENT_REVIEWS_FILENAME,
    COINCIDENT_REVIEWS_MANIFEST_FILENAME,
    CoincidentReviewPaths,
    VerifiedCoincidentReviewArtifact,
)
from atlas_tools.relation.evaluation.application.grid_deliverables import (
    CoincidentQueueRow,
    GridDeliverablesRun,
    load_grid_deliverables,
)
from atlas_tools.relation.evaluation.domain.api import (
    CoincidentReviewManifest,
    CoincidentReviewRow,
    CoincidentReviewSourceName,
    RelationId,
    Sha256Hex,
    coincident_review_counts,
)


def _load_deliverables(source: GridDeliverablesRun | Path) -> GridDeliverablesRun:
    directory = source.directory if isinstance(source, GridDeliverablesRun) else source
    expected = (
        dict(source.artifact.source_hashes) if isinstance(source, GridDeliverablesRun) else None
    )
    loaded = load_grid_deliverables(directory, expected_source_hashes=expected)
    if isinstance(source, GridDeliverablesRun) and (
        loaded.artifact != source.artifact or loaded.products != source.products
    ):
        raise ValueError("grid deliverables changed since they were verified")
    return loaded


def _expected_sources(
    deliverables: GridDeliverablesRun,
    soft_labels: SoftLabelsArtifact,
    *,
    expected_cards_hash: Sha256Hex,
    expected_config_hash: Sha256Hex | None,
) -> dict[CoincidentReviewSourceName, Sha256Hex]:
    sources = deliverables.artifact.source_hashes
    if sources.get("cards.jsonl") != expected_cards_hash:
        raise ValueError("grid deliverables belong to a different cards.jsonl artifact")
    cards_manifest_hash = sources.get("cards.manifest.json")
    if cards_manifest_hash is None:
        raise ValueError("grid deliverables do not bind a cards manifest")
    if expected_config_hash is not None and sources.get("grid-config.yaml") != expected_config_hash:
        raise ValueError("grid deliverables belong to a different grid configuration")
    if soft_labels.metadata.source_hashes.get("cards.jsonl") != expected_cards_hash:
        raise ValueError("soft labels belong to a different cards.jsonl artifact")
    for name, digest in soft_labels.metadata.source_hashes.items():
        if sources.get(name) != digest:
            raise ValueError(f"grid deliverables and soft labels differ on source {name}")
    try:
        gates_hash = sha256_file(deliverables.gates_path)
        queue_hash = sha256_file(deliverables.coincident_queue_path)
    except OSError as error:
        raise ValueError(f"cannot hash verified Coincident review sources: {error}") from error
    return {
        "grid-deliverables/gates.json": gates_hash,
        "grid-deliverables/coincident-queue.jsonl": queue_hash,
        "cards.jsonl": expected_cards_hash,
        "cards.manifest.json": cards_manifest_hash,
    }


def _queue_index(deliverables: GridDeliverablesRun) -> dict[RelationId, CoincidentQueueRow]:
    queue: dict[RelationId, CoincidentQueueRow] = {}
    for row in deliverables.products.coincident:
        if row.relation_id in queue:
            raise ValueError(f"Coincident queue repeats relation {row.relation_id}")
        queue[row.relation_id] = row
    return queue


def _validate_label_coverage(
    deliverables: GridDeliverablesRun,
    soft_labels: SoftLabelsArtifact,
) -> dict[RelationId, CoincidentQueueRow]:
    queue = _queue_index(deliverables)
    labels = {label.relation_id: label for label in soft_labels.rows if label.review}
    if set(queue) != set(labels):
        missing = tuple(sorted(set(labels) - set(queue)))
        extra = tuple(sorted(set(queue) - set(labels)))
        raise ValueError(
            "Coincident queue coverage differs from reviewed soft labels: "
            f"missing={missing}, extra={extra}"
        )
    for relation_id, queued in queue.items():
        label = labels[relation_id]
        if queued.card_hash != label.card_hash:
            raise ValueError(f"Coincident queue card hash differs for {relation_id}")
        queued_tally = (
            queued.tally.coincident,
            queued.tally.proximal,
            queued.tally.overlay,
            queued.tally.unclear,
            queued.tally.abstentions,
        )
        label_tally = (
            label.tally.coincident,
            label.tally.proximal,
            label.tally.overlay,
            label.unclear_votes,
            label.abstentions,
        )
        if queued_tally != label_tally:
            raise ValueError(f"Coincident queue tally differs from soft label {relation_id}")
    return queue


def _decode_rows(path: Path, payload: bytes) -> tuple[CoincidentReviewRow, ...]:
    if payload and not payload.endswith(b"\n"):
        raise ValueError(f"{path.name} must end with a newline")
    rows: list[CoincidentReviewRow] = []
    for line_number, line in enumerate(payload.splitlines(), start=1):
        if not line:
            raise ValueError(f"{path.name} contains a blank line at {line_number}")
        try:
            rows.append(CoincidentReviewRow.model_validate_json(line, strict=True))
        except ValidationError as error:
            raise ValueError(f"invalid {path.name} line {line_number}: {error}") from error
    return tuple(rows)


def _rows_payload(rows: Sequence[CoincidentReviewRow]) -> bytes:
    return b"".join(canonical_json_bytes(row) + b"\n" for row in rows)


def _validate_rows(
    rows: tuple[CoincidentReviewRow, ...],
    *,
    payload: bytes,
    manifest: CoincidentReviewManifest,
    queue: Mapping[RelationId, CoincidentQueueRow],
) -> tuple[CoincidentReviewRow, ...]:
    relation_ids = tuple(row.relation_id for row in rows)
    if relation_ids != tuple(sorted(relation_ids)) or len(relation_ids) != len(set(relation_ids)):
        raise ValueError("Coincident review rows require unique canonical relation order")
    if payload != _rows_payload(rows):
        raise ValueError("Coincident review rows do not use canonical JSONL encoding")
    if sha256_bytes(payload) != manifest.decisions_hash:
        raise ValueError("Coincident review decisions hash does not match durable rows")
    if coincident_review_counts(rows) != manifest.counts:
        raise ValueError("Coincident review counts do not match durable rows")
    if set(relation_ids) != set(queue):
        raise ValueError("Coincident reviews do not cover every-and-only queued relation")
    for row in rows:
        queued = queue[row.relation_id]
        if row.card_hash != queued.card_hash:
            raise ValueError(f"Coincident review card hash differs for {row.relation_id}")
        if row.action == "rejected" and queued.tally.proximal + queued.tally.overlay == 0:
            raise ValueError(
                f"rejecting Coincident for {row.relation_id} leaves no placement evidence; "
                "full placement adjudication is required"
            )
    return rows


def load_classifier_coincident_reviews(
    directory: Path,
    *,
    deliverables: GridDeliverablesRun | Path,
    soft_labels: SoftLabelsArtifact,
    expected_cards_hash: Sha256Hex,
    expected_config_hash: Sha256Hex | None = None,
) -> VerifiedCoincidentReviewArtifact:
    """Bind exact review bytes to the classifier's labels, deck, and grid."""
    verified_deliverables = _load_deliverables(deliverables)
    expected_sources = _expected_sources(
        verified_deliverables,
        soft_labels,
        expected_cards_hash=expected_cards_hash,
        expected_config_hash=expected_config_hash,
    )
    queue = _validate_label_coverage(verified_deliverables, soft_labels)
    paths = CoincidentReviewPaths.in_directory(directory)
    try:
        rows_payload = paths.rows_path.read_bytes()
        manifest_payload = paths.manifest_path.read_bytes()
    except OSError as error:
        raise ValueError(f"cannot read Coincident review artifact {directory}: {error}") from error
    try:
        manifest = CoincidentReviewManifest.model_validate_json(manifest_payload, strict=True)
    except ValidationError as error:
        raise ValueError(f"invalid Coincident review manifest: {error}") from error
    if manifest_payload != canonical_json_bytes(manifest) + b"\n":
        raise ValueError("Coincident review manifest does not use canonical JSON encoding")
    if dict(manifest.source_hashes) != expected_sources:
        raise ValueError("Coincident review source hashes do not match classifier inputs")
    rows = _validate_rows(
        _decode_rows(paths.rows_path, rows_payload),
        payload=rows_payload,
        manifest=manifest,
        queue=queue,
    )
    return VerifiedCoincidentReviewArtifact(
        paths=paths,
        manifest=manifest,
        rows=rows,
        by_relation_id=MappingProxyType({row.relation_id: row for row in rows}),
        rows_hash=sha256_bytes(rows_payload),
        manifest_hash=sha256_bytes(manifest_payload),
    )


def classifier_coincident_review_binding(
    artifact: VerifiedCoincidentReviewArtifact,
) -> ClassifierCoincidentReviewBinding:
    """Bind a classifier to the exact verified Coincident review bytes."""
    return ClassifierCoincidentReviewBinding(
        artifact_id=artifact.manifest.artifact_id,
        decisions_hash=artifact.rows_hash,
        manifest_hash=artifact.manifest_hash,
        policy_id=artifact.manifest.policy_id,
        reviewer=artifact.manifest.reviewer,
        counts=artifact.manifest.counts,
    )


def classifier_coincident_review_source_hashes(
    artifact: VerifiedCoincidentReviewArtifact,
) -> dict[str, Sha256Hex]:
    """Name the exact Coincident review files consumed by a classifier."""
    return {
        f"coincident-reviews/{COINCIDENT_REVIEWS_FILENAME}": artifact.rows_hash,
        f"coincident-reviews/{COINCIDENT_REVIEWS_MANIFEST_FILENAME}": artifact.manifest_hash,
    }
