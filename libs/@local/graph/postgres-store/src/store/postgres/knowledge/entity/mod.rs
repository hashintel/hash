mod delete;
pub(crate) mod feed;
mod patch;
pub(crate) mod provenance;
mod query;
mod read;
mod search;
mod summary;
mod table;

use alloc::borrow::Cow;
use core::{any::Any, borrow::Borrow as _, fmt, mem};
use std::collections::{HashMap, HashSet};

use error_stack::{FutureExt as _, Report, ResultExt as _, TryReportStreamExt as _};
use futures::{StreamExt as _, TryStreamExt as _, stream};
use hash_graph_authorization::policies::{
    Authorized, MergePolicies, PolicyComponents, PolicySet, Request, RequestContext, ResourceId,
    action::ActionName,
    resource::{EntityResourceConstraint, ResourceConstraint},
    store::{PolicyCreationParams, PolicyStore, PrincipalStore, error::ContextCreationError},
};
use hash_graph_embeddings::{Dimension, clustering::Clustering};
use hash_graph_store::{
    entity::{
        ClusterEntitiesParams, ClusterEntitiesResponse, CreateEntityParams, DeleteEntitiesParams,
        DeletionSummary, EmptyEntityTypes, EntityCluster, EntityPermissions, EntityQueryCursor,
        EntityQueryPath, EntityQuerySorting, EntityStore, EntityTypeRetrieval, EntityTypesError,
        EntityValidationReport, EntityValidationType, HasPermissionForEntitiesParams,
        PatchEntityParams, QueryConversion, QueryEntitiesParams, QueryEntitiesResponse,
        QueryEntitiesTableParams, QueryEntitiesTableResponse, QueryEntitySubgraphParams,
        QueryEntitySubgraphResponse, SearchEntitiesParams, SearchEntitiesResponse,
        SummarizeEntitiesParams, SummarizeEntitiesResponse, UpdateEntityEmbeddingsParams,
        ValidateEntityComponents, ValidateEntityParams,
    },
    entity_type::{EntityTypeStore as _, IncludeEntityTypeOption},
    error::{
        CheckPermissionError, ClusterError, DeletionError, EntityCreationError, InsertionError,
        QueryError, UpdateError,
    },
    filter::{Filter, FilterExpression, FilterExpressionList, ParameterList},
    query::QueryResult as _,
    subgraph::{
        Subgraph, SubgraphRecord as _,
        edges::{
            BorrowedTraversalParams, EdgeDirection, EntityTraversalEdge, EntityTraversalEdgeKind,
            GraphResolveDepths, SharedEdgeKind, SubgraphTraversalParams, TraversalEdge,
        },
        identifier::{EntityIdWithInterval, EntityVertexId},
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxes, QueryTemporalAxesUnresolved,
            VariableAxis, VariableTemporalAxisUnresolved,
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
    Valid, Validator as _,
    knowledge::{
        Entity, PropertyValue,
        entity::{
            EntityMetadata, EntityProvenance, Link,
            id::{DraftId, EntityEditionId, EntityId, EntityRecordId, EntityUuid},
            metadata::EntityTemporalMetadata,
            provenance::EntityEditionProvenance,
        },
        property::{
            PropertyObject, PropertyObjectWithMetadata, PropertyPath, PropertyPathError,
            PropertyValueWithMetadata, PropertyWithMetadata, metadata::PropertyObjectMetadata,
        },
    },
    ontology::{
        InheritanceDepth,
        data_type::schema::DataTypeReference,
        entity_type::{
            ClosedEntityType, ClosedMultiEntityType, EntityTypeUuid,
            schema::ResolveClosedEntityTypeError,
        },
        id::{OntologyTypeUuid, VersionedUrl},
    },
    principal::{
        actor::{ActorEntityUuid, ActorId},
        actor_group::WebId,
    },
    provenance::validation::{ProvenanceValidator, ProvenanceViolation, ProvenanceViolations},
};
use uuid::{NoContext, Uuid};

use crate::store::{
    AsClient, GenericClientIter as _, PostgresStore,
    error::RaceConditionOnUpdate,
    postgres::{
        BeginReadOnlyTransaction, InTransaction, TransactionState, TraversalContext,
        crud::{QueryIndices, TypedRow},
        knowledge::entity::{
            patch::{EntityPatchPreparation, PreparedEntityPatch},
            provenance::{SqlEntityEditionProvenance, SqlEntityProvenance},
            read::EntityEdgeTraversalData,
            summary::{Deduplication, EntitySummaryQuery, EntitySummaryRequest},
        },
        query::{
            Distinctness, PostgresRecord as _, PostgresSorting as _, SelectCompiler,
            StatementShape, bulk_insert,
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

impl<C, S> PostgresStore<C, S>
where
    C: AsClient,
    S: TransactionState,
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

    /// Applies the `conversions` to a property object and its metadata in
    /// place.
    #[tracing::instrument(level = "info", skip_all)]
    pub(crate) async fn convert_properties<P: DataTypeLookup + Sync>(
        &self,
        provider: &P,
        properties: &mut PropertyObject,
        metadata: &mut PropertyObjectMetadata,
        conversions: &[QueryConversion<'_>],
    ) -> Result<(), Report<PropertyPathError>> {
        let mut property = PropertyWithMetadata::Object(PropertyObjectWithMetadata::from_parts(
            mem::take(properties),
            Some(mem::take(metadata)),
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
        let (converted_properties, converted_metadata) = property.into_parts();
        *properties = converted_properties;
        *metadata = converted_metadata;
        Ok(())
    }

    #[tracing::instrument(level = "info", skip_all)]
    async fn convert_entity<P: DataTypeLookup + Sync>(
        &self,
        provider: &P,
        entity: &mut Entity,
        conversions: &[QueryConversion<'_>],
    ) -> Result<(), Report<PropertyPathError>> {
        self.convert_properties(
            provider,
            &mut entity.properties,
            &mut entity.metadata.properties,
            conversions,
        )
        .await
    }

    #[tracing::instrument(level = "info", skip_all)]
    #[expect(clippy::too_many_lines)]
    async fn read_entities_impl(
        &self,
        params: &QueryEntitiesParams<'_>,
        temporal_axes: &QueryTemporalAxes,
        policy_components: &PolicyComponents,
    ) -> Result<QueryEntitiesResponse<'static>, Report<QueryError>> {
        let policy_filter = Filter::<Entity>::for_view_entity(policy_components);

        let should_apply_protection = self.should_apply_filter_protection(policy_components);

        let mut compiler = SelectCompiler::new(Some(temporal_axes), params.include_drafts);

        let protected_filter;
        let property_protection_filter;
        let filter_to_use = if should_apply_protection {
            property_protection_filter = self
                .settings
                .filter_protection
                .to_property_protection_filter(policy_components.actor_id());
            compiler.with_property_masking(&property_protection_filter);

            protected_filter =
                self.apply_filter_protection(params.filter.clone(), policy_components);

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
        // The entity read path vouches for the keys-first preconditions: its hydration joins
        // always match their key row (foreign keys, and the write paths maintaining
        // `entity_edition_cache` in the same transaction) and the distinct key pins all
        // row-multiplying columns.
        compiler.set_statement_shape(StatementShape::KeysFirst);

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
            .query_params_iter(&statement, parameters)
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
                        policy_components.actor_id(),
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
                            policy_components.actor_id(),
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

/// Read implementations which run inside the snapshot-consistent read transaction begun by
/// [`BeginReadOnlyTransaction::begin_read_only_transaction`].
impl<C> PostgresStore<C, InTransaction>
where
    C: AsClient,
{
    #[tracing::instrument(level = "info", skip(self, params))]
    async fn query_entities_impl(
        &self,
        actor_id: Option<ActorId>,
        mut params: QueryEntitiesParams<'_>,
    ) -> Result<QueryEntitiesResponse<'static>, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self, actor_id)
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
            .read_entities_impl(&params, &temporal_axes, &policy_components)
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
                .has_permission_for_entities_impl(
                    policy_components.actor_id(),
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
    #[expect(clippy::too_many_lines)]
    async fn query_entity_subgraph_impl(
        &self,
        actor_id: Option<ActorId>,
        params: QueryEntitySubgraphParams<'_>,
    ) -> Result<QueryEntitySubgraphResponse<'static>, Report<QueryError>> {
        let actions = params.view_actions();

        let policy_components = PolicyComponents::builder(self, actor_id)
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
            .read_entities_impl(&request, &temporal_axes, &policy_components)
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
                        .has_permission_for_entities_impl(
                            actor,
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
}

impl<C, S> PostgresStore<C, S>
where
    C: AsClient,
    S: TransactionState,
{
    /// Rebuilds the entity edition cache and the inherited `entity_is_of_type` rows.
    ///
    /// This is inherent rather than only an [`EntityStore`] method so that snapshot restore and
    /// entity-type reindexing, which already operate inside an enclosing transaction, can rebuild
    /// the cache without requiring the [`EntityStore`] impl, whose snapshot-consistent reads are
    /// only available where [`BeginReadOnlyTransaction`] is implemented.
    ///
    /// # Errors
    ///
    /// - if the database rejects one of the rebuild statements
    #[tracing::instrument(level = "info", skip(self))]
    pub(crate) async fn reindex_entity_cache_impl(&mut self) -> Result<(), Report<UpdateError>> {
        tracing::info!("Reindexing entity cache");
        let transaction = self.begin_transaction().await.change_context(UpdateError)?;

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

    /// Returns the entity editions among `params.entity_ids` on which `authenticated_actor` may
    /// perform `params.action`.
    ///
    /// This is inherent rather than only an [`EntityStore`] method because the snapshot-consistent
    /// read implementations invoke it on the [`InTransaction`] store, where the [`EntityStore`]
    /// impl, bounded on [`BeginReadOnlyTransaction`], is not available.
    ///
    /// # Errors
    ///
    /// - if the permission filter cannot be compiled or the underlying query fails
    #[tracing::instrument(skip(self, params))]
    pub(crate) async fn has_permission_for_entities_impl(
        &self,
        authenticated_actor: Option<ActorId>,
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

        let policy_components = PolicyComponents::builder(self, authenticated_actor)
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
            .query_raw(&statement, parameters)
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
}

impl<C, S> EntityStore for PostgresStore<C, S>
where
    C: AsClient,
    S: TransactionState,
    Self: BeginReadOnlyTransaction,
{
    #[tracing::instrument(level = "info", skip(self, params))]
    #[expect(clippy::too_many_lines)]
    async fn create_entities(
        &mut self,
        actor_id: ActorId,
        params: Vec<CreateEntityParams>,
    ) -> Result<Vec<Entity>, Report<EntityCreationError>> {
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

        let transaction = self
            .begin_transaction()
            .await
            .change_context(EntityCreationError::Store)?;

        let mut policy_components_builder = PolicyComponents::builder(&transaction, Some(actor_id));

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
                    .unwrap_or_else(|| EntityUuid::new(uuid_v7_at(transaction_time))),
                draft_id: params
                    .draft
                    .then(|| DraftId::new(uuid_v7_at(transaction_time))),
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
        let policy_components = match policy_components_builder
            .with_entity_type_ids(entity_type_id_set.iter().copied())
            .with_actions(
                [
                    ActionName::Instantiate,
                    ActionName::CreateEntity,
                    ActionName::ViewEntityType,
                ],
                MergePolicies::No,
            )
            .with_actions(
                [
                    ActionName::ViewEntity,
                    ActionName::ViewPropertyType,
                    ActionName::ViewDataType,
                ],
                MergePolicies::Yes,
            )
            .await
        {
            Ok(policy_components) => policy_components,
            Err(report) => {
                return Err(entity_creation_error(
                    &transaction,
                    actor_id,
                    &entity_type_id_set,
                    report,
                )
                .await);
            }
        };

        let policy_set = policy_components
            .build_policy_set([
                ActionName::Instantiate,
                ActionName::CreateEntity,
                ActionName::ViewEntityType,
            ])
            .change_context(EntityCreationError::Store)?;

        // An entity type the actor may not view is reported like one that does not exist, also by
        // the legacy API's status code. This runs before the instantiation check, whose answer
        // would reveal that the entity type exists.
        let invisible_entity_types = invisible_entity_types(
            &policy_components,
            &policy_set,
            entity_type_id_set.iter().copied(),
        )?;
        if !invisible_entity_types.is_empty() {
            return Err(Report::new(EntityCreationError::UnknownEntityTypes {
                entity_type_ids: invisible_entity_types,
            })
            .attach_opaque(StatusCode::NotFound));
        }

        let requested_entity_types = entity_type_id_set.iter().copied().collect::<Vec<_>>();
        let archived_entity_types = transaction
            .as_client()
            .query(
                "
                    SELECT input.url
                    FROM unnest($1::text[]) AS input(url)
                    WHERE NOT EXISTS (
                        SELECT 1
                        FROM entity_types
                        JOIN ontology_temporal_metadata USING (ontology_id)
                        WHERE entity_types.schema ->> '$id' = input.url
                          AND ontology_temporal_metadata.transaction_time @> now()
                    )
                ",
                &[&requested_entity_types],
            )
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(EntityCreationError::Store)?
            .into_iter()
            .map(|row| row.get::<_, VersionedUrl>(0))
            .collect::<HashSet<_>>();

        if !archived_entity_types.is_empty() {
            return Err(Report::new(EntityCreationError::ArchivedEntityTypes {
                entity_type_ids: archived_entity_types,
            })
            .attach_opaque(StatusCode::InvalidArgument));
        }

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
                .change_context(EntityCreationError::Store)?
            {
                Authorized::Always => {}
                Authorized::Never => {
                    forbidden_instantiations.push(entity_type_id);
                }
            }
        }

        if !forbidden_instantiations.is_empty() {
            return Err(Report::new(EntityCreationError::InstantiationForbidden {
                entity_type_ids: forbidden_instantiations.into_iter().cloned().collect(),
            })
            .attach_opaque(StatusCode::PermissionDenied));
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
                .change_context(EntityCreationError::Store)?
            {
                Authorized::Always => {}
                Authorized::Never => {
                    forbidden_entity_creations.push(*entity_id);
                }
            }
        }

        if !forbidden_entity_creations.is_empty() {
            return Err(Report::new(EntityCreationError::CreationForbidden {
                entity_ids: forbidden_entity_creations,
            })
            .attach_opaque(StatusCode::PermissionDenied));
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
                    .change_context(EntityCreationError::Store)?,
            )
            .map_err(|report| match report.current_context() {
                ResolveClosedEntityTypeError::IncompatibleProperty(property_type) => {
                    let context = EntityCreationError::IncompatibleEntityTypes {
                        property_type: property_type.clone(),
                    };
                    report
                        .change_context(context)
                        .attach_opaque(StatusCode::InvalidArgument)
                }
                ResolveClosedEntityTypeError::UnknownSchemas(_)
                | ResolveClosedEntityTypeError::EmptySchema
                | ResolveClosedEntityTypeError::InheritanceDepthOverflow => {
                    report.change_context(EntityCreationError::Store)
                }
            })?;

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

            let stored_provenance = SqlEntityProvenance::try_from(EntityProvenance {
                created_by_id: ActorEntityUuid::from(actor_id),
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
                    created_by_id: ActorEntityUuid::from(actor_id),
                    archived_by_id: None,
                    provided: params.provenance,
                },
            });
            let stored_property_metadata = ProvenanceValidator.validate(property_metadata.clone());
            let link = params
                .link_data
                .map(|link| ProvenanceValidator.validate(link))
                .transpose();
            let (stored_provenance, stored_property_metadata, link) =
                match (stored_provenance, stored_property_metadata, link) {
                    (Ok(stored_provenance), Ok(stored_property_metadata), Ok(link)) => {
                        (stored_provenance, stored_property_metadata, link)
                    }
                    (stored_provenance, stored_property_metadata, link) => {
                        validation_reports
                            .entry(index)
                            .or_default()
                            .metadata
                            .provenance = provenance_violations([
                            stored_provenance.err(),
                            stored_property_metadata.err(),
                            link.err(),
                        ]);
                        continue;
                    }
                };
            entity_id_rows.push(EntityIdRow {
                web_id: entity_id.web_id,
                entity_uuid: entity_id.entity_uuid,
                read_only: params.read_only,
                created_by_id: stored_provenance.created_by_id,
                created_at_transaction_time: stored_provenance.created_at_transaction_time,
                created_at_decision_time: stored_provenance.created_at_decision_time,
                deleted_by_id: None,
                deleted_at_transaction_time: None,
                deleted_at_decision_time: None,
                provenance: stored_provenance.json.clone(),
            });
            if let Some(draft_id) = entity_id.draft_id {
                entity_draft_rows.push(EntityDraftRow {
                    web_id: entity_id.web_id,
                    entity_uuid: entity_id.entity_uuid,
                    draft_id,
                });
            }

            let entity_edition_id = EntityEditionId::new(uuid_v7_at(transaction_time));
            entity_edition_rows.push(EntityEditionRow {
                entity_edition_id,
                properties: properties.clone(),
                archived: false,
                confidence: params.confidence,
                provenance: stored_provenance.edition.json.clone(),
                property_metadata: stored_property_metadata,
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

            let link_data = link.map(|link| {
                let (source_provenance, target_provenance) = link.endpoint_provenance();
                let Link::Directed { source, target } = &*link;
                entity_edge_rows.extend([
                    EntityEdgeRow {
                        source_web_id: entity_id.web_id,
                        source_entity_uuid: entity_id.entity_uuid,
                        target_web_id: source.entity_id.web_id,
                        target_entity_uuid: source.entity_id.entity_uuid,
                        confidence: source.confidence,
                        provenance: source_provenance.clone(),
                        kind: EntityTraversalEdgeKind::HasLeftEntity,
                        direction: EdgeDirection::Outgoing,
                    },
                    EntityEdgeRow {
                        source_web_id: source.entity_id.web_id,
                        source_entity_uuid: source.entity_id.entity_uuid,
                        target_web_id: entity_id.web_id,
                        target_entity_uuid: entity_id.entity_uuid,
                        confidence: None,
                        provenance: Valid::default(),
                        kind: EntityTraversalEdgeKind::HasLeftEntity,
                        direction: EdgeDirection::Incoming,
                    },
                    EntityEdgeRow {
                        source_web_id: entity_id.web_id,
                        source_entity_uuid: entity_id.entity_uuid,
                        target_web_id: target.entity_id.web_id,
                        target_entity_uuid: target.entity_id.entity_uuid,
                        confidence: target.confidence,
                        provenance: target_provenance.clone(),
                        kind: EntityTraversalEdgeKind::HasRightEntity,
                        direction: EdgeDirection::Outgoing,
                    },
                    EntityEdgeRow {
                        source_web_id: target.entity_id.web_id,
                        source_entity_uuid: target.entity_id.entity_uuid,
                        target_web_id: entity_id.web_id,
                        target_entity_uuid: entity_id.entity_uuid,
                        confidence: None,
                        provenance: Valid::default(),
                        kind: EntityTraversalEdgeKind::HasRightEntity,
                        direction: EdgeDirection::Incoming,
                    },
                ]);
                link.into_inner()
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

        // The loop builds no rows for an entity whose provenance breaks a rule, so the request has
        // to end before any row is inserted.
        let mut violations = validation_reports
            .iter()
            .flat_map(|(index, report)| {
                report
                    .metadata
                    .provenance
                    .iter()
                    .map(|violation| (*index, violation.clone()))
            })
            .collect::<Vec<_>>();
        if !violations.is_empty() {
            violations.sort_by_key(|(index, _)| *index);
            tracing::info!(
                ?validation_reports,
                "the provenance of the entities breaks a rule"
            );
            return Err(
                Report::new(EntityCreationError::InvalidProvenance { violations })
                    .attach_opaque(validation_reports),
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
                .change_context(EntityCreationError::Store)?;
            if inserted_rows != *expected_rows as u64 {
                return Err(Report::new(EntityCreationError::Store).attach(format!(
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
            .change_context(EntityCreationError::Store)?;

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
            .change_context(EntityCreationError::Store)?;

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
            .change_context(EntityCreationError::Store)?;

        if !validation_reports.is_empty() {
            tracing::info!(
                ?validation_reports,
                "the entities do not match their entity types"
            );
            return Err(
                Report::new(EntityCreationError::InvalidEntities).attach_opaque(validation_reports)
            );
        }

        transaction
            .commit()
            .await
            .change_context(EntityCreationError::Store)?;

        if !self.settings.skip_embedding_creation
            && let Some(temporal_client) = &self.temporal_client
        {
            let entity_ids: Vec<EntityId> = entities
                .iter()
                .map(|entity| entity.metadata.record_id.entity_id)
                .collect();
            // The entities are committed at this point. Failing the request would make the caller
            // create them again.
            if let Err(report) = temporal_client
                .start_update_entity_embeddings_workflow(
                    ActorEntityUuid::from(actor_id),
                    &entity_ids,
                    self.settings.filter_protection.embedding_exclusions(),
                )
                .await
            {
                tracing::warn!(
                    error = ?report,
                    entity_count = entity_ids.len(),
                    "could not start the embedding workflow for the created entities"
                );
            }
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
        actor_id: ActorId,
        params: Vec<ValidateEntityParams<'_>>,
    ) -> Result<HashMap<usize, EntityValidationReport>, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self, Some(actor_id))
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
            validation_report.metadata.provenance = provenance_violations([
                ProvenanceValidator.validate_ref(&*params.properties).err(),
                params
                    .link_data
                    .as_deref()
                    .and_then(|link| ProvenanceValidator.validate_ref(link).err()),
            ]);

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
        &mut self,
        actor_id: Option<ActorId>,
        params: QueryEntitiesParams<'_>,
    ) -> Result<QueryEntitiesResponse<'static>, Report<QueryError>> {
        // An entity query consists of multiple statements: the entity read itself, the optional
        // entity-type resolution, and the permission checks on the returned entities. Under
        // `READ COMMITTED` each statement uses its own MVCC snapshot, so a write committing
        // mid-read can yield entities, entity types, and permissions reflecting different
        // states of the store. Running the whole read in a single `REPEATABLE READ, READ ONLY`
        // transaction gives all statements one shared snapshot.
        let transaction = self
            .begin_read_only_transaction()
            .await
            .change_context(QueryError)?;

        let response = transaction.query_entities_impl(actor_id, params).await?;

        transaction.commit().await.change_context(QueryError)?;

        Ok(response)
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn search_entities(
        &mut self,
        actor_id: ActorId,
        params: SearchEntitiesParams,
    ) -> Result<SearchEntitiesResponse, Report<QueryError>> {
        // The search issues several statements — one candidate read per policy branch, the
        // rerank, and the hydration. Under `READ COMMITTED` each would use its own MVCC
        // snapshot, so a write committing in between could rank an entity that the hydration no
        // longer returns.
        let transaction = self
            .begin_read_only_transaction()
            .await
            .change_context(QueryError)?;

        let response = transaction.search_entities_impl(actor_id, params).await?;

        transaction.commit().await.change_context(QueryError)?;

        Ok(response)
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn query_entity_subgraph(
        &mut self,
        actor_id: Option<ActorId>,
        params: QueryEntitySubgraphParams<'_>,
    ) -> Result<QueryEntitySubgraphResponse<'static>, Report<QueryError>> {
        // A subgraph read consists of multiple statements: the roots query, one recursive CTE
        // per traversal path, the permission filtering of the traversed edges, and the final
        // vertex read. Under `READ COMMITTED` each statement uses its own MVCC snapshot, so a
        // write committing mid-read can retroactively evict an edge endpoint's edition at the
        // pinned timestamp, yielding a subgraph containing a link vertex without the edge to
        // its endpoint. Running the whole read in a single `REPEATABLE READ, READ ONLY`
        // transaction gives all statements one shared snapshot.
        let transaction = self
            .begin_read_only_transaction()
            .await
            .change_context(QueryError)?;

        let response = transaction
            .query_entity_subgraph_impl(actor_id, params)
            .await?;

        transaction.commit().await.change_context(QueryError)?;

        Ok(response)
    }

    #[tracing::instrument(level = "info", skip_all)]
    async fn query_entities_table(
        &mut self,
        actor_id: ActorId,
        params: QueryEntitiesTableParams,
    ) -> Result<QueryEntitiesTableResponse, Report<QueryError>> {
        // The summary defines the type universe the page query runs on. Reading
        // both in one `REPEATABLE READ, READ ONLY` transaction gives them a
        // shared snapshot, so the universe is exact for the page it fences.
        let transaction = self
            .begin_read_only_transaction()
            .await
            .change_context(QueryError)?;

        let response = transaction
            .query_entities_table_impl(actor_id, params)
            .await?;

        transaction.commit().await.change_context(QueryError)?;

        Ok(response)
    }

    async fn summarize_entities(
        &self,
        actor_id: ActorId,
        mut params: SummarizeEntitiesParams<'_>,
    ) -> Result<SummarizeEntitiesResponse, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self, Some(actor_id))
            .with_action(ActionName::ViewEntity, MergePolicies::Yes)
            .await
            .change_context(QueryError)?;

        let provider = StoreProvider::new(self, &policy_components);

        params
            .filter
            .convert_parameters(&provider)
            .await
            .change_context(QueryError)?;

        let policy_filter = Filter::<Entity>::for_view_entity(&policy_components);

        let filter_to_use =
            self.maybe_apply_filter_protection(params.filter.clone(), &policy_components);

        let temporal_axes = params.temporal_axes.resolve();
        let mut compiler = SelectCompiler::new(Some(&temporal_axes), params.include_drafts);
        compiler
            .add_filter(&policy_filter)
            .change_context(QueryError)?;
        compiler
            .add_filter(&filter_to_use)
            .change_context(QueryError)?;

        let Some(summary_query) =
            EntitySummaryQuery::new(&mut compiler, EntitySummaryRequest::from(&params))
        else {
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
            .query_raw(&statement, parameters)
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
        &mut self,
        actor_id: Option<ActorId>,
        entity_id: EntityId,
        transaction_time: Option<Timestamp<TransactionTime>>,
        decision_time: Option<Timestamp<DecisionTime>>,
    ) -> Result<Option<Entity>, Report<QueryError>> {
        let params = QueryEntitiesParams {
            filter: Filter::for_entity_by_entity_id(entity_id),
            temporal_axes: QueryTemporalAxesUnresolved::TransactionTime {
                pinned: PinnedTemporalAxisUnresolved::new(decision_time),
                variable: VariableTemporalAxisUnresolved::new(
                    transaction_time.map(TemporalBound::Inclusive),
                    transaction_time.map(LimitedTemporalBound::Inclusive),
                ),
            },
            sorting: EntityQuerySorting {
                paths: Vec::new(),
                cursor: None,
            },
            // At most one edition matches: both temporal axes resolve to a single point in time,
            // at which the exclusion constraints on `entity_temporal_metadata` admit one live
            // edition and one edition per draft. `include_drafts` is set only when `entity_id`
            // names a draft, which the filter then pins. Including drafts for an ID without one
            // would match its drafts as well.
            limit: 1,
            conversions: Vec::new(),
            include_entity_types: None,
            include_drafts: entity_id.draft_id.is_some(),
            include_permissions: false,
        };
        let response = self.query_entities(actor_id, params).await?;
        Ok(response.entities.into_iter().next())
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn patch_entities(
        &mut self,
        actor_id: ActorId,
        params: Vec<PatchEntityParams>,
    ) -> Result<Vec<Entity>, Report<UpdateError>> {
        let transaction_time = Timestamp::now().remove_nanosecond();
        let transaction = self.begin_transaction().await.change_context(UpdateError)?;

        let mut patched_entities = Vec::with_capacity(params.len());
        let mut embedding_entity_ids = Vec::new();

        for (index, params) in params.into_iter().enumerate() {
            let decision_time = params
                .decision_time
                .map_or_else(|| transaction_time.cast(), Timestamp::remove_nanosecond);
            let (locked_row, previous_entity) = transaction
                .load_entity_for_patch(params.entity_id, transaction_time, decision_time)
                .await?;
            let policy_components = transaction
                .build_entity_patch_policy_components(actor_id, &params, &previous_entity)
                .await?;
            let validator_provider = StoreProvider::new(&transaction, &policy_components);
            match transaction
                .prepare_entity_patch(
                    actor_id,
                    params,
                    previous_entity,
                    &policy_components,
                    &validator_provider,
                )
                .await?
            {
                EntityPatchPreparation::Unchanged(entity) => patched_entities.push(*entity),
                EntityPatchPreparation::Changed(prepared) => {
                    let PreparedEntityPatch {
                        changes,
                        validation,
                    } = *prepared;
                    let changes = match changes.validate_provenance() {
                        Ok(changes) => changes,
                        Err(provenance) => {
                            return Err(validation.reject_provenance(provenance, index));
                        }
                    };
                    let entity = transaction
                        .persist_entity_patch(
                            actor_id,
                            changes,
                            locked_row,
                            transaction_time,
                            decision_time,
                        )
                        .await?;
                    validation
                        .validate(&validator_provider, &entity, index)
                        .await?;
                    embedding_entity_ids.push(entity.metadata.record_id.entity_id);
                    patched_entities.push(entity);
                }
            }
        }

        transaction.commit().await.change_context(UpdateError)?;

        if !embedding_entity_ids.is_empty()
            && !self.settings.skip_embedding_creation
            && let Some(temporal_client) = &self.temporal_client
        {
            temporal_client
                .start_update_entity_embeddings_workflow(
                    ActorEntityUuid::from(actor_id),
                    &embedding_entity_ids,
                    self.settings.filter_protection.embedding_exclusions(),
                )
                .await
                .change_context(UpdateError)?;
        }
        Ok(patched_entities)
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn delete_entities(
        &mut self,
        actor_id: ActorId,
        params: DeleteEntitiesParams<'_>,
    ) -> Result<DeletionSummary, Report<DeletionError>> {
        // TODO: Authorization — check delete permission via PolicyComponents

        let mut transaction = self
            .begin_transaction()
            .await
            .change_context(DeletionError::Store)?;
        let summary = transaction
            .execute_entity_deletion(actor_id, params)
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
        _: ActorId,
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

    async fn reindex_entity_cache(&mut self) -> Result<(), Report<UpdateError>> {
        // Delegates to the inherent method on `PostgresStore<C, S>`, so the rebuild is also
        // reachable where the `EntityStore` impl — bounded on `BeginReadOnlyTransaction` — is
        // unavailable.
        self.reindex_entity_cache_impl().await
    }

    async fn has_permission_for_entities(
        &self,
        authenticated_actor: ActorId,
        params: HasPermissionForEntitiesParams<'_>,
    ) -> Result<HashMap<EntityId, Vec<EntityEditionId>>, Report<CheckPermissionError>> {
        // Delegates to the inherent method on `PostgresStore<C, S>`, so the permission check is
        // also reachable where the `EntityStore` impl — bounded on `BeginReadOnlyTransaction` —
        // is unavailable.
        self.has_permission_for_entities_impl(Some(authenticated_actor), params)
            .await
    }

    #[expect(clippy::too_many_lines)]
    #[tracing::instrument(skip(self, params))]
    async fn cluster_entities(
        &self,
        actor_id: ActorId,
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
            .has_permission_for_entities_impl(
                Some(actor_id),
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

/// The violations of every failed check in `checks`, in order.
fn provenance_violations(
    checks: impl IntoIterator<Item = Option<ProvenanceViolations>>,
) -> Vec<ProvenanceViolation> {
    checks
        .into_iter()
        .flatten()
        .flat_map(ProvenanceViolations::into_violations)
        .collect()
}

/// The entity types among `entity_type_ids` that the actor may not view.
fn invisible_entity_types<'url>(
    policy_components: &PolicyComponents,
    policy_set: &PolicySet,
    entity_type_ids: impl IntoIterator<Item = &'url VersionedUrl>,
) -> Result<HashSet<VersionedUrl>, Report<EntityCreationError>> {
    let mut invisible = HashSet::new();
    for entity_type_id in entity_type_ids {
        match policy_set
            .evaluate(
                &Request {
                    actor: policy_components.actor_id(),
                    action: ActionName::ViewEntityType,
                    resource: &ResourceId::EntityType(Cow::Borrowed(entity_type_id.into())),
                    context: RequestContext::default(),
                },
                policy_components.context(),
            )
            .change_context(EntityCreationError::Store)?
        {
            Authorized::Always => {}
            Authorized::Never => {
                invisible.insert(entity_type_id.clone());
            }
        }
    }
    Ok(invisible)
}

/// The `missing` entity types together with the `requested` ones the actor may not view.
async fn unknown_entity_types<S>(
    store: &S,
    actor_id: ActorId,
    requested: &HashSet<&VersionedUrl>,
    missing: &HashSet<VersionedUrl>,
) -> Result<HashSet<VersionedUrl>, Report<EntityCreationError>>
where
    S: PrincipalStore + PolicyStore + Sync,
{
    let existing = requested
        .iter()
        .copied()
        .filter(|entity_type_id| !missing.contains(*entity_type_id))
        .collect::<Vec<_>>();
    let mut unknown = missing.clone();
    if existing.is_empty() {
        return Ok(unknown);
    }

    let policy_components = PolicyComponents::builder(store, Some(actor_id))
        .with_entity_type_ids(existing.iter().copied())
        .with_action(ActionName::ViewEntityType, MergePolicies::No)
        .await
        .change_context(EntityCreationError::Store)?;
    let policy_set = policy_components
        .build_policy_set([ActionName::ViewEntityType])
        .change_context(EntityCreationError::Store)?;
    unknown.extend(invisible_entity_types(
        &policy_components,
        &policy_set,
        existing,
    )?);
    Ok(unknown)
}

/// Classifies a failure to resolve the policies for creating entities.
async fn entity_creation_error<S>(
    store: &S,
    actor_id: ActorId,
    requested: &HashSet<&VersionedUrl>,
    report: Report<ContextCreationError>,
) -> Report<EntityCreationError>
where
    S: PrincipalStore + PolicyStore + Sync,
{
    match report.current_context() {
        // The entity types the actor may not view are reported with the missing ones, so the
        // answer does not tell them apart. It is a new report, because the legacy API serializes
        // the sources of a report.
        ContextCreationError::EntityTypesNotFound { entity_type_ids } => {
            match unknown_entity_types(store, actor_id, requested, entity_type_ids).await {
                Ok(entity_type_ids) => {
                    Report::new(EntityCreationError::UnknownEntityTypes { entity_type_ids })
                        .attach_opaque(StatusCode::NotFound)
                }
                Err(report) => report,
            }
        }
        ContextCreationError::ActorNotFound { .. }
        | ContextCreationError::BuildPrincipalContext { .. }
        | ContextCreationError::BuildEntityTypeContext { .. }
        | ContextCreationError::BuildPropertyTypeContext { .. }
        | ContextCreationError::BuildDataTypeContext { .. }
        | ContextCreationError::BuildEntityContext { .. }
        | ContextCreationError::ResolveActorPolicies { .. }
        | ContextCreationError::CreatePolicySet
        | ContextCreationError::CreatePolicyContext
        | ContextCreationError::StoreError => report.change_context(EntityCreationError::Store),
    }
}

/// A version 7 UUID that carries `timestamp`, so the ID sorts with the time it is stored with.
///
/// A timestamp before the Unix epoch, which a version 7 UUID cannot hold, takes the current time.
fn uuid_v7_at<A>(timestamp: Timestamp<A>) -> Uuid {
    let (seconds, nanoseconds) = timestamp.to_unix();
    u64::try_from(seconds).map_or_else(
        |_| Uuid::now_v7(),
        |seconds| Uuid::new_v7(uuid::Timestamp::from_unix(NoContext, seconds, nanoseconds)),
    )
}

/// Builds the statement populating `entity_edition_cache` by aggregating the editions'
/// `entity_is_of_type` rows joined to the referenced types.
///
/// The write paths pass `scoped` to restrict it to the just-written editions
/// (`$1: UUID[]`), `reindex_entity_cache_impl` runs it unscoped over all editions. Must run
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
        label_properties,
        type_titles,
        base_urls,
        versions,
        versioned_urls
    )
    SELECT types.entity_edition_id,
           types.direct_types,
           labels.labels,
           labels.label_properties,
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
                 ) FILTER (WHERE label_value.label IS NOT NULL) AS labels,
                 array_agg(label_value.path
                     ORDER BY entity_types.schema ->> 'title', ontology_ids.base_url,
                              ontology_ids.version DESC, label_value.ordinality
                 ) FILTER (WHERE label_value.label IS NOT NULL) AS label_properties
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
                      label_path.path,
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

impl<C> PostgresStore<C, InTransaction>
where
    C: AsClient,
{
    #[tracing::instrument(level = "info", skip_all)]
    async fn insert_entity_edition(
        &self,
        edition_id: EntityEditionId,
        entity: &Entity,
        provenance: &SqlEntityEditionProvenance,
        metadata: &Valid<PropertyObjectMetadata>,
    ) -> Result<(), Report<InsertionError>> {
        self.as_client()
            .execute(
                "
                    INSERT INTO entity_editions (
                        entity_edition_id,
                        archived,
                        properties,
                        confidence,
                        provenance,
                        property_metadata,
                        created_by_id
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7);
                ",
                &[
                    &edition_id,
                    &entity.metadata.archived,
                    &entity.properties,
                    &entity.metadata.confidence,
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
            .change_context(InsertionError)?;

        let entity_type_ontology_ids = entity
            .metadata
            .entity_type_ids
            .iter()
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

        Ok(())
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
                ) SELECT
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    tstzrange(lower($6::tstzrange), $7, '[)')
                WHERE lower($6::tstzrange) < $7::timestamptz;",
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
                ) SELECT
                    $1,
                    $2,
                    $3,
                    $4,
                    tstzrange($6, NULL, '[)'),
                    tstzrange(lower($5::tstzrange), $7, '[)')
                WHERE lower($5::tstzrange) < $7::timestamptz;",
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
        actor_id: ActorId,
        locked_row: LockedEntityEdition,
        transaction_time: Timestamp<TransactionTime>,
        decision_time: Timestamp<DecisionTime>,
    ) -> Result<(), Report<UpdateError>> {
        // Closing at the start would leave an empty decision interval
        if locked_row.decision_time.start() == &ClosedTemporalBound::Inclusive(decision_time) {
            self.as_client()
                .query(
                    "DELETE FROM entity_temporal_metadata
                     WHERE web_id = $1
                       AND entity_uuid = $2
                       AND draft_id IS NOT DISTINCT FROM $3
                       AND transaction_time @> $4::timestamptz
                       AND decision_time @> $5::timestamptz;",
                    &[
                        &locked_row.entity_id.web_id,
                        &locked_row.entity_id.entity_uuid,
                        &locked_row.entity_id.draft_id,
                        &transaction_time,
                        &decision_time,
                    ],
                )
                .instrument(tracing::info_span!(
                    "DELETE",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres",
                ))
                .await
                .change_context(UpdateError)?;
        } else if let Some(draft_id) = locked_row.entity_id.draft_id {
            self.client
                .as_client()
                .query(
                    "
                UPDATE entity_temporal_metadata
                SET transaction_time = tstzrange($4::timestamptz, NULL, '[)'),
                    decision_time = tstzrange(lower(decision_time), $5::timestamptz, '[)')
                WHERE entity_temporal_metadata.web_id = $1
                  AND entity_temporal_metadata.entity_uuid = $2
                  AND entity_temporal_metadata.draft_id = $3
                  AND entity_temporal_metadata.transaction_time @> $4::timestamptz
                  AND entity_temporal_metadata.decision_time @> $5::timestamptz;",
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
                .change_context(UpdateError)?;
        } else {
            self.client
                .as_client()
                .query(
                    "
                UPDATE entity_temporal_metadata
                SET transaction_time = tstzrange($3::timestamptz, NULL, '[)'),
                    decision_time = tstzrange(lower(decision_time), $4::timestamptz, '[)')
                WHERE entity_temporal_metadata.web_id = $1
                  AND entity_temporal_metadata.entity_uuid = $2
                  AND entity_temporal_metadata.draft_id IS NULL
                  AND entity_temporal_metadata.transaction_time @> $3::timestamptz
                  AND entity_temporal_metadata.decision_time @> $4::timestamptz;",
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
                .change_context(UpdateError)?;
        }

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
                ) SELECT
                    $1,
                    $2,
                    $3,
                    $4,
                    tstzrange(lower($6::tstzrange), $7, '[)'),
                    $5
                WHERE lower($6::tstzrange) < $7::timestamptz;",
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

        self.as_client()
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

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
    use uuid::Version;

    use super::{insert_entity_edition_cache_statement, uuid_v7_at};

    #[test]
    fn uuid_v7_carries_timestamp() {
        let uuid = uuid_v7_at(Timestamp::<TransactionTime>::from_unix_timestamp(
            1_700_000_000,
        ));

        assert_eq!(
            uuid.get_version(),
            Some(Version::SortRand),
            "the UUID should be a UUIDv7"
        );
        assert_eq!(
            uuid.get_timestamp().map(|timestamp| timestamp.to_unix()),
            Some((1_700_000_000, 0)),
            "the UUID should carry the timestamp it was built from"
        );
    }

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
