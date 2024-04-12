mod query;
mod read;

use std::{
    borrow::Cow,
    collections::{HashMap, HashSet},
    iter::once,
};

use authorization::{
    backend::ModifyRelationshipOperation,
    schema::{
        EntityOwnerSubject, EntityPermission, EntityRelationAndSubject, EntityTypeId,
        EntityTypePermission, WebPermission,
    },
    zanzibar::{Consistency, Zookie},
    AuthorizationApi,
};
use error_stack::{bail, ensure, Report, Result, ResultExt};
use futures::TryStreamExt;
use graph_types::{
    account::{AccountId, CreatedById, EditionCreatedById},
    knowledge::{
        entity::{
            DraftId, Entity, EntityEditionId, EntityEditionProvenanceMetadata, EntityEmbedding,
            EntityId, EntityMetadata, EntityProperties, EntityProvenanceMetadata, EntityRecordId,
            EntityTemporalMetadata, EntityUuid, PropertyPath,
        },
        link::LinkData,
    },
    owned_by_id::OwnedById,
    Embedding,
};
use hash_status::StatusCode;
use json_patch::patch;
use postgres_types::{Json, ToSql};
use temporal_client::TemporalClient;
use temporal_versioning::{
    ClosedTemporalBound, DecisionTime, LeftClosedTemporalInterval, LimitedTemporalBound,
    RightBoundedTemporalInterval, TemporalBound, Timestamp, TransactionTime,
};
use tokio_postgres::{error::SqlState, GenericClient, Row};
use type_system::{url::VersionedUrl, ClosedEntityType};
use uuid::Uuid;
use validation::{Validate, ValidateEntityComponents};

use crate::{
    knowledge::EntityQueryPath,
    ontology::EntityTypeQueryPath,
    store::{
        crud::{QueryResult, Read, ReadPaginated, Sorting},
        error::{DeletionError, EntityDoesNotExist, RaceConditionOnUpdate},
        knowledge::{
            CreateEntityParams, EntityQueryCursor, EntityQuerySorting, EntityValidationType,
            GetEntityParams, PatchEntityParams, UpdateEntityEmbeddingsParams, ValidateEntityError,
            ValidateEntityParams,
        },
        postgres::{
            knowledge::entity::read::EntityEdgeTraversalData, ontology::OntologyId,
            query::ReferenceTable, TraversalContext,
        },
        query::{Filter, FilterExpression, Parameter, ParameterList},
        validation::StoreProvider,
        AsClient, EntityStore, InsertionError, PostgresStore, QueryError, StoreCache,
        SubgraphRecord, UpdateError,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, KnowledgeGraphEdgeKind, SharedEdgeKind},
        identifier::{EntityIdWithInterval, EntityVertexId},
        temporal_axes::{
            PinnedTemporalAxis, PinnedTemporalAxisUnresolved, QueryTemporalAxes,
            QueryTemporalAxesUnresolved, VariableAxis, VariableTemporalAxis,
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
        level = "info",
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
            authorization_api,
            zookie,
            subgraph,
        )
        .await?;

        Ok(())
    }

    #[tracing::instrument(level = "info", skip(self))]
    pub async fn delete_entities(&mut self) -> Result<(), DeletionError> {
        self.as_client()
            .client()
            .simple_query(
                "
                    DELETE FROM entity_has_left_entity;
                    DELETE FROM entity_has_right_entity;
                    DELETE FROM entity_property;
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
}

impl<C: AsClient> EntityStore for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self, authorization_api, temporal_client, params))]
    async fn create_entity<A: AuthorizationApi + Send + Sync, R>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        params: CreateEntityParams<R>,
    ) -> Result<EntityMetadata, InsertionError>
    where
        R: IntoIterator<Item = EntityRelationAndSubject> + Send,
    {
        let relationships = params
            .relationships
            .into_iter()
            .chain(once(EntityRelationAndSubject::Owner {
                subject: EntityOwnerSubject::Web {
                    id: params.owned_by_id,
                },
                level: 0,
            }))
            .collect::<Vec<_>>();
        if relationships.is_empty() {
            return Err(Report::new(InsertionError)
                .attach_printable("At least one relationship must be provided"));
        }

        for entity_type_id in &params.entity_type_ids {
            let entity_type_id = EntityTypeId::from_url(entity_type_id);
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
        }

        if Some(params.owned_by_id.into_uuid()) != params.entity_uuid.map(EntityUuid::into_uuid) {
            authorization_api
                .check_web_permission(
                    actor_id,
                    WebPermission::CreateEntity,
                    params.owned_by_id,
                    Consistency::FullyConsistent,
                )
                .await
                .change_context(InsertionError)?
                .assert_permission()
                .change_context(InsertionError)
                .attach(StatusCode::PermissionDenied)?;
        }

        let entity_id = EntityId {
            owned_by_id: params.owned_by_id,
            entity_uuid: params
                .entity_uuid
                .unwrap_or_else(|| EntityUuid::new(Uuid::new_v4())),
            draft_id: params.draft.then(|| DraftId::new(Uuid::new_v4())),
        };

        let transaction = self.transaction().await.change_context(InsertionError)?;

        match (params.decision_time, params.draft) {
            (Some(decision_time), false) => transaction
                .as_client()
                .query(
                    "
                    INSERT INTO entity_ids (
                        web_id,
                        entity_uuid,
                        created_by_id,
                        created_at_transaction_time,
                        created_at_decision_time,
                        first_non_draft_created_at_transaction_time,
                        first_non_draft_created_at_decision_time
                    ) VALUES ($1, $2, $3, now(), $4, now(), $4);
                ",
                    &[
                        &entity_id.owned_by_id,
                        &entity_id.entity_uuid,
                        &CreatedById::new(actor_id),
                        &decision_time,
                    ],
                )
                .await
                .change_context(InsertionError)?,
            (Some(decision_time), true) => transaction
                .as_client()
                .query(
                    "
                    INSERT INTO entity_ids (
                        web_id,
                        entity_uuid,
                        created_by_id,
                        created_at_transaction_time,
                        created_at_decision_time
                    ) VALUES ($1, $2, $3, now(), $4);
                ",
                    &[
                        &entity_id.owned_by_id,
                        &entity_id.entity_uuid,
                        &CreatedById::new(actor_id),
                        &decision_time,
                    ],
                )
                .await
                .change_context(InsertionError)?,
            (None, false) => transaction
                .as_client()
                .query(
                    "
                    INSERT INTO entity_ids (
                        web_id,
                        entity_uuid,
                        created_by_id,
                        created_at_transaction_time,
                        created_at_decision_time,
                        first_non_draft_created_at_transaction_time,
                        first_non_draft_created_at_decision_time
                    ) VALUES ($1, $2, $3, now(), now(), now(), now());
                ",
                    &[
                        &entity_id.owned_by_id,
                        &entity_id.entity_uuid,
                        &CreatedById::new(actor_id),
                    ],
                )
                .await
                .change_context(InsertionError)?,
            (None, true) => transaction
                .as_client()
                .query(
                    "
                    INSERT INTO entity_ids (
                        web_id,
                        entity_uuid,
                        created_by_id,
                        created_at_transaction_time,
                        created_at_decision_time
                    ) VALUES ($1, $2, $3, now(), now());
                ",
                    &[
                        &entity_id.owned_by_id,
                        &entity_id.entity_uuid,
                        &CreatedById::new(actor_id),
                    ],
                )
                .await
                .change_context(InsertionError)?,
        };

        if let Some(draft_id) = entity_id.draft_id {
            transaction
                .as_client()
                .query(
                    "
                    INSERT INTO entity_drafts (
                        web_id,
                        entity_uuid,
                        draft_id
                    ) VALUES ($1, $2, $3);
                ",
                    &[&entity_id.owned_by_id, &entity_id.entity_uuid, &draft_id],
                )
                .await
                .change_context(InsertionError)?;
        }

        if let Some(link_data) = params.link_data {
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
        }

        let edition_created_by_id = EditionCreatedById::new(actor_id);
        let (edition_id, closed_schema) = transaction
            .insert_entity_edition(
                edition_created_by_id,
                false,
                &params.entity_type_ids,
                &params.properties,
            )
            .await?;

        let temporal_versioning = transaction
            .insert_temporal_metadata(entity_id, edition_id, params.decision_time)
            .await?;

        authorization_api
            .modify_entity_relations(relationships.clone().into_iter().map(
                |relation_and_subject| {
                    (
                        ModifyRelationshipOperation::Create,
                        entity_id,
                        relation_and_subject,
                    )
                },
            ))
            .await
            .change_context(InsertionError)?;

        transaction
            .validate_entity(
                actor_id,
                authorization_api,
                Consistency::FullyConsistent,
                ValidateEntityParams {
                    entity_types: EntityValidationType::ClosedSchema(Cow::Owned(closed_schema)),
                    properties: Cow::Borrowed(&params.properties),
                    link_data: params.link_data.as_ref().map(Cow::Borrowed),
                    components: if params.draft {
                        ValidateEntityComponents {
                            num_items: false,
                            required_properties: false,
                            ..ValidateEntityComponents::full()
                        }
                    } else {
                        ValidateEntityComponents::full()
                    },
                },
            )
            .await
            .change_context(InsertionError)
            .attach(StatusCode::InvalidArgument)?;

        let commit_result = {
            let span = tracing::trace_span!("committing entity");
            let _enter = span.enter();
            transaction.commit().await.change_context(InsertionError)
        };
        if let Err(mut error) = commit_result {
            if let Err(auth_error) = authorization_api
                .modify_entity_relations(relationships.into_iter().map(|relation_and_subject| {
                    (
                        ModifyRelationshipOperation::Delete,
                        entity_id,
                        relation_and_subject,
                    )
                }))
                .await
                .change_context(InsertionError)
            {
                // TODO: Use `add_child`
                //   see https://linear.app/hash/issue/GEN-105/add-ability-to-add-child-errors
                error.extend_one(auth_error);
            }

            Err(error)
        } else {
            let entity_metadata = EntityMetadata {
                record_id: EntityRecordId {
                    entity_id,
                    edition_id,
                },
                entity_type_ids: params.entity_type_ids,
                provenance: EntityProvenanceMetadata {
                    created_by_id: CreatedById::new(edition_created_by_id.as_account_id()),
                    created_at_decision_time: Timestamp::from(
                        *temporal_versioning.decision_time.start(),
                    ),
                    created_at_transaction_time: Timestamp::from(
                        *temporal_versioning.transaction_time.start(),
                    ),
                    first_non_draft_created_at_decision_time: (!params.draft)
                        .then_some(Timestamp::from(*temporal_versioning.decision_time.start())),
                    first_non_draft_created_at_transaction_time: (!params.draft).then_some(
                        Timestamp::from(*temporal_versioning.transaction_time.start()),
                    ),
                    edition: EntityEditionProvenanceMetadata {
                        created_by_id: edition_created_by_id,
                    },
                },
                temporal_versioning,
                archived: false,
                confidence: None,
                property_confidence: HashMap::new(),
            };
            if let Some(temporal_client) = temporal_client {
                temporal_client
                    .start_update_entity_embeddings_workflow(
                        actor_id,
                        &[Entity {
                            properties: params.properties,
                            link_data: params.link_data,
                            metadata: entity_metadata.clone(),
                        }],
                    )
                    .await
                    .change_context(InsertionError)?;
            }
            Ok(entity_metadata)
        }
    }

    // TODO: Relax constraints on entity validation for draft entities
    //   see https://linear.app/hash/issue/H-1449
    // TODO: Restrict non-draft links to non-draft entities
    //   see https://linear.app/hash/issue/H-1450
    #[tracing::instrument(level = "info", skip(self, authorization_api))]
    async fn validate_entity<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        consistency: Consistency<'_>,
        params: ValidateEntityParams<'_>,
    ) -> Result<(), ValidateEntityError> {
        let schema = match params.entity_types {
            EntityValidationType::ClosedSchema(schema) => schema,
            EntityValidationType::Schema(schemas) => Cow::Owned(schemas.into_iter().collect()),
            EntityValidationType::Id(entity_type_url) => {
                let (ontology_type_ids, ontology_type_uuids): (Vec<_>, Vec<_>) = entity_type_url
                    .as_ref()
                    .iter()
                    .map(|url| {
                        let id = EntityTypeId::from_url(url);
                        (id, id.into_uuid())
                    })
                    .unzip();

                if !authorization_api
                    .check_entity_types_permission(
                        actor_id,
                        EntityTypePermission::View,
                        ontology_type_ids.iter().copied(),
                        consistency,
                    )
                    .await
                    .change_context(ValidateEntityError)?
                    .0
                    .into_iter()
                    .all(|(_, permission)| permission)
                {
                    bail!(Report::new(ValidateEntityError).attach(StatusCode::PermissionDenied));
                }

                let mut closed_schemas = self
                    .read_closed_schemas(
                        &Filter::In(
                            FilterExpression::Path(EntityTypeQueryPath::OntologyId),
                            ParameterList::Uuid(&ontology_type_uuids),
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
                    .change_context(ValidateEntityError)?
                    .map_ok(|(_, raw_type)| raw_type)
                    .try_collect::<Vec<ClosedEntityType>>()
                    .await
                    .change_context(ValidateEntityError)?;

                ensure!(
                    closed_schemas.len() <= 1,
                    Report::new(ValidateEntityError).attach_printable(format!(
                        "Expected exactly one closed schema to be returned from the query but {} \
                         were returned",
                        closed_schemas.len(),
                    ))
                );
                Cow::Owned(closed_schemas.pop().ok_or_else(|| {
                    Report::new(ValidateEntityError).attach_printable(
                        "Expected exactly one closed schema to be returned from the query but \
                         none was returned",
                    )
                })?)
            }
        };

        let mut status: Result<(), validation::EntityValidationError> = if schema.schemas.is_empty()
        {
            Err(Report::new(
                validation::EntityValidationError::EmptyEntityTypes,
            ))
        } else {
            Ok(())
        };

        let validator_provider = StoreProvider {
            store: self,
            cache: StoreCache::default(),
            authorization: Some((authorization_api, actor_id, Consistency::FullyConsistent)),
        };

        if let Err(error) = params
            .properties
            .validate(&schema, params.components, &validator_provider)
            .await
        {
            if let Err(ref mut report) = status {
                report.extend_one(error);
            } else {
                status = Err(error);
            }
        }

        if let Err(error) = params
            .link_data
            .as_deref()
            .validate(&schema, params.components, &validator_provider)
            .await
        {
            if let Err(ref mut report) = status {
                report.extend_one(error);
            } else {
                status = Err(error);
            }
        }

        status
            .change_context(ValidateEntityError)
            .attach(StatusCode::InvalidArgument)
    }

    #[tracing::instrument(level = "info", skip(self, authorization_api, entities))]
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
                    draft_id: None,
                },
                actor_id,
                decision_time,
                link_data.as_ref().map(|link_data| link_data.left_entity_id),
                link_data
                    .as_ref()
                    .map(|link_data| link_data.right_entity_id),
            ));
            entity_editions.push(properties);
            entity_versions.push(decision_time);
        }

        // TODO: match on and return the relevant error
        //   https://app.asana.com/0/1200211978612931/1202574350052904/f
        transaction
            .insert_entity_ids(entity_ids.iter().copied().map(
                |(id, actor_id, decision_time, ..)| (id, CreatedById::new(actor_id), decision_time),
            ))
            .await?;

        transaction
            .insert_entity_links(
                "left",
                entity_ids
                    .iter()
                    .copied()
                    .filter_map(|(id, _, _, left, _)| left.map(|left| (id, left))),
            )
            .await?;
        transaction
            .insert_entity_links(
                "right",
                entity_ids
                    .iter()
                    .copied()
                    .filter_map(|(id, _, _, _, right)| right.map(|right| (id, right))),
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
            .insert_entity_records(entity_editions, EditionCreatedById::new(actor_id))
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
            .map(
                |(((entity_id, ..), temporal_versioning), edition_id)| EntityMetadata {
                    record_id: EntityRecordId {
                        entity_id,
                        edition_id,
                    },
                    entity_type_ids: vec![entity_type_url.clone()],
                    provenance: EntityProvenanceMetadata {
                        created_by_id: CreatedById::new(actor_id),
                        created_at_decision_time: Timestamp::from(
                            *temporal_versioning.decision_time.start(),
                        ),
                        created_at_transaction_time: Timestamp::from(
                            *temporal_versioning.transaction_time.start(),
                        ),
                        first_non_draft_created_at_decision_time: Some(Timestamp::from(
                            *temporal_versioning.decision_time.start(),
                        )),
                        first_non_draft_created_at_transaction_time: Some(Timestamp::from(
                            *temporal_versioning.transaction_time.start(),
                        )),
                        edition: EntityEditionProvenanceMetadata {
                            created_by_id: EditionCreatedById::new(actor_id),
                        },
                    },
                    temporal_versioning,
                    archived: false,
                    confidence: None,
                    property_confidence: HashMap::new(),
                },
            )
            .collect())
    }

    #[tracing::instrument(level = "info", skip(self, authorization_api, params))]
    async fn get_entity<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        mut params: GetEntityParams<'_>,
    ) -> Result<(Subgraph, Option<EntityQueryCursor<'static>>), QueryError> {
        let query = &mut params.query;

        let unresolved_temporal_axes = query.temporal_axes.clone();
        let temporal_axes = unresolved_temporal_axes.clone().resolve();
        let time_axis = temporal_axes.variable_time_axis();

        let mut root_entities = Vec::new();

        let (latest_zookie, last) = loop {
            // We query one more than requested to determine if there are more entities to return.
            let (rows, artifacts) =
                ReadPaginated::<Entity, EntityQuerySorting>::read_paginated_vec(
                    self,
                    &query.filter,
                    Some(&temporal_axes),
                    &params.sorting,
                    params.limit,
                    query.include_drafts,
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

            // TODO: The subgraph structure differs from the API interface. At the API the vertices
            //       are stored in a nested `HashMap` and here it's flattened. We need to adjust the
            //       subgraph anyway so instead of refactoring this now this will just copy the ids.
            //   see https://linear.app/hash/issue/H-297/revisit-subgraph-layout-to-allow-temporal-ontology-types
            let filtered_ids = entities
                .iter()
                .map(|(entity, _)| entity.metadata.record_id.entity_id)
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

        let mut subgraph = Subgraph::new(
            query.graph_resolve_depths,
            unresolved_temporal_axes,
            temporal_axes,
        );

        subgraph.roots.extend(
            root_entities
                .iter()
                .map(|(entity, _)| entity.vertex_id(time_axis).into()),
        );
        subgraph.vertices.entities = root_entities
            .into_iter()
            .map(|(entity, _)| (entity.vertex_id(time_axis), entity))
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
            authorization_api,
            &latest_zookie,
            &mut subgraph,
        )
        .await?;

        traversal_context
            .read_traversed_vertices(self, &mut subgraph, query.include_drafts)
            .await?;

        Ok((subgraph, last))
    }

    #[tracing::instrument(level = "info", skip(self, authorization_api, temporal_client, params))]
    async fn patch_entity<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        mut params: PatchEntityParams,
    ) -> Result<EntityMetadata, UpdateError> {
        let entity_type_ids = params
            .entity_type_ids
            .iter()
            .map(EntityTypeId::from_url)
            .collect::<Vec<_>>();

        if !authorization_api
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

        authorization_api
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
            .lock_entity_edition(params.entity_id, params.decision_time)
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
                Some(FilterExpression::Path(EntityQueryPath::EditionId)),
                Some(FilterExpression::Parameter(Parameter::Uuid(
                    locked_row.entity_edition_id.into_uuid(),
                ))),
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
            .first_non_draft_created_at_decision_time;
        let mut first_non_draft_created_at_transaction_time = previous_entity
            .metadata
            .provenance
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
            let previous_entity_types = previous_entity
                .metadata
                .entity_type_ids
                .iter()
                .collect::<HashSet<_>>();
            let new_entity_types = params.entity_type_ids.iter().collect::<HashSet<_>>();

            let added_types = new_entity_types.difference(&previous_entity_types);
            let removed_types = previous_entity_types.difference(&new_entity_types);

            let mut has_changed = false;
            for entity_type_id in added_types.chain(removed_types) {
                has_changed = true;

                let _entity_type_id = EntityTypeId::from_url(entity_type_id);
                // TODO: Re-enable this check once the migration in the Node API properly assigns
                //       the `Instantiate` permissions.
                //   see https://linear.app/hash/issue/H-2468
                // authorization_api
                //     .check_entity_type_permission(
                //         actor_id,
                //         EntityTypePermission::Instantiate,
                //         entity_type_id,
                //         Consistency::FullyConsistent,
                //     )
                //     .await
                //     .change_context(UpdateError)?
                //     .assert_permission()
                //     .change_context(UpdateError)
                //     .attach(StatusCode::PermissionDenied)?;
            }

            (params.entity_type_ids, has_changed)
        };
        let mut properties =
            serde_json::to_value(&previous_entity.properties).change_context(UpdateError)?;
        patch(&mut properties, &params.properties).change_context(UpdateError)?;
        let properties = serde_json::from_value(properties).change_context(UpdateError)?;
        #[expect(clippy::needless_collect, reason = "Will be used later")]
        let diff = previous_entity
            .properties
            .diff(&properties, &mut PropertyPath::default())
            .collect::<Vec<_>>();

        if diff.is_empty()
            && was_draft_before == draft
            && archived == previous_entity.metadata.archived
            && !entity_types_updated
        {
            // No changes were made to the entity.
            return Ok(EntityMetadata {
                record_id: previous_entity.metadata.record_id,
                temporal_versioning: previous_entity.metadata.temporal_versioning,
                entity_type_ids,
                provenance: previous_entity.metadata.provenance,
                archived,
                confidence: previous_entity.metadata.confidence,
                property_confidence: previous_entity.metadata.property_confidence,
            });
        }

        let link_data = previous_entity.link_data;

        let (edition_id, closed_schema) = transaction
            .insert_entity_edition(
                EditionCreatedById::new(actor_id),
                archived,
                &entity_type_ids,
                &properties,
            )
            .await
            .change_context(UpdateError)?;

        let temporal_versioning = match (was_draft_before, draft) {
            (true, true) | (false, false) => {
                // regular update
                transaction
                    .update_temporal_metadata(locked_row, edition_id, false)
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
                    .insert_temporal_metadata(params.entity_id, edition_id, params.decision_time)
                    .await
                    .change_context(UpdateError)?
            }
            (true, false) => {
                // Publish a draft
                params.entity_id.draft_id = None;

                if first_non_draft_created_at_decision_time.is_none() {
                    let row = transaction
                        .as_client()
                        .query_one(
                            "
                            UPDATE entity_ids
                            SET first_non_draft_created_at_decision_time = $1,
                                first_non_draft_created_at_transaction_time = now()
                            WHERE web_id = $2
                              AND entity_uuid = $3
                            RETURNING first_non_draft_created_at_decision_time,
                                      first_non_draft_created_at_transaction_time;
                            ",
                            &[
                                &locked_row.updated_at_decision_time,
                                &params.entity_id.owned_by_id,
                                &params.entity_id.entity_uuid,
                            ],
                        )
                        .await
                        .change_context(UpdateError)?;

                    first_non_draft_created_at_decision_time = row.get(0);
                    first_non_draft_created_at_transaction_time = row.get(1);
                }

                if let Some(previous_live_entity) = transaction
                    .lock_entity_edition(params.entity_id, params.decision_time)
                    .await?
                {
                    transaction.archive_entity(previous_live_entity).await?;
                }
                transaction
                    .update_temporal_metadata(locked_row, edition_id, true)
                    .await?
            }
        };

        let validation_components = if draft {
            ValidateEntityComponents::draft()
        } else {
            ValidateEntityComponents::full()
        };

        transaction
            .validate_entity(
                actor_id,
                authorization_api,
                Consistency::FullyConsistent,
                ValidateEntityParams {
                    entity_types: EntityValidationType::ClosedSchema(Cow::Borrowed(&closed_schema)),
                    properties: Cow::Borrowed(&properties),
                    link_data: link_data.as_ref().map(Cow::Borrowed),
                    components: validation_components,
                },
            )
            .await
            .change_context(UpdateError)
            .attach(StatusCode::InvalidArgument)?;

        transaction.commit().await.change_context(UpdateError)?;

        let entity_metadata = EntityMetadata {
            record_id: EntityRecordId {
                entity_id: params.entity_id,
                edition_id,
            },
            temporal_versioning,
            entity_type_ids,
            provenance: EntityProvenanceMetadata {
                created_by_id: previous_entity.metadata.provenance.created_by_id,
                created_at_transaction_time: previous_entity
                    .metadata
                    .provenance
                    .created_at_transaction_time,
                created_at_decision_time: previous_entity
                    .metadata
                    .provenance
                    .created_at_decision_time,
                first_non_draft_created_at_decision_time,
                first_non_draft_created_at_transaction_time,
                edition: EntityEditionProvenanceMetadata {
                    created_by_id: EditionCreatedById::new(actor_id),
                },
            },
            confidence: None,
            property_confidence: HashMap::new(),
            archived,
        };
        if let Some(temporal_client) = temporal_client {
            temporal_client
                .start_update_entity_embeddings_workflow(
                    actor_id,
                    &[Entity {
                        properties,
                        link_data,
                        metadata: entity_metadata.clone(),
                    }],
                )
                .await
                .change_context(UpdateError)?;
        }
        Ok(entity_metadata)
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn update_entity_embeddings<A: AuthorizationApi + Send + Sync>(
        &mut self,
        _: AccountId,
        _: &mut A,
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
    updated_at_decision_time: Timestamp<DecisionTime>,
}

impl PostgresStore<tokio_postgres::Transaction<'_>> {
    #[tracing::instrument(level = "trace", skip(self))]
    async fn insert_entity_edition(
        &self,
        edition_created_by_id: EditionCreatedById,
        archived: bool,
        entity_type_ids: &[VersionedUrl],
        properties: &EntityProperties,
    ) -> Result<(EntityEditionId, ClosedEntityType), InsertionError> {
        let edition_id: EntityEditionId = self
            .as_client()
            .query_one(
                "
                    INSERT INTO entity_editions (
                        entity_edition_id,
                        edition_created_by_id,
                        archived,
                        properties
                    ) VALUES (gen_random_uuid(), $1, $2, $3)
                    RETURNING entity_edition_id;
                ",
                &[&edition_created_by_id, &archived, &properties],
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

        let entity_type = self
            .as_client()
            .query_raw(
                "SELECT closed_schema FROM entity_types WHERE ontology_id = ANY ($1::UUID[]);",
                &[&entity_type_ontology_ids],
            )
            .await
            .change_context(InsertionError)?
            .and_then(|row| async move { Ok(row.get::<_, Json<ClosedEntityType>>(0).0) })
            .try_collect::<ClosedEntityType>()
            .await
            .change_context(InsertionError)?;

        Ok((edition_id, entity_type))
    }

    #[tracing::instrument(level = "trace", skip(self))]
    async fn lock_entity_edition(
        &self,
        entity_id: EntityId,
        decision_time: Option<Timestamp<DecisionTime>>,
    ) -> Result<Option<LockedEntityEdition>, UpdateError> {
        let current_data = match (entity_id.draft_id, decision_time) {
            (Some(draft_id), Some(decision_time)) => {
                self.as_client()
                    .query_opt(
                        "
                            SELECT
                                entity_temporal_metadata.entity_edition_id,
                                entity_temporal_metadata.transaction_time,
                                entity_temporal_metadata.decision_time,
                                $4::timestamptz
                            FROM entity_temporal_metadata
                            WHERE entity_temporal_metadata.web_id = $1
                              AND entity_temporal_metadata.entity_uuid = $2
                              AND entity_temporal_metadata.draft_id = $3
                              AND entity_temporal_metadata.decision_time @> $4::timestamptz
                              AND entity_temporal_metadata.transaction_time @> now()
                              FOR NO KEY UPDATE NOWAIT;",
                        &[
                            &entity_id.owned_by_id,
                            &entity_id.entity_uuid,
                            &draft_id,
                            &decision_time,
                        ],
                    )
                    .await
            }
            (None, Some(decision_time)) => {
                self.as_client()
                    .query_opt(
                        "
                            SELECT
                                entity_temporal_metadata.entity_edition_id,
                                entity_temporal_metadata.transaction_time,
                                entity_temporal_metadata.decision_time,
                                $3::timestamptz
                            FROM entity_temporal_metadata
                            WHERE entity_temporal_metadata.web_id = $1
                              AND entity_temporal_metadata.entity_uuid = $2
                              AND entity_temporal_metadata.draft_id IS NULL
                              AND entity_temporal_metadata.decision_time @> $3::timestamptz
                              AND entity_temporal_metadata.transaction_time @> now()
                              FOR NO KEY UPDATE NOWAIT;",
                        &[
                            &entity_id.owned_by_id,
                            &entity_id.entity_uuid,
                            &decision_time,
                        ],
                    )
                    .await
            }
            (Some(draft_id), None) => {
                self.as_client()
                    .query_opt(
                        "
                        SELECT
                            entity_temporal_metadata.entity_edition_id,
                            entity_temporal_metadata.transaction_time,
                            entity_temporal_metadata.decision_time,
                            now()
                        FROM entity_temporal_metadata
                        WHERE entity_temporal_metadata.web_id = $1
                          AND entity_temporal_metadata.entity_uuid = $2
                          AND entity_temporal_metadata.draft_id = $3
                          AND entity_temporal_metadata.decision_time @> now()
                          AND entity_temporal_metadata.transaction_time @> now()
                          FOR NO KEY UPDATE NOWAIT;",
                        &[&entity_id.owned_by_id, &entity_id.entity_uuid, &draft_id],
                    )
                    .await
            }
            (None, None) => {
                self.as_client()
                    .query_opt(
                        "
                        SELECT
                            entity_temporal_metadata.entity_edition_id,
                            entity_temporal_metadata.transaction_time,
                            entity_temporal_metadata.decision_time,
                            now()
                        FROM entity_temporal_metadata
                        WHERE entity_temporal_metadata.web_id = $1
                          AND entity_temporal_metadata.entity_uuid = $2
                          AND entity_temporal_metadata.draft_id IS NULL
                          AND entity_temporal_metadata.decision_time @> now()
                          AND entity_temporal_metadata.transaction_time @> now()
                          FOR NO KEY UPDATE NOWAIT;",
                        &[&entity_id.owned_by_id, &entity_id.entity_uuid],
                    )
                    .await
            }
        };

        current_data
            .map(|row| {
                row.map(|row| LockedEntityEdition {
                    entity_id,
                    entity_edition_id: row.get(0),
                    transaction_time: row.get(1),
                    decision_time: row.get(2),
                    updated_at_decision_time: row.get(3),
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
        decision_time: Option<Timestamp<DecisionTime>>,
    ) -> Result<EntityTemporalMetadata, InsertionError> {
        let row = if let Some(decision_time) = decision_time {
            self.as_client()
                .query_one(
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
                        tstzrange($5, NULL, '[)'),
                        tstzrange(now(), NULL, '[)')
                    ) RETURNING decision_time, transaction_time;",
                    &[
                        &entity_id.owned_by_id,
                        &entity_id.entity_uuid,
                        &entity_id.draft_id,
                        &edition_id,
                        &decision_time,
                    ],
                )
                .await
                .change_context(InsertionError)?
        } else {
            self.as_client()
                .query_one(
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
                        tstzrange(now(), NULL, '[)'),
                        tstzrange(now(), NULL, '[)')
                    ) RETURNING decision_time, transaction_time;",
                    &[
                        &entity_id.owned_by_id,
                        &entity_id.entity_uuid,
                        &entity_id.draft_id,
                        &edition_id,
                    ],
                )
                .await
                .change_context(InsertionError)?
        };

        Ok(EntityTemporalMetadata {
            decision_time: row.get(0),
            transaction_time: row.get(1),
        })
    }

    #[tracing::instrument(level = "trace", skip(self))]
    async fn update_temporal_metadata(
        &self,
        locked_row: LockedEntityEdition,
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
                SET decision_time = tstzrange($4::timestamptz, upper(decision_time), '[)'),
                    transaction_time = tstzrange(now(), NULL, '[)'),
                    entity_edition_id = $5,
                    draft_id = NULL
                WHERE entity_temporal_metadata.web_id = $1
                  AND entity_temporal_metadata.entity_uuid = $2
                  AND entity_temporal_metadata.draft_id = $3
                  AND entity_temporal_metadata.decision_time @> $4::timestamptz
                  AND entity_temporal_metadata.transaction_time @> now()
                RETURNING decision_time, transaction_time;",
                        &[
                            &locked_row.entity_id.owned_by_id,
                            &locked_row.entity_id.entity_uuid,
                            &draft_id,
                            &locked_row.updated_at_decision_time,
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
                SET decision_time = tstzrange($4::timestamptz, upper(decision_time), '[)'),
                    transaction_time = tstzrange(now(), NULL, '[)'),
                    entity_edition_id = $5
                WHERE entity_temporal_metadata.web_id = $1
                  AND entity_temporal_metadata.entity_uuid = $2
                  AND entity_temporal_metadata.draft_id = $3
                  AND entity_temporal_metadata.decision_time @> $4::timestamptz
                  AND entity_temporal_metadata.transaction_time @> now()
                RETURNING decision_time, transaction_time;",
                        &[
                            &locked_row.entity_id.owned_by_id,
                            &locked_row.entity_id.entity_uuid,
                            &draft_id,
                            &locked_row.updated_at_decision_time,
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
                SET decision_time = tstzrange($3::timestamptz, upper(decision_time), '[)'),
                    transaction_time = tstzrange(now(), NULL, '[)'),
                    entity_edition_id = $4
                WHERE entity_temporal_metadata.web_id = $1
                  AND entity_temporal_metadata.entity_uuid = $2
                  AND entity_temporal_metadata.draft_id IS NULL
                  AND entity_temporal_metadata.decision_time @> $3::timestamptz
                  AND entity_temporal_metadata.transaction_time @> now()
                RETURNING decision_time, transaction_time;",
                    &[
                        &locked_row.entity_id.owned_by_id,
                        &locked_row.entity_id.entity_uuid,
                        &locked_row.updated_at_decision_time,
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
                    tstzrange(lower($6::tstzrange), now(), '[)')
                );",
                &[
                    &locked_row.entity_id.owned_by_id,
                    &locked_row.entity_id.entity_uuid,
                    &locked_row.entity_id.draft_id,
                    &locked_row.entity_edition_id,
                    &locked_row.decision_time,
                    &locked_row.transaction_time,
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
                    decision_time,
                    transaction_time
                ) VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    tstzrange(lower($5::tstzrange), $6, '[)'),
                    tstzrange(now(), NULL, '[)')
                );",
                &[
                    &locked_row.entity_id.owned_by_id,
                    &locked_row.entity_id.entity_uuid,
                    &locked_row.entity_id.draft_id,
                    &locked_row.entity_edition_id,
                    &locked_row.decision_time,
                    &locked_row.updated_at_decision_time,
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
        locked_row: LockedEntityEdition,
    ) -> Result<EntityTemporalMetadata, UpdateError> {
        let row = if let Some(draft_id) = locked_row.entity_id.draft_id {
            self.client
                .as_client()
                .query_one(
                    "
                UPDATE entity_temporal_metadata
                SET decision_time = tstzrange(lower(decision_time), $4::timestamptz, '[)'),
                    transaction_time = tstzrange(now(), NULL, '[)')
                WHERE entity_temporal_metadata.web_id = $1
                  AND entity_temporal_metadata.entity_uuid = $2
                  AND entity_temporal_metadata.draft_id = $3
                  AND entity_temporal_metadata.decision_time @> $4::timestamptz
                  AND entity_temporal_metadata.transaction_time @> now()
                RETURNING decision_time, transaction_time;",
                    &[
                        &locked_row.entity_id.owned_by_id,
                        &locked_row.entity_id.entity_uuid,
                        &draft_id,
                        &locked_row.updated_at_decision_time,
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
                SET decision_time = tstzrange(lower(decision_time), $3::timestamptz, '[)'),
                    transaction_time = tstzrange(now(), NULL, '[)')
                WHERE entity_temporal_metadata.web_id = $1
                  AND entity_temporal_metadata.entity_uuid = $2
                  AND entity_temporal_metadata.draft_id IS NULL
                  AND entity_temporal_metadata.decision_time @> $3::timestamptz
                  AND entity_temporal_metadata.transaction_time @> now()
                RETURNING decision_time, transaction_time;",
                    &[
                        &locked_row.entity_id.owned_by_id,
                        &locked_row.entity_id.entity_uuid,
                        &locked_row.updated_at_decision_time,
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
                    tstzrange(lower($6::tstzrange), now(), '[)')
                );",
                &[
                    &locked_row.entity_id.owned_by_id,
                    &locked_row.entity_id.entity_uuid,
                    &locked_row.entity_id.draft_id,
                    &locked_row.entity_edition_id,
                    &locked_row.decision_time,
                    &locked_row.transaction_time,
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
