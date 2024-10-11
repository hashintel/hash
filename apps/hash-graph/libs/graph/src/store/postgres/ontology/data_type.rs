use alloc::sync::Arc;
use core::{iter::once, mem};
use std::collections::{HashMap, HashSet};

use authorization::{
    AuthorizationApi,
    backend::ModifyRelationshipOperation,
    schema::{DataTypeOwnerSubject, DataTypePermission, DataTypeRelationAndSubject, WebPermission},
    zanzibar::{Consistency, Zookie},
};
use error_stack::{Result, ResultExt};
use futures::StreamExt;
use graph_types::{
    Embedding,
    account::{AccountId, EditionArchivedById, EditionCreatedById},
    ontology::{
        DataTypeMetadata, DataTypeWithMetadata, OntologyEditionProvenance, OntologyProvenance,
        OntologyTemporalMetadata, OntologyTypeClassificationMetadata, OntologyTypeRecordId,
    },
};
use hash_graph_store::{
    data_type::DataTypeQueryPath,
    filter::{Filter, FilterExpression, ParameterList},
    subgraph::{
        Subgraph, SubgraphRecord,
        edges::{EdgeDirection, GraphResolveDepths, OntologyEdgeKind},
        identifier::{DataTypeVertexId, GraphElementVertexId},
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxes, QueryTemporalAxesUnresolved,
            VariableAxis, VariableTemporalAxisUnresolved,
        },
    },
};
use hash_status::StatusCode;
use postgres_types::{Json, ToSql};
use temporal_versioning::{RightBoundedTemporalInterval, Timestamp, TransactionTime};
use tokio_postgres::{GenericClient, Row};
use tracing::instrument;
use type_system::{
    Valid, Validator,
    schema::{
        ClosedDataType, ConversionDefinition, Conversions, DataType, DataTypeEdge, DataTypeId,
        DataTypeResolveData, DataTypeValidator, InheritanceDepth, OntologyTypeResolver,
    },
    url::{BaseUrl, OntologyTypeVersion, VersionedUrl},
};

use crate::store::{
    AsClient, DataTypeStore, InsertionError, PostgresStore, QueryError, StoreCache, StoreProvider,
    UpdateError,
    crud::{QueryResult, Read, ReadPaginated, VersionedUrlSorting},
    error::DeletionError,
    ontology::{
        ArchiveDataTypeParams, CountDataTypesParams, CreateDataTypeParams,
        GetDataTypeSubgraphParams, GetDataTypeSubgraphResponse, GetDataTypesParams,
        GetDataTypesResponse, UnarchiveDataTypeParams, UpdateDataTypeEmbeddingParams,
        UpdateDataTypesParams,
    },
    postgres::{
        TraversalContext,
        crud::QueryRecordDecode,
        ontology::{
            OntologyId, PostgresOntologyTypeClassificationMetadata, read::OntologyTypeTraversalData,
        },
        query::{
            Distinctness, InsertStatementBuilder, PostgresRecord, ReferenceTable, SelectCompiler,
            Table, rows::DataTypeConversionsRow,
        },
    },
};

impl<C, A> PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    #[tracing::instrument(level = "trace", skip(data_types, authorization_api, zookie))]
    pub(crate) async fn filter_data_types_by_permission<I, T>(
        data_types: impl IntoIterator<Item = (I, T)> + Send,
        actor_id: AccountId,
        authorization_api: &A,
        zookie: &Zookie<'static>,
    ) -> Result<impl Iterator<Item = T>, QueryError>
    where
        I: Into<DataTypeId> + Send,
        T: Send,
    {
        let (ids, data_types): (Vec<_>, Vec<_>) = data_types
            .into_iter()
            .map(|(id, edge)| (id.into(), edge))
            .unzip();

        let permissions = authorization_api
            .check_data_types_permission(
                actor_id,
                DataTypePermission::View,
                ids.iter().copied(),
                Consistency::AtExactSnapshot(zookie),
            )
            .await
            .change_context(QueryError)?
            .0;

        Ok(ids
            .into_iter()
            .zip(data_types)
            .filter_map(move |(id, data_type)| {
                permissions
                    .get(&id)
                    .copied()
                    .unwrap_or(false)
                    .then_some(data_type)
            }))
    }

    async fn get_data_type_inheritance_metadata(
        &self,
        data_types: &[DataTypeId],
    ) -> Result<impl Iterator<Item = (DataTypeId, DataTypeResolveData)>, QueryError> {
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
            .await
            .change_context(QueryError)?
            .into_iter()
            .map(|row| {
                let source_id: DataTypeId = row.get(0);
                let targets: Vec<DataTypeId> = row.get(1);
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

    async fn get_data_types_impl(
        &self,
        actor_id: AccountId,
        params: GetDataTypesParams<'_>,
        temporal_axes: &QueryTemporalAxes,
    ) -> Result<(GetDataTypesResponse, Zookie<'static>), QueryError> {
        #[expect(clippy::if_then_some_else_none, reason = "Function is async")]
        let count = if params.include_count {
            Some(
                self.count_data_types(actor_id, CountDataTypesParams {
                    filter: params.filter.clone(),
                    temporal_axes: params.temporal_axes.clone(),
                    include_drafts: params.include_drafts,
                })
                .await?,
            )
        } else {
            None
        };

        // TODO: Remove again when subgraph logic was revisited
        //   see https://linear.app/hash/issue/H-297
        let mut visited_ontology_ids = HashSet::new();

        let (data, artifacts) =
            ReadPaginated::<DataTypeWithMetadata, VersionedUrlSorting>::read_paginated_vec(
                self,
                &params.filter,
                Some(temporal_axes),
                &VersionedUrlSorting {
                    cursor: params.after,
                },
                params.limit,
                params.include_drafts,
            )
            .await?;
        let data_types = data
            .into_iter()
            .filter_map(|row| {
                let data_type = row.decode_record(&artifacts);
                let id = DataTypeId::from_url(&data_type.schema.id);
                // The records are already sorted by time, so we can just take the first one
                visited_ontology_ids.insert(id).then_some((id, data_type))
            })
            .collect::<Vec<_>>();

        let filtered_ids = data_types
            .iter()
            .map(|(data_type_id, _)| *data_type_id)
            .collect::<Vec<_>>();

        let (permissions, zookie) = self
            .authorization_api
            .check_data_types_permission(
                actor_id,
                DataTypePermission::View,
                filtered_ids,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(QueryError)?;

        let data_types = data_types
            .into_iter()
            .filter_map(|(id, data_type)| {
                permissions
                    .get(&id)
                    .copied()
                    .unwrap_or(false)
                    .then_some(data_type)
            })
            .collect::<Vec<_>>();

        Ok((
            GetDataTypesResponse {
                cursor: if params.limit.is_some() {
                    data_types
                        .last()
                        .map(|data_type| data_type.schema.id.clone())
                } else {
                    None
                },
                data_types,
                count,
            },
            zookie,
        ))
    }

    /// Internal method to read a [`DataTypeWithMetadata`] into a [`TraversalContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "info", skip(self))]
    pub(crate) async fn traverse_data_types(
        &self,
        mut data_type_queue: Vec<(
            DataTypeId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        traversal_context: &mut TraversalContext,
        actor_id: AccountId,
        zookie: &Zookie<'static>,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
        while !data_type_queue.is_empty() {
            let mut edges_to_traverse =
                HashMap::<OntologyEdgeKind, OntologyTypeTraversalData>::new();

            for (data_type_ontology_id, graph_resolve_depths, traversal_interval) in
                mem::take(&mut data_type_queue)
            {
                for edge_kind in [
                    OntologyEdgeKind::InheritsFrom,
                    OntologyEdgeKind::ConstrainsValuesOn,
                ] {
                    if let Some(new_graph_resolve_depths) = graph_resolve_depths
                        .decrement_depth_for_edge(edge_kind, EdgeDirection::Outgoing)
                    {
                        edges_to_traverse.entry(edge_kind).or_default().push(
                            OntologyId::from(data_type_ontology_id),
                            new_graph_resolve_depths,
                            traversal_interval,
                        );
                    }
                }
            }

            for (edge_kind, table) in [
                (
                    OntologyEdgeKind::InheritsFrom,
                    ReferenceTable::DataTypeInheritsFrom {
                        // TODO: Use the resolve depths passed to the query
                        inheritance_depth: Some(0),
                    },
                ),
                (
                    OntologyEdgeKind::ConstrainsValuesOn,
                    ReferenceTable::DataTypeConstrainsValuesOn,
                ),
            ] {
                if let Some(traversal_data) = edges_to_traverse.get(&edge_kind) {
                    data_type_queue.extend(
                        Self::filter_data_types_by_permission(
                            self.read_ontology_edges::<DataTypeVertexId, DataTypeVertexId>(
                                traversal_data,
                                table,
                            )
                            .await?,
                            actor_id,
                            &self.authorization_api,
                            zookie,
                        )
                        .await?
                        .flat_map(|edge| {
                            subgraph.insert_edge(
                                &edge.left_endpoint,
                                edge_kind,
                                EdgeDirection::Outgoing,
                                edge.right_endpoint.clone(),
                            );

                            traversal_context.add_data_type_id(
                                DataTypeId::from(edge.right_endpoint_ontology_id),
                                edge.resolve_depths,
                                edge.traversal_interval,
                            )
                        }),
                    );
                }
            }
        }

        Ok(())
    }

    #[tracing::instrument(level = "info", skip(self))]
    pub async fn delete_data_types(&mut self) -> Result<(), DeletionError> {
        let transaction = self.transaction().await.change_context(DeletionError)?;

        transaction
            .as_client()
            .simple_query(
                "
                    DELETE FROM data_type_embeddings;
                    DELETE FROM data_type_inherits_from;
                    DELETE FROM data_type_constrains_values_on;
                    DELETE FROM data_type_conversions;
                ",
            )
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
            .await
            .change_context(DeletionError)?
            .into_iter()
            .filter_map(|row| row.get(0))
            .collect::<Vec<OntologyId>>();

        transaction.delete_ontology_ids(&data_types).await?;

        transaction.commit().await.change_context(DeletionError)?;

        Ok(())
    }
}

impl<C, A> DataTypeStore for PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    #[tracing::instrument(level = "info", skip(self, params))]
    async fn create_data_types<P, R>(
        &mut self,
        actor_id: AccountId,
        params: P,
    ) -> Result<Vec<DataTypeMetadata>, InsertionError>
    where
        P: IntoIterator<Item = CreateDataTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync,
    {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let mut relationships = HashSet::new();

        let mut inserted_data_type_metadata = Vec::new();
        let mut inserted_data_types = Vec::new();
        let mut data_type_reference_ids = HashSet::new();
        let mut data_type_conversions_rows = Vec::new();

        for parameters in params {
            let provenance = OntologyProvenance {
                edition: OntologyEditionProvenance {
                    created_by_id: EditionCreatedById::new(actor_id),
                    archived_by_id: None,
                    user_defined: parameters.provenance,
                },
            };

            let record_id = OntologyTypeRecordId::from(parameters.schema.id.clone());
            let data_type_id = DataTypeId::from_url(&parameters.schema.id);
            if let OntologyTypeClassificationMetadata::Owned { owned_by_id } =
                &parameters.classification
            {
                transaction
                    .authorization_api
                    .check_web_permission(
                        actor_id,
                        WebPermission::CreateDataType,
                        *owned_by_id,
                        Consistency::FullyConsistent,
                    )
                    .await
                    .change_context(InsertionError)?
                    .assert_permission()
                    .change_context(InsertionError)?;

                relationships.insert((data_type_id, DataTypeRelationAndSubject::Owner {
                    subject: DataTypeOwnerSubject::Web { id: *owned_by_id },
                    level: 0,
                }));
            }

            relationships.extend(
                parameters
                    .relationships
                    .into_iter()
                    .map(|relation_and_subject| (data_type_id, relation_and_subject)),
            );

            if let Some((_ontology_id, temporal_versioning)) = transaction
                .create_ontology_metadata(
                    &record_id,
                    &parameters.classification,
                    parameters.conflict_behavior,
                    &provenance,
                )
                .await?
            {
                data_type_reference_ids.extend(
                    parameters
                        .schema
                        .data_type_references()
                        .map(|(reference, _)| DataTypeId::from_url(&reference.url)),
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
                    classification: parameters.classification,
                    temporal_versioning,
                    provenance,
                    conversions: parameters.conversions,
                });
            }
        }

        let mut ontology_type_resolver = OntologyTypeResolver::default();

        for (data_type_id, inserted_data_type) in &inserted_data_types {
            ontology_type_resolver.add_unresolved(*data_type_id, Arc::clone(inserted_data_type));
        }

        let required_parent_ids = data_type_reference_ids.into_iter().collect::<Vec<_>>();

        let mut parent_inheritance_data = transaction
            .get_data_type_inheritance_metadata(&required_parent_ids)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not read parent data type inheritance data")?
            .collect::<HashMap<_, _>>();

        transaction
            .get_data_types(actor_id, GetDataTypesParams {
                filter: Filter::In(
                    FilterExpression::Path {
                        path: DataTypeQueryPath::OntologyId,
                    },
                    ParameterList::DataTypeIds(&required_parent_ids),
                ),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                include_drafts: false,
                after: None,
                limit: None,
                include_count: false,
            })
            .await
            .change_context(InsertionError)
            .attach_printable("Could not read parent data types")?
            .data_types
            .into_iter()
            .for_each(|parent| {
                let parent_id = DataTypeId::from_url(&parent.schema.id);
                if let Some(inheritance_data) = parent_inheritance_data.remove(&parent_id) {
                    ontology_type_resolver.add_closed(
                        parent_id,
                        Arc::new(parent.schema),
                        Arc::new(inheritance_data),
                    );
                } else {
                    if !parent.schema.all_of.is_empty() {
                        tracing::warn!("No inheritance data found for `{}`", parent.schema.id);
                    }
                    ontology_type_resolver.add_unresolved(parent_id, Arc::new(parent.schema));
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
            .collect::<Result<Vec<_>, _>>()?;

        let data_type_validator = DataTypeValidator;
        for (data_type_id, data_type) in &inserted_data_types {
            let schema = data_type_validator
                .validate_ref(&**data_type)
                .await
                .attach(StatusCode::InvalidArgument)
                .change_context(InsertionError)?;
            transaction
                .insert_data_type_with_id(*data_type_id, schema)
                .await?;
        }
        for ((closed_schema, closed_metadata), (data_type_id, _)) in
            closed_schemas.iter().zip(&inserted_data_types)
        {
            data_type_validator
                .validate_ref(closed_schema)
                .await
                .attach(StatusCode::InvalidArgument)
                .change_context(InsertionError)?;

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
            .await
            .change_context(InsertionError)?;

        #[expect(clippy::needless_collect, reason = "Higher ranked lifetime error")]
        transaction
            .authorization_api
            .modify_data_type_relations(
                relationships
                    .iter()
                    .map(|(resource, relation_and_subject)| {
                        (
                            ModifyRelationshipOperation::Create,
                            *resource,
                            *relation_and_subject,
                        )
                    })
                    .collect::<Vec<_>>(),
            )
            .await
            .change_context(InsertionError)?;

        if let Err(error) = transaction.commit().await.change_context(InsertionError) {
            let mut error = error.expand();

            if let Err(auth_error) = self
                .authorization_api
                .modify_data_type_relations(relationships.into_iter().map(
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
            if let Some(temporal_client) = &self.temporal_client {
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
    }

    async fn get_data_types(
        &self,
        actor_id: AccountId,
        mut params: GetDataTypesParams<'_>,
    ) -> Result<GetDataTypesResponse, QueryError> {
        params
            .filter
            .convert_parameters(&StoreProvider {
                store: self,
                cache: StoreCache::default(),
                authorization: Some((actor_id, Consistency::FullyConsistent)),
            })
            .await
            .change_context(QueryError)?;

        let temporal_axes = params.temporal_axes.clone().resolve();
        self.get_data_types_impl(actor_id, params, &temporal_axes)
            .await
            .map(|(response, _)| response)
    }

    // TODO: take actor ID into consideration, but currently we don't have any non-public data types
    //       anyway.
    async fn count_data_types(
        &self,
        actor_id: AccountId,
        mut params: CountDataTypesParams<'_>,
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

        Ok(self
            .read(
                &params.filter,
                Some(&params.temporal_axes.resolve()),
                params.include_drafts,
            )
            .await?
            .count()
            .await)
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_data_type_subgraph(
        &self,
        actor_id: AccountId,
        mut params: GetDataTypeSubgraphParams<'_>,
    ) -> Result<GetDataTypeSubgraphResponse, QueryError> {
        params
            .filter
            .convert_parameters(&StoreProvider {
                store: self,
                cache: StoreCache::default(),
                authorization: Some((actor_id, Consistency::FullyConsistent)),
            })
            .await
            .change_context(QueryError)?;

        let temporal_axes = params.temporal_axes.clone().resolve();
        let time_axis = temporal_axes.variable_time_axis();

        let (
            GetDataTypesResponse {
                data_types,
                cursor,
                count,
            },
            zookie,
        ) = self
            .get_data_types_impl(
                actor_id,
                GetDataTypesParams {
                    filter: params.filter,
                    temporal_axes: params.temporal_axes.clone(),
                    after: params.after,
                    limit: params.limit,
                    include_drafts: params.include_drafts,
                    include_count: params.include_count,
                },
                &temporal_axes,
            )
            .await?;

        let mut subgraph = Subgraph::new(
            params.graph_resolve_depths,
            params.temporal_axes,
            temporal_axes.clone(),
        );

        let (data_type_ids, data_type_vertex_ids): (Vec<_>, Vec<_>) = data_types
            .iter()
            .map(|data_type| {
                (
                    DataTypeId::from_url(&data_type.schema.id),
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
                .map(|id| {
                    (
                        id,
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

        Ok(GetDataTypeSubgraphResponse {
            subgraph,
            cursor,
            count,
        })
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn update_data_type<R>(
        &mut self,
        actor_id: AccountId,
        params: UpdateDataTypesParams<R>,
    ) -> Result<DataTypeMetadata, UpdateError>
    where
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync,
    {
        let data_type_validator = DataTypeValidator;

        let old_ontology_id = DataTypeId::from_url(&VersionedUrl {
            base_url: params.schema.id.base_url.clone(),
            version: OntologyTypeVersion::new(
                params
                    .schema
                    .id
                    .version
                    .inner()
                    .checked_sub(1)
                    .ok_or(UpdateError)
                    .attach_printable(
                        "The version of the data type is already at the lowest possible value",
                    )?,
            ),
        });
        let new_ontology_id = DataTypeId::from_url(&params.schema.id);
        self.authorization_api
            .check_data_type_permission(
                actor_id,
                DataTypePermission::Update,
                old_ontology_id,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(UpdateError)?
            .assert_permission()
            .change_context(UpdateError)?;

        let transaction = self.transaction().await.change_context(UpdateError)?;

        let provenance = OntologyProvenance {
            edition: OntologyEditionProvenance {
                created_by_id: EditionCreatedById::new(actor_id),
                archived_by_id: None,
                user_defined: params.provenance,
            },
        };

        let schema = data_type_validator
            .validate(params.schema)
            .await
            .change_context(UpdateError)?;

        let mut ontology_type_resolver = OntologyTypeResolver::default();

        let required_parent_ids = schema
            .data_type_references()
            .map(|(reference, _)| DataTypeId::from_url(&reference.url))
            .collect::<Vec<_>>();

        let mut parent_inheritance_data = transaction
            .get_data_type_inheritance_metadata(&required_parent_ids)
            .await
            .change_context(UpdateError)
            .attach_printable("Could not read parent data type inheritance data")?
            .collect::<HashMap<_, _>>();

        transaction
            .get_data_types(actor_id, GetDataTypesParams {
                filter: Filter::In(
                    FilterExpression::Path {
                        path: DataTypeQueryPath::OntologyId,
                    },
                    ParameterList::DataTypeIds(&required_parent_ids),
                ),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                include_drafts: false,
                after: None,
                limit: None,
                include_count: false,
            })
            .await
            .change_context(UpdateError)
            .attach_printable("Could not read parent data types")?
            .data_types
            .into_iter()
            .for_each(|parent| {
                let parent_id = DataTypeId::from_url(&parent.schema.id);
                if let Some(inheritance_data) = parent_inheritance_data.remove(&parent_id) {
                    ontology_type_resolver.add_closed(
                        parent_id,
                        Arc::new(parent.schema),
                        Arc::new(inheritance_data),
                    );
                } else {
                    if !parent.schema.all_of.is_empty() {
                        tracing::warn!("No inheritance data found for `{}`", parent.schema.id);
                    }
                    ontology_type_resolver.add_unresolved(parent_id, Arc::new(parent.schema));
                }
            });

        ontology_type_resolver
            .add_unresolved(new_ontology_id, Arc::new(schema.clone().into_inner()));
        let resolve_data = ontology_type_resolver
            .resolve_data_type_metadata(new_ontology_id)
            .change_context(UpdateError)?;

        let closed_schema = data_type_validator
            .validate(
                ClosedDataType::from_resolve_data(schema.clone().into_inner(), &resolve_data)
                    .change_context(UpdateError)?,
            )
            .await
            .change_context(UpdateError)?;
        let (ontology_id, owned_by_id, temporal_versioning) = transaction
            .update_owned_ontology_id(&schema.id, &provenance.edition)
            .await?;

        let data_type_id = DataTypeId::from(ontology_id);

        transaction
            .insert_data_type_with_id(data_type_id, &schema)
            .await
            .change_context(UpdateError)?;
        transaction
            .insert_data_type_references(data_type_id, &resolve_data)
            .await
            .change_context(UpdateError)?;

        let data_type_conversions_rows = params
            .conversions
            .iter()
            .map(|(base_url, conversions)| DataTypeConversionsRow {
                source_data_type_ontology_id: data_type_id,
                target_data_type_base_url: base_url.clone(),
                from: conversions.from.clone(),
                into: conversions.to.clone(),
            })
            .collect::<Vec<_>>();
        let (statement, parameters) = InsertStatementBuilder::from_rows(
            Table::DataTypeConversions,
            &data_type_conversions_rows,
        )
        .compile();
        transaction
            .as_client()
            .query(&statement, &parameters)
            .await
            .change_context(UpdateError)?;

        let relationships = params
            .relationships
            .into_iter()
            .chain(once(DataTypeRelationAndSubject::Owner {
                subject: DataTypeOwnerSubject::Web { id: owned_by_id },
                level: 0,
            }))
            .collect::<Vec<_>>();

        transaction
            .authorization_api
            .modify_data_type_relations(relationships.clone().into_iter().map(
                |relation_and_subject| {
                    (
                        ModifyRelationshipOperation::Create,
                        data_type_id,
                        relation_and_subject,
                    )
                },
            ))
            .await
            .change_context(UpdateError)?;

        if let Err(error) = transaction.commit().await.change_context(UpdateError) {
            let mut error = error.expand();

            if let Err(auth_error) = self
                .authorization_api
                .modify_data_type_relations(relationships.into_iter().map(|relation_and_subject| {
                    (
                        ModifyRelationshipOperation::Delete,
                        data_type_id,
                        relation_and_subject,
                    )
                }))
                .await
                .change_context(UpdateError)
            {
                error.push(auth_error);
            }

            Err(error.change_context(UpdateError))
        } else {
            let metadata = DataTypeMetadata {
                record_id: OntologyTypeRecordId::from(closed_schema.id.clone()),
                classification: OntologyTypeClassificationMetadata::Owned { owned_by_id },
                temporal_versioning,
                provenance,
                conversions: params.conversions,
            };

            if let Some(temporal_client) = &self.temporal_client {
                temporal_client
                    .start_update_data_type_embeddings_workflow(actor_id, &[DataTypeWithMetadata {
                        schema: schema.into_inner(),
                        metadata: metadata.clone(),
                    }])
                    .await
                    .change_context(UpdateError)?;
            }

            Ok(metadata)
        }
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn archive_data_type(
        &mut self,
        actor_id: AccountId,
        params: ArchiveDataTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.archive_ontology_type(&params.data_type_id, EditionArchivedById::new(actor_id))
            .await
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn unarchive_data_type(
        &mut self,
        actor_id: AccountId,
        params: UnarchiveDataTypeParams,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.unarchive_ontology_type(&params.data_type_id, &OntologyEditionProvenance {
            created_by_id: EditionCreatedById::new(actor_id),
            archived_by_id: None,
            user_defined: params.provenance,
        })
        .await
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn update_data_type_embeddings(
        &mut self,
        _: AccountId,
        params: UpdateDataTypeEmbeddingParams<'_>,
    ) -> Result<(), UpdateError> {
        #[derive(Debug, ToSql)]
        #[postgres(name = "data_type_embeddings")]
        pub struct DataTypeEmbeddingsRow<'a> {
            ontology_id: OntologyId,
            embedding: Embedding<'a>,
            updated_at_transaction_time: Timestamp<TransactionTime>,
        }
        let data_type_embeddings = vec![DataTypeEmbeddingsRow {
            ontology_id: OntologyId::from(DataTypeId::from_url(&params.data_type_id)),
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
            .await
            .change_context(UpdateError)?;

        Ok(())
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn reindex_cache(&mut self) -> Result<(), UpdateError> {
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
            .await
            .change_context(UpdateError)?;

        let mut ontology_type_resolver = OntologyTypeResolver::default();

        let data_type_ids = Read::<DataTypeWithMetadata>::read_vec(
            &transaction,
            &Filter::All(Vec::new()),
            None,
            true,
        )
        .await
        .change_context(UpdateError)?
        .into_iter()
        .map(|data_type| {
            let schema = Arc::new(data_type.schema);
            let data_type_id = DataTypeId::from_url(&schema.id);
            ontology_type_resolver.add_unresolved(data_type_id, Arc::clone(&schema));
            data_type_id
        })
        .collect::<Vec<_>>();

        for data_type_id in data_type_ids {
            let schema_metadata = ontology_type_resolver
                .resolve_data_type_metadata(data_type_id)
                .change_context(UpdateError)?;

            transaction
                .insert_data_type_references(data_type_id, &schema_metadata)
                .await
                .change_context(UpdateError)?;
        }

        transaction.commit().await.change_context(UpdateError)?;

        Ok(())
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
                classification: row
                    .get::<_, Json<PostgresOntologyTypeClassificationMetadata>>(
                        indices.additional_metadata,
                    )
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
                None,
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
