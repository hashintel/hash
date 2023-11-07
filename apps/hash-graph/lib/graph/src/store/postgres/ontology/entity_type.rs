use std::{
    collections::{HashMap, HashSet},
    str::FromStr,
};

use async_trait::async_trait;
use authorization::{
    backend::ModifyRelationshipOperation,
    schema::{
        EntityTypeId, EntityTypeOwnerSubject, EntityTypePermission, EntityTypeRelationAndSubject,
        EntityTypeSubjectSet, EntityTypeViewerSubject, WebPermission,
    },
    zanzibar::{Consistency, Zookie},
    AuthorizationApi,
};
use error_stack::{ensure, Report, Result, ResultExt};
use futures::TryStreamExt;
use graph_types::{
    account::AccountId,
    ontology::{
        EntityTypeMetadata, EntityTypeWithMetadata, OntologyTemporalMetadata, OntologyTypeRecordId,
        PartialCustomOntologyMetadata, PartialEntityTypeMetadata,
    },
    provenance::{ProvenanceMetadata, RecordArchivedById, RecordCreatedById},
    web::WebId,
};
use temporal_versioning::RightBoundedTemporalInterval;
use type_system::{
    raw,
    url::{BaseUrl, VersionedUrl},
    EntityType,
};
use uuid::Uuid;

#[cfg(hash_graph_test_environment)]
use crate::store::error::DeletionError;
use crate::{
    ontology::EntityTypeQueryPath,
    store::{
        crud::Read,
        postgres::{
            ontology::{read::OntologyTypeTraversalData, OntologyId},
            query::ReferenceTable,
            OntologyTypeSubject, TraversalContext,
        },
        query::{Filter, FilterExpression, ParameterList},
        AsClient, ConflictBehavior, EntityTypeStore, InsertionError, PostgresStore, QueryError,
        Record, UpdateError,
    },
    subgraph::{
        edges::{EdgeDirection, GraphResolveDepths, OntologyEdgeKind},
        identifier::{EntityTypeVertexId, PropertyTypeVertexId},
        query::StructuralQuery,
        temporal_axes::{QueryTemporalAxesUnresolved, VariableAxis},
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
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
        level = "trace",
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

    #[tracing::instrument(level = "trace", skip(self))]
    #[cfg(hash_graph_test_environment)]
    pub async fn delete_entity_types(&mut self) -> Result<(), DeletionError> {
        let transaction = self.transaction().await.change_context(DeletionError)?;

        transaction
            .as_client()
            .simple_query(
                "
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

    fn create_closed_entity_type(
        entity_type_id: EntityTypeId,
        available_types: &mut HashMap<EntityTypeId, raw::EntityType>,
    ) -> Result<raw::EntityType, QueryError> {
        let mut current_type = available_types
            .remove(&entity_type_id)
            .ok_or_else(|| Report::new(QueryError))
            .attach_printable("entity type not available")?;
        let mut visited_ids = HashSet::from([entity_type_id]);

        loop {
            for parent in current_type.all_of.elements.clone() {
                // TODO: Use `VersionedUrl` instead of `String` in `raw`
                //   see https://linear.app/hash/issue/BP-30
                let parent_id = EntityTypeId::from_url(
                    &VersionedUrl::from_str(&parent.url)
                        .change_context(QueryError)
                        .attach_printable("Invalid versioned url")?,
                );

                ensure!(
                    parent_id != entity_type_id,
                    Report::new(QueryError).attach_printable("inheritance cycle detected")
                );

                if visited_ids.contains(&parent_id) {
                    // This can happens in case of multiple inheritance or cycles. Cycles are
                    // already checked above, so we can just skip this parent.
                    current_type
                        .all_of
                        .elements
                        .retain(|value| *value != parent);
                    break;
                }

                current_type
                    .merge_parent(
                        available_types
                            .get(&parent_id)
                            .ok_or_else(|| Report::new(QueryError))
                            .attach_printable("entity type not available")
                            .attach_printable(parent.url)?
                            .clone(),
                    )
                    .change_context(QueryError)
                    .attach_printable("could not merge parent")?;

                visited_ids.insert(parent_id);
            }

            if current_type.all_of.elements.is_empty() {
                break;
            }
        }

        available_types.insert(entity_type_id, current_type.clone());
        Ok(current_type)
    }

    pub(crate) async fn resolve_entity_types(
        &self,
        entity_types: impl IntoIterator<Item = EntityType> + Send,
    ) -> Result<Vec<EntityTypeInsertion>, QueryError> {
        let entity_types = entity_types
            .into_iter()
            .map(|entity_type| {
                (
                    EntityTypeId::from_url(entity_type.id()).into_uuid(),
                    // TODO: Distinguish between format validation and content validation so it's
                    //       possible to directly use reference iterators from `raw`
                    //   see https://linear.app/hash/issue/BP-33
                    (entity_type.clone(), raw::EntityType::from(entity_type)),
                )
            })
            .collect::<Vec<(Uuid, (EntityType, raw::EntityType))>>();

        // We need all types that the provided types inherit from so we can create the closed
        // schemas
        let parent_entity_type_ids = entity_types
            .iter()
            .flat_map(|(_, (schema, _))| schema.inherits_from().all_of())
            .map(|reference| EntityTypeId::from_url(reference.url()).into_uuid())
            .collect::<Vec<_>>();

        // We read all relevant schemas from the graph
        let parent_schemas = self
            .read_closed_schemas(
                &Filter::In(
                    FilterExpression::Path(EntityTypeQueryPath::OntologyId),
                    ParameterList::Uuid(&parent_entity_type_ids),
                ),
                Some(&QueryTemporalAxesUnresolved::default().resolve()),
            )
            .await?
            .map_ok(|(id, schema)| (EntityTypeId::from(id), schema))
            .try_collect::<Vec<_>>()
            .await?;

        // The types we check either come from the graph or are provided by the user
        let mut available_schemas: HashMap<_, _> = entity_types
            .iter()
            .map(|(id, (_, raw_schema))| (EntityTypeId::new(*id), raw_schema.clone()))
            .chain(parent_schemas)
            .collect();

        entity_types
            .into_iter()
            .map(|(entity_type_id, (schema, raw_schema))| {
                Ok(EntityTypeInsertion {
                    schema,
                    raw_schema,
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
    pub raw_schema: raw::EntityType,
    pub closed_schema: raw::EntityType,
}

#[async_trait]
impl<C: AsClient> EntityTypeStore for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self, entity_types, authorization_api))]
    async fn create_entity_types<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        entity_types: impl IntoIterator<Item = (EntityType, PartialEntityTypeMetadata), IntoIter: Send>
        + Send,
        on_conflict: ConflictBehavior,
    ) -> Result<Vec<EntityTypeMetadata>, InsertionError> {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let (entity_type_schemas, metadatas): (Vec<_>, Vec<_>) = entity_types.into_iter().unzip();
        let insertions = transaction
            .resolve_entity_types(entity_type_schemas)
            .await
            .change_context(InsertionError)?;

        let provenance = ProvenanceMetadata {
            record_created_by_id: RecordCreatedById::new(actor_id),
            record_archived_by_id: None,
        };

        let mut relationships = Vec::new();

        let mut inserted_entity_types = Vec::new();
        let mut inserted_entity_type_metadata =
            Vec::with_capacity(inserted_entity_types.capacity());

        for (insertion, metadata) in insertions.into_iter().zip(metadatas) {
            if let PartialCustomOntologyMetadata::Owned { owned_by_id } = &metadata.custom {
                authorization_api
                    .check_web_permission(
                        actor_id,
                        WebPermission::CreateEntityType,
                        WebId::from(*owned_by_id),
                        Consistency::FullyConsistent,
                    )
                    .await
                    .change_context(InsertionError)?
                    .assert_permission()
                    .change_context(InsertionError)?;
            }

            let EntityTypeInsertion {
                schema,
                raw_schema,
                closed_schema,
            } = insertion;

            if let Some((ontology_id, transaction_time, owner)) = transaction
                .create_ontology_metadata(
                    provenance.record_created_by_id,
                    &metadata.record_id,
                    &metadata.custom,
                    on_conflict,
                )
                .await?
            {
                transaction
                    .insert_entity_type_with_id(
                        ontology_id,
                        raw_schema,
                        closed_schema,
                        metadata.label_property.as_ref(),
                    )
                    .await?;

                inserted_entity_types.push((ontology_id, schema));
                inserted_entity_type_metadata.push(EntityTypeMetadata::from_partial(
                    metadata,
                    provenance,
                    transaction_time,
                ));

                relationships.push((
                    EntityTypeId::from(ontology_id),
                    EntityTypeRelationAndSubject::Viewer {
                        subject: EntityTypeViewerSubject::Public,
                        level: 0,
                    },
                ));
                if let Some(owner) = owner {
                    match owner {
                        OntologyTypeSubject::Account { id } => relationships.push((
                            EntityTypeId::from(ontology_id),
                            EntityTypeRelationAndSubject::Owner {
                                subject: EntityTypeOwnerSubject::Account { id },
                                level: 0,
                            },
                        )),
                        OntologyTypeSubject::AccountGroup { id } => relationships.push((
                            EntityTypeId::from(ontology_id),
                            EntityTypeRelationAndSubject::Owner {
                                subject: EntityTypeOwnerSubject::AccountGroup {
                                    id,
                                    set: EntityTypeSubjectSet::Member,
                                },
                                level: 0,
                            },
                        )),
                    }
                }
            }
        }

        for (ontology_id, schema) in inserted_entity_types {
            transaction
                .insert_entity_type_references(&schema, ontology_id)
                .await
                .change_context(InsertionError)
                .attach_printable_lazy(|| {
                    format!(
                        "could not insert references for entity type: {}",
                        schema.id()
                    )
                })
                .attach_lazy(|| schema.clone())?;
        }

        #[expect(clippy::needless_collect, reason = "Higher ranked lifetime error")]
        authorization_api
            .modify_entity_type_relations(
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
            Ok(inserted_entity_type_metadata)
        }
    }

    // #[tracing::instrument(level = "info", skip(self, authorization_api))]
    async fn get_entity_type<A: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &A,
        query: &StructuralQuery<EntityTypeWithMetadata>,
    ) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
            temporal_axes: ref unresolved_temporal_axes,
        } = *query;

        let temporal_axes = unresolved_temporal_axes.clone().resolve();
        let time_axis = temporal_axes.variable_time_axis();

        // TODO: Remove again when subgraph logic was revisited
        //   see https://linear.app/hash/issue/H-297
        let mut visited_ontology_ids = HashSet::new();

        let entity_types =
            Read::<EntityTypeWithMetadata>::read_vec(self, filter, Some(&temporal_axes))
                .await?
                .into_iter()
                .filter_map(|entity_type| {
                    let id = EntityTypeId::from_url(entity_type.schema.id());
                    let vertex_id = entity_type.vertex_id(time_axis);
                    // The records are already sorted by time, so we can just take the first one
                    visited_ontology_ids
                        .insert(id)
                        .then_some((id, (vertex_id, entity_type)))
                })
                .collect::<HashMap<_, _>>();

        let filtered_ids = entity_types.keys().copied().collect::<Vec<_>>();
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

        let (entity_type_ids, entity_type_vertices): (Vec<_>, _) = entity_types
            .into_iter()
            .filter(|(id, _)| permissions.get(id).copied().unwrap_or(false))
            .unzip();
        subgraph.vertices.entity_types = entity_type_vertices;

        for vertex_id in subgraph.vertices.entity_types.keys() {
            subgraph.roots.insert(vertex_id.clone().into());
        }

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
            .read_traversed_vertices(self, &mut subgraph)
            .await?;

        Ok(subgraph)
    }

    #[tracing::instrument(level = "info", skip(self, entity_type, authorization_api))]
    async fn update_entity_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        entity_type: EntityType,
        label_property: Option<BaseUrl>,
        icon: Option<String>,
    ) -> Result<EntityTypeMetadata, UpdateError> {
        let old_ontology_id = EntityTypeId::from_url(&VersionedUrl {
            base_url: entity_type.id().base_url.clone(),
            version: entity_type.id().version - 1,
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

        let url = entity_type.id();
        let record_id = OntologyTypeRecordId::from(url.clone());

        let provenance = ProvenanceMetadata {
            record_created_by_id: RecordCreatedById::new(actor_id),
            record_archived_by_id: None,
        };

        let (ontology_id, owned_by_id, transaction_time, owner) = transaction
            .update_owned_ontology_id(url, provenance.record_created_by_id)
            .await?;

        let mut insertions = transaction
            .resolve_entity_types([entity_type])
            .await
            .change_context(UpdateError)?;
        let EntityTypeInsertion {
            schema,
            raw_schema,
            closed_schema,
        } = insertions
            .pop()
            .ok_or_else(|| Report::new(UpdateError).attach_printable("entity type not found"))?;

        transaction
            .insert_entity_type_with_id(
                ontology_id,
                raw_schema,
                closed_schema,
                label_property.as_ref(),
            )
            .await
            .change_context(UpdateError)?;

        let metadata = PartialEntityTypeMetadata {
            record_id,
            label_property,
            icon,
            custom: PartialCustomOntologyMetadata::Owned { owned_by_id },
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

        let owner = match owner {
            OntologyTypeSubject::Account { id } => EntityTypeOwnerSubject::Account { id },
            OntologyTypeSubject::AccountGroup { id } => EntityTypeOwnerSubject::AccountGroup {
                id,
                set: EntityTypeSubjectSet::Member,
            },
        };

        let relationships = [
            (
                EntityTypeId::from(ontology_id),
                EntityTypeRelationAndSubject::Owner {
                    subject: owner,
                    level: 0,
                },
            ),
            (
                EntityTypeId::from(ontology_id),
                EntityTypeRelationAndSubject::Viewer {
                    subject: EntityTypeViewerSubject::Public,
                    level: 0,
                },
            ),
        ];

        #[expect(clippy::needless_collect, reason = "Higher ranked lifetime error")]
        authorization_api
            .modify_entity_type_relations(
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
            .change_context(UpdateError)?;

        if let Err(mut error) = transaction.commit().await.change_context(UpdateError) {
            #[expect(clippy::needless_collect, reason = "Higher ranked lifetime error")]
            if let Err(auth_error) = authorization_api
                .modify_entity_type_relations(
                    relationships
                        .iter()
                        .map(|(resource, relation_and_subject)| {
                            (
                                ModifyRelationshipOperation::Delete,
                                *resource,
                                *relation_and_subject,
                            )
                        })
                        .collect::<Vec<_>>(),
                )
                .await
                .change_context(UpdateError)
            {
                // TODO: Use `add_child`
                //   see https://linear.app/hash/issue/GEN-105/add-ability-to-add-child-errors
                error.extend_one(auth_error);
            }

            Err(error)
        } else {
            Ok(EntityTypeMetadata::from_partial(
                metadata,
                provenance,
                transaction_time,
            ))
        }
    }

    #[tracing::instrument(level = "info", skip(self, _authorization_api))]
    async fn archive_entity_type<A: AuthorizationApi + Sync>(
        &mut self,
        actor_id: AccountId,
        _authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.archive_ontology_type(id, RecordArchivedById::new(actor_id))
            .await
    }

    #[tracing::instrument(level = "info", skip(self, _authorization_api))]
    async fn unarchive_entity_type<A: AuthorizationApi + Sync>(
        &mut self,
        actor_id: AccountId,
        _authorization_api: &mut A,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.unarchive_ontology_type(id, RecordCreatedById::new(actor_id))
            .await
    }
}
