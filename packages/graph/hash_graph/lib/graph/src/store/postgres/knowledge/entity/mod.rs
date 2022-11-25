mod read;

use std::{future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{bail, IntoReport, Report, Result, ResultExt};
use futures::{stream, FutureExt, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::uri::VersionedUri;
use uuid::Uuid;

use crate::{
    identifier::{
        knowledge::{EntityEditionId, EntityId, EntityIdAndTimestamp},
        ontology::OntologyTypeEditionId,
        GraphElementEditionId,
    },
    knowledge::{
        Entity, EntityLinkOrder, EntityMetadata, EntityProperties, EntityUuid, LinkEntityMetadata,
    },
    provenance::{CreatedById, OwnedById, UpdatedById},
    store::{
        crud::Read,
        error::ArchivalError,
        postgres::{DependencyContext, DependencyStatus, HistoricMove},
        query::Filter,
        AsClient, EntityStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
    subgraph::{
        edges::{
            Edge, EdgeResolveDepths, GraphResolveDepths, KnowledgeGraphEdgeKind,
            KnowledgeGraphOutwardEdges, OutgoingEdgeResolveDepth, OutwardEdge, SharedEdgeKind,
        },
        query::StructuralQuery,
        vertices::KnowledgeGraphVertex,
        Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read an [`Entity`] into a [`DependencyContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[expect(clippy::too_many_lines)]
    pub(crate) fn get_entity_as_dependency<'a>(
        &'a self,
        entity_edition_id: EntityEditionId,
        dependency_context: &'a mut DependencyContext,
        subgraph: &'a mut Subgraph,
        current_resolve_depth: GraphResolveDepths,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'a>> {
        async move {
            let dependency_status = dependency_context
                .knowledge_dependency_map
                .insert(&entity_edition_id, Some(current_resolve_depth));
            let entity: Option<&KnowledgeGraphVertex> = match dependency_status {
                DependencyStatus::Unknown => {
                    let entity = Read::<Entity>::read_one(
                        self,
                        &Filter::for_entity_by_edition_id(entity_edition_id),
                    )
                    .await?;
                    Some(
                        subgraph
                            .vertices
                            .knowledge_graph
                            .entry(entity_edition_id)
                            .or_insert(KnowledgeGraphVertex::Entity(entity)),
                    )
                }
                DependencyStatus::DependenciesUnresolved => {
                    subgraph.vertices.knowledge_graph.get(&entity_edition_id)
                }
                DependencyStatus::Resolved => None,
            };

            if let Some(KnowledgeGraphVertex::Entity(entity)) = entity {
                let entity_type_id =
                    OntologyTypeEditionId::from(entity.metadata().entity_type_id());
                let entity_edition_id = entity.metadata().edition_id();

                if current_resolve_depth.is_of_type.outgoing > 0 {
                    self.get_entity_type_as_dependency(
                        &entity_type_id,
                        dependency_context,
                        subgraph,
                        GraphResolveDepths {
                            is_of_type: OutgoingEdgeResolveDepth {
                                outgoing: current_resolve_depth.is_of_type.outgoing - 1,
                                ..current_resolve_depth.is_of_type
                            },
                            ..Default::default()
                        },
                    )
                    .await?;
                }

                subgraph.edges.insert(Edge::KnowledgeGraph {
                    edition_id: entity_edition_id,
                    outward_edge: KnowledgeGraphOutwardEdges::ToOntology(OutwardEdge {
                        kind: SharedEdgeKind::IsOfType,
                        reversed: false,
                        right_endpoint: entity_type_id.clone(),
                    }),
                });

                for outgoing_link_entity in <Self as Read<Entity>>::read(
                    self,
                    &Filter::for_outgoing_link_by_source_entity_edition_id(entity_edition_id),
                )
                .await?
                {
                    // We want to log the time the link entity was *first* added from this entity.
                    // We therefore need to find the timestamp of the first link entity
                    // TODO: this is very slow, we should update structural querying to be able to
                    //  get the first timestamp of something efficiently
                    let mut all_outgoing_link_entity_editions: Vec<_> =
                        <Self as Read<Entity>>::read(
                            self,
                            &Filter::for_entity_by_entity_id(
                                outgoing_link_entity.metadata().edition_id().base_id(),
                            ),
                        )
                        .await?
                        .into_iter()
                        .map(|entity| entity.metadata().edition_id())
                        .collect();

                    all_outgoing_link_entity_editions.sort();

                    let earliest_version = all_outgoing_link_entity_editions
                        .into_iter()
                        .next()
                        .expect(
                            "we got the edition id from the entity in the first place, there must \
                             be at least one version",
                        )
                        .version();

                    subgraph.edges.insert(Edge::KnowledgeGraph {
                        edition_id: entity_edition_id,
                        outward_edge: KnowledgeGraphOutwardEdges::ToKnowledgeGraph(OutwardEdge {
                            // (HasLeftEntity, reversed=true) is equivalent to an
                            // outgoing link `Entity`
                            kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                            reversed: true,
                            right_endpoint: EntityIdAndTimestamp::new(
                                outgoing_link_entity.metadata().edition_id().base_id(),
                                earliest_version.inner(),
                            ),
                        }),
                    });

                    if current_resolve_depth.has_left_entity.incoming > 0 {
                        self.get_entity_as_dependency(
                            outgoing_link_entity.metadata().edition_id(),
                            dependency_context,
                            subgraph,
                            GraphResolveDepths {
                                has_left_entity: EdgeResolveDepths {
                                    incoming: current_resolve_depth.has_left_entity.incoming - 1,
                                    ..current_resolve_depth.has_left_entity
                                },
                                ..current_resolve_depth
                            },
                        )
                        .await?;
                    }
                }

                for incoming_link_entity in <Self as Read<Entity>>::read(
                    self,
                    &Filter::for_incoming_link_by_source_entity_edition_id(entity_edition_id),
                )
                .await?
                {
                    // We want to log the time the link entity was *first* added from this entity.
                    // We therefore need to find the timestamp of the first link entity
                    // TODO: this is very slow, we should update structural querying to be able to
                    //  get the first timestamp of something efficiently
                    let mut all_incoming_link_entity_editions: Vec<_> =
                        <Self as Read<Entity>>::read(
                            self,
                            &Filter::for_entity_by_entity_id(
                                incoming_link_entity.metadata().edition_id().base_id(),
                            ),
                        )
                        .await?
                        .into_iter()
                        .map(|entity| entity.metadata().edition_id())
                        .collect();

                    all_incoming_link_entity_editions.sort();

                    let earliest_version = all_incoming_link_entity_editions
                        .into_iter()
                        .next()
                        .expect(
                            "we got the edition id from the entity in the first place, there must \
                             be at least one version",
                        )
                        .version();

                    subgraph.edges.insert(Edge::KnowledgeGraph {
                        edition_id: entity_edition_id,
                        outward_edge: KnowledgeGraphOutwardEdges::ToKnowledgeGraph(OutwardEdge {
                            // (HasRightEntity, reversed=true) is equivalent to an
                            // incoming link `Entity`
                            kind: KnowledgeGraphEdgeKind::HasRightEntity,
                            reversed: true,
                            right_endpoint: EntityIdAndTimestamp::new(
                                incoming_link_entity.metadata().edition_id().base_id(),
                                earliest_version.inner(),
                            ),
                        }),
                    });

                    if current_resolve_depth.has_right_entity.incoming > 0 {
                        self.get_entity_as_dependency(
                            incoming_link_entity.metadata().edition_id(),
                            dependency_context,
                            subgraph,
                            GraphResolveDepths {
                                has_right_entity: EdgeResolveDepths {
                                    incoming: current_resolve_depth.has_right_entity.incoming - 1,
                                    ..current_resolve_depth.has_right_entity
                                },
                                ..current_resolve_depth
                            },
                        )
                        .await?;
                    }
                }

                for left_entity in <Self as Read<Entity>>::read(
                    self,
                    &Filter::for_left_entity_by_entity_edition_id(entity_edition_id),
                )
                .await?
                {
                    // We want to log the time _this_ link entity was *first* added from the left
                    // entity. We therefore need to find the timestamp of this entity
                    // TODO: this is very slow, we should update structural querying to be able to
                    //  get the first timestamp of something efficiently
                    let mut all_self_editions: Vec<_> = <Self as Read<Entity>>::read(
                        self,
                        &Filter::for_entity_by_entity_id(entity_edition_id.base_id()),
                    )
                    .await?
                    .into_iter()
                    .map(|entity| entity.metadata().edition_id())
                    .collect();

                    all_self_editions.sort();

                    let earliest_version = all_self_editions
                        .into_iter()
                        .next()
                        .expect(
                            "we got the edition id from the entity in the first place, there must \
                             be at least one version",
                        )
                        .version();

                    subgraph.edges.insert(Edge::KnowledgeGraph {
                        edition_id: entity_edition_id,
                        outward_edge: KnowledgeGraphOutwardEdges::ToKnowledgeGraph(OutwardEdge {
                            // (HasLeftEndpoint, reversed=true) is equivalent to an
                            // outgoing `Link` `Entity`
                            kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                            reversed: false,
                            right_endpoint: EntityIdAndTimestamp::new(
                                left_entity.metadata().edition_id().base_id(),
                                earliest_version.inner(),
                            ),
                        }),
                    });

                    if current_resolve_depth.has_left_entity.outgoing > 0 {
                        self.get_entity_as_dependency(
                            left_entity.metadata().edition_id(),
                            dependency_context,
                            subgraph,
                            GraphResolveDepths {
                                has_left_entity: EdgeResolveDepths {
                                    outgoing: current_resolve_depth.has_left_entity.outgoing - 1,
                                    ..current_resolve_depth.has_left_entity
                                },
                                ..current_resolve_depth
                            },
                        )
                        .await?;
                    }
                }

                for right_entity in <Self as Read<Entity>>::read(
                    self,
                    &Filter::for_right_entity_by_entity_edition_id(entity_edition_id),
                )
                .await?
                {
                    // We want to log the time _this_ link entity was *first* added to the right
                    // entity. We therefore need to find the timestamp of this entity
                    // TODO: this is very slow, we should update structural querying to be able to
                    //  get the first timestamp of something efficiently
                    let mut all_self_editions: Vec<_> = <Self as Read<Entity>>::read(
                        self,
                        &Filter::for_entity_by_entity_id(entity_edition_id.base_id()),
                    )
                    .await?
                    .into_iter()
                    .map(|entity| entity.metadata().edition_id())
                    .collect();

                    all_self_editions.sort();

                    let earliest_version = all_self_editions
                        .into_iter()
                        .next()
                        .expect(
                            "we got the edition id from the entity in the first place, there must \
                             be at least one version",
                        )
                        .version();

                    subgraph.edges.insert(Edge::KnowledgeGraph {
                        edition_id: entity_edition_id,
                        outward_edge: KnowledgeGraphOutwardEdges::ToKnowledgeGraph(OutwardEdge {
                            // (HasLeftEndpoint, reversed=true) is equivalent to an
                            // outgoing `Link` `Entity`
                            kind: KnowledgeGraphEdgeKind::HasRightEntity,
                            reversed: false,
                            right_endpoint: EntityIdAndTimestamp::new(
                                right_entity.metadata().edition_id().base_id(),
                                earliest_version.inner(),
                            ),
                        }),
                    });

                    if current_resolve_depth.has_right_entity.outgoing > 0 {
                        self.get_entity_as_dependency(
                            right_entity.metadata().edition_id(),
                            dependency_context,
                            subgraph,
                            GraphResolveDepths {
                                has_right_entity: EdgeResolveDepths {
                                    outgoing: current_resolve_depth.has_right_entity.outgoing - 1,
                                    ..current_resolve_depth.has_right_entity
                                },
                                ..current_resolve_depth
                            },
                        )
                        .await?;
                    }
                }
            }

            Ok(())
        }
        .boxed()
    }
}

#[async_trait]
impl<C: AsClient> EntityStore for PostgresStore<C> {
    async fn create_entity(
        &mut self,
        properties: EntityProperties,
        entity_type_id: VersionedUri,
        owned_by_id: OwnedById,
        entity_uuid: Option<EntityUuid>,
        created_by_id: CreatedById,
        link_metadata: Option<LinkEntityMetadata>,
    ) -> Result<EntityMetadata, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        let entity_uuid = entity_uuid.unwrap_or_else(|| EntityUuid::new(Uuid::new_v4()));
        let entity_id = EntityId::new(owned_by_id, entity_uuid);

        // TODO: match on and return the relevant error
        //   https://app.asana.com/0/1200211978612931/1202574350052904/f
        transaction.insert_entity_uuid(entity_uuid).await?;
        let metadata = transaction
            .insert_entity(
                entity_id,
                properties,
                entity_type_id,
                created_by_id,
                UpdatedById::new(created_by_id.as_account_id()),
                link_metadata,
            )
            .await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(metadata)
    }

    #[doc(hidden)]
    #[cfg(feature = "__internal_bench")]
    async fn insert_entities_batched_by_type(
        &mut self,
        entities: impl IntoIterator<
            Item = (
                Option<EntityUuid>,
                EntityProperties,
                Option<LinkEntityMetadata>,
            ),
            IntoIter: Send,
        > + Send,
        entity_type_id: VersionedUri,
        owned_by_id: OwnedById,
        actor_id: CreatedById,
    ) -> Result<Vec<EntityUuid>, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        let entities = entities.into_iter();
        let mut entity_uuids = Vec::with_capacity(entities.size_hint().0);
        let mut entity_properties = Vec::with_capacity(entities.size_hint().0);
        let mut entity_link_metadatas = Vec::with_capacity(entities.size_hint().0);
        for (entity_uuid, properties, link_metadata) in entities {
            entity_uuids.push(entity_uuid.unwrap_or_else(|| EntityUuid::new(Uuid::new_v4())));
            entity_properties.push(properties);
            entity_link_metadatas.push(link_metadata);
        }

        // TODO: match on and return the relevant error
        //   https://app.asana.com/0/1200211978612931/1202574350052904/f
        transaction
            .insert_entity_uuids(entity_uuids.iter().copied())
            .await?;

        // Using one entity type per entity would result in more lookups, which results in a more
        // complex logic and/or be inefficient.
        // Please see the documentation for this function on the trait for more information.
        let entity_type_version_id = transaction
            .version_id_by_uri(&entity_type_id)
            .await
            .change_context(InsertionError)?;
        transaction
            .insert_entity_batch_by_type(
                entity_uuids.iter().copied(),
                entity_properties,
                entity_link_metadatas,
                entity_type_version_id,
                owned_by_id,
                actor_id,
                UpdatedById::new(actor_id.as_account_id()),
            )
            .await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(entity_uuids)
    }

    async fn get_entity<'f: 'q, 'q>(
        &self,
        query: &'f StructuralQuery<'q, Entity>,
    ) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
        } = *query;

        let mut subgraph = stream::iter(Read::<Entity>::read(self, filter).await?)
            .then(|entity| async move {
                let mut subgraph = Subgraph::new(graph_resolve_depths);
                let mut dependency_context = DependencyContext::default();

                let entity_edition_id = entity.metadata().edition_id();
                dependency_context
                    .knowledge_dependency_map
                    .insert(&entity_edition_id, None);
                subgraph
                    .vertices
                    .knowledge_graph
                    .insert(entity_edition_id, KnowledgeGraphVertex::Entity(entity));

                self.get_entity_as_dependency(
                    entity_edition_id,
                    &mut dependency_context,
                    &mut subgraph,
                    graph_resolve_depths,
                )
                .await?;

                subgraph
                    .roots
                    .insert(GraphElementEditionId::KnowledgeGraph(entity_edition_id));

                Ok::<_, Report<QueryError>>(subgraph)
            })
            .try_collect::<Subgraph>()
            .await?;

        subgraph.depths = graph_resolve_depths;

        Ok(subgraph)
    }

    async fn update_entity(
        &mut self,
        entity_id: EntityId,
        properties: EntityProperties,
        entity_type_id: VersionedUri,
        updated_by_id: UpdatedById,
        order: EntityLinkOrder,
    ) -> Result<EntityMetadata, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        transaction
            .lock_latest_entity_for_update(entity_id)
            .await
            .change_context(UpdateError)?;

        let old_entity_metadata = transaction
            .move_latest_entity_to_histories(entity_id, HistoricMove::ForNewVersion)
            .await
            .change_context(UpdateError)?;

        let link_metadata = match (
            old_entity_metadata.link_metadata(),
            order.left(),
            order.right(),
        ) {
            (None, None, None) => None,
            (None, ..) => bail!(
                Report::new(UpdateError)
                    .attach_printable("cannot update link order of an entity that is not a link")
            ),
            (Some(link_metadata), left, right) => {
                let new_left_order = match (link_metadata.left_order(), left) {
                    (None, None) => None,
                    (Some(_), None) => bail!(Report::new(UpdateError).attach_printable(
                        "left order was set on entity but new order was not provided"
                    )),
                    (None, Some(_)) => bail!(Report::new(UpdateError).attach_printable(
                        "cannot set left order of a link that does not have a left order"
                    )),
                    (Some(_), Some(new_left)) => Some(new_left),
                };
                let new_right_order = match (link_metadata.right_order(), right) {
                    (None, None) => None,
                    (Some(_), None) => bail!(Report::new(UpdateError).attach_printable(
                        "right order was set on entity but new order was not provided"
                    )),
                    (None, Some(_)) => bail!(Report::new(UpdateError).attach_printable(
                        "cannot set right order of a link that does not have a right order"
                    )),
                    (Some(_), Some(new_right)) => Some(new_right),
                };
                Some(LinkEntityMetadata::new(
                    link_metadata.left_entity_id(),
                    link_metadata.right_entity_id(),
                    new_left_order,
                    new_right_order,
                ))
            }
        };

        let entity_metadata = transaction
            .insert_entity(
                entity_id,
                properties,
                entity_type_id,
                old_entity_metadata.provenance_metadata().created_by_id(),
                updated_by_id,
                link_metadata,
            )
            .await
            .change_context(UpdateError)?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(entity_metadata)
    }

    async fn archive_entity(
        &mut self,
        entity_id: EntityId,
        actor_id: UpdatedById,
    ) -> Result<(), ArchivalError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(ArchivalError)?,
        );

        transaction
            .lock_latest_entity_for_update(entity_id)
            .await
            .change_context(ArchivalError)?;

        // Prepare to create a new history entry to mark archival
        let old_entity: Entity = transaction
            .read_one(&Filter::for_latest_entity_by_entity_id(entity_id))
            .await
            .change_context(ArchivalError)?;

        // Move current latest edition to the historic table
        transaction
            .move_latest_entity_to_histories(entity_id, HistoricMove::ForNewVersion)
            .await
            .change_context(ArchivalError)?;

        // Insert latest edition to be the historic archival marker
        transaction
            .insert_entity(
                entity_id,
                old_entity.properties().clone(),
                old_entity.metadata().entity_type_id().clone(),
                old_entity.metadata().provenance_metadata().created_by_id(),
                actor_id,
                old_entity.metadata().link_metadata(),
            )
            .await
            .change_context(ArchivalError)?;

        // Archive latest edition, leaving nothing from the entity behind.
        transaction
            .move_latest_entity_to_histories(entity_id, HistoricMove::ForArchival)
            .await
            .change_context(ArchivalError)?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(ArchivalError)?;

        Ok(())
    }
}
