use std::collections::{hash_map::Entry, BTreeMap, HashMap};

use serde::Serialize;
use type_system::uri::BaseUri;
use utoipa::{
    openapi::{Array, ObjectBuilder, OneOfBuilder, Ref, Schema},
    ToSchema,
};

use crate::{
    api::rest::utoipa_typedef::{subgraph::Vertices, EntityIdAndTimestamp},
    identifier::{
        knowledge::EntityId,
        ontology::{OntologyTypeEditionId, OntologyTypeVersion},
        TransactionTimestamp,
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
    pub HashMap<EntityId, BTreeMap<TransactionTimestamp, Vec<KnowledgeGraphOutwardEdges>>>,
);

#[derive(Default, Debug, Serialize, ToSchema)]
#[serde(transparent)]
pub struct OntologyRootedEdges(
    pub HashMap<BaseUri, BTreeMap<OntologyTypeVersion, Vec<OntologyOutwardEdges>>>,
);

#[derive(Serialize)]
pub struct Edges {
    #[serde(flatten)]
    pub ontology: OntologyRootedEdges,
    #[serde(flatten)]
    pub knowledge_graph: KnowledgeGraphRootedEdges,
}

impl Edges {
    pub fn from_vertices_and_store_edges(
        edges: crate::subgraph::edges::Edges,
        vertices: &Vertices,
    ) -> Self {
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
                            entry.insert(BTreeMap::from([(id.version(), edges)]));
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
                                // We avoid storing redundant information when multiple editions of
                                // the endpoints or links are present and in order to easily look
                                // the corresponding link up in the vertices we store the earliest
                                // timestamp when a link was added to the entity.
                                //
                                // As the vertices are sorted by timestamp, it's possible to get all
                                // vertices starting with the provided earliest timestamp without
                                // further filtering.
                                //
                                // We have four different permutations of a knowledge-knowledge
                                // edge:
                                //   1. `HAS_LEFT_ENTITY`, `reversed = false`
                                //   2. `HAS_RIGHT_ENTITY`, `reversed = false`
                                //   3. `HAS_LEFT_ENTITY`, `reversed = true`
                                //   4. `HAS_RIGHT_ENTITY`, `reversed = true`
                                //
                                // For 1. and 2., the entity is a link and we want to store the
                                // earliest version of this link as the earliest timestamp.
                                // For 3. and 4., the endpoint of the edge is a link and we want to
                                // store the earliest of that endpoint as the earliest timestamp.
                                let earliest_timestamp = if edge.reversed {
                                    vertices.earliest_entity_by_id(&edge.right_endpoint)
                                } else {
                                    vertices.earliest_entity_by_id(&id.base_id())
                                }
                                    .expect("entity must exist in subgraph")
                                    .edition_id()
                                    .version()
                                    .transaction_time()
                                    .as_start_bound_timestamp();

                                KnowledgeGraphOutwardEdges::ToKnowledgeGraph(OutwardEdge {
                                    kind: edge.kind,
                                    reversed: edge.reversed,
                                    right_endpoint: EntityIdAndTimestamp {
                                        base_id: edge.right_endpoint,
                                        timestamp: earliest_timestamp,
                                    },
                                })
                            }
                        }
                    }).collect();
                    match map.entry(id.base_id()) {
                        Entry::Occupied(entry) => {
                            entry.into_mut().insert(
                                id.version().transaction_time().as_start_bound_timestamp(),
                                edges
                            );
                        }
                        Entry::Vacant(entry) => {
                            entry.insert(BTreeMap::from([(
                                id.version().transaction_time().as_start_bound_timestamp(),
                                edges
                            )]));
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
