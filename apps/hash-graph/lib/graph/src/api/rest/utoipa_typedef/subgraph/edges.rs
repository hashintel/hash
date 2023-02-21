use std::collections::{hash_map::Entry, BTreeMap, HashMap};

use serde::Serialize;
use type_system::uri::BaseUri;
use utoipa::{
    openapi::{Array, ObjectBuilder, OneOfBuilder, Ref, RefOr, Schema},
    ToSchema,
};

use crate::{
    api::rest::utoipa_typedef::{subgraph::Vertices, EntityIdAndTimestamp},
    identifier::{
        knowledge::EntityId,
        ontology::OntologyTypeVersion,
        time::{TimeAxis, Timestamp, VariableAxis},
        OntologyTypeVertexId,
    },
    store::Record,
    subgraph::edges::{KnowledgeGraphEdgeKind, OntologyOutwardEdge, OutwardEdge, SharedEdgeKind},
};

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum KnowledgeGraphOutwardEdge {
    ToKnowledgeGraph(OutwardEdge<KnowledgeGraphEdgeKind, EntityIdAndTimestamp>),
    ToOntology(OutwardEdge<SharedEdgeKind, OntologyTypeVertexId>),
}

impl From<OutwardEdge<KnowledgeGraphEdgeKind, EntityIdAndTimestamp>> for KnowledgeGraphOutwardEdge {
    fn from(edge: OutwardEdge<KnowledgeGraphEdgeKind, EntityIdAndTimestamp>) -> Self {
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
                    <OutwardEdge<KnowledgeGraphEdgeKind, EntityIdAndTimestamp>>::generate_schema(
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

impl Edges {
    pub fn from_vertices_and_store_edges(
        edges: crate::subgraph::edges::Edges,
        vertices: &Vertices,
        time_axis: TimeAxis,
    ) -> Self {
        Self {
            ontology: OntologyRootedEdges(edges.ontology.into_iter().fold(
                HashMap::new(),
                |mut map, (id, edges)| {
                    let edges = edges.into_iter().collect();
                    match map.entry(id.base_id.clone()) {
                        Entry::Occupied(entry) => {
                            entry.into_mut().insert(id.revision_id, edges);
                        }
                        Entry::Vacant(entry) => {
                            entry.insert(BTreeMap::from([(id.revision_id, edges)]));
                        }
                    }
                    map
                },
            )),
            knowledge_graph: KnowledgeGraphRootedEdges(edges.knowledge_graph.into_iter().fold(
                HashMap::new(),
                |mut map, (id, edges)| {
                    let edges = edges
                        .into_iter()
                        .map(|edge| {
                            match edge {
                            crate::subgraph::edges::KnowledgeGraphOutwardEdge::ToOntology(edge) => {
                                KnowledgeGraphOutwardEdge::ToOntology(edge)
                            }
                            crate::subgraph::edges::KnowledgeGraphOutwardEdge::ToKnowledgeGraph(
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
                                    vertices.earliest_entity_by_id(&id.base_id)
                                }
                                    .expect("entity must exist in subgraph")
                                    .vertex_id(time_axis)
                                    .revision_id;

                                KnowledgeGraphOutwardEdge::ToKnowledgeGraph(OutwardEdge {
                                    kind: edge.kind,
                                    reversed: edge.reversed,
                                    right_endpoint: EntityIdAndTimestamp {
                                        base_id: edge.right_endpoint,
                                        timestamp: earliest_timestamp,
                                    },
                                })
                            }
                        }
                        })
                        .collect();
                    match map.entry(id.base_id) {
                        Entry::Occupied(entry) => {
                            entry.into_mut().insert(id.revision_id, edges);
                        }
                        Entry::Vacant(entry) => {
                            entry.insert(BTreeMap::from([(id.revision_id, edges)]));
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
