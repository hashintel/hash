"""Define typed identities for human resolution of all-ambiguous targets."""

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

type TargetResolutionAction = Literal["coincident", "proximal", "overlay", "excluded"]
type TargetResolutionSourceName = Literal[
    "soft-labels.parquet",
    "soft-labels.parquet.meta.json",
    "cards.jsonl",
    "cards.manifest.json",
]

TARGET_RESOLUTION_ARTIFACT: Final = "relation-placement-target-resolutions"
TARGET_RESOLUTION_POLICY_ID: Final = "human-one-hot-or-supervised-exclusion-v1"
TARGET_RESOLUTION_SOURCE_NAMES: Final[frozenset[TargetResolutionSourceName]] = frozenset(
    {
        "soft-labels.parquet",
        "soft-labels.parquet.meta.json",
        "cards.jsonl",
        "cards.manifest.json",
    }
)


class TargetResolutionRow(FrozenModel):
    """Bind one relation and exact card to a reviewed target action."""

    schema_version: Literal[1] = 1
    relation_id: RelationId
    card_hash: CardHash
    action: TargetResolutionAction


class TargetResolutionCounts(FrozenModel):
    """Cross-check the complete resolution population and its two outcomes."""

    rows: NonNegativeInt
    placement: NonNegativeInt
    excluded: NonNegativeInt

    @model_validator(mode="after")
    def check_sum(self) -> Self:
        if self.rows != self.placement + self.excluded:
            raise ValueError("resolution rows must equal placement plus excluded counts")
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


def target_resolution_decisions_hash(rows: Sequence[TargetResolutionRow]) -> Sha256Hex:
    """Hash canonical schema-v1 rows in their durable JSONL order."""
    payload = b"".join(_canonical_json_bytes(row) + b"\n" for row in rows)
    return hashlib.sha256(payload).hexdigest()


def target_resolution_counts(rows: Sequence[TargetResolutionRow]) -> TargetResolutionCounts:
    """Count placement and supervised-exclusion decisions exactly."""
    excluded = sum(row.action == "excluded" for row in rows)
    return TargetResolutionCounts(
        rows=len(rows),
        placement=len(rows) - excluded,
        excluded=excluded,
    )


def target_resolution_artifact_id(
    *,
    reviewer: NonEmptyStr,
    source_hashes: Mapping[TargetResolutionSourceName, Sha256Hex],
    decisions_hash: Sha256Hex,
    counts: TargetResolutionCounts,
) -> Sha256Hex:
    """Identify resolution semantics and exact inputs, excluding wall-clock time."""
    if not reviewer:
        raise ValueError("target resolution reviewer must not be empty")
    if frozenset(source_hashes) != TARGET_RESOLUTION_SOURCE_NAMES:
        raise ValueError("target resolution source hashes must contain exactly four sources")
    identity = {
        "artifact": TARGET_RESOLUTION_ARTIFACT,
        "schema_version": 1,
        "policy_id": TARGET_RESOLUTION_POLICY_ID,
        "reviewer": reviewer,
        "source_hashes": dict(source_hashes),
        "decisions_hash": decisions_hash,
        "counts": counts.model_dump(mode="json"),
    }
    return hashlib.sha256(_canonical_json_bytes(identity)).hexdigest()


class TargetResolutionManifest(FrozenModel):
    """Bind a resolution artifact to policy, reviewer, sources, rows, and counts."""

    schema_version: Literal[1] = 1
    artifact: Literal["relation-placement-target-resolutions"] = TARGET_RESOLUTION_ARTIFACT
    policy_id: Literal["human-one-hot-or-supervised-exclusion-v1"] = TARGET_RESOLUTION_POLICY_ID
    reviewer: NonEmptyStr
    source_hashes: FrozenMapping[TargetResolutionSourceName, Sha256Hex]
    decisions_hash: Sha256Hex
    counts: TargetResolutionCounts
    artifact_id: Sha256Hex
    created_at: AwareDatetime

    @model_validator(mode="after")
    def check_identity(self) -> Self:
        expected = target_resolution_artifact_id(
            reviewer=self.reviewer,
            source_hashes=self.source_hashes,
            decisions_hash=self.decisions_hash,
            counts=self.counts,
        )
        if self.artifact_id != expected:
            raise ValueError("target resolution artifact_id does not match its identity")
        return self
