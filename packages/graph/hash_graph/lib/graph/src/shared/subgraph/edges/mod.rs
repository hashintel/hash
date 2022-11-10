use std::collections::{
    hash_map::{IntoIter, RawEntryMut},
    HashMap, HashSet,
};

use serde::Serialize;
use utoipa::{openapi, ToSchema};

use crate::identifier::GraphElementId;

mod kind;

pub use self::kind::*;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EdgeKind {
    /// An entity has a link
    HasLink,
    /// A link has an entity as its destination
    HasDestination,
    /// A link or entity has a link type or entity type as its type, respectively
    HasType,
    /// A type can reference another type
    References,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OutwardEdge {
    pub edge_kind: EdgeKind,
    pub destination: GraphElementId,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
pub struct Edges(HashMap<GraphElementId, HashSet<OutwardEdge>>);

impl Edges {
    #[must_use]
    pub fn new() -> Self {
        Self(HashMap::new())
    }

    pub fn insert(&mut self, identifier: GraphElementId, edge: OutwardEdge) -> bool {
        match self.0.raw_entry_mut().from_key(&identifier) {
            RawEntryMut::Vacant(entry) => {
                entry.insert(identifier, HashSet::from([edge]));
                true
            }
            RawEntryMut::Occupied(entry) => {
                let set = entry.into_mut();
                set.insert(edge)
            }
        }
    }
}

// Necessary because utoipa can't handle HashSet
impl ToSchema for Edges {
    fn schema() -> openapi::Schema {
        openapi::ObjectBuilder::new()
            .additional_properties(Some(openapi::schema::Array::new(OutwardEdge::schema())))
            .into()
    }
}

impl IntoIterator for Edges {
    type IntoIter = IntoIter<GraphElementId, HashSet<OutwardEdge>>;
    type Item = (GraphElementId, HashSet<OutwardEdge>);

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl Extend<(GraphElementId, HashSet<OutwardEdge>)> for Edges {
    fn extend<T: IntoIterator<Item = (GraphElementId, HashSet<OutwardEdge>)>>(&mut self, other: T) {
        self.0.extend(other);
    }
}
