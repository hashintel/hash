mod edges;
mod vertices;

use serde::Serialize;
use utoipa::ToSchema;

pub use self::{
    edges::{Edges, KnowledgeGraphRootedEdges, OntologyRootedEdges},
    vertices::{KnowledgeGraphVertices, OntologyVertices, Vertices},
};
use crate::{identifier::GraphElementEditionId, subgraph::edges::GraphResolveDepths};

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Subgraph {
    roots: Vec<GraphElementEditionId>,
    vertices: Vertices,
    edges: Edges,
    depths: GraphResolveDepths,
}

impl From<crate::subgraph::Subgraph> for Subgraph {
    fn from(subgraph: crate::subgraph::Subgraph) -> Self {
        Self {
            roots: subgraph.roots.into_iter().collect(),
            vertices: subgraph.vertices.into(),
            edges: subgraph.edges.into(),
            depths: subgraph.depths,
        }
    }
}
