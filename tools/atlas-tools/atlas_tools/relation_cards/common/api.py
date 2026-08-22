"""Supported public contracts for datasource-neutral relation cards."""

from atlas_tools.relation_cards.common.model import (
    EndpointTypeConstraint,
    PhraseInput,
    RelationCardInput,
    RelationConstraints,
    RelationDirection,
    RelationExample,
)

# v5 is the first card format shared across ontology sources.
# v6 guarantees identifier-free prose: adapters rewrite or drop identifier
# mentions inside label/description text, so v5 and v6 are not hash-comparable.
CARD_FORMAT_VERSION = 6

# v7 introduced source-attached endpoint constraints because one link type can
# permit different targets from different source types. v8 retains those pairs
# but omits the universal SemType Link root from HASH card ancestors;
# identity-bearing lineage remains unchanged.
PAIRED_ENDPOINT_CARD_FORMAT_VERSION = 8

__all__ = [
    "CARD_FORMAT_VERSION",
    "PAIRED_ENDPOINT_CARD_FORMAT_VERSION",
    "EndpointTypeConstraint",
    "PhraseInput",
    "RelationCardInput",
    "RelationConstraints",
    "RelationDirection",
    "RelationExample",
]
