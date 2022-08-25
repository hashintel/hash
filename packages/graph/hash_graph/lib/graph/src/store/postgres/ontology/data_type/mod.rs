mod read;

use std::sync::Arc;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::{GenericClient, RowStream};
use type_system::DataType;

use crate::{
    ontology::{AccountId, PersistedDataType, PersistedOntologyIdentifier},
    store::{
        crud::Read,
        postgres::{
            ontology::{data_type::read::PostgresDataTypeResolver, OntologyDatabaseType},
            parameter_list,
        },
        query::{Expression, ExpressionResolver, Literal, Path},
        AsClient, DataTypeStore, InsertionError, PostgresStore, QueryError, UpdateError,
    },
};

#[async_trait]
impl<C: AsClient> DataTypeStore for PostgresStore<C> {
    async fn create_data_type(
        &mut self,
        data_type: &DataType,
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
        data_type: &DataType,
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

async fn read_data_types(client: &(impl GenericClient + Sync)) -> Result<RowStream, QueryError> {
    client
        .query_raw(
            r#"
            SELECT schema, created_by, MAX(version) OVER (PARTITION by base_uri) = version as latest
            FROM data_types
            INNER JOIN ids
	        ON data_types.version_id = ids.version_id
            ORDER BY base_uri, version DESC;
            "#,
            parameter_list([]),
        )
        .await
        .into_report()
        .change_context(QueryError)
}

#[async_trait]
impl<C: AsClient> Read<PersistedDataType> for PostgresStore<C> {
    type Query<'q> = Expression;

    async fn read<'query>(
        &self,
        query: &Self::Query<'query>,
    ) -> Result<Vec<PersistedDataType>, QueryError> {
        let mut resolver = Arc::new(PostgresDataTypeResolver::new(self.as_client()));
        resolver.resolve(query).await
    }
}
