mod read;
mod resolve;

use std::{future::Future, pin::Pin};

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use futures::{stream, FutureExt, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::uri::{BaseUri, VersionedUri};
use uuid::Uuid;

use crate::{
    knowledge::{
        Entity, EntityId, EntityQuery, EntityRootedSubgraph, PersistedEntity,
        PersistedEntityIdentifier,
    },
    ontology::{
        AccountId, PersistedDataType, PersistedEntityType, PersistedLinkType,
        PersistedPropertyType, QueryDepth,
    },
    store::{
        crud::Read,
        error::EntityDoesNotExist,
        postgres::{
            context::PostgresContext,
            ontology::{EntityTypeDependencyContext, LinkTypeDependencyContext},
            parameter_list, DependencyMap,
        },
        AsClient, EntityStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
};

pub struct EntityDependencyContext<'a> {
    pub referenced_data_types: &'a mut DependencyMap<VersionedUri, PersistedDataType>,
    pub referenced_property_types: &'a mut DependencyMap<VersionedUri, PersistedPropertyType>,
    pub referenced_link_types: &'a mut DependencyMap<VersionedUri, PersistedLinkType>,
    pub referenced_entity_types: &'a mut DependencyMap<VersionedUri, PersistedEntityType>,
    pub linked_entities: &'a mut DependencyMap<EntityId, PersistedEntity>,
    pub data_type_query_depth: QueryDepth,
    pub property_type_query_depth: QueryDepth,
    pub link_type_query_depth: QueryDepth,
    pub entity_type_query_depth: QueryDepth,
    pub linked_entity_query_depth: QueryDepth,
}

impl<C: AsClient> PostgresStore<C> {
    /// Returns the linked [`EntityId`]s and the corresponding [`LinkType`] with the provided
    /// `entity_id` as source entity.
    ///
    /// [`LinkType`]: type_system::LinkType
    async fn get_linked_entities(
        &self,
        entity_id: EntityId,
    ) -> Result<Vec<(EntityId, VersionedUri)>, QueryError> {
        self.as_client()
            .query_raw(
                r#"
                SELECT target_entity_id, type_ids.base_uri, type_ids.version
                FROM links
                INNER JOIN type_ids ON type_ids.version_id = link_type_version_id
                WHERE source_entity_id = $1;
                "#,
                parameter_list([&entity_id]),
            )
            .await
            .into_report()
            .change_context(QueryError)?
            .map_err(|error| Report::new(error).change_context(QueryError))
            .map_ok(|row| {
                let entity_id: EntityId = row.get(0);
                let link_type_base_uri: String = row.get(1);
                let link_type_version: i64 = row.get(2);

                (
                    entity_id,
                    VersionedUri::new(
                        BaseUri::new(link_type_base_uri).expect("invalid base URI for link type"),
                        link_type_version as u32,
                    ),
                )
            })
            .try_collect()
            .await
    }

    /// Internal method to read a [`PersistedDataType`] into a [`DependencyMap`].
    ///
    /// This is used to recursively resolve a type, so the result can be reused.
    pub(crate) fn get_entity_as_dependency<'a>(
        &'a self,
        entity_id: EntityId,
        context: EntityDependencyContext<'a>,
    ) -> Pin<Box<dyn Future<Output = Result<(), QueryError>> + Send + 'a>> {
        let EntityDependencyContext {
            referenced_data_types,
            referenced_property_types,
            referenced_link_types,
            referenced_entity_types,
            linked_entities,
            data_type_query_depth,
            property_type_query_depth,
            link_type_query_depth,
            entity_type_query_depth,
            linked_entity_query_depth,
        } = context;

        async move {
            let unresolved_entity = linked_entities
                .insert(&entity_id, entity_type_query_depth, || async {
                    Ok(PersistedEntity::from(
                        self.read_latest_entity_by_id(entity_id).await?,
                    ))
                })
                .await?;

            if let Some(entity) = unresolved_entity {
                if entity_type_query_depth > 0 {
                    self.get_entity_type_as_dependency(
                        entity.type_versioned_uri(),
                        EntityTypeDependencyContext {
                            referenced_data_types,
                            referenced_property_types,
                            referenced_link_types,
                            referenced_entity_types,
                            data_type_query_depth,
                            property_type_query_depth,
                            link_type_query_depth,
                            entity_type_query_depth: entity_type_query_depth - 1,
                        },
                    )
                    .await?;
                }

                if linked_entity_query_depth > 0 || link_type_query_depth > 0 {
                    for (source_entity_id, link_type_uri) in
                        self.get_linked_entities(entity_id).await?
                    {
                        if linked_entity_query_depth > 0 {
                            self.get_entity_as_dependency(
                                source_entity_id,
                                EntityDependencyContext {
                                    referenced_data_types,
                                    referenced_property_types,
                                    referenced_link_types,
                                    referenced_entity_types,
                                    linked_entities,
                                    data_type_query_depth,
                                    property_type_query_depth,
                                    link_type_query_depth,
                                    entity_type_query_depth,
                                    linked_entity_query_depth: linked_entity_query_depth - 1,
                                },
                            )
                            .await?;
                        }

                        if link_type_query_depth > 0 {
                            self.get_link_type_as_dependency(
                                &link_type_uri,
                                LinkTypeDependencyContext {
                                    referenced_link_types,
                                    link_type_query_depth: link_type_query_depth - 1,
                                },
                            )
                            .await?;
                        }
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
        entity_type_uri: VersionedUri,
        owned_by_id: AccountId,
        entity_id: Option<EntityId>,
    ) -> Result<PersistedEntityIdentifier, InsertionError> {
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
        let identifier = transaction
            .insert_entity(entity_id, entity, entity_type_uri, owned_by_id)
            .await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(identifier)
    }

    async fn get_entity(
        &self,
        query: &EntityQuery,
    ) -> Result<Vec<EntityRootedSubgraph>, QueryError> {
        let EntityQuery {
            ref expression,
            data_type_query_depth,
            property_type_query_depth,
            link_type_query_depth,
            entity_type_query_depth,
            linked_entity_query_depth,
        } = *query;

        stream::iter(Read::<PersistedEntity>::read(self, expression).await?)
            .then(|entity: PersistedEntity| async {
                let mut referenced_data_types = DependencyMap::new();
                let mut referenced_property_types = DependencyMap::new();
                let mut referenced_link_types = DependencyMap::new();
                let mut referenced_entity_types = DependencyMap::new();
                let mut linked_entities = DependencyMap::new();

                if entity_type_query_depth > 0 {
                    self.get_entity_type_as_dependency(
                        entity.type_versioned_uri(),
                        EntityTypeDependencyContext {
                            referenced_data_types: &mut referenced_data_types,
                            referenced_property_types: &mut referenced_property_types,
                            referenced_link_types: &mut referenced_link_types,
                            referenced_entity_types: &mut referenced_entity_types,
                            data_type_query_depth,
                            property_type_query_depth,
                            link_type_query_depth,
                            entity_type_query_depth: entity_type_query_depth - 1,
                        },
                    )
                    .await?;
                }

                if linked_entity_query_depth > 0 || link_type_query_depth > 0 {
                    for (source_entity_id, link_type_uri) in self
                        .get_linked_entities(entity.identifier().entity_id())
                        .await?
                    {
                        if linked_entity_query_depth > 0 {
                            self.get_entity_as_dependency(
                                source_entity_id,
                                EntityDependencyContext {
                                    referenced_data_types: &mut referenced_data_types,
                                    referenced_property_types: &mut referenced_property_types,
                                    referenced_link_types: &mut referenced_link_types,
                                    referenced_entity_types: &mut referenced_entity_types,
                                    linked_entities: &mut linked_entities,
                                    data_type_query_depth,
                                    property_type_query_depth,
                                    link_type_query_depth,
                                    entity_type_query_depth,
                                    linked_entity_query_depth: linked_entity_query_depth - 1,
                                },
                            )
                            .await?;
                        }

                        if link_type_query_depth > 0 {
                            self.get_link_type_as_dependency(
                                &link_type_uri,
                                LinkTypeDependencyContext {
                                    referenced_link_types: &mut referenced_link_types,
                                    link_type_query_depth: link_type_query_depth - 1,
                                },
                            )
                            .await?;
                        }
                    }
                }

                Ok(EntityRootedSubgraph {
                    entity,
                    referenced_data_types: referenced_data_types.into_vec(),
                    referenced_property_types: referenced_property_types.into_vec(),
                    referenced_link_types: referenced_link_types.into_vec(),
                    referenced_entity_types: referenced_entity_types.into_vec(),
                    linked_entities: linked_entities.into_vec(),
                })
            })
            .try_collect()
            .await
    }

    async fn update_entity(
        &mut self,
        entity_id: EntityId,
        entity: Entity,
        entity_type_uri: VersionedUri,
        updated_by: AccountId,
    ) -> Result<PersistedEntityIdentifier, UpdateError> {
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

        let identifier = transaction
            .insert_entity(entity_id, entity, entity_type_uri, updated_by)
            .await
            .change_context(UpdateError)?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(identifier)
    }
}
