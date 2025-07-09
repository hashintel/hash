use alloc::borrow::Cow;
use core::iter;
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _};
use futures::{StreamExt as _, TryStreamExt as _};
use hash_graph_authorization::{
    AuthorizationApi,
    backend::ModifyRelationshipOperation,
    policies::{
        Authorized, PolicyComponents, Request, RequestContext, ResourceId, action::ActionName,
        principal::actor::AuthenticatedActor,
    },
    schema::{PropertyTypeOwnerSubject, PropertyTypeRelationAndSubject},
};
use hash_graph_store::{
    error::{CheckPermissionError, InsertionError, QueryError, UpdateError},
    filter::Filter,
    property_type::{
        ArchivePropertyTypeParams, CountPropertyTypesParams, CreatePropertyTypeParams,
        GetPropertyTypeSubgraphParams, GetPropertyTypeSubgraphResponse, GetPropertyTypesParams,
        GetPropertyTypesResponse, HasPermissionForPropertyTypesParams, PropertyTypeQueryPath,
        PropertyTypeStore, UnarchivePropertyTypeParams, UpdatePropertyTypeEmbeddingParams,
        UpdatePropertyTypesParams,
    },
    query::{Ordering, QueryResult as _, VersionedUrlSorting},
    subgraph::{
        Subgraph, SubgraphRecord as _,
        edges::{EdgeDirection, GraphResolveDepths, OntologyEdgeKind},
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

impl<C, A> PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi,
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
                    .instrument(tracing::trace_span!("query_permitted_property_type_uuids"))
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

    async fn get_property_types_impl(
        &self,
        params: GetPropertyTypesParams<'_>,
        temporal_axes: &QueryTemporalAxes,
        policy_components: &PolicyComponents,
    ) -> Result<GetPropertyTypesResponse, Report<QueryError>> {
        let policy_filter = Filter::<PropertyTypeWithMetadata>::for_policies(
            policy_components.extract_filter_policies(ActionName::ViewPropertyType),
            policy_components.optimization_data(ActionName::ViewPropertyType),
        );

        let mut compiler = SelectCompiler::new(Some(temporal_axes), params.include_drafts);
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
                .instrument(tracing::trace_span!("query"))
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
                "query_property_types",
                statement_length = statement.len(),
                param_count = parameters.len()
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

        Ok(GetPropertyTypesResponse {
            cursor,
            property_types,
            count,
        })
    }

    /// Internal method to read a [`PropertyTypeWithMetadata`] into two [`TraversalContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "info", skip(self, traversal_context, provider, subgraph))]
    pub(crate) async fn traverse_property_types(
        &self,
        mut property_type_queue: Vec<(
            PropertyTypeUuid,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        traversal_context: &mut TraversalContext,
        provider: &StoreProvider<'_, Self>,
        subgraph: &mut Subgraph,
    ) -> Result<(), Report<QueryError>> {
        let mut data_type_queue = Vec::new();
        let mut edges_to_traverse = HashMap::<OntologyEdgeKind, OntologyTypeTraversalData>::new();

        while !property_type_queue.is_empty() {
            edges_to_traverse.clear();

            #[expect(clippy::iter_with_drain, reason = "false positive, vector is reused")]
            for (property_type_ontology_id, graph_resolve_depths, traversal_interval) in
                property_type_queue.drain(..)
            {
                for edge_kind in [
                    OntologyEdgeKind::ConstrainsValuesOn,
                    OntologyEdgeKind::ConstrainsPropertiesOn,
                ] {
                    if let Some(new_graph_resolve_depths) = graph_resolve_depths
                        .decrement_depth_for_edge(edge_kind, EdgeDirection::Outgoing)
                    {
                        edges_to_traverse.entry(edge_kind).or_default().push(
                            OntologyTypeUuid::from(property_type_ontology_id),
                            new_graph_resolve_depths,
                            traversal_interval,
                        );
                    }
                }
            }

            if let Some(traversal_data) =
                edges_to_traverse.get(&OntologyEdgeKind::ConstrainsValuesOn)
            {
                data_type_queue.extend(
                    Self::filter_data_types_by_permission(
                        self.read_ontology_edges::<PropertyTypeVertexId, DataTypeVertexId>(
                            traversal_data,
                            ReferenceTable::PropertyTypeConstrainsValuesOn,
                        )
                        .await?,
                        provider,
                    )
                    .await?
                    .flat_map(|edge| {
                        subgraph.insert_edge(
                            &edge.left_endpoint,
                            OntologyEdgeKind::ConstrainsValuesOn,
                            EdgeDirection::Outgoing,
                            edge.right_endpoint.clone(),
                        );

                        traversal_context.add_data_type_id(
                            DataTypeUuid::from(edge.right_endpoint_ontology_id),
                            edge.resolve_depths,
                            edge.traversal_interval,
                        )
                    }),
                );
            }

            if let Some(traversal_data) =
                edges_to_traverse.get(&OntologyEdgeKind::ConstrainsPropertiesOn)
            {
                property_type_queue.extend(
                    Self::filter_property_types_by_permission(
                        self.read_ontology_edges::<PropertyTypeVertexId, PropertyTypeVertexId>(
                            traversal_data,
                            ReferenceTable::PropertyTypeConstrainsPropertiesOn,
                        )
                        .await?,
                        provider,
                        subgraph.temporal_axes.resolved.clone(),
                    )
                    .await?
                    .flat_map(|edge| {
                        subgraph.insert_edge(
                            &edge.left_endpoint,
                            OntologyEdgeKind::ConstrainsPropertiesOn,
                            EdgeDirection::Outgoing,
                            edge.right_endpoint.clone(),
                        );

                        traversal_context.add_property_type_id(
                            PropertyTypeUuid::from(edge.right_endpoint_ontology_id),
                            edge.resolve_depths,
                            edge.traversal_interval,
                        )
                    }),
                );
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

impl<C, A> PropertyTypeStore for PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    #[tracing::instrument(level = "info", skip(self, params))]
    #[expect(clippy::too_many_lines)]
    async fn create_property_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<PropertyTypeMetadata>, Report<InsertionError>>
    where
        P: IntoIterator<Item = CreatePropertyTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync,
    {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let mut relationships = HashSet::new();

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
            let property_type_id = PropertyTypeUuid::from_url(&parameters.schema.id);

            if let OntologyOwnership::Local { web_id } = &parameters.ownership {
                relationships.insert((
                    property_type_id,
                    PropertyTypeRelationAndSubject::Owner {
                        subject: PropertyTypeOwnerSubject::Web { id: *web_id },
                        level: 0,
                    },
                ));

                policy_components_builder.add_property_type(&parameters.schema.id, Some(*web_id));
            } else {
                policy_components_builder.add_property_type(&parameters.schema.id, None);
            }

            relationships.extend(
                parameters
                    .relationships
                    .into_iter()
                    .map(|relation_and_subject| (property_type_id, relation_and_subject)),
            );

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
            .with_actions([ActionName::CreatePropertyType], false)
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
                        .attach(StatusCode::PermissionDenied)
                        .attach_printable(format!(
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
                .attach_printable_lazy(|| {
                    format!(
                        "could not insert references for property type: {}",
                        &property_type.schema.id
                    )
                })
                .attach_lazy(|| property_type.schema.clone())?;
        }

        transaction
            .authorization_api
            .modify_property_type_relations(relationships.clone().into_iter().map(
                |(resource, relation_and_subject)| {
                    (
                        ModifyRelationshipOperation::Create,
                        resource,
                        relation_and_subject,
                    )
                },
            ))
            .await
            .change_context(InsertionError)?;

        if let Err(error) = transaction.commit().await.change_context(InsertionError) {
            let mut error = error.expand();

            if let Err(auth_error) = self
                .authorization_api
                .modify_property_type_relations(relationships.into_iter().map(
                    |(resource, relation_and_subject)| {
                        (
                            ModifyRelationshipOperation::Delete,
                            resource,
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
                    .start_update_property_type_embeddings_workflow(
                        actor_id,
                        &inserted_property_types,
                    )
                    .await
                    .change_context(InsertionError)?;
            }

            Ok(inserted_property_type_metadata)
        }
    }

    async fn count_property_types(
        &self,
        actor_id: ActorEntityUuid,
        mut params: CountPropertyTypesParams<'_>,
    ) -> Result<usize, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_action(ActionName::ViewPropertyType, true)
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
        let mut compiler = SelectCompiler::new(Some(&temporal_axes), params.include_drafts);
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
                "count_property_types",
                statement_length = statement.len(),
                param_count = parameters.len()
            ))
            .await
            .change_context(QueryError)?
            .count()
            .await)
    }

    async fn get_property_types(
        &self,
        actor_id: ActorEntityUuid,
        mut params: GetPropertyTypesParams<'_>,
    ) -> Result<GetPropertyTypesResponse, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_action(ActionName::ViewPropertyType, true)
            .await
            .change_context(QueryError)?;

        params
            .filter
            .convert_parameters(&StoreProvider::new(self, &policy_components))
            .await
            .change_context(QueryError)?;

        let temporal_axes = params.temporal_axes.clone().resolve();
        self.get_property_types_impl(params, &temporal_axes, &policy_components)
            .await
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_property_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        mut params: GetPropertyTypeSubgraphParams<'_>,
    ) -> Result<GetPropertyTypeSubgraphResponse, Report<QueryError>> {
        let actions = vec![ActionName::ViewPropertyType];
        if params.graph_resolve_depths.constrains_values_on.outgoing > 0 {
            // TODO: Add ActionName::ViewDataType when DataType authorization is implemented
            //       Following the same pattern as EntityType adding ViewPropertyType when
            //       PropertyTypes are traversed. This prepares the subgraph method for
            //       future DataType authorization support.
            // actions.push(ActionName::ViewDataType);
        }

        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
            .with_actions(actions, true)
            .await
            .change_context(QueryError)?;

        let provider = StoreProvider::new(self, &policy_components);

        params
            .filter
            .convert_parameters(&provider)
            .await
            .change_context(QueryError)?;

        let temporal_axes = params.temporal_axes.clone().resolve();
        let time_axis = temporal_axes.variable_time_axis();

        let GetPropertyTypesResponse {
            property_types,
            cursor,
            count,
        } = self
            .get_property_types_impl(
                GetPropertyTypesParams {
                    filter: params.filter,
                    temporal_axes: params.temporal_axes.clone(),
                    after: params.after,
                    limit: params.limit,
                    include_drafts: params.include_drafts,
                    include_count: params.include_count,
                },
                &temporal_axes,
                &policy_components,
            )
            .await?;

        let mut subgraph = Subgraph::new(
            params.graph_resolve_depths,
            params.temporal_axes,
            temporal_axes.clone(),
        );

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
                .map(|id| {
                    (
                        id,
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

        Ok(GetPropertyTypeSubgraphResponse {
            subgraph,
            cursor,
            count,
        })
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    #[expect(clippy::too_many_lines)]
    async fn update_property_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<PropertyTypeMetadata>, Report<UpdateError>>
    where
        P: IntoIterator<Item = UpdatePropertyTypesParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync,
    {
        let transaction = self.transaction().await.change_context(UpdateError)?;

        let mut relationships = HashSet::new();

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
                version: OntologyTypeVersion::new(
                    parameters
                        .schema
                        .id
                        .version
                        .inner()
                        .checked_sub(1)
                        .ok_or(UpdateError)
                        .attach_printable(
                            "The version of the property type is already at the lowest possible \
                             value",
                        )?,
                ),
            });

            let record_id = OntologyTypeRecordId::from(parameters.schema.id.clone());
            let property_type_id = PropertyTypeUuid::from_url(&parameters.schema.id);

            let (ontology_id, web_id, temporal_versioning) = transaction
                .update_owned_ontology_id(&parameters.schema.id, &provenance.edition)
                .await?;

            relationships.extend(
                iter::once(PropertyTypeRelationAndSubject::Owner {
                    subject: PropertyTypeOwnerSubject::Web { id: web_id },
                    level: 0,
                })
                .chain(parameters.relationships)
                .map(|relation_and_subject| (property_type_id, relation_and_subject)),
            );

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
            .with_actions([ActionName::UpdatePropertyType], false)
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
                        .attach(StatusCode::PermissionDenied)
                        .attach_printable(format!(
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
                .change_context(InsertionError)
                .attach_printable_lazy(|| {
                    format!(
                        "could not insert references for property type: {}",
                        &property_type.schema.id
                    )
                })
                .attach_lazy(|| property_type.schema.clone())
                .change_context(UpdateError)?;
        }

        transaction
            .authorization_api
            .modify_property_type_relations(relationships.clone().into_iter().map(
                |(resource, relation_and_subject)| {
                    (
                        ModifyRelationshipOperation::Create,
                        resource,
                        relation_and_subject,
                    )
                },
            ))
            .await
            .change_context(UpdateError)?;

        if let Err(error) = transaction.commit().await.change_context(InsertionError) {
            let mut error = error.expand();

            if let Err(auth_error) = self
                .authorization_api
                .modify_property_type_relations(relationships.into_iter().map(
                    |(resource, relation_and_subject)| {
                        (
                            ModifyRelationshipOperation::Delete,
                            resource,
                            relation_and_subject,
                        )
                    },
                ))
                .await
                .change_context(InsertionError)
            {
                error.push(auth_error);
            }

            Err(error.change_context(UpdateError))
        } else {
            if !self.settings.skip_embedding_creation
                && let Some(temporal_client) = &self.temporal_client
            {
                temporal_client
                    .start_update_property_type_embeddings_workflow(
                        actor_id,
                        &inserted_property_types,
                    )
                    .await
                    .change_context(UpdateError)?;
            }

            Ok(updated_property_type_metadata)
        }
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
            .with_actions([ActionName::ArchivePropertyType], false)
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
                    .attach(StatusCode::PermissionDenied)
                    .attach_printable(format!(
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
            .with_actions([ActionName::ArchivePropertyType], false)
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
                    .attach(StatusCode::PermissionDenied)
                    .attach_printable(format!(
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
            .with_action(params.action, true)
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
            .instrument(tracing::trace_span!("query"))
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
