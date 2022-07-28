use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::GenericClient;

use crate::{
    ontology::AccountId,
    store::{AsClient, EntityTypeStore, InsertionError, PostgresStore, UpdateError},
    EntityType,
};

#[async_trait]
impl<C: AsClient> EntityTypeStore for PostgresStore<C> {
    async fn create_entity_type(
        &mut self,
        entity_type: &EntityType,
        created_by: AccountId,
    ) -> Result<(), InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .report()
                .change_context(InsertionError)?,
        );

        let version_id = transaction.create(entity_type, created_by).await?;

        transaction
            .insert_entity_type_references(entity_type, version_id)
            .await
            .change_context(InsertionError)
            .attach_printable("Could not insert references for entity type")
            .attach_lazy(|| entity_type.clone())?;

        transaction
            .client
            .commit()
            .await
            .report()
            .change_context(InsertionError)?;

        Ok(())
    }

    async fn update_entity_type(
        &mut self,
        entity_type: &EntityType,
        updated_by: AccountId,
    ) -> Result<(), UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .report()
                .change_context(UpdateError)?,
        );

        let version_id = transaction.update(entity_type, updated_by).await?;

        transaction
            .insert_entity_type_references(entity_type, version_id)
            .await
            .change_context(UpdateError)
            .attach_printable("Could not insert references for entity type")
            .attach_lazy(|| entity_type.clone())?;

        transaction
            .client
            .commit()
            .await
            .report()
            .change_context(UpdateError)?;

        Ok(())
    }
}
