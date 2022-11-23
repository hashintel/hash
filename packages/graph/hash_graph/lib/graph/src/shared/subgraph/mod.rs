use std::{collections::HashSet, fmt::Debug};

use depths::GraphResolveDepths;
use edges::Edges;

use crate::{shared::identifier::GraphElementEditionId, subgraph::vertices::Vertices};

pub mod depths;
pub mod edges;
pub mod query;
pub mod vertices;

#[derive(Debug, Default)]
pub struct Subgraph {
    pub roots: HashSet<GraphElementEditionId>,
    pub vertices: Vertices,
    pub edges: Edges,
    pub depths: GraphResolveDepths,
}

impl Subgraph {
    #[must_use]
    pub fn into_utoipa(self) -> crate::api::utoipa::subgraph::Subgraph {
        crate::api::utoipa::subgraph::Subgraph {
            roots: self.roots.into_iter().collect(),
            vertices: self.vertices.into_utoipa(),
            edges: self.edges.into_utoipa(),
            depths: self.depths,
        }
    }
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
