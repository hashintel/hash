use std::{
    collections::{HashMap, HashSet},
    iter::once,
};

use authorization::{
    backend::ModifyRelationshipOperation,
    schema::{
        DataTypeId, EntityTypeId, EntityTypeOwnerSubject, EntityTypePermission,
        EntityTypeRelationAndSubject, WebPermission,
    },
    zanzibar::{Consistency, Zookie},
    AuthorizationApi,
};
use error_stack::{ensure, Report, Result, ResultExt};
use futures::TryStreamExt;
use graph_types::{
    account::{AccountId, EditionArchivedById, EditionCreatedById},
    ontology::{
        EntityTypeMetadata, EntityTypeWithMetadata, OntologyEditionProvenanceMetadata,
        OntologyProvenanceMetadata, OntologyTemporalMetadata, OntologyTypeClassificationMetadata,
        OntologyTypeRecordId, PartialEntityTypeMetadata,
    },
    Embedding,
};
use postgres_types::{Json, ToSql};
use temporal_client::TemporalClient;
use temporal_versioning::{RightBoundedTemporalInterval, Timestamp, TransactionTime};
use tokio_postgres::{GenericClient, Row};
use type_system::{
    url::{BaseUrl, OntologyTypeVersion, VersionedUrl},
    ClosedEntityType, EntityType,
};
use uuid::Uuid;

use crate::{
    ontology::EntityTypeQueryPath,
    store::{
        crud::{QueryResult, ReadPaginated, VertexIdSorting},
        error::DeletionError,
        ontology::{
            ArchiveEntityTypeParams, CreateEntityTypeParams, GetEntityTypesParams,
            UnarchiveEntityTypeParams, UpdateEntityTypeEmbeddingParams, UpdateEntityTypesParams,
        },
        postgres::{
            crud::QueryRecordDecode,
            ontology::{
                read::OntologyTypeTraversalData, OntologyId,
                PostgresOntologyTypeClassificationMetadata,
            },
            query::{Distinctness, PostgresRecord, ReferenceTable, SelectCompiler, Table},
            TraversalContext,
        },
        query::{Filter, FilterExpression, ParameterList},
        AsClient, EntityTypeStore, InsertionError, PostgresStore, QueryError, SubgraphRecord,
        UpdateError,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, OntologyEdgeKind},
        identifier::{EntityTypeVertexId, PropertyTypeVertexId},
        query::StructuralQuery,
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableAxis,
            VariableTemporalAxisUnresolved,
        },
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    #[tracing::instrument(level = "trace", skip(entity_types, authorization_api, zookie))]
    pub(crate) async fn filter_entity_types_by_permission<I, T, A>(
        entity_types: impl IntoIterator<Item = (I, T)> + Send,
        actor_id: AccountId,
        authorization_api: &A,
        zookie: &Zookie<'static>,
    ) -> Result<impl Iterator<Item = T>, QueryError>
    where
        I: Into<EntityTypeId> + Send,
        T: Send,
        A: AuthorizationApi + Sync,
    {
        let (ids, entity_types): (Vec<_>, Vec<_>) = entity_types
            .into_iter()
            .map(|(id, edge)| (id.into(), edge))
            .unzip();

        let permissions = authorization_api
            .check_entity_types_permission(
                actor_id,
                EntityTypePermission::View,
                ids.iter().copied(),
                Consistency::AtExactSnapshot(zookie),
            )
            .await
            .change_context(QueryError)?
            .0;

        Ok(ids
            .into_iter()
            .zip(entity_types)
            .filter_map(move |(id, entity_type)| {
                permissions
                    .get(&id)
                    .copied()
                    .unwrap_or(false)
                    .then_some(entity_type)
            }))
    }

    /// Internal method to read a [`EntityTypeWithMetadata`] into four [`TraversalContext`]s.
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(
        level = "info",
        skip(self, traversal_context, subgraph, authorization_api, zookie)
    )]
    pub(crate) async fn traverse_entity_types<A: AuthorizationApi + Sync>(
        &self,
        mut entity_type_queue: Vec<(
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
        let mut property_type_queue = Vec::new();

        while !entity_type_queue.is_empty() {
            let mut edges_to_traverse =
                HashMap::<OntologyEdgeKind, OntologyTypeTraversalData>::new();

            #[expect(clippy::iter_with_drain, reason = "false positive, vector is reused")]
            for (entity_type_ontology_id, graph_resolve_depths, traversal_interval) in
                entity_type_queue.drain(..)
            {
                for edge_kind in [
                    OntologyEdgeKind::ConstrainsPropertiesOn,
                    OntologyEdgeKind::InheritsFrom,
                    OntologyEdgeKind::ConstrainsLinksOn,
                    OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                ] {
                    if let Some(new_graph_resolve_depths) = graph_resolve_depths
                        .decrement_depth_for_edge(edge_kind, EdgeDirection::Outgoing)
                    {
                        edges_to_traverse.entry(edge_kind).or_default().push(
                            entity_type_ontology_id,
                            new_graph_resolve_depths,
                            traversal_interval,
                        );
                    }
                }
            }

            if let Some(traversal_data) =
                edges_to_traverse.get(&OntologyEdgeKind::ConstrainsPropertiesOn)
            {
                // TODO: Filter for entity types, which were not already added to the
                //       subgraph to avoid unnecessary lookups.
                property_type_queue.extend(
                    Self::filter_property_types_by_permission(
                        self.read_ontology_edges::<EntityTypeVertexId, PropertyTypeVertexId>(
                            traversal_data,
                            ReferenceTable::EntityTypeConstrainsPropertiesOn {
                                inheritance_depth: None,
                            },
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
            }

            for (edge_kind, table) in [
                (
                    OntologyEdgeKind::InheritsFrom,
                    ReferenceTable::EntityTypeInheritsFrom {
                        inheritance_depth: None,
                    },
                ),
                (
                    OntologyEdgeKind::ConstrainsLinksOn,
                    ReferenceTable::EntityTypeConstrainsLinksOn {
                        inheritance_depth: None,
                    },
                ),
                (
                    OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                    ReferenceTable::EntityTypeConstrainsLinkDestinationsOn {
                        inheritance_depth: None,
                    },
                ),
            ] {
                if let Some(traversal_data) = edges_to_traverse.get(&edge_kind) {
                    entity_type_queue.extend(
                        Self::filter_entity_types_by_permission(
                            self.read_ontology_edges::<EntityTypeVertexId, EntityTypeVertexId>(
                                traversal_data,
                                table,
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
                                edge_kind,
                                EdgeDirection::Outgoing,
                                edge.right_endpoint.clone(),
                            );

                            traversal_context.add_entity_type_id(
                                edge.right_endpoint_ontology_id,
                                edge.resolve_depths,
                                edge.traversal_interval,
                            )
                        }),
                    );
                }
            }
        }

        self.traverse_property_types(
            property_type_queue,
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
    pub async fn delete_entity_types(&mut self) -> Result<(), DeletionError> {
        let transaction = self.transaction().await.change_context(DeletionError)?;

        transaction
            .as_client()
            .simple_query(
                "
                    DELETE FROM entity_type_embeddings;
                    DELETE FROM entity_type_inherits_from;
                    DELETE FROM entity_type_constrains_link_destinations_on;
                    DELETE FROM entity_type_constrains_links_on;
                    DELETE FROM entity_type_constrains_properties_on;
                ",
            )
            .await
            .change_context(DeletionError)?;

        let entity_types = transaction
            .as_client()
            .query(
                "
                    DELETE FROM entity_types
                    RETURNING ontology_id
                ",
                &[],
            )
            .await
            .change_context(DeletionError)?
            .into_iter()
            .filter_map(|row| row.get(0))
            .collect::<Vec<OntologyId>>();

        transaction.delete_ontology_ids(&entity_types).await?;

        transaction.commit().await.change_context(DeletionError)?;

        Ok(())
    }

    #[tracing::instrument(level = "debug")]
    fn create_closed_entity_type(
        entity_type_id: EntityTypeId,
        available_types: &mut HashMap<EntityTypeId, ClosedEntityType>,
    ) -> Result<ClosedEntityType, QueryError> {
        let mut current_type = available_types
            .remove(&entity_type_id)
            .ok_or_else(|| Report::new(QueryError))
            .attach_printable("entity type not available")?;
        let mut visited_ids = HashSet::from([entity_type_id]);

        loop {
            for parent in current_type.inherits_from.clone() {
                let parent_id = EntityTypeId::from_url(parent.url());

                ensure!(
                    parent_id != entity_type_id,
                    Report::new(QueryError).attach_printable("inheritance cycle detected")
                );

                if visited_ids.contains(&parent_id) {
                    // This may happen in case of multiple inheritance or cycles. Cycles are
                    // already checked above, so we can just skip this parent.
                    current_type.inherits_from.remove(&parent);
                    break;
                }

                current_type.extend_one(
                    available_types
                        .get(&parent_id)
                        .ok_or_else(|| Report::new(QueryError))
                        .attach_printable("entity type not available")
                        .attach_printable_lazy(|| parent.url().clone())?
                        .clone(),
                );

                visited_ids.insert(parent_id);
            }

            if current_type.inherits_from.is_empty() {
                break;
            }
        }

        available_types.insert(entity_type_id, current_type.clone());
        Ok(current_type)
    }

    #[tracing::instrument(level = "debug", skip(self, entity_types))]
    pub(crate) async fn resolve_entity_types(
        &self,
        entity_types: impl IntoIterator<Item = EntityType> + Send,
    ) -> Result<Vec<EntityTypeInsertion>, QueryError> {
        let entity_types = entity_types
            .into_iter()
            .map(|entity_type| {
                (
                    EntityTypeId::from_url(entity_type.id()).into_uuid(),
                    entity_type,
                )
            })
            .collect::<Vec<(Uuid, EntityType)>>();

        // We need all types that the provided types inherit from so we can create the closed
        // schemas
        let parent_entity_type_ids = entity_types
            .iter()
            .flat_map(|(_, schema)| schema.inherits_from().all_of())
            .map(|reference| EntityTypeId::from_url(reference.url()).into_uuid())
            .collect::<Vec<_>>();

        // We read all relevant schemas from the graph
        let parent_schemas = self
            .read_closed_schemas(
                &Filter::In(
                    FilterExpression::Path(EntityTypeQueryPath::OntologyId),
                    ParameterList::Uuid(&parent_entity_type_ids),
                ),
                Some(
                    &QueryTemporalAxesUnresolved::DecisionTime {
                        pinned: PinnedTemporalAxisUnresolved::new(None),
                        variable: VariableTemporalAxisUnresolved::new(None, None),
                    }
                    .resolve(),
                ),
            )
            .await?
            .try_collect::<Vec<_>>()
            .await?;

        // The types we check either come from the graph or are provided by the user
        let mut available_schemas: HashMap<_, _> = entity_types
            .iter()
            .map(|(id, schema)| {
                (
                    EntityTypeId::new(*id),
                    ClosedEntityType::from(schema.clone()),
                )
            })
            .chain(parent_schemas)
            .collect();

        entity_types
            .into_iter()
            .map(|(entity_type_id, schema)| {
                Ok(EntityTypeInsertion {
                    schema,
                    closed_schema: Self::create_closed_entity_type(
                        EntityTypeId::new(entity_type_id),
                        &mut available_schemas,
                    )?,
                })
            })
            .collect::<Result<Vec<_>, _>>()
    }
}

pub struct EntityTypeInsertion {
    pub schema: EntityType,
    pub closed_schema: ClosedEntityType,
}

impl<C: AsClient> EntityTypeStore for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self, authorization_api, temporal_client, params))]
    async fn create_entity_types<A: AuthorizationApi + Send + Sync, P, R>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        params: P,
    ) -> Result<Vec<EntityTypeMetadata>, InsertionError>
    where
        P: IntoIterator<Item = CreateEntityTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync,
    {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let provenance = OntologyProvenanceMetadata {
            edition: OntologyEditionProvenanceMetadata {
                created_by_id: EditionCreatedById::new(actor_id),
                archived_by_id: None,
            },
        };

        let mut relationships = HashSet::new();

        let mut inserted_ontology_ids = Vec::new();
        let mut inserted_entity_types = Vec::new();
        let mut inserted_entity_type_metadata = Vec::new();

        let mut schemas = Vec::new();
        let mut metadatas = Vec::new();
        for param in params {
            metadatas.push((
                PartialEntityTypeMetadata {
                    record_id: OntologyTypeRecordId::from(param.schema.id().clone()),
                    classification: param.classification,
                    label_property: param.label_property,
                    icon: param.icon,
                },
                param.conflict_behavior,
                param.relationships,
            ));
            schemas.push(param.schema);
        }

        let insertions = transaction
            .resolve_entity_types(schemas)
            .await
            .change_context(InsertionError)?;

        for (insertion, (metadata, on_conflict, requested_relationships)) in
            insertions.into_iter().zip(metadatas)
        {
            let EntityTypeInsertion {
                schema,
                closed_schema,
            } = insertion;

            let entity_type_id = EntityTypeId::from_url(schema.id());

            if let OntologyTypeClassificationMetadata::Owned { owned_by_id } =
                &metadata.classification
            {
                authorization_api
                    .check_web_permission(
                        actor_id,
                        WebPermission::CreateEntityType,
                        *owned_by_id,
                        Consistency::FullyConsistent,
                    )
                    .await
                    .change_context(InsertionError)?
                    .assert_permission()
                    .change_context(InsertionError)?;

                relationships.insert((
                    entity_type_id,
                    EntityTypeRelationAndSubject::Owner {
                        subject: EntityTypeOwnerSubject::Web { id: *owned_by_id },
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
                transaction
                    .insert_entity_type_with_id(
                        ontology_id,
                        &schema,
                        &closed_schema,
                        metadata.label_property.as_ref(),
                        metadata.icon.as_deref(),
                    )
                    .await?;

                let metadata = EntityTypeMetadata {
                    record_id: metadata.record_id,
                    classification: metadata.classification,
                    temporal_versioning,
                    provenance,
                    label_property: metadata.label_property,
                    icon: metadata.icon,
                };

                inserted_ontology_ids.push(ontology_id);
                inserted_entity_types.push(EntityTypeWithMetadata {
                    schema,
                    metadata: metadata.clone(),
                });
                inserted_entity_type_metadata.push(metadata);
            }

            relationships.extend(
                requested_relationships
                    .into_iter()
                    .map(|relation_and_subject| (entity_type_id, relation_and_subject)),
            );
        }

        for (ontology_id, entity_type) in inserted_ontology_ids
            .into_iter()
            .zip(&inserted_entity_types)
        {
            transaction
                .insert_entity_type_references(&entity_type.schema, ontology_id)
                .await
                .change_context(InsertionError)
                .attach_printable_lazy(|| {
                    format!(
                        "could not insert references for entity type: {}",
                        entity_type.schema.id()
                    )
                })
                .attach_lazy(|| entity_type.schema.clone())?;
        }

        authorization_api
            .modify_entity_type_relations(relationships.clone().into_iter().map(
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
                .modify_entity_type_relations(relationships.into_iter().map(
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
                    .start_update_entity_type_embeddings_workflow(actor_id, &inserted_entity_types)
                    .await
                    .change_context(InsertionError)?;
            }

            Ok(inserted_entity_type_metadata)
        }
    }

    #[tracing::instrument(level = "info", skip(self, authorization_api))]
    async fn get_entity_type<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        params: GetEntityTypesParams<'_>,
    ) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
            temporal_axes: ref unresolved_temporal_axes,
            include_drafts,
        } = params.query;

        let temporal_axes = unresolved_temporal_axes.clone().resolve();
        let time_axis = temporal_axes.variable_time_axis();

        // TODO: Remove again when subgraph logic was revisited
        //   see https://linear.app/hash/issue/H-297
        let mut visited_ontology_ids = HashSet::new();

        let (data, artifacts) = ReadPaginated::<EntityTypeWithMetadata>::read_paginated_vec(
            self,
            filter,
            Some(&temporal_axes),
            &VertexIdSorting {
                cursor: params.after,
            },
            params.limit,
            include_drafts,
        )
        .await?;
        let entity_types = data
            .into_iter()
            .filter_map(|row| {
                let entity_type = row.decode_record(&artifacts);
                let id = EntityTypeId::from_url(entity_type.schema.id());
                let vertex_id = entity_type.vertex_id(time_axis);
                // The records are already sorted by time, so we can just take the first one
                visited_ontology_ids
                    .insert(id)
                    .then_some((id, (vertex_id, entity_type)))
            })
            .collect::<Vec<_>>();

        let filtered_ids = entity_types
            .iter()
            .map(|(entity_type_id, _)| *entity_type_id)
            .collect::<Vec<_>>();

        let (permissions, zookie) = authorization_api
            .check_entity_types_permission(
                actor_id,
                EntityTypePermission::View,
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

        let (entity_type_ids, entity_type_vertices): (Vec<_>, Vec<_>) = entity_types
            .into_iter()
            .filter(|(id, _)| permissions.get(id).copied().unwrap_or(false))
            .unzip();

        subgraph.roots.extend(
            entity_type_vertices
                .iter()
                .map(|(vertex_id, _)| vertex_id.clone().into()),
        );
        subgraph.vertices.entity_types = entity_type_vertices.into_iter().collect();

        let mut traversal_context = TraversalContext::default();

        // TODO: We currently pass in the subgraph as mutable reference, thus we cannot borrow the
        //       vertices and have to `.collect()` the keys.
        self.traverse_entity_types(
            entity_type_ids
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

    #[tracing::instrument(level = "info", skip(self, authorization_api, params))]
    async fn update_entity_type<A: AuthorizationApi + Send + Sync, R>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        params: UpdateEntityTypesParams<R>,
    ) -> Result<EntityTypeMetadata, UpdateError>
    where
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync,
    {
        let old_ontology_id = EntityTypeId::from_url(&VersionedUrl {
            base_url: params.schema.id().base_url.clone(),
            version: OntologyTypeVersion::new(
                params
                    .schema
                    .id()
                    .version
                    .inner()
                    .checked_sub(1)
                    .ok_or(UpdateError)
                    .attach_printable(
                        "The version of the data type is already at the lowest possible value",
                    )?,
            ),
        });
        authorization_api
            .check_entity_type_permission(
                actor_id,
                EntityTypePermission::Update,
                old_ontology_id,
                Consistency::FullyConsistent,
            )
            .await
            .change_context(UpdateError)?
            .assert_permission()
            .change_context(UpdateError)?;

        let transaction = self.transaction().await.change_context(UpdateError)?;

        let url = params.schema.id();
        let record_id = OntologyTypeRecordId::from(url.clone());

        let provenance = OntologyProvenanceMetadata {
            edition: OntologyEditionProvenanceMetadata {
                created_by_id: EditionCreatedById::new(actor_id),
                archived_by_id: None,
            },
        };

        let (ontology_id, owned_by_id, temporal_versioning) = transaction
            .update_owned_ontology_id(url, provenance.edition.created_by_id)
            .await?;

        let mut insertions = transaction
            .resolve_entity_types([params.schema])
            .await
            .change_context(UpdateError)?;
        let EntityTypeInsertion {
            schema,
            closed_schema,
        } = insertions
            .pop()
            .ok_or_else(|| Report::new(UpdateError).attach_printable("entity type not found"))?;

        transaction
            .insert_entity_type_with_id(
                ontology_id,
                &schema,
                &closed_schema,
                params.label_property.as_ref(),
                params.icon.as_deref(),
            )
            .await
            .change_context(UpdateError)?;

        let metadata = PartialEntityTypeMetadata {
            record_id,
            label_property: params.label_property,
            icon: params.icon,
            classification: OntologyTypeClassificationMetadata::Owned { owned_by_id },
        };

        transaction
            .insert_entity_type_references(&schema, ontology_id)
            .await
            .change_context(UpdateError)
            .attach_printable_lazy(|| {
                format!(
                    "could not insert references for entity type: {}",
                    schema.id()
                )
            })
            .attach_lazy(|| schema.clone())?;

        let entity_type_id = EntityTypeId::from(ontology_id);
        let relationships = params
            .relationships
            .into_iter()
            .chain(once(EntityTypeRelationAndSubject::Owner {
                subject: EntityTypeOwnerSubject::Web { id: owned_by_id },
                level: 0,
            }))
            .collect::<Vec<_>>();

        authorization_api
            .modify_entity_type_relations(relationships.clone().into_iter().map(
                |relation_and_subject| {
                    (
                        ModifyRelationshipOperation::Create,
                        entity_type_id,
                        relation_and_subject,
                    )
                },
            ))
            .await
            .change_context(UpdateError)?;

        if let Err(mut error) = transaction.commit().await.change_context(UpdateError) {
            if let Err(auth_error) = authorization_api
                .modify_entity_type_relations(relationships.into_iter().map(
                    |relation_and_subject| {
                        (
                            ModifyRelationshipOperation::Delete,
                            entity_type_id,
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
            let metadata = EntityTypeMetadata {
                record_id: metadata.record_id,
                classification: metadata.classification,
                temporal_versioning,
                provenance,
                label_property: metadata.label_property,
                icon: metadata.icon,
            };

            if let Some(temporal_client) = temporal_client {
                temporal_client
                    .start_update_entity_type_embeddings_workflow(
                        actor_id,
                        &[EntityTypeWithMetadata {
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
    async fn archive_entity_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        _: &mut A,
        params: ArchiveEntityTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.archive_ontology_type(&params.entity_type_id, EditionArchivedById::new(actor_id))
            .await
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn unarchive_entity_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        _: &mut A,
        params: UnarchiveEntityTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.unarchive_ontology_type(&params.entity_type_id, EditionCreatedById::new(actor_id))
            .await
    }

    #[tracing::instrument(level = "info", skip(self, params))]
    async fn update_entity_type_embeddings<A: AuthorizationApi + Send + Sync>(
        &mut self,
        _: AccountId,
        _: &mut A,
        params: UpdateEntityTypeEmbeddingParams<'_>,
    ) -> Result<(), UpdateError> {
        #[derive(Debug, ToSql)]
        #[postgres(name = "entity_type_embeddings")]
        pub struct EntityTypeEmbeddingsRow<'a> {
            ontology_id: OntologyId,
            embedding: Embedding<'a>,
            updated_at_transaction_time: Timestamp<TransactionTime>,
        }
        let entity_type_embeddings = vec![EntityTypeEmbeddingsRow {
            ontology_id: OntologyId::from(DataTypeId::from_url(&params.entity_type_id)),
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
                        FROM UNNEST($1::entity_type_embeddings[]) AS embeddings
                        JOIN ontology_ids USING (ontology_id)
                        JOIN base_urls USING (base_url)
                        WHERE version = max_version
                    ),
                    embeddings_to_delete AS (
                        SELECT entity_type_embeddings.ontology_id
                        FROM provided_embeddings
                        JOIN ontology_ids using (base_url)
                        JOIN entity_type_embeddings
                          ON ontology_ids.ontology_id = entity_type_embeddings.ontology_id
                        WHERE version < max_version
                           OR ($2 AND version = max_version
                                  AND entity_type_embeddings.updated_at_transaction_time
                                   <= provided_embeddings.updated_at_transaction_time)
                    ),
                    deleted AS (
                        DELETE FROM entity_type_embeddings
                        WHERE (ontology_id) IN (SELECT ontology_id FROM embeddings_to_delete)
                    )
                INSERT INTO entity_type_embeddings
                SELECT ontology_id, embedding, updated_at_transaction_time FROM provided_embeddings
                ON CONFLICT (ontology_id) DO UPDATE SET
                    embedding = EXCLUDED.embedding,
                    updated_at_transaction_time = EXCLUDED.updated_at_transaction_time
                WHERE entity_type_embeddings.updated_at_transaction_time
                      <= EXCLUDED.updated_at_transaction_time;
                ",
                &[&entity_type_embeddings, &params.reset],
            )
            .await
            .change_context(UpdateError)?;

        Ok(())
    }
}

#[derive(Debug, Copy, Clone)]
pub struct EntityTypeRowIndices {
    pub base_url: usize,
    pub version: usize,
    pub transaction_time: usize,

    pub schema: usize,

    pub edition_created_by_id: usize,
    pub edition_archived_by_id: usize,
    pub additional_metadata: usize,
    pub label_property: usize,
    pub icon: usize,
}

impl QueryRecordDecode for EntityTypeWithMetadata {
    type CompilationArtifacts = EntityTypeRowIndices;
    type Output = Self;

    fn decode(row: &Row, indices: &Self::CompilationArtifacts) -> Self {
        let record_id = OntologyTypeRecordId {
            base_url: row.get(indices.base_url),
            version: row.get(indices.version),
        };

        if let Ok(distance) = row.try_get::<_, f64>("distance") {
            tracing::trace!(%record_id, %distance, "Entity type embedding was calculated");
        }

        Self {
            schema: row.get::<_, Json<_>>(indices.schema).0,
            metadata: EntityTypeMetadata {
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
                label_property: row
                    .get::<_, Option<String>>(indices.label_property)
                    .map(BaseUrl::new)
                    .transpose()
                    .expect("label property returned from Postgres is not valid"),
                icon: row.get(indices.icon),
            },
        }
    }
}

impl PostgresRecord for EntityTypeWithMetadata {
    type CompilationParameters = ();

    fn base_table() -> Table {
        Table::OntologyTemporalMetadata
    }

    fn parameters() -> Self::CompilationParameters {}

    fn compile<'p, 'q: 'p>(
        compiler: &mut SelectCompiler<'p, 'q, Self>,
        _paths: &Self::CompilationParameters,
    ) -> Self::CompilationArtifacts {
        EntityTypeRowIndices {
            base_url: compiler.add_distinct_selection_with_ordering(
                &EntityTypeQueryPath::BaseUrl,
                Distinctness::Distinct,
                None,
            ),
            version: compiler.add_distinct_selection_with_ordering(
                &EntityTypeQueryPath::Version,
                Distinctness::Distinct,
                None,
            ),
            transaction_time: compiler.add_distinct_selection_with_ordering(
                &EntityTypeQueryPath::TransactionTime,
                Distinctness::Distinct,
                None,
            ),
            schema: compiler.add_selection_path(&EntityTypeQueryPath::Schema(None)),
            edition_created_by_id: compiler
                .add_selection_path(&EntityTypeQueryPath::EditionCreatedById),
            edition_archived_by_id: compiler
                .add_selection_path(&EntityTypeQueryPath::EditionArchivedById),
            additional_metadata: compiler
                .add_selection_path(&EntityTypeQueryPath::AdditionalMetadata),
            label_property: compiler.add_selection_path(&EntityTypeQueryPath::LabelProperty),
            icon: compiler.add_selection_path(&EntityTypeQueryPath::Icon),
        }
    }
}
