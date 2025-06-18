use core::iter;
use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _};
use futures::StreamExt as _;
use hash_graph_authorization::{
    AuthorizationApi,
    backend::ModifyRelationshipOperation,
    policies::PolicyComponents,
    schema::{
        PropertyTypeOwnerSubject, PropertyTypePermission, PropertyTypeRelationAndSubject,
        WebPermission,
    },
    zanzibar::Consistency,
};
use hash_graph_store::{
    error::{InsertionError, QueryError, UpdateError},
    property_type::{
        ArchivePropertyTypeParams, CountPropertyTypesParams, CreatePropertyTypeParams,
        GetPropertyTypeSubgraphParams, GetPropertyTypeSubgraphResponse, GetPropertyTypesParams,
        GetPropertyTypesResponse, PropertyTypeQueryPath, PropertyTypeStore,
        UnarchivePropertyTypeParams, UpdatePropertyTypeEmbeddingParams, UpdatePropertyTypesParams,
    },
    query::{Ordering, QueryResult as _, Read as _, ReadPaginated, VersionedUrlSorting},
    subgraph::{
        Subgraph, SubgraphRecord as _,
        edges::{EdgeDirection, GraphResolveDepths, OntologyEdgeKind},
        identifier::{DataTypeVertexId, GraphElementVertexId, PropertyTypeVertexId},
        temporal_axes::{QueryTemporalAxes, VariableAxis},
    },
};
use hash_graph_temporal_versioning::{RightBoundedTemporalInterval, Timestamp, TransactionTime};
use hash_graph_types::Embedding;
use postgres_types::{Json, ToSql};
use tokio_postgres::{GenericClient as _, Row};
use tracing::instrument;
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
        crud::QueryRecordDecode,
        ontology::{PostgresOntologyOwnership, read::OntologyTypeTraversalData},
        query::{Distinctness, PostgresRecord, ReferenceTable, SelectCompiler, Table},
    },
    validation::StoreProvider,
};

impl<C, A> PostgresStore<C, A>
where
    C: AsClient,
    A: AuthorizationApi,
{
    #[tracing::instrument(level = "debug", skip(property_types, provider))]
    pub(crate) async fn filter_property_types_by_permission<I, T>(
        property_types: impl IntoIterator<Item = (I, T)> + Send,
        provider: &StoreProvider<'_, Self>,
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
            Some(
                provider
                    .store
                    .authorization_api
                    .check_property_types_permission(
                        policy_components
                            .actor_id
                            .map_or_else(ActorEntityUuid::public_actor, ActorEntityUuid::from),
                        PropertyTypePermission::View,
                        ids.iter().copied(),
                        Consistency::FullyConsistent,
                    )
                    .await
                    .change_context(QueryError)?
                    .0,
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

                permissions
                    .get(&id)
                    .copied()
                    .unwrap_or(false)
                    .then_some(property_type)
            }))
    }

    async fn get_property_types_impl(
        &self,
        actor_id: ActorEntityUuid,
        params: GetPropertyTypesParams<'_>,
        temporal_axes: &QueryTemporalAxes,
    ) -> Result<GetPropertyTypesResponse, Report<QueryError>> {
        #[expect(clippy::if_then_some_else_none, reason = "Function is async")]
        let count = if params.include_count {
            Some(
                self.count_property_types(
                    actor_id,
                    CountPropertyTypesParams {
                        filter: params.filter.clone(),
                        temporal_axes: params.temporal_axes.clone(),
                        include_drafts: params.include_drafts,
                    },
                )
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
                &[params.filter],
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
                let id = PropertyTypeUuid::from_url(&property_type.schema.id);
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

        let (permissions, _zookie) = self
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

        Ok(GetPropertyTypesResponse {
            cursor: if params.limit.is_some() {
                property_types
                    .last()
                    .map(|property_type| property_type.schema.id.clone())
            } else {
                None
            },
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
                transaction
                    .authorization_api
                    .check_web_permission(
                        actor_id,
                        WebPermission::CreatePropertyType,
                        *web_id,
                        Consistency::FullyConsistent,
                    )
                    .await
                    .change_context(InsertionError)?
                    .assert_permission()
                    .change_context(InsertionError)?;

                relationships.insert((
                    property_type_id,
                    PropertyTypeRelationAndSubject::Owner {
                        subject: PropertyTypeOwnerSubject::Web { id: *web_id },
                        level: 0,
                    },
                ));
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
        actor_id: ActorEntityUuid,
        mut params: CountPropertyTypesParams<'_>,
    ) -> Result<usize, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
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
                params.include_drafts,
            )
            .await?
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
            .await
            .change_context(QueryError)?;

        params
            .filter
            .convert_parameters(&StoreProvider::new(self, &policy_components))
            .await
            .change_context(QueryError)?;

        let temporal_axes = params.temporal_axes.clone().resolve();
        self.get_property_types_impl(actor_id, params, &temporal_axes)
            .await
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_property_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        mut params: GetPropertyTypeSubgraphParams<'_>,
    ) -> Result<GetPropertyTypeSubgraphResponse, Report<QueryError>> {
        let policy_components = PolicyComponents::builder(self)
            .with_actor(actor_id)
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

        let property_type_validator = PropertyTypeValidator;

        for parameters in params {
            let provenance = OntologyProvenance {
                edition: OntologyEditionProvenance {
                    created_by_id: actor_id,
                    archived_by_id: None,
                    user_defined: parameters.provenance,
                },
            };

            let old_ontology_id = PropertyTypeUuid::from_url(&VersionedUrl {
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

            transaction
                .authorization_api
                .check_property_type_permission(
                    actor_id,
                    PropertyTypePermission::Update,
                    old_ontology_id,
                    Consistency::FullyConsistent,
                )
                .await
                .change_context(UpdateError)?
                .assert_permission()
                .change_context(UpdateError)?;

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
            if let Some(temporal_client) = &self.temporal_client {
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
        self.archive_ontology_type(&params.property_type_id, actor_id)
            .await
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn unarchive_property_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UnarchivePropertyTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
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
