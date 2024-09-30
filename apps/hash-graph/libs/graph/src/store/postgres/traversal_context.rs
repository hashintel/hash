use core::hash::Hash;
use std::collections::HashMap;

use error_stack::Result;
use graph_types::{
    knowledge::entity::{Entity, EntityEditionId},
    ontology::{
        DataTypeId, DataTypeWithMetadata, EntityTypeId, EntityTypeWithMetadata, PropertyTypeId,
        PropertyTypeWithMetadata,
    },
};
use hash_graph_store::{
    data_type::DataTypeQueryPath,
    entity::EntityQueryPath,
    entity_type::EntityTypeQueryPath,
    filter::{Filter, FilterExpression, ParameterList},
    property_type::PropertyTypeQueryPath,
    subgraph::{Subgraph, SubgraphRecord, edges::GraphResolveDepths, temporal_axes::VariableAxis},
};
use temporal_versioning::RightBoundedTemporalInterval;

use crate::store::{AsClient, PostgresStore, QueryError, crud::Read};

impl<C, A> PostgresStore<C, A>
where
    C: AsClient,
    A: Send + Sync,
{
    #[tracing::instrument(level = "info", skip(self, data_type_ids, subgraph))]
    async fn read_data_types_by_ids(
        &self,
        data_type_ids: &[DataTypeId],
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        for data_type in <Self as Read<DataTypeWithMetadata>>::read_vec(
            self,
            &Filter::<DataTypeWithMetadata>::In(
                FilterExpression::Path {
                    path: DataTypeQueryPath::OntologyId,
                },
                ParameterList::DataTypeIds(data_type_ids),
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

    #[tracing::instrument(level = "info", skip(self, property_type_ids, subgraph))]
    async fn read_property_types_by_ids(
        &self,
        property_type_ids: &[PropertyTypeId],
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        for property_type in <Self as Read<PropertyTypeWithMetadata>>::read_vec(
            self,
            &Filter::<PropertyTypeWithMetadata>::In(
                FilterExpression::Path {
                    path: PropertyTypeQueryPath::OntologyId,
                },
                ParameterList::PropertyTypeIds(property_type_ids),
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

    #[tracing::instrument(level = "info", skip(self, entity_type_ids, subgraph))]
    async fn read_entity_types_by_ids(
        &self,
        entity_type_ids: &[EntityTypeId],
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        for entity_type in <Self as Read<EntityTypeWithMetadata>>::read_vec(
            self,
            &Filter::<EntityTypeWithMetadata>::In(
                FilterExpression::Path {
                    path: EntityTypeQueryPath::OntologyId,
                },
                ParameterList::EntityTypeIds(entity_type_ids),
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

    #[tracing::instrument(level = "info", skip(self, edition_ids, subgraph))]
    async fn read_entities_by_ids(
        &self,
        edition_ids: &[EntityEditionId],
        subgraph: &mut Subgraph,
        include_drafts: bool,
    ) -> Result<(), QueryError> {
        let entities = <Self as Read<Entity>>::read_vec(
            self,
            &Filter::<Entity>::In(
                FilterExpression::Path {
                    path: EntityQueryPath::EditionId,
                },
                ParameterList::EntityEditionIds(edition_ids),
            ),
            Some(&subgraph.temporal_axes.resolved),
            include_drafts,
        )
        .await?;

        let span = tracing::trace_span!("insert_into_subgraph", count = entities.len());
        let _enter = span.enter();

        for entity in entities {
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

pub type AddDataTypeIdReturn = impl Iterator<
    Item = (
        DataTypeId,
        GraphResolveDepths,
        RightBoundedTemporalInterval<VariableAxis>,
    ),
>;

pub type AddPropertyTypeIdReturn = impl Iterator<
    Item = (
        PropertyTypeId,
        GraphResolveDepths,
        RightBoundedTemporalInterval<VariableAxis>,
    ),
>;

pub type AddEntityTypeIdReturn = impl Iterator<
    Item = (
        EntityTypeId,
        GraphResolveDepths,
        RightBoundedTemporalInterval<VariableAxis>,
    ),
>;

pub type AddEntityIdReturn = impl Iterator<
    Item = (
        EntityEditionId,
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
        //   see https://linear.app/hash/issue/H-3017
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
    data_types: TraversalContextMap<DataTypeId>,
    property_types: TraversalContextMap<PropertyTypeId>,
    entity_types: TraversalContextMap<EntityTypeId>,
    entities: TraversalContextMap<EntityEditionId>,
}

impl TraversalContext {
    #[tracing::instrument(level = "info", skip(self, store, subgraph))]
    pub async fn read_traversed_vertices<C: AsClient, A: Send + Sync>(
        self,
        store: &PostgresStore<C, A>,
        subgraph: &mut Subgraph,
        include_drafts: bool,
    ) -> Result<(), QueryError> {
        if !self.data_types.0.is_empty() {
            store
                .read_data_types_by_ids(
                    &self.data_types.0.into_keys().collect::<Vec<_>>(),
                    subgraph,
                )
                .await?;
        }
        if !self.property_types.0.is_empty() {
            store
                .read_property_types_by_ids(
                    &self.property_types.0.into_keys().collect::<Vec<_>>(),
                    subgraph,
                )
                .await?;
        }
        if !self.entity_types.0.is_empty() {
            store
                .read_entity_types_by_ids(
                    &self.entity_types.0.into_keys().collect::<Vec<_>>(),
                    subgraph,
                )
                .await?;
        }

        if !self.entities.0.is_empty() {
            store
                .read_entities_by_ids(
                    &self.entities.0.into_keys().collect::<Vec<_>>(),
                    subgraph,
                    include_drafts,
                )
                .await?;
        }

        Ok(())
    }

    pub fn add_data_type_id(
        &mut self,
        data_type_id: DataTypeId,
        graph_resolve_depths: GraphResolveDepths,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> AddDataTypeIdReturn {
        self.data_types
            .add_id(data_type_id, graph_resolve_depths, traversal_interval)
    }

    pub fn add_property_type_id(
        &mut self,
        property_type_id: PropertyTypeId,
        graph_resolve_depths: GraphResolveDepths,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> AddPropertyTypeIdReturn {
        self.property_types
            .add_id(property_type_id, graph_resolve_depths, traversal_interval)
    }

    pub fn add_entity_type_id(
        &mut self,
        entity_type_id: EntityTypeId,
        graph_resolve_depths: GraphResolveDepths,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> AddEntityTypeIdReturn {
        self.entity_types
            .add_id(entity_type_id, graph_resolve_depths, traversal_interval)
    }

    pub fn add_entity_id(
        &mut self,
        edition_id: EntityEditionId,
        graph_resolve_depths: GraphResolveDepths,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> AddEntityIdReturn {
        self.entities
            .add_id(edition_id, graph_resolve_depths, traversal_interval)
    }
}
