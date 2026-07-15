"""Derive deterministic relation-family assignments from verified lineage graphs."""

from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence

from atlas_tools.common import canonical_json_bytes, sha256_bytes
from atlas_tools.relation.concat.api import VerifiedConcatArtifact
from atlas_tools.relation.domain.api import RelationFamilyId, RelationId, Sha256Hex
from atlas_tools.relation.family_closure.domain import (
    FAMILY_ALGORITHM,
    FAMILY_ID_PREFIX,
    HASH_LINK_ROOT_RELATION_ID,
    ClosureEdgePolicy,
    FamilyAssignmentRow,
    FamilyClosureCounts,
    FamilyId,
)
from atlas_tools.relation.lineage.api import LineageNode, VerifiedSourceLineage


class _DisjointSet:
    """Union relation identities with path compression and rank balancing."""

    def __init__(self, identities: Iterable[RelationId]) -> None:
        self._parent = {identity: identity for identity in identities}
        self._rank = dict.fromkeys(self._parent, 0)

    def find(self, identity: RelationId) -> RelationId:
        parent = self._parent[identity]
        if parent != identity:
            self._parent[identity] = self.find(parent)
        return self._parent[identity]

    def union(self, left: RelationId, right: RelationId) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root == right_root:
            return
        left_rank = self._rank[left_root]
        right_rank = self._rank[right_root]
        if left_rank < right_rank:
            left_root, right_root = right_root, left_root
        self._parent[right_root] = left_root
        if left_rank == right_rank:
            self._rank[left_root] += 1


def family_id_for_relations(relation_ids: Sequence[RelationId]) -> FamilyId:
    """Hash one non-empty sorted projected component into its stable family ID."""
    relations = tuple(relation_ids)
    if not relations:
        raise ValueError("a family ID requires at least one deck relation")
    if relations != tuple(sorted(relations)):
        raise ValueError("family relation IDs must use ascending order")
    if len(relations) != len(set(relations)):
        raise ValueError("family relation IDs must not contain duplicates")
    digest = sha256_bytes(
        canonical_json_bytes(
            {
                "algorithm": FAMILY_ALGORITHM,
                "relations": relations,
            }
        )
    )
    return RelationFamilyId(f"{FAMILY_ID_PREFIX}{digest}")


def _validate_source_bindings(
    concat: VerifiedConcatArtifact,
    lineages: tuple[VerifiedSourceLineage, ...],
) -> None:
    concat_sources = set(concat.provenance.details.sources)
    lineage_sources = {lineage.manifest.details.relation_source.namespace for lineage in lineages}
    missing = tuple(sorted(concat_sources - lineage_sources))
    extra = tuple(sorted(lineage_sources - concat_sources))
    if missing or extra:
        raise ValueError(f"source lineage coverage differs: missing={missing}, extra={extra}")
    for lineage in lineages:
        details = lineage.manifest.details
        source = concat.provenance.details.sources[details.relation_source.namespace]
        leaf = details.leaf_card_artifact
        if leaf.cards_hash != source.cards_hash or leaf.manifest_hash != source.manifest_hash:
            raise ValueError(
                f"source lineage {details.relation_source.namespace} is bound to a different "
                "leaf card artifact"
            )


def _collect_nodes(
    lineages: tuple[VerifiedSourceLineage, ...],
) -> dict[RelationId, LineageNode]:
    nodes: dict[RelationId, LineageNode] = {}
    for lineage in lineages:
        for node in lineage.nodes:
            if node.relation_id in nodes:
                raise ValueError(f"combined lineage repeats relation node {node.relation_id}")
            nodes[node.relation_id] = node
    return nodes


def _normalized_inverse_edges(
    nodes: Mapping[RelationId, LineageNode],
) -> tuple[tuple[RelationId, RelationId, str], ...]:
    normalized = {
        (
            min(node.relation_id, edge.relation_id),
            max(node.relation_id, edge.relation_id),
            edge.kind,
        )
        for node in nodes.values()
        for edge in node.inverse_edges
    }
    return tuple(sorted(normalized))


def _union_lineage_graph(
    nodes: Mapping[RelationId, LineageNode],
    policy: ClosureEdgePolicy,
) -> tuple[_DisjointSet, int, int, int]:
    excluded_roots = set(policy.root_exclusions)
    disjoint = _DisjointSet(nodes)
    direct_edges = 0
    excluded_edges = 0
    for node in nodes.values():
        for parent in node.extends:
            direct_edges += 1
            if parent in excluded_roots:
                excluded_edges += 1
            else:
                disjoint.union(node.relation_id, parent)
    inverse_edges = _normalized_inverse_edges(nodes)
    for left, right, _kind in inverse_edges:
        disjoint.union(left, right)
    return disjoint, direct_edges, excluded_edges, len(inverse_edges)


def _derive_assignments(
    nodes: Mapping[RelationId, LineageNode],
    deck: Mapping[RelationId, Sha256Hex],
    policy: ClosureEdgePolicy,
) -> tuple[tuple[FamilyAssignmentRow, ...], FamilyClosureCounts]:
    missing = tuple(sorted(set(deck) - set(nodes)))
    if missing:
        raise ValueError(f"concat deck relations lack lineage nodes: {missing}")
    for root in policy.root_exclusions:
        if root not in nodes:
            raise ValueError(f"root exclusion {root} has no lineage node")
    disjoint, direct_edges, excluded_edges, inverse_edges = _union_lineage_graph(nodes, policy)
    projected: dict[RelationId, list[RelationId]] = defaultdict(list)
    for relation_id in deck:
        projected[disjoint.find(relation_id)].append(relation_id)
    family_by_relation: dict[RelationId, FamilyId] = {}
    for relation_ids in projected.values():
        ordered_relations = tuple(sorted(relation_ids))
        family_id = family_id_for_relations(ordered_relations)
        for relation_id in ordered_relations:
            family_by_relation[relation_id] = family_id
    assignments = tuple(
        FamilyAssignmentRow(
            relation_id=relation_id,
            card_hash=deck[relation_id],
            family_id=family_by_relation[relation_id],
        )
        for relation_id in sorted(deck)
    )
    largest = max((len(relations) for relations in projected.values()), default=0)
    return assignments, FamilyClosureCounts(
        cards=len(assignments),
        lineage_nodes=len(nodes),
        direct_edges=direct_edges,
        excluded_edges=excluded_edges,
        inverse_edges=inverse_edges,
        components=len(projected),
        largest_component=largest,
    )


def derive_family_assignments(
    concat: VerifiedConcatArtifact,
    lineages: tuple[VerifiedSourceLineage, ...],
) -> tuple[ClosureEdgePolicy, tuple[FamilyAssignmentRow, ...], FamilyClosureCounts]:
    """Validate source bindings and derive the exact projected deck assignments."""
    deck_rows = tuple(concat.rows())
    deck = {row.relation_id: row.card_hash for row in deck_rows}
    if len(deck) != len(deck_rows):
        raise ValueError("concat deck repeats a relation identity")
    _validate_source_bindings(concat, lineages)
    nodes = _collect_nodes(lineages)
    roots = (HASH_LINK_ROOT_RELATION_ID,) if HASH_LINK_ROOT_RELATION_ID in nodes else ()
    policy = ClosureEdgePolicy(root_exclusions=roots)
    assignments, counts = _derive_assignments(nodes, deck, policy)
    return policy, assignments, counts
