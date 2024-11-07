mod edges;
mod vertices;

use hash_graph_store::subgraph::{
    edges::GraphResolveDepths, identifier::GraphElementVertexId,
    temporal_axes::SubgraphTemporalAxes,
};
use serde::Serialize;
use utoipa::ToSchema;

pub(crate) use self::{
    edges::{Edges, KnowledgeGraphOutwardEdge, OntologyOutwardEdge},
    vertices::{
        KnowledgeGraphVertex, KnowledgeGraphVertices, OntologyTypeVertexId, OntologyVertex,
        OntologyVertices, Vertex, Vertices,
    },
};

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Subgraph {
    roots: Vec<GraphElementVertexId>,
    vertices: Vertices,
    edges: Edges,
    depths: GraphResolveDepths,
    temporal_axes: SubgraphTemporalAxes,
}

impl From<hash_graph_store::subgraph::Subgraph> for Subgraph {
    fn from(subgraph: hash_graph_store::subgraph::Subgraph) -> Self {
        Self {
            roots: subgraph.roots,
            vertices: subgraph.vertices.into(),
            edges: subgraph.edges.into(),
            depths: subgraph.depths,
            temporal_axes: subgraph.temporal_axes,
        }
    }
}
