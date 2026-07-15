"""Review, publish, and verify all-ambiguous target-resolution artifacts."""

import os
import shutil
import tempfile
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from types import MappingProxyType
from typing import Final, Self

from pydantic import ValidationError

from atlas_tools.common import canonical_json_bytes, sha256_bytes, sha256_file
from atlas_tools.relation.evaluation.analysis.api import SoftLabel
from atlas_tools.relation.evaluation.application._soft_label_codec import load_soft_labels
from atlas_tools.relation.evaluation.application.analysis_artifact import (
    ClassifierTargetResolutionBinding,
    SoftLabelsArtifact,
)
from atlas_tools.relation.evaluation.domain.api import (
    CardHash,
    RelationId,
    Sha256Hex,
    TargetResolutionManifest,
    TargetResolutionRow,
    TargetResolutionSourceName,
    target_resolution_artifact_id,
    target_resolution_counts,
    target_resolution_decisions_hash,
)
from atlas_tools.relation.evaluation.storage.api import VerifiedDeck, load_deck
from atlas_tools.relation.evaluation.visualization.api import (
    AmbiguousTargetReviewRow,
    run_ambiguous_target_review,
)

TARGET_RESOLUTIONS_FILENAME: Final = "target-resolutions.jsonl"
TARGET_RESOLUTIONS_MANIFEST_FILENAME: Final = "target-resolutions.manifest.json"


class AmbiguousTargetReviewCancelledError(RuntimeError):
    """Signal that a reviewer cancelled before publication."""


@dataclass(frozen=True, slots=True, kw_only=True)
class TargetResolutionPaths:
    """Name the immutable files in one target-resolution directory."""

    directory: Path
    rows_path: Path
    manifest_path: Path

    @classmethod
    def in_directory(cls, directory: Path) -> Self:
        return cls(
            directory=directory,
            rows_path=directory / TARGET_RESOLUTIONS_FILENAME,
            manifest_path=directory / TARGET_RESOLUTIONS_MANIFEST_FILENAME,
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class VerifiedTargetResolutionArtifact:
    """Expose source- and coverage-verified resolution bytes and rows."""

    paths: TargetResolutionPaths
    manifest: TargetResolutionManifest
    rows: tuple[TargetResolutionRow, ...]
    by_relation_id: Mapping[RelationId, TargetResolutionRow]
    rows_hash: Sha256Hex
    manifest_hash: Sha256Hex


def _load_soft_labels(source: SoftLabelsArtifact | Path) -> SoftLabelsArtifact:
    path = source.path if isinstance(source, SoftLabelsArtifact) else source
    loaded = load_soft_labels(path)
    if isinstance(source, SoftLabelsArtifact) and (
        loaded.metadata != source.metadata or loaded.rows != source.rows
    ):
        raise ValueError("soft-label artifact changed since it was verified")
    return loaded


def _load_deck(source: VerifiedDeck | Path) -> VerifiedDeck:
    directory = source.directory if isinstance(source, VerifiedDeck) else source
    loaded = load_deck(directory)
    if isinstance(source, VerifiedDeck) and (
        dict(loaded.source_hashes) != dict(source.source_hashes) or loaded.cards != source.cards
    ):
        raise ValueError("card deck changed since it was verified")
    return loaded


def _soft_label_hashes(soft_labels: SoftLabelsArtifact) -> tuple[Sha256Hex, Sha256Hex]:
    parquet_hash = soft_labels.metadata.content_hashes.get(soft_labels.path.name)
    if parquet_hash is None:
        raise ValueError("soft-label metadata does not bind its parquet filename")
    try:
        if sha256_file(soft_labels.path) != parquet_hash:
            raise ValueError("soft-label parquet changed after verification")
        metadata_hash = sha256_file(soft_labels.sidecar_path)
    except OSError as error:
        raise ValueError(f"cannot hash verified soft-label sources: {error}") from error
    return parquet_hash, metadata_hash


def _source_hashes(
    soft_labels: SoftLabelsArtifact,
    deck: VerifiedDeck,
) -> dict[TargetResolutionSourceName, Sha256Hex]:
    label_cards_hash = soft_labels.metadata.source_hashes.get("cards.jsonl")
    deck_cards_hash = deck.source_hashes.get("cards.jsonl")
    if label_cards_hash != deck_cards_hash:
        raise ValueError("soft-label metadata belongs to a different cards.jsonl deck")
    deck_manifest_hash = deck.source_hashes.get("cards.manifest.json")
    if deck_cards_hash is None or deck_manifest_hash is None:
        raise ValueError("verified deck lacks exact cards.jsonl or manifest hashes")
    parquet_hash, metadata_hash = _soft_label_hashes(soft_labels)
    return {
        "soft-labels.parquet": parquet_hash,
        "soft-labels.parquet.meta.json": metadata_hash,
        "cards.jsonl": deck_cards_hash,
        "cards.manifest.json": deck_manifest_hash,
    }


def _ambiguous_labels(
    soft_labels: SoftLabelsArtifact,
    deck: VerifiedDeck | None = None,
) -> dict[RelationId, SoftLabel]:
    selected: dict[RelationId, SoftLabel] = {}
    for label in soft_labels.rows:
        if label.n_votes != 0:
            continue
        if label.relation_id in selected:
            raise ValueError(f"soft labels repeat ambiguous relation {label.relation_id}")
        card = None if deck is None else deck.by_relation_id.get(label.relation_id)
        if deck is not None and card is None:
            raise ValueError(f"ambiguous relation {label.relation_id} is absent from the card deck")
        if card is not None and card.card_hash != label.card_hash:
            raise ValueError(f"ambiguous relation {label.relation_id} has a drifted card hash")
        selected[label.relation_id] = label
    return selected


def _validated_rows(
    resolutions: Sequence[TargetResolutionRow],
    *,
    soft_labels: SoftLabelsArtifact,
    deck: VerifiedDeck | None = None,
) -> tuple[TargetResolutionRow, ...]:
    ambiguous = _ambiguous_labels(soft_labels, deck)
    positive = {label.relation_id for label in soft_labels.rows if label.n_votes > 0}
    decisions: dict[RelationId, TargetResolutionRow] = {}
    for row in resolutions:
        if row.relation_id in decisions:
            raise ValueError(f"target resolutions repeat relation {row.relation_id}")
        label = ambiguous.get(row.relation_id)
        if label is None:
            if row.relation_id in positive:
                raise ValueError(
                    f"target resolution cannot override positive-weight label {row.relation_id}"
                )
            raise ValueError(f"target resolution includes extra relation {row.relation_id}")
        if row.card_hash != label.card_hash:
            raise ValueError(f"target resolution card hash differs for {row.relation_id}")
        decisions[row.relation_id] = row

    missing = sorted(set(ambiguous) - set(decisions))
    if missing:
        raise ValueError(f"target resolutions do not cover ambiguous relations: {missing}")
    return tuple(decisions[relation_id] for relation_id in sorted(decisions))


def _rows_payload(rows: Sequence[TargetResolutionRow]) -> bytes:
    return b"".join(canonical_json_bytes(row) + b"\n" for row in rows)


def _write_file(path: Path, payload: bytes) -> None:
    with path.open("xb") as output:
        written = output.write(payload)
        if written != len(payload):
            raise OSError(f"short write for {path}: wrote {written} of {len(payload)} bytes")
        output.flush()
        os.fsync(output.fileno())


def _fsync_directory(directory: Path) -> None:
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _destination_exists(path: Path) -> bool:
    return os.path.lexists(path)


def _require_destination_absent(path: Path) -> None:
    if _destination_exists(path):
        raise FileExistsError(f"target resolution destination already exists: {path}")


def _publish_directory(
    paths: TargetResolutionPaths,
    *,
    rows_payload: bytes,
    manifest_payload: bytes,
) -> None:
    _require_destination_absent(paths.directory)
    paths.directory.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(
        tempfile.mkdtemp(
            dir=paths.directory.parent,
            prefix=f".{paths.directory.name}.staging-",
        )
    )
    try:
        _write_file(staging / TARGET_RESOLUTIONS_FILENAME, rows_payload)
        _write_file(staging / TARGET_RESOLUTIONS_MANIFEST_FILENAME, manifest_payload)
        _fsync_directory(staging)
        _require_destination_absent(paths.directory)
        os.rename(staging, paths.directory)  # noqa: PTH104 -- publication requires os.rename
        _fsync_directory(paths.directory.parent)
    except BaseException:
        if staging.exists():
            shutil.rmtree(staging)
        raise


def publish_target_resolutions(
    *,
    output_directory: Path,
    resolutions: Sequence[TargetResolutionRow],
    reviewer: str,
    soft_labels: SoftLabelsArtifact | Path,
    deck: VerifiedDeck | Path,
) -> VerifiedTargetResolutionArtifact:
    """Validate exact ambiguous coverage and durably publish an immutable artifact."""
    paths = TargetResolutionPaths.in_directory(output_directory)
    _require_destination_absent(paths.directory)
    labels_artifact = _load_soft_labels(soft_labels)
    verified_deck = _load_deck(deck)
    source_hashes = _source_hashes(labels_artifact, verified_deck)
    rows = _validated_rows(
        tuple(resolutions),
        soft_labels=labels_artifact,
        deck=verified_deck,
    )
    rows_payload = _rows_payload(rows)
    decisions_hash = target_resolution_decisions_hash(rows)
    if sha256_bytes(rows_payload) != decisions_hash:
        raise RuntimeError("target resolution row encoders disagree")
    counts = target_resolution_counts(rows)
    artifact_id = target_resolution_artifact_id(
        reviewer=reviewer,
        source_hashes=source_hashes,
        decisions_hash=decisions_hash,
        counts=counts,
    )
    manifest = TargetResolutionManifest(
        reviewer=reviewer,
        source_hashes=source_hashes,
        decisions_hash=decisions_hash,
        counts=counts,
        artifact_id=artifact_id,
        created_at=datetime.now(UTC),
    )
    manifest_payload = canonical_json_bytes(manifest) + b"\n"
    _publish_directory(paths, rows_payload=rows_payload, manifest_payload=manifest_payload)
    return load_target_resolutions(
        output_directory,
        soft_labels=labels_artifact,
        expected_cards_hash=verified_deck.source_hashes["cards.jsonl"],
        expected_cards_manifest_hash=verified_deck.source_hashes["cards.manifest.json"],
        expected_source_hashes=source_hashes,
    )


def _decode_rows(path: Path, payload: bytes) -> tuple[TargetResolutionRow, ...]:
    if payload and not payload.endswith(b"\n"):
        raise ValueError(f"{path.name} must end with a newline")
    rows: list[TargetResolutionRow] = []
    for line_number, line in enumerate(payload.splitlines(), start=1):
        if not line:
            raise ValueError(f"{path.name} contains a blank line at {line_number}")
        try:
            rows.append(TargetResolutionRow.model_validate_json(line, strict=True))
        except ValidationError as error:
            raise ValueError(f"invalid {path.name} line {line_number}: {error}") from error
    return tuple(rows)


def _verify_rows(
    rows: tuple[TargetResolutionRow, ...],
    *,
    payload: bytes,
    manifest: TargetResolutionManifest,
) -> None:
    relation_ids = tuple(row.relation_id for row in rows)
    if len(set(relation_ids)) != len(relation_ids):
        raise ValueError("target resolution artifact repeats a relation ID")
    if relation_ids != tuple(sorted(relation_ids)):
        raise ValueError("target resolution rows are not in canonical relation order")
    if payload != _rows_payload(rows):
        raise ValueError("target resolution rows do not use canonical JSONL encoding")
    if sha256_bytes(payload) != manifest.decisions_hash:
        raise ValueError("target resolution decisions hash does not match durable rows")
    if target_resolution_counts(rows) != manifest.counts:
        raise ValueError("target resolution counts do not match durable rows")


def load_target_resolutions(
    directory: Path,
    *,
    soft_labels: SoftLabelsArtifact | Path,
    expected_cards_hash: Sha256Hex,
    expected_cards_manifest_hash: Sha256Hex,
    expected_source_hashes: Mapping[TargetResolutionSourceName, Sha256Hex] | None = None,
) -> VerifiedTargetResolutionArtifact:
    """Verify exact bytes, sources, and every-and-only ambiguous coverage."""
    labels_artifact = _load_soft_labels(soft_labels)
    paths = TargetResolutionPaths.in_directory(directory)
    try:
        rows_payload = paths.rows_path.read_bytes()
        manifest_payload = paths.manifest_path.read_bytes()
    except OSError as error:
        raise ValueError(f"cannot read target resolution artifact {directory}: {error}") from error
    try:
        manifest = TargetResolutionManifest.model_validate_json(manifest_payload, strict=True)
    except ValidationError as error:
        raise ValueError(f"invalid target resolution manifest: {error}") from error
    if manifest_payload != canonical_json_bytes(manifest) + b"\n":
        raise ValueError("target resolution manifest does not use canonical JSON encoding")
    if expected_source_hashes is not None and dict(manifest.source_hashes) != dict(
        expected_source_hashes
    ):
        raise ValueError("target resolution source hashes do not match expected inputs")
    parquet_hash, metadata_hash = _soft_label_hashes(labels_artifact)
    if labels_artifact.metadata.source_hashes.get("cards.jsonl") != expected_cards_hash:
        raise ValueError("soft labels belong to a different expected card deck")
    if manifest.source_hashes["cards.jsonl"] != expected_cards_hash:
        raise ValueError("target resolutions bind a different cards.jsonl")
    if manifest.source_hashes["cards.manifest.json"] != expected_cards_manifest_hash:
        raise ValueError("target resolutions bind a different cards manifest")
    if manifest.source_hashes["soft-labels.parquet"] != parquet_hash:
        raise ValueError("target resolutions bind a different soft-label parquet")
    if manifest.source_hashes["soft-labels.parquet.meta.json"] != metadata_hash:
        raise ValueError("target resolutions bind different soft-label metadata")
    rows = _decode_rows(paths.rows_path, rows_payload)
    _verify_rows(rows, payload=rows_payload, manifest=manifest)
    verified_rows = _validated_rows(rows, soft_labels=labels_artifact)
    by_relation_id = MappingProxyType({row.relation_id: row for row in verified_rows})
    return VerifiedTargetResolutionArtifact(
        paths=paths,
        manifest=manifest,
        rows=verified_rows,
        by_relation_id=by_relation_id,
        rows_hash=sha256_bytes(rows_payload),
        manifest_hash=sha256_bytes(manifest_payload),
    )


def classifier_target_resolution_binding(
    artifact: VerifiedTargetResolutionArtifact,
) -> ClassifierTargetResolutionBinding:
    """Bind a classifier to the exact verified resolution bytes it consumed."""
    return ClassifierTargetResolutionBinding(
        artifact_id=artifact.manifest.artifact_id,
        decisions_hash=artifact.rows_hash,
        manifest_hash=artifact.manifest_hash,
        policy_id=artifact.manifest.policy_id,
        reviewer=artifact.manifest.reviewer,
        counts=artifact.manifest.counts,
    )


def classifier_target_resolution_source_hashes(
    artifact: VerifiedTargetResolutionArtifact,
) -> dict[str, Sha256Hex]:
    """Name exact verified resolution bytes in classifier source provenance."""
    return {
        "target-resolutions/target-resolutions.jsonl": artifact.rows_hash,
        "target-resolutions/target-resolutions.manifest.json": artifact.manifest_hash,
    }


def _review_rows(
    soft_labels: SoftLabelsArtifact,
    deck: VerifiedDeck,
) -> tuple[AmbiguousTargetReviewRow, ...]:
    ambiguous = _ambiguous_labels(soft_labels, deck)
    return tuple(
        AmbiguousTargetReviewRow(
            relation_id=relation_id,
            card_hash=label.card_hash,
            card_text=deck.by_relation_id[relation_id].card_text,
            unclear_votes=label.unclear_votes,
            abstentions=label.abstentions,
        )
        for relation_id, label in sorted(ambiguous.items())
    )


def review_ambiguous_targets(
    *,
    soft_labels: SoftLabelsArtifact | Path,
    deck: VerifiedDeck | Path,
    reviewer: str,
    output_directory: Path,
) -> VerifiedTargetResolutionArtifact:
    """Run the human review and publish only after every ambiguous target is decided."""
    _require_destination_absent(output_directory)
    labels_artifact = _load_soft_labels(soft_labels)
    verified_deck = _load_deck(deck)
    _source_hashes(labels_artifact, verified_deck)
    rows = _review_rows(labels_artifact, verified_deck)
    decisions = run_ambiguous_target_review(rows)
    if decisions is None:
        raise AmbiguousTargetReviewCancelledError(
            "ambiguous target review cancelled; no artifact was published"
        )
    resolutions = tuple(
        TargetResolutionRow(
            relation_id=decision.relation_id,
            card_hash=CardHash(decision.card_hash),
            action=decision.action,
        )
        for decision in decisions
    )
    return publish_target_resolutions(
        output_directory=output_directory,
        resolutions=resolutions,
        reviewer=reviewer,
        soft_labels=labels_artifact,
        deck=verified_deck,
    )
