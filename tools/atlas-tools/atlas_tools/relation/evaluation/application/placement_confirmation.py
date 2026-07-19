"""Confirm, publish, and verify voluntary unambiguous-placement decisions."""

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

from atlas_tools.common import canonical_json_bytes, sha256_bytes
from atlas_tools.relation.evaluation.analysis.api import SoftLabel
from atlas_tools.relation.evaluation.application.analysis_codec import SoftLabelsArtifact
from atlas_tools.relation.evaluation.application.target_resolution import (
    load_verified_deck,
    load_verified_soft_labels,
    review_source_hashes,
)
from atlas_tools.relation.evaluation.domain.api import (
    CardHash,
    PlacementConfirmationManifest,
    PlacementConfirmationRow,
    PlacementConfirmationSourceName,
    RelationId,
    Sha256Hex,
    placement_confirmation_artifact_id,
    placement_confirmation_counts,
    placement_confirmation_decisions_hash,
)
from atlas_tools.relation.evaluation.storage.api import VerifiedDeck
from atlas_tools.relation.evaluation.visualization.api import (
    PlacementConfirmationReviewRow,
    run_placement_confirmation,
)

PLACEMENT_CONFIRMATIONS_FILENAME: Final = "placement-confirmations.jsonl"
PLACEMENT_CONFIRMATIONS_MANIFEST_FILENAME: Final = "placement-confirmations.manifest.json"


class PlacementConfirmationCancelledError(RuntimeError):
    """Signal that a reviewer cancelled before publication."""


@dataclass(frozen=True, slots=True, kw_only=True)
class PlacementConfirmationPaths:
    """Name the immutable files in one placement-confirmation directory."""

    directory: Path
    rows_path: Path
    manifest_path: Path

    @classmethod
    def in_directory(cls, directory: Path) -> Self:
        return cls(
            directory=directory,
            rows_path=directory / PLACEMENT_CONFIRMATIONS_FILENAME,
            manifest_path=directory / PLACEMENT_CONFIRMATIONS_MANIFEST_FILENAME,
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class VerifiedPlacementConfirmationArtifact:
    """Expose source- and population-verified confirmation bytes and rows."""

    paths: PlacementConfirmationPaths
    manifest: PlacementConfirmationManifest
    rows: tuple[PlacementConfirmationRow, ...]
    by_relation_id: Mapping[RelationId, PlacementConfirmationRow]
    rows_hash: Sha256Hex
    manifest_hash: Sha256Hex


def _positive_labels(
    soft_labels: SoftLabelsArtifact,
    deck: VerifiedDeck | None = None,
) -> dict[RelationId, SoftLabel]:
    selected: dict[RelationId, SoftLabel] = {}
    for label in soft_labels.rows:
        if label.n_votes == 0:
            continue
        if label.relation_id in selected:
            raise ValueError(f"soft labels repeat positive-evidence relation {label.relation_id}")
        card = None if deck is None else deck.by_relation_id.get(label.relation_id)
        if deck is not None and card is None:
            raise ValueError(
                f"positive-evidence relation {label.relation_id} is absent from the card deck"
            )
        if card is not None and card.card_hash != label.card_hash:
            raise ValueError(
                f"positive-evidence relation {label.relation_id} has a drifted card hash"
            )
        selected[label.relation_id] = label
    return selected


def _validated_rows(
    confirmations: Sequence[PlacementConfirmationRow],
    *,
    soft_labels: SoftLabelsArtifact,
    deck: VerifiedDeck | None = None,
) -> tuple[PlacementConfirmationRow, ...]:
    positive = _positive_labels(soft_labels, deck)
    ambiguous = {label.relation_id for label in soft_labels.rows if label.n_votes == 0}
    decisions: dict[RelationId, PlacementConfirmationRow] = {}
    for row in confirmations:
        if row.relation_id in decisions:
            raise ValueError(f"placement confirmations repeat relation {row.relation_id}")
        label = positive.get(row.relation_id)
        if label is None:
            if row.relation_id in ambiguous:
                raise ValueError(
                    f"ambiguous relation {row.relation_id} belongs to target resolutions, "
                    "not voluntary confirmation"
                )
            raise ValueError(
                f"placement confirmation includes unlabeled relation {row.relation_id}"
            )
        if row.card_hash != label.card_hash:
            raise ValueError(f"placement confirmation card hash differs for {row.relation_id}")
        decisions[row.relation_id] = row

    return tuple(decisions[relation_id] for relation_id in sorted(decisions))


def _rows_payload(rows: Sequence[PlacementConfirmationRow]) -> bytes:
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


def _require_destination_absent(path: Path) -> None:
    if os.path.lexists(path):
        raise FileExistsError(f"placement confirmation destination already exists: {path}")


def _publish_directory(
    paths: PlacementConfirmationPaths,
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
        _write_file(staging / PLACEMENT_CONFIRMATIONS_FILENAME, rows_payload)
        _write_file(staging / PLACEMENT_CONFIRMATIONS_MANIFEST_FILENAME, manifest_payload)
        _fsync_directory(staging)
        _require_destination_absent(paths.directory)
        os.rename(staging, paths.directory)  # noqa: PTH104 -- publication requires os.rename
        _fsync_directory(paths.directory.parent)
    except BaseException:
        if staging.exists():
            shutil.rmtree(staging)
        raise


def publish_placement_confirmations(
    *,
    output_directory: Path,
    confirmations: Sequence[PlacementConfirmationRow],
    reviewer: str,
    soft_labels: SoftLabelsArtifact | Path,
    deck: VerifiedDeck | Path,
) -> VerifiedPlacementConfirmationArtifact:
    """Validate the positive-evidence population and durably publish an immutable artifact.

    Coverage is voluntary: any non-empty subset of positive-evidence labels
    publishes. Ambiguous labels are rejected - they belong to the
    target-resolution artifact, whose every-and-only-ambiguous contract stays
    intact.
    """
    paths = PlacementConfirmationPaths.in_directory(output_directory)
    _require_destination_absent(paths.directory)
    if not confirmations:
        raise ValueError("no placements were confirmed; nothing to publish")
    labels_artifact = load_verified_soft_labels(soft_labels)
    verified_deck = load_verified_deck(deck)
    source_hashes = review_source_hashes(labels_artifact, verified_deck)
    rows = _validated_rows(
        tuple(confirmations),
        soft_labels=labels_artifact,
        deck=verified_deck,
    )
    rows_payload = _rows_payload(rows)
    decisions_hash = placement_confirmation_decisions_hash(rows)
    if sha256_bytes(rows_payload) != decisions_hash:
        raise RuntimeError("placement confirmation row encoders disagree")
    counts = placement_confirmation_counts(rows)
    artifact_id = placement_confirmation_artifact_id(
        reviewer=reviewer,
        source_hashes=source_hashes,
        decisions_hash=decisions_hash,
        counts=counts,
    )
    manifest = PlacementConfirmationManifest(
        reviewer=reviewer,
        source_hashes=source_hashes,
        decisions_hash=decisions_hash,
        counts=counts,
        artifact_id=artifact_id,
        created_at=datetime.now(UTC),
    )
    manifest_payload = canonical_json_bytes(manifest) + b"\n"
    _publish_directory(paths, rows_payload=rows_payload, manifest_payload=manifest_payload)
    return load_placement_confirmations(
        output_directory,
        soft_labels=labels_artifact,
        expected_cards_hash=verified_deck.source_hashes["cards.jsonl"],
        expected_cards_manifest_hash=verified_deck.source_hashes["cards.manifest.json"],
        expected_source_hashes=source_hashes,
    )


def _decode_rows(path: Path, payload: bytes) -> tuple[PlacementConfirmationRow, ...]:
    if payload and not payload.endswith(b"\n"):
        raise ValueError(f"{path.name} must end with a newline")
    rows: list[PlacementConfirmationRow] = []
    for line_number, line in enumerate(payload.splitlines(), start=1):
        if not line:
            raise ValueError(f"{path.name} contains a blank line at {line_number}")
        try:
            rows.append(PlacementConfirmationRow.model_validate_json(line, strict=True))
        except ValidationError as error:
            raise ValueError(f"invalid {path.name} line {line_number}: {error}") from error
    return tuple(rows)


def _verify_rows(
    rows: tuple[PlacementConfirmationRow, ...],
    *,
    payload: bytes,
    manifest: PlacementConfirmationManifest,
) -> None:
    relation_ids = tuple(row.relation_id for row in rows)
    if len(set(relation_ids)) != len(relation_ids):
        raise ValueError("placement confirmation artifact repeats a relation ID")
    if relation_ids != tuple(sorted(relation_ids)):
        raise ValueError("placement confirmation rows are not in canonical relation order")
    if payload != _rows_payload(rows):
        raise ValueError("placement confirmation rows do not use canonical JSONL encoding")
    if sha256_bytes(payload) != manifest.decisions_hash:
        raise ValueError("placement confirmation decisions hash does not match durable rows")
    if placement_confirmation_counts(rows) != manifest.counts:
        raise ValueError("placement confirmation counts do not match durable rows")


def load_placement_confirmations(
    directory: Path,
    *,
    soft_labels: SoftLabelsArtifact | Path,
    expected_cards_hash: Sha256Hex,
    expected_cards_manifest_hash: Sha256Hex,
    expected_source_hashes: Mapping[PlacementConfirmationSourceName, Sha256Hex] | None = None,
) -> VerifiedPlacementConfirmationArtifact:
    """Verify exact bytes, sources, and the positive-evidence population."""
    labels_artifact = load_verified_soft_labels(soft_labels)
    paths = PlacementConfirmationPaths.in_directory(directory)
    try:
        rows_payload = paths.rows_path.read_bytes()
        manifest_payload = paths.manifest_path.read_bytes()
    except OSError as error:
        raise ValueError(
            f"cannot read placement confirmation artifact {directory}: {error}"
        ) from error
    try:
        manifest = PlacementConfirmationManifest.model_validate_json(manifest_payload, strict=True)
    except ValidationError as error:
        raise ValueError(f"invalid placement confirmation manifest: {error}") from error
    if manifest_payload != canonical_json_bytes(manifest) + b"\n":
        raise ValueError("placement confirmation manifest does not use canonical JSON encoding")
    if expected_source_hashes is not None and dict(manifest.source_hashes) != dict(
        expected_source_hashes
    ):
        raise ValueError("placement confirmation source hashes do not match expected inputs")
    if labels_artifact.metadata.source_hashes.get("cards.jsonl") != expected_cards_hash:
        raise ValueError("soft labels belong to a different expected card deck")
    if manifest.source_hashes["cards.jsonl"] != expected_cards_hash:
        raise ValueError("placement confirmations bind a different cards.jsonl")
    if manifest.source_hashes["cards.manifest.json"] != expected_cards_manifest_hash:
        raise ValueError("placement confirmations bind a different cards manifest")
    rows = _decode_rows(paths.rows_path, rows_payload)
    _verify_rows(rows, payload=rows_payload, manifest=manifest)
    verified_rows = _validated_rows(rows, soft_labels=labels_artifact)
    by_relation_id = MappingProxyType({row.relation_id: row for row in verified_rows})
    return VerifiedPlacementConfirmationArtifact(
        paths=paths,
        manifest=manifest,
        rows=verified_rows,
        by_relation_id=by_relation_id,
        rows_hash=sha256_bytes(rows_payload),
        manifest_hash=sha256_bytes(manifest_payload),
    )


def placement_confirmation_source_hashes(
    artifact: VerifiedPlacementConfirmationArtifact,
) -> dict[str, Sha256Hex]:
    """Name exact verified confirmation bytes in export source provenance."""
    return {
        "placement-confirmations/placement-confirmations.jsonl": artifact.rows_hash,
        "placement-confirmations/placement-confirmations.manifest.json": artifact.manifest_hash,
    }


def _review_rows(
    soft_labels: SoftLabelsArtifact,
    deck: VerifiedDeck,
) -> tuple[PlacementConfirmationReviewRow, ...]:
    positive = _positive_labels(soft_labels, deck)
    return tuple(
        PlacementConfirmationReviewRow(
            relation_id=relation_id,
            card_hash=label.card_hash,
            card_text=deck.by_relation_id[relation_id].card_text,
            coincident_votes=label.tally.coincident,
            proximal_votes=label.tally.proximal,
            overlay_votes=label.tally.overlay,
        )
        for relation_id, label in sorted(positive.items())
    )


def confirm_placements(
    *,
    soft_labels: SoftLabelsArtifact | Path,
    deck: VerifiedDeck | Path,
    reviewer: str,
    output_directory: Path,
) -> VerifiedPlacementConfirmationArtifact:
    """Run the voluntary confirmation review and publish the confirmed subset."""
    _require_destination_absent(output_directory)
    labels_artifact = load_verified_soft_labels(soft_labels)
    verified_deck = load_verified_deck(deck)
    review_source_hashes(labels_artifact, verified_deck)
    rows = _review_rows(labels_artifact, verified_deck)
    if not rows:
        raise ValueError("the corpus has no placement-evidence labels to confirm")
    decisions = run_placement_confirmation(rows)
    if decisions is None:
        raise PlacementConfirmationCancelledError(
            "placement confirmation cancelled; no artifact was published"
        )
    confirmations = tuple(
        PlacementConfirmationRow(
            relation_id=decision.relation_id,
            card_hash=CardHash(decision.card_hash),
            action=decision.action,
        )
        for decision in decisions
    )
    return publish_placement_confirmations(
        output_directory=output_directory,
        confirmations=confirmations,
        reviewer=reviewer,
        soft_labels=labels_artifact,
        deck=verified_deck,
    )
