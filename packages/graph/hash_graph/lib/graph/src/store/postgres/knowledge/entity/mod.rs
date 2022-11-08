mod read;

use std::{future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use futures::{stream, FutureExt, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::uri::VersionedUri;
use uuid::Uuid;

use crate::{
    identifier::{EntityIdentifier, GraphElementEditionIdentifier},
    knowledge::{
        Entity, EntityId, LinkEntityMetadata, PersistedEntity, PersistedEntityIdentifier,
        PersistedEntityMetadata,
    },
    provenance::{CreatedById, OwnedById, UpdatedById},
    store::{
        crud::Read,
        error::ArchivalError,
        postgres::{DependencyContext, DependencyContextRef, HistoricMove},
        query::Filter,
        AsClient, EntityStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
    subgraph::{
        GenericOutwardEdge, GraphResolveDepths, KnowledgeGraphOutwardEdges, OutwardEdge,
        SharedEdgeKind, StructuralQuery, Subgraph,
    },
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read an [`Entity`] into a [`DependencyContext`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) fn get_entity_as_dependency<'a: 'b, 'b>(
        &'a self,
        entity_edition_identifier: &'b PersistedEntityIdentifier,
        mut dependency_context: DependencyContextRef<'b>,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'b>> {
        async move {
            let unresolved_entity = dependency_context
                .linked_entities
                .insert_with(
                    &entity_edition_identifier,
                    Some(dependency_context.graph_resolve_depths.entity_resolve_depth),
                    || async {
                        self.read_one(&Filter::for_entity_by_entity_id_and_entity_version(
                            entity_edition_identifier,
                        ))
                        .await
                    },
                )
                .await?;

            if let Some(entity) = unresolved_entity {
                // Cloning the entity type ID avoids multiple borrow errors which would otherwise
                // require us to clone the entity
                let entity_type_id = entity.metadata().entity_type_id().clone();

                if dependency_context
                    .graph_resolve_depths
                    .entity_type_resolve_depth
                    > 0
                {
                    self.get_entity_type_as_dependency(
                        &entity_type_id,
                        dependency_context.change_depth(GraphResolveDepths {
                            entity_type_resolve_depth: dependency_context
                                .graph_resolve_depths
                                .entity_type_resolve_depth
                                - 1,
                            ..dependency_context.graph_resolve_depths
                        }),
                    )
                    .await?;
                }

                dependency_context.edges.insert(
                    GraphElementEditionIdentifier::KnowledgeGraphElementEditionId(
                        entity_edition_identifier.clone(),
                    ),
                    OutwardEdge::KnowledgeGraph(KnowledgeGraphOutwardEdges::ToOntology(
                        GenericOutwardEdge {
                            kind: SharedEdgeKind::IsOfType,
                            reversed: false,
                            endpoint: entity_type_id,
                        },
                    )),
                );
                // TODO: Subgraphs don't support link entities yet
                //   https://app.asana.com/0/1200211978612931/1203250001255262/f

                // for link_record in self
                //     .read_links_by_source(entity_id)
                //     .await?
                //     .try_collect::<Vec<_>>()
                //     .await?
                // {
                //     dependency_context.edges.insert(
                //         GraphElementIdentifier::KnowledgeGraphElementId(entity_id),
                //         OutwardEdge {
                //             edge_kind: EdgeKind::HasLink,
                //             destination: GraphElementIdentifier::Temporary(LinkId {
                //                 source_entity_id: link_record.source_entity_id,
                //                 target_entity_id: link_record.target_entity_id,
                //                 link_type_id: link_record.link_type_id.clone(),
                //             }),
                //         },
                //     );
                //
                //     if dependency_context.graph_resolve_depths.link_resolve_depth > 0 {
                //         let link = PersistedLink::from(link_record);
                //
                //         self.get_link_as_dependency(
                //             &link,
                //             dependency_context.change_depth(GraphResolveDepths {
                //                 link_resolve_depth: dependency_context
                //                     .graph_resolve_depths
                //                     .link_resolve_depth
                //                     - 1,
                //                 ..dependency_context.graph_resolve_depths
                //             }),
                //         )
                //         .await?;
                //     }
                // }
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
        entity: Entity,
        entity_type_id: VersionedUri,
        owned_by_id: OwnedById,
        entity_id: Option<EntityId>,
        created_by_id: CreatedById,
        link_metadata: Option<LinkEntityMetadata>,
    ) -> Result<PersistedEntityMetadata, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        let entity_id = entity_id.unwrap_or_else(|| EntityId::new(Uuid::new_v4()));

        // TODO: match on and return the relevant error
        //   https://app.asana.com/0/1200211978612931/1202574350052904/f
        transaction.insert_entity_id(entity_id).await?;
        let metadata = transaction
            .insert_entity(
                EntityIdentifier::new(owned_by_id, entity_id),
                entity,
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
        entities: impl IntoIterator<Item = (Option<EntityId>, Entity), IntoIter: Send> + Send,
        entity_type_id: VersionedUri,
        owned_by_id: OwnedById,
        actor_id: CreatedById,
    ) -> Result<Vec<EntityId>, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        let (entity_ids, entities): (Vec<_>, Vec<_>) = entities
            .into_iter()
            .map(|(id, entity)| (id.unwrap_or_else(|| EntityId::new(Uuid::new_v4())), entity))
            .unzip();

        // TODO: match on and return the relevant error
        //   https://app.asana.com/0/1200211978612931/1202574350052904/f
        transaction
            .insert_entity_ids(entity_ids.iter().copied())
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
                entity_ids.iter().copied(),
                entities,
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

        Ok(entity_ids)
    }

    async fn get_entity<'f: 'q, 'q>(
        &self,
        query: &'f StructuralQuery<'q, Entity>,
    ) -> Result<Subgraph, QueryError> {
        let StructuralQuery {
            ref filter,
            graph_resolve_depths,
        } = *query;

        let subgraphs = stream::iter(Read::<PersistedEntity>::read(self, filter).await?)
            .then(|entity| async move {
                let mut dependency_context = DependencyContext::new(graph_resolve_depths);

                let entity_edition_identifier = entity.metadata().identifier().clone();
                dependency_context
                    .linked_entities
                    .insert(&entity_edition_identifier, None, entity);

                self.get_entity_as_dependency(
                    &entity_edition_identifier,
                    dependency_context.as_ref_object(),
                )
                .await?;

                let root = GraphElementEditionIdentifier::KnowledgeGraphElementEditionId(
                    entity_edition_identifier,
                );

                Ok::<_, Report<QueryError>>(dependency_context.into_subgraph(vec![root]))
            })
            .try_collect::<Vec<_>>()
            .await?;

        let mut subgraph = Subgraph::new(graph_resolve_depths);
        subgraph.extend(subgraphs);

        Ok(subgraph)
    }

    async fn update_entity(
        &mut self,
        entity_identifier: EntityIdentifier,
        entity: Entity,
        entity_type_id: VersionedUri,
        updated_by_id: UpdatedById,
    ) -> Result<PersistedEntityMetadata, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        transaction
            .lock_latest_entity_for_update(entity_identifier)
            .await
            .change_context(UpdateError)?;

        let old_entity_metadata = transaction
            .move_latest_entity_to_histories(entity_identifier, HistoricMove::ForNewVersion)
            .await
            .change_context(UpdateError)?;

        let entity_metadata = transaction
            .insert_entity(
                entity_identifier,
                entity,
                entity_type_id,
                old_entity_metadata.created_by_id(),
                updated_by_id,
                old_entity_metadata.link_metadata(),
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
        entity_identifier: EntityIdentifier,
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
            .lock_latest_entity_for_update(entity_identifier)
            .await
            .change_context(ArchivalError)?;

        // Prepare to create a new history entry to mark archival
        let old_entity: PersistedEntity = transaction
            .read_one(&Filter::for_latest_entity_by_entity_id(entity_identifier))
            .await
            .change_context(ArchivalError)?;

        // Move current latest edition to the historic table
        transaction
            .move_latest_entity_to_histories(entity_identifier, HistoricMove::ForNewVersion)
            .await
            .change_context(ArchivalError)?;

        // Insert latest edition to be the historic archival marker
        transaction
            .insert_entity(
                entity_identifier,
                old_entity.inner().clone(),
                old_entity.metadata().entity_type_id().clone(),
                old_entity.metadata().created_by_id(),
                actor_id,
                old_entity.metadata().link_metadata(),
            )
            .await
            .change_context(ArchivalError)?;

        // Archive latest edition, leaving nothing from the entity behind.
        transaction
            .move_latest_entity_to_histories(entity_identifier, HistoricMove::ForArchival)
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
