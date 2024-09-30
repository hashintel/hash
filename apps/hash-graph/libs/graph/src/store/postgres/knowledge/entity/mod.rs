mod query;
mod read;
use alloc::borrow::Cow;
use core::{borrow::Borrow, iter::once, mem};
use std::collections::{HashMap, HashSet};

use authorization::{
    AuthorizationApi,
    backend::ModifyRelationshipOperation,
    schema::{
        EntityOwnerSubject, EntityPermission, EntityRelationAndSubject, EntityTypePermission,
        WebPermission,
    },
    zanzibar::{Consistency, Zookie},
};
use error_stack::{Report, ReportSink, Result, ResultExt, bail};
use futures::TryStreamExt;
use graph_types::{
    Embedding,
    account::{AccountId, CreatedById, EditionArchivedById, EditionCreatedById},
    knowledge::{
        Confidence,
        entity::{
            DraftId, Entity, EntityEditionId, EntityEditionProvenance, EntityEmbedding, EntityId,
            EntityMetadata, EntityProvenance, EntityRecordId, EntityTemporalMetadata, EntityUuid,
            InferredEntityProvenance,
        },
        property::{
            Property, PropertyMetadata, PropertyMetadataObject, PropertyObject, PropertyPath,
            PropertyPathError, PropertyWithMetadata, PropertyWithMetadataObject,
            PropertyWithMetadataValue, visitor::EntityVisitor,
        },
    },
    ontology::{DataTypeProvider, EntityTypeId, EntityTypeProvider},
    owned_by_id::OwnedById,
};
use hash_graph_store::{
    entity::EntityQueryPath,
    filter::{Filter, FilterExpression, Parameter},
    subgraph::{
        Subgraph, SubgraphRecord,
        edges::{EdgeDirection, GraphResolveDepths, KnowledgeGraphEdgeKind, SharedEdgeKind},
        identifier::{EntityIdWithInterval, EntityVertexId},
        temporal_axes::{
            PinnedTemporalAxis, PinnedTemporalAxisUnresolved, QueryTemporalAxes,
            QueryTemporalAxesUnresolved, VariableAxis, VariableTemporalAxis,
            VariableTemporalAxisUnresolved,
        },
    },
};
use hash_status::StatusCode;
use postgres_types::ToSql;
use serde_json::Value as JsonValue;
use temporal_versioning::{
    ClosedTemporalBound, DecisionTime, LeftClosedTemporalInterval, LimitedTemporalBound,
    OpenTemporalBound, RightBoundedTemporalInterval, TemporalBound, TemporalTagged, Timestamp,
    TransactionTime,
};
use tokio_postgres::{GenericClient, Row, error::SqlState};
use type_system::url::VersionedUrl;
use uuid::Uuid;
use validation::{EntityPreprocessor, Validate, ValidateEntityComponents};

use crate::store::{
    AsClient, EntityStore, InsertionError, PostgresStore, QueryError, StoreCache, UpdateError,
    crud::{QueryResult, Read, ReadPaginated, Sorting},
    error::{DeletionError, EntityDoesNotExist, RaceConditionOnUpdate},
    knowledge::{
        CountEntitiesParams, CreateEntityParams, EntityQuerySorting, EntityValidationType,
        GetEntitiesParams, GetEntitiesResponse, GetEntitySubgraphParams, GetEntitySubgraphResponse,
        PatchEntityParams, QueryConversion, UpdateEntityEmbeddingsParams, ValidateEntityError,
        ValidateEntityParams,
    },
    postgres::{
        ResponseCountMap, TraversalContext,
        knowledge::entity::read::EntityEdgeTraversalData,
        ontology::OntologyId,
        query::{
            InsertStatementBuilder, ReferenceTable, Table,
            rows::{
                EntityDraftRow, EntityEditionRow, EntityHasLeftEntityRow, EntityHasRightEntityRow,
                EntityIdRow, EntityIsOfTypeRow, EntityTemporalMetadataRow,
            },
        },
    },
    validation::StoreProvider,
};

#[derive(Debug)]
#[expect(clippy::struct_excessive_bools, reason = "Parameter struct")]
struct GetEntitiesImplParams<'a> {
    filter: Filter<'a, Entity>,
    sorting: EntityQuerySorting<'static>,
    limit: Option<usize>,
    include_drafts: bool,
    include_count: bool,
    include_web_ids: bool,
    include_created_by_ids: bool,
    include_edition_created_by_ids: bool,
    include_type_ids: bool,
}

impl<C, A> PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    /// Internal method to read an [`Entity`] into a [`TraversalContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "info", skip(self, traversal_context, subgraph, zookie))]
    pub(crate) async fn traverse_entities(
        &self,
        mut entity_queue: Vec<(
            EntityVertexId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        traversal_context: &mut TraversalContext,
        actor_id: AccountId,
        zookie: &Zookie<'static>,
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
                let span = tracing::trace_span!("collect_edges", ?entity_vertex_id);
                let _s = span.enter();

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
                let span = tracing::trace_span!("post_filter_entity_types");
                let _s = span.enter();

                entity_type_queue.extend(
                    Self::filter_entity_types_by_permission(
                        self.read_shared_edges(&traversal_data, Some(0)).await?,
                        actor_id,
                        &self.authorization_api,
                        zookie,
                    )
                    .await?
                    .flat_map(|edge| {
                        subgraph.insert_edge(
                            &edge.left_endpoint,
                            SharedEdgeKind::IsOfType,
                            EdgeDirection::Outgoing,
                            edge.right_endpoint.clone(),
                        );

                        traversal_context.add_entity_type_id(
                            EntityTypeId::from(edge.right_endpoint_ontology_id),
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
                    let (entity_ids, knowledge_edges): (Vec<_>, Vec<_>) = self
                        .read_knowledge_edges(traversal_data, table, edge_direction)
                        .await?
                        .unzip();

                    if knowledge_edges.is_empty() {
                        continue;
                    }

                    let permissions = self
                        .authorization_api
                        .check_entities_permission(
                            actor_id,
                            EntityPermission::View,
                            // TODO: Filter for entities, which were not already added to the
                            //       subgraph to avoid unnecessary lookups.
                            entity_ids.iter().copied(),
                            Consistency::AtExactSnapshot(zookie),
                        )
                        .await
                        .change_context(QueryError)?
                        .0;

                    entity_queue.extend(
                        knowledge_edges
                            .into_iter()
                            .zip(entity_ids)
                            .filter_map(|(edge, entity_id)| {
                                // We can unwrap here because we checked permissions for all
                                // entities in question.
                                permissions
                                    .get(&entity_id.entity_uuid)
                                    .copied()
                                    .unwrap_or(true)
                                    .then_some(edge)
                            })
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

        self.traverse_entity_types(
            entity_type_queue,
            traversal_context,
            actor_id,
            zookie,
            subgraph,
        )
        .await?;

        Ok(())
    }

    #[tracing::instrument(level = "info", skip(self))]
    pub async fn delete_entities(&mut self) -> Result<(), DeletionError> {
        tracing::debug!("Deleting all entities");
        self.as_client()
            .client()
            .simple_query(
                "
                    DELETE FROM entity_has_left_entity;
                    DELETE FROM entity_has_right_entity;
                    DELETE FROM entity_is_of_type;
                    DELETE FROM entity_temporal_metadata;
                    DELETE FROM entity_editions;
                    DELETE FROM entity_embeddings;
                    DELETE FROM entity_drafts;
                    DELETE FROM entity_ids;
                ",
            )
            .await
            .change_context(DeletionError)?;

        Ok(())
    }

    async fn convert_entity_properties<P: DataTypeProvider + Sync>(
        &self,
        provider: &P,
        entity: &mut PropertyWithMetadata,
        path: &PropertyPath<'_>,
        target_data_type_id: &VersionedUrl,
    ) {
        let Ok(PropertyWithMetadata::Value(PropertyWithMetadataValue { value, metadata })) =
            entity.get_mut(path.as_ref())
        else {
            // If the property does not exist or is not a value, we can ignore it.
            return;
        };

        let Some(source_data_type_id) = &mut metadata.data_type_id else {
            // If the property does not have a data type, we can ignore it.
            return;
        };

        let Ok(conversions) = provider
            .find_conversion(source_data_type_id, target_data_type_id)
            .await
        else {
            // If no conversion is found, we can ignore the property.
            return;
        };

        let Some(mut value_number) = value.as_f64() else {
            // If the value is not a number, we can ignore the property.
            return;
        };

        for conversion in conversions.borrow() {
            value_number = conversion.evaluate(value_number);
        }
        drop(conversions);

        *value = JsonValue::from(value_number);

        metadata.data_type_id = Some(target_data_type_id.clone());
    }

    async fn convert_entity<P: DataTypeProvider + Sync>(
        &self,
        provider: &P,
        entity: &mut Entity,
        conversions: &[QueryConversion<'_>],
    ) -> Result<(), PropertyPathError> {
        let mut property = PropertyWithMetadata::Object(PropertyWithMetadataObject::from_parts(
            mem::take(&mut entity.properties),
            Some(mem::take(&mut entity.metadata.properties)),
        )?);
        for conversion in conversions {
            self.convert_entity_properties(
                provider,
                &mut property,
                &conversion.path,
                &conversion.data_type_id,
            )
            .await;
        }
        let PropertyWithMetadata::Object(property) = property else {
            unreachable!("The property was just converted to an object");
        };
        let (properties, metadata) = property.into_parts();
        entity.properties = properties;
        entity.metadata.properties = metadata;
        Ok(())
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn get_entities_impl(
        &self,
        actor_id: AccountId,
        mut params: GetEntitiesImplParams<'_>,
        temporal_axes: &QueryTemporalAxes,
    ) -> Result<(GetEntitiesResponse<'static>, Zookie<'static>), QueryError> {
        let mut root_entities = Vec::new();

        let (permissions, count, web_ids, created_by_ids, edition_created_by_ids, type_ids) =
            if params.include_count
                || params.include_web_ids
                || params.include_created_by_ids
                || params.include_edition_created_by_ids
                || params.include_type_ids
            {
                let mut web_ids = params.include_web_ids.then(ResponseCountMap::default);
                let mut created_by_ids = params
                    .include_created_by_ids
                    .then(ResponseCountMap::default);
                let mut edition_created_by_ids = params
                    .include_edition_created_by_ids
                    .then(ResponseCountMap::default);
                let mut include_type_ids = params.include_type_ids.then(ResponseCountMap::default);

                let entity_ids = Read::<Entity>::read(
                    self,
                    &params.filter,
                    Some(temporal_axes),
                    params.include_drafts,
                )
                .await?
                .map_ok(|entity| {
                    if let Some(web_ids) = &mut web_ids {
                        web_ids.increment(&entity.metadata.record_id.entity_id.owned_by_id);
                    }
                    if let Some(created_by_ids) = &mut created_by_ids {
                        created_by_ids
                            .increment(&entity.metadata.provenance.inferred.created_by_id);
                    }
                    if let Some(edition_created_by_ids) = &mut edition_created_by_ids {
                        edition_created_by_ids
                            .increment(&entity.metadata.provenance.edition.created_by_id);
                    }
                    if let Some(include_type_ids) = &mut include_type_ids {
                        for entity_type_id in &entity.metadata.entity_type_ids {
                            include_type_ids.increment(entity_type_id);
                        }
                    }
                    entity.metadata.record_id.entity_id
                })
                .try_collect::<Vec<_>>()
                .await?;

                let span = tracing::trace_span!("post_filter_entities");
                let _s = span.enter();

                let (permissions, zookie) = self
                    .authorization_api
                    .check_entities_permission(
                        actor_id,
                        EntityPermission::View,
                        entity_ids.iter().copied(),
                        Consistency::FullyConsistent,
                    )
                    .await
                    .change_context(QueryError)?;

                let permitted_ids = permissions
                    .into_iter()
                    .filter_map(|(entity_id, has_permission)| has_permission.then_some(entity_id))
                    .collect::<HashSet<_>>();

                let count = entity_ids
                    .into_iter()
                    .filter(|id| permitted_ids.contains(&id.entity_uuid))
                    .count();
                (
                    Some((permitted_ids, zookie)),
                    Some(count),
                    web_ids.map(HashMap::from),
                    created_by_ids.map(HashMap::from),
                    edition_created_by_ids.map(HashMap::from),
                    include_type_ids.map(HashMap::from),
                )
            } else {
                (None, None, None, None, None, None)
            };

        let (latest_zookie, last) = loop {
            // We query one more than requested to determine if there are more entities to return.
            let (rows, artifacts) =
                ReadPaginated::<Entity, EntityQuerySorting>::read_paginated_vec(
                    self,
                    &params.filter,
                    Some(temporal_axes),
                    &params.sorting,
                    params.limit,
                    params.include_drafts,
                )
                .await?;
            let entities = rows
                .into_iter()
                .map(|row: Row| (row.decode_record(&artifacts), row))
                .collect::<Vec<_>>();
            if let Some(cursor) = entities
                .last()
                .map(|(_, row): &(Entity, Row)| row.decode_cursor(&artifacts))
            {
                params.sorting.set_cursor(cursor);
            }

            let num_returned_entities = entities.len();

            let (permitted_ids, zookie) = if let Some((permitted_ids, zookie)) = &permissions {
                (Cow::Borrowed(permitted_ids), Cow::Borrowed(zookie))
            } else {
                // TODO: The subgraph structure differs from the API interface. At the API the
                //       vertices are stored in a nested `HashMap` and here it's flattened. We need
                //       to adjust the subgraph anyway so instead of refactoring this now this will
                //       just copy the ids.
                //   see https://linear.app/hash/issue/H-297/revisit-subgraph-layout-to-allow-temporal-ontology-types
                let filtered_ids = entities
                    .iter()
                    .map(|(entity, _)| entity.metadata.record_id.entity_id)
                    .collect::<HashSet<_>>();

                let (permissions, zookie) = self
                    .authorization_api
                    .check_entities_permission(
                        actor_id,
                        EntityPermission::View,
                        filtered_ids,
                        Consistency::FullyConsistent,
                    )
                    .await
                    .change_context(QueryError)?;

                (
                    Cow::Owned(
                        permissions
                            .into_iter()
                            .filter_map(|(entity_id, has_permission)| {
                                has_permission.then_some(entity_id)
                            })
                            .collect::<HashSet<_>>(),
                    ),
                    Cow::Owned(zookie),
                )
            };

            root_entities.extend(
                entities
                    .into_iter()
                    .filter(|(entity, _)| {
                        permitted_ids.contains(&entity.metadata.record_id.entity_id.entity_uuid)
                    })
                    .take(params.limit.unwrap_or(usize::MAX) - root_entities.len()),
            );

            if let Some(limit) = params.limit {
                if num_returned_entities < limit {
                    // When the returned entities are less than the requested amount we know
                    // that there are no more entities to return.
                    break (zookie, None);
                }
                if root_entities.len() == limit {
                    // The requested limit is reached, so we can stop here.
                    break (
                        zookie,
                        root_entities
                            .last()
                            .map(|(_, row)| row.decode_cursor(&artifacts)),
                    );
                }
            } else {
                // Without a limit all entities are returned.
                break (zookie, None);
            }
        };

        Ok((
            GetEntitiesResponse {
                entities: root_entities
                    .into_iter()
                    .map(|(entity, _)| entity)
                    .collect(),
                cursor: last,
                count,
                web_ids,
                created_by_ids,
                edition_created_by_ids,
                type_ids,
            },
            latest_zookie.into_owned(),
        ))
    }
}

impl<C, A> EntityStore for PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    #[tracing::instrument(level = "info", skip(self, params))]
    async fn create_entities<R>(
        &mut self,
        actor_id: AccountId,
        params: Vec<CreateEntityParams<R>>,
    ) -> Result<Vec<Entity>, InsertionError>
    where
        R: IntoIterator<Item = EntityRelationAndSubject> + Send,
    {
        let transaction_time = Timestamp::<TransactionTime>::now().remove_nanosecond();
        let mut relationships = Vec::with_capacity(params.len());
        let mut entity_type_ids = HashMap::new();
        let mut checked_web_ids = HashSet::new();

        let mut entity_id_rows = Vec::with_capacity(params.len());
        let mut entity_draft_rows = Vec::new();
        let mut entity_edition_rows = Vec::with_capacity(params.len());
        let mut entity_temporal_metadata_rows = Vec::with_capacity(params.len());
        let mut entity_is_of_type_rows = Vec::with_capacity(params.len());
        let mut entity_has_left_entity_rows = Vec::new();
        let mut entity_has_right_entity_rows = Vec::new();

        let mut entities = Vec::with_capacity(params.len());
        // TODO: There are expected to be duplicates but we currently don't have a way to identify
        //       multi-type entity types. We need a way to speed this up.
        let mut validation_params = Vec::with_capacity(params.len());

        let validator_provider = StoreProvider {
            store: self,
            cache: StoreCache::default(),
            authorization: Some((actor_id, Consistency::FullyConsistent)),
        };

        for mut params in params {
            let entity_type = validator_provider
                .provide_closed_type(&params.entity_type_ids)
                .await
                .change_context(InsertionError)?;

            let validation_components = if params.draft {
                ValidateEntityComponents {
                    num_items: false,
                    required_properties: false,
                    ..ValidateEntityComponents::full()
                }
            } else {
                ValidateEntityComponents::full()
            };
            EntityPreprocessor {
                components: validation_components,
            }
            .visit_object(&entity_type, &mut params.properties, &validator_provider)
            .await
            .attach(StatusCode::InvalidArgument)
            .change_context(InsertionError)?;
            validation_params.push((entity_type, validation_components));

            let (properties, property_metadata) = params.properties.into_parts();

            let decision_time = params
                .decision_time
                .map_or_else(|| transaction_time.cast(), Timestamp::remove_nanosecond);
            let entity_id = EntityId {
                owned_by_id: params.owned_by_id,
                entity_uuid: params
                    .entity_uuid
                    .unwrap_or_else(|| EntityUuid::new(Uuid::new_v4())),
                draft_id: params.draft.then(|| DraftId::new(Uuid::new_v4())),
            };

            if entity_id.entity_uuid.as_uuid() != entity_id.owned_by_id.as_uuid() {
                checked_web_ids.insert(entity_id.owned_by_id);
            }

            let entity_provenance = EntityProvenance {
                inferred: InferredEntityProvenance {
                    created_by_id: CreatedById::new(actor_id),
                    created_at_transaction_time: transaction_time,
                    created_at_decision_time: decision_time,
                    first_non_draft_created_at_transaction_time: entity_id
                        .draft_id
                        .is_none()
                        .then_some(transaction_time),
                    first_non_draft_created_at_decision_time: entity_id
                        .draft_id
                        .is_none()
                        .then_some(decision_time),
                },
                edition: EntityEditionProvenance {
                    created_by_id: EditionCreatedById::new(actor_id),
                    archived_by_id: None,
                    provided: params.provenance,
                },
            };
            entity_id_rows.push(EntityIdRow {
                web_id: entity_id.owned_by_id,
                entity_uuid: entity_id.entity_uuid,
                provenance: entity_provenance.inferred.clone(),
            });
            if let Some(draft_id) = entity_id.draft_id {
                entity_draft_rows.push(EntityDraftRow {
                    web_id: entity_id.owned_by_id,
                    entity_uuid: entity_id.entity_uuid,
                    draft_id,
                });
            }

            let entity_edition_id = EntityEditionId::new(Uuid::new_v4());
            entity_edition_rows.push(EntityEditionRow {
                entity_edition_id,
                properties: properties.clone(),
                archived: false,
                confidence: params.confidence,
                provenance: entity_provenance.edition.clone(),
                property_metadata: property_metadata.clone(),
            });

            let temporal_versioning = EntityTemporalMetadata {
                decision_time: LeftClosedTemporalInterval::new(
                    ClosedTemporalBound::Inclusive(decision_time),
                    OpenTemporalBound::Unbounded,
                ),
                transaction_time: LeftClosedTemporalInterval::new(
                    ClosedTemporalBound::Inclusive(transaction_time),
                    OpenTemporalBound::Unbounded,
                ),
            };
            entity_temporal_metadata_rows.push(EntityTemporalMetadataRow {
                web_id: entity_id.owned_by_id,
                entity_uuid: entity_id.entity_uuid,
                draft_id: entity_id.draft_id,
                entity_edition_id,
                decision_time: temporal_versioning.decision_time,
                transaction_time: temporal_versioning.transaction_time,
            });

            for entity_type_url in &params.entity_type_ids {
                let entity_type_id = EntityTypeId::from_url(entity_type_url);
                entity_type_ids.insert(entity_type_id, entity_type_url.clone());
                entity_is_of_type_rows.push(EntityIsOfTypeRow {
                    entity_edition_id,
                    entity_type_ontology_id: entity_type_id,
                });
            }

            let link_data = params.link_data.inspect(|link_data| {
                entity_has_left_entity_rows.push(EntityHasLeftEntityRow {
                    web_id: entity_id.owned_by_id,
                    entity_uuid: entity_id.entity_uuid,
                    left_web_id: link_data.left_entity_id.owned_by_id,
                    left_entity_uuid: link_data.left_entity_id.entity_uuid,
                    confidence: link_data.left_entity_confidence,
                    provenance: link_data.left_entity_provenance.clone(),
                });
                entity_has_right_entity_rows.push(EntityHasRightEntityRow {
                    web_id: entity_id.owned_by_id,
                    entity_uuid: entity_id.entity_uuid,
                    right_web_id: link_data.right_entity_id.owned_by_id,
                    right_entity_uuid: link_data.right_entity_id.entity_uuid,
                    confidence: link_data.right_entity_confidence,
                    provenance: link_data.right_entity_provenance.clone(),
                });
            });

            entities.push(Entity {
                properties,
                link_data,
                metadata: EntityMetadata {
                    record_id: EntityRecordId {
                        entity_id,
                        edition_id: entity_edition_id,
                    },
                    temporal_versioning,
                    entity_type_ids: params.entity_type_ids,
                    archived: false,
                    provenance: entity_provenance,
                    confidence: params.confidence,
                    properties: property_metadata,
                },
            });

            let current_num_relationships = relationships.len();
            relationships.extend(
                params
                    .relationships
                    .into_iter()
                    .chain(once(EntityRelationAndSubject::Owner {
                        subject: EntityOwnerSubject::Web {
                            id: params.owned_by_id,
                        },
                        level: 0,
                    }))
                    .map(|relation_and_subject| (entity_id, relation_and_subject)),
            );
            if relationships.len() == current_num_relationships {
                return Err(Report::new(InsertionError)
                    .attach_printable("At least one relationship must be provided"));
            }
        }
        // We move out the cache, so we can re-use `&mut self` later.
        let store_cache = validator_provider.cache;

        let (instantiate_permissions, zookie) = self
            .authorization_api
            .check_entity_types_permission(
                actor_id,
                EntityTypePermission::Instantiate,
                entity_type_ids.keys().copied(),
                Consistency::FullyConsistent,
            )
            .await
            .change_context(InsertionError)?;
        let forbidden_instantiations = instantiate_permissions
            .iter()
            .filter_map(|(entity_type_id, permission)| {
                if *permission {
                    None
                } else {
                    entity_type_ids.get(entity_type_id)
                }
            })
            .collect::<Vec<_>>();
        if !forbidden_instantiations.is_empty() {
            return Err(Report::new(InsertionError)
                .attach(StatusCode::PermissionDenied)
                .attach_printable(
                    "The actor does not have permission to instantiate one or more entity types",
                )
                .attach_printable(
                    forbidden_instantiations
                        .into_iter()
                        .map(ToString::to_string)
                        .collect::<Vec<_>>()
                        .join(", "),
                ));
        }

        if !checked_web_ids.is_empty() {
            let (create_entity_permissions, _zookie) = self
                .authorization_api
                .check_webs_permission(
                    actor_id,
                    WebPermission::CreateEntity,
                    checked_web_ids,
                    Consistency::AtLeastAsFresh(&zookie),
                )
                .await
                .change_context(InsertionError)?;
            let forbidden_webs = create_entity_permissions
                .iter()
                .filter_map(
                    |(web_id, permission)| {
                        if *permission { None } else { Some(web_id) }
                    },
                )
                .collect::<Vec<_>>();
            if !forbidden_webs.is_empty() {
                return Err(Report::new(InsertionError)
                    .attach(StatusCode::PermissionDenied)
                    .attach_printable(
                        "The actor does not have permission to create entities for one or more \
                         web ids",
                    )
                    .attach_printable(
                        forbidden_webs
                            .into_iter()
                            .map(ToString::to_string)
                            .collect::<Vec<_>>()
                            .join(", "),
                    ));
            }
        }

        let transaction = self.transaction().await.change_context(InsertionError)?;

        let insertions = [
            InsertStatementBuilder::from_rows(Table::EntityIds, &entity_id_rows),
            InsertStatementBuilder::from_rows(Table::EntityDrafts, &entity_draft_rows),
            InsertStatementBuilder::from_rows(Table::EntityEditions, &entity_edition_rows),
            InsertStatementBuilder::from_rows(
                Table::EntityTemporalMetadata,
                &entity_temporal_metadata_rows,
            ),
            InsertStatementBuilder::from_rows(Table::EntityIsOfType, &entity_is_of_type_rows),
            InsertStatementBuilder::from_rows(
                Table::EntityHasLeftEntity,
                &entity_has_left_entity_rows,
            ),
            InsertStatementBuilder::from_rows(
                Table::EntityHasRightEntity,
                &entity_has_right_entity_rows,
            ),
        ];

        for statement in insertions {
            let (statement, parameters) = statement.compile();
            transaction
                .as_client()
                .query(&statement, &parameters)
                .await
                .change_context(InsertionError)?;
        }

        transaction
            .authorization_api
            .modify_entity_relations(relationships.iter().copied().map(
                |(entity_id, relation_and_subject)| {
                    (
                        ModifyRelationshipOperation::Create,
                        entity_id,
                        relation_and_subject,
                    )
                },
            ))
            .await
            .change_context(InsertionError)?;

        let validator_provider = StoreProvider {
            store: &transaction,
            cache: store_cache,
            authorization: Some((actor_id, Consistency::FullyConsistent)),
        };

        for (entity, (schema, components)) in entities.iter().zip(validation_params) {
            entity
                .validate(&schema, components, &validator_provider)
                .await
                .change_context(InsertionError)?;
        }

        let commit_result = transaction.commit().await.change_context(InsertionError);
        if let Err(error) = commit_result {
            let mut error = error.expand();

            if let Err(auth_error) = self
                .authorization_api
                .modify_entity_relations(relationships.into_iter().map(
                    |(entity_id, relation_and_subject)| {
                        (
                            ModifyRelationshipOperation::Delete,
                            entity_id,
                            relation_and_subject,
                        )
                    },
                ))
                .await
                .change_context(InsertionError)
            {
                error.push(auth_error);
            }

            Err(error.change_context(InsertionError))
        } else {
            if let Some(temporal_client) = &self.temporal_client {
                temporal_client
                    .start_update_entity_embeddings_workflow(actor_id, &entities)
                    .await
                    .change_context(InsertionError)?;
            }

            Ok(entities)
        }
    }

    // TODO: Relax constraints on entity validation for draft entities
    //   see https://linear.app/hash/issue/H-1449
    // TODO: Restrict non-draft links to non-draft entities
    //   see https://linear.app/hash/issue/H-1450
    #[tracing::instrument(level = "info", skip(self))]
    async fn validate_entities(
        &self,
        actor_id: AccountId,
        consistency: Consistency<'_>,
        params: Vec<ValidateEntityParams<'_>>,
    ) -> Result<(), ValidateEntityError> {
        let mut status = ReportSink::new();

        let validator_provider = StoreProvider {
            store: self,
            cache: StoreCache::default(),
            authorization: Some((actor_id, Consistency::FullyConsistent)),
        };

        for mut params in params {
            let schema = match params.entity_types {
                EntityValidationType::ClosedSchema(schema) => schema,
                EntityValidationType::Schema(schemas) => Cow::Owned(schemas.into_iter().collect()),
                EntityValidationType::Id(entity_type_urls) => Cow::Owned(
                    validator_provider
                        .provide_closed_type(entity_type_urls.as_ref())
                        .await
                        .change_context(ValidateEntityError)?,
                ),
            };

            if schema.schemas.is_empty() {
                let error = Report::new(validation::EntityValidationError::EmptyEntityTypes);
                status.append(error);
            };

            let pre_process_result = EntityPreprocessor {
                components: params.components,
            }
            .visit_object(
                schema.as_ref(),
                params.properties.to_mut(),
                &validator_provider,
            )
            .await
            .change_context(validation::EntityValidationError::InvalidProperties);
            if let Err(error) = pre_process_result {
                status.append(error);
            }

            if let Err(error) = params
                .link_data
                .as_deref()
                .validate(&schema, params.components, &validator_provider)
                .await
            {
                status.append(error);
            }
        }

        status
            .finish()
            .change_context(ValidateEntityError)
            .attach(StatusCode::InvalidArgument)
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn get_entities(
        &self,
        actor_id: AccountId,
        mut params: GetEntitiesParams<'_>,
    ) -> Result<GetEntitiesResponse<'static>, QueryError> {
        params
            .filter
            .convert_parameters(&StoreProvider {
                store: self,
                cache: StoreCache::default(),
                authorization: Some((actor_id, Consistency::FullyConsistent)),
            })
            .await
            .change_context(QueryError)?;

        let temporal_axes = params.temporal_axes.resolve();

        let mut response = self
            .get_entities_impl(
                actor_id,
                GetEntitiesImplParams {
                    filter: params.filter,
                    sorting: params.sorting,
                    limit: params.limit,
                    include_drafts: params.include_drafts,
                    include_count: params.include_count,
                    include_web_ids: params.include_web_ids,
                    include_created_by_ids: params.include_created_by_ids,
                    include_edition_created_by_ids: params.include_edition_created_by_ids,
                    include_type_ids: params.include_type_ids,
                },
                &temporal_axes,
            )
            .await
            .map(|(response, _)| response)?;

        if !params.conversions.is_empty() {
            let provider = StoreProvider {
                store: self,
                cache: StoreCache::default(),
                authorization: Some((actor_id, Consistency::FullyConsistent)),
            };
            for entity in &mut response.entities {
                self.convert_entity(&provider, entity, &params.conversions)
                    .await
                    .change_context(QueryError)?;
            }
        }

        Ok(response)
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn get_entity_subgraph(
        &self,
        actor_id: AccountId,
        mut params: GetEntitySubgraphParams<'_>,
    ) -> Result<GetEntitySubgraphResponse<'static>, QueryError> {
        params
            .filter
            .convert_parameters(&StoreProvider {
                store: self,
                cache: StoreCache::default(),
                authorization: Some((actor_id, Consistency::FullyConsistent)),
            })
            .await
            .change_context(QueryError)?;

        let unresolved_temporal_axes = params.temporal_axes;
        let temporal_axes = unresolved_temporal_axes.clone().resolve();

        let time_axis = temporal_axes.variable_time_axis();

        let (
            GetEntitiesResponse {
                entities: root_entities,
                cursor,
                count,
                web_ids,
                created_by_ids,
                edition_created_by_ids,
                type_ids,
            },
            zookie,
        ) = self
            .get_entities_impl(
                actor_id,
                GetEntitiesImplParams {
                    filter: params.filter,
                    sorting: params.sorting,
                    limit: params.limit,
                    include_drafts: params.include_drafts,
                    include_count: false,
                    include_web_ids: params.include_web_ids,
                    include_created_by_ids: params.include_created_by_ids,
                    include_edition_created_by_ids: params.include_edition_created_by_ids,
                    include_type_ids: params.include_type_ids,
                },
                &temporal_axes,
            )
            .await?;

        let mut subgraph = Subgraph::new(
            params.graph_resolve_depths,
            unresolved_temporal_axes,
            temporal_axes,
        );

        let span = tracing::trace_span!("construct_subgraph");
        let _s = span.enter();

        subgraph.roots.extend(
            root_entities
                .iter()
                .map(|entity| entity.vertex_id(time_axis).into()),
        );
        subgraph.vertices.entities = root_entities
            .into_iter()
            .map(|entity| (entity.vertex_id(time_axis), entity))
            .collect();

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
            actor_id,
            &zookie,
            &mut subgraph,
        )
        .await?;

        traversal_context
            .read_traversed_vertices(self, &mut subgraph, params.include_drafts)
            .await?;

        if !params.conversions.is_empty() {
            let provider = StoreProvider {
                store: self,
                cache: StoreCache::default(),
                authorization: Some((actor_id, Consistency::FullyConsistent)),
            };
            for entity in subgraph.vertices.entities.values_mut() {
                self.convert_entity(&provider, entity, &params.conversions)
                    .await
                    .change_context(QueryError)?;
            }
        }

        Ok(GetEntitySubgraphResponse {
            subgraph,
            cursor,
            count,
            web_ids,
            created_by_ids,
            edition_created_by_ids,
            type_ids,
        })
    }

    async fn count_entities(
        &self,
        actor_id: AccountId,
        mut params: CountEntitiesParams<'_>,
    ) -> Result<usize, QueryError> {
        params
            .filter
            .convert_parameters(&StoreProvider {
                store: self,
                cache: StoreCache::default(),
                authorization: Some((actor_id, Consistency::FullyConsistent)),
            })
            .await
            .change_context(QueryError)?;

        let temporal_axes = params.temporal_axes.resolve();

        let entity_ids = Read::<Entity>::read(
            self,
            &params.filter,
            Some(&temporal_axes),
            params.include_drafts,
        )
        .await?
        .map_ok(|entity| entity.metadata.record_id.entity_id)
        .try_collect::<Vec<_>>()
        .await?;

        let span = tracing::trace_span!("post_filter_entities");
        let _s = span.enter();

        let permitted_ids = self
            .authorization_api
            .check_entities_permission(
                actor_id,
                EntityPermission::View,
                entity_ids.iter().copied(),
                Consistency::FullyConsistent,
            )
            .await
            .change_context(QueryError)?
            .0
            .into_iter()
            .filter_map(|(entity_id, has_permission)| has_permission.then_some(entity_id))
            .collect::<HashSet<_>>();

        Ok(entity_ids
            .into_iter()
            .filter(|id| permitted_ids.contains(&id.entity_uuid))
            .count())
    }

    async fn get_entity_by_id(
        &self,
        actor_id: AccountId,
        entity_id: EntityId,
        transaction_time: Option<Timestamp<TransactionTime>>,
        decision_time: Option<Timestamp<DecisionTime>>,
    ) -> Result<Entity, QueryError> {
        self.authorization_api
            .check_entity_permission(
                actor_id,
                EntityPermission::View,
                entity_id,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(QueryError)?
            .assert_permission()
            .change_context(QueryError)?;

        let temporal_axes = QueryTemporalAxesUnresolved::TransactionTime {
            pinned: PinnedTemporalAxisUnresolved::new(decision_time),
            variable: VariableTemporalAxisUnresolved::new(
                transaction_time.map(TemporalBound::Inclusive),
                transaction_time.map(LimitedTemporalBound::Inclusive),
            ),
        }
        .resolve();

        Read::<Entity>::read_one(
            self,
            &Filter::for_entity_by_entity_id(entity_id),
            Some(&temporal_axes),
            entity_id.draft_id.is_some(),
        )
        .await
    }

    #[expect(
        clippy::significant_drop_tightening,
        reason = "The connection is required to borrow the client"
    )]
    #[tracing::instrument(level = "info", skip(self, params))]
    async fn patch_entity(
        &mut self,
        actor_id: AccountId,
        mut params: PatchEntityParams,
    ) -> Result<Entity, UpdateError> {
        let transaction_time = Timestamp::now().remove_nanosecond();
        let decision_time = params
            .decision_time
            .map_or_else(|| transaction_time.cast(), Timestamp::remove_nanosecond);
        let entity_type_ids = params
            .entity_type_ids
            .iter()
            .map(EntityTypeId::from_url)
            .collect::<Vec<_>>();

        if !self
            .authorization_api
            .check_entity_types_permission(
                actor_id,
                EntityTypePermission::Instantiate,
                entity_type_ids,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(UpdateError)?
            .0
            .into_iter()
            .all(|(_, permission)| permission)
        {
            bail!(Report::new(UpdateError).attach(StatusCode::PermissionDenied));
        }

        self.authorization_api
            .check_entity_permission(
                actor_id,
                EntityPermission::Update,
                params.entity_id,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(UpdateError)?
            .assert_permission()
            .change_context(UpdateError)?;

        let transaction = self.transaction().await.change_context(UpdateError)?;

        let locked_row = transaction
            .lock_entity_edition(params.entity_id, transaction_time, decision_time)
            .await?
            .ok_or_else(|| {
                Report::new(EntityDoesNotExist)
                    .attach(StatusCode::NotFound)
                    .attach_printable(params.entity_id)
                    .change_context(UpdateError)
            })?;
        let ClosedTemporalBound::Inclusive(locked_transaction_time) =
            *locked_row.transaction_time.start();
        let ClosedTemporalBound::Inclusive(locked_decision_time) =
            *locked_row.decision_time.start();
        let previous_entity = Read::<Entity>::read_one(
            &transaction,
            &Filter::Equal(
                Some(FilterExpression::Path {
                    path: EntityQueryPath::EditionId,
                }),
                Some(FilterExpression::Parameter {
                    parameter: Parameter::Uuid(locked_row.entity_edition_id.into_uuid()),
                    convert: None,
                }),
            ),
            Some(&QueryTemporalAxes::DecisionTime {
                pinned: PinnedTemporalAxis::new(locked_transaction_time),
                variable: VariableTemporalAxis::new(
                    TemporalBound::Inclusive(locked_decision_time),
                    LimitedTemporalBound::Inclusive(locked_decision_time),
                ),
            }),
            true,
        )
        .await
        .change_context(EntityDoesNotExist)
        .attach(params.entity_id)
        .change_context(UpdateError)?;

        let mut first_non_draft_created_at_decision_time = previous_entity
            .metadata
            .provenance
            .inferred
            .first_non_draft_created_at_decision_time;
        let mut first_non_draft_created_at_transaction_time = previous_entity
            .metadata
            .provenance
            .inferred
            .first_non_draft_created_at_transaction_time;

        let was_draft_before = previous_entity
            .metadata
            .record_id
            .entity_id
            .draft_id
            .is_some();
        let draft = params.draft.unwrap_or(was_draft_before);
        let archived = params.archived.unwrap_or(previous_entity.metadata.archived);
        let (entity_type_ids, entity_types_updated) = if params.entity_type_ids.is_empty() {
            (previous_entity.metadata.entity_type_ids, false)
        } else {
            let added_types = previous_entity
                .metadata
                .entity_type_ids
                .difference(&params.entity_type_ids);
            let removed_types = params
                .entity_type_ids
                .difference(&previous_entity.metadata.entity_type_ids);

            let mut has_changed = false;
            for entity_type_id in added_types.chain(removed_types) {
                has_changed = true;

                let entity_type_id = EntityTypeId::from_url(entity_type_id);
                transaction
                    .authorization_api
                    .check_entity_type_permission(
                        actor_id,
                        EntityTypePermission::Instantiate,
                        entity_type_id,
                        Consistency::FullyConsistent,
                    )
                    .await
                    .change_context(UpdateError)?
                    .assert_permission()
                    .change_context(UpdateError)
                    .attach(StatusCode::PermissionDenied)?;
            }

            (params.entity_type_ids, has_changed)
        };

        let previous_properties = previous_entity.properties.clone();
        let previous_property_metadata = previous_entity.metadata.properties.clone();

        let mut properties_with_metadata = PropertyWithMetadata::from_parts(
            Property::Object(previous_entity.properties),
            Some(PropertyMetadata::Object {
                value: previous_entity.metadata.properties.value,
                metadata: previous_entity.metadata.properties.metadata,
            }),
        )
        .change_context(UpdateError)?;
        properties_with_metadata
            .patch(params.properties)
            .change_context(UpdateError)?;

        let validator_provider = StoreProvider {
            store: &transaction,
            cache: StoreCache::default(),
            authorization: Some((actor_id, Consistency::FullyConsistent)),
        };
        let entity_type = validator_provider
            .provide_closed_type(&entity_type_ids)
            .await
            .change_context(UpdateError)?;

        let validation_components = if draft {
            ValidateEntityComponents::draft()
        } else {
            ValidateEntityComponents::full()
        };

        let (properties, property_metadata) =
            if let PropertyWithMetadata::Object(mut object) = properties_with_metadata {
                EntityPreprocessor {
                    components: validation_components,
                }
                .visit_object(&entity_type, &mut object, &validator_provider)
                .await
                .attach(StatusCode::InvalidArgument)
                .change_context(UpdateError)?;
                let (properties, property_metadata) = object.into_parts();
                (properties, property_metadata)
            } else {
                unreachable!("patching should not change the property type");
            };
        // We move out the cache, so we can re-use `&mut self` later.
        let store_cache = validator_provider.cache;

        #[expect(clippy::needless_collect, reason = "Will be used later")]
        let diff = previous_properties
            .diff(&properties, &mut PropertyPath::default())
            .collect::<Vec<_>>();

        if diff.is_empty()
            && was_draft_before == draft
            && archived == previous_entity.metadata.archived
            && !entity_types_updated
            && previous_property_metadata == property_metadata
            && params.confidence == previous_entity.metadata.confidence
        {
            // No changes were made to the entity.
            return Ok(Entity {
                properties: previous_properties,
                link_data: previous_entity.link_data,
                metadata: EntityMetadata {
                    record_id: previous_entity.metadata.record_id,
                    temporal_versioning: previous_entity.metadata.temporal_versioning,
                    entity_type_ids,
                    provenance: previous_entity.metadata.provenance,
                    archived,
                    confidence: previous_entity.metadata.confidence,
                    properties: property_metadata,
                },
            });
        }

        let link_data = previous_entity.link_data;

        let edition_provenance = EntityEditionProvenance {
            created_by_id: EditionCreatedById::new(actor_id),
            archived_by_id: None,
            provided: params.provenance,
        };
        let edition_id = transaction
            .insert_entity_edition(
                archived,
                &entity_type_ids,
                &properties,
                params.confidence,
                &edition_provenance,
                &property_metadata,
            )
            .await
            .change_context(UpdateError)?;

        let temporal_versioning = match (was_draft_before, draft) {
            (true, true) | (false, false) => {
                // regular update
                transaction
                    .update_temporal_metadata(
                        locked_row,
                        transaction_time,
                        decision_time,
                        edition_id,
                        false,
                    )
                    .await?
            }
            (false, true) => {
                let draft_id = DraftId::new(Uuid::new_v4());
                transaction
                    .as_client()
                    .query(
                        "
                        INSERT INTO entity_drafts (
                            web_id,
                            entity_uuid,
                            draft_id
                        ) VALUES ($1, $2, $3);",
                        &[
                            &params.entity_id.owned_by_id,
                            &params.entity_id.entity_uuid,
                            &draft_id,
                        ],
                    )
                    .await
                    .change_context(UpdateError)?;
                params.entity_id.draft_id = Some(draft_id);
                transaction
                    .insert_temporal_metadata(
                        params.entity_id,
                        edition_id,
                        transaction_time,
                        decision_time,
                    )
                    .await
                    .change_context(UpdateError)?
            }
            (true, false) => {
                // Publish a draft
                params.entity_id.draft_id = None;

                if first_non_draft_created_at_decision_time.is_none() {
                    transaction
                        .as_client()
                        .query(
                            "
                            UPDATE entity_ids
                            SET provenance = provenance || JSONB_BUILD_OBJECT(
                                'firstNonDraftCreatedAtTransactionTime', $1::TIMESTAMPTZ,
                                'firstNonDraftCreatedAtDecisionTime', $2::TIMESTAMPTZ
                            )
                            WHERE web_id = $3
                              AND entity_uuid = $4;
                            ",
                            &[
                                &transaction_time,
                                &decision_time,
                                &params.entity_id.owned_by_id,
                                &params.entity_id.entity_uuid,
                            ],
                        )
                        .await
                        .change_context(UpdateError)?;

                    first_non_draft_created_at_transaction_time = Some(transaction_time);
                    first_non_draft_created_at_decision_time = Some(decision_time);
                }

                if let Some(previous_live_entity) = transaction
                    .lock_entity_edition(params.entity_id, transaction_time, decision_time)
                    .await?
                {
                    transaction
                        .archive_entity(
                            actor_id,
                            previous_live_entity,
                            transaction_time,
                            decision_time,
                        )
                        .await?;
                }
                transaction
                    .update_temporal_metadata(
                        locked_row,
                        transaction_time,
                        decision_time,
                        edition_id,
                        true,
                    )
                    .await?
            }
        };

        let entity_metadata = EntityMetadata {
            record_id: EntityRecordId {
                entity_id: params.entity_id,
                edition_id,
            },
            temporal_versioning,
            entity_type_ids,
            provenance: EntityProvenance {
                inferred: InferredEntityProvenance {
                    first_non_draft_created_at_transaction_time,
                    first_non_draft_created_at_decision_time,
                    ..previous_entity.metadata.provenance.inferred
                },
                edition: edition_provenance,
            },
            confidence: params.confidence,
            properties: property_metadata,
            archived,
        };
        let entities = [Entity {
            properties,
            link_data,
            metadata: entity_metadata.clone(),
        }];

        let validator_provider = StoreProvider {
            store: &transaction,
            cache: store_cache,
            authorization: Some((actor_id, Consistency::FullyConsistent)),
        };
        entities[0]
            .validate(&entity_type, validation_components, &validator_provider)
            .await
            .change_context(UpdateError)?;

        transaction.commit().await.change_context(UpdateError)?;

        if let Some(temporal_client) = &self.temporal_client {
            temporal_client
                .start_update_entity_embeddings_workflow(actor_id, &entities)
                .await
                .change_context(UpdateError)?;
        }
        let [entity] = entities;
        Ok(entity)
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn update_entity_embeddings(
        &mut self,
        _: AccountId,
        params: UpdateEntityEmbeddingsParams<'_>,
    ) -> Result<(), UpdateError> {
        #[derive(Debug, ToSql)]
        #[postgres(name = "entity_embeddings")]
        pub struct EntityEmbeddingsRow<'a> {
            web_id: OwnedById,
            entity_uuid: EntityUuid,
            draft_id: Option<DraftId>,
            property: Option<String>,
            embedding: Embedding<'a>,
            updated_at_transaction_time: Timestamp<TransactionTime>,
            updated_at_decision_time: Timestamp<DecisionTime>,
        }
        let entity_embeddings = params
            .embeddings
            .into_iter()
            .map(|embedding: EntityEmbedding<'_>| EntityEmbeddingsRow {
                web_id: params.entity_id.owned_by_id,
                entity_uuid: params.entity_id.entity_uuid,
                draft_id: params.entity_id.draft_id,
                property: embedding.property.as_ref().map(ToString::to_string),
                embedding: embedding.embedding,
                updated_at_transaction_time: params.updated_at_transaction_time,
                updated_at_decision_time: params.updated_at_decision_time,
            })
            .collect::<Vec<_>>();

        // TODO: Add permission to allow updating embeddings
        //   see https://linear.app/hash/issue/H-1870
        // let permissions = authorization_api
        //     .check_entities_permission(
        //         actor_id,
        //         EntityPermission::UpdateEmbeddings,
        //         entity_ids.iter().copied(),
        //         Consistency::FullyConsistent,
        //     )
        //     .await
        //     .change_context(UpdateError)?
        //     .0
        //     .into_iter()
        //     .filter_map(|(entity_id, has_permission)| (!has_permission).then_some(entity_id))
        //     .collect::<Vec<_>>();
        // if !permissions.is_empty() {
        //     let mut status = Report::new(PermissionAssertion);
        //     for entity_id in permissions {
        //         status = status.attach(format!("Permission denied for entity {entity_id}"));
        //     }
        //     return Err(status.change_context(UpdateError));
        // }

        if params.reset {
            if let Some(draft_id) = params.entity_id.draft_id {
                self.as_client()
                    .query(
                        "
                        DELETE FROM entity_embeddings
                        WHERE web_id = $1
                          AND entity_uuid = $2
                          AND draft_id = $3
                          AND updated_at_transaction_time <= $4
                          AND updated_at_decision_time <= $5;
                    ",
                        &[
                            &params.entity_id.owned_by_id,
                            &params.entity_id.entity_uuid,
                            &draft_id,
                            &params.updated_at_transaction_time,
                            &params.updated_at_decision_time,
                        ],
                    )
                    .await
                    .change_context(UpdateError)?;
            } else {
                self.as_client()
                    .query(
                        "
                        DELETE FROM entity_embeddings
                        WHERE web_id = $1
                          AND entity_uuid = $2
                          AND draft_id IS NULL
                          AND updated_at_transaction_time <= $3
                          AND updated_at_decision_time <= $4;
                    ",
                        &[
                            &params.entity_id.owned_by_id,
                            &params.entity_id.entity_uuid,
                            &params.updated_at_transaction_time,
                            &params.updated_at_decision_time,
                        ],
                    )
                    .await
                    .change_context(UpdateError)?;
            }
        }
        self.as_client()
            .query(
                "
                    INSERT INTO entity_embeddings
                    SELECT * FROM UNNEST($1::entity_embeddings[])
                    ON CONFLICT (web_id, entity_uuid, property) DO UPDATE
                    SET
                        embedding = EXCLUDED.embedding,
                        updated_at_transaction_time = EXCLUDED.updated_at_transaction_time,
                        updated_at_decision_time = EXCLUDED.updated_at_decision_time
                    WHERE entity_embeddings.updated_at_transaction_time <= \
                 EXCLUDED.updated_at_transaction_time
                    AND entity_embeddings.updated_at_decision_time <= \
                 EXCLUDED.updated_at_decision_time;
                ",
                &[&entity_embeddings],
            )
            .await
            .change_context(UpdateError)?;

        Ok(())
    }
}

#[derive(Debug)]
#[must_use]
struct LockedEntityEdition {
    entity_id: EntityId,
    entity_edition_id: EntityEditionId,
    decision_time: LeftClosedTemporalInterval<DecisionTime>,
    transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}

impl<A> PostgresStore<tokio_postgres::Transaction<'_>, A>
where
    A: Send + Sync,
{
    #[tracing::instrument(level = "trace", skip(self))]
    async fn insert_entity_edition(
        &self,
        archived: bool,
        entity_type_ids: &HashSet<VersionedUrl>,
        properties: &PropertyObject,
        confidence: Option<Confidence>,
        provenance: &EntityEditionProvenance,
        metadata: &PropertyMetadataObject,
    ) -> Result<EntityEditionId, InsertionError> {
        let edition_id: EntityEditionId = self
            .as_client()
            .query_one(
                "
                    INSERT INTO entity_editions (
                        entity_edition_id,
                        archived,
                        properties,
                        confidence,
                        provenance,
                        property_metadata
                    ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
                    RETURNING entity_edition_id;
                ",
                &[&archived, &properties, &confidence, provenance, metadata],
            )
            .await
            .change_context(InsertionError)?
            .get(0);

        let entity_type_ontology_ids = entity_type_ids
            .iter()
            .map(|entity_type_id| OntologyId::from(EntityTypeId::from_url(entity_type_id)))
            .collect::<Vec<_>>();

        self.as_client()
            .query(
                "
                    INSERT INTO entity_is_of_type (
                        entity_edition_id,
                        entity_type_ontology_id
                    ) SELECT $1, UNNEST($2::UUID[]);
                ",
                &[&edition_id, &entity_type_ontology_ids],
            )
            .await
            .change_context(InsertionError)?;

        Ok(edition_id)
    }

    #[tracing::instrument(level = "trace", skip(self))]
    async fn lock_entity_edition(
        &self,
        entity_id: EntityId,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
    ) -> Result<Option<LockedEntityEdition>, UpdateError> {
        let current_data = if let Some(draft_id) = entity_id.draft_id {
            self.as_client()
                .query_opt(
                    "
                        SELECT
                            entity_temporal_metadata.entity_edition_id,
                            entity_temporal_metadata.transaction_time,
                            entity_temporal_metadata.decision_time
                        FROM entity_temporal_metadata
                        WHERE entity_temporal_metadata.web_id = $1
                          AND entity_temporal_metadata.entity_uuid = $2
                          AND entity_temporal_metadata.draft_id = $3
                          AND entity_temporal_metadata.transaction_time @> $4::timestamptz
                          AND entity_temporal_metadata.decision_time @> $5::timestamptz
                          FOR NO KEY UPDATE NOWAIT;",
                    &[
                        &entity_id.owned_by_id,
                        &entity_id.entity_uuid,
                        &draft_id,
                        &transaction_time,
                        &decision_time,
                    ],
                )
                .await
        } else {
            self.as_client()
                .query_opt(
                    "
                        SELECT
                            entity_temporal_metadata.entity_edition_id,
                            entity_temporal_metadata.transaction_time,
                            entity_temporal_metadata.decision_time
                        FROM entity_temporal_metadata
                        WHERE entity_temporal_metadata.web_id = $1
                          AND entity_temporal_metadata.entity_uuid = $2
                          AND entity_temporal_metadata.draft_id IS NULL
                          AND entity_temporal_metadata.transaction_time @> $3::timestamptz
                          AND entity_temporal_metadata.decision_time @> $4::timestamptz
                          FOR NO KEY UPDATE NOWAIT;",
                    &[
                        &entity_id.owned_by_id,
                        &entity_id.entity_uuid,
                        &transaction_time,
                        &decision_time,
                    ],
                )
                .await
        };

        current_data
            .map(|row| {
                row.map(|row| LockedEntityEdition {
                    entity_id,
                    entity_edition_id: row.get(0),
                    transaction_time: row.get(1),
                    decision_time: row.get(2),
                })
            })
            .map_err(|error| match error.code() {
                Some(&SqlState::LOCK_NOT_AVAILABLE) => Report::new(RaceConditionOnUpdate)
                    .attach(entity_id)
                    .change_context(UpdateError),
                _ => Report::new(error).change_context(UpdateError),
            })
    }

    #[tracing::instrument(level = "trace", skip(self))]
    async fn insert_temporal_metadata(
        &self,
        entity_id: EntityId,
        edition_id: EntityEditionId,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
    ) -> Result<EntityTemporalMetadata, InsertionError> {
        let row = self
            .as_client()
            .query_one(
                "
                INSERT INTO entity_temporal_metadata (
                    web_id,
                    entity_uuid,
                    draft_id,
                    entity_edition_id,
                    transaction_time,
                    decision_time
                ) VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    tstzrange($5, NULL, '[)'),
                    tstzrange($6, NULL, '[)')
                ) RETURNING decision_time, transaction_time;",
                &[
                    &entity_id.owned_by_id,
                    &entity_id.entity_uuid,
                    &entity_id.draft_id,
                    &edition_id,
                    &transaction_time,
                    &decision_time,
                ],
            )
            .await
            .change_context(InsertionError)?;

        Ok(EntityTemporalMetadata {
            decision_time: row.get(0),
            transaction_time: row.get(1),
        })
    }

    #[tracing::instrument(level = "trace", skip(self))]
    async fn update_temporal_metadata(
        &self,
        locked_row: LockedEntityEdition,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
        entity_edition_id: EntityEditionId,
        undraft: bool,
    ) -> Result<EntityTemporalMetadata, UpdateError> {
        let row = if let Some(draft_id) = locked_row.entity_id.draft_id {
            if undraft {
                self.client
                    .as_client()
                    .query_one(
                        "
                UPDATE entity_temporal_metadata
                SET transaction_time = tstzrange($4::timestamptz, NULL, '[)'),
                    decision_time = tstzrange($5::timestamptz, upper(decision_time), '[)'),
                    entity_edition_id = $6,
                    draft_id = NULL
                WHERE entity_temporal_metadata.web_id = $1
                  AND entity_temporal_metadata.entity_uuid = $2
                  AND entity_temporal_metadata.draft_id = $3
                  AND entity_temporal_metadata.transaction_time @> $4::timestamptz
                  AND entity_temporal_metadata.decision_time @> $5::timestamptz
                RETURNING decision_time, transaction_time;",
                        &[
                            &locked_row.entity_id.owned_by_id,
                            &locked_row.entity_id.entity_uuid,
                            &draft_id,
                            &transaction_time,
                            &decision_time,
                            &entity_edition_id,
                        ],
                    )
                    .await
                    .change_context(UpdateError)?
            } else {
                self.client
                    .as_client()
                    .query_one(
                        "
                UPDATE entity_temporal_metadata
                SET transaction_time = tstzrange($4::timestamptz, NULL, '[)'),
                    decision_time = tstzrange($5::timestamptz, upper(decision_time), '[)'),
                    entity_edition_id = $6
                WHERE entity_temporal_metadata.web_id = $1
                  AND entity_temporal_metadata.entity_uuid = $2
                  AND entity_temporal_metadata.draft_id = $3
                  AND entity_temporal_metadata.transaction_time @> $4::timestamptz
                  AND entity_temporal_metadata.decision_time @> $5::timestamptz
                RETURNING decision_time, transaction_time;",
                        &[
                            &locked_row.entity_id.owned_by_id,
                            &locked_row.entity_id.entity_uuid,
                            &draft_id,
                            &transaction_time,
                            &decision_time,
                            &entity_edition_id,
                        ],
                    )
                    .await
                    .change_context(UpdateError)?
            }
        } else {
            self.client
                .as_client()
                .query_one(
                    "
                UPDATE entity_temporal_metadata
                SET transaction_time = tstzrange($3::timestamptz, NULL, '[)'),
                    decision_time = tstzrange($4::timestamptz, upper(decision_time), '[)'),
                    entity_edition_id = $5
                WHERE entity_temporal_metadata.web_id = $1
                  AND entity_temporal_metadata.entity_uuid = $2
                  AND entity_temporal_metadata.draft_id IS NULL
                  AND entity_temporal_metadata.transaction_time @> $3::timestamptz
                  AND entity_temporal_metadata.decision_time @> $4::timestamptz
                RETURNING decision_time, transaction_time;",
                    &[
                        &locked_row.entity_id.owned_by_id,
                        &locked_row.entity_id.entity_uuid,
                        &transaction_time,
                        &decision_time,
                        &entity_edition_id,
                    ],
                )
                .await
                .change_context(UpdateError)?
        };

        self.client
            .as_client()
            .query(
                "
                INSERT INTO entity_temporal_metadata (
                    web_id,
                    entity_uuid,
                    draft_id,
                    entity_edition_id,
                    decision_time,
                    transaction_time
                ) VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    tstzrange(lower($6::tstzrange), $7, '[)')
                );",
                &[
                    &locked_row.entity_id.owned_by_id,
                    &locked_row.entity_id.entity_uuid,
                    &locked_row.entity_id.draft_id,
                    &locked_row.entity_edition_id,
                    &locked_row.decision_time,
                    &locked_row.transaction_time,
                    &transaction_time,
                ],
            )
            .await
            .change_context(UpdateError)?;

        self.client
            .as_client()
            .query(
                "
                INSERT INTO entity_temporal_metadata (
                    web_id,
                    entity_uuid,
                    draft_id,
                    entity_edition_id,
                    transaction_time,
                    decision_time
                ) VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    tstzrange($6, NULL, '[)'),
                    tstzrange(lower($5::tstzrange), $7, '[)')
                );",
                &[
                    &locked_row.entity_id.owned_by_id,
                    &locked_row.entity_id.entity_uuid,
                    &locked_row.entity_id.draft_id,
                    &locked_row.entity_edition_id,
                    &locked_row.decision_time,
                    &transaction_time,
                    &decision_time,
                ],
            )
            .await
            .change_context(UpdateError)?;

        Ok(EntityTemporalMetadata {
            decision_time: row.get(0),
            transaction_time: row.get(1),
        })
    }

    #[tracing::instrument(level = "trace", skip(self))]
    async fn archive_entity(
        &self,
        actor_id: AccountId,
        locked_row: LockedEntityEdition,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
    ) -> Result<EntityTemporalMetadata, UpdateError> {
        let row = if let Some(draft_id) = locked_row.entity_id.draft_id {
            self.client
                .as_client()
                .query_one(
                    "
                UPDATE entity_temporal_metadata
                SET transaction_time = tstzrange($4::timestamptz, NULL, '[)'),
                    decision_time = tstzrange(lower(decision_time), $5::timestamptz, '[)')
                WHERE entity_temporal_metadata.web_id = $1
                  AND entity_temporal_metadata.entity_uuid = $2
                  AND entity_temporal_metadata.draft_id = $3
                  AND entity_temporal_metadata.transaction_time @> $4::timestamptz
                  AND entity_temporal_metadata.decision_time @> $5::timestamptz
                RETURNING decision_time, transaction_time;",
                    &[
                        &locked_row.entity_id.owned_by_id,
                        &locked_row.entity_id.entity_uuid,
                        &draft_id,
                        &transaction_time,
                        &decision_time,
                    ],
                )
                .await
                .change_context(UpdateError)?
        } else {
            self.client
                .as_client()
                .query_one(
                    "
                UPDATE entity_temporal_metadata
                SET transaction_time = tstzrange($3::timestamptz, NULL, '[)'),
                    decision_time = tstzrange(lower(decision_time), $4::timestamptz, '[)')
                WHERE entity_temporal_metadata.web_id = $1
                  AND entity_temporal_metadata.entity_uuid = $2
                  AND entity_temporal_metadata.draft_id IS NULL
                  AND entity_temporal_metadata.transaction_time @> $3::timestamptz
                  AND entity_temporal_metadata.decision_time @> $4::timestamptz
                RETURNING decision_time, transaction_time;",
                    &[
                        &locked_row.entity_id.owned_by_id,
                        &locked_row.entity_id.entity_uuid,
                        &transaction_time,
                        &decision_time,
                    ],
                )
                .await
                .change_context(UpdateError)?
        };

        self.client
            .as_client()
            .query(
                "
                INSERT INTO entity_temporal_metadata (
                    web_id,
                    entity_uuid,
                    draft_id,
                    entity_edition_id,
                    transaction_time,
                    decision_time
                ) VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    tstzrange(lower($6::tstzrange), $7, '[)'),
                    $5
                );",
                &[
                    &locked_row.entity_id.owned_by_id,
                    &locked_row.entity_id.entity_uuid,
                    &locked_row.entity_id.draft_id,
                    &locked_row.entity_edition_id,
                    &locked_row.decision_time,
                    &locked_row.transaction_time,
                    &transaction_time,
                ],
            )
            .await
            .change_context(UpdateError)?;

        self.client
            .query(
                "
                    UPDATE entity_editions SET
                        provenance = provenance || JSONB_BUILD_OBJECT(
                            'archivedById', $2::UUID
                        )
                    WHERE entity_edition_id = $1",
                &[
                    &locked_row.entity_edition_id,
                    &EditionArchivedById::new(actor_id),
                ],
            )
            .await
            .change_context(UpdateError)?;

        Ok(EntityTemporalMetadata {
            decision_time: row.get(0),
            transaction_time: row.get(1),
        })
    }
}
