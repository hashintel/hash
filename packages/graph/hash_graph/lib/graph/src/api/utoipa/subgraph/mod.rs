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
pub struct Subgraph<'u> {
    pub roots: Vec<GraphElementEditionId>,
    pub vertices: Vertices<'u>,
    pub edges: Edges<'u>,
    pub depths: GraphResolveDepths,
}
