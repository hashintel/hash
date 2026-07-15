"""Define typed identities for obligatory Coincident queue review."""

import hashlib
import json
from collections.abc import Mapping, Sequence
from typing import Final, Literal, Self

from pydantic import AwareDatetime, NonNegativeInt, model_validator

from atlas_tools.relation.domain.api import (
    FrozenMapping,
    FrozenModel,
    NonEmptyStr,
    RelationId,
    Sha256Hex,
)
from atlas_tools.relation.evaluation.domain.identity import CardHash

type CoincidentReviewAction = Literal["confirmed", "rejected", "excluded"]
type CoincidentReviewSourceName = Literal[
    "grid-deliverables/gates.json",
    "grid-deliverables/coincident-queue.jsonl",
    "cards.jsonl",
    "cards.manifest.json",
]

COINCIDENT_REVIEW_ARTIFACT: Final = "relation-coincident-reviews"
COINCIDENT_REVIEW_POLICY_ID: Final = "coincident-evidence-confirm-reject-or-exclude-v2"
COINCIDENT_REVIEW_SOURCE_NAMES: Final[frozenset[CoincidentReviewSourceName]] = frozenset(
    {
        "grid-deliverables/gates.json",
        "grid-deliverables/coincident-queue.jsonl",
        "cards.jsonl",
        "cards.manifest.json",
    }
)


class CoincidentReviewRow(FrozenModel):
    """Bind one queued relation and exact card to a Coincident-evidence decision."""

    schema_version: Literal[2] = 2
    relation_id: RelationId
    card_hash: CardHash
    action: CoincidentReviewAction


class CoincidentReviewCounts(FrozenModel):
    """Cross-check complete queue coverage and every human action count."""

    rows: NonNegativeInt
    confirmed: NonNegativeInt
    rejected: NonNegativeInt
    excluded: NonNegativeInt

    @model_validator(mode="after")
    def check_sum(self) -> Self:
        if self.rows != self.confirmed + self.rejected + self.excluded:
            raise ValueError("review rows must equal the sum of all action counts")
        return self


def _canonical_json_bytes(value: object) -> bytes:
    if isinstance(value, FrozenModel):
        value = value.model_dump(mode="json")
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def coincident_review_decisions_hash(rows: Sequence[CoincidentReviewRow]) -> Sha256Hex:
    """Hash canonical schema-v2 rows in their durable JSONL order."""
    payload = b"".join(_canonical_json_bytes(row) + b"\n" for row in rows)
    return hashlib.sha256(payload).hexdigest()


def coincident_review_counts(rows: Sequence[CoincidentReviewRow]) -> CoincidentReviewCounts:
    """Count every confirmation, rejection, and exclusion exactly."""
    return CoincidentReviewCounts(
        rows=len(rows),
        confirmed=sum(row.action == "confirmed" for row in rows),
        rejected=sum(row.action == "rejected" for row in rows),
        excluded=sum(row.action == "excluded" for row in rows),
    )


def coincident_review_artifact_id(
    *,
    reviewer: NonEmptyStr,
    source_hashes: Mapping[CoincidentReviewSourceName, Sha256Hex],
    decisions_hash: Sha256Hex,
    counts: CoincidentReviewCounts,
) -> Sha256Hex:
    """Identify review semantics and exact inputs, excluding wall-clock time."""
    if not reviewer:
        raise ValueError("Coincident reviewer must not be empty")
    if frozenset(source_hashes) != COINCIDENT_REVIEW_SOURCE_NAMES:
        raise ValueError("Coincident review source hashes must contain exactly four sources")
    identity = {
        "artifact": COINCIDENT_REVIEW_ARTIFACT,
        "schema_version": 2,
        "policy_id": COINCIDENT_REVIEW_POLICY_ID,
        "reviewer": reviewer,
        "source_hashes": dict(source_hashes),
        "decisions_hash": decisions_hash,
        "counts": counts.model_dump(mode="json"),
    }
    return hashlib.sha256(_canonical_json_bytes(identity)).hexdigest()


class CoincidentReviewManifest(FrozenModel):
    """Bind a review artifact to policy, reviewer, sources, rows, and counts."""

    schema_version: Literal[2] = 2
    artifact: Literal["relation-coincident-reviews"] = COINCIDENT_REVIEW_ARTIFACT
    policy_id: Literal["coincident-evidence-confirm-reject-or-exclude-v2"] = (
        COINCIDENT_REVIEW_POLICY_ID
    )
    reviewer: NonEmptyStr
    source_hashes: FrozenMapping[CoincidentReviewSourceName, Sha256Hex]
    decisions_hash: Sha256Hex
    counts: CoincidentReviewCounts
    artifact_id: Sha256Hex
    created_at: AwareDatetime

    @model_validator(mode="after")
    def check_identity(self) -> Self:
        expected = coincident_review_artifact_id(
            reviewer=self.reviewer,
            source_hashes=self.source_hashes,
            decisions_hash=self.decisions_hash,
            counts=self.counts,
        )
        if self.artifact_id != expected:
            raise ValueError("Coincident review artifact_id does not match its identity")
        return self
