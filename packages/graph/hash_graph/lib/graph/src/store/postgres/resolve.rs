use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::{GenericClient, RowStream};
use type_system::{uri::VersionedUri, DataType};

use crate::store::{postgres::parameter_list, AsClient, PostgresStore, QueryError};

#[async_trait]
pub trait PostgresContext {
    async fn read_data_types(&self) -> Result<RowStream, QueryError>;
    async fn read_versioned_data_type(
        &self,
        uri: &VersionedUri,
    ) -> Result<Record<DataType>, QueryError>;
    async fn read_property_types(&self) -> Result<RowStream, QueryError>;
}

#[async_trait]
impl<T> PostgresContext for &T
where
    T: PostgresContext + Sync,
{
    async fn read_data_types(&self) -> Result<RowStream, QueryError> {
        PostgresContext::read_data_types(*self).await
    }

    async fn read_versioned_data_type(
        &self,
        uri: &VersionedUri,
    ) -> Result<Record<DataType>, QueryError> {
        PostgresContext::read_versioned_data_type(*self, uri).await
    }

    async fn read_property_types(&self) -> Result<RowStream, QueryError> {
        PostgresContext::read_property_types(*self).await
    }
}

#[derive(Debug)]
pub struct Record<T> {
    pub record: T,
    pub is_latest: bool,
}

#[async_trait]
impl<C: AsClient> PostgresContext for PostgresStore<C> {
    async fn read_data_types(&self) -> Result<RowStream, QueryError> {
        self.client.as_client()
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

    async fn read_versioned_data_type(
        &self,
        uri: &VersionedUri,
    ) -> Result<Record<DataType>, QueryError> {
        let row = self
            .client
            .as_client()
            .query_one(
                r#"
                SELECT schema, created_by
                FROM data_types
                INNER JOIN ids
                ON data_types.version_id = ids.version_id
                WHERE base_uri = $1 AND version = $2;
                "#,
                &[&uri.base_uri().as_str(), &i64::from(uri.version())],
            )
            .await
            .into_report()
            .change_context(QueryError)?;
        let data_type: DataType = serde_json::from_value(row.get(0))
            .into_report()
            .change_context(QueryError)?;

        let row = self
            .client
            .as_client()
            .query_one(
                r#"
                SELECT MAX(version) as latest
                FROM ids
                WHERE base_uri = $1
                "#,
                &[&uri.base_uri().as_str()],
            )
            .await
            .into_report()
            .change_context(QueryError)?;
        let latest: i64 = row.get(0);
        Ok(Record {
            record: data_type,
            is_latest: latest as u32 == uri.version(),
        })
    }

    async fn read_property_types(&self) -> Result<RowStream, QueryError> {
        self.client.as_client()
            .query_raw(
                r#"
                SELECT schema, created_by, MAX(version) OVER (PARTITION by base_uri) = version as latest
                FROM property_types
                INNER JOIN ids
                ON property_types.version_id = ids.version_id
                ORDER BY base_uri, version DESC;
                "#,
                parameter_list([]),
            )
            .await
            .into_report()
            .change_context(QueryError)
    }
}
