use alloc::sync::Arc;
use core::iter::once;
use std::collections::HashSet;

use authorization::{
    backend::ModifyRelationshipOperation,
    schema::{DataTypeOwnerSubject, DataTypePermission, DataTypeRelationAndSubject, WebPermission},
    zanzibar::{Consistency, Zookie},
    AuthorizationApi,
};
use error_stack::{Result, ResultExt};
use futures::FutureExt;
use graph_types::{
    account::{AccountId, EditionArchivedById, EditionCreatedById},
    ontology::{
        DataTypeId, DataTypeMetadata, DataTypeWithMetadata, OntologyEditionProvenance,
        OntologyProvenance, OntologyTemporalMetadata, OntologyTypeClassificationMetadata,
        OntologyTypeRecordId,
    },
    Embedding,
};
use postgres_types::{Json, ToSql};
use temporal_versioning::{RightBoundedTemporalInterval, Timestamp, TransactionTime};
use tokio_postgres::{GenericClient, Row};
use tracing::instrument;
use type_system::{
    schema::{DataTypeValidator, OntologyTypeResolver},
    url::{OntologyTypeVersion, VersionedUrl},
    Validator,
};

use crate::{
    ontology::DataTypeQueryPath,
    store::{
        crud::{QueryResult, ReadPaginated, VertexIdSorting},
        error::DeletionError,
        ontology::{
            ArchiveDataTypeParams, CountDataTypesParams, CreateDataTypeParams,
            GetDataTypeSubgraphParams, GetDataTypeSubgraphResponse, GetDataTypesParams,
            GetDataTypesResponse, UnarchiveDataTypeParams, UpdateDataTypeEmbeddingParams,
            UpdateDataTypesParams,
        },
        postgres::{
            crud::QueryRecordDecode,
            ontology::{OntologyId, PostgresOntologyTypeClassificationMetadata},
            query::{Distinctness, PostgresRecord, SelectCompiler, Table},
            TraversalContext,
        },
        AsClient, DataTypeStore, InsertionError, PostgresStore, QueryError, SubgraphRecord,
        UpdateError,
    },
    subgraph::{
        edges::GraphResolveDepths,
        identifier::GraphElementVertexId,
        temporal_axes::{QueryTemporalAxes, VariableAxis},
        Subgraph,
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

    #[expect(clippy::manual_async_fn, reason = "This method is recursive")]
    fn get_data_types_impl(
        &self,
        actor_id: AccountId,
        params: GetDataTypesParams<'_>,
        temporal_axes: &QueryTemporalAxes,
    ) -> impl Future<Output = Result<(GetDataTypesResponse, Zookie<'static>), QueryError>> + Send
    {
        async move {
            #[expect(clippy::if_then_some_else_none, reason = "Function is async")]
            let count = if params.include_count {
                Some(
                    self.count_data_types(
                        actor_id,
                        CountDataTypesParams {
                            filter: params.filter.clone(),
                            temporal_axes: params.temporal_axes.clone(),
                            include_drafts: params.include_drafts,
                        },
                    )
                    .boxed()
                    .await?,
                )
            } else {
                None
            };

            // TODO: Remove again when subgraph logic was revisited
            //   see https://linear.app/hash/issue/H-297
            let mut visited_ontology_ids = HashSet::new();
            let time_axis = temporal_axes.variable_time_axis();

            let (data, artifacts) = ReadPaginated::<DataTypeWithMetadata>::read_paginated_vec(
                self,
                &params.filter,
                Some(temporal_axes),
                &VertexIdSorting {
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
                            .map(|data_type| data_type.vertex_id(time_axis))
                    } else {
                        None
                    },
                    data_types,
                    count,
                },
                zookie,
            ))
        }
    }

    /// Internal method to read a [`DataTypeWithMetadata`] into a [`TraversalContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "info", skip(self))]
    pub(crate) async fn traverse_data_types(
        &self,
        queue: Vec<(
            OntologyId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        _: &mut TraversalContext,
        actor_id: AccountId,
        _: &Zookie<'static>,
        _: &mut Subgraph,
    ) -> Result<(), QueryError> {
        // TODO: data types currently have no references to other types, so we don't need to do
        //       anything here
        //   see https://linear.app/hash/issue/H-3075/allow-traversing-data-type-edges

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

        let data_type_validator = DataTypeValidator;
        let mut ontology_type_resolver = OntologyTypeResolver::default();

        // TODO: Avoid cloning the schema
        let (schemas, params): (Vec<_>, Vec<_>) = params
            .into_iter()
            .map(|params| (Arc::new(params.schema.clone()), params))
            .unzip();
        let schema_metadata = ontology_type_resolver
            .resolve_data_type_metadata(schemas)
            .change_context(InsertionError)?;

        for (parameters, schema_metadata) in params.into_iter().zip(schema_metadata) {
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

                relationships.insert((
                    data_type_id,
                    DataTypeRelationAndSubject::Owner {
                        subject: DataTypeOwnerSubject::Web { id: *owned_by_id },
                        level: 0,
                    },
                ));
            }

            relationships.extend(
                parameters
                    .relationships
                    .into_iter()
                    .map(|relation_and_subject| (data_type_id, relation_and_subject)),
            );

            if let Some((ontology_id, temporal_versioning)) = transaction
                .create_ontology_metadata(
                    &record_id,
                    &parameters.classification,
                    parameters.conflict_behavior,
                    &provenance,
                )
                .await?
            {
                let schema = data_type_validator
                    .validate_ref(&parameters.schema)
                    .await
                    .change_context(InsertionError)?;
                let closed_schema = data_type_validator
                    .validate(
                        ontology_type_resolver
                            .get_closed_data_type(&schema.id)
                            .change_context(InsertionError)?,
                    )
                    .await
                    .change_context(InsertionError)?;
                transaction
                    .insert_data_type_with_id(ontology_id, schema, &closed_schema, &schema_metadata)
                    .await?;
                let metadata = DataTypeMetadata {
                    record_id,
                    classification: parameters.classification,
                    temporal_versioning,
                    provenance,
                };
                if transaction.temporal_client.is_some() {
                    inserted_data_types.push(DataTypeWithMetadata {
                        schema: parameters.schema,
                        metadata: metadata.clone(),
                    });
                }
                inserted_data_type_metadata.push(metadata);
            }
        }

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

        if let Err(mut error) = transaction.commit().await.change_context(InsertionError) {
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
                // TODO: Use `add_child`
                //   see https://linear.app/hash/issue/GEN-105/add-ability-to-add-child-errors
                error.extend_one(auth_error);
            }

            Err(error)
        } else {
            if let Some(temporal_client) = &self.temporal_client {
                temporal_client
                    .start_update_data_type_embeddings_workflow(actor_id, &inserted_data_types)
                    .await
                    .change_context(InsertionError)?;
            }

            Ok(inserted_data_type_metadata)
        }
    }

    async fn get_data_types(
        &self,
        actor_id: AccountId,
        params: GetDataTypesParams<'_>,
    ) -> Result<GetDataTypesResponse, QueryError> {
        let temporal_axes = params.temporal_axes.clone().resolve();
        self.get_data_types_impl(actor_id, params, &temporal_axes)
            .await
            .map(|(response, _)| response)
    }

    async fn count_data_types(
        &self,
        actor_id: AccountId,
        params: CountDataTypesParams<'_>,
    ) -> Result<usize, QueryError> {
        self.get_data_types(
            actor_id,
            GetDataTypesParams {
                filter: params.filter,
                temporal_axes: params.temporal_axes,
                include_drafts: params.include_drafts,
                after: None,
                limit: None,
                include_count: false,
            },
        )
        .await
        .map(|response| response.data_types.len())
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_data_type_subgraph(
        &self,
        actor_id: AccountId,
        params: GetDataTypeSubgraphParams<'_>,
    ) -> Result<GetDataTypeSubgraphResponse, QueryError> {
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
                        OntologyId::from(id),
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
            .validate_ref(&params.schema)
            .await
            .change_context(UpdateError)?;

        let mut ontology_type_resolver = OntologyTypeResolver::default();
        let [metadata] = ontology_type_resolver
            .resolve_data_type_metadata([Arc::new(schema.clone().into_inner())])
            .change_context(UpdateError)?
            .try_into()
            .expect("Expected exactly one closed data type metadata");
        let closed_schema = data_type_validator
            .validate(
                ontology_type_resolver
                    .get_closed_data_type(&schema.id)
                    .change_context(UpdateError)?,
            )
            .await
            .change_context(UpdateError)?;
        let (ontology_id, owned_by_id, temporal_versioning) = transaction
            .update_owned_ontology_id(&schema.id, &provenance.edition)
            .await?;
        transaction
            .insert_data_type_with_id(ontology_id, schema, &closed_schema, &metadata)
            .await
            .change_context(UpdateError)?;

        let data_type_id = DataTypeId::from(ontology_id);

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

        if let Err(mut error) = transaction.commit().await.change_context(UpdateError) {
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
                // TODO: Use `add_child`
                //   see https://linear.app/hash/issue/GEN-105/add-ability-to-add-child-errors
                error.extend_one(auth_error);
            }

            Err(error)
        } else {
            let metadata = DataTypeMetadata {
                record_id: OntologyTypeRecordId::from(params.schema.id.clone()),
                classification: OntologyTypeClassificationMetadata::Owned { owned_by_id },
                temporal_versioning,
                provenance,
            };

            if let Some(temporal_client) = &self.temporal_client {
                temporal_client
                    .start_update_data_type_embeddings_workflow(
                        actor_id,
                        &[DataTypeWithMetadata {
                            schema: params.schema,
                            metadata: metadata.clone(),
                        }],
                    )
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
        self.unarchive_ontology_type(
            &params.data_type_id,
            &OntologyEditionProvenance {
                created_by_id: EditionCreatedById::new(actor_id),
                archived_by_id: None,
                user_defined: params.provenance,
            },
        )
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
}

#[derive(Debug, Copy, Clone)]
pub struct DataTypeRowIndices {
    pub base_url: usize,
    pub version: usize,
    pub transaction_time: usize,

    pub schema: usize,

    pub edition_provenance: usize,
    pub additional_metadata: usize,
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
        }
    }
}
