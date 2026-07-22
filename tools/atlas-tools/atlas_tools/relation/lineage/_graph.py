"""Whole-graph validation for source relation lineage."""

from collections.abc import Iterable
from typing import Literal

from atlas_tools.relation.domain.api import RelationId, RelationNamespace, split_relation_id
from atlas_tools.relation.lineage._domain import LineageNode, SourceLineagePolicy

_VISITING = 1
_VISITED = 2


def _validate_namespaces(
    nodes: tuple[LineageNode, ...],
    source_namespace: RelationNamespace,
) -> None:
    for node in nodes:
        namespace, _ = split_relation_id(node.relation_id)
        if namespace != source_namespace:
            raise ValueError(
                f"relation {node.relation_id} disagrees with source namespace {source_namespace}"
            )
        for target in node.extends:
            target_namespace, _ = split_relation_id(target)
            if target_namespace != source_namespace:
                raise ValueError(f"cross-namespace extends edge {node.relation_id} -> {target}")
        for edge in node.inverse_edges:
            target_namespace, _ = split_relation_id(edge.relation_id)
            if target_namespace != source_namespace:
                raise ValueError(
                    f"cross-namespace inverse edge {node.relation_id} -> {edge.relation_id}"
                )


def _validate_targets(nodes: tuple[LineageNode, ...]) -> None:
    identities = {node.relation_id for node in nodes}
    for node in nodes:
        for target in node.extends:
            if target not in identities:
                raise ValueError(f"extends edge {node.relation_id} -> {target} has no target node")
        for edge in node.inverse_edges:
            if edge.relation_id not in identities:
                raise ValueError(
                    f"inverse edge {node.relation_id} -> {edge.relation_id} has no target node"
                )


def _validate_inverse_policy(
    nodes: tuple[LineageNode, ...],
    policy: SourceLineagePolicy,
) -> None:
    admitted = set(policy.inverse_edge_kinds)
    for node in nodes:
        for edge in node.inverse_edges:
            if edge.kind not in admitted:
                raise ValueError(
                    f"inverse edge kind {edge.kind!r} is absent from the source edge policy"
                )


def _validate_dag(nodes: tuple[LineageNode, ...]) -> None:
    parents = {node.relation_id: node.extends for node in nodes}
    state: dict[RelationId, Literal[1, 2]] = {}

    def visit(relation_id: RelationId, path: tuple[RelationId, ...]) -> None:
        observed = state.get(relation_id)
        if observed == _VISITED:
            return
        if observed == _VISITING:
            cycle_start = path.index(relation_id)
            cycle = (*path[cycle_start:], relation_id)
            raise ValueError(f"directed extends graph contains a cycle: {' -> '.join(cycle)}")
        state[relation_id] = _VISITING
        for parent in parents[relation_id]:
            visit(parent, (*path, relation_id))
        state[relation_id] = _VISITED

    for relation_id in parents:
        visit(relation_id, ())


def validate_lineage_nodes(
    nodes: Iterable[LineageNode],
    *,
    source_namespace: RelationNamespace,
    policy: SourceLineagePolicy,
) -> tuple[LineageNode, ...]:
    """Validate one complete source graph in canonical node order."""
    ordered = tuple(nodes)
    identities = tuple(node.relation_id for node in ordered)
    if identities != tuple(sorted(identities)):
        raise ValueError("lineage nodes must use ascending relation_id order")
    if len(identities) != len(set(identities)):
        raise ValueError("lineage nodes must not repeat relation_id")
    _validate_namespaces(ordered, source_namespace)
    _validate_targets(ordered)
    _validate_inverse_policy(ordered, policy)
    _validate_dag(ordered)
    return ordered
