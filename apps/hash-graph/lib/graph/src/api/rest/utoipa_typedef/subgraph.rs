mod edges;
mod vertices;

use serde::Serialize;
use utoipa::ToSchema;

pub use self::{
    edges::{Edges, KnowledgeGraphOutwardEdge, KnowledgeGraphRootedEdges, OntologyRootedEdges},
    vertices::{
        KnowledgeGraphVertex, KnowledgeGraphVertices, OntologyVertex, OntologyVertices, Vertex,
        Vertices,
    },
};
use crate::{
    identifier::GraphElementVertexId,
    subgraph::{edges::GraphResolveDepths, SubgraphTemporalAxes},
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
