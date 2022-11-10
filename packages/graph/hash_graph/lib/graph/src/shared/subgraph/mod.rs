use std::{
    collections::{HashMap, HashSet},
    fmt::Debug,
};

use depths::GraphResolveDepths;
use edges::Edges;
use serde::Serialize;
use utoipa::ToSchema;

use crate::{
    shared::identifier::GraphElementEditionId,
    subgraph::vertices::{KnowledgeGraphVertices, OntologyVertices, Vertices},
};

pub mod depths;
pub mod edges;
pub mod query;
pub mod vertices;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Subgraph {
    #[schema(value_type = Vec<GraphElementId>)]
    pub roots: HashSet<GraphElementEditionId>,
    pub vertices: Vertices,
    pub edges: Edges,
    pub depths: GraphResolveDepths,
}

impl Subgraph {
    #[must_use]
    pub fn new(depths: GraphResolveDepths) -> Self {
        Self {
            roots: HashSet::new(),
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
