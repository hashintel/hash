mod read;

use async_trait::async_trait;
use error_stack::{IntoReport, Report, Result, ResultExt};
use tokio_postgres::GenericClient;
use uuid::Uuid;

use crate::{
    knowledge::{Entity, EntityId, PersistedEntityIdentifier},
    ontology::{types::uri::VersionedUri, AccountId},
    store::{
        error::EntityDoesNotExist, AsClient, EntityStore, InsertionError, PostgresStore,
        UpdateError,
    },
};

#[async_trait]
impl<C: AsClient> EntityStore for PostgresStore<C> {
    async fn create_entity(
        &mut self,
        entity: &Entity,
        entity_type_uri: VersionedUri,
        created_by: AccountId,
    ) -> Result<PersistedEntityIdentifier, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        let entity_id = EntityId::new(Uuid::new_v4());

        transaction.insert_entity_id(entity_id).await?;
        let identifier = transaction
            .insert_entity(entity_id, entity, entity_type_uri, created_by)
            .await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(identifier)
    }

    async fn update_entity(
        &mut self,
        entity_id: EntityId,
        entity: &Entity,
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
