use std::{collections::HashMap, hash::Hash};

use error_stack::Result;

use crate::{
    identifier::{knowledge::EntityEditionId, time::RightBoundedTemporalInterval},
    knowledge::{Entity, EntityQueryPath},
    ontology::{
        DataTypeQueryPath, DataTypeWithMetadata, EntityTypeQueryPath, EntityTypeWithMetadata,
        PropertyTypeQueryPath, PropertyTypeWithMetadata,
    },
    store::{
        crud::Read,
        query::{Filter, FilterExpression, ParameterList},
        AsClient, PostgresStore, QueryError, Record,
    },
    subgraph::{
        edges::GraphResolveDepths,
        identifier::{DataTypeVertexId, EntityTypeVertexId, PropertyTypeVertexId},
        temporal_axes::VariableAxis,
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    async fn read_data_types_by_ids(
        &self,
        vertex_ids: impl IntoIterator<Item = &DataTypeVertexId, IntoIter: Send> + Send,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let ids = vertex_ids
            .into_iter()
            .map(|id| format!("{}v/{}", id.base_id, id.revision_id.inner()))
            .collect::<Vec<_>>();

        for data_type in <Self as Read<DataTypeWithMetadata>>::read_vec(
            self,
            &Filter::<DataTypeWithMetadata>::In(
                FilterExpression::Path(DataTypeQueryPath::VersionedUrl),
                ParameterList::VersionedUrls(&ids),
            ),
            Some(&subgraph.temporal_axes.resolved),
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
        vertex_ids: impl IntoIterator<Item = &PropertyTypeVertexId, IntoIter: Send> + Send,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let ids = vertex_ids
            .into_iter()
            .map(|id| format!("{}v/{}", id.base_id, id.revision_id.inner()))
            .collect::<Vec<_>>();

        for property_type in <Self as Read<PropertyTypeWithMetadata>>::read_vec(
            self,
            &Filter::<PropertyTypeWithMetadata>::In(
                FilterExpression::Path(PropertyTypeQueryPath::VersionedUrl),
                ParameterList::VersionedUrls(&ids),
            ),
            Some(&subgraph.temporal_axes.resolved),
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
        vertex_ids: impl IntoIterator<Item = &EntityTypeVertexId, IntoIter: Send> + Send,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let ids = vertex_ids
            .into_iter()
            .map(|id| format!("{}v/{}", id.base_id, id.revision_id.inner()))
            .collect::<Vec<_>>();

        for entity_type in <Self as Read<EntityTypeWithMetadata>>::read_vec(
            self,
            &Filter::<EntityTypeWithMetadata>::In(
                FilterExpression::Path(EntityTypeQueryPath::VersionedUrl),
                ParameterList::VersionedUrls(&ids),
            ),
            Some(&subgraph.temporal_axes.resolved),
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
    ) -> Result<(), QueryError> {
        let ids = edition_ids
            .into_iter()
            .map(EntityEditionId::as_uuid)
            .collect::<Vec<_>>();

        for entity in <Self as Read<Entity>>::read_vec(
            self,
            &Filter::<Entity>::In(
                FilterExpression::Path(EntityQueryPath::EditionId),
                ParameterList::Uuid(&ids),
            ),
            Some(&subgraph.temporal_axes.resolved),
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

impl<K: Eq + Hash + Clone> TraversalContextMap<K> {
    /// Adds a new entry to the map if it does not already exist.
    ///
    /// Returns an iterator of entries which has to be resolved further. The entry is added
    /// if there is not already an existing entry with another `GraphResolveDepths` that contains
    /// the new `GraphResolveDepths` and the new interval is not contained in any existing
    /// interval.
    ///
    /// The provided key will only be cloned on demand.
    fn add_id(
        &mut self,
        key: &K,
        graph_resolve_depths: GraphResolveDepths,
        interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> impl Iterator<
        Item = (
            K,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        ),
    > {
        let (key, values) = self
            .0
            .raw_entry_mut()
            .from_key(key)
            .or_insert_with(|| (key.clone(), Vec::new()));

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
            Some((key.clone(), graph_resolve_depths, interval)).into_iter()
        }
    }
}

#[derive(Debug, Default)]
pub struct TraversalContext {
    data_types: TraversalContextMap<DataTypeVertexId>,
    property_types: TraversalContextMap<PropertyTypeVertexId>,
    entity_types: TraversalContextMap<EntityTypeVertexId>,
    entities: TraversalContextMap<EntityEditionId>,
}

impl TraversalContext {
    pub async fn read_traversed_vertices<C: AsClient>(
        &self,
        store: &PostgresStore<C>,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        if !self.data_types.0.is_empty() {
            store
                .read_data_types_by_ids(self.data_types.0.keys(), subgraph)
                .await?;
        }
        if !self.property_types.0.is_empty() {
            store
                .read_property_types_by_ids(self.property_types.0.keys(), subgraph)
                .await?;
        }
        if !self.entity_types.0.is_empty() {
            store
                .read_entity_types_by_ids(self.entity_types.0.keys(), subgraph)
                .await?;
        }

        if !self.entities.0.is_empty() {
            store
                .read_entities_by_ids(self.entities.0.keys().copied(), subgraph)
                .await?;
        }

        Ok(())
    }

    pub fn add_data_type_id(
        &mut self,
        vertex_id: &DataTypeVertexId,
        graph_resolve_depths: GraphResolveDepths,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> impl Iterator<
        Item = (
            DataTypeVertexId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        ),
    > {
        self.data_types
            .add_id(vertex_id, graph_resolve_depths, traversal_interval)
    }

    pub fn add_property_type_id(
        &mut self,
        vertex_id: &PropertyTypeVertexId,
        graph_resolve_depths: GraphResolveDepths,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> impl Iterator<
        Item = (
            PropertyTypeVertexId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        ),
    > {
        self.property_types
            .add_id(vertex_id, graph_resolve_depths, traversal_interval)
    }

    pub fn add_entity_type_id(
        &mut self,
        vertex_id: &EntityTypeVertexId,
        graph_resolve_depths: GraphResolveDepths,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> impl Iterator<
        Item = (
            EntityTypeVertexId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        ),
    > {
        self.entity_types
            .add_id(vertex_id, graph_resolve_depths, traversal_interval)
    }

    pub fn add_entity_id(
        &mut self,
        edition_id: EntityEditionId,
        graph_resolve_depths: GraphResolveDepths,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> impl Iterator<
        Item = (
            EntityEditionId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        ),
    > {
        self.entities
            .add_id(&edition_id, graph_resolve_depths, traversal_interval)
    }
}
