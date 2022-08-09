use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::GenericClient;

use crate::{
    ontology::AccountId,
    store::{AsClient, InsertionError, LinkTypeStore, PostgresStore, UpdateError},
    LinkType,
};

#[async_trait]
impl<C: AsClient> LinkTypeStore for PostgresStore<C> {
    async fn create_link_type(
        &mut self,
        link_type: &LinkType,
        created_by: AccountId,
    ) -> Result<(), InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        transaction.create(link_type, created_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(())
    }

    async fn update_link_type(
        &mut self,
        link_type: &LinkType,
        updated_by: AccountId,
    ) -> Result<(), UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        transaction.update(link_type, updated_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(())
    }
}
