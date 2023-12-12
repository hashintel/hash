mod edges;
mod vertices;

use graph::subgraph::{
    edges::GraphResolveDepths, identifier::GraphElementVertexId,
    temporal_axes::SubgraphTemporalAxes,
};
use serde::Serialize;
use utoipa::ToSchema;

pub use self::{
    edges::{Edges, KnowledgeGraphOutwardEdge, OntologyOutwardEdge},
    vertices::{
        KnowledgeGraphVertex, KnowledgeGraphVertices, OntologyTypeVertexId, OntologyVertex,
        OntologyVertices, Vertex, Vertices,
    },
};

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Subgraph {
    roots: Vec<GraphElementVertexId>,
    vertices: Vertices,
    edges: Edges,
    depths: GraphResolveDepths,
    temporal_axes: SubgraphTemporalAxes,
}

impl From<graph::subgraph::Subgraph> for Subgraph {
    fn from(subgraph: graph::subgraph::Subgraph) -> Self {
        Self {
            roots: subgraph.roots.into_iter().collect(),
            vertices: subgraph.vertices.into(),
            edges: subgraph.edges.into(),
            depths: subgraph.depths,
            temporal_axes: subgraph.temporal_axes,
        }
    }
}
