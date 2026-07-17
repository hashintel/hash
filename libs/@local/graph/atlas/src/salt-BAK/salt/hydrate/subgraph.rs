//! Serializable mirror of the store subgraph.
//!
//! [`hash_graph_store::subgraph::Subgraph`] and its vertex and edge
//! containers deliberately carry no serde implementations; the REST layer in
//! `hash-graph-api` flattens them into a keyed wire shape private to that
//! crate. This module reproduces exactly that wire shape — vertices and
//! edges keyed by [`EntityId`] or [`BaseUrl`] and then by revision — so the
//! Atlas hydration endpoint serves subgraphs byte-compatible with the main
//! Graph API. Nothing here interprets the subgraph; it only re-keys it.

use alloc::collections::BTreeMap;
use core::hash::Hash;
use std::collections::{HashMap, hash_map::Entry};

use hash_graph_store::subgraph::{
    edges::{KnowledgeGraphEdgeKind, OntologyEdgeKind, OutwardEdge, SharedEdgeKind},
    identifier::{
        DataTypeVertexId, EntityIdWithInterval, EntityTypeVertexId, GraphElementVertexId,
        PropertyTypeVertexId,
    },
    temporal_axes::{SubgraphTemporalAxes, VariableAxis},
};
use hash_graph_temporal_versioning::Timestamp;
use serde::Serialize;
use type_system::{
    knowledge::{Entity, entity::EntityId},
    ontology::{
        DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata,
        id::{BaseUrl, OntologyTypeVersion},
    },
};

/// One hydrated subgraph in the Graph REST API's keyed wire shape.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EntitySubgraph {
    roots: Vec<GraphElementVertexId>,
    vertices: Vertices,
    edges: Edges,
    temporal_axes: SubgraphTemporalAxes,
}

impl From<hash_graph_store::subgraph::Subgraph> for EntitySubgraph {
    fn from(subgraph: hash_graph_store::subgraph::Subgraph) -> Self {
        Self {
            roots: subgraph.roots,
            vertices: subgraph.vertices.into(),
            edges: subgraph.edges.into(),
            temporal_axes: subgraph.temporal_axes,
        }
    }
}

#[expect(
    clippy::enum_variant_names,
    reason = "the REST wire distinguishes exactly these three ontology type kinds"
)]
#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize)]
#[serde(untagged)]
enum OntologyTypeVertexId {
    DataType(DataTypeVertexId),
    PropertyType(PropertyTypeVertexId),
    EntityType(EntityTypeVertexId),
}

impl OntologyTypeVertexId {
    fn into_parts(self) -> (BaseUrl, OntologyTypeVersion) {
        match self {
            Self::DataType(id) => (id.base_id, id.revision_id),
            Self::PropertyType(id) => (id.base_id, id.revision_id),
            Self::EntityType(id) => (id.base_id, id.revision_id),
        }
    }
}

#[expect(
    clippy::enum_variant_names,
    reason = "the REST wire distinguishes exactly these three ontology type kinds"
)]
#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "inner", rename_all = "camelCase")]
enum OntologyVertex {
    DataType(Box<DataTypeWithMetadata>),
    PropertyType(Box<PropertyTypeWithMetadata>),
    EntityType(Box<EntityTypeWithMetadata>),
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "inner", rename_all = "camelCase")]
enum KnowledgeGraphVertex {
    Entity(Box<Entity>),
}

#[derive(Debug, Serialize)]
#[serde(transparent)]
struct OntologyVertices(HashMap<BaseUrl, BTreeMap<OntologyTypeVersion, OntologyVertex>>);

#[derive(Debug, Serialize)]
#[serde(transparent)]
struct KnowledgeGraphVertices(
    HashMap<EntityId, BTreeMap<Timestamp<VariableAxis>, KnowledgeGraphVertex>>,
);

#[derive(Debug, Serialize)]
struct Vertices {
    #[serde(flatten)]
    ontology: OntologyVertices,
    #[serde(flatten)]
    knowledge_graph: KnowledgeGraphVertices,
}

impl From<hash_graph_store::subgraph::vertices::Vertices> for Vertices {
    fn from(vertices: hash_graph_store::subgraph::vertices::Vertices) -> Self {
        let data_types = vertices.data_types.into_iter().map(|(id, data_type)| {
            (
                OntologyTypeVertexId::DataType(id),
                OntologyVertex::DataType(Box::new(data_type)),
            )
        });
        let property_types = vertices
            .property_types
            .into_iter()
            .map(|(id, property_type)| {
                (
                    OntologyTypeVertexId::PropertyType(id),
                    OntologyVertex::PropertyType(Box::new(property_type)),
                )
            });
        let entity_types = vertices.entity_types.into_iter().map(|(id, entity_type)| {
            (
                OntologyTypeVertexId::EntityType(id),
                OntologyVertex::EntityType(Box::new(entity_type)),
            )
        });
        Self {
            ontology: OntologyVertices(data_types.chain(property_types).chain(entity_types).fold(
                HashMap::new(),
                |mut map, (id, vertex)| {
                    let (base_id, revision_id) = id.into_parts();
                    map.entry(base_id).or_default().insert(revision_id, vertex);
                    map
                },
            )),
            knowledge_graph: KnowledgeGraphVertices(vertices.entities.into_iter().fold(
                HashMap::new(),
                |mut map, (id, vertex)| {
                    map.entry(id.base_id).or_default().insert(
                        id.revision_id,
                        KnowledgeGraphVertex::Entity(Box::new(vertex)),
                    );
                    map
                },
            )),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum OntologyOutwardEdge {
    ToOntology(OutwardEdge<OntologyEdgeKind, OntologyTypeVertexId>),
    ToKnowledgeGraph(OutwardEdge<SharedEdgeKind, EntityIdWithInterval>),
}

impl From<OutwardEdge<OntologyEdgeKind, EntityTypeVertexId>> for OntologyOutwardEdge {
    fn from(edge: OutwardEdge<OntologyEdgeKind, EntityTypeVertexId>) -> Self {
        Self::ToOntology(OutwardEdge {
            kind: edge.kind,
            direction: edge.direction,
            right_endpoint: OntologyTypeVertexId::EntityType(edge.right_endpoint),
        })
    }
}

impl From<OutwardEdge<OntologyEdgeKind, PropertyTypeVertexId>> for OntologyOutwardEdge {
    fn from(edge: OutwardEdge<OntologyEdgeKind, PropertyTypeVertexId>) -> Self {
        Self::ToOntology(OutwardEdge {
            kind: edge.kind,
            direction: edge.direction,
            right_endpoint: OntologyTypeVertexId::PropertyType(edge.right_endpoint),
        })
    }
}

impl From<OutwardEdge<OntologyEdgeKind, DataTypeVertexId>> for OntologyOutwardEdge {
    fn from(edge: OutwardEdge<OntologyEdgeKind, DataTypeVertexId>) -> Self {
        Self::ToOntology(OutwardEdge {
            kind: edge.kind,
            direction: edge.direction,
            right_endpoint: OntologyTypeVertexId::DataType(edge.right_endpoint),
        })
    }
}

impl From<OutwardEdge<SharedEdgeKind, EntityIdWithInterval>> for OntologyOutwardEdge {
    fn from(edge: OutwardEdge<SharedEdgeKind, EntityIdWithInterval>) -> Self {
        Self::ToKnowledgeGraph(edge)
    }
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum KnowledgeGraphOutwardEdge {
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
            direction: edge.direction,
            right_endpoint: OntologyTypeVertexId::EntityType(edge.right_endpoint),
        })
    }
}

#[derive(Debug, Serialize)]
#[serde(transparent)]
struct OntologyRootedEdges(
    HashMap<BaseUrl, BTreeMap<OntologyTypeVersion, Vec<OntologyOutwardEdge>>>,
);

#[derive(Debug, Serialize)]
#[serde(transparent)]
struct KnowledgeGraphRootedEdges(
    HashMap<EntityId, BTreeMap<Timestamp<VariableAxis>, Vec<KnowledgeGraphOutwardEdge>>>,
);

#[derive(Debug, Serialize)]
struct Edges {
    #[serde(flatten)]
    ontology: OntologyRootedEdges,
    #[serde(flatten)]
    knowledge_graph: KnowledgeGraphRootedEdges,
}

fn collect_merge<T: Hash + Eq, U: Ord, V>(
    mut accumulator: HashMap<T, BTreeMap<U, Vec<V>>>,
    (key, value): (T, BTreeMap<U, Vec<V>>),
) -> HashMap<T, BTreeMap<U, Vec<V>>> {
    match accumulator.entry(key) {
        Entry::Occupied(mut occupied) => {
            let entry = occupied.get_mut();
            for (revision, mut edges) in value {
                entry.entry(revision).or_default().append(&mut edges);
            }
        }
        Entry::Vacant(vacant) => {
            vacant.insert(value);
        }
    }
    accumulator
}

impl From<hash_graph_store::subgraph::edges::Edges> for Edges {
    fn from(edges: hash_graph_store::subgraph::edges::Edges) -> Self {
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
                    .fold(HashMap::new(), collect_merge),
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
                    .fold(HashMap::new(), collect_merge),
            ),
        }
    }
}
