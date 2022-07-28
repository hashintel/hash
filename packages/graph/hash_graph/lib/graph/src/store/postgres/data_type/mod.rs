use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::GenericClient;

use crate::{
    ontology::{types::DataType, AccountId},
    store::{AsClient, DataTypeStore, InsertionError, PostgresStore, UpdateError},
};

#[async_trait]
impl<C: AsClient> DataTypeStore for PostgresStore<C> {
    async fn create_data_type(
        &mut self,
        data_type: &DataType,
        created_by: AccountId,
    ) -> Result<(), InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .report()
                .change_context(InsertionError)?,
        );

        transaction.create(data_type, created_by).await?;

        transaction
            .client
            .commit()
            .await
            .report()
            .change_context(InsertionError)?;

        Ok(())
    }

    async fn update_data_type(
        &mut self,
        data_type: &DataType,
        updated_by: AccountId,
    ) -> Result<(), UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .report()
                .change_context(UpdateError)?,
        );

        transaction.update(data_type, updated_by).await?;

        transaction
            .client
            .commit()
            .await
            .report()
            .change_context(UpdateError)?;

        Ok(())
    }
}
