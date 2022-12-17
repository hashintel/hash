use std::collections::{hash_map::Entry, HashMap};

use serde::Serialize;
use type_system::uri::BaseUri;
use utoipa::{
    openapi::{Array, ObjectBuilder, OneOfBuilder, Ref, Schema},
    ToSchema,
};

use crate::{
    api::rest::utoipa_typedef::{
        subgraph::{KnowledgeGraphVertex, Vertices},
        EntityIdAndTimestamp,
    },
    identifier::{
        knowledge::{EntityId, EntityVersion},
        ontology::{OntologyTypeEditionId, OntologyTypeVersion},
    },
    store::Record,
    subgraph::edges::{KnowledgeGraphEdgeKind, OntologyOutwardEdges, OutwardEdge, SharedEdgeKind},
};

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum KnowledgeGraphOutwardEdges {
    ToKnowledgeGraph(OutwardEdge<KnowledgeGraphEdgeKind, EntityIdAndTimestamp>),
    ToOntology(OutwardEdge<SharedEdgeKind, OntologyTypeEditionId>),
}

// WARNING: This MUST be kept up to date with the enum variants.
//   We have to do this because utoipa doesn't understand serde untagged:
//   https://github.com/juhaku/utoipa/issues/320
impl ToSchema for KnowledgeGraphOutwardEdges {
    fn schema() -> Schema {
        OneOfBuilder::new()
            .item(<OutwardEdge<KnowledgeGraphEdgeKind, EntityIdAndTimestamp>>::schema())
            .item(<OutwardEdge<SharedEdgeKind, OntologyTypeEditionId>>::schema())
            .into()
    }
}

#[derive(Default, Debug, Serialize, ToSchema)]
#[serde(transparent)]
pub struct KnowledgeGraphRootedEdges(
    pub HashMap<EntityId, HashMap<EntityVersion, Vec<KnowledgeGraphOutwardEdges>>>,
);

#[derive(Default, Debug, Serialize, ToSchema)]
#[serde(transparent)]
pub struct OntologyRootedEdges(
    pub HashMap<BaseUri, HashMap<OntologyTypeVersion, Vec<OntologyOutwardEdges>>>,
);

#[derive(Serialize)]
pub struct Edges {
    #[serde(flatten)]
    pub ontology: OntologyRootedEdges,
    #[serde(flatten)]
    pub knowledge_graph: KnowledgeGraphRootedEdges,
}

impl Edges {
    pub fn from_store_subgraph(edges: crate::subgraph::edges::Edges, vertices: &Vertices) -> Self {
        Self {
            ontology: OntologyRootedEdges(edges.ontology.into_iter().fold(
                HashMap::new(),
                |mut map, (id, edges)| {
                    let edges = edges.into_iter().collect();
                    match map.entry(id.base_id().clone()) {
                        Entry::Occupied(entry) => {
                            entry.into_mut().insert(id.version(), edges);
                        }
                        Entry::Vacant(entry) => {
                            entry.insert(HashMap::from([(id.version(), edges)]));
                        }
                    }
                    map
                },
            )),
            knowledge_graph: KnowledgeGraphRootedEdges(edges.knowledge_graph.into_iter().fold(
                HashMap::new(),
                |mut map, (id, edges)| {
                    let edges = edges.into_iter().map(|edge| {
                        match edge {
                            crate::subgraph::edges::KnowledgeGraphOutwardEdges::ToOntology(edge) => {
                                KnowledgeGraphOutwardEdges::ToOntology(edge)
                            }
                            crate::subgraph::edges::KnowledgeGraphOutwardEdges::ToKnowledgeGraph(
                                edge,
                            ) => {
                                let earliest_entity = vertices
                                    .knowledge_graph
                                    .0
                                    .get(&edge.right_endpoint)
                                    .expect("Vertex must exist")
                                    .values()
                                    .map(|KnowledgeGraphVertex::Entity(entity)| entity.edition_id().version().transaction_time().as_start_bound_timestamp())
                                    .min()
                                    .expect("Vertex must exist");
                                KnowledgeGraphOutwardEdges::ToKnowledgeGraph(
                                    OutwardEdge {
                                        kind: edge.kind,
                                        reversed: edge.reversed,
                                        right_endpoint: EntityIdAndTimestamp {
                                            base_id: edge.right_endpoint,
                                            timestamp: earliest_entity
                                        },
                                    })
                            }
                        }
                    }).collect();
                    match map.entry(id.base_id()) {
                        Entry::Occupied(entry) => {
                            entry.into_mut().insert(id.version(), edges);
                        }
                        Entry::Vacant(entry) => {
                            entry.insert(HashMap::from([(id.version(), edges)]));
                        }
                    }
                    map
                },
            )),
        }
    }
}

// Utoipa generates `Edges` as an empty object if we don't manually do it, and we can't use
// allOf because the generator can't handle it
impl ToSchema for Edges {
    fn schema() -> Schema {
        ObjectBuilder::new()
            .additional_properties(Some(Schema::from(
                ObjectBuilder::new().additional_properties(Some(Array::new(
                    OneOfBuilder::new()
                        .item(Ref::from_schema_name("OntologyOutwardEdges"))
                        .item(Ref::from_schema_name("KnowledgeGraphOutwardEdges")),
                ))),
            )))
            .into()
    }
}
