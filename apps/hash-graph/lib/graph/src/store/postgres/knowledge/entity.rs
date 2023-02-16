mod read;

use std::{collections::hash_map::RawEntryMut, future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use futures::FutureExt;
use tokio_postgres::{error::SqlState, GenericClient};
use type_system::uri::VersionedUri;
use uuid::Uuid;

use crate::{
    identifier::{
        knowledge::{EntityEditionId, EntityId, EntityRecordId, EntityVersion},
        time::{DecisionTime, TimeProjection, Timestamp},
        EntityVertexId, OntologyTypeVertexId,
    },
    knowledge::{Entity, EntityLinkOrder, EntityMetadata, EntityProperties, EntityUuid, LinkData},
    provenance::{OwnedById, ProvenanceMetadata, UpdatedById},
    store::{
        crud::Read,
        error::{EntityDoesNotExist, RaceConditionOnUpdate},
        postgres::{DependencyContext, DependencyStatus},
        query::Filter,
        AsClient, EntityStore, InsertionError, PostgresStore, QueryError, Record, UpdateError,
    },
    subgraph::{
        edges::{
            Edge, EdgeResolveDepths, GraphResolveDepths, KnowledgeGraphEdgeKind,
            KnowledgeGraphOutwardEdges, OutgoingEdgeResolveDepth, OutwardEdge, SharedEdgeKind,
        },
        query::StructuralQuery,
        Subgraph, SubgraphIndex,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read an [`Entity`] into a [`DependencyContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    #[tracing::instrument(level = "trace", skip(self, dependency_context, subgraph))]
    pub(crate) fn traverse_entity<'a>(
        &'a self,
        entity_vertex_id: EntityVertexId,
        dependency_context: &'a mut DependencyContext,
        subgraph: &'a mut Subgraph,
        mut current_resolve_depths: GraphResolveDepths,
        time_projection: TimeProjection,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'a>> {
        async move {
            let time_axis = subgraph.resolved_time_projection.image_time_axis();

            let entity: &Entity = match entity_vertex_id.subgraph_vertex_entry(subgraph) {
                RawEntryMut::Occupied(entry) => entry.into_mut(),
                RawEntryMut::Vacant(_) => {
                    // Entities are always inserted into the subgraph before they are resolved, so
                    // this should never happen. If it does, it is a bug.
                    unreachable!("entity should already be in the subgraph")
                }
            };

            let version_interval = entity
                .metadata()
                .version()
                .projected_time(time_axis);

            // Intersects the version interval of the entity with the time projection's time
            // interval. We only want to resolve the entity further for the overlap of these two
            // intervals.
            let Some(mut intersected_time_projection) = time_projection.intersect_image(version_interval) else {
                // `traverse_entity` is called with the returned entities from `read` with
                // `time_projection`. This implies, that the version interval of `entity` is
                // overlaps with `time_projection`. `intersect_image` returns `None` if there are
                // no overlapping points, so this should never happen.
                unreachable!("the version interval of the entity does not overlap with the time projection");
            };

            let dependency_status = dependency_context.knowledge_dependency_map.update(
                &entity_vertex_id,
                current_resolve_depths,
                intersected_time_projection.image().convert(),
            );

            match dependency_status {
                DependencyStatus::Unresolved(depths, interval) => {
                    // Depending on previous traversals, we may have to resolve with parameters
                    // different to those provided, so we update the resolve depths and time
                    // projection.
                    //
                    // `DependencyMap::update` may return a higher resolve depth than the one
                    // requested, so we update the `resolve_depths` to the returned value.
                    current_resolve_depths = depths;
                    // It may also return a different time interval than the one requested, so
                    // we update the `intersected_time_projection`'s time interval to the returned
                    // value.
                    intersected_time_projection.set_image(interval.convert());
                }
                DependencyStatus::Resolved => return Ok(()),
            };

            if current_resolve_depths.is_of_type.outgoing > 0 {
                let entity_type_id =
                    OntologyTypeVertexId::from(entity.metadata().entity_type_id().clone());
                subgraph.edges.insert(Edge::KnowledgeGraph {
                    vertex_id: entity_vertex_id,
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
                            outgoing: current_resolve_depths.is_of_type.outgoing - 1,
                            ..current_resolve_depths.is_of_type
                        },
                        ..current_resolve_depths
                    },
                    intersected_time_projection.clone(),
                )
                    .await?;
            }

            if current_resolve_depths.has_left_entity.incoming > 0 {
                for outgoing_link_entity in <Self as Read<Entity>>::read(
                    self,
                    &Filter::for_outgoing_link_by_source_entity_id(entity_vertex_id.base_id()),
                    &intersected_time_projection,
                )
                    .await?
                {
                    subgraph.edges.insert(Edge::KnowledgeGraph {
                        vertex_id: entity_vertex_id,
                        outward_edge: KnowledgeGraphOutwardEdges::ToKnowledgeGraph(OutwardEdge {
                            // (HasLeftEntity, reversed=true) is equivalent to an
                            // outgoing link `Entity`
                            kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                            reversed: true,
                            right_endpoint: outgoing_link_entity.metadata().record_id().entity_id,
                        }),
                    });

                    let outgoing_link_entity_vertex_id = outgoing_link_entity.vertex_id(time_axis);
                    subgraph.insert(&outgoing_link_entity_vertex_id, outgoing_link_entity);

                    self.traverse_entity(
                        outgoing_link_entity_vertex_id,
                        dependency_context,
                        subgraph,
                        GraphResolveDepths {
                            has_left_entity: EdgeResolveDepths {
                                incoming: current_resolve_depths.has_left_entity.incoming - 1,
                                ..current_resolve_depths.has_left_entity
                            },
                            ..current_resolve_depths
                        },
                        intersected_time_projection.clone(),
                    )
                        .await?;
                }
            }

            if current_resolve_depths.has_right_entity.incoming > 0 {
                for incoming_link_entity in <Self as Read<Entity>>::read(
                    self,
                    &Filter::for_incoming_link_by_source_entity_id(entity_vertex_id.base_id()),
                    &intersected_time_projection,
                )
                    .await?
                {
                    subgraph.edges.insert(Edge::KnowledgeGraph {
                        vertex_id: entity_vertex_id,
                        outward_edge: KnowledgeGraphOutwardEdges::ToKnowledgeGraph(OutwardEdge {
                            // (HasRightEntity, reversed=true) is equivalent to an
                            // incoming link `Entity`
                            kind: KnowledgeGraphEdgeKind::HasRightEntity,
                            reversed: true,
                            right_endpoint: incoming_link_entity.metadata().record_id().entity_id,
                        }),
                    });

                    let incoming_link_entity_vertex_id = incoming_link_entity.vertex_id(time_axis);
                    subgraph.insert(&incoming_link_entity_vertex_id, incoming_link_entity);

                    self.traverse_entity(
                        incoming_link_entity_vertex_id,
                        dependency_context,
                        subgraph,
                        GraphResolveDepths {
                            has_right_entity: EdgeResolveDepths {
                                incoming: current_resolve_depths.has_right_entity.incoming - 1,
                                ..current_resolve_depths.has_right_entity
                            },
                            ..current_resolve_depths
                        },
                        intersected_time_projection.clone(),
                    )
                        .await?;
                }
            }

            if current_resolve_depths.has_left_entity.outgoing > 0 {
                for left_entity in <Self as Read<Entity>>::read(
                    self,
                    &Filter::for_left_entity_by_entity_id(entity_vertex_id.base_id()),
                    &intersected_time_projection,
                )
                    .await?
                {
                    subgraph.edges.insert(Edge::KnowledgeGraph {
                        vertex_id: entity_vertex_id,
                        outward_edge: KnowledgeGraphOutwardEdges::ToKnowledgeGraph(OutwardEdge {
                            // (HasLeftEndpoint, reversed=true) is equivalent to an
                            // outgoing `Link` `Entity`
                            kind: KnowledgeGraphEdgeKind::HasLeftEntity,
                            reversed: false,
                            right_endpoint: left_entity.metadata().record_id().entity_id,
                        }),
                    });

                    let left_entity_vertex_id = left_entity.vertex_id(time_axis);
                    subgraph.insert(&left_entity_vertex_id, left_entity);

                    self.traverse_entity(
                        left_entity_vertex_id,
                        dependency_context,
                        subgraph,
                        GraphResolveDepths {
                            has_left_entity: EdgeResolveDepths {
                                outgoing: current_resolve_depths.has_left_entity.outgoing - 1,
                                ..current_resolve_depths.has_left_entity
                            },
                            ..current_resolve_depths
                        },
                        intersected_time_projection.clone(),
                    )
                        .await?;
                }
            }

            if current_resolve_depths.has_right_entity.outgoing > 0 {
                for right_entity in <Self as Read<Entity>>::read(
                    self,
                    &Filter::for_right_entity_by_entity_id(entity_vertex_id.base_id()),
                    &intersected_time_projection,
                )
                    .await?
                {
                    subgraph.edges.insert(Edge::KnowledgeGraph {
                        vertex_id: entity_vertex_id,
                        outward_edge: KnowledgeGraphOutwardEdges::ToKnowledgeGraph(OutwardEdge {
                            // (HasLeftEndpoint, reversed=true) is equivalent to an
                            // outgoing `Link` `Entity`
                            kind: KnowledgeGraphEdgeKind::HasRightEntity,
                            reversed: false,
                            right_endpoint: right_entity.metadata().record_id().entity_id,
                        }),
                    });

                    let right_entity_vertex_id = right_entity.vertex_id(time_axis);
                    subgraph.insert(&right_entity_vertex_id, right_entity);

                    self.traverse_entity(
                        right_entity_vertex_id,
                        dependency_context,
                        subgraph,
                        GraphResolveDepths {
                            has_right_entity: EdgeResolveDepths {
                                outgoing: current_resolve_depths.has_right_entity.outgoing - 1,
                                ..current_resolve_depths.has_right_entity
                            },
                            ..current_resolve_depths
                        },
                        intersected_time_projection.clone(),
                    )
                        .await?;
                }
            }

            Ok(())
        }
            .boxed()
    }
}

#[async_trait]
impl<C: AsClient> EntityStore for PostgresStore<C> {
    #[tracing::instrument(level = "info", skip(self, properties))]
    async fn create_entity(
        &mut self,
        owned_by_id: OwnedById,
        entity_uuid: Option<EntityUuid>,
        decision_time: Option<Timestamp<DecisionTime>>,
        updated_by_id: UpdatedById,
        archived: bool,
        entity_type_id: VersionedUri,
        properties: EntityProperties,
        link_data: Option<LinkData>,
    ) -> Result<EntityMetadata, InsertionError> {
        let entity_id = EntityId::new(
            owned_by_id,
            entity_uuid.unwrap_or_else(|| EntityUuid::new(Uuid::new_v4())),
        );

        let entity_type_ontology_id = self
            .ontology_id_by_uri(&entity_type_id)
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
                    decision_time,
                    transaction_time
                FROM
                    create_entity(
                        _owned_by_id := $1,
                        _entity_uuid := $2,
                        _decision_time := $3,
                        _record_created_by_id := $4,
                        _archived := $5,
                        _entity_type_ontology_id := $6,
                        _properties := $7,
                        _left_owned_by_id := $8,
                        _left_entity_uuid := $9,
                        _right_owned_by_id := $10,
                        _right_entity_uuid := $11,
                        _left_to_right_order := $12,
                        _right_to_left_order := $13
                    );
                "#,
                &[
                    &entity_id.owned_by_id(),
                    &entity_id.entity_uuid(),
                    &decision_time,
                    &updated_by_id,
                    &archived,
                    &entity_type_ontology_id,
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

        Ok(EntityMetadata::new(
            EntityRecordId {
                entity_id,
                edition_id: EntityEditionId::new(row.get(0)),
            },
            EntityVersion {
                decision_time: row.get(1),
                transaction_time: row.get(2),
            },
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
            Item = (
                OwnedById,
                Option<EntityUuid>,
                EntityProperties,
                Option<LinkData>,
                Option<Timestamp<DecisionTime>>,
            ),
            IntoIter: Send,
        > + Send,
        actor_id: UpdatedById,
        entity_type_id: &VersionedUri,
    ) -> Result<Vec<EntityMetadata>, InsertionError> {
        let transaction = self.transaction().await.change_context(InsertionError)?;

        let entities = entities.into_iter();
        let mut entity_ids = Vec::with_capacity(entities.size_hint().0);
        let mut entity_editions = Vec::with_capacity(entities.size_hint().0);
        let mut entity_versions = Vec::with_capacity(entities.size_hint().0);
        for (owned_by_id, entity_uuid, properties, link_data, decision_time) in entities {
            entity_ids.push((
                EntityId::new(
                    owned_by_id,
                    entity_uuid.unwrap_or_else(|| EntityUuid::new(Uuid::new_v4())),
                ),
                link_data.as_ref().map(LinkData::left_entity_id),
                link_data.as_ref().map(LinkData::right_entity_id),
            ));
            entity_editions.push((
                properties,
                link_data.as_ref().and_then(LinkData::left_to_right_order),
                link_data.as_ref().and_then(LinkData::right_to_left_order),
            ));
            entity_versions.push(decision_time);
        }

        // TODO: match on and return the relevant error
        //   https://app.asana.com/0/1200211978612931/1202574350052904/f
        transaction
            .insert_entity_ids(entity_ids.iter().copied())
            .await?;

        // Using one entity type per entity would result in more lookups, which results in a more
        // complex logic and/or be inefficient.
        // Please see the documentation for this function on the trait for more information.
        let entity_type_ontology_id = transaction
            .ontology_id_by_uri(entity_type_id)
            .await
            .change_context(InsertionError)?;

        let entity_edition_ids = transaction
            .insert_entity_records(entity_editions, entity_type_ontology_id, actor_id)
            .await?;

        let entity_versions = transaction
            .insert_entity_versions(
                entity_ids
                    .iter()
                    .copied()
                    .zip(entity_edition_ids.iter().copied())
                    .zip(entity_versions)
                    .map(|(((entity_id, ..), entity_edition_id), decision_time)| {
                        (entity_id, entity_edition_id, decision_time)
                    }),
            )
            .await?;

        transaction.commit().await.change_context(InsertionError)?;

        Ok(entity_ids
            .into_iter()
            .zip(entity_versions)
            .zip(entity_edition_ids)
            .map(|(((entity_id, ..), entity_version), edition_id)| {
                EntityMetadata::new(
                    EntityRecordId {
                        entity_id,
                        edition_id,
                    },
                    entity_version,
                    entity_type_id.clone(),
                    ProvenanceMetadata::new(actor_id),
                    false,
                )
            })
            .collect())
    }

    #[tracing::instrument(level = "info", skip(self))]
    async fn get_entity(&self, query: &StructuralQuery<Entity>) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
            time_projection: ref unresolved_time_projection,
        } = *query;

        let time_projection = unresolved_time_projection.clone().resolve();
        let time_axis = time_projection.image_time_axis();

        let mut subgraph = Subgraph::new(
            graph_resolve_depths,
            unresolved_time_projection.clone(),
            time_projection.clone(),
        );
        let mut dependency_context = DependencyContext::default();

        for entity in Read::<Entity>::read(self, filter, &time_projection).await? {
            let vertex_id = entity.vertex_id(time_axis);
            // Insert the vertex into the subgraph to avoid another lookup when traversing it
            subgraph.insert(&vertex_id, entity);

            self.traverse_entity(
                vertex_id,
                &mut dependency_context,
                &mut subgraph,
                graph_resolve_depths,
                time_projection.clone(),
            )
            .await?;

            subgraph.roots.insert(vertex_id.into());
        }

        Ok(subgraph)
    }

    #[tracing::instrument(level = "info", skip(self, properties))]
    async fn update_entity(
        &mut self,
        entity_id: EntityId,
        decision_time: Option<Timestamp<DecisionTime>>,
        updated_by_id: UpdatedById,
        archived: bool,
        entity_type_id: VersionedUri,
        properties: EntityProperties,
        link_order: EntityLinkOrder,
    ) -> Result<EntityMetadata, UpdateError> {
        let entity_type_ontology_id = self
            .ontology_id_by_uri(&entity_type_id)
            .await
            .change_context(UpdateError)?;

        let properties = serde_json::to_value(properties)
            .into_report()
            .change_context(UpdateError)?;

        // The transaction is required to check if the update happened. If there is no returned
        // row, it either means, that there was no entity with that parameters or a race condition
        // happened.
        let transaction = self.transaction().await.change_context(UpdateError)?;

        if transaction
            .as_client()
            .query_opt(
                r#"
                 SELECT EXISTS (
                    SELECT 1 FROM entity_ids WHERE owned_by_id = $1 AND entity_uuid = $2
                 );"#,
                &[&entity_id.owned_by_id(), &entity_id.entity_uuid()],
            )
            .await
            .into_report()
            .change_context(UpdateError)?
            .is_none()
        {
            return Err(Report::new(EntityDoesNotExist)
                .attach(entity_id)
                .change_context(UpdateError));
        }

        let row = transaction
            .as_client()
            .query_one(
                r#"
                SELECT
                    entity_edition_id,
                    decision_time,
                    transaction_time
                FROM
                    update_entity(
                        _owned_by_id := $1,
                        _entity_uuid := $2,
                        _decision_time := $3,
                        _record_created_by_id := $4,
                        _archived := $5,
                        _entity_type_ontology_id := $6,
                        _properties := $7,
                        _left_to_right_order := $8,
                        _right_to_left_order := $9
                    );
                "#,
                &[
                    &entity_id.owned_by_id(),
                    &entity_id.entity_uuid(),
                    &decision_time,
                    &updated_by_id,
                    &archived,
                    &entity_type_ontology_id,
                    &properties,
                    &link_order.left_to_right(),
                    &link_order.right_to_left(),
                ],
            )
            .await
            .into_report()
            .map_err(|report| match report.current_context().code() {
                Some(&SqlState::RESTRICT_VIOLATION) => report
                    .change_context(RaceConditionOnUpdate)
                    .attach(entity_id)
                    .change_context(UpdateError),
                _ => report.change_context(UpdateError).attach(entity_id),
            })?;

        transaction.commit().await.change_context(UpdateError)?;

        Ok(EntityMetadata::new(
            EntityRecordId {
                entity_id,
                edition_id: EntityEditionId::new(row.get(0)),
            },
            EntityVersion {
                decision_time: row.get(1),
                transaction_time: row.get(2),
            },
            entity_type_id,
            ProvenanceMetadata::new(updated_by_id),
            archived,
        ))
    }
}
