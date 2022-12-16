use std::collections::hash_map::{RandomState, RawEntryMut};
use std::hash::Hash;
use crate::identifier::GraphElementEditionId;
use crate::store::query::{Filter, QueryPath};
use crate::subgraph::Subgraph;

/// A record stored in the [`store`].
///
/// [`store`]: crate::store
pub trait Record: Sized + Send {
    type EditionId: Clone + PartialEq + Eq + Hash + Send + Sync + Into<GraphElementEditionId>;
    type QueryPath<'p>: QueryPath + Send + Sync;

    fn edition_id(&self) -> &Self::EditionId;

    fn create_filter_for_edition_id(edition_id: &Self::EditionId) -> Filter<Self>;

    fn subgraph_entry<'s>(
        subgraph: &'s mut Subgraph,
        edition_id: &Self::EditionId,
    ) -> RawEntryMut<'s, Self::EditionId, Self, RandomState>;

    fn insert_into_subgraph(self, subgraph: &mut Subgraph) -> &Self {
        let edition_id = self.edition_id();
        Self::subgraph_entry(subgraph, edition_id)
            .or_insert(edition_id.clone(), self)
            .1
    }

    fn insert_into_subgraph_as_root(self, subgraph: &mut Subgraph) -> &Self {
        let edition_id = self.edition_id();
        subgraph.roots.insert(edition_id.clone().into());
        Self::subgraph_entry(subgraph, edition_id)
            .or_insert(edition_id.clone(), self)
            .1
    }
}