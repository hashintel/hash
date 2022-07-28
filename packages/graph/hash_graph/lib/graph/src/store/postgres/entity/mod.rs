mod read;

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use tokio_postgres::GenericClient;
use uuid::Uuid;

use crate::{
    ontology::AccountId,
    store::{
        error::EntityDoesNotExist, AsClient, EntityStore, InsertionError, PostgresStore,
        UpdateError,
    },
    Entity, EntityId, VersionedUri,
};

#[async_trait]
impl<C: AsClient> EntityStore for PostgresStore<C> {
    async fn create_entity(
        &mut self,
        entity: &Entity,
        entity_type_uri: VersionedUri,
        created_by: AccountId,
    ) -> Result<EntityId, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .report()
                .change_context(InsertionError)?,
        );

        let entity_id = EntityId::new(Uuid::new_v4());

        transaction.insert_entity_id(entity_id).await?;
        transaction
            .insert_entity(entity_id, entity, entity_type_uri, created_by)
            .await?;

        transaction
            .client
            .commit()
            .await
            .report()
            .change_context(InsertionError)?;

        Ok(entity_id)
    }

    async fn update_entity(
        &mut self,
        entity_id: EntityId,
        entity: &Entity,
        entity_type_uri: VersionedUri,
        updated_by: AccountId,
    ) -> Result<(), UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .report()
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

        transaction
            .insert_entity(entity_id, entity, entity_type_uri, updated_by)
            .await
            .change_context(UpdateError)?;

        transaction
            .client
            .commit()
            .await
            .report()
            .change_context(UpdateError)?;

        Ok(())
    }
}
