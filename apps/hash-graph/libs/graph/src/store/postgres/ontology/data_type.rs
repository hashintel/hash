use std::{collections::HashSet, iter::once};

use authorization::{
    backend::ModifyRelationshipOperation,
    schema::{
        DataTypeId, DataTypeOwnerSubject, DataTypePermission, DataTypeRelationAndSubject,
        WebPermission,
    },
    zanzibar::{Consistency, Zookie},
    AuthorizationApi,
};
use error_stack::{Result, ResultExt};
use graph_types::{
    account::{AccountId, EditionArchivedById, EditionCreatedById},
    ontology::{
        DataTypeEmbedding, DataTypeMetadata, DataTypeWithMetadata,
        OntologyEditionProvenanceMetadata, OntologyProvenanceMetadata, OntologyTemporalMetadata,
        OntologyTypeClassificationMetadata, OntologyTypeRecordId, PartialDataTypeMetadata,
    },
    Embedding,
};
use postgres_types::{Json, ToSql};
use temporal_client::TemporalClient;
use temporal_versioning::{RightBoundedTemporalInterval, Timestamp, TransactionTime};
use tokio_postgres::{GenericClient, Row};
use type_system::{
    url::{BaseUrl, VersionedUrl},
    DataType,
};

use crate::{
    ontology::DataTypeQueryPath,
    store::{
        crud::{QueryResult, ReadPaginated, VertexIdSorting},
        error::DeletionError,
        postgres::{
            crud::QueryRecordDecode,
            ontology::{OntologyId, PostgresOntologyTypeClassificationMetadata},
            query::{Distinctness, PostgresRecord, SelectCompiler, Table},
            TraversalContext,
        },
        AsClient, ConflictBehavior, DataTypeStore, InsertionError, PostgresStore, QueryError,
        SubgraphRecord, UpdateError,
    },
    subgraph::{
        edges::GraphResolveDepths, identifier::DataTypeVertexId, query::StructuralQuery,
        temporal_axes::VariableAxis, Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    #[tracing::instrument(level = "trace", skip(data_types, authorization_api, zookie))]
    pub(crate) async fn filter_data_types_by_permission<I, T, A>(
        data_types: impl IntoIterator<Item = (I, T)> + Send,
        actor_id: AccountId,
        authorization_api: &A,
        zookie: &Zookie<'static>,
    ) -> Result<impl Iterator<Item = T>, QueryError>
    where
        I: Into<DataTypeId> + Send,
        T: Send,
        A: AuthorizationApi + Sync,
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

    /// Internal method to read a [`DataTypeWithMetadata`] into a [`TraversalContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "info", skip(self))]
    pub(crate) async fn traverse_data_types<A: AuthorizationApi + Sync>(
        &self,
        queue: Vec<(
            OntologyId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        _: &mut TraversalContext,
        actor_id: AccountId,
        _: &A,
        _: &Zookie<'static>,
        _: &mut Subgraph,
    ) -> Result<(), QueryError> {
        // TODO: data types currently have no references to other types, so we don't need to do
        //       anything here
        //   see https://app.asana.com/0/1200211978612931/1202464168422955/f

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

impl<C: AsClient> DataTypeStore for PostgresStore<C> {
    #[tracing::instrument(
        level = "info",
        skip(self, data_types, authorization_api, relationships)
    )]
    async fn create_data_types<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        data_types: impl IntoIterator<Item = (DataType, PartialDataTypeMetadata), IntoIter: Send> + Send,
        on_conflict: ConflictBehavior,
        relationships: impl IntoIterator<Item = DataTypeRelationAndSubject> + Send,
    ) -> Result<Vec<DataTypeMetadata>, InsertionError> {
        let requested_relationships = relationships.into_iter().collect::<Vec<_>>();
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let provenance = OntologyProvenanceMetadata {
            edition: OntologyEditionProvenanceMetadata {
                created_by_id: EditionCreatedById::new(actor_id),
                archived_by_id: None,
            },
        };

        let mut relationships = HashSet::new();

        let mut inserted_data_type_metadata = Vec::new();
        let mut inserted_data_types = Vec::new();

        for (schema, metadata) in data_types {
            let data_type_id = DataTypeId::from_url(schema.id());
            if let OntologyTypeClassificationMetadata::Owned { owned_by_id } =
                &metadata.classification
            {
                authorization_api
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
                requested_relationships
                    .iter()
                    .map(|relation_and_subject| (data_type_id, *relation_and_subject)),
            );

            if let Some((ontology_id, temporal_versioning)) = transaction
                .create_ontology_metadata(
                    provenance.edition.created_by_id,
                    &metadata.record_id,
                    &metadata.classification,
                    on_conflict,
                )
                .await?
            {
                transaction.insert_with_id(ontology_id, &schema).await?;
                let metadata = DataTypeMetadata {
                    record_id: metadata.record_id,
                    classification: metadata.classification,
                    temporal_versioning,
                    provenance,
                };
                if temporal_client.is_some() {
                    inserted_data_types.push(DataTypeWithMetadata {
                        schema,
                        metadata: metadata.clone(),
                    });
                }
                inserted_data_type_metadata.push(metadata);
            }
        }

        #[expect(clippy::needless_collect, reason = "Higher ranked lifetime error")]
        authorization_api
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
            if let Err(auth_error) = authorization_api
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
            if let Some(temporal_client) = temporal_client {
                temporal_client
                    .start_update_data_type_embeddings_workflow(actor_id, &inserted_data_types)
                    .await
                    .change_context(InsertionError)?;
            }

            Ok(inserted_data_type_metadata)
        }
    }

    #[tracing::instrument(level = "info", skip(self, authorization_api))]
    async fn get_data_type<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        query: &StructuralQuery<'_, DataTypeWithMetadata>,
        cursor: Option<DataTypeVertexId>,
        limit: Option<usize>,
    ) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
            temporal_axes: ref unresolved_temporal_axes,
            include_drafts,
        } = *query;

        let temporal_axes = unresolved_temporal_axes.clone().resolve();
        let time_axis = temporal_axes.variable_time_axis();

        // TODO: Remove again when subgraph logic was revisited
        //   see https://linear.app/hash/issue/H-297
        let mut visited_ontology_ids = HashSet::new();

        let (data, artifacts) = ReadPaginated::<DataTypeWithMetadata>::read_paginated_vec(
            self,
            filter,
            Some(&temporal_axes),
            &VertexIdSorting { cursor },
            limit,
            include_drafts,
        )
        .await?;
        let data_types = data
            .into_iter()
            .filter_map(|row| {
                let data_type = row.decode_record(&artifacts);
                let id = DataTypeId::from_url(data_type.schema.id());
                let vertex_id = data_type.vertex_id(time_axis);
                // The records are already sorted by time, so we can just take the first one
                visited_ontology_ids
                    .insert(id)
                    .then_some((id, (vertex_id, data_type)))
            })
            .collect::<Vec<_>>();

        let filtered_ids = data_types
            .iter()
            .map(|(data_type_id, _)| *data_type_id)
            .collect::<Vec<_>>();

        let (permissions, zookie) = authorization_api
            .check_data_types_permission(
                actor_id,
                DataTypePermission::View,
                filtered_ids,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(QueryError)?;

        let mut subgraph = Subgraph::new(
            graph_resolve_depths,
            unresolved_temporal_axes.clone(),
            temporal_axes.clone(),
        );

        let (data_type_ids, data_type_vertices): (Vec<_>, Vec<_>) = data_types
            .into_iter()
            .filter(|(id, _)| permissions.get(id).copied().unwrap_or(false))
            .unzip();

        subgraph.roots.extend(
            data_type_vertices
                .iter()
                .map(|(vertex_id, _)| vertex_id.clone().into()),
        );
        subgraph.vertices.data_types = data_type_vertices.into_iter().collect();

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
            authorization_api,
            &zookie,
            &mut subgraph,
        )
        .await?;

        traversal_context
            .read_traversed_vertices(self, &mut subgraph, include_drafts)
            .await?;

        Ok(subgraph)
    }

    #[tracing::instrument(level = "info", skip(self, schema, authorization_api, relationships))]
    async fn update_data_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        schema: DataType,
        relationships: impl IntoIterator<Item = DataTypeRelationAndSubject> + Send,
    ) -> Result<DataTypeMetadata, UpdateError> {
        let old_ontology_id = DataTypeId::from_url(&VersionedUrl {
            base_url: schema.id().base_url.clone(),
            version: schema.id().version - 1,
        });
        authorization_api
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

        let (ontology_id, owned_by_id, temporal_versioning) = transaction
            .update::<DataType>(&schema, EditionCreatedById::new(actor_id))
            .await?;
        let data_type_id = DataTypeId::from(ontology_id);

        let relationships = relationships
            .into_iter()
            .chain(once(DataTypeRelationAndSubject::Owner {
                subject: DataTypeOwnerSubject::Web { id: owned_by_id },
                level: 0,
            }))
            .collect::<Vec<_>>();

        authorization_api
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
            if let Err(auth_error) = authorization_api
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
                record_id: OntologyTypeRecordId::from(schema.id().clone()),
                classification: OntologyTypeClassificationMetadata::Owned { owned_by_id },
                temporal_versioning,
                provenance: OntologyProvenanceMetadata {
                    edition: OntologyEditionProvenanceMetadata {
                        created_by_id: EditionCreatedById::new(actor_id),
                        archived_by_id: None,
                    },
                },
            };

            if let Some(temporal_client) = temporal_client {
                temporal_client
                    .start_update_data_type_embeddings_workflow(
                        actor_id,
                        &[DataTypeWithMetadata {
                            schema,
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
    async fn archive_data_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        _: &mut A,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.archive_ontology_type(id, EditionArchivedById::new(actor_id))
            .await
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn unarchive_data_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        _: &mut A,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.unarchive_ontology_type(id, EditionCreatedById::new(actor_id))
            .await
    }

    #[tracing::instrument(level = "info", skip(self, embeddings))]
    async fn update_data_type_embeddings<A: AuthorizationApi + Send + Sync>(
        &mut self,
        _: AccountId,
        _: &mut A,
        embeddings: Vec<DataTypeEmbedding<'_>>,
        updated_at_transaction_time: Timestamp<TransactionTime>,
        reset: bool,
    ) -> Result<(), UpdateError> {
        #[derive(Debug, ToSql)]
        #[postgres(name = "data_type_embeddings")]
        pub struct DataTypeEmbeddingsRow<'a> {
            ontology_id: OntologyId,
            embedding: Embedding<'a>,
            updated_at_transaction_time: Timestamp<TransactionTime>,
        }
        let (ontology_ids, data_type_embeddings): (Vec<_>, Vec<_>) = embeddings
            .into_iter()
            .map(|embedding: DataTypeEmbedding<'_>| {
                let ontology_id = OntologyId::from(DataTypeId::from_url(&embedding.data_type_id));
                (
                    ontology_id,
                    DataTypeEmbeddingsRow {
                        ontology_id,
                        embedding: embedding.embedding,
                        updated_at_transaction_time,
                    },
                )
            })
            .unzip();

        // TODO: Add permission to allow updating embeddings
        //   see https://linear.app/hash/issue/H-1870

        if reset {
            self.as_client()
                .query(
                    "
                        DELETE FROM data_type_embeddings
                        WHERE (ontology_id) IN (
                            WITH base_urls AS (
                                SELECT base_url, MAX(version) as max_version
                                FROM ontology_ids
                                GROUP BY (base_url)
                            )
                            SELECT oi.ontology_id
                            FROM UNNEST($1::UUID[]) AS id
                            JOIN ontology_ids ON id = ontology_ids.ontology_id
                            JOIN base_urls USING (base_url)
                            JOIN data_type_embeddings USING (ontology_id)
                            JOIN ontology_ids AS oi USING (base_url)
                            WHERE oi.version < max_version
                              OR (oi.version = max_version AND updated_at_transaction_time <= $2)
                        );
                    ",
                    &[&ontology_ids, &updated_at_transaction_time],
                )
                .await
                .change_context(UpdateError)?;
        }

        self.as_client()
            .query(
                "
                    INSERT INTO data_type_embeddings
                    SELECT * FROM UNNEST($1::data_type_embeddings[])
                    ON CONFLICT (ontology_id) DO UPDATE
                    SET
                        embedding = EXCLUDED.embedding,
                        updated_at_transaction_time = EXCLUDED.updated_at_transaction_time
                    WHERE data_type_embeddings.updated_at_transaction_time <= \
                 EXCLUDED.updated_at_transaction_time;
                ",
                &[&data_type_embeddings],
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

    pub edition_created_by_id: usize,
    pub edition_archived_by_id: usize,
    pub additional_metadata: usize,
}

impl QueryRecordDecode for DataTypeWithMetadata {
    type CompilationArtifacts = DataTypeRowIndices;
    type Output = Self;

    fn decode(row: &Row, indices: &Self::CompilationArtifacts) -> Self {
        let record_id = OntologyTypeRecordId {
            base_url: BaseUrl::new(row.get(indices.base_url))
                .expect("invalid base URL returned from Postgres"),
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
                provenance: OntologyProvenanceMetadata {
                    edition: OntologyEditionProvenanceMetadata {
                        created_by_id: EditionCreatedById::new(
                            row.get(indices.edition_created_by_id),
                        ),
                        archived_by_id: row.get(indices.edition_archived_by_id),
                    },
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

    fn compile<'p, 'q: 'p>(
        compiler: &mut SelectCompiler<'p, 'q, Self>,
        _paths: &Self::CompilationParameters,
    ) -> Self::CompilationArtifacts {
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
            edition_created_by_id: compiler
                .add_selection_path(&DataTypeQueryPath::EditionCreatedById),
            edition_archived_by_id: compiler
                .add_selection_path(&DataTypeQueryPath::EditionArchivedById),
            additional_metadata: compiler
                .add_selection_path(&DataTypeQueryPath::AdditionalMetadata),
        }
    }
}
