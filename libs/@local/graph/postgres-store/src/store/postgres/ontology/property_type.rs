use alloc::borrow::Cow;
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _};
use futures::{StreamExt as _, TryStreamExt as _};
use hash_graph_authorization::policies::{
    Authorized, MergePolicies, PolicyComponents, Request, RequestContext, ResourceId,
    action::ActionName, principal::actor::AuthenticatedActor,
};
use hash_graph_store::{
    error::{CheckPermissionError, InsertionError, QueryError, UpdateError},
    filter::Filter,
    property_type::{
        ArchivePropertyTypeParams, CountPropertyTypesParams, CreatePropertyTypeParams,
        HasPermissionForPropertyTypesParams, PropertyTypeQueryPath, PropertyTypeStore,
        QueryPropertyTypeSubgraphParams, QueryPropertyTypeSubgraphResponse,
        QueryPropertyTypesParams, QueryPropertyTypesResponse, UnarchivePropertyTypeParams,
        UpdatePropertyTypeEmbeddingParams, UpdatePropertyTypesParams,
    },
    query::{Ordering, QueryResult as _, VersionedUrlSorting},
    subgraph::{
        Subgraph, SubgraphRecord as _,
        edges::{
            BorrowedTraversalParams, EdgeDirection, OntologyEdgeKind, SubgraphTraversalParams,
            TraversalEdge,
        },
        identifier::{DataTypeVertexId, GraphElementVertexId, PropertyTypeVertexId},
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxes, QueryTemporalAxesUnresolved,
            VariableAxis, VariableTemporalAxisUnresolved,
        },
    },
};
use hash_graph_temporal_versioning::{RightBoundedTemporalInterval, Timestamp, TransactionTime};
use hash_graph_types::Embedding;
use hash_status::StatusCode;
use postgres_types::{Json, ToSql};
use tokio_postgres::{GenericClient as _, Row};
use tracing::{Instrument as _, instrument};
use type_system::{
    Validator as _,
    ontology::{
        OntologyTemporalMetadata,
        data_type::DataTypeUuid,
        id::{OntologyTypeRecordId, OntologyTypeUuid, OntologyTypeVersion, VersionedUrl},
        property_type::{
            PropertyTypeMetadata, PropertyTypeUuid, PropertyTypeWithMetadata,
            schema::PropertyTypeValidator,
        },
        provenance::{OntologyEditionProvenance, OntologyOwnership, OntologyProvenance},
    },
    principal::actor::ActorEntityUuid,
};

use crate::store::{
    error::DeletionError,
    postgres::{
        AsClient, PostgresStore, TraversalContext,
        crud::{QueryIndices, QueryRecordDecode, TypedRow},
        ontology::{PostgresOntologyOwnership, read::OntologyTypeTraversalData},
        query::{
            Distinctness, PostgresRecord, PostgresSorting, ReferenceTable, SelectCompiler, Table,
        },
    },
    validation::StoreProvider,
};

impl<C> PostgresStore<C>
where
    C: AsClient,
{
    #[tracing::instrument(level = "trace", skip(property_types, provider))]
    pub(crate) async fn filter_property_types_by_permission<I, T>(
        property_types: impl IntoIterator<Item = (I, T)> + Send,
        provider: &StoreProvider<'_, Self>,
        temporal_axes: QueryTemporalAxes,
    ) -> Result<impl Iterator<Item = T>, Report<QueryError>>
    where
        I: Into<PropertyTypeUuid> + Send,
        T: Send,
    {
        let (ids, property_types): (Vec<_>, Vec<_>) = property_types
            .into_iter()
            .map(|(id, edge)| (id.into(), edge))
            .unzip();

        let permissions = if let Some(policy_components) = provider.policy_components {
            let mut compiler = SelectCompiler::new(Some(&temporal_axes), true);

            let property_type_ids_filter = Filter::for_property_type_uuids(&ids);
            compiler
                .add_filter(&property_type_ids_filter)
                .change_context(QueryError)?;

            // TODO: Ideally, we'd incorporate the filter in the caller function, but that's not
            //       easily possible as the query there uses features that the query compiler does
            //       not support yet.
            let permission_filter = Filter::<PropertyTypeWithMetadata>::for_policies(
                policy_components.extract_filter_policies(ActionName::ViewPropertyType),
                policy_components.optimization_data(ActionName::ViewPropertyType),
            );
            compiler
                .add_filter(&permission_filter)
                .change_context(QueryError)?;

            let property_type_uuid_idx =
                compiler.add_selection_path(&PropertyTypeQueryPath::OntologyId);

            let (statement, parameters) = compiler.compile();

            Some(
                provider
                    .store
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
                    .map_ok(|row| row.get::<_, PropertyTypeUuid>(property_type_uuid_idx))
                    .try_collect::<HashSet<_>>()
                    .instrument(tracing::trace_span!(
                        "collect_permitted_property_type_uuids"
                    ))
                    .await
                    .change_context(QueryError)?,
            )
        } else {
            None
        };

        Ok(ids
            .into_iter()
            .zip(property_types)
            .filter_map(move |(id, property_type)| {
                let Some(permissions) = &permissions else {
                    return Some(property_type);
                };

                permissions.contains(&id).then_some(property_type)
            }))
    }

    async fn query_property_types_impl(
        &self,
        params: QueryPropertyTypesParams<'_>,
        temporal_axes: &QueryTemporalAxes,
        policy_components: &PolicyComponents,
    ) -> Result<QueryPropertyTypesResponse, Report<QueryError>> {
        let policy_filter = Filter::<PropertyTypeWithMetadata>::for_policies(
            policy_components.extract_filter_policies(ActionName::ViewPropertyType),
            policy_components.optimization_data(ActionName::ViewPropertyType),
        );

        let mut compiler = SelectCompiler::new(Some(temporal_axes), false);
        compiler
            .add_filter(&policy_filter)
            .change_context(QueryError)?;
        compiler
            .add_filter(&params.filter)
            .change_context(QueryError)?;

        let ontology_id_idx = compiler.add_selection_path(&PropertyTypeQueryPath::OntologyId);

        let count = if params.include_count {
            let (statement, parameters) = compiler.compile();

            let property_type_rows = self
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

            Some(property_type_rows.len())
        } else {
            None
        };

        if let Some(limit) = params.limit {
            compiler.set_limit(limit);
        }

        let sorting = VersionedUrlSorting {
            cursor: params.after,
        };
        let cursor_parameters = PostgresSorting::<PropertyTypeWithMetadata>::encode(&sorting)
            .change_context(QueryError)?;
        let cursor_indices = sorting
            .compile(&mut compiler, cursor_parameters.as_ref(), temporal_axes)
            .change_context(QueryError)?;

        let record_indices = PropertyTypeWithMetadata::compile(&mut compiler, &());

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
        let indices = QueryIndices::<PropertyTypeWithMetadata, VersionedUrlSorting> {
            record_indices,
            cursor_indices,
        };

        // TODO: Remove again when subgraph logic was revisited
        //   see https://linear.app/hash/issue/H-297
        let mut visited_ontology_ids = HashSet::new();
        let (property_types, cursor) = {
            let _span =
                tracing::trace_span!("process_query_results", row_count = rows.len()).entered();
            let mut cursor = None;
            let num_rows = rows.len();
            let property_types = rows
                .into_iter()
                .enumerate()
                .filter_map(|(idx, row)| {
                    let id = row.get::<_, PropertyTypeUuid>(ontology_id_idx);
                    let typed_row = TypedRow::<PropertyTypeWithMetadata, VersionedUrl>::from(row);
                    // The records are already sorted by time, so we can just take the first one
                    if idx == num_rows - 1 && params.limit == Some(num_rows) {
                        cursor = Some(typed_row.decode_cursor(&indices));
                    }
                    visited_ontology_ids
                        .insert(id)
                        .then(|| typed_row.decode_record(&indices))
                })
                .collect::<Vec<_>>();
            (property_types, cursor)
        };

        Ok(QueryPropertyTypesResponse {
            cursor,
            property_types,
            count,
        })
    }

    /// Internal method to read a [`PropertyTypeWithMetadata`] into two [`TraversalContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "info", skip(self, traversal_context, provider, subgraph))]
    #[expect(
        clippy::too_many_lines,
        reason = "We currenty have two traversal approaches"
    )]
    pub(crate) async fn traverse_property_types<'edges>(
        &self,
        mut property_type_queue: Vec<(
            PropertyTypeUuid,
            BorrowedTraversalParams<'edges>,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        traversal_context: &mut TraversalContext<'edges>,
        provider: &StoreProvider<'_, Self>,
        subgraph: &mut Subgraph,
    ) -> Result<(), Report<QueryError>> {
        let mut data_type_queue = Vec::new();
        let mut edges_to_traverse = HashMap::<OntologyEdgeKind, OntologyTypeTraversalData>::new();

        while !property_type_queue.is_empty() {
            edges_to_traverse.clear();

            #[expect(clippy::iter_with_drain, reason = "false positive, vector is reused")]
            for (property_type_ontology_id, subgraph_traversal_params, traversal_interval) in
                property_type_queue.drain(..)
            {
                match subgraph_traversal_params {
                    BorrowedTraversalParams::ResolveDepths {
                        traversal_path,
                        graph_resolve_depths: depths,
                    } => {
                        for edge_kind in [
                            OntologyEdgeKind::ConstrainsValuesOn,
                            OntologyEdgeKind::ConstrainsPropertiesOn,
                        ] {
                            if let Some(new_graph_resolve_depths) =
                                depths.decrement_depth_for_edge_kind(edge_kind)
                            {
                                edges_to_traverse.entry(edge_kind).or_default().push(
                                    OntologyTypeUuid::from(property_type_ontology_id),
                                    BorrowedTraversalParams::ResolveDepths {
                                        traversal_path,
                                        graph_resolve_depths: new_graph_resolve_depths,
                                    },
                                    traversal_interval,
                                );
                            }
                        }
                    }
                    BorrowedTraversalParams::Path { traversal_path } => {
                        let Some((edge, rest)) = traversal_path.split_first() else {
                            continue;
                        };

                        let edge_kind = match edge {
                            TraversalEdge::ConstrainsPropertiesOn => {
                                OntologyEdgeKind::ConstrainsPropertiesOn
                            }
                            TraversalEdge::ConstrainsValuesOn => {
                                OntologyEdgeKind::ConstrainsValuesOn
                            }
                            TraversalEdge::InheritsFrom
                            | TraversalEdge::ConstrainsLinksOn
                            | TraversalEdge::ConstrainsLinkDestinationsOn
                            | TraversalEdge::IsOfType
                            | TraversalEdge::HasLeftEntity { .. }
                            | TraversalEdge::HasRightEntity { .. } => continue,
                        };

                        edges_to_traverse.entry(edge_kind).or_default().push(
                            OntologyTypeUuid::from(property_type_ontology_id),
                            BorrowedTraversalParams::Path {
                                traversal_path: rest,
                            },
                            traversal_interval,
                        );
                    }
                }
            }

            for (edge_kind, table) in [(
                OntologyEdgeKind::ConstrainsValuesOn,
                ReferenceTable::PropertyTypeConstrainsValuesOn,
            )] {
                let Some(traversal_data) = edges_to_traverse.remove(&edge_kind) else {
                    continue;
                };

                let traversed_edges = self
                    .read_ontology_edges::<PropertyTypeVertexId, DataTypeVertexId>(
                        &traversal_data,
                        table,
                    )
                    .await?;

                let filtered_traversed_edges = Self::filter_data_types_by_permission(
                    traversed_edges,
                    provider,
                    subgraph.temporal_axes.resolved.clone(),
                )
                .await?;

                for edge in filtered_traversed_edges {
                    subgraph.insert_edge(
                        &edge.left_endpoint,
                        edge_kind,
                        EdgeDirection::Outgoing,
                        edge.right_endpoint.clone(),
                    );

                    let next_traversal = traversal_context.add_data_type_id(
                        DataTypeUuid::from(edge.right_endpoint_ontology_id),
                        edge.traversal_params,
                        edge.traversal_interval,
                    );
                    if let Some((data_type_uuid, traversal_params, interval)) = next_traversal {
                        data_type_queue.push((data_type_uuid, traversal_params, interval));
                    }
                }
            }

            for (edge_kind, table) in [(
                OntologyEdgeKind::ConstrainsPropertiesOn,
                ReferenceTable::PropertyTypeConstrainsPropertiesOn,
            )] {
                let Some(traversal_data) = edges_to_traverse.remove(&edge_kind) else {
                    continue;
                };

                let traversed_edges = self
                    .read_ontology_edges::<PropertyTypeVertexId, PropertyTypeVertexId>(
                        &traversal_data,
                        table,
                    )
                    .await?;

                let filtered_traversed_edges = Self::filter_property_types_by_permission(
                    traversed_edges,
                    provider,
                    subgraph.temporal_axes.resolved.clone(),
                )
                .await?;

                for edge in filtered_traversed_edges {
                    subgraph.insert_edge(
                        &edge.left_endpoint,
                        edge_kind,
                        EdgeDirection::Outgoing,
                        edge.right_endpoint.clone(),
                    );

                    let next_traversal = traversal_context.add_property_type_id(
                        PropertyTypeUuid::from(edge.right_endpoint_ontology_id),
                        edge.traversal_params,
                        edge.traversal_interval,
                    );
                    if let Some((property_type_uuid, traversal_params, interval)) = next_traversal {
                        property_type_queue.push((property_type_uuid, traversal_params, interval));
                    }
                }
            }
        }

        self.traverse_data_types(data_type_queue, traversal_context, provider, subgraph)
            .await?;

        Ok(())
    }

    /// Deletes all property types from the database.
    ///
    /// This function removes all property types along with their associated metadata,
    /// including embeddings and property constraints.
    ///
    /// # Errors
    ///
    /// Returns [`DeletionError`] if the database deletion operation fails or
    /// if the transaction cannot be committed.
    #[tracing::instrument(level = "info", skip(self))]
    pub async fn delete_property_types(&mut self) -> Result<(), Report<DeletionError>> {
        let transaction = self.transaction().await.change_context(DeletionError)?;

        transaction
            .as_client()
            .simple_query(
                "
                    DELETE FROM property_type_embeddings;
                    DELETE FROM property_type_constrains_properties_on;
                    DELETE FROM property_type_constrains_values_on;
                ",
            )
            .instrument(tracing::info_span!(
                "DELETE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError)?;

        let property_types = transaction
            .as_client()
            .query(
                "
                    DELETE FROM property_types
                    RETURNING ontology_id
                ",
                &[],
            )
            .instrument(tracing::info_span!(
                "DELETE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(DeletionError)?
            .into_iter()
            .filter_map(|row| row.get(0))
            .collect::<Vec<OntologyTypeUuid>>();

        transaction.delete_ontology_ids(&property_types).await?;

        transaction.commit().await.change_context(DeletionError)?;

        Ok(())
    }
}

impl<C> PropertyTypeStore for PostgresStore<C>
where
    C: AsClient,
{
    #[tracing::instrument(level = "info", skip(self, params))]
    #[expect(clippy::too_many_lines)]
    async fn create_property_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<PropertyTypeMetadata>, Report<InsertionError>>
    where
        P: IntoIterator<Item = CreatePropertyTypeParams, IntoIter: Send> + Send,
    {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let mut inserted_property_type_metadata = Vec::new();
        let mut inserted_property_types = Vec::new();
        let mut inserted_ontology_ids = Vec::new();

        let mut policy_components_builder = PolicyComponents::builder(&transaction);

        let property_type_validator = PropertyTypeValidator;

        for parameters in params {
            let provenance = OntologyProvenance {
                edition: OntologyEditionProvenance {
                    created_by_id: actor_id,
                    archived_by_id: None,
                    user_defined: parameters.provenance,
                },
            };

            let record_id = OntologyTypeRecordId::from(parameters.schema.id.clone());

            if let OntologyOwnership::Local { web_id } = &parameters.ownership {
                policy_components_builder.add_property_type(&parameters.schema.id, Some(*web_id));
            } else {
                policy_components_builder.add_property_type(&parameters.schema.id, None);
            }

            if let Some((ontology_id, temporal_versioning)) = transaction
                .create_ontology_metadata(
                    &parameters.schema.id,
                    &parameters.ownership,
                    parameters.conflict_behavior,
                    &provenance,
                )
                .await?
            {
                transaction
                    .insert_property_type_with_id(
                        ontology_id,
                        property_type_validator
                            .validate_ref(&parameters.schema)
                            .change_context(InsertionError)?,
                    )
                    .await?;
                let metadata = PropertyTypeMetadata {
                    record_id,
                    ownership: parameters.ownership,
                    temporal_versioning,
                    provenance,
                };

                inserted_ontology_ids.push(ontology_id);
                inserted_property_types.push(PropertyTypeWithMetadata {
                    schema: parameters.schema,
                    metadata: metadata.clone(),
                });
                inserted_property_type_metadata.push(metadata);
            }
        }

        let policy_components = policy_components_builder
            .with_actor(actor_id)
            .with_actions([ActionName::CreatePropertyType], MergePolicies::No)
            .await
            .change_context(InsertionError)?;

        let policy_set = policy_components
            .build_policy_set([ActionName::CreatePropertyType])
            .change_context(InsertionError)?;

        // Evaluate authorization for each property type
        for inserted_property_type in &inserted_property_types {
            match policy_set
                .evaluate(
                    &Request {
                        actor: policy_components.actor_id(),
                        action: ActionName::CreatePropertyType,
                        resource: &ResourceId::PropertyType(Cow::Borrowed(
                            (&inserted_property_type.schema.id).into(),
                        )),
                        context: RequestContext::default(),
                    },
                    policy_components.context(),
                )
                .change_context(InsertionError)?
            {
                Authorized::Always => {}
                Authorized::Never => {
                    return Err(Report::new(InsertionError)
                        .attach_opaque(StatusCode::PermissionDenied)
                        .attach(format!(
                            "The actor does not have permission to create the property type `{}`",
                            inserted_property_type.schema.id
                        )));
                }
            }
        }

        for (ontology_id, property_type) in inserted_ontology_ids
            .into_iter()
            .zip(&inserted_property_types)
        {
            transaction
                .insert_property_type_references(&property_type.schema, ontology_id)
                .await
                .change_context(InsertionError)
                .attach_with(|| {
                    format!(
                        "could not insert references for property type: {}",
                        &property_type.schema.id
                    )
                })
                .attach_opaque_with(|| property_type.schema.clone())?;
        }

        transaction.commit().await.change_context(InsertionError)?;

        if !self.settings.skip_embedding_creation
            && let Some(temporal_client) = &self.temporal_client
        {
            temporal_client
                .start_update_property_type_embeddings_workflow(actor_id, &inserted_property_types)
                .await
                .change_context(InsertionError)?;
        }

        Ok(inserted_property_type_metadata)
    }

    async fn count_property_types(
        &self,
        actor_id: ActorEntityUuid,
        mut params: CountPropertyTypesParams<'_>,
    ) -> Result<usize, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_action(ActionName::ViewPropertyType, MergePolicies::Yes)
            .await
            .change_context(QueryError)?;

        params
            .filter
            .convert_parameters(&StoreProvider::new(self, &policy_components))
            .await
            .change_context(QueryError)?;

        let policy_filter = Filter::<PropertyTypeWithMetadata>::for_policies(
            policy_components.extract_filter_policies(ActionName::ViewPropertyType),
            policy_components.optimization_data(ActionName::ViewPropertyType),
        );

        let temporal_axes = params.temporal_axes.resolve();
        let mut compiler = SelectCompiler::new(Some(&temporal_axes), false);
        compiler
            .add_filter(&policy_filter)
            .change_context(QueryError)?;
        compiler
            .add_filter(&params.filter)
            .change_context(QueryError)?;

        let (statement, parameters) = compiler.compile();

        Ok(self
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
            .count()
            .await)
    }

    async fn query_property_types(
        &self,
        actor_id: ActorEntityUuid,
        mut params: QueryPropertyTypesParams<'_>,
    ) -> Result<QueryPropertyTypesResponse, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_action(ActionName::ViewPropertyType, MergePolicies::Yes)
            .await
            .change_context(QueryError)?;

        params
            .filter
            .convert_parameters(&StoreProvider::new(self, &policy_components))
            .await
            .change_context(QueryError)?;

        let temporal_axes = params.temporal_axes.resolve();
        self.query_property_types_impl(params, &temporal_axes, &policy_components)
            .await
    }

    #[tracing::instrument(level = "info", skip(self))]
    #[expect(clippy::too_many_lines)]
    async fn query_property_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        params: QueryPropertyTypeSubgraphParams<'_>,
    ) -> Result<QueryPropertyTypeSubgraphResponse, Report<QueryError>> {
        let actions = params.view_actions();

        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_actions(actions, MergePolicies::Yes)
            .await
            .change_context(QueryError)?;

        let provider = StoreProvider::new(self, &policy_components);

        let (mut request, traversal_params) = params.into_request();
        request
            .filter
            .convert_parameters(&provider)
            .await
            .change_context(QueryError)?;

        let temporal_axes = request.temporal_axes.resolve();
        let time_axis = temporal_axes.variable_time_axis();

        let mut subgraph = Subgraph::new(request.temporal_axes, temporal_axes.clone());

        let QueryPropertyTypesResponse {
            property_types,
            cursor,
            count,
        } = self
            .query_property_types_impl(request, &temporal_axes, &policy_components)
            .await?;

        let (property_type_ids, property_type_vertex_ids): (Vec<_>, Vec<_>) = property_types
            .iter()
            .map(|property_type| {
                (
                    PropertyTypeUuid::from_url(&property_type.schema.id),
                    GraphElementVertexId::from(property_type.vertex_id(time_axis)),
                )
            })
            .unzip();
        subgraph.roots.extend(property_type_vertex_ids);
        subgraph.vertices.property_types = property_types
            .into_iter()
            .map(|property_type| (property_type.vertex_id(time_axis), property_type))
            .collect();

        let mut traversal_context = TraversalContext::default();

        // TODO: We currently pass in the subgraph as mutable reference, thus we cannot borrow the
        //       vertices and have to `.collect()` the keys.
        self.traverse_property_types(
            property_type_ids
                .into_iter()
                .flat_map(|id| {
                    match &traversal_params {
                        // TODO: The `vec` is not ideal as the flattening intermediate type but this
                        //       branch will be removed anyway after the migration to traversal path
                        //       based traversal is done
                        SubgraphTraversalParams::Paths { traversal_paths } => traversal_paths
                            .iter()
                            .map(|path| {
                                (
                                    id,
                                    BorrowedTraversalParams::Path {
                                        traversal_path: &path.edges,
                                    },
                                    subgraph.temporal_axes.resolved.variable_interval(),
                                )
                            })
                            .collect(),
                        SubgraphTraversalParams::ResolveDepths {
                            traversal_paths,
                            graph_resolve_depths,
                        } => {
                            if traversal_paths.is_empty() {
                                // If no entity traversal paths are specified, still initialize
                                // the traversal queue with ontology resolve depths to enable
                                // traversal of ontology edges (e.g., constrainsValuesOn)
                                vec![(
                                    id,
                                    BorrowedTraversalParams::ResolveDepths {
                                        traversal_path: &[],
                                        graph_resolve_depths: *graph_resolve_depths,
                                    },
                                    subgraph.temporal_axes.resolved.variable_interval(),
                                )]
                            } else {
                                traversal_paths
                                    .iter()
                                    .map(|path| {
                                        (
                                            id,
                                            BorrowedTraversalParams::ResolveDepths {
                                                traversal_path: &path.edges,
                                                graph_resolve_depths: *graph_resolve_depths,
                                            },
                                            subgraph.temporal_axes.resolved.variable_interval(),
                                        )
                                    })
                                    .collect()
                            }
                        }
                    }
                })
                .collect(),
            &mut traversal_context,
            &provider,
            &mut subgraph,
        )
        .await?;

        traversal_context
            .read_traversed_vertices(self, &mut subgraph, false, &policy_components)
            .await?;

        Ok(QueryPropertyTypeSubgraphResponse {
            subgraph,
            cursor,
            count,
        })
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    #[expect(clippy::too_many_lines)]
    async fn update_property_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<PropertyTypeMetadata>, Report<UpdateError>>
    where
        P: IntoIterator<Item = UpdatePropertyTypesParams, IntoIter: Send> + Send,
    {
        let transaction = self.transaction().await.change_context(UpdateError)?;

        let mut updated_property_type_metadata = Vec::new();
        let mut inserted_property_types = Vec::new();
        let mut inserted_ontology_ids = Vec::new();

        let mut old_property_type_ids = Vec::new();

        let property_type_validator = PropertyTypeValidator;

        for parameters in params {
            let provenance = OntologyProvenance {
                edition: OntologyEditionProvenance {
                    created_by_id: actor_id,
                    archived_by_id: None,
                    user_defined: parameters.provenance,
                },
            };

            old_property_type_ids.push(VersionedUrl {
                base_url: parameters.schema.id.base_url.clone(),
                version: OntologyTypeVersion {
                    major: parameters
                        .schema
                        .id
                        .version
                        .major
                        .checked_sub(1)
                        .ok_or(UpdateError)
                        .attach(
                            "The version of the property type is already at the lowest possible \
                             value",
                        )?,
                    pre_release: None,
                },
            });

            let record_id = OntologyTypeRecordId::from(parameters.schema.id.clone());

            let (ontology_id, web_id, temporal_versioning) = transaction
                .update_owned_ontology_id(&parameters.schema.id, &provenance.edition)
                .await?;

            transaction
                .insert_property_type_with_id(
                    ontology_id,
                    property_type_validator
                        .validate_ref(&parameters.schema)
                        .change_context(UpdateError)?,
                )
                .await
                .change_context(UpdateError)?;
            let metadata = PropertyTypeMetadata {
                record_id,
                ownership: OntologyOwnership::Local { web_id },
                temporal_versioning,
                provenance,
            };

            inserted_ontology_ids.push(ontology_id);
            inserted_property_types.push(PropertyTypeWithMetadata {
                schema: parameters.schema,
                metadata: metadata.clone(),
            });
            updated_property_type_metadata.push(metadata);
        }

        let policy_components = PolicyComponents::builder(&transaction)
            .with_actor(actor_id)
            .with_property_type_ids(&old_property_type_ids)
            .with_actions([ActionName::UpdatePropertyType], MergePolicies::No)
            .await
            .change_context(UpdateError)?;

        let policy_set = policy_components
            .build_policy_set([ActionName::UpdatePropertyType])
            .change_context(UpdateError)?;

        for property_type_id in &old_property_type_ids {
            match policy_set
                .evaluate(
                    &Request {
                        actor: policy_components.actor_id(),
                        action: ActionName::UpdatePropertyType,
                        resource: &ResourceId::PropertyType(Cow::Borrowed(property_type_id.into())),
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
                            "The actor does not have permission to update the property type \
                             `{property_type_id}`"
                        )));
                }
            }
        }

        for (ontology_id, property_type) in inserted_ontology_ids
            .into_iter()
            .zip(&inserted_property_types)
        {
            transaction
                .insert_property_type_references(&property_type.schema, ontology_id)
                .await
                .change_context(UpdateError)
                .attach_with(|| {
                    format!(
                        "could not insert references for property type: {}",
                        &property_type.schema.id
                    )
                })
                .attach_opaque_with(|| property_type.schema.clone())?;
        }

        transaction.commit().await.change_context(UpdateError)?;

        if !self.settings.skip_embedding_creation
            && let Some(temporal_client) = &self.temporal_client
        {
            temporal_client
                .start_update_property_type_embeddings_workflow(actor_id, &inserted_property_types)
                .await
                .change_context(UpdateError)?;
        }

        Ok(updated_property_type_metadata)
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn archive_property_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: ArchivePropertyTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_property_type_id(&params.property_type_id)
            .with_actions([ActionName::ArchivePropertyType], MergePolicies::No)
            .await
            .change_context(UpdateError)?;

        match policy_components
            .build_policy_set([ActionName::ArchivePropertyType])
            .change_context(UpdateError)?
            .evaluate(
                &Request {
                    actor: policy_components.actor_id(),
                    action: ActionName::ArchivePropertyType,
                    resource: &ResourceId::PropertyType(Cow::Borrowed(
                        (&*params.property_type_id).into(),
                    )),
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
                        "The actor does not have permission to archive the property type `{}`",
                        params.property_type_id
                    )));
            }
        }

        self.archive_ontology_type(&params.property_type_id, actor_id)
            .await
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn unarchive_property_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UnarchivePropertyTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_property_type_id(&params.property_type_id)
            .with_actions([ActionName::ArchivePropertyType], MergePolicies::No)
            .await
            .change_context(UpdateError)?;

        match policy_components
            .build_policy_set([ActionName::ArchivePropertyType])
            .change_context(UpdateError)?
            .evaluate(
                &Request {
                    actor: policy_components.actor_id(),
                    action: ActionName::ArchivePropertyType,
                    resource: &ResourceId::PropertyType(Cow::Borrowed(
                        (&*params.property_type_id).into(),
                    )),
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
                        "The actor does not have permission to unarchive the property type `{}`",
                        params.property_type_id
                    )));
            }
        }

        self.unarchive_ontology_type(
            &params.property_type_id,
            &OntologyEditionProvenance {
                created_by_id: actor_id,
                archived_by_id: None,
                user_defined: params.provenance,
            },
        )
        .await
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn update_property_type_embeddings(
        &mut self,
        _: ActorEntityUuid,
        params: UpdatePropertyTypeEmbeddingParams<'_>,
    ) -> Result<(), Report<UpdateError>> {
        #[derive(Debug, ToSql)]
        #[postgres(name = "property_type_embeddings")]
        pub struct PropertyTypeEmbeddingsRow<'a> {
            ontology_id: OntologyTypeUuid,
            embedding: Embedding<'a>,
            updated_at_transaction_time: Timestamp<TransactionTime>,
        }
        let property_type_embeddings = vec![PropertyTypeEmbeddingsRow {
            ontology_id: OntologyTypeUuid::from(DataTypeUuid::from_url(&params.property_type_id)),
            embedding: params.embedding,
            updated_at_transaction_time: params.updated_at_transaction_time,
        }];

        // TODO: Add permission to allow updating embeddings
        //   see https://linear.app/hash/issue/H-1870

        self.as_client()
            .query(
                "
                WITH base_urls AS (
                        SELECT base_url, MAX(version) as max_version
                        FROM ontology_ids
                        GROUP BY base_url
                    ),
                    provided_embeddings AS (
                        SELECT embeddings.*, base_url, max_version
                        FROM UNNEST($1::property_type_embeddings[]) AS embeddings
                        JOIN ontology_ids USING (ontology_id)
                        JOIN base_urls USING (base_url)
                        WHERE version = max_version
                    ),
                    embeddings_to_delete AS (
                        SELECT property_type_embeddings.ontology_id
                        FROM provided_embeddings
                        JOIN ontology_ids using (base_url)
                        JOIN property_type_embeddings
                          ON ontology_ids.ontology_id = property_type_embeddings.ontology_id
                        WHERE version < max_version
                           OR ($2 AND version = max_version
                                  AND property_type_embeddings.updated_at_transaction_time
                                   <= provided_embeddings.updated_at_transaction_time)
                    ),
                    deleted AS (
                        DELETE FROM property_type_embeddings
                        WHERE (ontology_id) IN (SELECT ontology_id FROM embeddings_to_delete)
                    )
                INSERT INTO property_type_embeddings
                SELECT
                    ontology_id,
                    embedding,
                    updated_at_transaction_time
                FROM provided_embeddings
                ON CONFLICT (ontology_id) DO UPDATE SET
                    embedding = EXCLUDED.embedding,
                    updated_at_transaction_time = EXCLUDED.updated_at_transaction_time
                WHERE property_type_embeddings.updated_at_transaction_time
                      <= EXCLUDED.updated_at_transaction_time;
                ",
                &[&property_type_embeddings, &params.reset],
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

    #[tracing::instrument(skip(self, params))]
    async fn has_permission_for_property_types(
        &self,
        authenticated_actor: AuthenticatedActor,
        params: HasPermissionForPropertyTypesParams<'_>,
    ) -> Result<HashSet<VersionedUrl>, Report<hash_graph_store::error::CheckPermissionError>> {
        let temporal_axes = QueryTemporalAxesUnresolved::DecisionTime {
            pinned: PinnedTemporalAxisUnresolved::new(None),
            variable: VariableTemporalAxisUnresolved::new(None, None),
        }
        .resolve();
        let mut compiler = SelectCompiler::new(Some(&temporal_axes), true);

        let property_type_uuids = params
            .property_type_ids
            .iter()
            .map(PropertyTypeUuid::from_url)
            .collect::<Vec<_>>();

        let property_type_filter = Filter::for_property_type_uuids(&property_type_uuids);
        compiler
            .add_filter(&property_type_filter)
            .change_context(CheckPermissionError::CompileFilter)?;

        let policy_components = PolicyComponents::builder(self)
            .with_actor(authenticated_actor)
            .with_action(params.action, MergePolicies::Yes)
            .await
            .change_context(CheckPermissionError::BuildPolicyContext)?;
        let policy_filter = Filter::<PropertyTypeWithMetadata>::for_policies(
            policy_components.extract_filter_policies(params.action),
            policy_components.optimization_data(params.action),
        );
        compiler
            .add_filter(&policy_filter)
            .change_context(CheckPermissionError::CompileFilter)?;

        let versioned_url_idx = compiler.add_selection_path(&PropertyTypeQueryPath::VersionedUrl);

        let (statement, parameters) = compiler.compile();
        self.as_client()
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
            .map_ok(|row| row.get(versioned_url_idx))
            .try_collect()
            .await
            .change_context(CheckPermissionError::StoreError)
    }
}

#[derive(Debug, Copy, Clone)]
pub struct PropertyTypeRowIndices {
    pub base_url: usize,
    pub version: usize,
    pub transaction_time: usize,

    pub schema: usize,

    pub edition_provenance: usize,
    pub additional_metadata: usize,
}

impl QueryRecordDecode for PropertyTypeWithMetadata {
    type Indices = PropertyTypeRowIndices;
    type Output = Self;

    fn decode(row: &Row, indices: &Self::Indices) -> Self {
        let record_id = OntologyTypeRecordId {
            base_url: row.get(indices.base_url),
            version: row.get(indices.version),
        };

        if let Ok(distance) = row.try_get::<_, f64>("distance") {
            tracing::trace!(%record_id, %distance, "Property type embedding was calculated");
        }

        Self {
            schema: row.get::<_, Json<_>>(indices.schema).0,
            metadata: PropertyTypeMetadata {
                record_id,
                ownership: row
                    .get::<_, Json<PostgresOntologyOwnership>>(indices.additional_metadata)
                    .0
                    .into(),
                temporal_versioning: OntologyTemporalMetadata {
                    transaction_time: row.get(indices.transaction_time),
                },
                provenance: OntologyProvenance {
                    edition: row.get(indices.edition_provenance),
                },
            },
        }
    }
}

impl PostgresRecord for PropertyTypeWithMetadata {
    type CompilationParameters = ();

    fn base_table() -> Table {
        Table::OntologyTemporalMetadata
    }

    fn parameters() -> Self::CompilationParameters {}

    #[instrument(level = "info", skip(compiler, _paths))]
    fn compile<'p, 'q: 'p>(
        compiler: &mut SelectCompiler<'p, 'q, Self>,
        _paths: &Self::CompilationParameters,
    ) -> Self::Indices {
        PropertyTypeRowIndices {
            base_url: compiler.add_distinct_selection_with_ordering(
                &PropertyTypeQueryPath::BaseUrl,
                Distinctness::Distinct,
                None,
            ),
            version: compiler.add_distinct_selection_with_ordering(
                &PropertyTypeQueryPath::Version,
                Distinctness::Distinct,
                None,
            ),
            transaction_time: compiler.add_distinct_selection_with_ordering(
                &PropertyTypeQueryPath::TransactionTime,
                Distinctness::Distinct,
                Some((Ordering::Descending, None)),
            ),
            schema: compiler.add_selection_path(&PropertyTypeQueryPath::Schema(None)),
            edition_provenance: compiler
                .add_selection_path(&PropertyTypeQueryPath::EditionProvenance(None)),
            additional_metadata: compiler
                .add_selection_path(&PropertyTypeQueryPath::AdditionalMetadata),
        }
    }
}
