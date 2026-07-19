"""Define typed identities for voluntary confirmation of unambiguous placements."""

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
from atlas_tools.relation.evaluation.domain.review import HumanPlacementAction
from atlas_tools.relation.evaluation.domain.target_resolution import (
    TargetResolutionSourceName,
)

type PlacementConfirmationAction = HumanPlacementAction
type PlacementConfirmationSourceName = TargetResolutionSourceName

PLACEMENT_CONFIRMATION_ARTIFACT: Final = "relation-placement-confirmations"
PLACEMENT_CONFIRMATION_POLICY_ID: Final = "human-voluntary-unambiguous-confirmation-v1"
PLACEMENT_CONFIRMATION_SOURCE_NAMES: Final[frozenset[PlacementConfirmationSourceName]] = frozenset(
    {
        "soft-labels.parquet",
        "soft-labels.parquet.meta.json",
        "cards.jsonl",
        "cards.manifest.json",
    }
)


class PlacementConfirmationRow(FrozenModel):
    """Bind one positive-evidence relation and exact card to a confirmed action."""

    schema_version: Literal[1] = 1
    relation_id: RelationId
    card_hash: CardHash
    action: PlacementConfirmationAction


class PlacementConfirmationCounts(FrozenModel):
    """Cross-check the voluntary confirmation population and its two outcomes."""

    rows: NonNegativeInt
    placement: NonNegativeInt
    excluded: NonNegativeInt

    @model_validator(mode="after")
    def check_sum(self) -> Self:
        if self.rows != self.placement + self.excluded:
            raise ValueError("confirmation rows must equal placement plus excluded counts")
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


def placement_confirmation_decisions_hash(
    rows: Sequence[PlacementConfirmationRow],
) -> Sha256Hex:
    """Hash canonical schema-v1 rows in their durable JSONL order."""
    payload = b"".join(_canonical_json_bytes(row) + b"\n" for row in rows)
    return hashlib.sha256(payload).hexdigest()


def placement_confirmation_counts(
    rows: Sequence[PlacementConfirmationRow],
) -> PlacementConfirmationCounts:
    """Count placement confirmations and supervised exclusions exactly."""
    excluded = sum(row.action == "excluded" for row in rows)
    return PlacementConfirmationCounts(
        rows=len(rows),
        placement=len(rows) - excluded,
        excluded=excluded,
    )


def placement_confirmation_artifact_id(
    *,
    reviewer: NonEmptyStr,
    source_hashes: Mapping[PlacementConfirmationSourceName, Sha256Hex],
    decisions_hash: Sha256Hex,
    counts: PlacementConfirmationCounts,
) -> Sha256Hex:
    """Identify confirmation semantics and exact inputs, excluding wall-clock time."""
    if not reviewer:
        raise ValueError("placement confirmation reviewer must not be empty")
    if frozenset(source_hashes) != PLACEMENT_CONFIRMATION_SOURCE_NAMES:
        raise ValueError("placement confirmation source hashes must contain exactly four sources")
    identity = {
        "artifact": PLACEMENT_CONFIRMATION_ARTIFACT,
        "schema_version": 1,
        "policy_id": PLACEMENT_CONFIRMATION_POLICY_ID,
        "reviewer": reviewer,
        "source_hashes": dict(source_hashes),
        "decisions_hash": decisions_hash,
        "counts": counts.model_dump(mode="json"),
    }
    return hashlib.sha256(_canonical_json_bytes(identity)).hexdigest()


class PlacementConfirmationManifest(FrozenModel):
    """Bind a confirmation artifact to policy, reviewer, sources, rows, and counts."""

    schema_version: Literal[1] = 1
    artifact: Literal["relation-placement-confirmations"] = PLACEMENT_CONFIRMATION_ARTIFACT
    policy_id: Literal["human-voluntary-unambiguous-confirmation-v1"] = (
        PLACEMENT_CONFIRMATION_POLICY_ID
    )
    reviewer: NonEmptyStr
    source_hashes: FrozenMapping[PlacementConfirmationSourceName, Sha256Hex]
    decisions_hash: Sha256Hex
    counts: PlacementConfirmationCounts
    artifact_id: Sha256Hex
    created_at: AwareDatetime

    @model_validator(mode="after")
    def check_identity(self) -> Self:
        expected = placement_confirmation_artifact_id(
            reviewer=self.reviewer,
            source_hashes=self.source_hashes,
            decisions_hash=self.decisions_hash,
            counts=self.counts,
        )
        if self.artifact_id != expected:
            raise ValueError("placement confirmation artifact_id does not match its identity")
        return self
