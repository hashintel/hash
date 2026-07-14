mod delete;
pub(crate) mod provenance;
mod query;
mod read;
mod summary;

use alloc::borrow::Cow;
use core::{any::Any, borrow::Borrow as _, fmt, mem};
use std::collections::{HashMap, HashSet};

use error_stack::{FutureExt as _, Report, ResultExt as _, TryReportStreamExt as _, ensure};
use futures::{StreamExt as _, TryStreamExt as _, stream};
use hash_codec::numeric::Real;
use hash_graph_authorization::policies::{
    Authorized, MergePolicies, PolicyComponents, Request, RequestContext, ResourceId,
    action::ActionName,
    principal::actor::AuthenticatedActor,
    resource::{EntityResourceConstraint, ResourceConstraint},
    store::{PolicyCreationParams, PrincipalStore as _},
};
use hash_graph_embeddings::{Dimension, clustering::Clustering};
use hash_graph_store::{
    entity::{
        ClusterEntitiesParams, ClusterEntitiesResponse, CreateEntityParams, DeleteEntitiesParams,
        DeletionSummary, EmptyEntityTypes, EntityCluster, EntityPermissions, EntityQueryCursor,
        EntityQueryPath, EntityQuerySorting, EntityStore, EntityTypeRetrieval, EntityTypesError,
        EntityValidationReport, EntityValidationType, HasPermissionForEntitiesParams,
        PatchEntityParams, QueryConversion, QueryEntitiesParams, QueryEntitiesResponse,
        QueryEntitySubgraphParams, QueryEntitySubgraphResponse, SearchEntitiesFilter,
        SearchEntitiesParams, SearchEntitiesResponse, SummarizeEntitiesParams,
        SummarizeEntitiesResponse, UpdateEntityEmbeddingsParams, ValidateEntityComponents,
        ValidateEntityParams,
    },
    entity_type::{EntityTypeStore as _, IncludeEntityTypeOption},
    error::{
        CheckPermissionError, ClusterError, DeletionError, InsertionError, QueryError, UpdateError,
    },
    filter::{
        Filter, FilterExpression, FilterExpressionList, Parameter, ParameterList,
        protection::transform_filter,
    },
    query::{QueryResult as _, Read},
    subgraph::{
        Subgraph, SubgraphRecord as _,
        edges::{
            BorrowedTraversalParams, EdgeDirection, EntityTraversalEdge, EntityTraversalEdgeKind,
            GraphResolveDepths, SharedEdgeKind, SubgraphTraversalParams, TraversalEdge,
        },
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
    knowledge::property::visitor::EntityVisitor as _,
    ontology::{DataTypeLookup, OntologyTypeProvider},
};
use hash_graph_validation::{EntityPreprocessor, Validate as _};
use hash_status::StatusCode;
use postgres_types::ToSql;
use tokio::sync::oneshot;
use tokio_postgres::{GenericClient as _, error::SqlState};
use tracing::Instrument as _;
use type_system::{
    knowledge::{
        Confidence, Entity, Property, PropertyValue,
        entity::{
            EntityMetadata, EntityProvenance,
            id::{DraftId, EntityEditionId, EntityId, EntityRecordId, EntityUuid},
            metadata::EntityTemporalMetadata,
            provenance::EntityEditionProvenance,
        },
        property::{
            PropertyObject, PropertyObjectWithMetadata, PropertyPath, PropertyPathError,
            PropertyValueWithMetadata, PropertyWithMetadata,
            metadata::{PropertyMetadata, PropertyObjectMetadata, PropertyProvenance},
        },
    },
    ontology::{
        InheritanceDepth,
        data_type::schema::DataTypeReference,
        entity_type::{ClosedEntityType, ClosedMultiEntityType, EntityTypeUuid},
        id::{OntologyTypeUuid, VersionedUrl},
    },
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};
use uuid::Uuid;

use crate::store::{
    AsClient, PostgresStore,
    error::{EntityDoesNotExist, RaceConditionOnUpdate},
    postgres::{
        TraversalContext,
        crud::{QueryIndices, TypedRow},
        knowledge::entity::{
            provenance::{SqlEntityEditionProvenance, SqlEntityProvenance},
            read::EntityEdgeTraversalData,
            summary::{Deduplication, EntitySummaryQuery},
        },
        query::{
            Distinctness, PostgresRecord as _, PostgresSorting as _, SelectCompiler, bulk_insert,
            rows::{
                EntityDraftRow, EntityEdgeRow, EntityEditionRow, EntityIdRow, EntityIsOfTypeRow,
                EntityTemporalMetadataRow, PostgresRow as _,
            },
        },
    },
    validation::StoreProvider,
};

/// The panic that happened during a spawned task.
///
/// Opaque to fulfil the `Sync` contract, which has the safety requirement that it must be sound for
/// `&JoinError`, to cross thread boundaries. By design, a `&JoinError` has no API whatsoever,
/// making it useless, thus harmless, thus memory safe.
///
/// This use has precedent, see the nightly `SyncView`, the `SyncWrapper` inside tokio, and
/// `SyncWrapper` of the `sync_wrapper` crate.
struct JoinError(Box<dyn Any + Send>);

// SAFETY: An immutable reference to a `JoinError` is useless, as the value can only be interacted
// with by getting the inner value. This mirrors the design of `SyncView`, see the rationale behind
// it. We choose to implement a custom wrapper instead, to be able to downcast, as long as the
// actual value hidden behind is `Sync`, making the wrapper a no-op, mirroring the internal
// `SyncWrapper` type of tokio, used for it's `JoinError`.
// See: https://github.com/tokio-rs/tokio/blob/c4c6265a0746a79d4a2f3852f726aa0101f29fd3/tokio/src/util/sync_wrapper.rs#L8
// and: https://github.com/rust-lang/rust/blob/f10db292a3733b5c67c8da8c7661195ff4b05774/library/core/src/sync/sync_view.rs#L90
#[expect(unsafe_code)]
unsafe impl Sync for JoinError {}

impl JoinError {
    // Adapted from: https://github.com/rust-lang/rust/blob/6c8138de8f1c96b2f66adbbc0e37c73525444750/library/std/src/panicking.rs#L779-L787
    fn message(&self) -> Option<&str> {
        if let Some(value) = self.downcast_ref_sync::<&'static str>() {
            return Some(*value);
        }

        if let Some(value) = self.downcast_ref_sync::<String>() {
            return Some(&**value);
        }

        None
    }

    fn downcast_ref_sync<T: Any + Sync>(&self) -> Option<&T> {
        // If the downcast fails, the inner value is not touched, so no thread-safety violation can
        // occur.
        self.0.downcast_ref()
    }
}

impl fmt::Debug for JoinError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut debug = fmt.debug_tuple("JoinError");

        if let Some(message) = self.message() {
            return debug.field(&message).finish();
        }

        debug.finish_non_exhaustive()
    }
}

impl fmt::Display for JoinError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Some(message) = self.message() {
            return write!(fmt, "task panicked with message: {message}");
        }

        fmt.write_str("task panicked")
    }
}

impl core::error::Error for JoinError {}

impl<C> PostgresStore<C>
where
    C: AsClient,
{
    /// Resolves `is-of-type` edges from entities to their entity types.
    ///
    /// Queries the database for `is-of-type` edges connecting the provided entities to their
    /// corresponding [`EntityType`]s, applies permission filtering, and inserts the discovered
    /// edges into the subgraph. Returns the discovered entity types for further traversal.
    ///
    /// [`EntityType`]: type_system::ontology::entity_type::EntityType
    ///
    /// # Arguments
    ///
    /// * `entities` - Collection of entity vertex IDs with their temporal intervals to traverse
    ///   from
    /// * `next_traversal` - Traversal parameters to apply to discovered entity types
    /// * `traversal_context` - Context tracking visited vertices to prevent duplicates
    /// * `provider` - Store provider for permission checks
    /// * `subgraph` - Subgraph to populate with discovered edges and vertices
    ///
    /// # Errors
    ///
    /// Returns [`QueryError`] if the database query fails or permission filtering encounters an
    /// error.
    async fn resolve_is_of_type_edge<'edges>(
        &self,
        entities: impl IntoIterator<Item = (EntityVertexId, RightBoundedTemporalInterval<VariableAxis>)>,
        next_traversal: BorrowedTraversalParams<'edges>,
        traversal_context: &mut TraversalContext<'edges>,
        provider: &StoreProvider<'_, Self>,
        subgraph: &mut Subgraph,
    ) -> Result<
        Vec<(
            EntityTypeUuid,
            BorrowedTraversalParams<'edges>,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        Report<QueryError>,
    > {
        let entities = entities.into_iter();
        let mut shared_edges_traversal_data = EntityEdgeTraversalData::with_capacity(
            &subgraph.temporal_axes.resolved,
            entities.size_hint().0,
        );

        for (entity_vertex_id, traversal_interval) in entities {
            shared_edges_traversal_data.push(entity_vertex_id, traversal_interval);
        }

        let mut entity_type_queue = Vec::new();

        if shared_edges_traversal_data.is_empty() {
            return Ok(entity_type_queue);
        }

        let traversed_edges = self
            .read_shared_edges(&shared_edges_traversal_data, Some(0))
            .await?;

        let filtered_traversed_edges = Self::filter_entity_types_by_permission(
            traversed_edges,
            provider,
            subgraph.temporal_axes.resolved.clone(),
        )
        .await?;
        for edge in filtered_traversed_edges {
            subgraph.insert_edge(
                &edge.left_endpoint,
                SharedEdgeKind::IsOfType,
                EdgeDirection::Outgoing,
                edge.right_endpoint.clone(),
            );

            let next_traversal = traversal_context.add_entity_type_id(
                EntityTypeUuid::from(edge.right_endpoint_ontology_id),
                next_traversal,
                edge.traversal_interval,
            );

            if let Some((entity_type_uuid, next_traversal, interval)) = next_traversal {
                entity_type_queue.push((entity_type_uuid, next_traversal, interval));
            }
        }

        Ok(entity_type_queue)
    }

    /// Resolves a chain of entity edges, starting from the given entities.
    ///
    /// This method traverses through each edge in the path using a recursive CTE query, which
    /// executes a single PostgreSQL query that traverses all edges at once.
    ///
    /// Returns the entities reached after traversing all edges. If the entity set becomes empty
    /// at any point during traversal, an empty vector is returned.
    ///
    /// # Errors
    ///
    /// Returns [`QueryError`] if any database query fails during edge resolution.
    async fn resolve_entity_edges(
        &self,
        entities: Vec<(EntityVertexId, RightBoundedTemporalInterval<VariableAxis>)>,
        edges: &[EntityTraversalEdge],
        traversal_context: &mut TraversalContext<'_>,
        provider: &StoreProvider<'_, Self>,
        subgraph: &mut Subgraph,
    ) -> Result<Vec<(EntityVertexId, RightBoundedTemporalInterval<VariableAxis>)>, Report<QueryError>>
    {
        // Fast path: No edges to traverse - return input entities as "leaf" entities
        if edges.is_empty() {
            return Ok(entities);
        }

        // Phase 1: Traverse all edges and collect results using CTE
        let traversal_result = self
            .read_knowledge_edges(&entities, edges, &subgraph.temporal_axes.resolved)
            .await?;

        // Phase 2: Single permission filter call for all collected edges
        let permitted_editions = self
            .filter_knowledge_edges(
                &traversal_result.entity_edition_ids,
                &subgraph.temporal_axes.resolved,
                provider,
            )
            .await?;

        // Phase 3: Process edges - populate subgraph and traversal context only for permitted
        // entities

        // Track starting entities
        let mut tracked_entities = entities
            .into_iter()
            .map(|(vertex_id, _)| vertex_id)
            .collect::<HashSet<_>>();
        let mut final_entities = Vec::new();
        let num_edge_hops = traversal_result.edge_hops.len();

        for (edge_idx, edge_hop) in traversal_result.edge_hops.into_iter().enumerate() {
            let is_last_edge = edge_idx == num_edge_hops.saturating_sub(1);

            for edge_result in edge_hop.edges {
                if !tracked_entities.contains(&edge_result.left_endpoint) {
                    continue;
                }

                // Check if this entity is permitted
                let is_permitted = permitted_editions.as_ref().is_none_or(|permitted| {
                    permitted.contains(&edge_result.right_endpoint_edition_id)
                });

                if is_permitted {
                    subgraph.insert_edge(
                        &edge_result.left_endpoint,
                        edge_hop.edge_kind,
                        edge_hop.edge_direction,
                        EntityIdWithInterval {
                            entity_id: edge_result.right_endpoint.base_id,
                            interval: edge_result.edge_interval,
                        },
                    );

                    traversal_context.add_entity_id(
                        edge_result.right_endpoint_edition_id,
                        edge_result.right_endpoint,
                        edge_result.traversal_interval,
                    );

                    tracked_entities.insert(edge_result.right_endpoint);

                    // Only add to final entities if this was from the last edge hop
                    if is_last_edge {
                        final_entities
                            .push((edge_result.right_endpoint, edge_result.traversal_interval));
                    }
                }
            }
        }

        Ok(final_entities)
    }

    /// Traverses entities along a specified path, optionally continuing into ontology types.
    ///
    /// This method performs a two-phase traversal:
    /// 1. **Entity phase**: Follows the provided entity edges, starting from entities already in
    ///    the subgraph
    /// 2. **Ontology phase** (optional): If an ontology traversal path is provided, resolves the
    ///    types of the leaf entities and continues traversing through the type system
    ///
    /// All discovered entities and types are added to the subgraph and tracked in the traversal
    /// context.
    ///
    /// # Errors
    ///
    /// Returns [`QueryError`] if any database query fails during traversal.
    #[tracing::instrument(level = "info", skip(self, traversal_context, provider, subgraph))]
    pub(crate) async fn traverse_entities_with_path<'edges>(
        &self,
        entity_traversal_path: &[EntityTraversalEdge],
        ontology_traversal_path: Option<&'edges [TraversalEdge]>,
        traversal_context: &mut TraversalContext<'edges>,
        provider: &StoreProvider<'_, Self>,
        subgraph: &mut Subgraph,
    ) -> Result<(), Report<QueryError>> {
        let entities = subgraph.entity_with_intervals().collect::<Vec<_>>();

        let leaf_entities = self
            .resolve_entity_edges(
                entities,
                entity_traversal_path,
                traversal_context,
                provider,
                subgraph,
            )
            .await?;

        if let Some(traversal_path) = ontology_traversal_path {
            let entity_types = self
                .resolve_is_of_type_edge(
                    leaf_entities,
                    BorrowedTraversalParams::Path { traversal_path },
                    traversal_context,
                    provider,
                    subgraph,
                )
                .await?;

            self.traverse_entity_types(entity_types, traversal_context, provider, subgraph)
                .await?;
        }

        Ok(())
    }

    /// Traverses entities using depth-based resolution parameters.
    ///
    /// This method traverses entity edges, then optionally resolves entity types if
    /// [`GraphResolveDepths::is_of_type`] is enabled. Unlike
    /// [`traverse_entities_with_path`](Self::traverse_entities_with_path), this method collects
    /// ALL entities encountered during traversal (not just leaf entities) before resolving their
    /// types, enabling type resolution across the entire entity subgraph.
    ///
    /// # Errors
    ///
    /// Returns [`QueryError`] if any database query fails during traversal.
    #[tracing::instrument(level = "info", skip(self, traversal_context, provider, subgraph))]
    pub(crate) async fn traverse_entities_with_resolve_depths<'edges>(
        &self,
        entity_traversal_path: &'edges [EntityTraversalEdge],
        graph_resolve_depths: GraphResolveDepths,
        traversal_context: &mut TraversalContext<'edges>,
        provider: &StoreProvider<'_, Self>,
        subgraph: &mut Subgraph,
    ) -> Result<(), Report<QueryError>> {
        let entities = subgraph.entity_with_intervals().collect::<Vec<_>>();

        let _leafs = self
            .resolve_entity_edges(
                entities,
                entity_traversal_path,
                traversal_context,
                provider,
                subgraph,
            )
            .await?;

        if graph_resolve_depths.is_of_type {
            let entities = subgraph
                .entity_with_intervals()
                .chain(traversal_context.entity_intervals())
                .collect::<Vec<_>>();

            let entity_types = self
                .resolve_is_of_type_edge(
                    entities,
                    BorrowedTraversalParams::ResolveDepths {
                        traversal_path: &[],
                        graph_resolve_depths: GraphResolveDepths {
                            is_of_type: false,
                            ..graph_resolve_depths
                        },
                    },
                    traversal_context,
                    provider,
                    subgraph,
                )
                .await?;

            self.traverse_entity_types(entity_types, traversal_context, provider, subgraph)
                .await?;
        }

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

    #[tracing::instrument(level = "info", skip_all)]
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

    #[tracing::instrument(level = "info", skip_all)]
    #[expect(clippy::too_many_lines)]
    async fn query_entities_impl(
        &self,
        params: &QueryEntitiesParams<'_>,
        temporal_axes: &QueryTemporalAxes,
        policy_components: &PolicyComponents,
    ) -> Result<QueryEntitiesResponse<'static>, Report<QueryError>> {
        let policy_filter = Filter::<Entity>::for_policies(
            policy_components.extract_filter_policies(ActionName::ViewEntity),
            policy_components.actor_id(),
            policy_components.optimization_data(ActionName::ViewEntity),
        );

        // Apply filter protection when configured - protects sensitive properties (e.g., email)
        // from enumeration attacks and removes them from responses for non-owners.
        let should_apply_protection =
            !self.settings.filter_protection.is_empty() && !policy_components.is_instance_admin();

        let mut compiler = SelectCompiler::new(Some(temporal_axes), params.include_drafts);

        let protected_filter;
        let property_protection_filter;
        let filter_to_use = if should_apply_protection {
            property_protection_filter = self
                .settings
                .filter_protection
                .to_property_protection_filter(policy_components.actor_id());
            compiler.with_property_masking(&property_protection_filter);

            protected_filter = transform_filter(
                params.filter.clone(),
                &self.settings.filter_protection,
                0,
                policy_components.actor_id(),
            );

            &protected_filter
        } else {
            &params.filter
        };

        compiler
            .add_filter(&policy_filter)
            .change_context(QueryError)?;
        compiler
            .add_filter(filter_to_use)
            .change_context(QueryError)?;

        compiler.set_limit(params.limit);

        let cursor_parameters = params.sorting.encode().change_context(QueryError)?;
        let cursor_indices = params
            .sorting
            .compile(&mut compiler, cursor_parameters.as_ref(), temporal_axes)
            .change_context(QueryError)?;

        let record_parameters = Entity::parameters();
        let record_indices = Entity::compile(&mut compiler, &record_parameters);

        let (statement, parameters) = compiler.compile();

        let rows = self
            .as_client()
            .query(&statement, parameters)
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = statement,
            ))
            .await
            .change_context(QueryError)?;
        let artifacts = QueryIndices::<Entity, EntityQuerySorting> {
            record_indices,
            cursor_indices,
        };

        let (entities, cursor) = {
            let _span =
                tracing::trace_span!("process_query_results", row_count = rows.len()).entered();
            let mut cursor = None;
            let num_rows = rows.len();
            let entities = rows
                .into_iter()
                .enumerate()
                .map(|(idx, row)| {
                    let row = TypedRow::<Entity, EntityQueryCursor>::from(row);
                    if idx == num_rows - 1 && params.limit == num_rows {
                        cursor = Some(row.decode_cursor(&artifacts));
                    }
                    row.decode_record(&artifacts)
                })
                .collect::<Vec<_>>();
            (entities, cursor)
        };

        Ok(QueryEntitiesResponse {
            closed_multi_entity_types: if params.include_entity_types.is_some() {
                Some(
                    self.get_closed_multi_entity_types(
                        policy_components
                            .actor_id()
                            .map_or_else(ActorEntityUuid::public_actor, ActorEntityUuid::from),
                        entities
                            .iter()
                            .map(|entity| entity.metadata.entity_type_ids.clone()),
                        QueryTemporalAxesUnresolved::live_only(),
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
                    let entity_type_uuids = entities
                        .iter()
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
                            policy_components
                                .actor_id()
                                .map_or_else(ActorEntityUuid::public_actor, ActorEntityUuid::from),
                            &entity_type_uuids,
                            params.include_entity_types
                                == Some(IncludeEntityTypeOption::ResolvedWithDataTypeChildren),
                        )
                        .await?,
                    )
                }
                None | Some(IncludeEntityTypeOption::Closed) => None,
            },
            entities,
            cursor,
            // Populated later
            permissions: None,
        })
    }
}

impl<C> EntityStore for PostgresStore<C>
where
    C: AsClient,
{
    #[tracing::instrument(level = "info", skip(self, params))]
    #[expect(clippy::too_many_lines)]
    async fn create_entities(
        &mut self,
        actor_uuid: ActorEntityUuid,
        params: Vec<CreateEntityParams>,
    ) -> Result<Vec<Entity>, Report<InsertionError>> {
        let transaction_time = Timestamp::<TransactionTime>::now().remove_nanosecond();
        let mut entity_edition_ids = Vec::with_capacity(params.len());

        let mut entity_id_rows = Vec::with_capacity(params.len());
        let mut entity_draft_rows = Vec::new();
        let mut entity_edition_rows = Vec::with_capacity(params.len());
        let mut entity_temporal_metadata_rows = Vec::with_capacity(params.len());
        let mut entity_is_of_type_rows = Vec::with_capacity(params.len());
        let mut entity_edge_rows = Vec::new();

        let mut policies = Vec::new();

        let mut entities = Vec::with_capacity(params.len());
        // TODO: There are expected to be duplicates but we currently don't have a way to identify
        //       multi-type entity types. We need a way to speed this up.
        let mut validation_params = Vec::with_capacity(params.len());

        let transaction = self.transaction().await.change_context(InsertionError)?;

        let actor_id = transaction
            .determine_actor(actor_uuid)
            .await
            .change_context(InsertionError)?
            .ok_or_else(|| Report::new(InsertionError).attach("Actor not found"))?;

        let mut policy_components_builder = PolicyComponents::builder(&transaction);

        let mut entity_ids = Vec::with_capacity(params.len());

        // We will use the added entity type IDs to check for the instantiation permission later.
        // This means that we need to make sure, that exactly the required entity types are passed
        // here.
        let mut entity_type_id_set = HashSet::with_capacity(params.len());
        for params in &params {
            let entity_id = EntityId {
                web_id: params.web_id,
                entity_uuid: params
                    .entity_uuid
                    .unwrap_or_else(|| EntityUuid::new(Uuid::new_v4())),
                draft_id: params.draft.then(|| DraftId::new(Uuid::new_v4())),
            };
            policy_components_builder.add_entity(
                actor_id,
                entity_id,
                Cow::Owned(params.entity_type_ids.iter().cloned().collect()),
            );
            entity_ids.push(entity_id);

            entity_type_id_set.extend(&params.entity_type_ids);
        }

        // The policy components builder will make sure, that also parent entity types are added to
        // the set of entity type IDs. These are accessible via `tracked_entity_types` method.
        let policy_components = policy_components_builder
            .with_actor(actor_id)
            .with_entity_type_ids(entity_type_id_set)
            .with_actions(
                [ActionName::Instantiate, ActionName::CreateEntity],
                MergePolicies::No,
            )
            .with_actions(
                [
                    ActionName::ViewEntity,
                    ActionName::ViewEntityType,
                    ActionName::ViewPropertyType,
                    ActionName::ViewDataType,
                ],
                MergePolicies::Yes,
            )
            .await
            .change_context(InsertionError)?;

        let policy_set = policy_components
            .build_policy_set([ActionName::Instantiate, ActionName::CreateEntity])
            .change_context(InsertionError)?;

        let mut forbidden_instantiations = Vec::new();
        for entity_type_id in policy_components.tracked_entity_types() {
            match policy_set
                .evaluate(
                    &Request {
                        actor: policy_components.actor_id(),
                        action: ActionName::Instantiate,
                        resource: &ResourceId::EntityType(Cow::Borrowed(entity_type_id.into())),
                        context: RequestContext::default(),
                    },
                    policy_components.context(),
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
                .attach_opaque(StatusCode::PermissionDenied)
                .attach(
                    "The actor does not have permission to instantiate one or more entity types",
                )
                .attach(
                    forbidden_instantiations
                        .into_iter()
                        .map(ToString::to_string)
                        .map(Cow::Owned)
                        .intersperse(Cow::Borrowed(", "))
                        .collect::<String>(),
                ));
        }

        let mut forbidden_entity_creations = Vec::new();
        for entity_id in &entity_ids {
            match policy_set
                .evaluate(
                    &Request {
                        actor: policy_components.actor_id(),
                        action: ActionName::CreateEntity,
                        resource: &ResourceId::Entity(entity_id.entity_uuid),
                        context: RequestContext::default(),
                    },
                    policy_components.context(),
                )
                .change_context(InsertionError)?
            {
                Authorized::Always => {}
                Authorized::Never => {
                    forbidden_entity_creations.push(entity_id);
                }
            }
        }

        if !forbidden_entity_creations.is_empty() {
            return Err(Report::new(InsertionError)
                .attach_opaque(StatusCode::PermissionDenied)
                .attach("The actor does not have permission to create one or more entities")
                .attach(
                    forbidden_entity_creations
                        .into_iter()
                        .map(ToString::to_string)
                        .collect::<Vec<_>>()
                        .join(", "),
                ));
        }

        let validator_provider = StoreProvider::new(&transaction, &policy_components);

        let mut validation_reports = HashMap::<usize, EntityValidationReport>::new();

        debug_assert_eq!(
            params.len(),
            entity_ids.len(),
            "Number of parameters ({}) and entity ids ({}) must be the same",
            params.len(),
            entity_ids.len(),
        );
        for (index, (mut params, &entity_id)) in params.into_iter().zip(&entity_ids).enumerate() {
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
                    .change_context(InsertionError)?,
            )
            .change_context(InsertionError)?;

            let mut preprocessor = EntityPreprocessor {
                components: if params.draft {
                    ValidateEntityComponents::draft()
                } else {
                    ValidateEntityComponents::full()
                },
                convert_values: true,
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

            let stored_provenance = SqlEntityProvenance::from(EntityProvenance {
                created_by_id: actor_uuid,
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
                deletion: None,
                edition: EntityEditionProvenance {
                    created_by_id: actor_uuid,
                    archived_by_id: None,
                    provided: params.provenance,
                },
            });
            entity_id_rows.push(EntityIdRow {
                web_id: entity_id.web_id,
                entity_uuid: entity_id.entity_uuid,
                read_only: params.read_only,
                created_by_id: stored_provenance.created_by_id,
                created_at_transaction_time: stored_provenance.created_at_transaction_time,
                created_at_decision_time: stored_provenance.created_at_decision_time,
                provenance: stored_provenance.json.clone(),
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
                provenance: stored_provenance.edition.json.clone(),
                property_metadata: property_metadata.clone(),
                created_by_id: stored_provenance.edition.created_by_id,
            });
            entity_edition_ids.push(entity_edition_id);

            let entity_provenance = EntityProvenance::from(stored_provenance);

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
                entity_edge_rows.extend([
                    EntityEdgeRow {
                        source_web_id: entity_id.web_id,
                        source_entity_uuid: entity_id.entity_uuid,
                        target_web_id: link_data.left_entity_id.web_id,
                        target_entity_uuid: link_data.left_entity_id.entity_uuid,
                        confidence: link_data.left_entity_confidence,
                        provenance: link_data.left_entity_provenance.clone(),
                        kind: EntityTraversalEdgeKind::HasLeftEntity,
                        direction: EdgeDirection::Outgoing,
                    },
                    EntityEdgeRow {
                        source_web_id: link_data.left_entity_id.web_id,
                        source_entity_uuid: link_data.left_entity_id.entity_uuid,
                        target_web_id: entity_id.web_id,
                        target_entity_uuid: entity_id.entity_uuid,
                        confidence: None,
                        provenance: PropertyProvenance::default(),
                        kind: EntityTraversalEdgeKind::HasLeftEntity,
                        direction: EdgeDirection::Incoming,
                    },
                    EntityEdgeRow {
                        source_web_id: entity_id.web_id,
                        source_entity_uuid: entity_id.entity_uuid,
                        target_web_id: link_data.right_entity_id.web_id,
                        target_entity_uuid: link_data.right_entity_id.entity_uuid,
                        confidence: link_data.right_entity_confidence,
                        provenance: link_data.right_entity_provenance.clone(),
                        kind: EntityTraversalEdgeKind::HasRightEntity,
                        direction: EdgeDirection::Outgoing,
                    },
                    EntityEdgeRow {
                        source_web_id: link_data.right_entity_id.web_id,
                        source_entity_uuid: link_data.right_entity_id.entity_uuid,
                        target_web_id: entity_id.web_id,
                        target_entity_uuid: entity_id.entity_uuid,
                        confidence: None,
                        provenance: PropertyProvenance::default(),
                        kind: EntityTraversalEdgeKind::HasRightEntity,
                        direction: EdgeDirection::Incoming,
                    },
                ]);
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
                    read_only: params.read_only,
                    provenance: entity_provenance,
                    confidence: params.confidence,
                    properties: property_metadata,
                },
            });

            validation_params.push((entity_type, preprocessor.components));

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

        let insertions = [
            (
                EntityIdRow::table(),
                bulk_insert().rows(&entity_id_rows).compile(),
                entity_id_rows.len(),
            ),
            (
                EntityDraftRow::table(),
                bulk_insert().rows(&entity_draft_rows).compile(),
                entity_draft_rows.len(),
            ),
            (
                EntityEditionRow::table(),
                bulk_insert().rows(&entity_edition_rows).compile(),
                entity_edition_rows.len(),
            ),
            (
                EntityTemporalMetadataRow::table(),
                bulk_insert().rows(&entity_temporal_metadata_rows).compile(),
                entity_temporal_metadata_rows.len(),
            ),
            (
                EntityIsOfTypeRow::table(),
                bulk_insert().rows(&entity_is_of_type_rows).compile(),
                entity_is_of_type_rows.len(),
            ),
            (
                EntityEdgeRow::table(),
                bulk_insert().rows(&entity_edge_rows).compile(),
                entity_edge_rows.len(),
            ),
        ];

        for (table, (statement, parameters), expected_rows) in &insertions {
            let inserted_rows = transaction
                .as_client()
                .execute_raw(
                    statement,
                    parameters
                        .iter()
                        .map(|parameter| &**parameter as &(dyn ToSql + Sync)),
                )
                .instrument(tracing::info_span!(
                    "INSERT",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres",
                    db.query.text = statement,
                ))
                .await
                .change_context(InsertionError)?;
            if inserted_rows != *expected_rows as u64 {
                return Err(Report::new(InsertionError).attach(format!(
                    "bulk insert into `{table}` affected {inserted_rows} rows but {expected_rows} \
                     were provided",
                    table = table.as_str(),
                )));
            }
        }

        transaction
            .as_client()
            .query(
                "
                    INSERT INTO entity_is_of_type (
                        entity_edition_id,
                        entity_type_ontology_id,
                        inheritance_depth
                    )
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
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(InsertionError)?;

        transaction
            .as_client()
            .query(
                &insert_entity_edition_cache_statement(true),
                &[&entity_edition_ids],
            )
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
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

        transaction
            .insert_policies_into_database(policies)
            .await
            .change_context(InsertionError)?;

        ensure!(
            validation_reports.is_empty(),
            Report::new(InsertionError).attach_opaque(validation_reports)
        );

        transaction.commit().await.change_context(InsertionError)?;

        if !self.settings.skip_embedding_creation
            && let Some(temporal_client) = &self.temporal_client
        {
            let entity_ids: Vec<EntityId> = entities
                .iter()
                .map(|entity| entity.metadata.record_id.entity_id)
                .collect();
            temporal_client
                .start_update_entity_embeddings_workflow(
                    actor_uuid,
                    &entity_ids,
                    self.settings.filter_protection.embedding_exclusions(),
                )
                .await
                .change_context(InsertionError)?;
        }

        Ok(entities)
    }

    // TODO: Relax constraints on entity validation for draft entities
    //   see https://linear.app/hash/issue/H-1449
    // TODO: Restrict non-draft links to non-draft entities
    //   see https://linear.app/hash/issue/H-1450
    #[tracing::instrument(level = "info", skip(self, params))]
    async fn validate_entities(
        &self,
        actor_id: ActorEntityUuid,
        params: Vec<ValidateEntityParams<'_>>,
    ) -> Result<HashMap<usize, EntityValidationReport>, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_actions(
                [
                    ActionName::ViewEntity,
                    ActionName::ViewEntityType,
                    ActionName::ViewPropertyType,
                    ActionName::ViewDataType,
                ],
                MergePolicies::Yes,
            )
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
                convert_values: true,
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
    async fn query_entities(
        &self,
        actor_id: ActorEntityUuid,
        mut params: QueryEntitiesParams<'_>,
    ) -> Result<QueryEntitiesResponse<'static>, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_action(ActionName::ViewEntity, MergePolicies::Yes)
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
            .query_entities_impl(&params, &temporal_axes, &policy_components)
            .await?;

        if !params.conversions.is_empty() {
            for entity in &mut response.entities {
                self.convert_entity(&provider, entity, &params.conversions)
                    .await
                    .change_context(QueryError)?;
            }
        }

        if params.include_permissions {
            let entity_ids = response
                .entities
                .iter()
                .map(|entity| entity.metadata.record_id.entity_id)
                .collect::<Vec<_>>();

            let update_permissions = self
                .has_permission_for_entities(
                    policy_components.actor_id().into(),
                    HasPermissionForEntitiesParams {
                        action: ActionName::UpdateEntity,
                        entity_ids: Cow::Borrowed(&entity_ids),
                        temporal_axes: params.temporal_axes,
                        include_drafts: params.include_drafts,
                    },
                )
                .await
                .change_context(QueryError)?;

            let mut permissions: HashMap<EntityId, EntityPermissions> =
                HashMap::with_capacity(update_permissions.len());

            for (entity_id, editions) in update_permissions {
                permissions.entry(entity_id).or_default().update = editions;
            }

            debug_assert!(
                response.permissions.is_none(),
                "Should not be populated yet"
            );
            response.permissions = Some(permissions);
        }

        Ok(response)
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn search_entities(
        &self,
        actor_id: ActorEntityUuid,
        params: SearchEntitiesParams,
    ) -> Result<SearchEntitiesResponse, Report<QueryError>> {
        let SearchEntitiesParams {
            embedding,
            maximum_semantic_distance,
            limit,
            include_entity_types,
            filter:
                SearchEntitiesFilter {
                    entity_type_ids,
                    web_ids,
                    include_drafts,
                },
        } = params;

        // TODO(BE-618): optimize the query — it scans embeddings without a vector index. A
        //   halfvec/HNSW index needs an ANN-friendly query shape to be usable (the current
        //   `MIN(<=>) GROUP BY` defeats it). The returned entities can also be trimmed to the
        //   fields the search bar and inference actually use, but the query is the bottleneck.
        let maximum_distance =
            Real::try_from(maximum_semantic_distance.into_inner()).change_context(QueryError)?;

        // The search always runs against the current time and never returns archived entities.
        let mut filters = vec![
            Filter::CosineDistance(
                FilterExpression::Path {
                    path: EntityQueryPath::Embedding,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Vector(embedding),
                    convert: None,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Decimal(maximum_distance),
                    convert: None,
                },
            ),
            Filter::Equal(
                FilterExpression::Path {
                    path: EntityQueryPath::Archived,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Boolean(false),
                    convert: None,
                },
            ),
        ];

        if !entity_type_ids.is_empty() {
            filters.push(Filter::Any(
                entity_type_ids
                    .iter()
                    .map(Filter::for_entity_by_type_id)
                    .collect(),
            ));
        }
        if !web_ids.is_empty() {
            filters.push(Filter::In(
                FilterExpression::Path {
                    path: EntityQueryPath::WebId,
                },
                FilterExpressionList::ParameterList {
                    parameters: ParameterList::WebIds(&web_ids),
                },
            ));
        }

        let response = self
            .query_entities(
                actor_id,
                QueryEntitiesParams {
                    filter: Filter::All(filters),
                    temporal_axes: QueryTemporalAxesUnresolved::live_only(),
                    sorting: EntityQuerySorting {
                        paths: vec![],
                        cursor: None,
                    },
                    conversions: Vec::new(),
                    limit,
                    include_drafts,
                    include_entity_types: include_entity_types
                        .then_some(IncludeEntityTypeOption::Closed),
                    include_permissions: false,
                },
            )
            .await?;

        Ok(SearchEntitiesResponse {
            entities: response.entities,
            closed_multi_entity_types: response.closed_multi_entity_types,
        })
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    #[expect(clippy::too_many_lines)]
    async fn query_entity_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        params: QueryEntitySubgraphParams<'_>,
    ) -> Result<QueryEntitySubgraphResponse<'static>, Report<QueryError>> {
        let actions = params.view_actions();

        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_actions(actions, MergePolicies::Yes)
            .await
            .change_context(QueryError)?;
        let actor = policy_components.actor_id();

        let provider = StoreProvider::new(self, &policy_components);

        let (mut request, traversal_params) = params.into_parts();
        request
            .filter
            .convert_parameters(&provider)
            .await
            .change_context(QueryError)?;

        let temporal_axes = request.temporal_axes.resolve();
        let time_axis = temporal_axes.variable_time_axis();

        let QueryEntitiesResponse {
            entities: root_entities,
            cursor,
            closed_multi_entity_types: _,
            definitions: _,
            permissions,
        } = self
            .query_entities_impl(&request, &temporal_axes, &policy_components)
            .await?;

        let mut subgraph = Subgraph::new(request.temporal_axes, temporal_axes);

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

            // Iterate over each traversal path and call traverse_entities separately
            match &traversal_params {
                SubgraphTraversalParams::Paths { traversal_paths } => {
                    for path in traversal_paths {
                        let (entity_traversal_path, ontology_traversal_path) =
                            path.split_entity_path();
                        self.traverse_entities_with_path(
                            &entity_traversal_path,
                            ontology_traversal_path,
                            &mut traversal_context,
                            &provider,
                            &mut subgraph,
                        )
                        .await?;
                    }
                }
                SubgraphTraversalParams::ResolveDepths {
                    traversal_paths,
                    graph_resolve_depths,
                } => {
                    if traversal_paths.is_empty() {
                        if graph_resolve_depths.is_of_type {
                            // If no entity traversal paths are specified, still initialize
                            // the traversal with ontology resolve depths to enable
                            // traversal of ontology edges (e.g., isOfType, inheritsFrom)
                            self.traverse_entities_with_resolve_depths(
                                &[],
                                *graph_resolve_depths,
                                &mut traversal_context,
                                &provider,
                                &mut subgraph,
                            )
                            .await?;
                        }
                    } else {
                        for path in traversal_paths {
                            self.traverse_entities_with_resolve_depths(
                                &path.edges,
                                *graph_resolve_depths,
                                &mut traversal_context,
                                &provider,
                                &mut subgraph,
                            )
                            .await?;
                        }
                    }
                }
            }

            traversal_context
                .read_traversed_vertices(
                    self,
                    &mut subgraph,
                    request.include_drafts,
                    provider
                        .policy_components
                        .as_ref()
                        .expect("Policy components should be set"),
                )
                .await?;

            if !request.conversions.is_empty() {
                for entity in subgraph.vertices.entities.values_mut() {
                    self.convert_entity(&provider, entity, &request.conversions)
                        .await
                        .change_context(QueryError)?;
                }
            }

            Ok(QueryEntitySubgraphResponse {
                closed_multi_entity_types: if request.include_entity_types.is_some() {
                    Some(
                        self.get_closed_multi_entity_types(
                            actor_id,
                            subgraph
                                .vertices
                                .entities
                                .values()
                                .map(|entity| entity.metadata.entity_type_ids.clone()),
                            QueryTemporalAxesUnresolved::live_only(),
                            None,
                        )
                        .await?
                        .entity_types,
                    )
                } else {
                    None
                },
                definitions: match request.include_entity_types {
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
                                request.include_entity_types
                                    == Some(IncludeEntityTypeOption::ResolvedWithDataTypeChildren),
                            )
                            .await?,
                        )
                    }
                    None | Some(IncludeEntityTypeOption::Closed) => None,
                },
                cursor,
                entity_permissions: if request.include_permissions {
                    debug_assert!(permissions.is_none(), "Should not be populated yet");

                    let entity_ids = subgraph
                        .vertices
                        .entities
                        .keys()
                        .map(|vertex_id| vertex_id.base_id)
                        .collect::<Vec<_>>();

                    let update_permissions = self
                        .has_permission_for_entities(
                            actor.into(),
                            HasPermissionForEntitiesParams {
                                action: ActionName::UpdateEntity,
                                entity_ids: Cow::Borrowed(&entity_ids),
                                temporal_axes: request.temporal_axes,
                                include_drafts: request.include_drafts,
                            },
                        )
                        .await
                        .change_context(QueryError)?;

                    let mut permissions: HashMap<EntityId, EntityPermissions> =
                        HashMap::with_capacity(update_permissions.len());

                    for (entity_id, editions) in update_permissions {
                        permissions.entry(entity_id).or_default().update = editions;
                    }

                    Some(permissions)
                } else {
                    None
                },
                subgraph,
            })
        }
        .instrument(tracing::trace_span!("construct_subgraph"))
        .await
    }

    #[tracing::instrument(level = "info", skip_all)]
    async fn summarize_entities(
        &self,
        actor_id: ActorEntityUuid,
        mut params: SummarizeEntitiesParams<'_>,
    ) -> Result<SummarizeEntitiesResponse, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_action(ActionName::ViewEntity, MergePolicies::Yes)
            .await
            .change_context(QueryError)?;

        let provider = StoreProvider::new(self, &policy_components);

        params
            .filter
            .convert_parameters(&provider)
            .await
            .change_context(QueryError)?;

        let policy_filter = Filter::<Entity>::for_policies(
            policy_components.extract_filter_policies(ActionName::ViewEntity),
            policy_components.actor_id(),
            policy_components.optimization_data(ActionName::ViewEntity),
        );

        // Apply filter protection when configured - protects sensitive properties (e.g., email)
        // from enumeration attacks in summarize_entities queries.
        let should_apply_protection =
            !self.settings.filter_protection.is_empty() && !policy_components.is_instance_admin();

        let protected_filter;
        let filter_to_use = if should_apply_protection {
            // Transform filter to protect against email filtering on Users
            // Note: summarize_entities has no sorting, so only filter protection applies
            protected_filter = transform_filter(
                params.filter.clone(),
                &self.settings.filter_protection,
                0,
                policy_components.actor_id(),
            );
            &protected_filter
        } else {
            &params.filter
        };

        let temporal_axes = params.temporal_axes.resolve();
        let mut compiler = SelectCompiler::new(Some(&temporal_axes), params.include_drafts);
        compiler
            .add_filter(&policy_filter)
            .change_context(QueryError)?;
        compiler
            .add_filter(filter_to_use)
            .change_context(QueryError)?;

        let Some(summary_query) = EntitySummaryQuery::new(&mut compiler, &params) else {
            return Ok(SummarizeEntitiesResponse::default());
        };
        let (statement, parameters) = compiler.compile();

        // The `hits` CTE only needs to deduplicate editions when the query can emit more than
        // one row per edition: either a fan-out (to-many) filter join, or a range variable
        // temporal axis matching the same edition across several decision-time slices. A
        // collapsed point interval (`[t, t]`) matches at most one slice per entity, so when no
        // to-many join was added the dedup can be dropped, unlocking a parallel aggregate.
        let variable_interval = temporal_axes.variable_interval();
        let temporal_axis_is_point = matches!(
            (variable_interval.start(), variable_interval.end()),
            (TemporalBound::Inclusive(start), LimitedTemporalBound::Inclusive(end))
                if start == end
        );
        let dedup = if compiler.has_to_many_join() || !temporal_axis_is_point {
            Deduplication::Required
        } else {
            Deduplication::Skip
        };
        let statement = summary_query.statement(&statement, dedup);

        let rows = self
            .as_client()
            .query_raw(&statement, parameters.iter().copied())
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = statement,
            ))
            .await
            .change_context(QueryError)?
            .try_collect::<Vec<_>>()
            .instrument(tracing::trace_span!("collect_entity_summaries"))
            .await
            .change_context(QueryError)?;

        let summaries = summary_query.decode(rows)?;

        Ok(SummarizeEntitiesResponse {
            count: summaries.count,
            web_ids: summaries.web_ids,
            created_by_ids: summaries.created_by_ids,
            edition_created_by_ids: summaries.edition_created_by_ids,
            type_ids: summaries.type_ids.filter(|_| params.include_type_ids),
            type_titles: summaries.type_titles.filter(|_| params.include_type_titles),
        })
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
            .with_action(ActionName::ViewEntity, MergePolicies::Yes)
            .await
            .change_context(QueryError)?;

        let mut filters = vec![Filter::for_entity_by_entity_id(entity_id)];

        let filter = Filter::<Entity>::for_policies(
            policy_components.extract_filter_policies(ActionName::ViewEntity),
            policy_components.actor_id(),
            policy_components.optimization_data(ActionName::ViewEntity),
        );
        filters.push(filter);

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
            &filters,
            Some(&temporal_axes),
            entity_id.draft_id.is_some(),
        )
        .await
    }

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

        let transaction = self.transaction().await.change_context(UpdateError)?;

        let locked_row = transaction
            .lock_entity_edition(params.entity_id, transaction_time, decision_time)
            .await?
            .ok_or_else(|| {
                Report::new(EntityDoesNotExist)
                    .attach_opaque(StatusCode::NotFound)
                    .attach(params.entity_id)
                    .change_context(UpdateError)
            })?;
        let ClosedTemporalBound::Inclusive(locked_transaction_time) =
            *locked_row.transaction_time.start();
        let ClosedTemporalBound::Inclusive(locked_decision_time) =
            *locked_row.decision_time.start();
        let previous_entity = Read::<Entity>::read_one(
            &transaction,
            &[Filter::Equal(
                FilterExpression::Path {
                    path: EntityQueryPath::EditionId,
                },
                FilterExpression::Parameter {
                    parameter: Parameter::Uuid(locked_row.entity_edition_id.into_uuid()),
                    convert: None,
                },
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
        .attach_opaque(params.entity_id)
        .change_context(UpdateError)?;

        let policy_components = PolicyComponents::builder(&transaction)
            .with_actor(actor_id)
            .with_entity_edition_id(previous_entity.metadata.record_id.edition_id)
            .with_entity_type_ids(&params.entity_type_ids)
            .with_actions(
                [
                    ActionName::Instantiate,
                    ActionName::UpdateEntity,
                    ActionName::ArchiveEntity,
                ],
                MergePolicies::No,
            )
            .with_actions(
                [
                    ActionName::ViewEntity,
                    ActionName::ViewEntityType,
                    ActionName::ViewPropertyType,
                    ActionName::ViewDataType,
                ],
                MergePolicies::Yes,
            )
            .await
            .change_context(UpdateError)?;

        let policy_set = policy_components
            .build_policy_set([
                ActionName::Instantiate,
                ActionName::UpdateEntity,
                ActionName::ArchiveEntity,
            ])
            .change_context(UpdateError)?;

        if params.is_update() {
            match policy_set
                .evaluate(
                    &Request {
                        actor: policy_components.actor_id(),
                        action: ActionName::UpdateEntity,
                        resource: &ResourceId::Entity(params.entity_id.entity_uuid),
                        context: RequestContext::default(),
                    },
                    policy_components.context(),
                )
                .change_context(UpdateError)?
            {
                Authorized::Always => {}
                Authorized::Never => {
                    return Err(Report::new(UpdateError)
                        .attach_opaque(StatusCode::PermissionDenied)
                        .attach("The actor does not have permission to update the entity")
                        .attach(
                            previous_entity
                                .metadata
                                .entity_type_ids
                                .iter()
                                .map(VersionedUrl::to_string)
                                .collect::<Vec<_>>()
                                .join(", "),
                        ));
                }
            }
        }

        if let Some(archive) = params.archived {
            match policy_set
                .evaluate(
                    &Request {
                        actor: policy_components.actor_id(),
                        action: ActionName::ArchiveEntity,
                        resource: &ResourceId::Entity(params.entity_id.entity_uuid),
                        context: RequestContext::default(),
                    },
                    policy_components.context(),
                )
                .change_context(UpdateError)?
            {
                Authorized::Always => {}
                Authorized::Never => {
                    return Err(Report::new(UpdateError)
                        .attach_opaque(StatusCode::PermissionDenied)
                        .attach(format!(
                            "The actor does not have permission to {} the entity",
                            if archive { "archive" } else { "publish" },
                        )));
                }
            }
        }

        let validator_provider = StoreProvider::new(&transaction, &policy_components);

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
                match policy_set
                    .evaluate(
                        &Request {
                            actor: policy_components.actor_id(),
                            action: ActionName::Instantiate,
                            resource: &ResourceId::EntityType(Cow::Borrowed(entity_type_id.into())),
                            context: RequestContext::default(),
                        },
                        policy_components.context(),
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
                    .attach_opaque(StatusCode::PermissionDenied)
                    .attach(
                        "The actor does not have permission to instantiate one or more entity \
                         types",
                    )
                    .attach(
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
                    convert_values: true,
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
                    read_only: previous_entity.metadata.read_only,
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
        let stored_provenance = SqlEntityEditionProvenance::from(edition_provenance);
        let edition_id = transaction
            .insert_entity_edition(
                archived,
                &entity_type_ids,
                &properties,
                params.confidence,
                &stored_provenance,
                &property_metadata,
            )
            .await
            .change_context(UpdateError)?;
        let edition_provenance = EntityEditionProvenance::from(stored_provenance);

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
                    .instrument(tracing::info_span!(
                        "INSERT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
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
                        .instrument(tracing::info_span!(
                            "UPDATE",
                            otel.kind = "client",
                            db.system = "postgresql",
                            peer.service = "Postgres"
                        ))
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
                first_non_draft_created_at_transaction_time,
                first_non_draft_created_at_decision_time,
                edition: edition_provenance,
                ..previous_entity.metadata.provenance
            },
            confidence: params.confidence,
            properties: property_metadata,
            archived,
            read_only: previous_entity.metadata.read_only,
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
            Report::new(UpdateError).attach_opaque(HashMap::from([(0_usize, validation_report)]))
        );

        transaction.commit().await.change_context(UpdateError)?;

        if !self.settings.skip_embedding_creation
            && let Some(temporal_client) = &self.temporal_client
        {
            let entity_ids: Vec<EntityId> = entities
                .iter()
                .map(|entity| entity.metadata.record_id.entity_id)
                .collect();
            temporal_client
                .start_update_entity_embeddings_workflow(
                    actor_id,
                    &entity_ids,
                    self.settings.filter_protection.embedding_exclusions(),
                )
                .await
                .change_context(UpdateError)?;
        }
        let [entity] = entities;
        Ok(entity)
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn delete_entities(
        &mut self,
        actor_id: AuthenticatedActor,
        params: DeleteEntitiesParams<'_>,
    ) -> Result<DeletionSummary, Report<DeletionError>> {
        // TODO: Authorization — check delete permission via PolicyComponents

        let mut transaction = self
            .transaction()
            .await
            .change_context(DeletionError::Store)?;
        let summary = transaction
            .execute_entity_deletion(actor_id.into(), params)
            .await?;
        transaction
            .commit()
            .await
            .change_context(DeletionError::Store)?;

        Ok(summary)
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    #[expect(clippy::too_many_lines)]
    async fn update_entity_embeddings(
        &mut self,
        _: ActorEntityUuid,
        params: UpdateEntityEmbeddingsParams<'_>,
    ) -> Result<(), Report<UpdateError>> {
        let mut properties = Vec::with_capacity(params.embeddings.len());
        let mut embeddings = Vec::with_capacity(params.embeddings.len());
        for embedding in params.embeddings {
            properties.push(embedding.property.as_ref().map(ToString::to_string));
            embeddings.push(embedding.embedding);
        }

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
        //         status = status.attach_opaque(format!("Permission denied for entity
        // {entity_id}"));     }
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
                    .instrument(tracing::info_span!(
                        "DELETE",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
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
                    .instrument(tracing::info_span!(
                        "DELETE",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
                    .await
                    .change_context(UpdateError)?;
            }
        }
        self.as_client()
            .query(
                "
                    INSERT INTO entity_embeddings (
                        web_id,
                        entity_uuid,
                        draft_id,
                        property,
                        embedding,
                        updated_at_transaction_time,
                        updated_at_decision_time
                    )
                    SELECT
                        $1::uuid,
                        $2::uuid,
                        $3::uuid,
                        property,
                        embedding,
                        $6::timestamptz,
                        $7::timestamptz
                    FROM unnest($4::text[], $5::vector[]) AS embeddings(property, embedding)
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
                &[
                    &params.entity_id.web_id,
                    &params.entity_id.entity_uuid,
                    &params.entity_id.draft_id,
                    &properties,
                    &embeddings,
                    &params.updated_at_transaction_time,
                    &params.updated_at_decision_time,
                ],
            )
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
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

                    INSERT INTO entity_is_of_type (
                        entity_edition_id,
                        entity_type_ontology_id,
                        inheritance_depth
                    )
                    SELECT entity_edition_id,
                           target_entity_type_ontology_id AS entity_type_ontology_id,
                           MIN(entity_type_inherits_from.depth + 1) AS inheritance_depth
                      FROM entity_is_of_type
                      JOIN entity_type_inherits_from
                        ON entity_type_ontology_id = source_entity_type_ontology_id
                     GROUP BY entity_edition_id, target_entity_type_ontology_id;

                    DELETE FROM entity_edition_cache;
                ",
            )
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(UpdateError)?;

        transaction
            .as_client()
            .query(&insert_entity_edition_cache_statement(false), &[])
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(UpdateError)?;

        transaction.commit().await.change_context(UpdateError)?;

        Ok(())
    }

    #[tracing::instrument(skip(self, params))]
    async fn has_permission_for_entities(
        &self,
        authenticated_actor: AuthenticatedActor,
        params: HasPermissionForEntitiesParams<'_>,
    ) -> Result<HashMap<EntityId, Vec<EntityEditionId>>, Report<CheckPermissionError>> {
        let temporal_axes = params.temporal_axes.resolve();
        let mut compiler = SelectCompiler::new(Some(&temporal_axes), params.include_drafts);

        let entity_uuids = params
            .entity_ids
            .iter()
            .map(|id| id.entity_uuid)
            .collect::<Vec<_>>();

        let entity_filter = Filter::In(
            FilterExpression::Path {
                path: EntityQueryPath::Uuid,
            },
            FilterExpressionList::ParameterList {
                parameters: ParameterList::EntityUuids(&entity_uuids),
            },
        );
        compiler
            .add_filter(&entity_filter)
            .change_context(CheckPermissionError::CompileFilter)?;

        let policy_components = PolicyComponents::builder(self)
            .with_actor(authenticated_actor)
            .with_action(params.action, MergePolicies::Yes)
            .await
            .change_context(CheckPermissionError::BuildPolicyContext)?;
        let policy_filter = Filter::<Entity>::for_policies(
            policy_components.extract_filter_policies(params.action),
            policy_components.actor_id(),
            policy_components.optimization_data(params.action),
        );
        compiler
            .add_filter(&policy_filter)
            .change_context(CheckPermissionError::CompileFilter)?;

        let web_id_idx = compiler.add_selection_path(&EntityQueryPath::WebId);
        let uuid_idx = compiler.add_selection_path(&EntityQueryPath::Uuid);
        let draft_id_idx = compiler.add_selection_path(&EntityQueryPath::DraftId);
        let edition_id_idx = compiler.add_distinct_selection_with_ordering(
            &EntityQueryPath::EditionId,
            Distinctness::Distinct,
            None,
        );

        let mut permitted_ids = HashMap::<EntityId, Vec<EntityEditionId>>::new();

        let (statement, parameters) = compiler.compile();
        let () = self
            .as_client()
            .query_raw(&statement, parameters.iter().copied())
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = statement,
            ))
            .await
            .change_context(CheckPermissionError::StoreError)?
            .map_ok(|row| {
                permitted_ids
                    .entry(EntityId {
                        web_id: row.get(web_id_idx),
                        entity_uuid: row.get(uuid_idx),
                        draft_id: row.get(draft_id_idx),
                    })
                    .or_default()
                    .push(row.get(edition_id_idx));
            })
            .try_collect()
            .await
            .change_context(CheckPermissionError::StoreError)?;

        Ok(permitted_ids)
    }

    #[expect(clippy::too_many_lines)]
    #[tracing::instrument(skip(self, params))]
    async fn cluster_entities(
        &self,
        actor_id: ActorEntityUuid,
        params: ClusterEntitiesParams,
    ) -> Result<ClusterEntitiesResponse, Report<ClusterError>> {
        const MAX_ALLOWED_DIM: u16 = 512;
        const MAX_ALLOWED_K: u16 = 64;
        const { assert!(Embedding::DIM <= u16::MAX as usize) };

        let dimension = Dimension::new(params.dimension.get()).ok_or_else(|| {
            Report::new(ClusterError::InvalidDimension {
                dimension: params.dimension,
            })
            .attach(StatusCode::InvalidArgument)
        })?;

        if dimension.get() > MAX_ALLOWED_DIM {
            return Err(Report::new(ClusterError::DimensionTooLarge {
                dimension: dimension.value(),
                max: MAX_ALLOWED_DIM,
            })
            .attach(StatusCode::InvalidArgument));
        }

        if params.cluster_count > MAX_ALLOWED_K {
            return Err(Report::new(ClusterError::KTooLarge {
                count: params.cluster_count,
                max: MAX_ALLOWED_K,
            })
            .attach(StatusCode::InvalidArgument));
        }

        let truncated_dim = usize::from(dimension.get());

        // Filter to entities the actor is allowed to view.
        let permitted = self
            .has_permission_for_entities(
                AuthenticatedActor::from(actor_id),
                HasPermissionForEntitiesParams {
                    action: ActionName::ViewEntity,
                    entity_ids: Cow::Borrowed(&params.entity_ids),
                    temporal_axes: QueryTemporalAxesUnresolved::TransactionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    },
                    include_drafts: false,
                },
            )
            .await
            .change_context(ClusterError::Store)?;

        let permitted_ids: Vec<_> = params
            .entity_ids
            .iter()
            .filter(|&id| permitted.contains_key(id))
            .copied()
            .collect();

        let entity_uuids: Vec<_> = permitted_ids.iter().map(|id| id.entity_uuid).collect();
        let web_ids: Vec<_> = permitted_ids.iter().map(|id| id.web_id).collect();

        // Truncate server-side via `subvector` so postgres only sends
        // `truncated_dim`-dimensional vectors over the wire.
        //
        // Matryoshka truncation shortens the vectors without re-normalizing;
        // that is fine here because spherical k-means normalizes internally
        // (it works with inverse norms), so no `l2_normalize` is needed.
        let row_stream = self
            .as_client()
            .query_raw(
                &format!(
                    "SELECT
                        u.web_id,
                        u.entity_uuid,
                        subvector(e.embedding, 1, {truncated_dim})::vector({truncated_dim}) AS \
                     embedding
                    FROM (
                        SELECT DISTINCT ON (t.web_id, t.entity_uuid)
                            t.web_id,
                            t.entity_uuid,
                            t.ord
                        FROM unnest($1::uuid[], $2::uuid[])
                            WITH ORDINALITY AS t(web_id, entity_uuid, ord)
                        ORDER BY t.web_id, t.entity_uuid, t.ord
                    ) u
                    JOIN entity_embeddings e
                        ON e.web_id = u.web_id
                            AND e.entity_uuid = u.entity_uuid
                    WHERE e.property IS NULL
                    ORDER BY u.ord"
                ),
                [
                    &web_ids as &(dyn ToSql + Sync),
                    &entity_uuids as &(dyn ToSql + Sync),
                ],
            )
            .instrument(tracing::info_span!(
                "cluster_entities.embeddings",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(ClusterError::Store)?;

        let mut row_stream = core::pin::pin!(row_stream);

        let mut flat: Vec<_> = Vec::with_capacity(permitted_ids.len() * truncated_dim);
        let mut found_ids: Vec<_> = Vec::with_capacity(permitted_ids.len());

        // Every requested entity not in a cluster goes into `missing_embeddings`, whether due to
        // permissions or no embedding. Distinguishing the two would leak permission information.
        let mut missing_ids: HashSet<_> = params.entity_ids.iter().copied().collect();

        while let Some(row) = row_stream
            .try_next()
            .await
            .change_context(ClusterError::Store)?
        {
            let web_id: WebId = row.get(0);
            let entity_uuid: EntityUuid = row.get(1);
            let embedding: Embedding<'_> = row.get(2);

            flat.extend(embedding.iter());

            let id = EntityId {
                web_id,
                entity_uuid,
                draft_id: None,
            };
            found_ids.push(id);
            missing_ids.remove(&id);
        }

        if found_ids.is_empty() || params.cluster_count == 0 {
            return Ok(ClusterEntitiesResponse {
                clusters: Vec::new(),
                missing_embeddings: missing_ids,
                inertia: 0.0,
            });
        }

        let config = hash_graph_embeddings::clustering::Config::for_k_with_seed(
            params.cluster_count,
            params.seed.unwrap_or_else(|| {
                std::time::SystemTime::UNIX_EPOCH
                    .elapsed()
                    .map_or(0, |elapsed| {
                        #[expect(
                            clippy::cast_possible_truncation,
                            reason = "seed only needs entropy, truncation is fine"
                        )]
                        let seed = elapsed.as_nanos() as u64;
                        seed
                    })
            }),
        );

        let (tx, rx) = oneshot::channel();
        rayon::spawn(move || {
            let result = std::panic::catch_unwind(core::panic::AssertUnwindSafe(|| {
                hash_graph_embeddings::clustering::cluster(&flat, dimension, &config)
            }));

            let result = result.map_err(JoinError);

            let _: Result<(), Result<Clustering, JoinError>> = tx.send(result);
        });

        let clustering = rx
            .await
            .change_context(ClusterError::Store)?
            .change_context(ClusterError::Store)?;

        let mut groups = vec![Vec::new(); config.k as usize];

        #[expect(clippy::indexing_slicing, reason = "we only ever have k groups")]
        for (index, &id) in found_ids.iter().enumerate() {
            let label = clustering.label(index) as usize;
            groups[label].push(id);
        }

        let clusters = groups
            .into_iter()
            .zip(0_u16..)
            .filter(|(entity_ids, _)| !entity_ids.is_empty())
            .map(|(entity_ids, cluster_id)| EntityCluster {
                cluster_id,
                entity_ids,
                centroid: clustering.centroid(cluster_id).to_vec(),
            })
            .collect();

        Ok(ClusterEntitiesResponse {
            clusters,
            missing_embeddings: missing_ids,
            inertia: clustering.inertia,
        })
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

/// Builds the statement populating `entity_edition_cache` by aggregating the editions'
/// `entity_is_of_type` rows joined to the referenced types.
///
/// The write paths pass `scoped` to restrict it to the just-written editions
/// (`$1: UUID[]`), `reindex_entity_cache` runs it unscoped over all editions. Must run
/// after the editions' `entity_is_of_type` rows (including the inherited ones) have been
/// written.
fn insert_entity_edition_cache_statement(scoped: bool) -> String {
    let types_scope = if scoped {
        "WHERE entity_is_of_type.entity_edition_id = ANY($1)"
    } else {
        ""
    };
    let labels_scope = if scoped {
        "AND entity_is_of_type.entity_edition_id = ANY($1)"
    } else {
        ""
    };
    format!(
        "
    INSERT INTO entity_edition_cache (
        entity_edition_id,
        direct_types,
        labels,
        type_titles,
        base_urls,
        versions,
        versioned_urls
    )
    SELECT types.entity_edition_id,
           types.direct_types,
           labels.labels,
           types.type_titles,
           types.base_urls,
           types.versions,
           types.versioned_urls
      FROM (
          SELECT entity_is_of_type.entity_edition_id,
                 count(*) FILTER (
                     WHERE entity_is_of_type.inheritance_depth = 0
                 ) AS direct_types,
                 array_agg(entity_types.schema ->> 'title'
                     ORDER BY entity_is_of_type.inheritance_depth,
                              entity_types.schema ->> 'title', ontology_ids.base_url,
                              ontology_ids.version DESC
                 ) AS type_titles,
                 array_agg(ontology_ids.base_url
                     ORDER BY entity_is_of_type.inheritance_depth,
                              entity_types.schema ->> 'title', ontology_ids.base_url,
                              ontology_ids.version DESC
                 ) AS base_urls,
                 array_agg(ontology_ids.version
                     ORDER BY entity_is_of_type.inheritance_depth,
                              entity_types.schema ->> 'title', ontology_ids.base_url,
                              ontology_ids.version DESC
                 ) AS versions,
                 array_agg(ontology_ids.base_url || 'v/' || ontology_ids.version
                     ORDER BY entity_is_of_type.inheritance_depth,
                              entity_types.schema ->> 'title', ontology_ids.base_url,
                              ontology_ids.version DESC
                 ) AS versioned_urls
            FROM entity_is_of_type
            JOIN ontology_ids
              ON entity_is_of_type.entity_type_ontology_id = ontology_ids.ontology_id
            JOIN entity_types
              ON ontology_ids.ontology_id = entity_types.ontology_id
           {types_scope}
           GROUP BY entity_is_of_type.entity_edition_id
      ) AS types
      LEFT JOIN (
          SELECT entity_is_of_type.entity_edition_id,
                 array_agg(label_value.label
                     ORDER BY entity_types.schema ->> 'title', ontology_ids.base_url,
                              ontology_ids.version DESC, label_value.ordinality
                 ) FILTER (WHERE label_value.label IS NOT NULL) AS labels
            FROM entity_is_of_type
            JOIN ontology_ids
              ON entity_is_of_type.entity_type_ontology_id = ontology_ids.ontology_id
            JOIN entity_types
              ON ontology_ids.ontology_id = entity_types.ontology_id
            JOIN entity_editions
              ON entity_is_of_type.entity_edition_id = entity_editions.entity_edition_id
           CROSS JOIN LATERAL (
               SELECT jsonb_extract_path(
                          entity_editions.properties, label_path.path
                      ) #>> '{{}}' AS label,
                      label_path.ordinality
                 FROM jsonb_array_elements_text(
                          jsonb_path_query_array(
                              entity_types.closed_schema, '$.allOf[*].labelProperty'
                          )
                      ) WITH ORDINALITY AS label_path (path, ordinality)
           ) AS label_value
           WHERE entity_is_of_type.inheritance_depth = 0
             {labels_scope}
           GROUP BY entity_is_of_type.entity_edition_id
      ) AS labels
        ON types.entity_edition_id = labels.entity_edition_id;
"
    )
}

impl PostgresStore<tokio_postgres::Transaction<'_>> {
    #[tracing::instrument(level = "info", skip_all)]
    async fn insert_entity_edition(
        &self,
        archived: bool,
        entity_type_ids: impl IntoIterator<Item = &VersionedUrl> + Send,
        properties: &PropertyObject,
        confidence: Option<Confidence>,
        provenance: &SqlEntityEditionProvenance,
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
                        property_metadata,
                        created_by_id
                    ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
                    RETURNING entity_edition_id;
                ",
                &[
                    &archived,
                    &properties,
                    &confidence,
                    &provenance.json,
                    metadata,
                    &provenance.created_by_id,
                ],
            )
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
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
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(InsertionError)?;
        self.as_client()
            .query(
                "
                    INSERT INTO entity_is_of_type (
                        entity_edition_id,
                        entity_type_ontology_id,
                        inheritance_depth
                    )
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
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(InsertionError)?;

        let edition_ids = [edition_id];
        self.as_client()
            .query(
                &insert_entity_edition_cache_statement(true),
                &[&edition_ids.as_slice()],
            )
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(InsertionError)?;

        Ok(edition_id)
    }

    #[tracing::instrument(level = "info", skip(self))]
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
                .instrument(tracing::info_span!(
                    "SELECT",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres"
                ))
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
                .instrument(tracing::info_span!(
                    "SELECT",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres"
                ))
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
                    .attach_opaque(entity_id)
                    .change_context(UpdateError),
                _ => Report::new(error).change_context(UpdateError),
            })
    }

    #[tracing::instrument(level = "info", skip(self))]
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
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(InsertionError)?;

        Ok(EntityTemporalMetadata {
            decision_time: row.get(0),
            transaction_time: row.get(1),
        })
    }

    #[tracing::instrument(level = "info", skip(self))]
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
                    .instrument(tracing::info_span!(
                        "UPDATE",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
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
                    .instrument(tracing::info_span!(
                        "UPDATE",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
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
                .instrument(tracing::info_span!(
                    "UPDATE",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres"
                ))
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
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
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
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(UpdateError)?;

        Ok(EntityTemporalMetadata {
            decision_time: row.get(0),
            transaction_time: row.get(1),
        })
    }

    #[tracing::instrument(level = "info", skip(self))]
    #[expect(clippy::too_many_lines)]
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
                .instrument(tracing::info_span!(
                    "UPDATE",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres"
                ))
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
                .instrument(tracing::info_span!(
                    "UPDATE",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres"
                ))
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
            .instrument(tracing::info_span!(
                "INSERT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
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
            .instrument(tracing::info_span!(
                "UPDATE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(UpdateError)?;

        Ok(EntityTemporalMetadata {
            decision_time: row.get(0),
            transaction_time: row.get(1),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::insert_entity_edition_cache_statement;

    #[test]
    fn cache_statement_scoping() {
        let scoped = insert_entity_edition_cache_statement(true);
        let unscoped = insert_entity_edition_cache_statement(false);

        assert_eq!(scoped.matches("= ANY($1)").count(), 2);
        assert_eq!(unscoped.matches("= ANY($1)").count(), 0);
        // the jsonb text-extraction operator must survive the `format!` brace escaping
        assert!(scoped.contains("#>> '{}'"));
    }
}
