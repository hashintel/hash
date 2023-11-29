mod read;
use std::collections::{HashMap, HashSet};

use async_trait::async_trait;
use authorization::{
    backend::ModifyRelationshipOperation,
    schema::{
        EntityOwnerSubject, EntityPermission, EntityRelationAndSubject, EntityTypeId,
        EntityTypePermission, WebPermission,
    },
    zanzibar::{Consistency, Zookie},
    AuthorizationApi,
};
use error_stack::{ensure, Report, Result, ResultExt};
use futures::TryStreamExt;
use graph_types::{
    account::AccountId,
    knowledge::{
        entity::{
            Entity, EntityEditionId, EntityId, EntityMetadata, EntityProperties, EntityRecordId,
            EntityTemporalMetadata, EntityUuid,
        },
        link::{EntityLinkOrder, LinkData},
    },
    provenance::{OwnedById, ProvenanceMetadata, RecordCreatedById},
    web::WebId,
};
use hash_status::StatusCode;
use postgres_types::Json;
use temporal_versioning::{DecisionTime, RightBoundedTemporalInterval, Timestamp};
#[cfg(hash_graph_test_environment)]
use tokio_postgres::GenericClient;
use type_system::{url::VersionedUrl, EntityType};
use uuid::Uuid;
use validation::{EntityValidationError, Validate};

#[cfg(hash_graph_test_environment)]
use crate::store::error::DeletionError;
use crate::{
    ontology::EntityTypeQueryPath,
    store::{
        crud::Read,
        error::{EntityDoesNotExist, RaceConditionOnUpdate},
        knowledge::EntityValidationType,
        postgres::{
            knowledge::entity::read::EntityEdgeTraversalData, query::ReferenceTable,
            TraversalContext,
        },
        query::{Filter, FilterExpression, Parameter},
        validation::StoreProvider,
        AsClient, EntityStore, InsertionError, PostgresStore, QueryError, Record, StoreCache,
        UpdateError,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, KnowledgeGraphEdgeKind, SharedEdgeKind},
        identifier::{EntityIdWithInterval, EntityVertexId},
        query::StructuralQuery,
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableAxis,
            VariableTemporalAxisUnresolved,
        },
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read an [`Entity`] into a [`TraversalContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(
        level = "trace",
        skip(self, traversal_context, subgraph, authorization_api, zookie)
    )]
    pub(crate) async fn traverse_entities<A>(
        &self,
        mut entity_queue: Vec<(
            EntityVertexId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        traversal_context: &mut TraversalContext,
        actor_id: AccountId,
        authorization_api: &A,
        zookie: &Zookie<'static>,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError>
    where
        A: AuthorizationApi + Sync,
    {
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
                    Self::filter_entity_types_by_permission(
                        self.read_shared_edges(&traversal_data, Some(0)).await?,
                        actor_id,
                        authorization_api,
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
                    let (entity_ids, knowledge_edges): (Vec<_>, Vec<_>) = self
                        .read_knowledge_edges(traversal_data, table, edge_direction)
                        .await?
                        .unzip();

                    if knowledge_edges.is_empty() {
                        continue;
                    }

                    let permissions = authorization_api
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
                                    .get(&entity_id)
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
            authorization_api,
            zookie,
            subgraph,
        )
        .await?;

        Ok(())
    }

    #[tracing::instrument(level = "trace", skip(self))]
    #[cfg(hash_graph_test_environment)]
    pub async fn delete_entities(&mut self) -> Result<(), DeletionError> {
        self.as_client()
            .client()
            .simple_query(
                "
                    DELETE FROM entity_has_left_entity;
                    DELETE FROM entity_has_right_entity;
                    DELETE FROM entity_is_of_type;
                    DELETE FROM entity_temporal_metadata;
                    DELETE FROM entity_editions;
                    DELETE FROM entity_ids;
                ",
            )
            .await
            .change_context(DeletionError)?;

        Ok(())
    }
}

#[async_trait]
impl<C: AsClient> EntityStore for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self, properties, authorization_api))]
    async fn create_entity<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        owned_by_id: OwnedById,
        owner: EntityOwnerSubject,
        entity_uuid: Option<EntityUuid>,
        decision_time: Option<Timestamp<DecisionTime>>,
        archived: bool,
        draft: bool,
        entity_type_url: VersionedUrl,
        properties: EntityProperties,
        link_data: Option<LinkData>,
    ) -> Result<EntityMetadata, InsertionError> {
        let entity_type_id = EntityTypeId::from_url(&entity_type_url);
        authorization_api
            .check_entity_type_permission(
                actor_id,
                EntityTypePermission::Instantiate,
                entity_type_id,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(InsertionError)?
            .assert_permission()
            .change_context(InsertionError)
            .attach(StatusCode::PermissionDenied)?;

        if Some(owned_by_id.into_uuid()) != entity_uuid.map(EntityUuid::into_uuid) {
            authorization_api
                .check_web_permission(
                    actor_id,
                    WebPermission::CreateEntity,
                    WebId::from(owned_by_id),
                    Consistency::FullyConsistent,
                )
                .await
                .change_context(InsertionError)?
                .assert_permission()
                .change_context(InsertionError)
                .attach(StatusCode::PermissionDenied)?;
        }

        let entity_id = EntityId {
            owned_by_id,
            entity_uuid: entity_uuid.unwrap_or_else(|| EntityUuid::new(Uuid::new_v4())),
        };

        let transaction = self.transaction().await.change_context(InsertionError)?;

        transaction
            .as_client()
            .query(
                "
                    INSERT INTO entity_ids (web_id, entity_uuid)
                    VALUES ($1, $2);
                ",
                &[&entity_id.owned_by_id, &entity_id.entity_uuid],
            )
            .await
            .change_context(InsertionError)?;

        let link_order = if let Some(link_data) = link_data {
            transaction
                .as_client()
                .query(
                    "
                        INSERT INTO entity_has_left_entity (
                            web_id,
                            entity_uuid,
                            left_web_id,
                            left_entity_uuid
                        ) VALUES ($1, $2, $3, $4);
                    ",
                    &[
                        &entity_id.owned_by_id,
                        &entity_id.entity_uuid,
                        &link_data.left_entity_id.owned_by_id,
                        &link_data.left_entity_id.entity_uuid,
                    ],
                )
                .await
                .change_context(InsertionError)?;

            transaction
                .as_client()
                .query(
                    "
                        INSERT INTO entity_has_right_entity (
                            web_id,
                            entity_uuid,
                            right_web_id,
                            right_entity_uuid
                        ) VALUES ($1, $2, $3, $4);
                    ",
                    &[
                        &entity_id.owned_by_id,
                        &entity_id.entity_uuid,
                        &link_data.right_entity_id.owned_by_id,
                        &link_data.right_entity_id.entity_uuid,
                    ],
                )
                .await
                .change_context(InsertionError)?;

            link_data.order
        } else {
            EntityLinkOrder {
                left_to_right: None,
                right_to_left: None,
            }
        };

        let (edition_id, closed_schema) = transaction
            .insert_entity_edition(
                RecordCreatedById::new(actor_id),
                archived,
                draft,
                &entity_type_url,
                &properties,
                &link_order,
            )
            .await?;

        let row = if let Some(decision_time) = decision_time {
            transaction
                .as_client()
                .query_one(
                    "
                    INSERT INTO entity_temporal_metadata (
                        web_id,
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
                ",
                    &[
                        &entity_id.owned_by_id,
                        &entity_id.entity_uuid,
                        &edition_id,
                        &decision_time,
                    ],
                )
                .await
                .change_context(InsertionError)?
        } else {
            transaction
                .as_client()
                .query_one(
                    "
                    INSERT INTO entity_temporal_metadata (
                        web_id,
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
                ",
                    &[&entity_id.owned_by_id, &entity_id.entity_uuid, &edition_id],
                )
                .await
                .change_context(InsertionError)?
        };

        authorization_api
            .modify_entity_relations([(
                ModifyRelationshipOperation::Create,
                entity_id,
                EntityRelationAndSubject::Owner {
                    subject: owner,
                    level: 0,
                },
            )])
            .await
            .change_context(InsertionError)?;

        transaction
            .validate_entity(
                actor_id,
                authorization_api,
                Consistency::FullyConsistent,
                EntityValidationType::Schema(&closed_schema),
                &properties,
                link_data.as_ref(),
            )
            .await
            .change_context(InsertionError)
            .attach(StatusCode::InvalidArgument)?;

        if let Err(mut error) = transaction.commit().await.change_context(InsertionError) {
            if let Err(auth_error) = authorization_api
                .modify_entity_relations([(
                    ModifyRelationshipOperation::Delete,
                    entity_id,
                    EntityRelationAndSubject::Owner {
                        subject: owner,
                        level: 0,
                    },
                )])
                .await
                .change_context(InsertionError)
            {
                // TODO: Use `add_child`
                //   see https://linear.app/hash/issue/GEN-105/add-ability-to-add-child-errors
                error.extend_one(auth_error);
            }

            Err(error)
        } else {
            Ok(EntityMetadata::new(
                EntityRecordId {
                    entity_id,
                    edition_id,
                },
                EntityTemporalMetadata {
                    decision_time: row.get(0),
                    transaction_time: row.get(1),
                },
                entity_type_url,
                ProvenanceMetadata {
                    record_created_by_id: RecordCreatedById::new(actor_id),
                    record_archived_by_id: None,
                },
                archived,
                draft,
            ))
        }
    }

    // TODO: Relax constraints on entity validation for draft entities
    //   see https://linear.app/hash/issue/H-1449
    // TODO: Restrict non-draft links to non-draft entities
    //   see https://linear.app/hash/issue/H-1450
    async fn validate_entity<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        consistency: Consistency<'static>,
        entity_type: EntityValidationType<'_>,
        properties: &EntityProperties,
        link_data: Option<&LinkData>,
    ) -> Result<(), QueryError> {
        enum MaybeBorrowed<'a, T> {
            Borrowed(&'a T),
            Owned(T),
        }

        let schema = match entity_type {
            EntityValidationType::Schema(schema) => MaybeBorrowed::Borrowed(schema),
            EntityValidationType::Id(entity_type_url) => {
                let entity_type_id = EntityTypeId::from_url(entity_type_url);

                authorization_api
                    .check_entity_type_permission(
                        actor_id,
                        EntityTypePermission::View,
                        entity_type_id,
                        consistency,
                    )
                    .await
                    .change_context(QueryError)?
                    .assert_permission()
                    .change_context(QueryError)
                    .attach(StatusCode::PermissionDenied)?;

                let mut closed_schemas = self
                    .read_closed_schemas(
                        &Filter::Equal(
                            Some(FilterExpression::Path(EntityTypeQueryPath::OntologyId)),
                            Some(FilterExpression::Parameter(Parameter::Uuid(
                                entity_type_id.into_uuid(),
                            ))),
                        ),
                        Some(
                            &QueryTemporalAxesUnresolved::DecisionTime {
                                pinned: PinnedTemporalAxisUnresolved::new(None),
                                variable: VariableTemporalAxisUnresolved::new(None, None),
                            }
                            .resolve(),
                        ),
                    )
                    .await
                    .change_context(QueryError)?
                    .map_ok(|(_, raw_type)| raw_type)
                    .try_collect::<Vec<EntityType>>()
                    .await?;

                ensure!(
                    closed_schemas.len() <= 1,
                    Report::new(QueryError).attach_printable(format!(
                        "Expected exactly one closed schema to be returned from the query but {} \
                         were returned",
                        closed_schemas.len(),
                    ))
                );
                MaybeBorrowed::Owned(closed_schemas.pop().ok_or_else(|| {
                    Report::new(QueryError).attach_printable(
                        "Expected exactly one closed schema to be returned from the query but \
                         none was returned",
                    )
                })?)
            }
        };

        let schema = match &schema {
            MaybeBorrowed::Borrowed(schema) => *schema,
            MaybeBorrowed::Owned(schema) => schema,
        };

        let mut status: Result<(), EntityValidationError> = Ok(());

        let validator_provider = StoreProvider {
            store: self,
            cache: StoreCache::default(),
            authorization: Some((authorization_api, actor_id, Consistency::FullyConsistent)),
        };

        if let Err(error) = properties.validate(schema, &validator_provider).await {
            if let Err(ref mut report) = status {
                report.extend_one(error);
            } else {
                status = Err(error);
            }
        }

        if let Err(error) = link_data.validate(schema, &validator_provider).await {
            if let Err(ref mut report) = status {
                report.extend_one(error);
            } else {
                status = Err(error);
            }
        }

        status
            .change_context(QueryError)
            .attach(StatusCode::InvalidArgument)
    }

    #[doc(hidden)]
    #[cfg(hash_graph_test_environment)]
    #[expect(clippy::too_many_lines)]
    async fn insert_entities_batched_by_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
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
        entity_type_url: &VersionedUrl,
    ) -> Result<Vec<EntityMetadata>, InsertionError> {
        let entity_type_id = EntityTypeId::from_url(entity_type_url);
        authorization_api
            .check_entity_type_permission(
                actor_id,
                EntityTypePermission::Instantiate,
                entity_type_id,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(InsertionError)?
            .assert_permission()
            .change_context(InsertionError)
            .attach(StatusCode::PermissionDenied)?;

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
            .ontology_id_by_url(entity_type_url)
            .await
            .change_context(InsertionError)?;

        let entity_edition_ids = transaction
            .insert_entity_records(entity_editions, RecordCreatedById::new(actor_id))
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
                    entity_type_url.clone(),
                    ProvenanceMetadata {
                        record_created_by_id: RecordCreatedById::new(actor_id),
                        record_archived_by_id: None,
                    },
                    false,
                    false,
                )
            })
            .collect())
    }

    #[tracing::instrument(level = "info", skip(self, authorization_api))]
    async fn get_entity<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        query: &StructuralQuery<Entity>,
    ) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
            temporal_axes: ref unresolved_temporal_axes,
        } = *query;

        let temporal_axes = unresolved_temporal_axes.clone().resolve();
        let time_axis = temporal_axes.variable_time_axis();

        let mut entities = Read::<Entity>::read_vec(self, filter, Some(&temporal_axes))
            .await?
            .into_iter()
            .map(|entity| (entity.vertex_id(time_axis), entity))
            .collect::<HashMap<_, _>>();
        // TODO: The subgraph structure differs from the API interface. At the API the vertices
        //       are stored in a nested `HashMap` and here it's flattened. We need to adjust the
        //       the subgraph anyway so instead of refactoring this now this will just copy the ids.
        //   see https://linear.app/hash/issue/H-297/revisit-subgraph-layout-to-allow-temporal-ontology-types
        let filtered_ids = entities
            .keys()
            .map(|vertex_id| vertex_id.base_id)
            .collect::<HashSet<_>>();

        let (permissions, zookie) = authorization_api
            .check_entities_permission(
                actor_id,
                EntityPermission::View,
                filtered_ids,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(QueryError)?;

        let permitted_ids = permissions
            .into_iter()
            .filter_map(|(entity_id, has_permission)| has_permission.then_some(entity_id))
            .collect::<HashSet<_>>();

        entities.retain(|vertex_id, _| permitted_ids.contains(&vertex_id.base_id));

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
            actor_id,
            authorization_api,
            &zookie,
            &mut subgraph,
        )
        .await?;

        traversal_context
            .read_traversed_vertices(self, &mut subgraph)
            .await?;

        Ok(subgraph)
    }

    #[tracing::instrument(level = "info", skip(self, properties, authorization_api))]
    async fn update_entity<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        entity_id: EntityId,
        decision_time: Option<Timestamp<DecisionTime>>,
        archived: bool,
        draft: bool,
        entity_type_url: VersionedUrl,
        properties: EntityProperties,
        link_order: EntityLinkOrder,
    ) -> Result<EntityMetadata, UpdateError> {
        let entity_type_id = EntityTypeId::from_url(&entity_type_url);
        authorization_api
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

        authorization_api
            .check_entity_permission(
                actor_id,
                EntityPermission::Update,
                entity_id,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(UpdateError)?
            .assert_permission()
            .change_context(UpdateError)?;

        let transaction = self.transaction().await.change_context(UpdateError)?;

        if transaction
            .as_client()
            .query_opt(
                "
                 SELECT EXISTS (
                    SELECT 1 FROM entity_ids WHERE web_id = $1 AND entity_uuid = $2
                 );",
                &[&entity_id.owned_by_id, &entity_id.entity_uuid],
            )
            .await
            .change_context(UpdateError)?
            .is_none()
        {
            return Err(Report::new(EntityDoesNotExist)
                .attach(entity_id)
                .change_context(UpdateError));
        }

        let (edition_id, closed_schema) = transaction
            .insert_entity_edition(
                RecordCreatedById::new(actor_id),
                archived,
                draft,
                &entity_type_url,
                &properties,
                &link_order,
            )
            .await
            .change_context(UpdateError)?;

        // Calling `UPDATE` on `entity_temporal_metadata` will invoke a trigger that properly
        // updates the temporal versioning of the entity.
        let optional_row = if let Some(decision_time) = decision_time {
            transaction
                .as_client()
                .query_opt(
                    "
                        UPDATE entity_temporal_metadata
                        SET decision_time = tstzrange($4, upper(decision_time), '[)'),
                            transaction_time = tstzrange(now(), NULL, '[)'),
                            entity_edition_id = $3
                        WHERE web_id = $1
                          AND entity_uuid = $2
                          AND decision_time @> $4::TIMESTAMPTZ
                          AND transaction_time @> now()
                        RETURNING decision_time, transaction_time;
                    ",
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
                    "
                        UPDATE entity_temporal_metadata
                        SET decision_time = tstzrange(now(), upper(decision_time), '[)'),
                            transaction_time = tstzrange(now(), NULL, '[)'),
                            entity_edition_id = $3
                        WHERE web_id = $1
                          AND entity_uuid = $2
                          AND decision_time @> now()
                          AND transaction_time @> now()
                        RETURNING decision_time, transaction_time;
                    ",
                    &[&entity_id.owned_by_id, &entity_id.entity_uuid, &edition_id],
                )
                .await
        }
        .change_context(UpdateError)?;
        let row = optional_row.ok_or_else(|| {
            Report::new(RaceConditionOnUpdate)
                .attach(entity_id)
                .change_context(UpdateError)
        })?;

        // let link_data = transaction
        //     .as_client()
        //     .query_opt(
        //         "SELECT left_web_id, left_entity_uuid, right_web_id, right_entity_uuid
        //          FROM entity_has_left_entity
        //          JOIN entity_has_right_entity USING (web_id, entity_uuid)
        //          WHERE web_id = $1 AND entity_uuid = $2;",
        //         &[&entity_id.owned_by_id, &entity_id.entity_uuid],
        //     )
        //     .await
        //     .change_context(UpdateError)?
        //     .map(|row| LinkData {
        //         left_entity_id: EntityId {
        //             owned_by_id: row.get(0),
        //             entity_uuid: row.get(1),
        //         },
        //         right_entity_id: EntityId {
        //             owned_by_id: row.get(2),
        //             entity_uuid: row.get(3),
        //         },
        //         order: link_order,
        //     });

        // TODO: Validate source and target entities when updating a link.
        //   see https://linear.app/hash/issue/H-1413
        properties
            .validate(
                &closed_schema,
                &StoreProvider {
                    store: &transaction,
                    cache: StoreCache::default(),
                    authorization: Some((
                        authorization_api,
                        actor_id,
                        Consistency::FullyConsistent,
                    )),
                },
            )
            .await
            .change_context(UpdateError)
            .attach(StatusCode::InvalidArgument)?;

        // transaction
        //     .validate_entity(
        //         actor_id,
        //         authorization_api,
        //         Consistency::FullyConsistent,
        //         EntityValidationType::Schema(&closed_schema),
        //         &properties,
        //         link_data.as_ref(),
        //     )
        //     .await
        //     .change_context(UpdateError)
        //     .attach(StatusCode::InvalidArgument)?;

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
            entity_type_url,
            ProvenanceMetadata {
                record_created_by_id: RecordCreatedById::new(actor_id),
                record_archived_by_id: None,
            },
            archived,
            draft,
        ))
    }
}

impl PostgresStore<tokio_postgres::Transaction<'_>> {
    async fn insert_entity_edition(
        &self,
        record_created_by_id: RecordCreatedById,
        archived: bool,
        draft: bool,
        entity_type_id: &VersionedUrl,
        properties: &EntityProperties,
        link_order: &EntityLinkOrder,
    ) -> Result<(EntityEditionId, EntityType), InsertionError> {
        let edition_id: EntityEditionId = self
            .as_client()
            .query_one(
                "
                    INSERT INTO entity_editions (
                        entity_edition_id,
                        record_created_by_id,
                        archived,
                        draft,
                        properties,
                        left_to_right_order,
                        right_to_left_order
                    ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
                    RETURNING entity_edition_id;
                ",
                &[
                    &record_created_by_id,
                    &archived,
                    &draft,
                    &properties,
                    &link_order.left_to_right,
                    &link_order.right_to_left,
                ],
            )
            .await
            .change_context(InsertionError)?
            .get(0);

        let entity_type_ontology_id = self
            .ontology_id_by_url(entity_type_id)
            .await
            .change_context(InsertionError)?;

        self.as_client()
            .query(
                "
                    INSERT INTO entity_is_of_type (
                        entity_edition_id,
                        entity_type_ontology_id
                    ) VALUES ($1, $2);
                ",
                &[&edition_id, &entity_type_ontology_id],
            )
            .await
            .change_context(InsertionError)?;

        let Json(entity_type) = self
            .as_client()
            .query_one(
                "SELECT closed_schema FROM entity_types WHERE ontology_id = $1;",
                &[&entity_type_ontology_id],
            )
            .await
            .change_context(InsertionError)?
            .get(0);

        Ok((edition_id, entity_type))
    }
}
