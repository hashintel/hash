mod read;

use std::{collections::hash_map::Entry, future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{bail, IntoReport, Report, Result, ResultExt};
use futures::FutureExt;
use tokio_postgres::GenericClient;
use type_system::uri::VersionedUri;
use uuid::Uuid;

use crate::{
    identifier::{
        knowledge::{EntityEditionId, EntityId, EntityIdAndTimestamp, EntityVersion},
        ontology::OntologyTypeEditionId,
        GraphElementEditionId, TimeSpan, Timestamp,
    },
    knowledge::{Entity, EntityLinkOrder, EntityMetadata, EntityProperties, EntityUuid, LinkData},
    provenance::{OwnedById, ProvenanceMetadata, UpdatedById},
    store::{
        crud::Read,
        postgres::{DependencyContext, DependencyStatus},
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
    pub(crate) fn traverse_entity<'a>(
        &'a self,
        entity_edition_id: EntityEditionId,
        dependency_context: &'a mut DependencyContext,
        subgraph: &'a mut Subgraph,
        current_resolve_depth: GraphResolveDepths,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'a>> {
        async move {
            let dependency_status = dependency_context
                .knowledge_dependency_map
                .insert(&entity_edition_id, current_resolve_depth);

            // Explicitly converting the unique reference to a shared reference to the vertex to
            // avoid mutating it by accident
            let entity: Option<&KnowledgeGraphVertex> = match dependency_status {
                DependencyStatus::Unresolved => {
                    match subgraph.vertices.knowledge_graph.entry(entity_edition_id) {
                        Entry::Occupied(entry) => Some(entry.into_mut()),
                        Entry::Vacant(entry) => {
                            let entity = Read::<Entity>::read_one(
                                self,
                                &Filter::for_entity_by_edition_id(entity_edition_id),
                            )
                            .await?;
                            Some(entry.insert(KnowledgeGraphVertex::Entity(entity)))
                        }
                    }
                }
                DependencyStatus::Resolved => None,
            };

            if let Some(KnowledgeGraphVertex::Entity(entity)) = entity {
                let entity_type_id =
                    OntologyTypeEditionId::from(entity.metadata().entity_type_id());
                let entity_edition_id = entity.metadata().edition_id();

                if current_resolve_depth.is_of_type.outgoing > 0 {
                    subgraph.edges.insert(Edge::KnowledgeGraph {
                        edition_id: entity_edition_id,
                        outward_edge: KnowledgeGraphOutwardEdges::ToOntology(OutwardEdge {
                            kind: SharedEdgeKind::IsOfType,
                            reversed: false,
                            right_endpoint: entity_type_id.clone(),
                        }),
                    });

                    self.traverse_entity_type(
                        &entity_type_id,
                        dependency_context,
                        subgraph,
                        GraphResolveDepths {
                            is_of_type: OutgoingEdgeResolveDepth {
                                outgoing: current_resolve_depth.is_of_type.outgoing - 1,
                                ..current_resolve_depth.is_of_type
                            },
                            ..current_resolve_depth
                        },
                    )
                    .await?;
                }

                if current_resolve_depth.has_left_entity.incoming > 0 {
                    for outgoing_link_entity in <Self as Read<Entity>>::read(
                        self,
                        &Filter::for_outgoing_link_by_source_entity_edition_id(entity_edition_id),
                    )
                    .await?
                    {
                        // We want to log the time the link entity was *first* added from this
                        // entity. We therefore need to find the timestamp of the first link
                        // entity
                        // TODO: this is very slow, we should update structural querying to be
                        //       able to  get the first timestamp of something efficiently
                        let mut all_outgoing_link_lower_decision_timestamps: Vec<_> =
                            <Self as Read<Entity>>::read(
                                self,
                                &Filter::for_entity_by_entity_id(
                                    outgoing_link_entity.metadata().edition_id().base_id(),
                                ),
                            )
                            .await?
                            .into_iter()
                            .map(|entity| {
                                entity
                                    .metadata()
                                    .edition_id()
                                    .version()
                                    .decision_time()
                                    .from
                            })
                            .collect();

                        all_outgoing_link_lower_decision_timestamps.sort();

                        let earliest_version = all_outgoing_link_lower_decision_timestamps
                            .into_iter()
                            .next()
                            .expect(
                                "we got the edition id from the entity in the first place, there \
                                 must be at least one version",
                            );

                        subgraph.edges.insert(Edge::KnowledgeGraph {
                            edition_id: entity_edition_id,
                            outward_edge: KnowledgeGraphOutwardEdges::ToKnowledgeGraph(
                                OutwardEdge {
                                    // (HasLeftEntity, reversed=true) is equivalent to an
                                    // outgoing link `Entity`
                                    kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                                    reversed: true,
                                    right_endpoint: EntityIdAndTimestamp::new(
                                        outgoing_link_entity.metadata().edition_id().base_id(),
                                        earliest_version,
                                    ),
                                },
                            ),
                        });

                        self.traverse_entity(
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

                if current_resolve_depth.has_right_entity.incoming > 0 {
                    for incoming_link_entity in <Self as Read<Entity>>::read(
                        self,
                        &Filter::for_incoming_link_by_source_entity_edition_id(entity_edition_id),
                    )
                    .await?
                    {
                        // We want to log the time the link entity was *first* added from this
                        // entity. We therefore need to find the timestamp of the first link
                        // entity
                        // TODO: this is very slow, we should update structural querying to be
                        //       able to get the first timestamp of something efficiently
                        let mut all_incoming_link_lower_decision_timestamps: Vec<_> =
                            <Self as Read<Entity>>::read(
                                self,
                                &Filter::for_entity_by_entity_id(
                                    incoming_link_entity.metadata().edition_id().base_id(),
                                ),
                            )
                            .await?
                            .into_iter()
                            .map(|entity| {
                                entity
                                    .metadata()
                                    .edition_id()
                                    .version()
                                    .decision_time()
                                    .from
                            })
                            .collect();

                        all_incoming_link_lower_decision_timestamps.sort();

                        let earliest_version = all_incoming_link_lower_decision_timestamps
                            .into_iter()
                            .next()
                            .expect(
                                "we got the edition id from the entity in the first place, there \
                                 must be at least one version",
                            );

                        subgraph.edges.insert(Edge::KnowledgeGraph {
                            edition_id: entity_edition_id,
                            outward_edge: KnowledgeGraphOutwardEdges::ToKnowledgeGraph(
                                OutwardEdge {
                                    // (HasRightEntity, reversed=true) is equivalent to an
                                    // incoming link `Entity`
                                    kind: KnowledgeGraphEdgeKind::HasRightEntity,
                                    reversed: true,
                                    right_endpoint: EntityIdAndTimestamp::new(
                                        incoming_link_entity.metadata().edition_id().base_id(),
                                        earliest_version,
                                    ),
                                },
                            ),
                        });

                        self.traverse_entity(
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

                if current_resolve_depth.has_left_entity.outgoing > 0 {
                    for left_entity in <Self as Read<Entity>>::read(
                        self,
                        &Filter::for_left_entity_by_entity_edition_id(entity_edition_id),
                    )
                    .await?
                    {
                        // We want to log the time _this_ link entity was *first* added from the
                        // left entity. We therefore need to find the timestamp of this entity
                        // TODO: this is very slow, we should update structural querying to be
                        //       able to get the first timestamp of something efficiently
                        let mut all_self_lower_decision_timestamps: Vec<_> =
                            <Self as Read<Entity>>::read(
                                self,
                                &Filter::for_entity_by_entity_id(entity_edition_id.base_id()),
                            )
                            .await?
                            .into_iter()
                            .map(|entity| {
                                entity
                                    .metadata()
                                    .edition_id()
                                    .version()
                                    .decision_time()
                                    .from
                            })
                            .collect();

                        all_self_lower_decision_timestamps.sort();

                        let earliest_version = all_self_lower_decision_timestamps
                            .into_iter()
                            .next()
                            .expect(
                                "we got the edition id from the entity in the first place, there \
                                 must be at least one version",
                            );

                        subgraph.edges.insert(Edge::KnowledgeGraph {
                            edition_id: entity_edition_id,
                            outward_edge: KnowledgeGraphOutwardEdges::ToKnowledgeGraph(
                                OutwardEdge {
                                    // (HasLeftEndpoint, reversed=true) is equivalent to an
                                    // outgoing `Link` `Entity`
                                    kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                                    reversed: false,
                                    right_endpoint: EntityIdAndTimestamp::new(
                                        left_entity.metadata().edition_id().base_id(),
                                        earliest_version,
                                    ),
                                },
                            ),
                        });

                        self.traverse_entity(
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

                if current_resolve_depth.has_right_entity.outgoing > 0 {
                    for right_entity in <Self as Read<Entity>>::read(
                        self,
                        &Filter::for_right_entity_by_entity_edition_id(entity_edition_id),
                    )
                    .await?
                    {
                        // We want to log the time _this_ link entity was *first* added to the
                        // right entity. We therefore need to find the timestamp of this entity
                        // TODO: this is very slow, we should update structural querying to be
                        //       able to  get the first timestamp of something efficiently
                        let mut all_self_lower_decision_timestamps: Vec<_> =
                            <Self as Read<Entity>>::read(
                                self,
                                &Filter::for_entity_by_entity_id(entity_edition_id.base_id()),
                            )
                            .await?
                            .into_iter()
                            .map(|entity| {
                                entity
                                    .metadata()
                                    .edition_id()
                                    .version()
                                    .decision_time()
                                    .from
                            })
                            .collect();

                        all_self_lower_decision_timestamps.sort();

                        let earliest_version = all_self_lower_decision_timestamps
                            .into_iter()
                            .next()
                            .expect(
                                "we got the edition id from the entity in the first place, there \
                                 must be at least one version",
                            );

                        subgraph.edges.insert(Edge::KnowledgeGraph {
                            edition_id: entity_edition_id,
                            outward_edge: KnowledgeGraphOutwardEdges::ToKnowledgeGraph(
                                OutwardEdge {
                                    // (HasLeftEndpoint, reversed=true) is equivalent to an
                                    // outgoing `Link` `Entity`
                                    kind: KnowledgeGraphEdgeKind::HasRightEntity,
                                    reversed: false,
                                    right_endpoint: EntityIdAndTimestamp::new(
                                        right_entity.metadata().edition_id().base_id(),
                                        earliest_version,
                                    ),
                                },
                            ),
                        });

                        self.traverse_entity(
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
        entity_id: EntityId,
        decision_time: Option<Timestamp>,
        updated_by_id: UpdatedById,
        archived: bool,
        entity_type_id: VersionedUri,
        properties: EntityProperties,
        link_data: Option<LinkData>,
    ) -> Result<EntityMetadata, InsertionError> {
        let entity_type_version_id = self
            .version_id_by_uri(&entity_type_id)
            .await
            .change_context(InsertionError)?;

        let properties = serde_json::to_value(properties)
            .into_report()
            .change_context(InsertionError)?;

        let row = self
            .as_client()
            .query_one(
                r#"
                SELECT
                    entity_edition_id,
                    lower(decision_time),
                    NULLIF(upper(decision_time), 'infinity'),
                    lower(system_time),
                    NULLIF(upper(system_time), 'infinity')
                FROM
                    create_entity($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);
                "#,
                &[
                    &entity_id.owned_by_id(),
                    &entity_id.entity_uuid(),
                    &decision_time,
                    &updated_by_id,
                    &archived,
                    &entity_type_version_id,
                    &properties,
                    &link_data
                        .as_ref()
                        .map(|metadata| metadata.left_entity_id().owned_by_id()),
                    &link_data
                        .as_ref()
                        .map(|metadata| metadata.left_entity_id().entity_uuid()),
                    &link_data
                        .as_ref()
                        .map(|metadata| metadata.right_entity_id().owned_by_id()),
                    &link_data
                        .as_ref()
                        .map(|metadata| metadata.right_entity_id().entity_uuid()),
                    &link_data.as_ref().map(LinkData::left_to_right_order),
                    &link_data.as_ref().map(LinkData::right_to_left_order),
                ],
            )
            .await
            .into_report()
            .change_context(InsertionError)?;

        // TODO: Expose temporal versions to backend
        //   see https://app.asana.com/0/0/1203444301722133/f
        let _version_id: i64 = row.get(0);
        let decision_time = TimeSpan {
            from: row.get(1),
            to: row.get(2),
        };
        let system_time = TimeSpan {
            from: row.get(3),
            to: row.get(4),
        };

        Ok(EntityMetadata::new(
            EntityEditionId::new(entity_id, EntityVersion::new(decision_time, system_time)),
            entity_type_id,
            ProvenanceMetadata::new(updated_by_id),
            archived,
        ))
    }

    #[doc(hidden)]
    #[cfg(feature = "__internal_bench")]
    async fn insert_entities_batched_by_type(
        &mut self,
        entities: impl IntoIterator<
            Item = (Option<EntityUuid>, EntityProperties, Option<LinkData>),
            IntoIter: Send,
        > + Send,
        entity_type_id: VersionedUri,
        owned_by_id: OwnedById,
        actor_id: UpdatedById,
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
        let mut entity_link_datas = Vec::with_capacity(entities.size_hint().0);
        for (entity_uuid, properties, link_data) in entities {
            entity_uuids.push(entity_uuid.unwrap_or_else(|| EntityUuid::new(Uuid::new_v4())));
            entity_properties.push(properties);
            entity_link_datas.push(link_data);
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
                entity_link_datas,
                entity_type_version_id,
                owned_by_id,
                actor_id,
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

        let mut subgraph = Subgraph::new(graph_resolve_depths);
        let mut dependency_context = DependencyContext::default();

        for entity in Read::<Entity>::read(self, filter).await? {
            let entity_edition_id = entity.metadata().edition_id();

            // Insert the vertex into the subgraph to avoid another lookup when traversing it
            subgraph
                .vertices
                .knowledge_graph
                .insert(entity_edition_id, KnowledgeGraphVertex::Entity(entity));

            self.traverse_entity(
                entity_edition_id,
                &mut dependency_context,
                &mut subgraph,
                graph_resolve_depths,
            )
            .await?;

            subgraph
                .roots
                .insert(GraphElementEditionId::KnowledgeGraph(entity_edition_id));
        }

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
        todo!("Support updating of entities: https://app.asana.com/0/0/1203464975244303/f")
    }
}
