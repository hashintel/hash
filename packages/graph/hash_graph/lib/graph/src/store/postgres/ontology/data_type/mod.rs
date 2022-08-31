pub mod read;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::GenericClient;
use type_system::DataType;

use crate::{
    ontology::{AccountId, PersistedDataType, PersistedOntologyIdentifier},
    store::{
        crud::Read,
        postgres::resolve::{PostgresContext, Record},
        query::{Expression, Literal},
        AsClient, DataTypeStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
};

#[async_trait]
impl<C: AsClient> DataTypeStore for PostgresStore<C> {
    async fn create_data_type(
        &mut self,
        data_type: DataType,
        created_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, InsertionError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(InsertionError)?,
        );

        let (_, identifier) = transaction.create(data_type, created_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(InsertionError)?;

        Ok(identifier)
    }

    async fn update_data_type(
        &mut self,
        data_type: DataType,
        updated_by: AccountId,
    ) -> Result<PersistedOntologyIdentifier, UpdateError> {
        let transaction = PostgresStore::new(
            self.as_mut_client()
                .transaction()
                .await
                .into_report()
                .change_context(UpdateError)?,
        );

        let (_, identifier) = transaction.update(data_type, updated_by).await?;

        transaction
            .client
            .commit()
            .await
            .into_report()
            .change_context(UpdateError)?;

        Ok(identifier)
    }
}

// TODO: Unify methods for Ontology types using `Expression`s
//   see https://app.asana.com/0/0/1202884883200959/f
#[async_trait]
impl<C: AsClient> Read<PersistedDataType> for PostgresStore<C> {
    type Query<'q> = Expression;

    async fn read<'query>(
        &self,
        expression: &Self::Query<'query>,
    ) -> Result<Vec<PersistedDataType>, QueryError> {
        self.read_all_data_types()
            .await?
            .map(|row_result| row_result.into_report().change_context(QueryError))
            .try_filter_map(|row| async move {
                let data_type: DataType = serde_json::Value::try_into(row.get(0))
                    .into_report()
                    .change_context(QueryError)?;

                let versioned_data_type = Record {
                    record: data_type,
                    is_latest: row.get(2),
                };

                if let Literal::Bool(result) = expression.evaluate(&versioned_data_type, self).await
                {
                    Ok(result.then(|| {
                        let uri = versioned_data_type.record.id();
                        let account_id: AccountId = row.get(1);
                        let identifier = PersistedOntologyIdentifier::new(uri.clone(), account_id);
                        PersistedDataType {
                            inner: versioned_data_type.record,
                            identifier,
                        }
                    }))
                } else {
                    // TODO: Implement error handling
                    //   see https://app.asana.com/0/0/1202884883200968/f
                    panic!("Expression does not result in a boolean value")
                }
            })
            .try_collect()
            .await
    }
}
