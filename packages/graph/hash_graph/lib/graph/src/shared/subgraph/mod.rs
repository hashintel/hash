mod depths;
mod edges;
mod query;
mod vertices;

use std::collections::HashMap;

use serde::Serialize;
use utoipa::ToSchema;

pub use self::{depths::*, edges::*, query::*, vertices::*};
use crate::identifier::GraphElementEditionIdentifier;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Subgraph {
    pub roots: Vec<GraphElementEditionIdentifier>,
    pub vertices: Vertices,
    pub edges: Edges,
    pub depths: GraphResolveDepths,
}

impl Subgraph {
    #[must_use]
    pub fn new(depths: GraphResolveDepths) -> Self {
        Self {
            roots: Vec::new(),
            vertices: Vertices::new(
                OntologyVertices(HashMap::new()),
                KnowledgeGraphVertices(HashMap::new()),
            ),
            edges: Edges::new(),
            depths,
        }
    }
}

impl Extend<Self> for Subgraph {
    fn extend<T: IntoIterator<Item = Self>>(&mut self, iter: T) {
        for subgraph in iter {
            self.roots.extend(subgraph.roots.into_iter());
            self.vertices.extend(subgraph.vertices);
            self.edges.extend(subgraph.edges);
        }
    }
}
