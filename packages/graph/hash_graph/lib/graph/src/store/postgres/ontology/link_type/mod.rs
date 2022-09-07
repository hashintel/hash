mod resolve;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::GenericClient;
use type_system::LinkType;

use crate::{
    ontology::{AccountId, PersistedOntologyIdentifier},
    store::{AsClient, InsertionError, LinkTypeStore, PostgresStore, UpdateError},
};

#[async_trait]
impl<C: AsClient> LinkTypeStore for PostgresStore<C> {
    async fn create_link_type(
        &mut self,
        link_type: LinkType,
        created_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        let (_, identifier) = transaction.create(link_type, created_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(identifier)
    }

    async fn update_link_type(
        &mut self,
        link_type: LinkType,
        updated_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        let (_, identifier) = transaction.update(link_type, updated_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(identifier)
    }
}
