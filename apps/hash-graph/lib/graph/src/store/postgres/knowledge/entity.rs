mod read;

use std::mem;

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use tokio_postgres::{error::SqlState, GenericClient};
use type_system::url::VersionedUrl;
use uuid::Uuid;

use crate::{
    identifier::{
        knowledge::{EntityEditionId, EntityId, EntityRecordId, EntityTemporalMetadata},
        time::{DecisionTime, LeftClosedTemporalInterval, Timestamp},
    },
    knowledge::{Entity, EntityLinkOrder, EntityMetadata, EntityProperties, EntityUuid, LinkData},
    ontology::EntityTypeWithMetadata,
    provenance::{OwnedById, ProvenanceMetadata, RecordCreatedById},
    store::{
        crud::Read,
        error::{DeletionError, EntityDoesNotExist, RaceConditionOnUpdate},
        postgres::TraversalContext,
        query::Filter,
        AsClient, EntityStore, InsertionError, PostgresStore, QueryError, Record, UpdateError,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, KnowledgeGraphEdgeKind, SharedEdgeKind},
        identifier::{EntityIdWithInterval, EntityVertexId},
        query::StructuralQuery,
        temporal_axes::{QueryTemporalAxes, VariableAxis},
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// # Errors
    ///
    /// Returns an error if querying the entities with the specified edge fails.
    #[expect(clippy::too_many_arguments)]
    pub async fn traverse_knowledge_graph_edge(
        &self,
        entity_vertex_id: EntityVertexId,
        entity_interval: LeftClosedTemporalInterval<VariableAxis>,
        edge_kind: KnowledgeGraphEdgeKind,
        edge_direction: EdgeDirection,
        graph_resolve_depths: GraphResolveDepths,
        temporal_axes: &QueryTemporalAxes,
        _traversal_context: &mut TraversalContext,
        subgraph: &mut Subgraph,
    ) -> Result<
        impl Iterator<Item = (EntityVertexId, GraphResolveDepths, QueryTemporalAxes)>,
        QueryError,
    > {
        let mut items = vec![];

        if let Some(new_graph_resolve_depths) =
            graph_resolve_depths.decrement_depth_for_edge(edge_kind, edge_direction)
        {
            let time_axis = subgraph.temporal_axes.resolved.variable_time_axis();

            for edge_entity in <Self as Read<Entity>>::read_vec(
                self,
                &Filter::for_knowledge_graph_edge_by_entity_id(
                    entity_vertex_id.base_id,
                    edge_kind,
                    edge_direction.reversed(),
                ),
                Some(temporal_axes),
            )
            .await?
            {
                let edge_interval = edge_entity
                    .metadata
                    .temporal_versioning()
                    .variable_time_interval(time_axis)
                    .intersect(entity_interval)
                    .unwrap_or_else(|| {
                        unreachable!("The edge interval and the entity interval do not overlap")
                    });

                subgraph.insert_edge(
                    &entity_vertex_id,
                    edge_kind,
                    edge_direction,
                    EntityIdWithInterval {
                        entity_id: edge_entity.metadata.record_id().entity_id,
                        interval: edge_interval,
                    },
                );

                let edge_entity_vertex_id = edge_entity.vertex_id(time_axis);
                subgraph.insert_vertex(&edge_entity_vertex_id, edge_entity);

                items.push((
                    edge_entity_vertex_id,
                    new_graph_resolve_depths,
                    temporal_axes.clone(),
                ));
            }
        }
        Ok(items.into_iter())
    }

    /// Internal method to read an [`Entity`] into a [`TraversalContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "trace", skip(self, traversal_context, subgraph))]
    pub(crate) async fn traverse_entities(
        &self,
        mut entity_queue: Vec<(EntityVertexId, GraphResolveDepths, QueryTemporalAxes)>,
        traversal_context: &mut TraversalContext,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let time_axis = subgraph.temporal_axes.resolved.variable_time_axis();

        let mut entity_type_queue = Vec::new();

        while !entity_queue.is_empty() {
            // TODO: We could re-use the memory here but we expect to batch the processing of this
            //       for-loop. See https://app.asana.com/0/0/1204117847656663/f
            for (entity_vertex_id, graph_resolve_depths, temporal_axes) in
                mem::take(&mut entity_queue)
            {
                let entity_interval = subgraph
                    .get_vertex::<Entity>(&entity_vertex_id)
                    .unwrap_or_else(|| {
                        // Entities are always inserted into the subgraph before they are resolved,
                        // so this should never happen. If it does, it is a bug.
                        unreachable!("entity should already be in the subgraph");
                    })
                    .metadata
                    .temporal_versioning()
                    .variable_time_interval(time_axis);

                // Intersects the version interval of the entity with the variable axis's time
                // interval. We only want to resolve the entity further for the overlap of these two
                // intervals.
                let temporal_axes = temporal_axes
                    .clone()
                    .intersect_variable_interval(entity_interval)
                    .unwrap_or_else(|| {
                        // `traverse_entity` is called with the returned entities from `read` with
                        // `temporal_axes`. This implies, that the version interval of `entity`
                        // overlaps with `temporal_axes`. `variable_interval` returns `None` if
                        // there are no overlapping points, so this should never happen.
                        unreachable!(
                            "the version interval of the entity does not overlap with the \
                             variable axis's time interval"
                        );
                    });

                if let Some(new_graph_resolve_depths) = graph_resolve_depths
                    .decrement_depth_for_edge(SharedEdgeKind::IsOfType, EdgeDirection::Outgoing)
                {
                    for entity_type in <Self as Read<EntityTypeWithMetadata>>::read_vec(
                        self,
                        &Filter::for_shared_edge_by_entity_id(
                            entity_vertex_id.base_id,
                            SharedEdgeKind::IsOfType,
                        ),
                        Some(&temporal_axes),
                    )
                    .await?
                    {
                        let entity_type_vertex_id = entity_type.vertex_id(time_axis);

                        subgraph.insert_edge(
                            &entity_vertex_id,
                            SharedEdgeKind::IsOfType,
                            EdgeDirection::Outgoing,
                            entity_type_vertex_id.clone(),
                        );

                        subgraph.insert_vertex(&entity_type_vertex_id, entity_type);

                        entity_type_queue.push((
                            entity_type_vertex_id,
                            new_graph_resolve_depths,
                            temporal_axes.clone(),
                        ));
                    }
                }

                for (edge_kind, edge_direction) in &[
                    (
                        KnowledgeGraphEdgeKind::HasLeftEntity,
                        EdgeDirection::Incoming,
                    ),
                    (
                        KnowledgeGraphEdgeKind::HasRightEntity,
                        EdgeDirection::Incoming,
                    ),
                    (
                        KnowledgeGraphEdgeKind::HasLeftEntity,
                        EdgeDirection::Outgoing,
                    ),
                    (
                        KnowledgeGraphEdgeKind::HasRightEntity,
                        EdgeDirection::Outgoing,
                    ),
                ] {
                    entity_queue.extend(
                        self.traverse_knowledge_graph_edge(
                            entity_vertex_id,
                            entity_interval,
                            *edge_kind,
                            *edge_direction,
                            graph_resolve_depths,
                            &temporal_axes,
                            traversal_context,
                            subgraph,
                        )
                        .await?,
                    );
                }
            }
        }

        self.traverse_entity_types(entity_type_queue, traversal_context, subgraph)
            .await?;

        Ok(())
    }

    #[tracing::instrument(level = "trace", skip(self))]
    #[cfg(hash_graph_test_environment)]
    pub async fn delete_entities(&mut self) -> Result<(), DeletionError> {
        self.as_client()
            .client()
            .simple_query(
                r"
                    DELETE FROM entity_has_left_entity;
                    DELETE FROM entity_has_right_entity;
                    DELETE FROM entity_is_of_type;
                    DELETE FROM entity_temporal_metadata;
                    DELETE FROM entity_editions;
                    DELETE FROM entity_ids;
                ",
            )
            .await
            .into_report()
            .change_context(DeletionError)?;

        Ok(())
    }
}

#[async_trait]
impl<C: AsClient> EntityStore for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self, properties))]
    async fn create_entity(
        &mut self,
        owned_by_id: OwnedById,
        entity_uuid: Option<EntityUuid>,
        decision_time: Option<Timestamp<DecisionTime>>,
        record_created_by_id: RecordCreatedById,
        archived: bool,
        entity_type_id: VersionedUrl,
        properties: EntityProperties,
        link_data: Option<LinkData>,
    ) -> Result<EntityMetadata, InsertionError> {
        let entity_id = EntityId {
            owned_by_id,
            entity_uuid: entity_uuid.unwrap_or_else(|| EntityUuid::new(Uuid::new_v4())),
        };

        let entity_type_ontology_id = self
            .ontology_id_by_url(&entity_type_id)
            .await
            .change_context(InsertionError)?;

        let row = self
            .as_client()
            .query_one(
                r#"
                SELECT
                    entity_edition_id,
                    decision_time,
                    transaction_time
                FROM
                    create_entity(
                        _owned_by_id := $1,
                        _entity_uuid := $2,
                        _decision_time := $3,
                        _record_created_by_id := $4,
                        _archived := $5,
                        _entity_type_ontology_id := $6,
                        _properties := $7,
                        _left_owned_by_id := $8,
                        _left_entity_uuid := $9,
                        _right_owned_by_id := $10,
                        _right_entity_uuid := $11,
                        _left_to_right_order := $12,
                        _right_to_left_order := $13
                    );
                "#,
                &[
                    &entity_id.owned_by_id,
                    &entity_id.entity_uuid,
                    &decision_time,
                    &record_created_by_id,
                    &archived,
                    &entity_type_ontology_id,
                    &properties,
                    &link_data
                        .as_ref()
                        .map(|metadata| metadata.left_entity_id.owned_by_id),
                    &link_data
                        .as_ref()
                        .map(|metadata| metadata.left_entity_id.entity_uuid),
                    &link_data
                        .as_ref()
                        .map(|metadata| metadata.right_entity_id.owned_by_id),
                    &link_data
                        .as_ref()
                        .map(|metadata| metadata.right_entity_id.entity_uuid),
                    &link_data
                        .as_ref()
                        .map(|link_data| link_data.order.left_to_right),
                    &link_data
                        .as_ref()
                        .map(|link_data| link_data.order.right_to_left),
                ],
            )
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(EntityMetadata::new(
            EntityRecordId {
                entity_id,
                edition_id: EntityEditionId::new(row.get(0)),
            },
            EntityTemporalMetadata {
                decision_time: row.get(1),
                transaction_time: row.get(2),
            },
            entity_type_id,
            ProvenanceMetadata::new(record_created_by_id),
            archived,
        ))
    }

    #[doc(hidden)]
    #[cfg(hash_graph_test_environment)]
    async fn insert_entities_batched_by_type(
        &mut self,
        entities: impl IntoIterator<
            Item = (
                OwnedById,
                Option<EntityUuid>,
                EntityProperties,
                Option<LinkData>,
                Option<Timestamp<DecisionTime>>,
            ),
            IntoIter: Send,
        > + Send,
        actor_id: RecordCreatedById,
        entity_type_id: &VersionedUrl,
    ) -> Result<Vec<EntityMetadata>, InsertionError> {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let entities = entities.into_iter();
        let mut entity_ids = Vec::with_capacity(entities.size_hint().0);
        let mut entity_editions = Vec::with_capacity(entities.size_hint().0);
        let mut entity_versions = Vec::with_capacity(entities.size_hint().0);
        for (owned_by_id, entity_uuid, properties, link_data, decision_time) in entities {
            entity_ids.push((
                EntityId {
                    owned_by_id,
                    entity_uuid: entity_uuid.unwrap_or_else(|| EntityUuid::new(Uuid::new_v4())),
                },
                link_data.as_ref().map(|link_data| link_data.left_entity_id),
                link_data
                    .as_ref()
                    .map(|link_data| link_data.right_entity_id),
            ));
            entity_editions.push((
                properties,
                link_data
                    .as_ref()
                    .and_then(|link_data| link_data.order.left_to_right),
                link_data
                    .as_ref()
                    .and_then(|link_data| link_data.order.right_to_left),
            ));
            entity_versions.push(decision_time);
        }

        // TODO: match on and return the relevant error
        //   https://app.asana.com/0/1200211978612931/1202574350052904/f
        transaction
            .insert_entity_ids(entity_ids.iter().copied().map(|(id, ..)| id))
            .await?;

        transaction
            .insert_entity_links(
                "left",
                entity_ids
                    .iter()
                    .copied()
                    .filter_map(|(id, left, _)| left.map(|left| (id, left))),
            )
            .await?;
        transaction
            .insert_entity_links(
                "right",
                entity_ids
                    .iter()
                    .copied()
                    .filter_map(|(id, _, right)| right.map(|right| (id, right))),
            )
            .await?;

        // Using one entity type per entity would result in more lookups, which results in a more
        // complex logic and/or be inefficient.
        // Please see the documentation for this function on the trait for more information.
        let entity_type_ontology_id = transaction
            .ontology_id_by_url(entity_type_id)
            .await
            .change_context(InsertionError)?;

        let entity_edition_ids = transaction
            .insert_entity_records(entity_editions, actor_id)
            .await?;

        let entity_versions = transaction
            .insert_entity_versions(
                entity_ids
                    .iter()
                    .copied()
                    .zip(entity_edition_ids.iter().copied())
                    .zip(entity_versions)
                    .map(|(((entity_id, ..), entity_edition_id), decision_time)| {
                        (entity_id, entity_edition_id, decision_time)
                    }),
            )
            .await?;

        transaction
            .insert_entity_is_of_type(entity_edition_ids.iter().copied(), entity_type_ontology_id)
            .await?;

        transaction.commit().await.change_context(InsertionError)?;

        Ok(entity_ids
            .into_iter()
            .zip(entity_versions)
            .zip(entity_edition_ids)
            .map(|(((entity_id, ..), entity_version), edition_id)| {
                EntityMetadata::new(
                    EntityRecordId {
                        entity_id,
                        edition_id,
                    },
                    entity_version,
                    entity_type_id.clone(),
                    ProvenanceMetadata::new(actor_id),
                    false,
                )
            })
            .collect())
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_entity(&self, query: &StructuralQuery<Entity>) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
            temporal_axes: ref unresolved_temporal_axes,
        } = *query;

        let temporal_axes = unresolved_temporal_axes.clone().resolve();
        let time_axis = temporal_axes.variable_time_axis();

        let entities = Read::<Entity>::read_vec(self, filter, Some(&temporal_axes))
            .await?
            .into_iter()
            .map(|entity| (entity.vertex_id(time_axis), entity))
            .collect();

        let mut subgraph = Subgraph::new(
            graph_resolve_depths,
            unresolved_temporal_axes.clone(),
            temporal_axes.clone(),
        );
        subgraph.vertices.entities = entities;

        for vertex_id in subgraph.vertices.entities.keys() {
            subgraph.roots.insert((*vertex_id).into());
        }

        // TODO: We currently pass in the subgraph as mutable reference, thus we cannot borrow the
        //       vertices and have to `.collect()` the keys.
        self.traverse_entities(
            subgraph
                .vertices
                .entities
                .keys()
                .map(|id| {
                    (
                        *id,
                        subgraph.depths,
                        subgraph.temporal_axes.resolved.clone(),
                    )
                })
                .collect(),
            &mut TraversalContext,
            &mut subgraph,
        )
        .await?;

        Ok(subgraph)
    }

    #[tracing::instrument(level = "info", skip(self, properties))]
    async fn update_entity(
        &mut self,
        entity_id: EntityId,
        decision_time: Option<Timestamp<DecisionTime>>,
        record_created_by_id: RecordCreatedById,
        archived: bool,
        entity_type_id: VersionedUrl,
        properties: EntityProperties,
        link_order: EntityLinkOrder,
    ) -> Result<EntityMetadata, UpdateError> {
        let entity_type_ontology_id = self
            .ontology_id_by_url(&entity_type_id)
            .await
            .change_context(UpdateError)?;

        // The transaction is required to check if the update happened. If there is no returned
        // row, it either means, that there was no entity with that parameters or a race condition
        // happened.
        let transaction = self.transaction().await.change_context(UpdateError)?;

        if transaction
            .as_client()
            .query_opt(
                r#"
                 SELECT EXISTS (
                    SELECT 1 FROM entity_ids WHERE owned_by_id = $1 AND entity_uuid = $2
                 );"#,
                &[&entity_id.owned_by_id, &entity_id.entity_uuid],
            )
            .await
            .into_report()
            .change_context(UpdateError)?
            .is_none()
        {
            return Err(Report::new(EntityDoesNotExist)
                .attach(entity_id)
                .change_context(UpdateError));
        }

        let row = transaction
            .as_client()
            .query_one(
                r#"
                SELECT
                    entity_edition_id,
                    decision_time,
                    transaction_time
                FROM
                    update_entity(
                        _owned_by_id := $1,
                        _entity_uuid := $2,
                        _decision_time := $3,
                        _record_created_by_id := $4,
                        _archived := $5,
                        _entity_type_ontology_id := $6,
                        _properties := $7,
                        _left_to_right_order := $8,
                        _right_to_left_order := $9
                    );
                "#,
                &[
                    &entity_id.owned_by_id,
                    &entity_id.entity_uuid,
                    &decision_time,
                    &record_created_by_id,
                    &archived,
                    &entity_type_ontology_id,
                    &properties,
                    &link_order.left_to_right,
                    &link_order.right_to_left,
                ],
            )
            .await
            .into_report()
            .map_err(|report| match report.current_context().code() {
                Some(&SqlState::RESTRICT_VIOLATION) => report
                    .change_context(RaceConditionOnUpdate)
                    .attach(entity_id)
                    .change_context(UpdateError),
                _ => report.change_context(UpdateError).attach(entity_id),
            })?;

        transaction.commit().await.change_context(UpdateError)?;

        Ok(EntityMetadata::new(
            EntityRecordId {
                entity_id,
                edition_id: EntityEditionId::new(row.get(0)),
            },
            EntityTemporalMetadata {
                decision_time: row.get(1),
                transaction_time: row.get(2),
            },
            entity_type_id,
            ProvenanceMetadata::new(record_created_by_id),
            archived,
        ))
    }
}
