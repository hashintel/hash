use alloc::{borrow::Cow, sync::Arc};
use core::mem;
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _};
use futures::{StreamExt as _, TryStreamExt as _};
use hash_graph_authorization::policies::{
    Authorized, MergePolicies, PolicyComponents, Request, RequestContext, ResourceId,
    action::ActionName, principal::actor::AuthenticatedActor,
};
use hash_graph_store::{
    data_type::{
        ArchiveDataTypeParams, CountDataTypesParams, CreateDataTypeParams,
        DataTypeConversionTargets, DataTypeQueryPath, DataTypeStore,
        FindDataTypeConversionTargetsParams, FindDataTypeConversionTargetsResponse,
        HasPermissionForDataTypesParams, QueryDataTypeSubgraphParams,
        QueryDataTypeSubgraphResponse, QueryDataTypesParams, QueryDataTypesResponse,
        UnarchiveDataTypeParams, UpdateDataTypeEmbeddingParams, UpdateDataTypesParams,
    },
    error::{CheckPermissionError, InsertionError, QueryError, UpdateError},
    filter::{Filter, FilterExpression, FilterExpressionList, ParameterList},
    query::{Ordering, QueryResult as _, Read, VersionedUrlSorting},
    subgraph::{
        Subgraph, SubgraphRecord as _,
        edges::{
            BorrowedTraversalParams, EdgeDirection, OntologyEdgeKind, SubgraphTraversalParams,
            TraversalEdge,
        },
        identifier::{DataTypeVertexId, GraphElementVertexId},
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
    Valid, Validator as _,
    ontology::{
        InheritanceDepth, OntologyTemporalMetadata,
        data_type::{
            ClosedDataType, ConversionDefinition, Conversions, DataTypeMetadata, DataTypeUuid,
            DataTypeWithMetadata,
            schema::{DataType, DataTypeEdge, DataTypeResolveData, DataTypeValidator},
        },
        id::{BaseUrl, OntologyTypeRecordId, OntologyTypeUuid, OntologyTypeVersion, VersionedUrl},
        json_schema::OntologyTypeResolver,
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
            Distinctness, InsertStatementBuilder, PostgresRecord, PostgresSorting, ReferenceTable,
            SelectCompiler, Table, rows::DataTypeConversionsRow,
        },
    },
    validation::StoreProvider,
};

impl<C> PostgresStore<C>
where
    C: AsClient,
{
    #[tracing::instrument(level = "info", skip(data_types, provider))]
    pub(crate) async fn filter_data_types_by_permission<I, T>(
        data_types: impl IntoIterator<Item = (I, T)> + Send,
        provider: &StoreProvider<'_, Self>,
        temporal_axes: QueryTemporalAxes,
    ) -> Result<impl Iterator<Item = T>, Report<QueryError>>
    where
        I: Into<DataTypeUuid> + Send,
        T: Send,
    {
        let (ids, data_types): (Vec<_>, Vec<_>) = data_types
            .into_iter()
            .map(|(id, edge)| (id.into(), edge))
            .unzip();

        let allowed_ids = if let Some(policy_components) = provider.policy_components {
            let mut compiler = SelectCompiler::new(Some(&temporal_axes), true);

            let data_type_ids_filter = Filter::for_data_type_uuids(&ids);
            compiler
                .add_filter(&data_type_ids_filter)
                .change_context(QueryError)?;

            let permission_filter = Filter::<DataTypeWithMetadata>::for_policies(
                policy_components.extract_filter_policies(ActionName::ViewDataType),
                policy_components.optimization_data(ActionName::ViewDataType),
            );
            compiler
                .add_filter(&permission_filter)
                .change_context(QueryError)?;

            let data_type_uuid_idx = compiler.add_selection_path(&DataTypeQueryPath::OntologyId);

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
                    .map_ok(|row| row.get::<_, DataTypeUuid>(data_type_uuid_idx))
                    .try_collect::<HashSet<_>>()
                    .await
                    .change_context(QueryError)?,
            )
        } else {
            None
        };

        Ok(ids
            .into_iter()
            .zip(data_types)
            .filter_map(move |(id, data_type)| {
                let Some(allowed_ids) = &allowed_ids else {
                    return Some(data_type);
                };

                allowed_ids.contains(&id).then_some(data_type)
            }))
    }

    async fn get_data_type_inheritance_metadata(
        &self,
        data_types: &[DataTypeUuid],
    ) -> Result<impl Iterator<Item = (DataTypeUuid, DataTypeResolveData)>, Report<QueryError>> {
        Ok(self
            .as_client()
            .query(
                "
                    SELECT
                        source_data_type_ontology_id,
                        array_agg(target_data_type_ontology_id),
                        array_agg(depth),
                        array_agg(schema)
                    FROM (
                        SELECT *
                        FROM data_type_inherits_from
                        JOIN data_types ON target_data_type_ontology_id = ontology_id
                        WHERE source_data_type_ontology_id = ANY($1)
                        ORDER BY source_data_type_ontology_id, depth, schema->>'$id'
                    ) AS subquery
                    GROUP BY source_data_type_ontology_id;
                ",
                &[&data_types],
            )
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(QueryError)?
            .into_iter()
            .map(|row| {
                let source_id: DataTypeUuid = row.get(0);
                let targets: Vec<DataTypeUuid> = row.get(1);
                let depths: Vec<InheritanceDepth> = row.get(2);
                let schemas: Vec<Valid<DataType>> = row.get(3);

                let mut resolve_data = DataTypeResolveData::default();
                for ((target_id, schema), depth) in targets.into_iter().zip(schemas).zip(depths) {
                    resolve_data.add_edge(
                        DataTypeEdge::Inheritance,
                        Arc::new(schema.into_inner()),
                        target_id,
                        depth.inner(),
                    );
                }

                (source_id, resolve_data)
            }))
    }

    async fn query_data_types_impl(
        &self,
        params: QueryDataTypesParams<'_>,
        temporal_axes: &QueryTemporalAxes,
        policy_components: &PolicyComponents,
    ) -> Result<QueryDataTypesResponse, Report<QueryError>> {
        let policy_filter = Filter::<DataTypeWithMetadata>::for_policies(
            policy_components.extract_filter_policies(ActionName::ViewDataType),
            policy_components.optimization_data(ActionName::ViewDataType),
        );

        let mut compiler = SelectCompiler::new(Some(temporal_axes), false);
        compiler
            .add_filter(&policy_filter)
            .change_context(QueryError)?;
        compiler
            .add_filter(&params.filter)
            .change_context(QueryError)?;

        let ontology_id_idx = compiler.add_selection_path(&DataTypeQueryPath::OntologyId);

        let count = if params.include_count {
            let (statement, parameters) = compiler.compile();

            let data_type_rows = self
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

            Some(data_type_rows.len())
        } else {
            None
        };

        if let Some(limit) = params.limit {
            compiler.set_limit(limit);
        }

        let sorting = VersionedUrlSorting {
            cursor: params.after,
        };
        let cursor_parameters =
            <VersionedUrlSorting as PostgresSorting<DataTypeWithMetadata>>::encode(&sorting)
                .change_context(QueryError)?;
        let cursor_indices = sorting
            .compile(&mut compiler, cursor_parameters.as_ref(), temporal_axes)
            .change_context(QueryError)?;

        let record_indices = DataTypeWithMetadata::compile(&mut compiler, &());

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
        let indices = QueryIndices::<DataTypeWithMetadata, VersionedUrlSorting> {
            record_indices,
            cursor_indices,
        };

        // TODO: Remove again when subgraph logic was revisited
        //   see https://linear.app/hash/issue/H-297
        let mut visited_ontology_ids = HashSet::new();
        let (data_types, cursor) = {
            let _span =
                tracing::trace_span!("process_query_results", row_count = rows.len()).entered();
            let mut cursor = None;
            let num_rows = rows.len();
            let data_types = rows
                .into_iter()
                .enumerate()
                .filter_map(|(idx, row)| {
                    let id = row.get::<_, DataTypeUuid>(ontology_id_idx);
                    let typed_row = TypedRow::<DataTypeWithMetadata, VersionedUrl>::from(row);
                    if idx == num_rows - 1 && params.limit == Some(num_rows) {
                        cursor = Some(typed_row.decode_cursor(&indices));
                    }
                    // The records are already sorted by time, so we can just take the first one
                    visited_ontology_ids
                        .insert(id)
                        .then(|| typed_row.decode_record(&indices))
                })
                .collect::<Vec<_>>();
            (data_types, cursor)
        };

        Ok(QueryDataTypesResponse {
            cursor,
            data_types,
            count,
        })
    }

    /// Internal method to read a [`DataTypeWithMetadata`] into a [`TraversalContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "info", skip(self, provider, subgraph))]
    pub(crate) async fn traverse_data_types<'edges>(
        &self,
        mut data_type_queue: Vec<(
            DataTypeUuid,
            BorrowedTraversalParams<'edges>,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        traversal_context: &mut TraversalContext<'edges>,
        provider: &StoreProvider<'_, Self>,
        subgraph: &mut Subgraph,
    ) -> Result<(), Report<QueryError>> {
        let mut edges_to_traverse = HashMap::<OntologyEdgeKind, OntologyTypeTraversalData>::new();

        while !data_type_queue.is_empty() {
            edges_to_traverse.clear();

            for (data_type_ontology_id, subgraph_traversal_params, traversal_interval) in
                mem::take(&mut data_type_queue)
            {
                match subgraph_traversal_params {
                    BorrowedTraversalParams::ResolveDepths {
                        traversal_path: _,
                        graph_resolve_depths: depths,
                    } => {
                        for edge_kind in [
                            OntologyEdgeKind::InheritsFrom,
                            OntologyEdgeKind::ConstrainsValuesOn,
                        ] {
                            if let Some(new_graph_resolve_depths) =
                                depths.decrement_depth_for_edge_kind(edge_kind)
                            {
                                edges_to_traverse.entry(edge_kind).or_default().push(
                                    OntologyTypeUuid::from(data_type_ontology_id),
                                    BorrowedTraversalParams::ResolveDepths {
                                        traversal_path: &[],
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
                            TraversalEdge::InheritsFrom => OntologyEdgeKind::InheritsFrom,
                            TraversalEdge::ConstrainsValuesOn => {
                                OntologyEdgeKind::ConstrainsValuesOn
                            }
                            TraversalEdge::ConstrainsPropertiesOn
                            | TraversalEdge::ConstrainsLinksOn
                            | TraversalEdge::ConstrainsLinkDestinationsOn
                            | TraversalEdge::IsOfType
                            | TraversalEdge::HasLeftEntity { .. }
                            | TraversalEdge::HasRightEntity { .. } => continue,
                        };

                        edges_to_traverse.entry(edge_kind).or_default().push(
                            OntologyTypeUuid::from(data_type_ontology_id),
                            BorrowedTraversalParams::Path {
                                traversal_path: rest,
                            },
                            traversal_interval,
                        );
                    }
                }
            }

            for (edge_kind, table) in [(
                OntologyEdgeKind::InheritsFrom,
                ReferenceTable::DataTypeInheritsFrom {
                    // TODO: Use the resolve depths passed to the query
                    inheritance_depth: Some(0),
                },
            )] {
                let Some(traversal_data) = edges_to_traverse.remove(&edge_kind) else {
                    continue;
                };

                let traversed_edges = self
                    .read_ontology_edges::<DataTypeVertexId, DataTypeVertexId>(
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
        }

        Ok(())
    }

    /// Deletes all data types from the database.
    ///
    /// This function removes all data types along with their associated metadata,
    /// including embeddings, inheritance relationships, and conversions.
    ///
    /// # Errors
    ///
    /// Returns [`DeletionError`] if the database deletion operation fails or
    /// if the transaction cannot be committed.
    #[tracing::instrument(level = "info", skip(self))]
    pub async fn delete_data_types(&mut self) -> Result<(), Report<DeletionError>> {
        let transaction = self.transaction().await.change_context(DeletionError)?;

        transaction
            .as_client()
            .simple_query(
                "
                    DELETE FROM data_type_embeddings;
                    DELETE FROM data_type_inherits_from;
                    DELETE FROM data_type_conversions;
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

        let data_types = transaction
            .as_client()
            .query(
                "
                    DELETE FROM data_types
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

        transaction.delete_ontology_ids(&data_types).await?;

        transaction.commit().await.change_context(DeletionError)?;

        Ok(())
    }
}

impl<C> DataTypeStore for PostgresStore<C>
where
    C: AsClient,
{
    #[tracing::instrument(level = "info", skip(self, params))]
    #[expect(clippy::too_many_lines)]
    async fn create_data_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<DataTypeMetadata>, Report<InsertionError>>
    where
        P: IntoIterator<Item = CreateDataTypeParams, IntoIter: Send> + Send,
    {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let mut inserted_data_type_metadata = Vec::new();
        let mut inserted_data_types = Vec::new();
        let mut data_type_reference_ids = HashSet::new();
        let mut data_type_conversions_rows = Vec::new();

        let mut policy_components_builder = PolicyComponents::builder(&transaction);

        for parameters in params {
            let provenance = OntologyProvenance {
                edition: OntologyEditionProvenance {
                    created_by_id: actor_id,
                    archived_by_id: None,
                    user_defined: parameters.provenance,
                },
            };

            let record_id = OntologyTypeRecordId::from(parameters.schema.id.clone());
            let data_type_id = DataTypeUuid::from_url(&parameters.schema.id);
            if let OntologyOwnership::Local { web_id } = &parameters.ownership {
                policy_components_builder.add_data_type(&parameters.schema.id, Some(*web_id));
            } else {
                policy_components_builder.add_data_type(&parameters.schema.id, None);
            }

            if let Some((_ontology_id, temporal_versioning)) = transaction
                .create_ontology_metadata(
                    &parameters.schema.id,
                    &parameters.ownership,
                    parameters.conflict_behavior,
                    &provenance,
                )
                .await?
            {
                data_type_reference_ids.extend(
                    parameters
                        .schema
                        .data_type_references()
                        .map(|(reference, _)| DataTypeUuid::from_url(&reference.url)),
                );
                inserted_data_types.push((data_type_id, Arc::new(parameters.schema)));
                data_type_conversions_rows.extend(parameters.conversions.iter().map(
                    |(base_url, conversions)| DataTypeConversionsRow {
                        source_data_type_ontology_id: data_type_id,
                        target_data_type_base_url: base_url.clone(),
                        from: conversions.from.clone(),
                        into: conversions.to.clone(),
                    },
                ));
                inserted_data_type_metadata.push(DataTypeMetadata {
                    record_id,
                    ownership: parameters.ownership,
                    temporal_versioning,
                    provenance,
                    conversions: parameters.conversions,
                });
            }
        }

        let policy_components = policy_components_builder
            .with_actor(actor_id)
            .with_actions([ActionName::CreateDataType], MergePolicies::No)
            .await
            .change_context(InsertionError)?;

        let policy_set = policy_components
            .build_policy_set([ActionName::CreateDataType])
            .change_context(InsertionError)?;

        let mut ontology_type_resolver = OntologyTypeResolver::default();

        for (data_type_id, inserted_data_type) in &inserted_data_types {
            match policy_set
                .evaluate(
                    &Request {
                        actor: policy_components.actor_id(),
                        action: ActionName::CreateDataType,
                        resource: &ResourceId::DataType(Cow::Borrowed(
                            (&inserted_data_type.id).into(),
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
                            "The actor does not have permission to create the data type `{}`",
                            inserted_data_type.id
                        )));
                }
            }
            ontology_type_resolver
                .add_unresolved_data_type(*data_type_id, Arc::clone(inserted_data_type));
        }

        let required_reference_ids = data_type_reference_ids.into_iter().collect::<Vec<_>>();

        let mut parent_inheritance_data = transaction
            .get_data_type_inheritance_metadata(&required_reference_ids)
            .await
            .change_context(InsertionError)
            .attach("Could not read parent data type inheritance data")?
            .collect::<HashMap<_, _>>();

        transaction
            .query_data_types(
                actor_id,
                QueryDataTypesParams {
                    filter: Filter::In(
                        FilterExpression::Path {
                            path: DataTypeQueryPath::OntologyId,
                        },
                        FilterExpressionList::ParameterList {
                            parameters: ParameterList::DataTypeIds(&required_reference_ids),
                        },
                    ),
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    },
                    after: None,
                    limit: None,
                    include_count: false,
                },
            )
            .await
            .change_context(InsertionError)
            .attach("Could not read parent data types")?
            .data_types
            .into_iter()
            .for_each(|parent| {
                let parent_id = DataTypeUuid::from_url(&parent.schema.id);
                if let Some(inheritance_data) = parent_inheritance_data.remove(&parent_id) {
                    ontology_type_resolver.add_closed_data_type(
                        parent_id,
                        Arc::new(parent.schema),
                        Arc::new(inheritance_data),
                    );
                } else {
                    if !parent.schema.all_of.is_empty() {
                        tracing::warn!("No inheritance data found for `{}`", parent.schema.id);
                    }
                    ontology_type_resolver
                        .add_unresolved_data_type(parent_id, Arc::new(parent.schema));
                }
            });

        let closed_schemas = inserted_data_types
            .iter()
            .map(|(data_type_id, data_type)| {
                let closed_metadata = ontology_type_resolver
                    .resolve_data_type_metadata(*data_type_id)
                    .change_context(InsertionError)?;
                let closed_schema =
                    ClosedDataType::from_resolve_data((**data_type).clone(), &closed_metadata)
                        .change_context(InsertionError)?;

                Ok((closed_schema, closed_metadata))
            })
            .collect::<Result<Vec<_>, Report<_>>>()?;

        let data_type_validator = DataTypeValidator;
        for ((closed_schema, _), (data_type_id, data_type)) in
            closed_schemas.iter().zip(&inserted_data_types)
        {
            let schema = data_type_validator
                .validate_ref(&**data_type)
                .attach_opaque(StatusCode::InvalidArgument)
                .change_context(InsertionError)?;
            let closed_schema = data_type_validator
                .validate_ref(closed_schema)
                .attach_opaque(StatusCode::InvalidArgument)
                .change_context(InsertionError)?;

            transaction
                .insert_data_type_with_id(*data_type_id, schema, closed_schema)
                .await?;
        }
        for ((_, closed_metadata), (data_type_id, _)) in
            closed_schemas.iter().zip(&inserted_data_types)
        {
            transaction
                .insert_data_type_references(*data_type_id, closed_metadata)
                .await?;
        }

        let (statement, parameters) = InsertStatementBuilder::from_rows(
            Table::DataTypeConversions,
            &data_type_conversions_rows,
        )
        .compile();
        transaction
            .as_client()
            .query(&statement, &parameters)
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = statement,
            ))
            .await
            .change_context(InsertionError)?;

        transaction.commit().await.change_context(InsertionError)?;

        if !self.settings.skip_embedding_creation
            && let Some(temporal_client) = &self.temporal_client
        {
            temporal_client
                .start_update_data_type_embeddings_workflow(
                    actor_id,
                    &inserted_data_types
                        .iter()
                        .zip(&inserted_data_type_metadata)
                        .map(|((_, schema), metadata)| DataTypeWithMetadata {
                            schema: (**schema).clone(),
                            metadata: metadata.clone(),
                        })
                        .collect::<Vec<_>>(),
                )
                .await
                .change_context(InsertionError)?;
        }

        Ok(inserted_data_type_metadata)
    }

    async fn query_data_types(
        &self,
        actor_id: ActorEntityUuid,
        mut params: QueryDataTypesParams<'_>,
    ) -> Result<QueryDataTypesResponse, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_action(ActionName::ViewDataType, MergePolicies::Yes)
            .await
            .change_context(QueryError)?;

        params
            .filter
            .convert_parameters(&StoreProvider::new(self, &policy_components))
            .await
            .change_context(QueryError)?;

        let temporal_axes = params.temporal_axes.resolve();
        self.query_data_types_impl(params, &temporal_axes, &policy_components)
            .await
    }

    // TODO: take actor ID into consideration, but currently we don't have any non-public data types
    //       anyway.
    async fn count_data_types(
        &self,
        actor_id: ActorEntityUuid,
        mut params: CountDataTypesParams<'_>,
    ) -> Result<usize, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_action(ActionName::ViewDataType, MergePolicies::Yes)
            .await
            .change_context(QueryError)?;

        params
            .filter
            .convert_parameters(&StoreProvider::new(self, &policy_components))
            .await
            .change_context(QueryError)?;

        Ok(self
            .read(
                &[params.filter],
                Some(&params.temporal_axes.resolve()),
                false,
            )
            .await?
            .count()
            .await)
    }

    #[tracing::instrument(level = "info", skip(self))]
    #[expect(clippy::too_many_lines)]
    async fn query_data_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        params: QueryDataTypeSubgraphParams<'_>,
    ) -> Result<QueryDataTypeSubgraphResponse, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_action(ActionName::ViewDataType, MergePolicies::Yes)
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

        let QueryDataTypesResponse {
            data_types,
            cursor,
            count,
        } = self
            .query_data_types_impl(request, &temporal_axes, &policy_components)
            .await?;

        let (data_type_ids, data_type_vertex_ids): (Vec<_>, Vec<_>) = data_types
            .iter()
            .map(|data_type| {
                (
                    DataTypeUuid::from_url(&data_type.schema.id),
                    GraphElementVertexId::from(data_type.vertex_id(time_axis)),
                )
            })
            .unzip();
        subgraph.roots.extend(data_type_vertex_ids);
        subgraph.vertices.data_types = data_types
            .into_iter()
            .map(|data_type| (data_type.vertex_id(time_axis), data_type))
            .collect();

        let mut traversal_context = TraversalContext::default();

        // TODO: We currently pass in the subgraph as mutable reference, thus we cannot borrow the
        //       vertices and have to `.collect()` the keys.
        self.traverse_data_types(
            data_type_ids
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
                                // traversal of ontology edges (e.g., inheritsFrom)
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
            .read_traversed_vertices(self, &mut subgraph, false)
            .await?;

        Ok(QueryDataTypeSubgraphResponse {
            subgraph,
            cursor,
            count,
        })
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    #[expect(clippy::too_many_lines)]
    async fn update_data_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<DataTypeMetadata>, Report<UpdateError>>
    where
        P: IntoIterator<Item = UpdateDataTypesParams, IntoIter: Send> + Send,
    {
        let transaction = self.transaction().await.change_context(UpdateError)?;

        let mut updated_data_type_metadata = Vec::new();
        let mut inserted_data_types = Vec::new();
        let mut data_type_reference_ids = HashSet::new();
        let mut data_type_conversions_rows = Vec::new();

        let mut old_data_type_ids = Vec::new();

        for parameters in params {
            let provenance = OntologyProvenance {
                edition: OntologyEditionProvenance {
                    created_by_id: actor_id,
                    archived_by_id: None,
                    user_defined: parameters.provenance,
                },
            };

            old_data_type_ids.push(VersionedUrl {
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
                            "The version of the data type is already at the lowest possible value",
                        )?,
                    pre_release: None,
                },
            });

            let record_id = OntologyTypeRecordId::from(parameters.schema.id.clone());
            let data_type_id = DataTypeUuid::from_url(&parameters.schema.id);

            let (_ontology_id, web_id, temporal_versioning) = transaction
                .update_owned_ontology_id(&parameters.schema.id, &provenance.edition)
                .await?;

            data_type_reference_ids.extend(
                parameters
                    .schema
                    .data_type_references()
                    .map(|(reference, _)| DataTypeUuid::from_url(&reference.url)),
            );
            inserted_data_types.push((data_type_id, Arc::new(parameters.schema)));
            data_type_conversions_rows.extend(parameters.conversions.iter().map(
                |(base_url, conversions)| DataTypeConversionsRow {
                    source_data_type_ontology_id: data_type_id,
                    target_data_type_base_url: base_url.clone(),
                    from: conversions.from.clone(),
                    into: conversions.to.clone(),
                },
            ));
            updated_data_type_metadata.push(DataTypeMetadata {
                record_id,
                ownership: OntologyOwnership::Local { web_id },
                temporal_versioning,
                provenance,
                conversions: parameters.conversions,
            });
        }

        let policy_components = PolicyComponents::builder(&transaction)
            .with_actor(actor_id)
            .with_data_type_ids(&old_data_type_ids)
            .with_actions([ActionName::UpdateDataType], MergePolicies::No)
            .await
            .change_context(UpdateError)?;

        let policy_set = policy_components
            .build_policy_set([ActionName::UpdateDataType])
            .change_context(UpdateError)?;

        for property_type_id in &old_data_type_ids {
            match policy_set
                .evaluate(
                    &Request {
                        actor: policy_components.actor_id(),
                        action: ActionName::UpdateDataType,
                        resource: &ResourceId::DataType(Cow::Borrowed(property_type_id.into())),
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
                            "The actor does not have permission to update the data type \
                             `{property_type_id}`"
                        )));
                }
            }
        }

        let mut ontology_type_resolver = OntologyTypeResolver::default();

        for (data_type_id, inserted_data_type) in &inserted_data_types {
            ontology_type_resolver
                .add_unresolved_data_type(*data_type_id, Arc::clone(inserted_data_type));
        }

        let required_parent_ids = data_type_reference_ids.into_iter().collect::<Vec<_>>();

        let mut parent_inheritance_data = transaction
            .get_data_type_inheritance_metadata(&required_parent_ids)
            .await
            .change_context(UpdateError)
            .attach("Could not read parent data type inheritance data")?
            .collect::<HashMap<_, _>>();

        transaction
            .query_data_types(
                actor_id,
                QueryDataTypesParams {
                    filter: Filter::In(
                        FilterExpression::Path {
                            path: DataTypeQueryPath::OntologyId,
                        },
                        FilterExpressionList::ParameterList {
                            parameters: ParameterList::DataTypeIds(&required_parent_ids),
                        },
                    ),
                    temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    },
                    after: None,
                    limit: None,
                    include_count: false,
                },
            )
            .await
            .change_context(UpdateError)
            .attach("Could not read parent data types")?
            .data_types
            .into_iter()
            .for_each(|parent| {
                let parent_id = DataTypeUuid::from_url(&parent.schema.id);
                if let Some(inheritance_data) = parent_inheritance_data.remove(&parent_id) {
                    ontology_type_resolver.add_closed_data_type(
                        parent_id,
                        Arc::new(parent.schema),
                        Arc::new(inheritance_data),
                    );
                } else {
                    if !parent.schema.all_of.is_empty() {
                        tracing::warn!("No inheritance data found for `{}`", parent.schema.id);
                    }
                    ontology_type_resolver
                        .add_unresolved_data_type(parent_id, Arc::new(parent.schema));
                }
            });

        let closed_schemas = inserted_data_types
            .iter()
            .map(|(data_type_id, data_type)| {
                let closed_metadata = ontology_type_resolver
                    .resolve_data_type_metadata(*data_type_id)
                    .change_context(UpdateError)?;
                let closed_schema =
                    ClosedDataType::from_resolve_data((**data_type).clone(), &closed_metadata)
                        .change_context(UpdateError)?;

                Ok((closed_schema, closed_metadata))
            })
            .collect::<Result<Vec<_>, Report<_>>>()?;

        let data_type_validator = DataTypeValidator;
        for ((closed_schema, _), (data_type_id, data_type)) in
            closed_schemas.iter().zip(&inserted_data_types)
        {
            let schema = data_type_validator
                .validate_ref(&**data_type)
                .attach_opaque(StatusCode::InvalidArgument)
                .change_context(UpdateError)?;
            let closed_schema = data_type_validator
                .validate_ref(closed_schema)
                .attach_opaque(StatusCode::InvalidArgument)
                .change_context(UpdateError)?;

            transaction
                .insert_data_type_with_id(*data_type_id, schema, closed_schema)
                .await
                .change_context(UpdateError)?;
        }
        for ((_, closed_metadata), (data_type_id, _)) in
            closed_schemas.iter().zip(&inserted_data_types)
        {
            transaction
                .insert_data_type_references(*data_type_id, closed_metadata)
                .await
                .change_context(UpdateError)?;
        }

        let (statement, parameters) = InsertStatementBuilder::from_rows(
            Table::DataTypeConversions,
            &data_type_conversions_rows,
        )
        .compile();
        transaction
            .as_client()
            .query(&statement, &parameters)
            .instrument(tracing::info_span!(
                "SELECT",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
                db.query.text = statement,
            ))
            .await
            .change_context(UpdateError)?;

        transaction.commit().await.change_context(UpdateError)?;

        if !self.settings.skip_embedding_creation
            && let Some(temporal_client) = &self.temporal_client
        {
            temporal_client
                .start_update_data_type_embeddings_workflow(
                    actor_id,
                    &inserted_data_types
                        .iter()
                        .zip(&updated_data_type_metadata)
                        .map(|((_, schema), metadata)| DataTypeWithMetadata {
                            schema: (**schema).clone(),
                            metadata: metadata.clone(),
                        })
                        .collect::<Vec<_>>(),
                )
                .await
                .change_context(UpdateError)?;
        }

        Ok(updated_data_type_metadata)
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn archive_data_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: ArchiveDataTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_data_type_id(&params.data_type_id)
            .with_actions([ActionName::ArchiveDataType], MergePolicies::No)
            .await
            .change_context(UpdateError)?;

        match policy_components
            .build_policy_set([ActionName::ArchiveDataType])
            .change_context(UpdateError)?
            .evaluate(
                &Request {
                    actor: policy_components.actor_id(),
                    action: ActionName::ArchiveDataType,
                    resource: &ResourceId::DataType(Cow::Borrowed((&*params.data_type_id).into())),
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
                        "The actor does not have permission to archive the data type `{}`",
                        params.data_type_id
                    )));
            }
        }

        self.archive_ontology_type(&params.data_type_id, actor_id)
            .await
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn unarchive_data_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UnarchiveDataTypeParams,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_data_type_id(&params.data_type_id)
            .with_actions([ActionName::ArchiveDataType], MergePolicies::No)
            .await
            .change_context(UpdateError)?;

        match policy_components
            .build_policy_set([ActionName::ArchiveDataType])
            .change_context(UpdateError)?
            .evaluate(
                &Request {
                    actor: policy_components.actor_id(),
                    action: ActionName::ArchiveDataType,
                    resource: &ResourceId::DataType(Cow::Borrowed((&params.data_type_id).into())),
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
                        "The actor does not have permission to unarchive the data type `{}`",
                        params.data_type_id
                    )));
            }
        }

        self.unarchive_ontology_type(
            &params.data_type_id,
            &OntologyEditionProvenance {
                created_by_id: actor_id,
                archived_by_id: None,
                user_defined: params.provenance,
            },
        )
        .await
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn update_data_type_embeddings(
        &mut self,
        _: ActorEntityUuid,
        params: UpdateDataTypeEmbeddingParams<'_>,
    ) -> Result<(), Report<UpdateError>> {
        #[derive(Debug, ToSql)]
        #[postgres(name = "data_type_embeddings")]
        pub struct DataTypeEmbeddingsRow<'a> {
            ontology_id: OntologyTypeUuid,
            embedding: Embedding<'a>,
            updated_at_transaction_time: Timestamp<TransactionTime>,
        }
        let data_type_embeddings = vec![DataTypeEmbeddingsRow {
            ontology_id: OntologyTypeUuid::from(DataTypeUuid::from_url(&params.data_type_id)),
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
                        FROM UNNEST($1::data_type_embeddings[]) AS embeddings
                        JOIN ontology_ids USING (ontology_id)
                        JOIN base_urls USING (base_url)
                        WHERE version = max_version
                    ),
                    embeddings_to_delete AS (
                        SELECT data_type_embeddings.ontology_id
                        FROM provided_embeddings
                        JOIN ontology_ids using (base_url)
                        JOIN data_type_embeddings
                          ON ontology_ids.ontology_id = data_type_embeddings.ontology_id
                        WHERE version < max_version
                           OR ($2 AND version = max_version
                                  AND data_type_embeddings.updated_at_transaction_time
                                   <= provided_embeddings.updated_at_transaction_time)
                    ),
                    deleted AS (
                        DELETE FROM data_type_embeddings
                        WHERE (ontology_id) IN (SELECT ontology_id FROM embeddings_to_delete)
                    )
                INSERT INTO data_type_embeddings
                SELECT
                    ontology_id,
                    embedding,
                    updated_at_transaction_time
                FROM provided_embeddings
                ON CONFLICT (ontology_id) DO UPDATE SET
                    embedding = EXCLUDED.embedding,
                    updated_at_transaction_time = EXCLUDED.updated_at_transaction_time
                WHERE data_type_embeddings.updated_at_transaction_time
                      <= EXCLUDED.updated_at_transaction_time;
                ",
                &[&data_type_embeddings, &params.reset],
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
    #[expect(
        clippy::too_many_lines,
        reason = "This function is complex and needs refactoring"
    )]
    async fn find_data_type_conversion_targets(
        &self,
        actor_id: ActorEntityUuid,
        params: FindDataTypeConversionTargetsParams,
    ) -> Result<FindDataTypeConversionTargetsResponse, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_actions([ActionName::ViewDataType], MergePolicies::Yes)
            .await
            .change_context(QueryError)?;

        // Create filters to check permissions for all requested data types
        let data_type_uuids = params
            .data_type_ids
            .iter()
            .map(DataTypeUuid::from_url)
            .collect::<Vec<_>>();

        let filters = vec![
            Filter::for_data_type_uuids(&data_type_uuids),
            Filter::<DataTypeWithMetadata>::for_policies(
                policy_components.extract_filter_policies(ActionName::ViewDataType),
                policy_components.optimization_data(ActionName::ViewDataType),
            ),
        ];

        // Check which data types the user can access
        let allowed_data_types: HashSet<DataTypeUuid> = {
            let mut compiler = SelectCompiler::new(None, false);
            for filter in &filters {
                compiler.add_filter(filter).change_context(QueryError)?;
            }
            let data_type_uuid_idx = compiler.add_selection_path(&DataTypeQueryPath::OntologyId);
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
                .change_context(QueryError)?
                .map_ok(|row| row.get::<_, DataTypeUuid>(data_type_uuid_idx))
                .try_collect()
                .await
                .change_context(QueryError)?
        };

        let mut response = FindDataTypeConversionTargetsResponse {
            conversions: HashMap::with_capacity(params.data_type_ids.len()),
        };

        for data_type_id in params.data_type_ids {
            let mut conversions = HashMap::new();
            let data_type_uuid = DataTypeUuid::from_url(&data_type_id);

            if !allowed_data_types.contains(&data_type_uuid) {
                return Err(Report::new(QueryError)
                    .attach_opaque(StatusCode::PermissionDenied)
                    .attach(format!(
                        "The actor does not have permission to view the data type `{data_type_id}`",
                    )));
            }

            // Get the conversions between non-canonical data types to other non-canonical data
            // types
            conversions.extend(
                self.as_client()
                    .query(
                        r#"
                            SELECT schema->>'$id', schema->>'title', conversion_a."into", conversion_b."from"
                            FROM data_type_conversions AS conversion_a
                            JOIN data_type_conversions AS conversion_b ON conversion_a.target_data_type_base_url = conversion_b.target_data_type_base_url AND conversion_a.source_data_type_ontology_id != conversion_b.source_data_type_ontology_id
                            JOIN data_types ON data_types.ontology_id = conversion_b.source_data_type_ontology_id
                            WHERE conversion_a.source_data_type_ontology_id = $1;
                        "#,
                        &[&data_type_uuid])
                    .instrument(tracing::info_span!(
                        "SELECT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres",
                    ))
                    .await
                    .change_context(QueryError)?
                    .into_iter()
                    .map(|row| {
                        (row.get::<_, VersionedUrl>(0), DataTypeConversionTargets {
                            title: row.get(1),
                            conversions: vec![row.get(2), row.get(3)],
                        })
                    }),
            );

            // Get the conversions between non-canonical data types to canonical data types
            conversions.extend(
                self.as_client()
                    .query(
                        r#"
                            SELECT schema->>'$id', schema->>'title', "into"
                            FROM data_type_conversions
                            JOIN ontology_ids ON ontology_ids.base_url = target_data_type_base_url
                            JOIN data_types ON data_types.ontology_id = ontology_ids.ontology_id
                            WHERE source_data_type_ontology_id = $1;
                        "#,
                        &[&data_type_uuid],
                    )
                    .instrument(tracing::info_span!(
                        "SELECT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
                    .await
                    .change_context(QueryError)?
                    .into_iter()
                    .map(|row| {
                        (
                            row.get::<_, VersionedUrl>(0),
                            DataTypeConversionTargets {
                                title: row.get(1),
                                conversions: vec![row.get(2)],
                            },
                        )
                    }),
            );

            // Get the conversions between canonical data types to non-canonical data types
            conversions.extend(
                self.as_client()
                    .query(
                        r#"
                            SELECT schema->>'$id', schema->>'title', "from"
                            FROM data_type_conversions
                            JOIN data_types ON ontology_id = source_data_type_ontology_id
                            WHERE target_data_type_base_url = $1;
                        "#,
                        &[&data_type_id.base_url],
                    )
                    .instrument(tracing::info_span!(
                        "SELECT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
                    .await
                    .change_context(QueryError)?
                    .into_iter()
                    .map(|row| {
                        (
                            row.get::<_, VersionedUrl>(0),
                            DataTypeConversionTargets {
                                title: row.get(1),
                                conversions: vec![row.get(2)],
                            },
                        )
                    }),
            );

            response.conversions.insert(data_type_id, conversions);
        }

        Ok(response)
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn reindex_data_type_cache(&mut self) -> Result<(), Report<UpdateError>> {
        tracing::info!("Reindexing data type cache");
        let transaction = self.transaction().await.change_context(UpdateError)?;

        // We remove the data from the reference tables first
        transaction
            .as_client()
            .simple_query(
                "
                    DELETE FROM data_type_inherits_from;
                ",
            )
            .instrument(tracing::info_span!(
                "DELETE",
                otel.kind = "client",
                db.system = "postgresql",
                peer.service = "Postgres",
            ))
            .await
            .change_context(UpdateError)?;

        let mut ontology_type_resolver = OntologyTypeResolver::default();

        let data_types = Read::<DataTypeWithMetadata>::read_vec(&transaction, &[], None, true)
            .await
            .change_context(UpdateError)?
            .into_iter()
            .map(|data_type| {
                let schema = Arc::new(data_type.schema);
                let data_type_id = DataTypeUuid::from_url(&schema.id);
                ontology_type_resolver.add_unresolved_data_type(data_type_id, Arc::clone(&schema));
                (data_type_id, schema)
            })
            .collect::<Vec<_>>();

        let data_type_validator = DataTypeValidator;
        let num_data_types = data_types.len();
        for (idx, (data_type_id, schema)) in data_types.into_iter().enumerate() {
            tracing::debug!(data_type_id=%schema.id, "Reindexing schema {}/{}", idx + 1, num_data_types);
            let schema_metadata = ontology_type_resolver
                .resolve_data_type_metadata(data_type_id)
                .change_context(UpdateError)?;

            transaction
                .insert_data_type_references(data_type_id, &schema_metadata)
                .await
                .change_context(UpdateError)?;

            let closed_schema = data_type_validator
                .validate(
                    ClosedDataType::from_resolve_data((*schema).clone(), &schema_metadata)
                        .change_context(UpdateError)?,
                )
                .change_context(UpdateError)?;

            transaction
                .as_client()
                .query(
                    "
                        UPDATE data_types
                        SET closed_schema = $2
                        WHERE ontology_id = $1;
                    ",
                    &[&data_type_id, &closed_schema],
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

        transaction.commit().await.change_context(UpdateError)?;

        Ok(())
    }

    #[tracing::instrument(skip(self, params))]
    async fn has_permission_for_data_types(
        &self,
        authenticated_actor: AuthenticatedActor,
        params: HasPermissionForDataTypesParams<'_>,
    ) -> Result<HashSet<VersionedUrl>, Report<hash_graph_store::error::CheckPermissionError>> {
        let temporal_axes = QueryTemporalAxesUnresolved::DecisionTime {
            pinned: PinnedTemporalAxisUnresolved::new(None),
            variable: VariableTemporalAxisUnresolved::new(None, None),
        }
        .resolve();
        let mut compiler = SelectCompiler::new(Some(&temporal_axes), true);

        let data_type_uuids = params
            .data_type_ids
            .iter()
            .map(DataTypeUuid::from_url)
            .collect::<Vec<_>>();

        let data_type_filter = Filter::for_data_type_uuids(&data_type_uuids);
        compiler
            .add_filter(&data_type_filter)
            .change_context(CheckPermissionError::CompileFilter)?;

        let policy_components = PolicyComponents::builder(self)
            .with_actor(authenticated_actor)
            .with_action(params.action, MergePolicies::Yes)
            .await
            .change_context(CheckPermissionError::BuildPolicyContext)?;
        let policy_filter = Filter::<DataTypeWithMetadata>::for_policies(
            policy_components.extract_filter_policies(params.action),
            policy_components.optimization_data(params.action),
        );
        compiler
            .add_filter(&policy_filter)
            .change_context(CheckPermissionError::CompileFilter)?;

        let versioned_url_idx = compiler.add_selection_path(&DataTypeQueryPath::VersionedUrl);

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
pub struct DataTypeRowIndices {
    pub base_url: usize,
    pub version: usize,
    pub transaction_time: usize,

    pub schema: usize,

    pub edition_provenance: usize,
    pub additional_metadata: usize,

    pub conversion_targets: usize,
    pub conversion_froms: usize,
    pub conversion_intos: usize,
}

impl QueryRecordDecode for DataTypeWithMetadata {
    type Indices = DataTypeRowIndices;
    type Output = Self;

    fn decode(row: &Row, indices: &Self::Indices) -> Self {
        let record_id = OntologyTypeRecordId {
            base_url: row.get(indices.base_url),
            version: row.get(indices.version),
        };

        if let Ok(distance) = row.try_get::<_, f64>("distance") {
            tracing::trace!(%record_id, %distance, "Data type embedding was calculated");
        }

        let conversion_targets: Option<Vec<BaseUrl>> = row.get(indices.conversion_targets);
        let conversion_froms: Option<Vec<ConversionDefinition>> = row.get(indices.conversion_froms);
        let conversion_intos: Option<Vec<ConversionDefinition>> = row.get(indices.conversion_intos);
        let conversions = match (conversion_targets, conversion_froms, conversion_intos) {
            (Some(targets), Some(froms), Some(intos)) => targets
                .into_iter()
                .zip(
                    froms
                        .into_iter()
                        .zip(intos)
                        .map(|(from, to)| Conversions { from, to }),
                )
                .collect(),
            (None, None, None) => HashMap::new(),
            _ => unreachable!(
                "Conversion targets, froms and intos must be either all present or all absent"
            ),
        };

        Self {
            schema: row.get::<_, Json<_>>(indices.schema).0,
            metadata: DataTypeMetadata {
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
                conversions,
            },
        }
    }
}

impl PostgresRecord for DataTypeWithMetadata {
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
        DataTypeRowIndices {
            base_url: compiler.add_distinct_selection_with_ordering(
                &DataTypeQueryPath::BaseUrl,
                Distinctness::Distinct,
                None,
            ),
            version: compiler.add_distinct_selection_with_ordering(
                &DataTypeQueryPath::Version,
                Distinctness::Distinct,
                None,
            ),
            transaction_time: compiler.add_distinct_selection_with_ordering(
                &DataTypeQueryPath::TransactionTime,
                Distinctness::Distinct,
                Some((Ordering::Descending, None)),
            ),
            schema: compiler.add_selection_path(&DataTypeQueryPath::Schema(None)),
            edition_provenance: compiler
                .add_selection_path(&DataTypeQueryPath::EditionProvenance(None)),
            additional_metadata: compiler
                .add_selection_path(&DataTypeQueryPath::AdditionalMetadata),
            conversion_targets: compiler
                .add_selection_path(&DataTypeQueryPath::TargetConversionBaseUrls),
            conversion_froms: compiler.add_selection_path(&DataTypeQueryPath::FromConversions),
            conversion_intos: compiler.add_selection_path(&DataTypeQueryPath::IntoConversions),
        }
    }
}
