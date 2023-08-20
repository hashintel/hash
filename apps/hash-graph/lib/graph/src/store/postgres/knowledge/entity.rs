mod read;

use std::collections::HashMap;

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use graph_data::{
    knowledge::entity::{
        Entity, EntityEditionId, EntityId, EntityLinkOrder, EntityMetadata, EntityProperties,
        EntityRecordId, EntityTemporalMetadata, EntityUuid, LinkData,
    },
    provenance::{OwnedById, ProvenanceMetadata, RecordCreatedById},
};
use temporal_versioning::{DecisionTime, RightBoundedTemporalInterval, Timestamp};
use tokio_postgres::GenericClient;
use type_system::url::VersionedUrl;
use uuid::Uuid;

#[cfg(hash_graph_test_environment)]
use crate::store::error::DeletionError;
use crate::{
    store::{
        crud::Read,
        error::{EntityDoesNotExist, RaceConditionOnUpdate},
        postgres::{
            knowledge::entity::read::EntityEdgeTraversalData, query::ReferenceTable,
            TraversalContext,
        },
        AsClient, EntityStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, KnowledgeGraphEdgeKind, SharedEdgeKind},
        identifier::{EntityIdWithInterval, EntityVertexId},
        query::StructuralQuery,
        temporal_axes::VariableAxis,
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read an [`Entity`] into a [`TraversalContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "trace", skip(self, traversal_context, subgraph))]
    pub(crate) async fn traverse_entities(
        &self,
        mut entity_queue: Vec<(
            EntityVertexId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        traversal_context: &mut TraversalContext,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        let variable_axis = subgraph.temporal_axes.resolved.variable_time_axis();

        let mut entity_type_queue = Vec::new();

        while !entity_queue.is_empty() {
            let mut shared_edges_to_traverse = Option::<EntityEdgeTraversalData>::None;
            let mut knowledge_edges_to_traverse =
                HashMap::<(KnowledgeGraphEdgeKind, EdgeDirection), EntityEdgeTraversalData>::new();

            let entity_edges = [
                (
                    KnowledgeGraphEdgeKind::HasLeftEntity,
                    EdgeDirection::Incoming,
                    ReferenceTable::EntityHasLeftEntity,
                ),
                (
                    KnowledgeGraphEdgeKind::HasRightEntity,
                    EdgeDirection::Incoming,
                    ReferenceTable::EntityHasRightEntity,
                ),
                (
                    KnowledgeGraphEdgeKind::HasLeftEntity,
                    EdgeDirection::Outgoing,
                    ReferenceTable::EntityHasLeftEntity,
                ),
                (
                    KnowledgeGraphEdgeKind::HasRightEntity,
                    EdgeDirection::Outgoing,
                    ReferenceTable::EntityHasRightEntity,
                ),
            ];

            #[expect(clippy::iter_with_drain, reason = "false positive, vector is reused")]
            for (entity_vertex_id, graph_resolve_depths, traversal_interval) in
                entity_queue.drain(..)
            {
                if let Some(new_graph_resolve_depths) = graph_resolve_depths
                    .decrement_depth_for_edge(SharedEdgeKind::IsOfType, EdgeDirection::Outgoing)
                {
                    shared_edges_to_traverse
                        .get_or_insert_with(|| {
                            EntityEdgeTraversalData::new(
                                subgraph.temporal_axes.resolved.pinned_timestamp(),
                                variable_axis,
                            )
                        })
                        .push(
                            entity_vertex_id,
                            traversal_interval,
                            new_graph_resolve_depths,
                        );
                }

                for (edge_kind, edge_direction, _) in entity_edges {
                    if let Some(new_graph_resolve_depths) =
                        graph_resolve_depths.decrement_depth_for_edge(edge_kind, edge_direction)
                    {
                        knowledge_edges_to_traverse
                            .entry((edge_kind, edge_direction))
                            .or_insert_with(|| {
                                EntityEdgeTraversalData::new(
                                    subgraph.temporal_axes.resolved.pinned_timestamp(),
                                    variable_axis,
                                )
                            })
                            .push(
                                entity_vertex_id,
                                traversal_interval,
                                new_graph_resolve_depths,
                            );
                    }
                }
            }

            if let Some(traversal_data) = shared_edges_to_traverse.take() {
                entity_type_queue.extend(
                    self.read_shared_edges(&traversal_data, Some(0))
                        .await?
                        .flat_map(|edge| {
                            subgraph.insert_edge(
                                &edge.left_endpoint,
                                SharedEdgeKind::IsOfType,
                                EdgeDirection::Outgoing,
                                edge.right_endpoint.clone(),
                            );

                            traversal_context.add_entity_type_id(
                                edge.right_endpoint_ontology_id,
                                edge.resolve_depths,
                                edge.traversal_interval,
                            )
                        }),
                );
            }

            for (edge_kind, edge_direction, table) in entity_edges {
                if let Some(traversal_data) =
                    knowledge_edges_to_traverse.get(&(edge_kind, edge_direction))
                {
                    entity_queue.extend(
                        self.read_knowledge_edges(traversal_data, table, edge_direction)
                            .await?
                            .flat_map(|edge| {
                                subgraph.insert_edge(
                                    &edge.left_endpoint,
                                    edge_kind,
                                    edge_direction,
                                    EntityIdWithInterval {
                                        entity_id: edge.right_endpoint.base_id,
                                        interval: edge.edge_interval,
                                    },
                                );

                                traversal_context
                                    .add_entity_id(
                                        edge.right_endpoint_edition_id,
                                        edge.resolve_depths,
                                        edge.traversal_interval,
                                    )
                                    .map(move |(_, resolve_depths, interval)| {
                                        (edge.right_endpoint, resolve_depths, interval)
                                    })
                            }),
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

        let transaction = self.transaction().await.change_context(InsertionError)?;

        transaction
            .as_client()
            .query(
                r#"
                    INSERT INTO entity_ids (owned_by_id, entity_uuid)
                    VALUES ($1, $2);
                "#,
                &[&entity_id.owned_by_id, &entity_id.entity_uuid],
            )
            .await
            .into_report()
            .change_context(InsertionError)?;

        let link_order = if let Some(link_data) = link_data {
            transaction
                .as_client()
                .query(
                    r#"
                        INSERT INTO entity_has_left_entity (
                            owned_by_id,
                            entity_uuid,
                            left_owned_by_id,
                            left_entity_uuid
                        ) VALUES ($1, $2, $3, $4);
                    "#,
                    &[
                        &entity_id.owned_by_id,
                        &entity_id.entity_uuid,
                        &link_data.left_entity_id.owned_by_id,
                        &link_data.left_entity_id.entity_uuid,
                    ],
                )
                .await
                .into_report()
                .change_context(InsertionError)?;

            transaction
                .as_client()
                .query(
                    r#"
                        INSERT INTO entity_has_right_entity (
                            owned_by_id,
                            entity_uuid,
                            right_owned_by_id,
                            right_entity_uuid
                        ) VALUES ($1, $2, $3, $4);
                    "#,
                    &[
                        &entity_id.owned_by_id,
                        &entity_id.entity_uuid,
                        &link_data.right_entity_id.owned_by_id,
                        &link_data.right_entity_id.entity_uuid,
                    ],
                )
                .await
                .into_report()
                .change_context(InsertionError)?;

            link_data.order
        } else {
            EntityLinkOrder {
                left_to_right: None,
                right_to_left: None,
            }
        };

        let edition_id = transaction
            .insert_entity_edition(
                record_created_by_id,
                archived,
                &entity_type_id,
                properties,
                link_order,
            )
            .await?;

        let row = if let Some(decision_time) = decision_time {
            transaction
                .as_client()
                .query_one(
                    r#"
                    INSERT INTO entity_temporal_metadata (
                        owned_by_id,
                        entity_uuid,
                        entity_edition_id,
                        decision_time,
                        transaction_time
                    ) VALUES (
                        $1,
                        $2,
                        $3,
                        tstzrange($4, NULL, '[)'),
                        tstzrange(now(), NULL, '[)')
                    ) RETURNING decision_time, transaction_time;
                "#,
                    &[
                        &entity_id.owned_by_id,
                        &entity_id.entity_uuid,
                        &edition_id,
                        &decision_time,
                    ],
                )
                .await
                .into_report()
                .change_context(InsertionError)?
        } else {
            transaction
                .as_client()
                .query_one(
                    r#"
                    INSERT INTO entity_temporal_metadata (
                        owned_by_id,
                        entity_uuid,
                        entity_edition_id,
                        decision_time,
                        transaction_time
                    ) VALUES (
                        $1,
                        $2,
                        $3,
                        tstzrange(now(), NULL, '[)'),
                        tstzrange(now(), NULL, '[)')
                    ) RETURNING decision_time, transaction_time;
                "#,
                    &[&entity_id.owned_by_id, &entity_id.entity_uuid, &edition_id],
                )
                .await
                .into_report()
                .change_context(InsertionError)?
        };

        transaction.commit().await.change_context(InsertionError)?;

        Ok(EntityMetadata::new(
            EntityRecordId {
                entity_id,
                edition_id,
            },
            EntityTemporalMetadata {
                decision_time: row.get(0),
                transaction_time: row.get(1),
            },
            entity_type_id,
            ProvenanceMetadata {
                record_created_by_id,
                record_archived_by_id: None,
            },
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
                    ProvenanceMetadata {
                        record_created_by_id: actor_id,
                        record_archived_by_id: None,
                    },
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

        let mut traversal_context = TraversalContext::default();

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
                        subgraph.temporal_axes.resolved.variable_interval(),
                    )
                })
                .collect(),
            &mut traversal_context,
            &mut subgraph,
        )
        .await?;

        traversal_context
            .read_traversed_vertices(self, &mut subgraph)
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

        let edition_id = transaction
            .insert_entity_edition(
                record_created_by_id,
                archived,
                &entity_type_id,
                properties,
                link_order,
            )
            .await
            .change_context(UpdateError)?;

        // Calling `UPDATE` on `entity_temporal_metadata` will invoke a trigger that properly
        // updates the temporal versioning of the entity.
        let optional_row = if let Some(decision_time) = decision_time {
            transaction
                .as_client()
                .query_opt(
                    r#"
                        UPDATE entity_temporal_metadata
                        SET decision_time = tstzrange($4, upper(decision_time), '[)'),
                            transaction_time = tstzrange(now(), NULL, '[)'),
                            entity_edition_id = $3
                        WHERE owned_by_id = $1
                          AND entity_uuid = $2
                          AND decision_time @> $4::TIMESTAMPTZ
                          AND transaction_time @> now()
                        RETURNING decision_time, transaction_time;
                    "#,
                    &[
                        &entity_id.owned_by_id,
                        &entity_id.entity_uuid,
                        &edition_id,
                        &decision_time,
                    ],
                )
                .await
        } else {
            transaction
                .as_client()
                .query_opt(
                    r#"
                        UPDATE entity_temporal_metadata
                        SET decision_time = tstzrange(now(), upper(decision_time), '[)'),
                            transaction_time = tstzrange(now(), NULL, '[)'),
                            entity_edition_id = $3
                        WHERE owned_by_id = $1
                          AND entity_uuid = $2
                          AND decision_time @> now()
                          AND transaction_time @> now()
                        RETURNING decision_time, transaction_time;
                    "#,
                    &[&entity_id.owned_by_id, &entity_id.entity_uuid, &edition_id],
                )
                .await
        }
        .into_report()
        .change_context(UpdateError)?;
        let row = optional_row.ok_or_else(|| {
            Report::new(RaceConditionOnUpdate)
                .attach(entity_id)
                .change_context(UpdateError)
        })?;

        transaction.commit().await.change_context(UpdateError)?;

        Ok(EntityMetadata::new(
            EntityRecordId {
                entity_id,
                edition_id,
            },
            EntityTemporalMetadata {
                decision_time: row.get(0),
                transaction_time: row.get(1),
            },
            entity_type_id,
            ProvenanceMetadata {
                record_created_by_id,
                record_archived_by_id: None,
            },
            archived,
        ))
    }
}

impl PostgresStore<tokio_postgres::Transaction<'_>> {
    async fn insert_entity_edition(
        &self,
        record_created_by_id: RecordCreatedById,
        archived: bool,
        entity_type_id: &VersionedUrl,
        properties: EntityProperties,
        link_order: EntityLinkOrder,
    ) -> Result<EntityEditionId, InsertionError> {
        let edition_id: EntityEditionId = self
            .as_client()
            .query_one(
                r#"
                    INSERT INTO entity_editions (
                        entity_edition_id,
                        record_created_by_id,
                        archived,
                        properties,
                        left_to_right_order,
                        right_to_left_order
                    ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
                    RETURNING entity_edition_id;
                "#,
                &[
                    &record_created_by_id,
                    &archived,
                    &properties,
                    &link_order.left_to_right,
                    &link_order.right_to_left,
                ],
            )
            .await
            .into_report()
            .change_context(InsertionError)?
            .get(0);

        let entity_type_ontology_id = self
            .ontology_id_by_url(entity_type_id)
            .await
            .change_context(InsertionError)?;

        self.as_client()
            .query(
                r#"
                    INSERT INTO entity_is_of_type (
                        entity_edition_id,
                        entity_type_ontology_id
                    ) VALUES ($1, $2);
                "#,
                &[&edition_id, &entity_type_ontology_id],
            )
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(edition_id)
    }
}
