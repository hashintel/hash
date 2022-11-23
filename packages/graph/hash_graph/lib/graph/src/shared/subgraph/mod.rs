use std::{collections::HashSet, fmt::Debug};

use depths::GraphResolveDepths;
use edges::Edges;
use serde::Serialize;

use crate::{shared::identifier::GraphElementEditionId, subgraph::vertices::Vertices};

pub mod depths;
pub mod edges;
pub mod query;
pub mod vertices;

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Subgraph {
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
            vertices: Vertices::default(),
            edges: Edges::default(),
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
