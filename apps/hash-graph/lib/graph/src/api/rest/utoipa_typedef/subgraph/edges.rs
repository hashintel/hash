use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};
use type_system::url::BaseUrl;
use utoipa::{
    openapi::{Array, ObjectBuilder, OneOfBuilder, Ref, RefOr, Schema},
    ToSchema,
};

use crate::{
    api::rest::utoipa_typedef::subgraph::vertices::OntologyTypeVertexId,
    identifier::{knowledge::EntityId, ontology::OntologyTypeVersion, time::Timestamp},
    subgraph::{
        edges::{
            AdjacencyList, KnowledgeGraphEdgeKind, OntologyEdgeKind, OutwardEdge, SharedEdgeKind,
        },
        identifier::{
            DataTypeVertexId, EntityIdWithInterval, EntityTypeVertexId, EntityVertexId,
            PropertyTypeVertexId,
        },
        temporal_axes::VariableAxis,
    },
};

#[derive(Debug, Hash, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum OntologyOutwardEdge {
    ToOntology(OutwardEdge<OntologyEdgeKind, OntologyTypeVertexId>),
    ToKnowledgeGraph(OutwardEdge<SharedEdgeKind, EntityIdWithInterval>),
}

impl From<OutwardEdge<OntologyEdgeKind, EntityTypeVertexId>> for OntologyOutwardEdge {
    fn from(edge: OutwardEdge<OntologyEdgeKind, EntityTypeVertexId>) -> Self {
        Self::ToOntology(OutwardEdge {
            kind: edge.kind,
            reversed: edge.reversed,
            right_endpoint: OntologyTypeVertexId::EntityType(edge.right_endpoint),
        })
    }
}

impl From<OutwardEdge<OntologyEdgeKind, PropertyTypeVertexId>> for OntologyOutwardEdge {
    fn from(edge: OutwardEdge<OntologyEdgeKind, PropertyTypeVertexId>) -> Self {
        Self::ToOntology(OutwardEdge {
            kind: edge.kind,
            reversed: edge.reversed,
            right_endpoint: OntologyTypeVertexId::PropertyType(edge.right_endpoint),
        })
    }
}

impl From<OutwardEdge<OntologyEdgeKind, DataTypeVertexId>> for OntologyOutwardEdge {
    fn from(edge: OutwardEdge<OntologyEdgeKind, DataTypeVertexId>) -> Self {
        Self::ToOntology(OutwardEdge {
            kind: edge.kind,
            reversed: edge.reversed,
            right_endpoint: OntologyTypeVertexId::DataType(edge.right_endpoint),
        })
    }
}

impl From<OutwardEdge<SharedEdgeKind, EntityIdWithInterval>> for OntologyOutwardEdge {
    fn from(edge: OutwardEdge<SharedEdgeKind, EntityIdWithInterval>) -> Self {
        Self::ToKnowledgeGraph(edge)
    }
}

// WARNING: This MUST be kept up to date with the enum variants.
//   We have to do this because utoipa doesn't understand serde untagged:
//   https://github.com/juhaku/utoipa/issues/320
impl ToSchema<'_> for OntologyOutwardEdge {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "OntologyOutwardEdge",
            OneOfBuilder::new()
                .item(
                    <OutwardEdge<OntologyEdgeKind, OntologyTypeVertexId>>::generate_schema(
                        "OntologyToOntologyOutwardEdge",
                    ),
                )
                .item(
                    <OutwardEdge<SharedEdgeKind, EntityIdWithInterval>>::generate_schema(
                        "OntologyToKnowledgeGraphOutwardEdge",
                    ),
                )
                .into(),
        )
    }
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum KnowledgeGraphOutwardEdge {
    ToKnowledgeGraph(OutwardEdge<KnowledgeGraphEdgeKind, EntityIdWithInterval>),
    ToOntology(OutwardEdge<SharedEdgeKind, OntologyTypeVertexId>),
}

impl From<OutwardEdge<KnowledgeGraphEdgeKind, EntityIdWithInterval>> for KnowledgeGraphOutwardEdge {
    fn from(edge: OutwardEdge<KnowledgeGraphEdgeKind, EntityIdWithInterval>) -> Self {
        Self::ToKnowledgeGraph(edge)
    }
}

impl From<OutwardEdge<SharedEdgeKind, EntityTypeVertexId>> for KnowledgeGraphOutwardEdge {
    fn from(edge: OutwardEdge<SharedEdgeKind, EntityTypeVertexId>) -> Self {
        Self::ToOntology(OutwardEdge {
            kind: edge.kind,
            reversed: edge.reversed,
            right_endpoint: OntologyTypeVertexId::EntityType(edge.right_endpoint),
        })
    }
}

// WARNING: This MUST be kept up to date with the enum variants.
//   Utoipa is not able to derive the correct schema for this as it has problems with generic
//   parameters.
impl ToSchema<'_> for KnowledgeGraphOutwardEdge {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "KnowledgeGraphOutwardEdge",
            OneOfBuilder::new()
                .item(
                    <OutwardEdge<KnowledgeGraphEdgeKind, EntityIdWithInterval>>::generate_schema(
                        "KnowledgeGraphToKnowledgeGraphOutwardEdge",
                    ),
                )
                .item(
                    <OutwardEdge<SharedEdgeKind, OntologyTypeVertexId>>::generate_schema(
                        "KnowledgeGraphToOntologyOutwardEdge",
                    ),
                )
                .into(),
        )
    }
}

#[derive(Default, Debug, Serialize, ToSchema)]
#[serde(transparent)]
pub struct KnowledgeGraphRootedEdges(
    pub HashMap<EntityId, BTreeMap<Timestamp<VariableAxis>, Vec<KnowledgeGraphOutwardEdge>>>,
);

#[derive(Default, Debug, Serialize, ToSchema)]
#[serde(transparent)]
pub struct OntologyRootedEdges(
    pub HashMap<BaseUrl, BTreeMap<OntologyTypeVersion, Vec<OntologyOutwardEdge>>>,
);

#[derive(Serialize, Deserialize)]
pub struct Edges {
    #[serde(flatten)]
    pub ontology: OntologyRootedEdges,
    #[serde(flatten)]
    pub knowledge_graph: KnowledgeGraphRootedEdges,
}

impl From<crate::subgraph::edges::Edges> for Edges {
    fn from(edges: crate::subgraph::edges::Edges) -> Self {
        Self {
            ontology: OntologyRootedEdges(
                edges
                    .entity_type_to_entity_type
                    .into_flattened::<OntologyOutwardEdge>()
                    .chain(
                        edges
                            .entity_type_to_property_type
                            .into_flattened::<OntologyOutwardEdge>(),
                    )
                    .chain(
                        edges
                            .property_type_to_property_type
                            .into_flattened::<OntologyOutwardEdge>(),
                    )
                    .chain(
                        edges
                            .property_type_to_data_type
                            .into_flattened::<OntologyOutwardEdge>(),
                    )
                    .collect(),
            ),
            knowledge_graph: KnowledgeGraphRootedEdges(
                edges
                    .entity_to_entity
                    .into_flattened::<KnowledgeGraphOutwardEdge>()
                    .chain(
                        edges
                            .entity_to_entity_type
                            .into_flattened::<KnowledgeGraphOutwardEdge>(),
                    )
                    .collect(),
            ),
        }
    }
}

impl From<Edges> for crate::subgraph::edges::Edges {
    fn from(value: Edges) -> Self {
        let Edges {
            ontology,
            knowledge_graph,
        } = value;

        let entity_type_to_entity_type = AdjacencyList::default();
        let entity_type_to_property_type = AdjacencyList::default();
        let property_type_to_property_type = AdjacencyList::default();
        let property_type_to_data_type = AdjacencyList::default();

        let mut entity_to_entity = AdjacencyList::default();
        let mut entity_to_entity_type = AdjacencyList::default();

        for (base_url, versions) in ontology.0 {
            for (version, edges) in versions {
                for edge in edges {
                    match edge {
                        OntologyOutwardEdge::ToOntology(OutwardEdge {
                            kind,
                            reversed,
                            right_endpoint,
                        }) => {
                            // todo, we're unable to determine what type it is exactly, e.g. an
                            //  entity-type of a property-type
                        }
                        OntologyOutwardEdge::ToKnowledgeGraph(OutwardEdge {
                            kind,
                            reversed,
                            right_endpoint,
                        }) => {
                            // todo
                        }
                    }
                }
            }
        }

        for (base_id, revisions) in knowledge_graph.0 {
            for (revision_id, edges) in revisions {
                let vertex_id = EntityVertexId {
                    base_id,
                    revision_id,
                };

                for edge in edges {
                    match edge {
                        KnowledgeGraphOutwardEdge::ToKnowledgeGraph(OutwardEdge {
                            kind,
                            reversed,
                            right_endpoint,
                        }) => {
                            entity_to_entity.insert(&vertex_id, kind, reversed, right_endpoint);
                        }
                        KnowledgeGraphOutwardEdge::ToOntology(OutwardEdge {
                            kind,
                            reversed,
                            right_endpoint,
                        }) => {
                            entity_to_entity_type.insert(
                                &vertex_id,
                                kind,
                                reversed,
                                right_endpoint,
                            );
                        }
                    }
                }
            }
        }

        Self {
            entity_to_entity,
            entity_to_entity_type,
            entity_type_to_entity_type,
            entity_type_to_property_type,
            property_type_to_property_type,
            property_type_to_data_type,
        }
    }
}

// Utoipa generates `Edges` as an empty object if we don't manually do it, and we can't use
// allOf because the generator can't handle it
impl ToSchema<'_> for Edges {
    fn schema() -> (&'static str, RefOr<Schema>) {
        (
            "Edges",
            ObjectBuilder::new()
                .additional_properties(Some(Schema::from(
                    ObjectBuilder::new().additional_properties(Some(Array::new(
                        OneOfBuilder::new()
                            .item(Ref::from_schema_name(OntologyOutwardEdge::schema().0))
                            .item(Ref::from_schema_name(KnowledgeGraphOutwardEdge::schema().0)),
                    ))),
                )))
                .into(),
        )
    }
}
