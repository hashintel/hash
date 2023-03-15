mod edges;
mod vertices;

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

pub use self::{
    edges::{
        Edges, KnowledgeGraphOutwardEdge, KnowledgeGraphRootedEdges, OntologyOutwardEdge,
        OntologyRootedEdges,
    },
    vertices::{
        KnowledgeGraphVertex, KnowledgeGraphVertices, OntologyTypeVertexId, OntologyVertex,
        OntologyVertices, Vertex, Vertices,
    },
};
use crate::subgraph::{
    edges::GraphResolveDepths, identifier::GraphElementVertexId,
    temporal_axes::SubgraphTemporalAxes,
};

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Subgraph {
    roots: Vec<GraphElementVertexId>,
    vertices: Vertices,
    edges: Edges,
    depths: GraphResolveDepths,
    temporal_axes: SubgraphTemporalAxes,
}

impl From<crate::subgraph::Subgraph> for Subgraph {
    fn from(subgraph: crate::subgraph::Subgraph) -> Self {
        Self {
            roots: subgraph.roots.into_iter().collect(),
            vertices: subgraph.vertices.into(),
            edges: subgraph.edges.into(),
            depths: subgraph.depths,
            temporal_axes: subgraph.temporal_axes,
        }
    }
}
