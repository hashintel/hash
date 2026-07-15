"""Strict contracts and identities for source relation lineage artifacts."""

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Self

from pydantic import JsonValue, NonNegativeInt, model_validator

from atlas_tools.common import Provenance, canonical_json_bytes, sha256_bytes
from atlas_tools.relation.concat import card_artifact_id
from atlas_tools.relation.domain.api import (
    FrozenModel,
    NonEmptyStr,
    RelationId,
    RelationSourceSpec,
    Sha256Hex,
)

LINEAGE_SCHEMA_VERSION = 1
SOURCE_LINEAGE_POLICY_ID = "relation-lineage-source-v1"
WIKIDATA_INVERSE_EDGE_KIND = "wikidata-p1696"

type InverseEdgeKind = Literal["wikidata-p1696"]


class LineageInverseEdge(FrozenModel):
    """Bind an admitted inverse fact to an exact relation identity."""

    relation_id: RelationId
    kind: InverseEdgeKind


class LineageNode(FrozenModel):
    """Record one source relation and its identity-bearing direct edges."""

    schema_version: Literal[1] = LINEAGE_SCHEMA_VERSION
    relation_id: RelationId
    extends: tuple[RelationId, ...]
    inverse_edges: tuple[LineageInverseEdge, ...]

    @model_validator(mode="after")
    def check_edges(self) -> Self:
        if self.extends != tuple(sorted(self.extends)):
            raise ValueError("extends must use ascending relation_id order")
        if len(self.extends) != len(set(self.extends)):
            raise ValueError("extends must not contain duplicates")
        if self.relation_id in self.extends:
            raise ValueError("extends must not contain a self-reference")

        inverse_keys = tuple((edge.kind, edge.relation_id) for edge in self.inverse_edges)
        if inverse_keys != tuple(sorted(inverse_keys)):
            raise ValueError("inverse_edges must use ascending (kind, relation_id) order")
        if len(inverse_keys) != len(set(inverse_keys)):
            raise ValueError("inverse_edges must not contain duplicate facts")
        if any(edge.relation_id == self.relation_id for edge in self.inverse_edges):
            raise ValueError("inverse_edges must not contain a self-reference")
        return self


class SourceSnapshotIdentity(FrozenModel):
    """Carry one source-defined typed snapshot identity without interpreting it."""

    kind: NonEmptyStr
    value: JsonValue


class LeafCardArtifact(FrozenModel):
    """Bind source lineage to the exact leaf card bytes and manifest bytes."""

    artifact_id: Sha256Hex
    cards_hash: Sha256Hex
    manifest_hash: Sha256Hex

    @model_validator(mode="after")
    def check_artifact_id(self) -> Self:
        expected = card_artifact_id(self.cards_hash, self.manifest_hash)
        if self.artifact_id != expected:
            raise ValueError("leaf card artifact_id does not match its content hashes")
        return self


class SourceLineagePolicy(FrozenModel):
    """Declare the complete schema-v1 source edge extraction policy."""

    policy_id: Literal["relation-lineage-source-v1"] = SOURCE_LINEAGE_POLICY_ID
    direct_extends_only: Literal[True] = True
    inverse_edge_kinds: tuple[InverseEdgeKind, ...]
    cross_namespace_edges: Literal[False] = False
    extraction_complete: Literal[True] = True

    @model_validator(mode="after")
    def check_edge_kinds(self) -> Self:
        if self.inverse_edge_kinds != tuple(sorted(self.inverse_edge_kinds)):
            raise ValueError("inverse_edge_kinds must use ascending order")
        if len(self.inverse_edge_kinds) != len(set(self.inverse_edge_kinds)):
            raise ValueError("inverse_edge_kinds must not contain duplicates")
        return self


class SourceLineageCounts(FrozenModel):
    """Summarize all nodes and source facts before component projection."""

    nodes: NonNegativeInt
    extends_edges: NonNegativeInt
    inverse_edges: NonNegativeInt


class SourceLineageDetails(FrozenModel):
    """Describe one verified source lineage artifact and its exact policy."""

    schema_version: Literal[1] = LINEAGE_SCHEMA_VERSION
    relation_source: RelationSourceSpec
    snapshot: SourceSnapshotIdentity
    leaf_card_artifact: LeafCardArtifact
    edge_policy: SourceLineagePolicy
    counts: SourceLineageCounts
    lineage_hash: Sha256Hex
    canonicalization: Literal["utf-8-json-sorted-keys-compact-v1"] = (
        "utf-8-json-sorted-keys-compact-v1"
    )
    node_order: Literal["relation-id-ascending-v1"] = "relation-id-ascending-v1"
    extends_order: Literal["relation-id-ascending-v1"] = "relation-id-ascending-v1"
    inverse_edge_order: Literal["kind-then-relation-id-ascending-v1"] = (
        "kind-then-relation-id-ascending-v1"
    )
    artifact_id: Sha256Hex


def source_lineage_artifact_id(
    *,
    source: RelationSourceSpec,
    snapshot: SourceSnapshotIdentity,
    policy: SourceLineagePolicy,
    input_hashes: Mapping[str, Sha256Hex],
    lineage_hash: Sha256Hex,
) -> Sha256Hex:
    """Derive a source-lineage identity from every semantic input and output byte."""
    return sha256_bytes(
        canonical_json_bytes(
            {
                "schema_version": LINEAGE_SCHEMA_VERSION,
                "source": source.model_dump(mode="json"),
                "snapshot": snapshot.model_dump(mode="json"),
                "edge_policy": policy.model_dump(mode="json"),
                "input_hashes": dict(sorted(input_hashes.items())),
                "lineage_hash": lineage_hash,
            }
        )
    )


class SourceLineageManifest(Provenance[SourceLineageDetails]):
    """Use the shared provenance envelope with strict lineage requirements."""

    model_config = FrozenModel.model_config

    @model_validator(mode="after")
    def check_contract(self) -> Self:
        expected_content = {"lineage.jsonl": self.details.lineage_hash}
        if self.content_hashes != expected_content:
            raise ValueError("lineage manifest content_hashes do not match details.lineage_hash")
        if self.input_hashes is None:
            raise ValueError("lineage manifest requires exact input_hashes")
        leaf = self.details.leaf_card_artifact
        if self.input_hashes.get("cards.jsonl") != leaf.cards_hash:
            raise ValueError("lineage manifest cards.jsonl input differs from leaf card artifact")
        if self.input_hashes.get("cards.manifest.json") != leaf.manifest_hash:
            raise ValueError(
                "lineage manifest cards.manifest.json input differs from leaf card artifact"
            )
        raw_input_names = set(self.input_hashes) - {"cards.jsonl", "cards.manifest.json"}
        if not raw_input_names:
            raise ValueError("lineage manifest requires an identity-bearing raw input hash")
        expected_id = source_lineage_artifact_id(
            source=self.details.relation_source,
            snapshot=self.details.snapshot,
            policy=self.details.edge_policy,
            input_hashes=self.input_hashes,
            lineage_hash=self.details.lineage_hash,
        )
        if self.details.artifact_id != expected_id:
            raise ValueError("source lineage artifact_id does not match its inputs and policy")
        return self


@dataclass(frozen=True, slots=True)
class SourceLineagePaths:
    """Locations of one source lineage artifact."""

    lineage_jsonl: Path
    manifest: Path


@dataclass(frozen=True, slots=True)
class VerifiedSourceLineage:
    """Return fully validated source lineage rows and immutable identities."""

    directory: Path
    lineage_path: Path
    manifest_path: Path
    lineage_hash: Sha256Hex
    manifest_hash: Sha256Hex
    manifest: SourceLineageManifest
    nodes: tuple[LineageNode, ...]
