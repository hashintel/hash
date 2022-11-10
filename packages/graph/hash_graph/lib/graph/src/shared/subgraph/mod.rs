use std::{
    collections::{HashMap, HashSet},
    fmt::Debug,
};

use depths::GraphResolveDepths;
use edges::Edges;
use serde::Serialize;
use utoipa::ToSchema;
use vertices::Vertex;

use crate::shared::identifier::GraphElementId;

pub mod depths;
pub mod edges;
pub mod query;
pub mod vertices;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Subgraph {
    #[schema(value_type = Vec<GraphElementId>)]
    pub roots: HashSet<GraphElementId>,
    pub vertices: HashMap<GraphElementId, Vertex>,
    pub edges: Edges,
    pub depths: GraphResolveDepths,
}

impl Subgraph {
    #[must_use]
    pub fn new(depths: GraphResolveDepths) -> Self {
        Self {
            roots: HashSet::new(),
            vertices: HashMap::new(),
            edges: Edges::new(),
            depths,
        }
    }
}

impl Extend<Self> for Subgraph {
    fn extend<T: IntoIterator<Item = Self>>(&mut self, iter: T) {
        for subgraph in iter {
            self.roots.extend(subgraph.roots.into_iter());
            self.vertices.extend(subgraph.vertices.into_iter());
            self.edges.extend(subgraph.edges.into_iter());
        }
    }
}
