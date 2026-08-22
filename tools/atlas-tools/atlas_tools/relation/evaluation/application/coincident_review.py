"""Review, publish, and verify obligatory Coincident queue decisions."""

import os
import shutil
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from types import MappingProxyType
from typing import Final, Self

from pydantic import ValidationError

from atlas_tools.common import canonical_json_bytes, sha256_bytes, sha256_file
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
    coincident_review_artifact_id,
    coincident_review_counts,
    coincident_review_decisions_hash,
)
from atlas_tools.relation.evaluation.storage.api import VerifiedDeck, load_deck
from atlas_tools.relation.evaluation.visualization.api import (
    CoincidentReviewViewRow,
    CoincidentVoteReviewEvidence,
    run_coincident_review,
)

COINCIDENT_REVIEWS_FILENAME: Final = "coincident-reviews.jsonl"
COINCIDENT_REVIEWS_MANIFEST_FILENAME: Final = "coincident-reviews.manifest.json"


class CoincidentReviewCancelledError(RuntimeError):
    """Signal that a reviewer cancelled before publication."""


@dataclass(frozen=True, slots=True, kw_only=True)
class CoincidentReviewPaths:
    """Name the immutable files in one Coincident review directory."""

    directory: Path
    rows_path: Path
    manifest_path: Path

    @classmethod
    def in_directory(cls, directory: Path) -> Self:
        return cls(
            directory=directory,
            rows_path=directory / COINCIDENT_REVIEWS_FILENAME,
            manifest_path=directory / COINCIDENT_REVIEWS_MANIFEST_FILENAME,
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class VerifiedCoincidentReviewArtifact:
    """Expose source- and coverage-verified Coincident review bytes and rows."""

    paths: CoincidentReviewPaths
    manifest: CoincidentReviewManifest
    rows: tuple[CoincidentReviewRow, ...]
    by_relation_id: Mapping[RelationId, CoincidentReviewRow]
    rows_hash: Sha256Hex
    manifest_hash: Sha256Hex


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


def _load_deck(source: VerifiedDeck | Path) -> VerifiedDeck:
    directory = source.directory if isinstance(source, VerifiedDeck) else source
    loaded = load_deck(directory)
    if isinstance(source, VerifiedDeck) and (
        dict(loaded.source_hashes) != dict(source.source_hashes) or loaded.cards != source.cards
    ):
        raise ValueError("card deck changed since it was verified")
    return loaded


def _queue_by_relation(
    deliverables: GridDeliverablesRun,
    deck: VerifiedDeck,
) -> dict[RelationId, CoincidentQueueRow]:
    for source_name in ("cards.jsonl", "cards.manifest.json"):
        if deliverables.artifact.source_hashes.get(source_name) != deck.source_hashes.get(
            source_name
        ):
            raise ValueError(f"grid deliverables belong to a different {source_name} artifact")

    queue: dict[RelationId, CoincidentQueueRow] = {}
    for row in deliverables.products.coincident:
        if row.relation_id in queue:
            raise ValueError(f"Coincident queue repeats relation {row.relation_id}")
        card = deck.by_relation_id.get(row.relation_id)
        if card is None:
            raise ValueError(
                f"Coincident queue relation {row.relation_id} is absent from the card deck"
            )
        if card.card_hash != row.card_hash:
            raise ValueError(f"Coincident queue relation {row.relation_id} has a drifted card hash")
        queue[row.relation_id] = row
    return queue


def _source_hashes(
    deliverables: GridDeliverablesRun,
    deck: VerifiedDeck,
) -> dict[CoincidentReviewSourceName, Sha256Hex]:
    _queue_by_relation(deliverables, deck)
    try:
        gates_hash = sha256_file(deliverables.gates_path)
        queue_hash = sha256_file(deliverables.coincident_queue_path)
    except OSError as error:
        raise ValueError(f"cannot hash verified Coincident review sources: {error}") from error
    return {
        "grid-deliverables/gates.json": gates_hash,
        "grid-deliverables/coincident-queue.jsonl": queue_hash,
        "cards.jsonl": deck.source_hashes["cards.jsonl"],
        "cards.manifest.json": deck.source_hashes["cards.manifest.json"],
    }


def _validated_rows(
    reviews: Sequence[CoincidentReviewRow],
    *,
    deliverables: GridDeliverablesRun,
    deck: VerifiedDeck,
) -> tuple[CoincidentReviewRow, ...]:
    queue = _queue_by_relation(deliverables, deck)
    decisions: dict[RelationId, CoincidentReviewRow] = {}
    for row in reviews:
        if row.relation_id in decisions:
            raise ValueError(f"Coincident reviews repeat relation {row.relation_id}")
        queued = queue.get(row.relation_id)
        if queued is None:
            raise ValueError(f"Coincident reviews include extra relation {row.relation_id}")
        if row.card_hash != queued.card_hash:
            raise ValueError(f"Coincident review card hash differs for {row.relation_id}")
        if row.action == "rejected" and queued.tally.proximal + queued.tally.overlay == 0:
            raise ValueError(
                f"rejecting Coincident for {row.relation_id} leaves no placement evidence; "
                "full placement adjudication is required"
            )
        decisions[row.relation_id] = row

    missing = sorted(set(queue) - set(decisions))
    if missing:
        raise ValueError(f"Coincident reviews do not cover queued relations: {missing}")
    return tuple(decisions[relation_id] for relation_id in sorted(decisions))


def _rows_payload(rows: Sequence[CoincidentReviewRow]) -> bytes:
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
        raise FileExistsError(f"Coincident review destination already exists: {path}")


def _publish_directory(
    paths: CoincidentReviewPaths,
    *,
    rows_payload: bytes,
    manifest_payload: bytes,
) -> None:
    _require_destination_absent(paths.directory)
    paths.directory.parent.mkdir(parents=True, exist_ok=True)
    staging = paths.directory.parent / f".{paths.directory.name}.staging"
    try:
        staging.mkdir()
    except FileExistsError as error:
        raise FileExistsError(
            f"Coincident review publication already in progress: {staging}"
        ) from error
    try:
        _write_file(staging / COINCIDENT_REVIEWS_FILENAME, rows_payload)
        _write_file(staging / COINCIDENT_REVIEWS_MANIFEST_FILENAME, manifest_payload)
        _fsync_directory(staging)
        _require_destination_absent(paths.directory)
        os.rename(staging, paths.directory)  # noqa: PTH104 -- publication requires os.rename
        _fsync_directory(paths.directory.parent)
    except BaseException:
        if staging.exists():
            shutil.rmtree(staging)
        raise


def publish_coincident_reviews(
    *,
    output_directory: Path,
    reviews: Sequence[CoincidentReviewRow],
    reviewer: str,
    deliverables: GridDeliverablesRun | Path,
    deck: VerifiedDeck | Path,
) -> VerifiedCoincidentReviewArtifact:
    """Validate exact queue coverage and durably publish an immutable artifact."""
    paths = CoincidentReviewPaths.in_directory(output_directory)
    _require_destination_absent(paths.directory)
    verified_deliverables = _load_deliverables(deliverables)
    verified_deck = _load_deck(deck)
    source_hashes = _source_hashes(verified_deliverables, verified_deck)
    rows = _validated_rows(
        tuple(reviews),
        deliverables=verified_deliverables,
        deck=verified_deck,
    )
    rows_payload = _rows_payload(rows)
    decisions_hash = coincident_review_decisions_hash(rows)
    if sha256_bytes(rows_payload) != decisions_hash:
        raise RuntimeError("Coincident review row encoders disagree")
    counts = coincident_review_counts(rows)
    artifact_id = coincident_review_artifact_id(
        reviewer=reviewer,
        source_hashes=source_hashes,
        decisions_hash=decisions_hash,
        counts=counts,
    )
    manifest = CoincidentReviewManifest(
        reviewer=reviewer,
        source_hashes=source_hashes,
        decisions_hash=decisions_hash,
        counts=counts,
        artifact_id=artifact_id,
        created_at=datetime.now(UTC),
    )
    manifest_payload = canonical_json_bytes(manifest) + b"\n"
    _publish_directory(paths, rows_payload=rows_payload, manifest_payload=manifest_payload)
    return load_coincident_reviews(
        output_directory,
        deliverables=verified_deliverables,
        deck=verified_deck,
    )


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


def _verify_rows(
    rows: tuple[CoincidentReviewRow, ...],
    *,
    payload: bytes,
    manifest: CoincidentReviewManifest,
) -> None:
    relation_ids = tuple(row.relation_id for row in rows)
    if len(set(relation_ids)) != len(relation_ids):
        raise ValueError("Coincident review artifact repeats a relation ID")
    if relation_ids != tuple(sorted(relation_ids)):
        raise ValueError("Coincident review rows are not in canonical relation order")
    if payload != _rows_payload(rows):
        raise ValueError("Coincident review rows do not use canonical JSONL encoding")
    if sha256_bytes(payload) != manifest.decisions_hash:
        raise ValueError("Coincident review decisions hash does not match durable rows")
    if coincident_review_counts(rows) != manifest.counts:
        raise ValueError("Coincident review counts do not match durable rows")


def load_coincident_reviews(
    directory: Path,
    *,
    deliverables: GridDeliverablesRun | Path,
    deck: VerifiedDeck | Path,
) -> VerifiedCoincidentReviewArtifact:
    """Verify exact bytes, sources, and every-and-only Coincident queue coverage."""
    verified_deliverables = _load_deliverables(deliverables)
    verified_deck = _load_deck(deck)
    expected_sources = _source_hashes(verified_deliverables, verified_deck)
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
        raise ValueError("Coincident review source hashes do not match the requested inputs")
    rows = _decode_rows(paths.rows_path, rows_payload)
    _verify_rows(rows, payload=rows_payload, manifest=manifest)
    verified_rows = _validated_rows(
        rows,
        deliverables=verified_deliverables,
        deck=verified_deck,
    )
    by_relation_id = MappingProxyType({row.relation_id: row for row in verified_rows})
    return VerifiedCoincidentReviewArtifact(
        paths=paths,
        manifest=manifest,
        rows=verified_rows,
        by_relation_id=by_relation_id,
        rows_hash=sha256_bytes(rows_payload),
        manifest_hash=sha256_bytes(manifest_payload),
    )


def _review_rows(
    deliverables: GridDeliverablesRun,
    deck: VerifiedDeck,
) -> tuple[CoincidentReviewViewRow, ...]:
    queue = _queue_by_relation(deliverables, deck)
    return tuple(
        CoincidentReviewViewRow(
            relation_id=relation_id,
            card_hash=row.card_hash,
            card_text=deck.by_relation_id[relation_id].card_text,
            coincident_families=row.coincident_families,
            coincident_votes=row.tally.coincident,
            proximal_votes=row.tally.proximal,
            overlay_votes=row.tally.overlay,
            unclear_votes=row.tally.unclear,
            abstentions=row.tally.abstentions,
            votes=tuple(
                CoincidentVoteReviewEvidence(
                    family_id=vote.family_id,
                    verdict=vote.verdict,
                    repeat_index=vote.repeat_index,
                    reason=vote.reason,
                )
                for vote in row.votes
            ),
        )
        for relation_id, row in sorted(queue.items())
    )


def review_coincident_queue(
    *,
    deliverables: GridDeliverablesRun | Path,
    deck: VerifiedDeck | Path,
    reviewer: str,
    output_directory: Path,
) -> VerifiedCoincidentReviewArtifact:
    """Run human review and publish only after every Coincident row is decided."""
    _require_destination_absent(output_directory)
    verified_deliverables = _load_deliverables(deliverables)
    verified_deck = _load_deck(deck)
    _source_hashes(verified_deliverables, verified_deck)
    decisions = run_coincident_review(_review_rows(verified_deliverables, verified_deck))
    if decisions is None:
        raise CoincidentReviewCancelledError(
            "Coincident review cancelled; no artifact was published"
        )
    reviews = tuple(
        CoincidentReviewRow(
            relation_id=decision.relation_id,
            card_hash=decision.card_hash,
            action=decision.action,
        )
        for decision in decisions
    )
    return publish_coincident_reviews(
        output_directory=output_directory,
        reviews=reviews,
        reviewer=reviewer,
        deliverables=verified_deliverables,
        deck=verified_deck,
    )
