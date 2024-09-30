use core::iter::once;
use std::collections::{HashMap, HashSet};

use authorization::{
    AuthorizationApi,
    backend::ModifyRelationshipOperation,
    schema::{
        PropertyTypeOwnerSubject, PropertyTypePermission, PropertyTypeRelationAndSubject,
        WebPermission,
    },
    zanzibar::{Consistency, Zookie},
};
use error_stack::{Result, ResultExt as _};
use futures::StreamExt as _;
use graph_types::{
    Embedding,
    account::{AccountId, EditionArchivedById, EditionCreatedById},
    ontology::{
        DataTypeId, OntologyEditionProvenance, OntologyProvenance, OntologyTemporalMetadata,
        OntologyTypeClassificationMetadata, OntologyTypeRecordId, PropertyTypeId,
        PropertyTypeMetadata, PropertyTypeWithMetadata,
    },
};
use hash_graph_store::{
    property_type::PropertyTypeQueryPath,
    subgraph::{
        Subgraph, SubgraphRecord as _,
        edges::{EdgeDirection, GraphResolveDepths, OntologyEdgeKind},
        identifier::{DataTypeVertexId, GraphElementVertexId, PropertyTypeVertexId},
        temporal_axes::{QueryTemporalAxes, VariableAxis},
    },
};
use postgres_types::{Json, ToSql};
use temporal_versioning::{RightBoundedTemporalInterval, Timestamp, TransactionTime};
use tokio_postgres::{GenericClient as _, Row};
use tracing::instrument;
use type_system::{
    Validator as _,
    schema::PropertyTypeValidator,
    url::{OntologyTypeVersion, VersionedUrl},
};

use crate::store::{
    AsClient, InsertionError, PostgresStore, PropertyTypeStore, QueryError, StoreCache,
    StoreProvider, UpdateError,
    crud::{QueryResult as _, Read as _, ReadPaginated, VersionedUrlSorting},
    error::DeletionError,
    ontology::{
        ArchivePropertyTypeParams, CountPropertyTypesParams, CreatePropertyTypeParams,
        GetPropertyTypeSubgraphParams, GetPropertyTypeSubgraphResponse, GetPropertyTypesParams,
        GetPropertyTypesResponse, UnarchivePropertyTypeParams, UpdatePropertyTypeEmbeddingParams,
        UpdatePropertyTypesParams,
    },
    postgres::{
        TraversalContext,
        crud::QueryRecordDecode,
        ontology::{
            OntologyId, PostgresOntologyTypeClassificationMetadata, read::OntologyTypeTraversalData,
        },
        query::{Distinctness, PostgresRecord, ReferenceTable, SelectCompiler, Table},
    },
};

impl<C, A> PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    #[tracing::instrument(level = "debug", skip(property_types, authorization_api, zookie))]
    pub(crate) async fn filter_property_types_by_permission<I, T>(
        property_types: impl IntoIterator<Item = (I, T)> + Send,
        actor_id: AccountId,
        authorization_api: &A,
        zookie: &Zookie<'static>,
    ) -> Result<impl Iterator<Item = T>, QueryError>
    where
        I: Into<PropertyTypeId> + Send,
        T: Send,
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

    async fn get_property_types_impl(
        &self,
        actor_id: AccountId,
        params: GetPropertyTypesParams<'_>,
        temporal_axes: &QueryTemporalAxes,
    ) -> Result<(GetPropertyTypesResponse, Zookie<'static>), QueryError> {
        #[expect(clippy::if_then_some_else_none, reason = "Function is async")]
        let count = if params.include_count {
            Some(
                self.count_property_types(actor_id, CountPropertyTypesParams {
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
            ReadPaginated::<PropertyTypeWithMetadata, VersionedUrlSorting>::read_paginated_vec(
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
        let property_types = data
            .into_iter()
            .filter_map(|row| {
                let property_type = row.decode_record(&artifacts);
                let id = PropertyTypeId::from_url(&property_type.schema.id);
                // The records are already sorted by time, so we can just take the first one
                visited_ontology_ids
                    .insert(id)
                    .then_some((id, property_type))
            })
            .collect::<Vec<_>>();

        let filtered_ids = property_types
            .iter()
            .map(|(property_type_id, _)| *property_type_id)
            .collect::<Vec<_>>();

        let (permissions, zookie) = self
            .authorization_api
            .check_property_types_permission(
                actor_id,
                PropertyTypePermission::View,
                filtered_ids,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(QueryError)?;

        let property_types = property_types
            .into_iter()
            .filter_map(|(id, property_type)| {
                permissions
                    .get(&id)
                    .copied()
                    .unwrap_or(false)
                    .then_some(property_type)
            })
            .collect::<Vec<_>>();

        Ok((
            GetPropertyTypesResponse {
                cursor: if params.limit.is_some() {
                    property_types
                        .last()
                        .map(|property_type| property_type.schema.id.clone())
                } else {
                    None
                },
                property_types,
                count,
            },
            zookie,
        ))
    }

    /// Internal method to read a [`PropertyTypeWithMetadata`] into two [`TraversalContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "info", skip(self, traversal_context, subgraph, zookie))]
    pub(crate) async fn traverse_property_types(
        &self,
        mut property_type_queue: Vec<(
            PropertyTypeId,
            GraphResolveDepths,
            RightBoundedTemporalInterval<VariableAxis>,
        )>,
        traversal_context: &mut TraversalContext,
        actor_id: AccountId,
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
                            OntologyId::from(property_type_ontology_id),
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
                        &self.authorization_api,
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
                            DataTypeId::from(edge.right_endpoint_ontology_id),
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
                        &self.authorization_api,
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
                            PropertyTypeId::from(edge.right_endpoint_ontology_id),
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

impl<C, A> PropertyTypeStore for PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    #[tracing::instrument(level = "info", skip(self, params))]
    async fn create_property_types<P, R>(
        &mut self,
        actor_id: AccountId,
        params: P,
    ) -> Result<Vec<PropertyTypeMetadata>, InsertionError>
    where
        P: IntoIterator<Item = CreatePropertyTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync,
    {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let mut relationships = HashSet::new();

        let mut inserted_property_type_metadata = Vec::new();
        let mut inserted_property_types = Vec::new();
        let mut inserted_ontology_ids = Vec::new();

        let property_type_validator = PropertyTypeValidator;

        for parameters in params {
            let provenance = OntologyProvenance {
                edition: OntologyEditionProvenance {
                    created_by_id: EditionCreatedById::new(actor_id),
                    archived_by_id: None,
                    user_defined: parameters.provenance,
                },
            };

            let record_id = OntologyTypeRecordId::from(parameters.schema.id.clone());
            let property_type_id = PropertyTypeId::from_url(&parameters.schema.id);
            if let OntologyTypeClassificationMetadata::Owned { owned_by_id } =
                &parameters.classification
            {
                transaction
                    .authorization_api
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

                relationships.insert((property_type_id, PropertyTypeRelationAndSubject::Owner {
                    subject: PropertyTypeOwnerSubject::Web { id: *owned_by_id },
                    level: 0,
                }));
            }

            relationships.extend(
                parameters
                    .relationships
                    .into_iter()
                    .map(|relation_and_subject| (property_type_id, relation_and_subject)),
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
                transaction
                    .insert_property_type_with_id(
                        ontology_id,
                        property_type_validator
                            .validate_ref(&parameters.schema)
                            .await
                            .change_context(InsertionError)?,
                    )
                    .await?;
                let metadata = PropertyTypeMetadata {
                    record_id,
                    classification: parameters.classification,
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
            if let Some(temporal_client) = &self.temporal_client {
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

    // TODO: take actor ID into consideration, but currently we don't have any non-public property
    //       types anyway.
    async fn count_property_types(
        &self,
        actor_id: AccountId,
        mut params: CountPropertyTypesParams<'_>,
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

    async fn get_property_types(
        &self,
        actor_id: AccountId,
        mut params: GetPropertyTypesParams<'_>,
    ) -> Result<GetPropertyTypesResponse, QueryError> {
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
        self.get_property_types_impl(actor_id, params, &temporal_axes)
            .await
            .map(|(response, _)| response)
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_property_type_subgraph(
        &self,
        actor_id: AccountId,
        mut params: GetPropertyTypeSubgraphParams<'_>,
    ) -> Result<GetPropertyTypeSubgraphResponse, QueryError> {
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
            GetPropertyTypesResponse {
                property_types,
                cursor,
                count,
            },
            zookie,
        ) = self
            .get_property_types_impl(
                actor_id,
                GetPropertyTypesParams {
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

        let (property_type_ids, property_type_vertex_ids): (Vec<_>, Vec<_>) = property_types
            .iter()
            .map(|property_type| {
                (
                    PropertyTypeId::from_url(&property_type.schema.id),
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
            actor_id,
            &zookie,
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
    async fn update_property_type<R>(
        &mut self,
        actor_id: AccountId,
        params: UpdatePropertyTypesParams<R>,
    ) -> Result<PropertyTypeMetadata, UpdateError>
    where
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync,
    {
        let property_type_validator = PropertyTypeValidator;

        let old_ontology_id = PropertyTypeId::from_url(&VersionedUrl {
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

        let provenance = OntologyProvenance {
            edition: OntologyEditionProvenance {
                created_by_id: EditionCreatedById::new(actor_id),
                archived_by_id: None,
                user_defined: params.provenance,
            },
        };

        let schema = property_type_validator
            .validate_ref(&params.schema)
            .await
            .change_context(UpdateError)?;
        let (ontology_id, owned_by_id, temporal_versioning) = transaction
            .update_owned_ontology_id(&schema.id, &provenance.edition)
            .await?;
        transaction
            .insert_property_type_with_id(ontology_id, schema)
            .await
            .change_context(UpdateError)?;

        transaction
            .insert_property_type_references(&params.schema, ontology_id)
            .await
            .change_context(UpdateError)
            .attach_printable_lazy(|| {
                format!(
                    "could not insert references for property type: {}",
                    params.schema.id
                )
            })
            .attach_lazy(|| params.schema.clone())?;

        let property_type_id = PropertyTypeId::from(ontology_id);
        let relationships = params
            .relationships
            .into_iter()
            .chain(once(PropertyTypeRelationAndSubject::Owner {
                subject: PropertyTypeOwnerSubject::Web { id: owned_by_id },
                level: 0,
            }))
            .collect::<Vec<_>>();

        transaction
            .authorization_api
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

        if let Err(error) = transaction.commit().await.change_context(UpdateError) {
            let mut error = error.expand();

            if let Err(auth_error) = self
                .authorization_api
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
                error.push(auth_error);
            }

            Err(error.change_context(UpdateError))
        } else {
            let metadata = PropertyTypeMetadata {
                record_id: OntologyTypeRecordId::from(params.schema.id.clone()),
                classification: OntologyTypeClassificationMetadata::Owned { owned_by_id },
                temporal_versioning,
                provenance,
            };

            if let Some(temporal_client) = &self.temporal_client {
                temporal_client
                    .start_update_property_type_embeddings_workflow(actor_id, &[
                        PropertyTypeWithMetadata {
                            schema: params.schema,
                            metadata: metadata.clone(),
                        },
                    ])
                    .await
                    .change_context(UpdateError)?;
            }

            Ok(metadata)
        }
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn archive_property_type(
        &mut self,
        actor_id: AccountId,
        params: ArchivePropertyTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.archive_ontology_type(&params.property_type_id, EditionArchivedById::new(actor_id))
            .await
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn unarchive_property_type(
        &mut self,
        actor_id: AccountId,
        params: UnarchivePropertyTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.unarchive_ontology_type(&params.property_type_id, &OntologyEditionProvenance {
            created_by_id: EditionCreatedById::new(actor_id),
            archived_by_id: None,
            user_defined: params.provenance,
        })
        .await
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn update_property_type_embeddings(
        &mut self,
        _: AccountId,
        params: UpdatePropertyTypeEmbeddingParams<'_>,
    ) -> Result<(), UpdateError> {
        #[derive(Debug, ToSql)]
        #[postgres(name = "property_type_embeddings")]
        pub struct PropertyTypeEmbeddingsRow<'a> {
            ontology_id: OntologyId,
            embedding: Embedding<'a>,
            updated_at_transaction_time: Timestamp<TransactionTime>,
        }
        let property_type_embeddings = vec![PropertyTypeEmbeddingsRow {
            ontology_id: OntologyId::from(DataTypeId::from_url(&params.property_type_id)),
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
                None,
            ),
            schema: compiler.add_selection_path(&PropertyTypeQueryPath::Schema(None)),
            edition_provenance: compiler
                .add_selection_path(&PropertyTypeQueryPath::EditionProvenance(None)),
            additional_metadata: compiler
                .add_selection_path(&PropertyTypeQueryPath::AdditionalMetadata),
        }
    }
}
