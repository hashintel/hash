mod read;
mod resolve;

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use futures::{stream, StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::uri::VersionedUri;
use uuid::Uuid;

use crate::{
    knowledge::{
        Entity, EntityId, EntityQuery, EntityRootedSubgraph, PersistedEntity,
        PersistedEntityIdentifier,
    },
    ontology::AccountId,
    store::{
        crud::Read,
        error::EntityDoesNotExist,
        postgres::{ontology::EntityTypeDependencyContext, DependencyMap},
        AsClient, EntityStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
};

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
        } = *query;

        stream::iter(Read::<PersistedEntity>::read(self, expression).await?)
            .then(|entity: PersistedEntity| async {
                let mut referenced_data_types = DependencyMap::new();
                let mut referenced_property_types = DependencyMap::new();
                let mut referenced_link_types = DependencyMap::new();
                let mut referenced_entity_types = DependencyMap::new();

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

                Ok(EntityRootedSubgraph {
                    entity,
                    referenced_data_types: referenced_data_types.into_vec(),
                    referenced_property_types: referenced_property_types.into_vec(),
                    referenced_link_types: referenced_link_types.into_vec(),
                    referenced_entity_types: referenced_entity_types.into_vec(),
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
