mod edges;
mod vertices;

use serde::Serialize;
use utoipa::ToSchema;

pub use self::{
    edges::{Edges, KnowledgeGraphRootedEdges, OntologyRootedEdges},
    vertices::{KnowledgeGraphVertices, OntologyVertices, Vertices},
};
use crate::{identifier::GraphElementEditionId, subgraph::depths::GraphResolveDepths};

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Subgraph {
    pub roots: Vec<GraphElementEditionId>,
    pub vertices: Vertices,
    pub edges: Edges,
    pub depths: GraphResolveDepths,
}
