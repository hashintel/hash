use std::collections::{BTreeMap, HashMap};

use serde::Serialize;
use type_system::uri::BaseUri;
use utoipa::{
    openapi::{Array, ObjectBuilder, OneOfBuilder, Ref, RefOr, Schema},
    ToSchema,
};

use crate::{
    identifier::{
        knowledge::EntityId,
        ontology::OntologyTypeVersion,
        time::{Timestamp, VariableAxis},
        EntityIdWithInterval, OntologyTypeVertexId,
    },
    subgraph::edges::{KnowledgeGraphEdgeKind, OntologyOutwardEdge, OutwardEdge, SharedEdgeKind},
};

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

impl From<OutwardEdge<SharedEdgeKind, OntologyTypeVertexId>> for KnowledgeGraphOutwardEdge {
    fn from(edge: OutwardEdge<SharedEdgeKind, OntologyTypeVertexId>) -> Self {
        Self::ToOntology(edge)
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
    pub HashMap<BaseUri, BTreeMap<OntologyTypeVersion, Vec<OntologyOutwardEdge>>>,
);

#[derive(Serialize)]
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
                    .ontology_to_ontology
                    .into_flattened::<OntologyOutwardEdge>()
                    .chain(
                        edges
                            .ontology_to_knowledge
                            .into_flattened::<OntologyOutwardEdge>(),
                    )
                    .collect(),
            ),
            knowledge_graph: KnowledgeGraphRootedEdges(
                edges
                    .knowledge_to_ontology
                    .into_flattened::<KnowledgeGraphOutwardEdge>()
                    .chain(
                        edges
                            .knowledge_to_knowledge
                            .into_flattened::<KnowledgeGraphOutwardEdge>(),
                    )
                    .collect(),
            ),
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
