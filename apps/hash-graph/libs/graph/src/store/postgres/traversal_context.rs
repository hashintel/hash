use std::{collections::HashMap, hash::Hash};

use error_stack::Result;
use graph_types::{
    knowledge::entity::{Entity, EntityEditionId},
    ontology::{DataTypeWithMetadata, EntityTypeWithMetadata, PropertyTypeWithMetadata},
};
use temporal_versioning::RightBoundedTemporalInterval;

use crate::{
    knowledge::EntityQueryPath,
    ontology::{DataTypeQueryPath, EntityTypeQueryPath, PropertyTypeQueryPath},
    store::{
        crud::Read,
        postgres::ontology::OntologyId,
        query::{Filter, FilterExpression, ParameterList},
        AsClient, PostgresStore, QueryError, SubgraphRecord,
    },
    subgraph::{edges::GraphResolveDepths, temporal_axes::VariableAxis, Subgraph},
};

impl<C: AsClient> PostgresStore<C> {
    async fn read_data_types_by_ids(
        &self,
        vertex_ids: impl IntoIterator<Item = OntologyId, IntoIter: Send> + Send,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let ids = vertex_ids
            .into_iter()
            .map(OntologyId::into_uuid)
            .collect::<Vec<_>>();

        for data_type in <Self as Read<DataTypeWithMetadata>>::read_vec(
            self,
            &Filter::<DataTypeWithMetadata>::In(
                FilterExpression::Path(DataTypeQueryPath::OntologyId),
                ParameterList::Uuid(&ids),
            ),
            Some(&subgraph.temporal_axes.resolved),
            false,
        )
        .await?
        {
            subgraph.insert_vertex(
                data_type.vertex_id(subgraph.temporal_axes.resolved.variable_time_axis()),
                data_type,
            );
        }

        Ok(())
    }

    async fn read_property_types_by_ids(
        &self,
        vertex_ids: impl IntoIterator<Item = OntologyId, IntoIter: Send> + Send,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let ids = vertex_ids
            .into_iter()
            .map(OntologyId::into_uuid)
            .collect::<Vec<_>>();

        for property_type in <Self as Read<PropertyTypeWithMetadata>>::read_vec(
            self,
            &Filter::<PropertyTypeWithMetadata>::In(
                FilterExpression::Path(PropertyTypeQueryPath::OntologyId),
                ParameterList::Uuid(&ids),
            ),
            Some(&subgraph.temporal_axes.resolved),
            false,
        )
        .await?
        {
            subgraph.insert_vertex(
                property_type.vertex_id(subgraph.temporal_axes.resolved.variable_time_axis()),
                property_type,
            );
        }

        Ok(())
    }

    async fn read_entity_types_by_ids(
        &self,
        vertex_ids: impl IntoIterator<Item = OntologyId, IntoIter: Send> + Send,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let ids = vertex_ids
            .into_iter()
            .map(OntologyId::into_uuid)
            .collect::<Vec<_>>();

        for entity_type in <Self as Read<EntityTypeWithMetadata>>::read_vec(
            self,
            &Filter::<EntityTypeWithMetadata>::In(
                FilterExpression::Path(EntityTypeQueryPath::OntologyId),
                ParameterList::Uuid(&ids),
            ),
            Some(&subgraph.temporal_axes.resolved),
            false,
        )
        .await?
        {
            subgraph.insert_vertex(
                entity_type.vertex_id(subgraph.temporal_axes.resolved.variable_time_axis()),
                entity_type,
            );
        }

        Ok(())
    }

    async fn read_entities_by_ids(
        &self,
        edition_ids: impl IntoIterator<Item = EntityEditionId, IntoIter: Send> + Send,
        subgraph: &mut Subgraph,
        include_drafts: bool,
    ) -> Result<(), QueryError> {
        let ids = edition_ids
            .into_iter()
            .map(EntityEditionId::into_uuid)
            .collect::<Vec<_>>();

        for entity in <Self as Read<Entity>>::read_vec(
            self,
            &Filter::<Entity>::In(
                FilterExpression::Path(EntityQueryPath::EditionId),
                ParameterList::Uuid(&ids),
            ),
            Some(&subgraph.temporal_axes.resolved),
            include_drafts,
        )
        .await?
        {
            subgraph.insert_vertex(
                entity.vertex_id(subgraph.temporal_axes.resolved.variable_time_axis()),
                entity,
            );
        }

        Ok(())
    }
}

#[derive(Debug)]
struct TraversalContextMap<K>(
    HashMap<
        K,
        Vec<(
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
    >,
);

impl<K> Default for TraversalContextMap<K> {
    fn default() -> Self {
        Self(HashMap::new())
    }
}

pub type AddIdReturn<K> = impl Iterator<
    Item = (
        K,
        GraphResolveDepths,
        RightBoundedTemporalInterval<VariableAxis>,
    ),
>;

impl<K: Eq + Hash + Copy> TraversalContextMap<K> {
    /// Adds a new entry to the map if it does not already exist.
    ///
    /// Inserting the entry is skipped if there is already an existing entry with:
    ///  - the same key
    ///  - **and** a `GraphResolveDepths` where all entries are greater than or equal to the new
    ///    resolve depth,
    ///  - **and** the new interval is contained in the existing interval.
    ///
    /// An iterator is returned that yields the key, graph resolve depths, and interval for each
    /// entry that has to be traversed further. If no entry was added, the iterator will be empty.
    fn add_id(
        &mut self,
        key: K,
        graph_resolve_depths: GraphResolveDepths,
        interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> AddIdReturn<K> {
        let values = self.0.entry(key).or_default();

        // TODO: Further optimization could happen here. It's possible to return none, a single, or
        //       multiple entries depending on the existing depths and traversed interval.
        //   See https://app.asana.com/0/0/1204117847656667/f
        if values.iter().any(|&(existing_depths, traversed_interval)| {
            existing_depths.contains(graph_resolve_depths)
                && traversed_interval.contains_interval(&interval)
        }) {
            None.into_iter()
        } else {
            values.push((graph_resolve_depths, interval));
            Some((key, graph_resolve_depths, interval)).into_iter()
        }
    }
}

#[derive(Debug, Default)]
pub struct TraversalContext {
    data_types: TraversalContextMap<OntologyId>,
    property_types: TraversalContextMap<OntologyId>,
    entity_types: TraversalContextMap<OntologyId>,
    entities: TraversalContextMap<EntityEditionId>,
}

impl TraversalContext {
    pub async fn read_traversed_vertices<C: AsClient>(
        &self,
        store: &PostgresStore<C>,
        subgraph: &mut Subgraph,
        include_drafts: bool,
    ) -> Result<(), QueryError> {
        if !self.data_types.0.is_empty() {
            store
                .read_data_types_by_ids(self.data_types.0.keys().copied(), subgraph)
                .await?;
        }
        if !self.property_types.0.is_empty() {
            store
                .read_property_types_by_ids(self.property_types.0.keys().copied(), subgraph)
                .await?;
        }
        if !self.entity_types.0.is_empty() {
            store
                .read_entity_types_by_ids(self.entity_types.0.keys().copied(), subgraph)
                .await?;
        }

        if !self.entities.0.is_empty() {
            store
                .read_entities_by_ids(self.entities.0.keys().copied(), subgraph, include_drafts)
                .await?;
        }

        Ok(())
    }

    pub fn add_data_type_id(
        &mut self,
        ontology_id: OntologyId,
        graph_resolve_depths: GraphResolveDepths,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> AddIdReturn<OntologyId> {
        self.data_types
            .add_id(ontology_id, graph_resolve_depths, traversal_interval)
    }

    pub fn add_property_type_id(
        &mut self,
        ontology_id: OntologyId,
        graph_resolve_depths: GraphResolveDepths,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> AddIdReturn<OntologyId> {
        self.property_types
            .add_id(ontology_id, graph_resolve_depths, traversal_interval)
    }

    pub fn add_entity_type_id(
        &mut self,
        ontology_id: OntologyId,
        graph_resolve_depths: GraphResolveDepths,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> AddIdReturn<OntologyId> {
        self.entity_types
            .add_id(ontology_id, graph_resolve_depths, traversal_interval)
    }

    pub fn add_entity_id(
        &mut self,
        edition_id: EntityEditionId,
        graph_resolve_depths: GraphResolveDepths,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> AddIdReturn<EntityEditionId> {
        self.entities
            .add_id(edition_id, graph_resolve_depths, traversal_interval)
    }
}
