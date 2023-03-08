use std::{
    collections::{
        hash_map::{RandomState, RawEntryMut},
        HashMap,
    },
    hash::Hash,
};

use crate::{
    knowledge::Entity,
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
    store::Record,
    subgraph::{
        identifier::{EntityVertexId, GraphElementVertexId, OntologyTypeVertexId},
        Subgraph,
    },
};

#[derive(Default, Debug)]
pub struct Vertices {
    pub data_types: HashMap<OntologyTypeVertexId, DataTypeWithMetadata>,
    pub property_types: HashMap<OntologyTypeVertexId, PropertyTypeWithMetadata>,
    pub entity_types: HashMap<OntologyTypeVertexId, EntityTypeWithMetadata>,
    pub entities: HashMap<EntityVertexId, Entity>,
}

/// Used for index operations on a mutable [`Subgraph`].
///
/// Depending on `R`, the index operation will be performed on the respective collection of the
/// subgraph.
pub trait SubgraphIndex<R: Record>: Clone + Eq + Hash + Into<GraphElementVertexId> {
    /// Returns a mutable reference to the [`Record`] vertex in the subgraph.
    fn subgraph_vertex_entry<'a>(
        &self,
        subgraph: &'a mut Subgraph,
    ) -> RawEntryMut<'a, R::VertexId, R, RandomState>;
}
