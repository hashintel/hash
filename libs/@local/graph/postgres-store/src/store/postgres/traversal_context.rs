use core::hash::Hash;
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use futures::TryStreamExt as _;
use hash_graph_authorization::policies::PolicyComponents;
use hash_graph_store::{
    data_type::DataTypeQueryPath,
    entity::EntityQueryPath,
    entity_type::EntityTypeQueryPath,
    error::QueryError,
    filter::{Filter, FilterExpression, FilterExpressionList, ParameterList},
    property_type::PropertyTypeQueryPath,
    query::Read,
    subgraph::{
        Subgraph, SubgraphRecord as _, edges::BorrowedTraversalParams, identifier::EntityVertexId,
        temporal_axes::VariableAxis,
    },
};
use hash_graph_temporal_versioning::RightBoundedTemporalInterval;
use tokio_postgres::GenericClient as _;
use tracing::Instrument as _;
use type_system::{
    knowledge::entity::{Entity, id::EntityEditionId},
    ontology::{
        data_type::{DataTypeUuid, DataTypeWithMetadata},
        entity_type::{EntityTypeUuid, EntityTypeWithMetadata},
        property_type::{PropertyTypeUuid, PropertyTypeWithMetadata},
    },
};

use crate::store::postgres::{
    AsClient, PostgresStore,
    crud::QueryRecordDecode as _,
    query::{PostgresRecord as _, SelectCompiler},
};

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
                FilterExpressionList::ParameterList {
                    parameters: ParameterList::DataTypeIds(data_type_ids),
                },
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
                FilterExpressionList::ParameterList {
                    parameters: ParameterList::PropertyTypeIds(property_type_ids),
                },
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
                FilterExpressionList::ParameterList {
                    parameters: ParameterList::EntityTypeIds(entity_type_ids),
                },
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
        policy_components: &PolicyComponents,
    ) -> Result<(), Report<QueryError>> {
        let temporal_axes = Some(&subgraph.temporal_axes.resolved);
        let filter = Filter::<Entity>::In(
            FilterExpression::Path {
                path: EntityQueryPath::EditionId,
            },
            FilterExpressionList::ParameterList {
                parameters: ParameterList::EntityEditionIds(edition_ids),
            },
        );

        let mut compiler = SelectCompiler::new(temporal_axes, include_drafts);

        let should_apply_protection =
            !self.settings.filter_protection.is_empty() && !policy_components.is_instance_admin();

        let property_protection_filter;
        if should_apply_protection {
            // We cannot re-use the previously generated filter as the lifetimes of `Filter` are
            // invariant.
            //   see: https://linear.app/hash/issue/BE-363/refactor-filter-to-be-covariant-over-lifetime-parameters
            property_protection_filter = self
                .settings
                .filter_protection
                .to_property_protection_filter(policy_components.actor_id());
            compiler.with_property_masking(&property_protection_filter);
        }

        let record_artifacts = Entity::parameters();
        let record_indices = Entity::compile(&mut compiler, &record_artifacts);

        compiler.add_filter(&filter).change_context(QueryError)?;

        let (statement, parameters) = compiler.compile();

        let entities: Vec<Entity> = self
            .as_client()
            .query_raw(&statement, parameters.iter().copied())
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = %statement,
            ))
            .await
            .change_context(QueryError)?
            .map_ok(|row| Entity::decode(&row, &record_indices))
            .try_collect()
            .await
            .change_context(QueryError)?;

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
    entities: HashMap<
        EntityEditionId,
        (
            EntityVertexId,
            Vec<RightBoundedTemporalInterval<VariableAxis>>,
        ),
    >,
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
        policy_components: &PolicyComponents,
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

        if !self.entities.is_empty() {
            let edition_ids = self.entities.into_keys().collect::<Vec<_>>();
            store
                .read_entities_by_ids(&edition_ids, subgraph, include_drafts, policy_components)
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

    /// Adds an entity to the traversal context with union semantics for temporal intervals.
    ///
    /// If the entity is already tracked, the provided interval is merged with existing intervals:
    /// - Overlapping or adjacent intervals are merged into a single interval
    /// - Disjoint intervals are kept separate
    ///
    /// This ensures the minimal set of disjoint intervals that represents the union of all
    /// temporal coverage for this entity across different traversal paths.
    pub fn add_entity_id(
        &mut self,
        edition_id: EntityEditionId,
        vertex_id: EntityVertexId,
        traversal_interval: RightBoundedTemporalInterval<VariableAxis>,
    ) {
        let (_, intervals) = self
            .entities
            .entry(edition_id)
            .or_insert_with(|| (vertex_id, Vec::new()));

        // Union semantics: merge overlapping/adjacent intervals, keep disjoint ones separate
        let mut merged = traversal_interval;

        intervals.retain(|existing_interval| {
            // union() returns an iterator: 1 element if merged, 2 if disjoint
            let mut union_iter = existing_interval.union(merged);
            if union_iter.len() == 1
                && let Some(union) = union_iter.next()
            {
                // Intervals overlap or are adjacent - they were merged
                merged = union;
                false // Remove the old interval, we'll add the merged one
            } else {
                // Intervals are disjoint - keep the existing one
                true
            }
        });

        // Add the (possibly merged) interval
        intervals.push(merged);
    }

    /// Returns an iterator over all tracked entities with their temporal intervals.
    ///
    /// Each entity may have multiple disjoint temporal intervals if it was reached through
    /// different traversal paths with non-overlapping temporal constraints.
    ///
    /// # Returns
    ///
    /// An iterator yielding `(EntityVertexId, RightBoundedTemporalInterval<VariableAxis>)` tuples.
    /// The same `EntityVertexId` may appear multiple times if the entity has disjoint temporal
    /// coverage.
    pub fn entity_intervals(
        &self,
    ) -> impl Iterator<Item = (EntityVertexId, RightBoundedTemporalInterval<VariableAxis>)> + '_
    {
        self.entities.values().flat_map(|(vertex_id, intervals)| {
            intervals
                .iter()
                .map(move |interval| (*vertex_id, *interval))
        })
    }
}

#[cfg(test)]
mod tests {
    use hash_graph_store::subgraph::{identifier::EntityVertexId, temporal_axes::VariableAxis};
    use hash_graph_temporal_versioning::{
        LimitedTemporalBound, RightBoundedTemporalInterval, TemporalBound, Timestamp,
    };
    use type_system::{
        knowledge::entity::{EntityId, id::EntityUuid},
        principal::actor_group::WebId,
    };
    use uuid::Uuid;

    use super::*;

    fn make_interval(start: i64, end: i64) -> RightBoundedTemporalInterval<VariableAxis> {
        RightBoundedTemporalInterval::new(
            TemporalBound::Inclusive(Timestamp::from_unix_timestamp(start)),
            LimitedTemporalBound::Exclusive(Timestamp::from_unix_timestamp(end)),
        )
    }

    fn make_entity_id() -> EntityEditionId {
        EntityEditionId::new(Uuid::new_v4())
    }

    fn make_vertex_id() -> EntityVertexId {
        EntityVertexId {
            base_id: EntityId {
                web_id: WebId::new(Uuid::new_v4()),
                entity_uuid: EntityUuid::new(Uuid::new_v4()),
                draft_id: None,
            },
            revision_id: Timestamp::now(),
        }
    }

    #[test]
    fn add_entity_single_interval() {
        let mut ctx = TraversalContext::default();
        let entity_id = make_entity_id();
        let vertex_id = make_vertex_id();

        ctx.add_entity_id(entity_id, vertex_id, make_interval(10, 20));

        let intervals: Vec<_> = ctx.entity_intervals().collect();
        assert_eq!(intervals.len(), 1);
        assert_eq!(intervals[0].0, vertex_id);
        assert_eq!(intervals[0].1, make_interval(10, 20));
    }

    #[test]
    fn add_entity_overlapping_intervals_merge() {
        let mut ctx = TraversalContext::default();
        let entity_id = make_entity_id();
        let vertex_id = make_vertex_id();

        // Add [10..20]
        ctx.add_entity_id(entity_id, vertex_id, make_interval(10, 20));

        // Add [15..25] - overlaps with [10..20]
        ctx.add_entity_id(entity_id, vertex_id, make_interval(15, 25));

        let intervals: Vec<_> = ctx.entity_intervals().collect();
        assert_eq!(intervals.len(), 1, "Overlapping intervals should merge");
        assert_eq!(intervals[0].1, make_interval(10, 25));
    }

    #[test]
    fn add_entity_disjoint_intervals_separate() {
        let mut ctx = TraversalContext::default();
        let entity_id = make_entity_id();
        let vertex_id = make_vertex_id();

        // Add [10..20]
        ctx.add_entity_id(entity_id, vertex_id, make_interval(10, 20));

        // Add [30..40] - disjoint from [10..20]
        ctx.add_entity_id(entity_id, vertex_id, make_interval(30, 40));

        let mut intervals: Vec<_> = ctx.entity_intervals().collect();
        intervals.sort_by_key(|(_, interval)| match interval.start() {
            TemporalBound::Inclusive(ts) | TemporalBound::Exclusive(ts) => Some(*ts),
            TemporalBound::Unbounded => None,
        });

        assert_eq!(
            intervals.len(),
            2,
            "Disjoint intervals should remain separate"
        );
        assert_eq!(intervals[0].1, make_interval(10, 20));
        assert_eq!(intervals[1].1, make_interval(30, 40));
    }

    #[test]
    fn add_entity_bridge_interval_merges_both() {
        let mut ctx = TraversalContext::default();
        let entity_id = make_entity_id();
        let vertex_id = make_vertex_id();

        // Add [10..20] and [30..40]
        ctx.add_entity_id(entity_id, vertex_id, make_interval(10, 20));
        ctx.add_entity_id(entity_id, vertex_id, make_interval(30, 40));

        // Add [15..35] - bridges both intervals
        ctx.add_entity_id(entity_id, vertex_id, make_interval(15, 35));

        let intervals: Vec<_> = ctx.entity_intervals().collect();
        assert_eq!(
            intervals.len(),
            1,
            "Bridging interval should merge both existing intervals"
        );
        assert_eq!(intervals[0].1, make_interval(10, 40));
    }

    #[test]
    fn add_entity_adjacent_intervals_merge() {
        let mut ctx = TraversalContext::default();
        let entity_id = make_entity_id();
        let vertex_id = make_vertex_id();

        // Add [10..20]
        ctx.add_entity_id(entity_id, vertex_id, make_interval(10, 20));

        // Add [20..30] - adjacent (end of first == start of second)
        ctx.add_entity_id(entity_id, vertex_id, make_interval(20, 30));

        let intervals: Vec<_> = ctx.entity_intervals().collect();
        assert_eq!(intervals.len(), 1, "Adjacent intervals should merge");
        assert_eq!(intervals[0].1, make_interval(10, 30));
    }

    #[test]
    fn add_entity_subsumed_interval_ignored() {
        let mut ctx = TraversalContext::default();
        let entity_id = make_entity_id();
        let vertex_id = make_vertex_id();

        // Add [10..30]
        ctx.add_entity_id(entity_id, vertex_id, make_interval(10, 30));

        // Add [15..25] - completely contained in [10..30]
        ctx.add_entity_id(entity_id, vertex_id, make_interval(15, 25));

        let intervals: Vec<_> = ctx.entity_intervals().collect();
        assert_eq!(
            intervals.len(),
            1,
            "Subsumed interval should be absorbed by larger interval"
        );
        assert_eq!(intervals[0].1, make_interval(10, 30));
    }

    #[test]
    fn add_entity_larger_interval_replaces_smaller() {
        let mut ctx = TraversalContext::default();
        let entity_id = make_entity_id();
        let vertex_id = make_vertex_id();

        // Add [15..25]
        ctx.add_entity_id(entity_id, vertex_id, make_interval(15, 25));

        // Add [10..30] - subsumes [15..25]
        ctx.add_entity_id(entity_id, vertex_id, make_interval(10, 30));

        let intervals: Vec<_> = ctx.entity_intervals().collect();
        assert_eq!(
            intervals.len(),
            1,
            "Larger interval should replace smaller interval"
        );
        assert_eq!(intervals[0].1, make_interval(10, 30));
    }

    #[test]
    fn add_entity_multiple_disjoint_then_merge() {
        let mut ctx = TraversalContext::default();
        let entity_id = make_entity_id();
        let vertex_id = make_vertex_id();

        // Add [10..20], [30..40], [50..60] - all disjoint
        ctx.add_entity_id(entity_id, vertex_id, make_interval(10, 20));
        ctx.add_entity_id(entity_id, vertex_id, make_interval(30, 40));
        ctx.add_entity_id(entity_id, vertex_id, make_interval(50, 60));

        // Add [15..55] - bridges first two, overlaps with third
        ctx.add_entity_id(entity_id, vertex_id, make_interval(15, 55));

        let intervals: Vec<_> = ctx.entity_intervals().collect();
        assert_eq!(
            intervals.len(),
            1,
            "Should merge all overlapping intervals into one"
        );
        assert_eq!(intervals[0].1, make_interval(10, 60));
    }
}
