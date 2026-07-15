"""Domain contracts and identities for relation-family closure artifacts."""

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Literal, Self

from pydantic import ConfigDict, NonNegativeInt, StringConstraints, model_validator

from atlas_tools.common import Provenance, canonical_json_bytes, sha256_bytes
from atlas_tools.relation.domain.api import FrozenModel, RelationId, RelationNamespace, Sha256Hex
from atlas_tools.relation.lineage.api import (
    LINEAGE_SCHEMA_VERSION,
    WIKIDATA_INVERSE_EDGE_KIND,
)

FAMILY_CLOSURE_SCHEMA_VERSION = 1
FAMILY_ALGORITHM = "relation-lineage-components-v1"
FAMILY_ID_PREFIX = "lineage-v1:"
CLOSURE_EDGE_POLICY_ID = "relation-lineage-edge-policy-v1"
HASH_LINK_ROOT_RELATION_ID = "hash:https://blockprotocol.org/@blockprotocol/types/entity-type/link/"
FAMILIES_FILENAME = "families.jsonl"
MANIFEST_FILENAME = "families.manifest.json"

type FamilyId = Annotated[
    str,
    StringConstraints(pattern=r"^lineage-v1:[0-9a-f]{64}$"),
]


class FamilyAssignmentRow(FrozenModel):
    """Assign one exact deck card to its deterministic lineage component."""

    schema_version: Literal[1] = FAMILY_CLOSURE_SCHEMA_VERSION
    relation_id: RelationId
    card_hash: Sha256Hex
    family_id: FamilyId


class ClosureEdgePolicy(FrozenModel):
    """Pin every schema-v1 edge admission and root exclusion."""

    policy_id: Literal["relation-lineage-edge-policy-v1"] = CLOSURE_EDGE_POLICY_ID
    root_exclusions: tuple[RelationId, ...]
    admitted_inverse_edge_kinds: tuple[Literal["wikidata-p1696"], ...] = (
        WIKIDATA_INVERSE_EDGE_KIND,
    )
    cross_namespace_edges: Literal[False] = False
    heuristic_edges: Literal[False] = False

    @model_validator(mode="after")
    def check_policy(self) -> Self:
        if self.root_exclusions != tuple(sorted(self.root_exclusions)):
            raise ValueError("root_exclusions must use ascending relation_id order")
        if len(self.root_exclusions) != len(set(self.root_exclusions)):
            raise ValueError("root_exclusions must not contain duplicates")
        unsupported_roots = set(self.root_exclusions) - {HASH_LINK_ROOT_RELATION_ID}
        if unsupported_roots:
            raise ValueError(f"unsupported root exclusions: {sorted(unsupported_roots)}")
        if self.admitted_inverse_edge_kinds != (WIKIDATA_INVERSE_EDGE_KIND,):
            raise ValueError("schema-v1 admits exactly the wikidata-p1696 inverse edge kind")
        return self


class ClosureConcatInput(FrozenModel):
    """Bind a closure to the exact verified concat deck."""

    artifact_id: Sha256Hex
    cards_hash: Sha256Hex
    manifest_hash: Sha256Hex


class ClosureLineageInput(FrozenModel):
    """Bind one source graph and its declared counts into the closure."""

    namespace: RelationNamespace
    producer: str
    schema_version: Literal[1] = LINEAGE_SCHEMA_VERSION
    artifact_id: Sha256Hex
    lineage_hash: Sha256Hex
    manifest_hash: Sha256Hex
    nodes: NonNegativeInt
    extends_edges: NonNegativeInt
    inverse_edges: NonNegativeInt


class FamilyClosureCounts(FrozenModel):
    """Summarize source graph facts and projected classifier components."""

    cards: NonNegativeInt
    lineage_nodes: NonNegativeInt
    direct_edges: NonNegativeInt
    excluded_edges: NonNegativeInt
    inverse_edges: NonNegativeInt
    components: NonNegativeInt
    largest_component: NonNegativeInt


class FamilyClosureDetails(FrozenModel):
    """Describe every deterministic closure input, policy, and output count."""

    schema_version: Literal[1] = FAMILY_CLOSURE_SCHEMA_VERSION
    algorithm: Literal["relation-lineage-components-v1"] = FAMILY_ALGORITHM
    edge_policy: ClosureEdgePolicy
    concat: ClosureConcatInput
    source_lineages: tuple[ClosureLineageInput, ...]
    families_hash: Sha256Hex
    counts: FamilyClosureCounts
    canonicalization: Literal["utf-8-json-sorted-keys-compact-v1"] = (
        "utf-8-json-sorted-keys-compact-v1"
    )
    row_order: Literal["relation-id-ascending-v1"] = "relation-id-ascending-v1"
    family_id_algorithm: Literal["lineage-v1-sha256-canonical-component-v1"] = (
        "lineage-v1-sha256-canonical-component-v1"
    )
    artifact_id: Sha256Hex

    @model_validator(mode="after")
    def check_lineage_order(self) -> Self:
        namespaces = tuple(item.namespace for item in self.source_lineages)
        if namespaces != tuple(sorted(namespaces)):
            raise ValueError("source_lineages must use ascending namespace order")
        if len(namespaces) != len(set(namespaces)):
            raise ValueError("source_lineages must not repeat a namespace")
        return self


class FamilyClosureManifest(Provenance[FamilyClosureDetails]):
    """Use the shared provenance envelope with strict closure requirements."""

    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        strict=True,
        validate_default=True,
    )

    @model_validator(mode="after")
    def check_contract(self) -> Self:
        expected_content = {FAMILIES_FILENAME: self.details.families_hash}
        if self.content_hashes != expected_content:
            raise ValueError("closure content_hashes do not match details.families_hash")
        expected_inputs = closure_input_hashes(self.details)
        if self.input_hashes != expected_inputs:
            raise ValueError("closure input_hashes do not match declared concat and lineage inputs")
        expected_id = family_closure_artifact_id(
            policy=self.details.edge_policy,
            input_hashes=expected_inputs,
            families_hash=self.details.families_hash,
        )
        if self.details.artifact_id != expected_id:
            raise ValueError("closure artifact_id does not match its policy, inputs, and output")
        return self


@dataclass(frozen=True, slots=True)
class FamilyClosurePaths:
    """Locations of one atomically published family closure."""

    families_jsonl: Path
    manifest: Path


@dataclass(frozen=True, slots=True)
class VerifiedFamilyClosure:
    """Return a fully validated relation-to-family assignment artifact."""

    directory: Path
    families_path: Path
    manifest_path: Path
    families_hash: Sha256Hex
    manifest_hash: Sha256Hex
    manifest: FamilyClosureManifest
    rows: tuple[FamilyAssignmentRow, ...]
    by_relation_id: Mapping[RelationId, FamilyAssignmentRow]


def closure_input_hashes(details: FamilyClosureDetails) -> dict[str, Sha256Hex]:
    """Return the exact provenance input map declared by closure details."""
    hashes = {
        "cards/cards.jsonl": details.concat.cards_hash,
        "cards/cards.manifest.json": details.concat.manifest_hash,
    }
    for source in details.source_lineages:
        prefix = f"lineage/{source.namespace}"
        hashes[f"{prefix}/lineage.jsonl"] = source.lineage_hash
        hashes[f"{prefix}/lineage.manifest.json"] = source.manifest_hash
    return dict(sorted(hashes.items()))


def family_closure_artifact_id(
    *,
    policy: ClosureEdgePolicy,
    input_hashes: Mapping[str, Sha256Hex],
    families_hash: Sha256Hex,
) -> Sha256Hex:
    """Derive a closure identity from every semantic input, policy, and output byte."""
    return sha256_bytes(
        canonical_json_bytes(
            {
                "schema_version": FAMILY_CLOSURE_SCHEMA_VERSION,
                "algorithm": FAMILY_ALGORITHM,
                "edge_policy": policy.model_dump(mode="json"),
                "input_hashes": dict(sorted(input_hashes.items())),
                "families_hash": families_hash,
            }
        )
    )
