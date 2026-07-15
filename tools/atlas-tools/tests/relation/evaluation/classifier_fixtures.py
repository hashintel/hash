"""Reusable verified family-closure fixtures for classifier tests."""

from collections import defaultdict
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Protocol

from atlas_tools.common import canonical_json_bytes, sha256_bytes
from atlas_tools.relation.concat import card_artifact_id
from atlas_tools.relation.domain.api import RelationId
from atlas_tools.relation.family_closure.api import (
    ClosureConcatInput,
    ClosureEdgePolicy,
    FamilyAssignmentRow,
    FamilyClosureCounts,
    FamilyClosureDetails,
    FamilyClosureManifest,
    VerifiedFamilyClosure,
    closure_input_hashes,
    family_closure_artifact_id,
    family_id_for_relations,
    verify_family_closure,
)


class _FamilySourceRow(Protocol):
    @property
    def relation_id(self) -> RelationId: ...

    @property
    def card_hash(self) -> str: ...

    @property
    def family_id(self) -> str | None: ...


def family_assignment_rows(
    rows: Sequence[_FamilySourceRow],
    *,
    family_by_relation_id: Mapping[RelationId, str] | None = None,
) -> tuple[FamilyAssignmentRow, ...]:
    """Build lightweight deterministic closure rows for pure analysis tests."""
    relation_ids = {row.relation_id for row in rows}
    if len(relation_ids) != len(rows):
        raise ValueError("family fixture rows repeat a relation")
    if family_by_relation_id is None:
        family_keys: dict[RelationId, str] = {}
        for row in rows:
            if row.family_id is None:
                raise ValueError(f"family fixture relation {row.relation_id} lacks family_id")
            family_keys[row.relation_id] = row.family_id
    else:
        family_keys = dict(family_by_relation_id)
        if set(family_keys) != relation_ids:
            raise ValueError("family fixture mapping must exactly cover its rows")

    relations_by_key: dict[str, list[RelationId]] = defaultdict(list)
    for relation_id, family_key in family_keys.items():
        relations_by_key[family_key].append(relation_id)
    family_ids = {
        family_key: family_id_for_relations(tuple(sorted(grouped_relation_ids)))
        for family_key, grouped_relation_ids in relations_by_key.items()
    }
    rows_by_relation_id = {row.relation_id: row for row in rows}
    return tuple(
        FamilyAssignmentRow(
            relation_id=relation_id,
            card_hash=rows_by_relation_id[relation_id].card_hash,
            family_id=family_ids[family_keys[relation_id]],
        )
        for relation_id in sorted(relation_ids)
    )


def write_verified_family_closure(
    directory: Path,
    rows: Sequence[_FamilySourceRow],
    *,
    family_by_relation_id: Mapping[RelationId, str] | None = None,
    provenance_seed: str = "fixture",
) -> VerifiedFamilyClosure:
    """Write and verify a complete closure artifact for application tests."""
    assignments = family_assignment_rows(
        rows,
        family_by_relation_id=family_by_relation_id,
    )
    families_payload = b"".join(canonical_json_bytes(row) + b"\n" for row in assignments)
    families_hash = sha256_bytes(families_payload)
    cards_hash = sha256_bytes(f"{provenance_seed}:cards".encode())
    concat_manifest_hash = sha256_bytes(f"{provenance_seed}:concat-manifest".encode())
    concat = ClosureConcatInput(
        artifact_id=card_artifact_id(cards_hash, concat_manifest_hash),
        cards_hash=cards_hash,
        manifest_hash=concat_manifest_hash,
    )
    component_sizes: dict[str, int] = defaultdict(int)
    for assignment in assignments:
        component_sizes[assignment.family_id] += 1
    counts = FamilyClosureCounts(
        cards=len(assignments),
        lineage_nodes=len(assignments),
        direct_edges=0,
        excluded_edges=0,
        inverse_edges=0,
        components=len(component_sizes),
        largest_component=max(component_sizes.values(), default=0),
    )
    policy = ClosureEdgePolicy(root_exclusions=())
    provisional = FamilyClosureDetails(
        edge_policy=policy,
        concat=concat,
        source_lineages=(),
        families_hash=families_hash,
        counts=counts,
        artifact_id="0" * 64,
    )
    input_hashes = closure_input_hashes(provisional)
    details = provisional.model_copy(
        update={
            "artifact_id": family_closure_artifact_id(
                policy=policy,
                input_hashes=input_hashes,
                families_hash=families_hash,
            )
        }
    )
    manifest = FamilyClosureManifest.make(
        producer="test.relation-family-closure",
        input_hashes=input_hashes,
        content_hashes={"families.jsonl": families_hash},
        details=details,
    )

    directory.mkdir(parents=True)
    (directory / "families.jsonl").write_bytes(families_payload)
    (directory / "families.manifest.json").write_bytes(canonical_json_bytes(manifest) + b"\n")
    return verify_family_closure(directory)
