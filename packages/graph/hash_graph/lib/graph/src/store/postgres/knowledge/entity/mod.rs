mod read;
mod resolve;

use std::{collections::HashMap, future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use futures::{stream, FutureExt, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::uri::VersionedUri;
use uuid::Uuid;

use crate::{
    knowledge::{
        Entity, EntityId, EntityRootedSubgraph, PersistedEntity, PersistedEntityMetadata,
        PersistedLink,
    },
    ontology::{AccountId, StructuralQuery},
    store::{
        crud::Read,
        error::EntityDoesNotExist,
        postgres::{context::PostgresContext, DependencyContext, DependencyMap, DependencySet},
        AsClient, EntityStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
    subgraph::GraphResolveDepths,
};

impl<C: AsClient> PostgresStore<C> {
    /// Internal method to read an [`Entity`] into a [`DependencyMap`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) fn get_entity_as_dependency<'a>(
        &'a self,
        entity_id: EntityId,
        context: DependencyContext<'a>,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'a>> {
        let DependencyContext {
            edges,
            referenced_data_types,
            referenced_property_types,
            referenced_link_types,
            referenced_entity_types,
            linked_entities,
            links,
            graph_resolve_depths,
        } = context;

        async move {
            let unresolved_entity = linked_entities
                .insert(
                    &entity_id,
                    context
                        .graph_resolve_depths
                        .link_target_entity_resolve_depth,
                    || async {
                        Ok(PersistedEntity::from(
                            self.read_latest_entity_by_id(entity_id).await?,
                        ))
                    },
                )
                .await?;

            if let Some(entity) = unresolved_entity {
                let entity_type_id = entity.metadata().entity_type_id().clone();
                if graph_resolve_depths.entity_type_resolve_depth > 0 {
                    self.get_entity_type_as_dependency(&entity_type_id, DependencyContext {
                        graph_resolve_depths: GraphResolveDepths {
                            entity_type_resolve_depth: context
                                .graph_resolve_depths
                                .entity_type_resolve_depth
                                - 1,
                            ..graph_resolve_depths
                        },
                        edges,
                        referenced_data_types,
                        referenced_property_types,
                        referenced_link_types,
                        referenced_entity_types,
                        linked_entities,
                        links,
                    })
                    .await?;
                }

                if graph_resolve_depths.link_resolve_depth > 0 {
                    for link_record in self
                        .read_links_by_source(entity_id)
                        .await?
                        .try_collect::<Vec<_>>()
                        .await?
                    {
                        let link = PersistedLink::from(link_record);

                        self.get_link_as_dependency(&link, DependencyContext {
                            graph_resolve_depths: GraphResolveDepths {
                                link_resolve_depth: graph_resolve_depths.link_resolve_depth - 1,
                                ..graph_resolve_depths
                            },
                            edges,
                            referenced_data_types,
                            referenced_property_types,
                            referenced_link_types,
                            referenced_entity_types,
                            linked_entities,
                            links,
                        })
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
        entity: Entity,
        entity_type_id: VersionedUri,
        owned_by_id: AccountId,
        entity_id: Option<EntityId>,
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
            .insert_entity(entity_id, entity, entity_type_id, owned_by_id)
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
        owned_by_id: AccountId,
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

    async fn get_entity(
        &self,
        query: &StructuralQuery,
    ) -> Result<Vec<EntityRootedSubgraph>, QueryError> {
        let StructuralQuery {
            ref expression,
            graph_resolve_depths,
        } = *query;

        stream::iter(Read::<PersistedEntity>::read(self, expression).await?)
            .then(|entity| async move {
                let mut edges = HashMap::new();
                let mut referenced_data_types = DependencyMap::new();
                let mut referenced_property_types = DependencyMap::new();
                let mut referenced_link_types = DependencyMap::new();
                let mut referenced_entity_types = DependencyMap::new();
                let mut linked_entities = DependencyMap::new();
                let mut links = DependencySet::new();

                self.get_entity_as_dependency(
                    entity.metadata().identifier().entity_id(),
                    DependencyContext {
                        edges: &mut edges,
                        referenced_data_types: &mut referenced_data_types,
                        referenced_property_types: &mut referenced_property_types,
                        referenced_link_types: &mut referenced_link_types,
                        referenced_entity_types: &mut referenced_entity_types,
                        linked_entities: &mut linked_entities,
                        links: &mut links,
                        graph_resolve_depths,
                    },
                )
                .await?;

                let root = linked_entities
                    .remove(&entity.metadata().identifier().entity_id())
                    .expect("root was not added to the subgraph");

                Ok(EntityRootedSubgraph {
                    entity: root,
                    referenced_data_types: referenced_data_types.into_vec(),
                    referenced_property_types: referenced_property_types.into_vec(),
                    referenced_link_types: referenced_link_types.into_vec(),
                    referenced_entity_types: referenced_entity_types.into_vec(),
                    linked_entities: linked_entities.into_vec(),
                    links: links.into_vec(),
                })
            })
            .try_collect()
            .await
    }

    async fn update_entity(
        &mut self,
        entity_id: EntityId,
        entity: Entity,
        entity_type_id: VersionedUri,
        updated_by: AccountId,
    ) -> Result<PersistedEntityMetadata, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        if !transaction
            .contains_entity(entity_id)
            .await
            .change_context(UpdateError)?
        {
            return Err(Report::new(EntityDoesNotExist)
                .attach_printable(entity_id)
                .change_context(UpdateError));
        }

        let metadata = transaction
            .insert_entity(entity_id, entity, entity_type_id, updated_by)
            .await
            .change_context(UpdateError)?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(metadata)
    }
}
