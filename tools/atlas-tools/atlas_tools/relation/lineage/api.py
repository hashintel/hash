"""Supported public surface for source relation lineage artifacts."""

from collections.abc import Iterable, Mapping
from os import PathLike

from atlas_tools.relation.lineage._artifact import (
    publish_source_lineage as _publish_source_lineage,
)
from atlas_tools.relation.lineage._artifact import verify_source_lineage
from atlas_tools.relation.lineage._domain import (
    LINEAGE_SCHEMA_VERSION,
    SOURCE_LINEAGE_POLICY_ID,
    WIKIDATA_INVERSE_EDGE_KIND,
    InverseEdgeKind,
    LeafCardArtifact,
    LineageInverseEdge,
    LineageNode,
    SourceLineageCounts,
    SourceLineageDetails,
    SourceLineageManifest,
    SourceLineagePaths,
    SourceLineagePolicy,
    SourceSnapshotIdentity,
    VerifiedSourceLineage,
    source_lineage_artifact_id,
)
from atlas_tools.relation.lineage._graph import validate_lineage_nodes


def publish_source_lineage(
    nodes: Iterable[LineageNode],
    *,
    cards_directory: PathLike,
    output_directory: PathLike,
    producer: str,
    snapshot: SourceSnapshotIdentity,
    raw_inputs: Mapping[str, PathLike],
    inverse_edge_kinds: tuple[InverseEdgeKind, ...] = (),
) -> SourceLineagePaths:
    """Publish source lineage bound to an already finalized leaf card artifact."""
    return _publish_source_lineage(
        nodes,
        cards_directory=cards_directory,
        output_directory=output_directory,
        producer=producer,
        snapshot=snapshot,
        raw_inputs=raw_inputs,
        inverse_edge_kinds=inverse_edge_kinds,
        verifier=verify_source_lineage,
    )


__all__ = [
    "LINEAGE_SCHEMA_VERSION",
    "SOURCE_LINEAGE_POLICY_ID",
    "WIKIDATA_INVERSE_EDGE_KIND",
    "InverseEdgeKind",
    "LeafCardArtifact",
    "LineageInverseEdge",
    "LineageNode",
    "SourceLineageCounts",
    "SourceLineageDetails",
    "SourceLineageManifest",
    "SourceLineagePaths",
    "SourceLineagePolicy",
    "SourceSnapshotIdentity",
    "VerifiedSourceLineage",
    "publish_source_lineage",
    "source_lineage_artifact_id",
    "validate_lineage_nodes",
    "verify_source_lineage",
]
