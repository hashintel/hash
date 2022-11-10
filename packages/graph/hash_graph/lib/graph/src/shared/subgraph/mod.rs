use std::{
    collections::{HashMap, HashSet},
    fmt::{Debug, Formatter},
};

use depths::GraphResolveDepths;
use edges::Edges;
use serde::{Deserialize, Serialize};
use type_system::{DataType, EntityType, PropertyType};
use utoipa::ToSchema;
use vertices::Vertex;

use crate::{
    knowledge::EntityProperties,
    shared::identifier::GraphElementId,
    store::query::{Filter, QueryRecord},
};

mod depths;
mod edges;
mod vertices;

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

/// A [`Filter`] to query the datastore, recursively resolving according to the
/// [`GraphResolveDepths`].
#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
#[aliases(
    DataTypeStructuralQuery = StructuralQuery<'static, DataType>,
    PropertyTypeStructuralQuery = StructuralQuery<'static, PropertyType>,
    EntityTypeStructuralQuery = StructuralQuery<'static, EntityType>,
    EntityStructuralQuery = StructuralQuery<'static, EntityProperties>,
)]
pub struct StructuralQuery<'q, T: QueryRecord> {
    #[serde(bound = "'de: 'q, T::Path<'q>: Deserialize<'de>")]
    pub filter: Filter<'q, T>,
    pub graph_resolve_depths: GraphResolveDepths,
}

// TODO: Derive traits when bounds are generated correctly
//   see https://github.com/rust-lang/rust/issues/26925
impl<'q, T> Debug for StructuralQuery<'q, T>
where
    T: QueryRecord<Path<'q>: Debug>,
{
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("StructuralQuery")
            .field("filter", &self.filter)
            .field("graph_resolve_depths", &self.graph_resolve_depths)
            .finish()
    }
}
