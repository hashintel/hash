mod query;
mod read;
use alloc::borrow::Cow;
use core::{borrow::Borrow as _, iter::once, mem};
use std::collections::{HashMap, HashSet};

use error_stack::{FutureExt as _, Report, ResultExt as _, TryReportStreamExt as _, ensure};
use futures::{StreamExt as _, TryStreamExt as _, stream};
use hash_graph_authorization::{
    AuthorizationApi,
    backend::ModifyRelationshipOperation,
    policies::{
        Authorized, PolicyComponents, Request, RequestContext, ResourceId,
        action::ActionName,
        resource::{EntityResourceConstraint, ResourceConstraint},
        store::{PolicyCreationParams, PolicyStore as _},
    },
    schema::{EntityOwnerSubject, EntityPermission, EntityRelationAndSubject, WebPermission},
    zanzibar::Consistency,
};
use hash_graph_store::{
    entity::{
        CountEntitiesParams, CreateEntityParams, EmptyEntityTypes, EntityQueryPath,
        EntityQuerySorting, EntityStore, EntityTypeRetrieval, EntityTypesError,
        EntityValidationReport, EntityValidationType, GetEntitiesParams, GetEntitiesResponse,
        GetEntitySubgraphParams, GetEntitySubgraphResponse, PatchEntityParams, QueryConversion,
        UpdateEntityEmbeddingsParams, ValidateEntityComponents, ValidateEntityParams,
    },
    entity_type::{EntityTypeQueryPath, EntityTypeStore as _, IncludeEntityTypeOption},
    error::{InsertionError, QueryError, UpdateError},
    filter::{Filter, FilterExpression, Parameter, ParameterList},
    query::{QueryResult as _, Read, ReadPaginated, Sorting as _},
    subgraph::{
        Subgraph, SubgraphRecord as _,
        edges::{EdgeDirection, GraphResolveDepths, KnowledgeGraphEdgeKind, SharedEdgeKind},
        identifier::{EntityIdWithInterval, EntityVertexId},
        temporal_axes::{
            PinnedTemporalAxis, PinnedTemporalAxisUnresolved, QueryTemporalAxes,
            QueryTemporalAxesUnresolved, VariableAxis, VariableTemporalAxis,
            VariableTemporalAxisUnresolved,
        },
    },
};
use hash_graph_temporal_versioning::{
    ClosedTemporalBound, DecisionTime, LeftClosedTemporalInterval, LimitedTemporalBound,
    OpenTemporalBound, RightBoundedTemporalInterval, TemporalBound, TemporalTagged as _, Timestamp,
    TransactionTime,
};
use hash_graph_types::{
    Embedding,
    knowledge::{entity::EntityEmbedding, property::visitor::EntityVisitor as _},
    ontology::{DataTypeLookup, OntologyTypeProvider},
};
use hash_graph_validation::{EntityPreprocessor, Validate as _};
use hash_status::StatusCode;
use postgres_types::ToSql;
use tokio_postgres::{GenericClient as _, error::SqlState};
use tracing::Instrument as _;
use type_system::{
    knowledge::{
        Confidence, Entity, Property, PropertyValue,
        entity::{
            EntityMetadata, EntityProvenance,
            id::{DraftId, EntityEditionId, EntityId, EntityRecordId, EntityUuid},
            metadata::EntityTemporalMetadata,
            provenance::{EntityEditionProvenance, InferredEntityProvenance},
        },
        property::{
            PropertyObject, PropertyObjectWithMetadata, PropertyPath, PropertyPathError,
            PropertyValueWithMetadata, PropertyWithMetadata,
            metadata::{PropertyMetadata, PropertyObjectMetadata},
        },
    },
    ontology::{
        InheritanceDepth,
        data_type::schema::DataTypeReference,
        entity_type::{
            ClosedEntityType, ClosedMultiEntityType, EntityTypeUuid, EntityTypeWithMetadata,
        },
        id::{BaseUrl, OntologyTypeUuid, OntologyTypeVersion, VersionedUrl},
    },
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};
use uuid::Uuid;

use crate::store::{
    AsClient, PostgresStore,
    error::{DeletionError, EntityDoesNotExist, RaceConditionOnUpdate},
    postgres::{
        ResponseCountMap, TraversalContext,
        knowledge::entity::read::EntityEdgeTraversalData,
        query::{
            InsertStatementBuilder, ReferenceTable, SelectCompiler, Table,
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
    include_entity_types: Option<IncludeEntityTypeOption>,
    include_web_ids: bool,
    include_created_by_ids: bool,
    include_edition_created_by_ids: bool,
    include_type_ids: bool,
    include_type_titles: bool,
}

impl<C, A> PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    /// Internal method to read an [`Entity`] into a [`TraversalContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(
        level = "info",
        skip(self, entity_queue, traversal_context, provider, subgraph)
    )]
    #[expect(clippy::too_many_lines)]
    pub(crate) async fn traverse_entities(
        &self,
        mut entity_queue: Vec<(
            EntityVertexId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        traversal_context: &mut TraversalContext,
        provider: &StoreProvider<'_, Self>,
        subgraph: &mut Subgraph,
    ) -> Result<(), Report<QueryError>> {
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
                        provider,
                    )
                    .instrument(tracing::trace_span!("post_filter_entity_types"))
                    .await?
                    .flat_map(|edge| {
                        subgraph.insert_edge(
                            &edge.left_endpoint,
                            SharedEdgeKind::IsOfType,
                            EdgeDirection::Outgoing,
                            edge.right_endpoint.clone(),
                        );

                        traversal_context.add_entity_type_id(
                            EntityTypeUuid::from(edge.right_endpoint_ontology_id),
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
                        self.read_knowledge_edges(traversal_data, table, edge_direction, provider)
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

        self.traverse_entity_types(entity_type_queue, traversal_context, provider, subgraph)
            .await?;

        Ok(())
    }

    /// Deletes all entities from the database.
    ///
    /// This function removes all entities along with their associated metadata,
    /// including temporal data, embeddings, drafts, and relationships.
    ///
    /// # Errors
    ///
    /// Returns [`DeletionError`] if the database deletion operation fails.
    #[tracing::instrument(level = "info", skip(self))]
    pub async fn delete_entities(&self) -> Result<(), Report<DeletionError>> {
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

    async fn convert_entity_properties<P: DataTypeLookup + Sync>(
        &self,
        provider: &P,
        entity: &mut PropertyWithMetadata,
        path: &PropertyPath<'_>,
        target_data_type_id: &VersionedUrl,
    ) {
        let Ok(PropertyWithMetadata::Value(PropertyValueWithMetadata { value, metadata })) =
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
            .find_conversion(
                <&DataTypeReference>::from(&*source_data_type_id),
                <&DataTypeReference>::from(target_data_type_id),
            )
            .await
        else {
            // If no conversion is found, we can ignore the property.
            return;
        };

        let &mut PropertyValue::Number(ref mut value_number) = value else {
            // If the value is not a number, we can ignore the property.
            return;
        };

        let mut real = value_number.clone();
        for conversion in conversions.borrow() {
            real = conversion.evaluate(real);
        }
        drop(conversions);

        *value = PropertyValue::Number(real);

        metadata.data_type_id = Some(target_data_type_id.clone());
    }

    async fn convert_entity<P: DataTypeLookup + Sync>(
        &self,
        provider: &P,
        entity: &mut Entity,
        conversions: &[QueryConversion<'_>],
    ) -> Result<(), Report<PropertyPathError>> {
        let mut property = PropertyWithMetadata::Object(PropertyObjectWithMetadata::from_parts(
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

    #[tracing::instrument(level = "info", skip(self, params, policy_components))]
    #[expect(clippy::too_many_lines)]
    async fn get_entities_impl(
        &self,
        mut params: GetEntitiesImplParams<'_>,
        temporal_axes: &QueryTemporalAxes,
        policy_components: &PolicyComponents,
    ) -> Result<GetEntitiesResponse<'static>, Report<QueryError>> {
        let actor_id = policy_components
            .actor_id
            .map_or_else(ActorEntityUuid::public_actor, ActorEntityUuid::from);
        let mut root_entities = Vec::new();
        let filters: [Filter<'_, Entity>; 1] = [params.filter];

        let (
            permissions,
            count,
            web_ids,
            created_by_ids,
            edition_created_by_ids,
            type_ids,
            type_titles,
        ) = if params.include_count
            || params.include_web_ids
            || params.include_created_by_ids
            || params.include_edition_created_by_ids
            || params.include_type_ids
        {
            let mut compiler = SelectCompiler::new(Some(temporal_axes), params.include_drafts);
            let web_id_idx = compiler.add_selection_path(&EntityQueryPath::WebId);
            let entity_uuid_idx = compiler.add_selection_path(&EntityQueryPath::Uuid);
            let draft_id_idx = compiler.add_selection_path(&EntityQueryPath::DraftId);
            let provenance_idx = params
                .include_created_by_ids
                .then(|| compiler.add_selection_path(&EntityQueryPath::Provenance(None)));
            let edition_provenance_idx = params
                .include_edition_created_by_ids
                .then(|| compiler.add_selection_path(&EntityQueryPath::EditionProvenance(None)));
            let type_ids_idx = (params.include_type_ids || params.include_type_titles).then(|| {
                (
                    compiler.add_selection_path(&EntityQueryPath::TypeBaseUrls),
                    compiler.add_selection_path(&EntityQueryPath::TypeVersions),
                )
            });

            for filter in &filters {
                compiler.add_filter(filter).change_context(QueryError)?;
            }

            let (statement, parameters) = compiler.compile();

            let entities = self
                .as_client()
                .query_raw(&statement, parameters.iter().copied())
                .instrument(tracing::trace_span!("query"))
                .await
                .change_context(QueryError)?
                .map_ok(move |row| {
                    (
                        EntityId {
                            web_id: row.get(web_id_idx),
                            entity_uuid: row.get(entity_uuid_idx),
                            draft_id: row.get(draft_id_idx),
                        },
                        row,
                    )
                })
                .try_collect::<HashMap<_, _>>()
                .await
                .change_context(QueryError)?;

            let (permissions, _zookie) = self
                .authorization_api
                .check_entities_permission(
                    actor_id,
                    EntityPermission::View,
                    entities.keys().copied(),
                    Consistency::FullyConsistent,
                )
                .await
                .change_context(QueryError)?;

            let permitted_ids = permissions
                .into_iter()
                .filter_map(|(entity_id, has_permission)| has_permission.then_some(entity_id))
                .collect::<HashSet<_>>();

            let mut web_ids = params.include_web_ids.then(ResponseCountMap::default);
            let mut created_by_ids = params
                .include_created_by_ids
                .then(ResponseCountMap::default);
            let mut edition_created_by_ids = params
                .include_edition_created_by_ids
                .then(ResponseCountMap::default);
            let mut type_ids = (params.include_type_ids || params.include_type_titles)
                .then(ResponseCountMap::default);

            let count = entities
                .into_iter()
                .filter(|(entity_id, _)| permitted_ids.contains(&entity_id.entity_uuid))
                .inspect(|(entity_id, row)| {
                    if let Some(web_ids) = &mut web_ids {
                        web_ids.extend_one(entity_id.web_id);
                    }

                    if let Some((created_by_ids, provenance_idx)) =
                        created_by_ids.as_mut().zip(provenance_idx)
                    {
                        let provenance: InferredEntityProvenance = row.get(provenance_idx);
                        created_by_ids.extend_one(provenance.created_by_id);
                    }

                    if let Some((edition_created_by_ids, provenance_idx)) =
                        edition_created_by_ids.as_mut().zip(edition_provenance_idx)
                    {
                        let provenance: EntityEditionProvenance = row.get(provenance_idx);
                        edition_created_by_ids.extend_one(provenance.created_by_id);
                    }

                    if let Some((type_ids, (base_urls_idx, versions_idx))) =
                        type_ids.as_mut().zip(type_ids_idx)
                    {
                        let base_urls: Vec<BaseUrl> = row.get(base_urls_idx);
                        let versions: Vec<OntologyTypeVersion> = row.get(versions_idx);
                        type_ids.extend(
                            base_urls
                                .into_iter()
                                .zip(versions)
                                .map(|(base_url, version)| VersionedUrl { base_url, version }),
                        );
                    }
                })
                .count();
            let type_ids = type_ids.map(HashMap::from);

            let type_titles = if params.include_type_titles {
                let type_uuids = type_ids
                    .as_ref()
                    .expect("type ids should be present")
                    .keys()
                    .map(EntityTypeUuid::from_url)
                    .collect::<Vec<_>>();

                let mut type_compiler = SelectCompiler::<EntityTypeWithMetadata>::new(
                    Some(temporal_axes),
                    params.include_drafts,
                );
                let base_url_idx = type_compiler.add_selection_path(&EntityTypeQueryPath::BaseUrl);
                let version_idx = type_compiler.add_selection_path(&EntityTypeQueryPath::Version);
                let title_idx = type_compiler.add_selection_path(&EntityTypeQueryPath::Title);

                let filter = Filter::In(
                    FilterExpression::Path {
                        path: EntityTypeQueryPath::OntologyId,
                    },
                    ParameterList::EntityTypeIds(&type_uuids),
                );
                type_compiler
                    .add_filter(&filter)
                    .change_context(QueryError)?;

                let (statement, parameters) = type_compiler.compile();

                Some(
                    self.as_client()
                        .query_raw(&statement, parameters.iter().copied())
                        .instrument(tracing::trace_span!("query"))
                        .await
                        .change_context(QueryError)?
                        .map_ok(|row| {
                            (
                                VersionedUrl {
                                    base_url: row.get(base_url_idx),
                                    version: row.get(version_idx),
                                },
                                row.get::<_, String>(title_idx),
                            )
                        })
                        .try_collect::<HashMap<_, _>>()
                        .await
                        .change_context(QueryError)?,
                )
            } else {
                None
            };

            (
                Some(permitted_ids),
                params.include_count.then_some(count),
                web_ids.map(HashMap::from),
                created_by_ids.map(HashMap::from),
                edition_created_by_ids.map(HashMap::from),
                type_ids.filter(|_| params.include_type_ids),
                type_titles,
            )
        } else {
            (None, None, None, None, None, None, None)
        };

        let last = loop {
            // We query one more than requested to determine if there are more entities to return.
            let (rows, artifacts) =
                ReadPaginated::<Entity, EntityQuerySorting>::read_paginated_vec(
                    self,
                    &filters,
                    Some(temporal_axes),
                    &params.sorting,
                    params.limit,
                    params.include_drafts,
                )
                .await?;
            let entities = rows
                .into_iter()
                .map(|row| (row.decode_record(&artifacts), row))
                .collect::<Vec<_>>();
            if let Some(cursor) = entities
                .last()
                .map(|(_, row)| row.decode_cursor(&artifacts))
            {
                params.sorting.set_cursor(cursor);
            }

            let num_returned_entities = entities.len();

            let permitted_ids = if let Some(permitted_ids) = &permissions {
                Cow::<HashSet<EntityUuid>>::Borrowed(permitted_ids)
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

                let (permissions, _zookie) = self
                    .authorization_api
                    .check_entities_permission(
                        actor_id,
                        EntityPermission::View,
                        filtered_ids,
                        Consistency::FullyConsistent,
                    )
                    .await
                    .change_context(QueryError)?;

                Cow::Owned(
                    permissions
                        .into_iter()
                        .filter_map(|(entity_id, has_permission)| {
                            has_permission.then_some(entity_id)
                        })
                        .collect::<HashSet<_>>(),
                )
            };

            root_entities.extend(entities.into_iter().filter(|(entity, _)| {
                permitted_ids.contains(&entity.metadata.record_id.entity_id.entity_uuid)
            }));

            if let Some(limit) = params.limit {
                if num_returned_entities < limit {
                    // When the returned entities are less than the requested amount we know
                    // that there are no more entities to return.
                    break None;
                }
                if root_entities.len() == limit {
                    // The requested limit is reached, so we can stop here.
                    break root_entities
                        .last()
                        .map(|(_, row)| row.decode_cursor(&artifacts));
                }
            } else {
                // Without a limit all entities are returned.
                break None;
            }
        };

        Ok(GetEntitiesResponse {
            #[expect(
                clippy::if_then_some_else_none,
                reason = "False positive, use of `await`"
            )]
            closed_multi_entity_types: if params.include_entity_types.is_some() {
                Some(
                    self.get_closed_multi_entity_types(
                        actor_id,
                        root_entities
                            .iter()
                            .map(|(entity, _)| entity.metadata.entity_type_ids.clone()),
                        QueryTemporalAxesUnresolved::DecisionTime {
                            pinned: PinnedTemporalAxisUnresolved::new(None),
                            variable: VariableTemporalAxisUnresolved::new(None, None),
                        },
                        None,
                    )
                    .await?
                    .entity_types,
                )
            } else {
                None
            },
            definitions: match params.include_entity_types {
                Some(
                    IncludeEntityTypeOption::Resolved
                    | IncludeEntityTypeOption::ResolvedWithDataTypeChildren,
                ) => {
                    let entity_type_uuids = root_entities
                        .iter()
                        .flat_map(|(entity, _)| {
                            entity
                                .metadata
                                .entity_type_ids
                                .iter()
                                .map(EntityTypeUuid::from_url)
                        })
                        .collect::<HashSet<_>>()
                        .into_iter()
                        .collect::<Vec<_>>();
                    Some(
                        self.get_entity_type_resolve_definitions(
                            actor_id,
                            &entity_type_uuids,
                            params.include_entity_types
                                == Some(IncludeEntityTypeOption::ResolvedWithDataTypeChildren),
                        )
                        .await?,
                    )
                }
                None | Some(IncludeEntityTypeOption::Closed) => None,
            },
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
            type_titles,
        })
    }
}

impl<C, A> EntityStore for PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    #[tracing::instrument(level = "info", skip(self, params))]
    #[expect(clippy::too_many_lines)]
    async fn create_entities<R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: Vec<CreateEntityParams<R>>,
    ) -> Result<Vec<Entity>, Report<InsertionError>>
    where
        R: IntoIterator<Item = EntityRelationAndSubject> + Send + Sync,
    {
        let transaction_time = Timestamp::<TransactionTime>::now().remove_nanosecond();
        let mut relationships = Vec::with_capacity(params.len());
        let mut entity_type_id_set = HashSet::new();
        let mut checked_web_ids = HashSet::new();
        let mut entity_edition_ids = Vec::with_capacity(params.len());

        let mut entity_id_rows = Vec::with_capacity(params.len());
        let mut entity_draft_rows = Vec::new();
        let mut entity_edition_rows = Vec::with_capacity(params.len());
        let mut entity_temporal_metadata_rows = Vec::with_capacity(params.len());
        let mut entity_is_of_type_rows = Vec::with_capacity(params.len());
        let mut entity_has_left_entity_rows = Vec::new();
        let mut entity_has_right_entity_rows = Vec::new();

        let mut policies = Vec::new();

        let mut entities = Vec::with_capacity(params.len());
        // TODO: There are expected to be duplicates but we currently don't have a way to identify
        //       multi-type entity types. We need a way to speed this up.
        let mut validation_params = Vec::with_capacity(params.len());

        let mut transaction = self.transaction().await.change_context(InsertionError)?;

        let policy_components = PolicyComponents::builder(&transaction)
            .with_actor(actor_id)
            .with_entity_type_ids(
                params
                    .iter()
                    .flat_map(|params| &params.entity_type_ids)
                    .collect::<HashSet<_>>(),
            )
            .with_action(ActionName::Instantiate)
            .await
            .change_context(InsertionError)?;

        let validator_provider = StoreProvider::new(&transaction, &policy_components);

        let mut validation_reports = HashMap::<usize, EntityValidationReport>::new();
        for (index, mut params) in params.into_iter().enumerate() {
            let entity_type = ClosedMultiEntityType::from_multi_type_closed_schema(
                stream::iter(&params.entity_type_ids)
                    .then(|entity_type_url| async {
                        OntologyTypeProvider::<ClosedEntityType>::provide_type(
                            &validator_provider,
                            entity_type_url,
                        )
                        .await
                        .map(|entity_type| ClosedEntityType::clone(&*entity_type))
                    })
                    .try_collect::<Vec<ClosedEntityType>>()
                    .await
                    .change_context(InsertionError)?
                    .into_iter()
                    .inspect(|entity_type| {
                        if !entity_type_id_set.contains(&entity_type.id) {
                            entity_type_id_set.insert(entity_type.id.clone());
                            for parent in &entity_type.all_of {
                                if !entity_type_id_set.contains(&parent.id) {
                                    entity_type_id_set.insert(parent.id.clone());
                                }
                            }
                        }
                    }),
            )
            .change_context(InsertionError)?;

            let mut preprocessor = EntityPreprocessor {
                components: if params.draft {
                    ValidateEntityComponents::draft()
                } else {
                    ValidateEntityComponents::full()
                },
            };
            preprocessor.components.link_validation = transaction.settings.validate_links;

            if let Err(property_validation) = preprocessor
                .visit_object(&entity_type, &mut params.properties, &validator_provider)
                .await
            {
                validation_reports.entry(index).or_default().properties =
                    property_validation.properties;
            }

            let (properties, property_metadata) = params.properties.into_parts();

            let decision_time = params
                .decision_time
                .map_or_else(|| transaction_time.cast(), Timestamp::remove_nanosecond);
            let entity_id = EntityId {
                web_id: params.web_id,
                entity_uuid: params
                    .entity_uuid
                    .unwrap_or_else(|| EntityUuid::new(Uuid::new_v4())),
                draft_id: params.draft.then(|| DraftId::new(Uuid::new_v4())),
            };

            if entity_id.entity_uuid != entity_id.web_id.into() {
                checked_web_ids.insert(entity_id.web_id);
            }

            let entity_provenance = EntityProvenance {
                inferred: InferredEntityProvenance {
                    created_by_id: actor_id,
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
                    created_by_id: actor_id,
                    archived_by_id: None,
                    provided: params.provenance,
                },
            };
            entity_id_rows.push(EntityIdRow {
                web_id: entity_id.web_id,
                entity_uuid: entity_id.entity_uuid,
                provenance: entity_provenance.inferred.clone(),
            });
            if let Some(draft_id) = entity_id.draft_id {
                entity_draft_rows.push(EntityDraftRow {
                    web_id: entity_id.web_id,
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
            entity_edition_ids.push(entity_edition_id);

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
                web_id: entity_id.web_id,
                entity_uuid: entity_id.entity_uuid,
                draft_id: entity_id.draft_id,
                entity_edition_id,
                decision_time: temporal_versioning.decision_time,
                transaction_time: temporal_versioning.transaction_time,
            });

            for entity_type in &entity_type.all_of {
                let entity_type_id = EntityTypeUuid::from_url(&entity_type.id);
                entity_is_of_type_rows.push(EntityIsOfTypeRow {
                    entity_edition_id,
                    entity_type_ontology_id: entity_type_id,
                    inheritance_depth: InheritanceDepth::new(0),
                });
            }

            let link_data = params.link_data.inspect(|link_data| {
                entity_has_left_entity_rows.push(EntityHasLeftEntityRow {
                    web_id: entity_id.web_id,
                    entity_uuid: entity_id.entity_uuid,
                    left_web_id: link_data.left_entity_id.web_id,
                    left_entity_uuid: link_data.left_entity_id.entity_uuid,
                    confidence: link_data.left_entity_confidence,
                    provenance: link_data.left_entity_provenance.clone(),
                });
                entity_has_right_entity_rows.push(EntityHasRightEntityRow {
                    web_id: entity_id.web_id,
                    entity_uuid: entity_id.entity_uuid,
                    right_web_id: link_data.right_entity_id.web_id,
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

            validation_params.push((entity_type, preprocessor.components));

            let current_num_relationships = relationships.len();
            relationships.extend(
                params
                    .relationships
                    .into_iter()
                    .chain(once(EntityRelationAndSubject::Owner {
                        subject: EntityOwnerSubject::Web { id: params.web_id },
                        level: 0,
                    }))
                    .map(|relation_and_subject| (entity_id, relation_and_subject)),
            );
            if relationships.len() == current_num_relationships {
                return Err(Report::new(InsertionError)
                    .attach_printable("At least one relationship must be provided"));
            }
            policies.extend(
                params
                    .policies
                    .into_iter()
                    .map(|policy| PolicyCreationParams {
                        name: Some(policy.name),
                        effect: policy.effect,
                        principal: policy.principal,
                        actions: policy.actions,
                        resource: Some(ResourceConstraint::Entity(
                            EntityResourceConstraint::Exact {
                                id: entity_id.entity_uuid,
                            },
                        )),
                    }),
            );
        }

        let mut forbidden_instantiations = Vec::new();
        for entity_type_id in &entity_type_id_set {
            match policy_components
                .policy_set
                .evaluate(
                    &Request {
                        actor: policy_components.actor_id,
                        action: ActionName::Instantiate,
                        resource: &ResourceId::EntityType(Cow::Borrowed(entity_type_id.into())),
                        context: RequestContext::default(),
                    },
                    &policy_components.context,
                )
                .change_context(InsertionError)?
            {
                Authorized::Always => {}
                Authorized::Never => {
                    forbidden_instantiations.push(entity_type_id);
                }
            }
        }

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
            let (create_entity_permissions, _zookie) = transaction
                .authorization_api
                .check_webs_permission(
                    actor_id,
                    WebPermission::CreateEntity,
                    checked_web_ids,
                    Consistency::FullyConsistent,
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
            .as_client()
            .query(
                "
                    INSERT INTO entity_is_of_type
                    SELECT entity_edition_id,
                        target_entity_type_ontology_id AS entity_type_ontology_id,
                        MIN(entity_type_inherits_from.depth + 1) AS inheritance_depth
                    FROM entity_is_of_type
                    JOIN entity_type_inherits_from
                        ON entity_type_ontology_id = source_entity_type_ontology_id
                    WHERE entity_edition_id = ANY($1)
                    GROUP BY entity_edition_id, target_entity_type_ontology_id;
                ",
                &[&entity_edition_ids],
            )
            .await
            .change_context(InsertionError)?;

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

        for (index, (entity, (schema, components))) in
            entities.iter().zip(validation_params).enumerate()
        {
            let validation_report = entity
                .validate(&schema, components, &validator_provider)
                .await;
            if !validation_report.is_valid() {
                let report = validation_reports.entry(index).or_default();
                report.link = validation_report.link;
                report.metadata.properties = validation_report.property_metadata;
            }
        }

        for policy in policies {
            transaction
                .create_policy(actor_id.into(), policy)
                .await
                .change_context(InsertionError)?;
        }

        ensure!(
            validation_reports.is_empty(),
            Report::new(InsertionError).attach(validation_reports)
        );

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
            if !self.settings.skip_embedding_creation
                && let Some(temporal_client) = &self.temporal_client
            {
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
        actor_id: ActorEntityUuid,
        consistency: Consistency<'_>,
        params: Vec<ValidateEntityParams<'_>>,
    ) -> Result<HashMap<usize, EntityValidationReport>, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .await
            .change_context(QueryError)?;

        let mut validation_reports = HashMap::<usize, EntityValidationReport>::new();

        let validator_provider = StoreProvider::new(self, &policy_components);

        for (index, mut params) in params.into_iter().enumerate() {
            let mut validation_report = EntityValidationReport::default();

            let schema = match params.entity_types {
                EntityValidationType::ClosedSchema(schema) => schema,
                EntityValidationType::Id(entity_type_urls) => {
                    let entity_type = stream::iter(entity_type_urls.as_ref())
                        .then(|entity_type_url| {
                            OntologyTypeProvider::<ClosedEntityType>::provide_type(
                                &validator_provider,
                                entity_type_url,
                            )
                            .change_context_lazy(|| {
                                EntityTypeRetrieval {
                                    entity_type_url: entity_type_url.clone(),
                                }
                            })
                        })
                        .map_ok(|entity_type| (*entity_type).clone())
                        .try_collect_reports::<Vec<ClosedEntityType>>()
                        .await
                        .map_err(EntityTypesError::EntityTypeRetrieval)
                        .and_then(|entity_types| {
                            ClosedMultiEntityType::from_multi_type_closed_schema(entity_types)
                                .map_err(EntityTypesError::ResolveClosedEntityType)
                        });
                    match entity_type {
                        Ok(entity_type) => Cow::Owned(entity_type),
                        Err(error) => {
                            validation_report.metadata.entity_types = Some(error);
                            validation_reports.insert(index, validation_report);
                            continue;
                        }
                    }
                }
            };

            if schema.all_of.is_empty() {
                validation_report.metadata.entity_types =
                    Some(EntityTypesError::Empty(Report::new(EmptyEntityTypes)));
            }

            let mut preprocessor = EntityPreprocessor {
                components: params.components,
            };

            if let Err(property_validation) = preprocessor
                .visit_object(
                    schema.as_ref(),
                    params.properties.to_mut(),
                    &validator_provider,
                )
                .await
            {
                validation_report.properties = property_validation.properties;
            }

            validation_report.link = params
                .link_data
                .as_deref()
                .validate(&schema, params.components, &validator_provider)
                .await;

            if !validation_report.is_valid() {
                validation_reports.insert(index, validation_report);
            }
        }

        Ok(validation_reports)
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn get_entities(
        &self,
        actor_id: ActorEntityUuid,
        mut params: GetEntitiesParams<'_>,
    ) -> Result<GetEntitiesResponse<'static>, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .await
            .change_context(QueryError)?;

        let provider = StoreProvider::new(self, &policy_components);

        params
            .filter
            .convert_parameters(&provider)
            .await
            .change_context(QueryError)?;

        let temporal_axes = params.temporal_axes.resolve();

        let mut response = self
            .get_entities_impl(
                GetEntitiesImplParams {
                    filter: params.filter,
                    sorting: params.sorting,
                    limit: params.limit,
                    include_drafts: params.include_drafts,
                    include_count: params.include_count,
                    include_entity_types: params.include_entity_types,
                    include_web_ids: params.include_web_ids,
                    include_created_by_ids: params.include_created_by_ids,
                    include_edition_created_by_ids: params.include_edition_created_by_ids,
                    include_type_ids: params.include_type_ids,
                    include_type_titles: params.include_type_titles,
                },
                &temporal_axes,
                &policy_components,
            )
            .await?;

        if !params.conversions.is_empty() {
            for entity in &mut response.entities {
                self.convert_entity(&provider, entity, &params.conversions)
                    .await
                    .change_context(QueryError)?;
            }
        }

        Ok(response)
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    #[expect(clippy::too_many_lines)]
    async fn get_entity_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        mut params: GetEntitySubgraphParams<'_>,
    ) -> Result<GetEntitySubgraphResponse<'static>, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .await
            .change_context(QueryError)?;

        let provider = StoreProvider::new(self, &policy_components);

        params
            .filter
            .convert_parameters(&provider)
            .await
            .change_context(QueryError)?;

        let unresolved_temporal_axes = params.temporal_axes;
        let temporal_axes = unresolved_temporal_axes.clone().resolve();

        let time_axis = temporal_axes.variable_time_axis();

        let GetEntitiesResponse {
            entities: root_entities,
            cursor,
            count,
            closed_multi_entity_types: _,
            definitions: _,
            web_ids,
            created_by_ids,
            edition_created_by_ids,
            type_ids,
            type_titles,
        } = self
            .get_entities_impl(
                GetEntitiesImplParams {
                    filter: params.filter,
                    sorting: params.sorting,
                    limit: params.limit,
                    include_drafts: params.include_drafts,
                    include_count: params.include_count,
                    include_entity_types: None,
                    include_web_ids: params.include_web_ids,
                    include_created_by_ids: params.include_created_by_ids,
                    include_edition_created_by_ids: params.include_edition_created_by_ids,
                    include_type_ids: params.include_type_ids,
                    include_type_titles: params.include_type_titles,
                },
                &temporal_axes,
                &policy_components,
            )
            .await?;

        let mut subgraph = Subgraph::new(
            params.graph_resolve_depths,
            unresolved_temporal_axes,
            temporal_axes,
        );

        async move {
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

            // TODO: We currently pass in the subgraph as mutable reference, thus we cannot borrow
            // the       vertices and have to `.collect()` the keys.
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
                &provider,
                &mut subgraph,
            )
            .await?;

            traversal_context
                .read_traversed_vertices(self, &mut subgraph, params.include_drafts)
                .await?;

            if !params.conversions.is_empty() {
                for entity in subgraph.vertices.entities.values_mut() {
                    self.convert_entity(&provider, entity, &params.conversions)
                        .await
                        .change_context(QueryError)?;
                }
            }

            Ok(GetEntitySubgraphResponse {
                #[expect(
                    clippy::if_then_some_else_none,
                    reason = "False positive, use of `await`"
                )]
                closed_multi_entity_types: if params.include_entity_types.is_some() {
                    Some(
                        self.get_closed_multi_entity_types(
                            actor_id,
                            subgraph
                                .vertices
                                .entities
                                .values()
                                .map(|entity| entity.metadata.entity_type_ids.clone()),
                            QueryTemporalAxesUnresolved::DecisionTime {
                                pinned: PinnedTemporalAxisUnresolved::new(None),
                                variable: VariableTemporalAxisUnresolved::new(None, None),
                            },
                            None,
                        )
                        .await?
                        .entity_types,
                    )
                } else {
                    None
                },
                definitions: match params.include_entity_types {
                    Some(
                        IncludeEntityTypeOption::Resolved
                        | IncludeEntityTypeOption::ResolvedWithDataTypeChildren,
                    ) => {
                        let entity_type_uuids = subgraph
                            .vertices
                            .entities
                            .values()
                            .flat_map(|entity| {
                                entity
                                    .metadata
                                    .entity_type_ids
                                    .iter()
                                    .map(EntityTypeUuid::from_url)
                            })
                            .collect::<HashSet<_>>()
                            .into_iter()
                            .collect::<Vec<_>>();
                        Some(
                            self.get_entity_type_resolve_definitions(
                                actor_id,
                                &entity_type_uuids,
                                params.include_entity_types
                                    == Some(IncludeEntityTypeOption::ResolvedWithDataTypeChildren),
                            )
                            .await?,
                        )
                    }
                    None | Some(IncludeEntityTypeOption::Closed) => None,
                },
                subgraph,
                cursor,
                count,
                web_ids,
                created_by_ids,
                edition_created_by_ids,
                type_ids,
                type_titles,
            })
        }
        .instrument(tracing::trace_span!("construct_subgraph"))
        .await
    }

    async fn count_entities(
        &self,
        actor_id: ActorEntityUuid,
        mut params: CountEntitiesParams<'_>,
    ) -> Result<usize, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .await
            .change_context(QueryError)?;

        let provider = StoreProvider::new(self, &policy_components);

        params
            .filter
            .convert_parameters(&provider)
            .await
            .change_context(QueryError)?;

        let temporal_axes = params.temporal_axes.resolve();

        let entity_ids = Read::<Entity>::read(
            self,
            &[params.filter],
            Some(&temporal_axes),
            params.include_drafts,
        )
        .await?
        .map_ok(|entity| entity.metadata.record_id.entity_id)
        .try_collect::<Vec<_>>()
        .await?;

        let permitted_ids = self
            .authorization_api
            .check_entities_permission(
                actor_id,
                EntityPermission::View,
                entity_ids.iter().copied(),
                Consistency::FullyConsistent,
            )
            .instrument(tracing::trace_span!("post_filter_entities"))
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
        actor_id: ActorEntityUuid,
        entity_id: EntityId,
        transaction_time: Option<Timestamp<TransactionTime>>,
        decision_time: Option<Timestamp<DecisionTime>>,
    ) -> Result<Entity, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .await
            .change_context(QueryError)?;

        let provider = StoreProvider::new(self, &policy_components);

        provider
            .store
            .authorization_api
            .check_entity_permission(
                policy_components
                    .actor_id
                    .map_or_else(ActorEntityUuid::public_actor, ActorEntityUuid::from),
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
            &[Filter::for_entity_by_entity_id(entity_id)],
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
    #[expect(clippy::too_many_lines)]
    async fn patch_entity(
        &mut self,
        actor_id: ActorEntityUuid,
        mut params: PatchEntityParams,
    ) -> Result<Entity, Report<UpdateError>> {
        let transaction_time = Timestamp::now().remove_nanosecond();
        let decision_time = params
            .decision_time
            .map_or_else(|| transaction_time.cast(), Timestamp::remove_nanosecond);

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
            &[Filter::Equal(
                Some(FilterExpression::Path {
                    path: EntityQueryPath::EditionId,
                }),
                Some(FilterExpression::Parameter {
                    parameter: Parameter::Uuid(locked_row.entity_edition_id.into_uuid()),
                    convert: None,
                }),
            )],
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

        let policy_components = PolicyComponents::builder(&transaction)
            .with_actor(actor_id)
            .with_entity_edition_id(previous_entity.metadata.record_id.edition_id)
            .with_entity_type_ids(&params.entity_type_ids)
            .with_action(ActionName::Instantiate)
            .await
            .change_context(UpdateError)?;

        let validator_provider = StoreProvider::new(&transaction, &policy_components);

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
        let (entity_type_ids, affected_type_ids) = if params.entity_type_ids.is_empty() {
            (previous_entity.metadata.entity_type_ids, Vec::new())
        } else {
            let added_types = previous_entity
                .metadata
                .entity_type_ids
                .difference(&params.entity_type_ids);
            let removed_types = params
                .entity_type_ids
                .difference(&previous_entity.metadata.entity_type_ids);

            let mut affected_type_id_set = HashSet::new();
            for entity_type_id in added_types.chain(removed_types) {
                let entity_type = OntologyTypeProvider::<ClosedEntityType>::provide_type(
                    &validator_provider,
                    entity_type_id,
                )
                .await
                .change_context(UpdateError)?;

                if !affected_type_id_set.contains(&entity_type.id) {
                    affected_type_id_set.insert(entity_type.id.clone());
                    for parent in &entity_type.all_of {
                        if !affected_type_id_set.contains(&parent.id) {
                            affected_type_id_set.insert(parent.id.clone());
                        }
                    }
                }
            }

            (
                params.entity_type_ids,
                affected_type_id_set.into_iter().collect(),
            )
        };

        if !affected_type_ids.is_empty() {
            let mut forbidden_instantiations = Vec::new();
            for entity_type_id in &affected_type_ids {
                match policy_components
                    .policy_set
                    .evaluate(
                        &Request {
                            actor: policy_components.actor_id,
                            action: ActionName::Instantiate,
                            resource: &ResourceId::EntityType(Cow::Borrowed(entity_type_id.into())),
                            context: RequestContext::default(),
                        },
                        &policy_components.context,
                    )
                    .change_context(UpdateError)?
                {
                    Authorized::Always => {}
                    Authorized::Never => {
                        forbidden_instantiations.push(entity_type_id);
                    }
                }
            }

            if !forbidden_instantiations.is_empty() {
                return Err(Report::new(UpdateError)
                    .attach(StatusCode::PermissionDenied)
                    .attach_printable(
                        "The actor does not have permission to instantiate one or more entity \
                         types",
                    )
                    .attach_printable(
                        forbidden_instantiations
                            .into_iter()
                            .map(ToString::to_string)
                            .collect::<Vec<_>>()
                            .join(", "),
                    ));
            }
        }

        let previous_properties = previous_entity.properties.clone();
        let previous_property_metadata = previous_entity.metadata.properties.clone();

        let mut properties_with_metadata = PropertyWithMetadata::from_parts(
            Property::Object(previous_entity.properties),
            Some(PropertyMetadata::Object(PropertyObjectMetadata {
                value: previous_entity.metadata.properties.value,
                metadata: previous_entity.metadata.properties.metadata,
            })),
        )
        .change_context(UpdateError)?;
        properties_with_metadata
            .patch(params.properties)
            .change_context(UpdateError)?;

        let entity_type = ClosedMultiEntityType::from_multi_type_closed_schema(
            stream::iter(&entity_type_ids)
                .then(|entity_type_url| async {
                    OntologyTypeProvider::<ClosedEntityType>::provide_type(
                        &validator_provider,
                        entity_type_url,
                    )
                    .await
                    .map(|entity_type| (*entity_type).clone())
                })
                .try_collect::<Vec<ClosedEntityType>>()
                .await
                .change_context(UpdateError)?,
        )
        .change_context(UpdateError)?;

        let mut validation_components = if draft {
            ValidateEntityComponents::draft()
        } else {
            ValidateEntityComponents::full()
        };
        validation_components.link_validation = transaction.settings.validate_links;

        let mut validation_report = EntityValidationReport::default();
        let (properties, property_metadata) =
            if let PropertyWithMetadata::Object(mut object) = properties_with_metadata {
                let mut preprocessor = EntityPreprocessor {
                    components: validation_components,
                };
                if let Err(property_validation) = preprocessor
                    .visit_object(&entity_type, &mut object, &validator_provider)
                    .await
                {
                    validation_report.properties = property_validation.properties;
                }

                let (properties, property_metadata) = object.into_parts();
                (properties, property_metadata)
            } else {
                unreachable!("patching should not change the property type");
            };

        #[expect(clippy::needless_collect, reason = "Will be used later")]
        let diff = previous_properties
            .diff(&properties, &mut PropertyPath::default())
            .collect::<Vec<_>>();

        if diff.is_empty()
            && was_draft_before == draft
            && archived == previous_entity.metadata.archived
            && affected_type_ids.is_empty()
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
            created_by_id: actor_id,
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
                            &params.entity_id.web_id,
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
                                &params.entity_id.web_id,
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

        let post_validation_report = entities[0]
            .validate(&entity_type, validation_components, &validator_provider)
            .await;
        validation_report.link = post_validation_report.link;
        validation_report.metadata.properties = post_validation_report.property_metadata;

        ensure!(
            validation_report.is_valid(),
            Report::new(UpdateError).attach(HashMap::from([(0_usize, validation_report)]))
        );

        transaction.commit().await.change_context(UpdateError)?;

        if !self.settings.skip_embedding_creation
            && let Some(temporal_client) = &self.temporal_client
        {
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
        _: ActorEntityUuid,
        params: UpdateEntityEmbeddingsParams<'_>,
    ) -> Result<(), Report<UpdateError>> {
        #[derive(Debug, ToSql)]
        #[postgres(name = "entity_embeddings")]
        pub struct EntityEmbeddingsRow<'a> {
            web_id: WebId,
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
                web_id: params.entity_id.web_id,
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
                            &params.entity_id.web_id,
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
                            &params.entity_id.web_id,
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

    #[tracing::instrument(level = "info", skip(self))]
    async fn reindex_entity_cache(&mut self) -> Result<(), Report<UpdateError>> {
        tracing::info!("Reindexing entity cache");
        let transaction = self.transaction().await.change_context(UpdateError)?;

        // We remove the data from the reference tables first
        transaction
            .as_client()
            .simple_query(
                "
                    DELETE FROM entity_is_of_type WHERE inheritance_depth > 0;

                    INSERT INTO entity_is_of_type
                    SELECT entity_edition_id,
                           target_entity_type_ontology_id AS entity_type_ontology_id,
                           MIN(entity_type_inherits_from.depth + 1) AS inheritance_depth
                      FROM entity_is_of_type
                      JOIN entity_type_inherits_from
                        ON entity_type_ontology_id = source_entity_type_ontology_id
                     GROUP BY entity_edition_id, target_entity_type_ontology_id;
                ",
            )
            .await
            .change_context(UpdateError)?;

        transaction.commit().await.change_context(UpdateError)?;

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
    #[tracing::instrument(level = "trace", skip(self, entity_type_ids))]
    async fn insert_entity_edition(
        &self,
        archived: bool,
        entity_type_ids: impl IntoIterator<Item = &VersionedUrl> + Send,
        properties: &PropertyObject,
        confidence: Option<Confidence>,
        provenance: &EntityEditionProvenance,
        metadata: &PropertyObjectMetadata,
    ) -> Result<EntityEditionId, Report<InsertionError>> {
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
            .into_iter()
            .map(|entity_type_id| OntologyTypeUuid::from(EntityTypeUuid::from_url(entity_type_id)))
            .collect::<Vec<_>>();

        self.as_client()
            .query(
                "
                    INSERT INTO entity_is_of_type (
                        entity_edition_id,
                        entity_type_ontology_id,
                        inheritance_depth
                    ) SELECT $1, UNNEST($2::UUID[]), 0;
                ",
                &[&edition_id, &entity_type_ontology_ids],
            )
            .await
            .change_context(InsertionError)?;
        self.as_client()
            .query(
                "
                    INSERT INTO entity_is_of_type
                    SELECT entity_edition_id,
                           target_entity_type_ontology_id AS entity_type_ontology_id,
                           MIN(entity_type_inherits_from.depth + 1) AS inheritance_depth
                      FROM entity_is_of_type
                      JOIN entity_type_inherits_from
                        ON entity_type_ontology_id = source_entity_type_ontology_id
                     WHERE entity_edition_id = $1
                     GROUP BY entity_edition_id, target_entity_type_ontology_id;
                ",
                &[&edition_id],
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
    ) -> Result<Option<LockedEntityEdition>, Report<UpdateError>> {
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
                        &entity_id.web_id,
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
                        &entity_id.web_id,
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
    ) -> Result<EntityTemporalMetadata, Report<InsertionError>> {
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
                    &entity_id.web_id,
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
    #[expect(clippy::too_many_lines)]
    async fn update_temporal_metadata(
        &self,
        locked_row: LockedEntityEdition,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
        entity_edition_id: EntityEditionId,
        undraft: bool,
    ) -> Result<EntityTemporalMetadata, Report<UpdateError>> {
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
                            &locked_row.entity_id.web_id,
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
                            &locked_row.entity_id.web_id,
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
                        &locked_row.entity_id.web_id,
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
                    &locked_row.entity_id.web_id,
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
                    &locked_row.entity_id.web_id,
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
        actor_id: ActorEntityUuid,
        locked_row: LockedEntityEdition,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
    ) -> Result<EntityTemporalMetadata, Report<UpdateError>> {
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
                        &locked_row.entity_id.web_id,
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
                        &locked_row.entity_id.web_id,
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
                    &locked_row.entity_id.web_id,
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
                &[&locked_row.entity_edition_id, &actor_id],
            )
            .await
            .change_context(UpdateError)?;

        Ok(EntityTemporalMetadata {
            decision_time: row.get(0),
            transaction_time: row.get(1),
        })
    }
}
