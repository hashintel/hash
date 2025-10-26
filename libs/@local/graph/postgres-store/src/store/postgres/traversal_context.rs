use core::hash::Hash;
use std::collections::HashMap;

use error_stack::Report;
use hash_graph_store::{
    data_type::DataTypeQueryPath,
    entity::EntityQueryPath,
    entity_type::EntityTypeQueryPath,
    error::QueryError,
    filter::{Filter, FilterExpression, ParameterList},
    property_type::PropertyTypeQueryPath,
    query::Read,
    subgraph::{
        Subgraph, SubgraphRecord as _, edges::BorrowedTraversalParams, temporal_axes::VariableAxis,
    },
};
use hash_graph_temporal_versioning::RightBoundedTemporalInterval;
use type_system::{
    knowledge::entity::{Entity, id::EntityEditionId},
    ontology::{
        data_type::{DataTypeUuid, DataTypeWithMetadata},
        entity_type::{EntityTypeUuid, EntityTypeWithMetadata},
        property_type::{PropertyTypeUuid, PropertyTypeWithMetadata},
    },
};

use crate::store::postgres::{AsClient, PostgresStore};

impl<C> PostgresStore<C>
where
    C: AsClient,
{
    #[tracing::instrument(level = "info", skip(self, data_type_ids, subgraph))]
    async fn read_data_types_by_ids(
        &self,
        data_type_ids: &[DataTypeUuid],
        subgraph: &mut Subgraph,
    ) -> Result<(), Report<QueryError>> {
        for data_type in <Self as Read<DataTypeWithMetadata>>::read_vec(
            self,
            &[Filter::<DataTypeWithMetadata>::In(
                FilterExpression::Path {
                    path: DataTypeQueryPath::OntologyId,
                },
                ParameterList::DataTypeIds(data_type_ids),
            )],
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
        property_type_ids: &[PropertyTypeUuid],
        subgraph: &mut Subgraph,
    ) -> Result<(), Report<QueryError>> {
        for property_type in <Self as Read<PropertyTypeWithMetadata>>::read_vec(
            self,
            &[Filter::<PropertyTypeWithMetadata>::In(
                FilterExpression::Path {
                    path: PropertyTypeQueryPath::OntologyId,
                },
                ParameterList::PropertyTypeIds(property_type_ids),
            )],
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
        entity_type_ids: &[EntityTypeUuid],
        subgraph: &mut Subgraph,
    ) -> Result<(), Report<QueryError>> {
        for entity_type in <Self as Read<EntityTypeWithMetadata>>::read_vec(
            self,
            &[Filter::<EntityTypeWithMetadata>::In(
                FilterExpression::Path {
                    path: EntityTypeQueryPath::OntologyId,
                },
                ParameterList::EntityTypeIds(entity_type_ids),
            )],
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
    ) -> Result<(), Report<QueryError>> {
        let entities = <Self as Read<Entity>>::read_vec(
            self,
            &[Filter::<Entity>::In(
                FilterExpression::Path {
                    path: EntityQueryPath::EditionId,
                },
                ParameterList::EntityEditionIds(edition_ids),
            )],
            Some(&subgraph.temporal_axes.resolved),
            include_drafts,
        )
        .await?;

        tracing::info_span!("insert_into_subgraph", count = entities.len()).in_scope(|| {
            for entity in entities {
                subgraph.insert_vertex(
                    entity.vertex_id(subgraph.temporal_axes.resolved.variable_time_axis()),
                    entity,
                );
            }
        });

        Ok(())
    }
}

#[derive(Debug)]
struct TraversalContextMap<'edges, K>(
    HashMap<
        K,
        Vec<(
            BorrowedTraversalParams<'edges>,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
    >,
);

impl<K> Default for TraversalContextMap<'_, K> {
    fn default() -> Self {
        Self(HashMap::new())
    }
}

impl<'edges, K: Eq + Hash + Copy> TraversalContextMap<'edges, K> {
    /// Adds a new entry to the map if it does not already exist.
    ///
    /// Inserting the entry is skipped if there is already an existing entry with:
    ///  - the same key
    ///  - **and** traversal parameters that fully cover the new parameters (either a longer
    ///    traversal path or greater/equal resolve depths for all edge types),
    ///  - **and** a temporal interval that fully contains the new interval.
    ///
    /// Returns `Some` with the key, traversal parameters, and interval if the entry should be
    /// traversed further. Returns `None` if the traversal is already covered by an existing entry.
    fn add_id(
        &mut self,
        key: K,
        traversal_params: BorrowedTraversalParams<'edges>,
        interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> Option<(
        K,
        BorrowedTraversalParams<'edges>,
        RightBoundedTemporalInterval<VariableAxis>,
    )> {
        let values = self.0.entry(key).or_default();

        // TODO: Further optimization could happen here. It's possible to return none, a single, or
        //       multiple entries depending on the existing depths and traversed interval.
        //   see https://linear.app/hash/issue/H-3017
        if values
            .iter()
            .any(|&(existing_traversal_params, traversed_interval)| {
                existing_traversal_params.contains(&traversal_params)
                    && traversed_interval.contains_interval(&interval)
            })
        {
            None
        } else {
            values.push((traversal_params, interval));
            Some((key, traversal_params, interval))
        }
    }
}

#[derive(Debug, Default)]
pub struct TraversalContext<'edges> {
    data_types: TraversalContextMap<'edges, DataTypeUuid>,
    property_types: TraversalContextMap<'edges, PropertyTypeUuid>,
    entity_types: TraversalContextMap<'edges, EntityTypeUuid>,
    entities: TraversalContextMap<'edges, EntityEditionId>,
}

impl<'edges> TraversalContext<'edges> {
    /// Reads all vertices that have been marked for traversal and inserts them into the subgraph.
    ///
    /// # Errors
    ///
    /// Returns an error if any of the database read operations fail or if there are issues
    /// inserting vertices into the subgraph.
    #[tracing::instrument(level = "info", skip(self, store, subgraph))]
    pub async fn read_traversed_vertices<C: AsClient>(
        self,
        store: &PostgresStore<C>,
        subgraph: &mut Subgraph,
        include_drafts: bool,
    ) -> Result<(), Report<QueryError>> {
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
        data_type_id: DataTypeUuid,
        traversal_params: BorrowedTraversalParams<'edges>,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> Option<(
        DataTypeUuid,
        BorrowedTraversalParams<'edges>,
        RightBoundedTemporalInterval<VariableAxis>,
    )> {
        self.data_types
            .add_id(data_type_id, traversal_params, traversal_interval)
    }

    pub fn add_property_type_id(
        &mut self,
        property_type_id: PropertyTypeUuid,
        traversal_params: BorrowedTraversalParams<'edges>,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> Option<(
        PropertyTypeUuid,
        BorrowedTraversalParams<'edges>,
        RightBoundedTemporalInterval<VariableAxis>,
    )> {
        self.property_types
            .add_id(property_type_id, traversal_params, traversal_interval)
    }

    pub fn add_entity_type_id(
        &mut self,
        entity_type_id: EntityTypeUuid,
        traversal_params: BorrowedTraversalParams<'edges>,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> Option<(
        EntityTypeUuid,
        BorrowedTraversalParams<'edges>,
        RightBoundedTemporalInterval<VariableAxis>,
    )> {
        self.entity_types
            .add_id(entity_type_id, traversal_params, traversal_interval)
    }

    pub fn add_entity_id(
        &mut self,
        edition_id: EntityEditionId,
        traversal_params: BorrowedTraversalParams<'edges>,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) -> bool {
        self.entities
            .add_id(edition_id, traversal_params, traversal_interval)
            .is_some()
    }
}
