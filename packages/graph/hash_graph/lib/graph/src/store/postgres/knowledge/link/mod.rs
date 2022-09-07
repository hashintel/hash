mod read;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::GenericClient;

use crate::{
    knowledge::Link,
    ontology::AccountId,
    store::{error::LinkRemovalError, AsClient, InsertionError, LinkStore, PostgresStore},
};

#[async_trait]
impl<C: AsClient> LinkStore for PostgresStore<C> {
    async fn create_link(
        &mut self,
        link: &Link,
        created_by: AccountId,
    ) -> Result<(), InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        transaction.insert_link(link, created_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(())
    }

    async fn remove_link(
        &mut self,
        link: &Link,
        created_by: AccountId,
    ) -> Result<(), LinkRemovalError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(LinkRemovalError)?,
        );

        transaction.move_link_to_history(link, created_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(LinkRemovalError)?;

        Ok(())
    }
}
