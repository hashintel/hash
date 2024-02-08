use std::{
    collections::{HashMap, HashSet},
    iter::once,
};

use authorization::{
    backend::ModifyRelationshipOperation,
    schema::{
        DataTypeId, PropertyTypeId, PropertyTypeOwnerSubject, PropertyTypePermission,
        PropertyTypeRelationAndSubject, WebPermission,
    },
    zanzibar::{Consistency, Zookie},
    AuthorizationApi,
};
use error_stack::{Result, ResultExt};
use graph_types::{
    account::{AccountId, EditionArchivedById, EditionCreatedById},
    ontology::{
        OntologyEditionProvenanceMetadata, OntologyProvenanceMetadata, OntologyTemporalMetadata,
        OntologyTypeClassificationMetadata, OntologyTypeRecordId, PartialPropertyTypeMetadata,
        PropertyTypeEmbedding, PropertyTypeMetadata, PropertyTypeWithMetadata,
    },
    Embedding,
};
use postgres_types::{Json, ToSql};
use temporal_client::TemporalClient;
use temporal_versioning::{RightBoundedTemporalInterval, Timestamp, TransactionTime};
use tokio_postgres::{GenericClient, Row};
use type_system::{
    url::{BaseUrl, VersionedUrl},
    PropertyType,
};

use crate::{
    ontology::PropertyTypeQueryPath,
    store::{
        crud::{QueryResult, ReadPaginated, VertexIdSorting},
        error::DeletionError,
        postgres::{
            crud::QueryRecordDecode,
            ontology::{
                read::OntologyTypeTraversalData, OntologyId,
                PostgresOntologyTypeClassificationMetadata,
            },
            query::{Distinctness, PostgresRecord, ReferenceTable, SelectCompiler, Table},
            TraversalContext,
        },
        AsClient, ConflictBehavior, InsertionError, PostgresStore, PropertyTypeStore, QueryError,
        SubgraphRecord, UpdateError,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, OntologyEdgeKind},
        identifier::{DataTypeVertexId, PropertyTypeVertexId},
        query::StructuralQuery,
        temporal_axes::VariableAxis,
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    #[tracing::instrument(level = "debug", skip(property_types, authorization_api, zookie))]
    pub(crate) async fn filter_property_types_by_permission<I, T, A>(
        property_types: impl IntoIterator<Item = (I, T)> + Send,
        actor_id: AccountId,
        authorization_api: &A,
        zookie: &Zookie<'static>,
    ) -> Result<impl Iterator<Item = T>, QueryError>
    where
        I: Into<PropertyTypeId> + Send,
        T: Send,
        A: AuthorizationApi + Sync,
    {
        let (ids, property_types): (Vec<_>, Vec<_>) = property_types
            .into_iter()
            .map(|(id, edge)| (id.into(), edge))
            .unzip();

        let permissions = authorization_api
            .check_property_types_permission(
                actor_id,
                PropertyTypePermission::View,
                ids.iter().copied(),
                Consistency::AtExactSnapshot(zookie),
            )
            .await
            .change_context(QueryError)?
            .0;

        Ok(ids
            .into_iter()
            .zip(property_types)
            .filter_map(move |(id, property_type)| {
                permissions
                    .get(&id)
                    .copied()
                    .unwrap_or(false)
                    .then_some(property_type)
            }))
    }

    /// Internal method to read a [`PropertyTypeWithMetadata`] into two [`TraversalContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(
        level = "info",
        skip(self, traversal_context, subgraph, authorization_api, zookie)
    )]
    pub(crate) async fn traverse_property_types<A: AuthorizationApi + Sync>(
        &self,
        mut property_type_queue: Vec<(
            OntologyId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        traversal_context: &mut TraversalContext,
        actor_id: AccountId,
        authorization_api: &A,
        zookie: &Zookie<'static>,
        subgraph: &mut Subgraph,
    ) -> Result<(), QueryError> {
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
                            property_type_ontology_id,
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
                        actor_id,
                        authorization_api,
                        zookie,
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
                            edge.right_endpoint_ontology_id,
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
                        actor_id,
                        authorization_api,
                        zookie,
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
                            edge.right_endpoint_ontology_id,
                            edge.resolve_depths,
                            edge.traversal_interval,
                        )
                    }),
                );
            };
        }

        self.traverse_data_types(
            data_type_queue,
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
    pub async fn delete_property_types(&mut self) -> Result<(), DeletionError> {
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
            .collect::<Vec<OntologyId>>();

        transaction.delete_ontology_ids(&property_types).await?;

        transaction.commit().await.change_context(DeletionError)?;

        Ok(())
    }
}

impl<C: AsClient> PropertyTypeStore for PostgresStore<C> {
    #[tracing::instrument(
        level = "info",
        skip(self, property_types, authorization_api, relationships)
    )]
    async fn create_property_types<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        property_types: impl IntoIterator<
            Item = (PropertyType, PartialPropertyTypeMetadata),
            IntoIter: Send,
        > + Send,
        on_conflict: ConflictBehavior,
        relationships: impl IntoIterator<Item = PropertyTypeRelationAndSubject> + Send,
    ) -> Result<Vec<PropertyTypeMetadata>, InsertionError> {
        let requested_relationships = relationships.into_iter().collect::<Vec<_>>();

        let property_types = property_types.into_iter();
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let provenance = OntologyProvenanceMetadata {
            edition: OntologyEditionProvenanceMetadata {
                created_by_id: EditionCreatedById::new(actor_id),
                archived_by_id: None,
            },
        };

        let mut relationships = HashSet::new();

        let mut inserted_ontology_ids = Vec::new();
        let mut inserted_property_types = Vec::new();
        let mut inserted_property_type_metadata = Vec::new();

        for (schema, metadata) in property_types {
            let property_type_id = PropertyTypeId::from_url(schema.id());
            if let OntologyTypeClassificationMetadata::Owned { owned_by_id } =
                &metadata.classification
            {
                authorization_api
                    .check_web_permission(
                        actor_id,
                        WebPermission::CreatePropertyType,
                        *owned_by_id,
                        Consistency::FullyConsistent,
                    )
                    .await
                    .change_context(InsertionError)?
                    .assert_permission()
                    .change_context(InsertionError)?;

                relationships.insert((
                    property_type_id,
                    PropertyTypeRelationAndSubject::Owner {
                        subject: PropertyTypeOwnerSubject::Web { id: *owned_by_id },
                        level: 0,
                    },
                ));
            }

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

                let metadata = PropertyTypeMetadata {
                    record_id: metadata.record_id,
                    classification: metadata.classification,
                    temporal_versioning,
                    provenance,
                };

                inserted_ontology_ids.push(ontology_id);
                inserted_property_types.push(PropertyTypeWithMetadata {
                    schema,
                    metadata: metadata.clone(),
                });
                inserted_property_type_metadata.push(metadata);
            }

            relationships.extend(
                requested_relationships
                    .iter()
                    .map(|relation_and_subject| (property_type_id, *relation_and_subject)),
            );
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
                        property_type.schema.id()
                    )
                })
                .attach_lazy(|| property_type.schema.clone())?;
        }

        authorization_api
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

        if let Err(mut error) = transaction.commit().await.change_context(InsertionError) {
            if let Err(auth_error) = authorization_api
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
                // TODO: Use `add_child`
                //   see https://linear.app/hash/issue/GEN-105/add-ability-to-add-child-errors
                error.extend_one(auth_error);
            }

            Err(error)
        } else {
            if let Some(temporal_client) = temporal_client {
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

    #[tracing::instrument(level = "info", skip(self, authorization_api))]
    async fn get_property_type<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        query: &StructuralQuery<'_, PropertyTypeWithMetadata>,
        cursor: Option<PropertyTypeVertexId>,
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

        let (data, artifacts) = ReadPaginated::<PropertyTypeWithMetadata>::read_paginated_vec(
            self,
            filter,
            Some(&temporal_axes),
            &VertexIdSorting { cursor },
            limit,
            include_drafts,
        )
        .await?;
        let property_types = data
            .into_iter()
            .filter_map(|row| {
                let property_type = row.decode_record(&artifacts);
                let id = PropertyTypeId::from_url(property_type.schema.id());
                let vertex_id = property_type.vertex_id(time_axis);
                // The records are already sorted by time, so we can just take the first one
                visited_ontology_ids
                    .insert(id)
                    .then_some((id, (vertex_id, property_type)))
            })
            .collect::<Vec<_>>();

        let filtered_ids = property_types
            .iter()
            .map(|(property_type_id, _)| *property_type_id)
            .collect::<Vec<_>>();

        let (permissions, zookie) = authorization_api
            .check_property_types_permission(
                actor_id,
                PropertyTypePermission::View,
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

        let (property_type_ids, property_type_vertices): (Vec<_>, Vec<_>) = property_types
            .into_iter()
            .filter(|(id, _)| permissions.get(id).copied().unwrap_or(false))
            .unzip();

        subgraph.roots.extend(
            property_type_vertices
                .iter()
                .map(|(vertex_id, _)| vertex_id.clone().into()),
        );
        subgraph.vertices.property_types = property_type_vertices.into_iter().collect();

        let mut traversal_context = TraversalContext::default();

        // TODO: We currently pass in the subgraph as mutable reference, thus we cannot borrow the
        //       vertices and have to `.collect()` the keys.
        self.traverse_property_types(
            property_type_ids
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
    async fn update_property_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        schema: PropertyType,
        relationships: impl IntoIterator<Item = PropertyTypeRelationAndSubject> + Send,
    ) -> Result<PropertyTypeMetadata, UpdateError> {
        let old_ontology_id = PropertyTypeId::from_url(&VersionedUrl {
            base_url: schema.id().base_url.clone(),
            version: schema.id().version - 1,
        });
        authorization_api
            .check_property_type_permission(
                actor_id,
                PropertyTypePermission::Update,
                old_ontology_id,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(UpdateError)?
            .assert_permission()
            .change_context(UpdateError)
            .attach_printable(old_ontology_id.into_uuid())?;

        let transaction = self.transaction().await.change_context(UpdateError)?;

        let (ontology_id, owned_by_id, temporal_versioning) = transaction
            .update::<PropertyType>(&schema, EditionCreatedById::new(actor_id))
            .await?;

        transaction
            .insert_property_type_references(&schema, ontology_id)
            .await
            .change_context(UpdateError)
            .attach_printable_lazy(|| {
                format!(
                    "could not insert references for property type: {}",
                    schema.id()
                )
            })
            .attach_lazy(|| schema.clone())?;

        let property_type_id = PropertyTypeId::from(ontology_id);
        let relationships = relationships
            .into_iter()
            .chain(once(PropertyTypeRelationAndSubject::Owner {
                subject: PropertyTypeOwnerSubject::Web { id: owned_by_id },
                level: 0,
            }))
            .collect::<Vec<_>>();

        authorization_api
            .modify_property_type_relations(relationships.clone().into_iter().map(
                |relation_and_subject| {
                    (
                        ModifyRelationshipOperation::Create,
                        property_type_id,
                        relation_and_subject,
                    )
                },
            ))
            .await
            .change_context(UpdateError)?;

        if let Err(mut error) = transaction.commit().await.change_context(UpdateError) {
            if let Err(auth_error) = authorization_api
                .modify_property_type_relations(relationships.into_iter().map(
                    |relation_and_subject| {
                        (
                            ModifyRelationshipOperation::Delete,
                            property_type_id,
                            relation_and_subject,
                        )
                    },
                ))
                .await
                .change_context(UpdateError)
            {
                // TODO: Use `add_child`
                //   see https://linear.app/hash/issue/GEN-105/add-ability-to-add-child-errors
                error.extend_one(auth_error);
            }

            Err(error)
        } else {
            let metadata = PropertyTypeMetadata {
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
                    .start_update_property_type_embeddings_workflow(
                        actor_id,
                        &[PropertyTypeWithMetadata {
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
    async fn archive_property_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        _: &mut A,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.archive_ontology_type(id, EditionArchivedById::new(actor_id))
            .await
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn unarchive_property_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        _: &mut A,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.unarchive_ontology_type(id, EditionCreatedById::new(actor_id))
            .await
    }

    #[tracing::instrument(level = "info", skip(self, embeddings))]
    async fn update_property_type_embeddings<A: AuthorizationApi + Send + Sync>(
        &mut self,
        _: AccountId,
        _: &mut A,
        embeddings: Vec<PropertyTypeEmbedding<'_>>,
        updated_at_transaction_time: Timestamp<TransactionTime>,
        reset: bool,
    ) -> Result<(), UpdateError> {
        #[derive(Debug, ToSql)]
        #[postgres(name = "property_type_embeddings")]
        pub struct PropertyTypeEmbeddingsRow<'a> {
            ontology_id: OntologyId,
            embedding: Embedding<'a>,
            updated_at_transaction_time: Timestamp<TransactionTime>,
        }
        let property_type_embeddings = embeddings
            .into_iter()
            .map(|embedding| PropertyTypeEmbeddingsRow {
                ontology_id: OntologyId::from(DataTypeId::from_url(&embedding.property_type_id)),
                embedding: embedding.embedding,
                updated_at_transaction_time,
            })
            .collect::<Vec<_>>();

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
                SELECT ontology_id, embedding, updated_at_transaction_time FROM provided_embeddings
                ON CONFLICT (ontology_id) DO UPDATE SET
                    embedding = EXCLUDED.embedding,
                    updated_at_transaction_time = EXCLUDED.updated_at_transaction_time
                WHERE property_type_embeddings.updated_at_transaction_time
                      <= EXCLUDED.updated_at_transaction_time;
                ",
                &[&property_type_embeddings, &reset],
            )
            .await
            .change_context(UpdateError)?;

        Ok(())
    }
}

#[derive(Debug, Copy, Clone)]
pub struct PropertyTypeRowIndices {
    pub base_url: usize,
    pub version: usize,
    pub transaction_time: usize,

    pub schema: usize,

    pub edition_created_by_id: usize,
    pub edition_archived_by_id: usize,
    pub additional_metadata: usize,
}

impl QueryRecordDecode for PropertyTypeWithMetadata {
    type CompilationArtifacts = PropertyTypeRowIndices;
    type Output = Self;

    fn decode(row: &Row, indices: &Self::CompilationArtifacts) -> Self {
        let record_id = OntologyTypeRecordId {
            base_url: BaseUrl::new(row.get(indices.base_url))
                .expect("invalid base URL returned from Postgres"),
            version: row.get(indices.version),
        };

        if let Ok(distance) = row.try_get::<_, f64>("distance") {
            tracing::trace!(%record_id, %distance, "Property type embedding was calculated");
        }

        Self {
            schema: row.get::<_, Json<_>>(indices.schema).0,
            metadata: PropertyTypeMetadata {
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

impl PostgresRecord for PropertyTypeWithMetadata {
    type CompilationParameters = ();

    fn base_table() -> Table {
        Table::OntologyTemporalMetadata
    }

    fn parameters() -> Self::CompilationParameters {}

    fn compile<'p, 'q: 'p>(
        compiler: &mut SelectCompiler<'p, 'q, Self>,
        _paths: &Self::CompilationParameters,
    ) -> Self::CompilationArtifacts {
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
                None,
            ),
            schema: compiler.add_selection_path(&PropertyTypeQueryPath::Schema(None)),
            edition_created_by_id: compiler
                .add_selection_path(&PropertyTypeQueryPath::EditionCreatedById),
            edition_archived_by_id: compiler
                .add_selection_path(&PropertyTypeQueryPath::EditionArchivedById),
            additional_metadata: compiler
                .add_selection_path(&PropertyTypeQueryPath::AdditionalMetadata),
        }
    }
}
