use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio_postgres::{GenericClient, Row, RowStream};
use type_system::{uri::VersionedUri, DataType, PropertyType};

use crate::store::{postgres::parameter_list, query::Resolve, AsClient, PostgresStore, QueryError};

/// Context used to for [`Resolve`].
///
/// This is only used as an implementation detail inside of the [`postgres`] module.
///
/// [`Resolve`]: crate::store::query::Resolve
/// [`postgres`]: crate::store::postgres
// TODO: Use the context to hold query data
//   see https://app.asana.com/0/0/1202884883200946/f
#[async_trait]
pub trait PostgresContext {
    async fn read_all_data_types(&self) -> Result<RowStream, QueryError>;

    async fn read_versioned_data_type(
        &self,
        uri: &VersionedUri,
    ) -> Result<Record<DataType>, QueryError>;

    async fn read_all_property_types(&self) -> Result<RowStream, QueryError>;

    async fn read_versioned_property_type(
        &self,
        uri: &VersionedUri,
    ) -> Result<Record<PropertyType>, QueryError>;
}

#[async_trait]
impl<T> PostgresContext for &T
where
    T: PostgresContext + Sync,
{
    async fn read_all_data_types(&self) -> Result<RowStream, QueryError> {
        PostgresContext::read_all_data_types(*self).await
    }

    async fn read_versioned_data_type(
        &self,
        uri: &VersionedUri,
    ) -> Result<Record<DataType>, QueryError> {
        PostgresContext::read_versioned_data_type(*self, uri).await
    }

    async fn read_all_property_types(&self) -> Result<RowStream, QueryError> {
        PostgresContext::read_all_property_types(*self).await
    }

    async fn read_versioned_property_type(
        &self,
        uri: &VersionedUri,
    ) -> Result<Record<PropertyType>, QueryError> {
        PostgresContext::read_versioned_property_type(*self, uri).await
    }
}

/// Associates a database entry with the information about the latest version if the corresponding
/// entry.
///
/// This is used for filtering by the latest version.
#[derive(Debug)]
pub struct Record<T> {
    pub record: T,
    pub is_latest: bool,
}

async fn read_all_types(client: &impl AsClient, table: &str) -> Result<RowStream, QueryError> {
    client
        .as_client()
        .query_raw(
            &format!(
                r#"
                SELECT schema, created_by, MAX(version) OVER (PARTITION by base_uri) = version as latest
                FROM {table}
                INNER JOIN ids
                ON {table}.version_id = ids.version_id
                ORDER BY base_uri, version DESC;
                "#,
            ),
            parameter_list([]),
        )
        .await
        .into_report()
        .change_context(QueryError)
}

async fn read_versioned_type(
    client: &impl AsClient,
    table: &str,
    uri: &VersionedUri,
) -> Result<Record<Row>, QueryError> {
    let type_row = client
        .as_client()
        .query_one(
            &format!(
                r#"
                SELECT schema, created_by
                FROM {table}
                INNER JOIN ids
                ON {table}.version_id = ids.version_id
                WHERE base_uri = $1 AND version = $2;
                "#
            ),
            &[&uri.base_uri().as_str(), &i64::from(uri.version())],
        )
        .await
        .into_report()
        .change_context(QueryError)?;

    let row = client
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
        record: type_row,
        is_latest: latest as u32 == uri.version(),
    })
}

#[async_trait]
impl<C: AsClient> PostgresContext for PostgresStore<C> {
    async fn read_all_data_types(&self) -> Result<RowStream, QueryError> {
        read_all_types(&self.client, "data_types").await
    }

    async fn read_versioned_data_type(
        &self,
        uri: &VersionedUri,
    ) -> Result<Record<DataType>, QueryError> {
        let Record { record, is_latest } =
            read_versioned_type(&self.client, "data_types", uri).await?;

        Ok(Record {
            record: serde_json::from_value(record.get(0))
                .into_report()
                .change_context(QueryError)?,
            is_latest,
        })
    }

    async fn read_all_property_types(&self) -> Result<RowStream, QueryError> {
        read_all_types(&self.client, "property_types").await
    }

    async fn read_versioned_property_type(
        &self,
        uri: &VersionedUri,
    ) -> Result<Record<PropertyType>, QueryError> {
        let Record { record, is_latest } =
            read_versioned_type(&self.client, "property_types", uri).await?;

        Ok(Record {
            record: serde_json::from_value(record.get(0))
                .into_report()
                .change_context(QueryError)?,
            is_latest,
        })
    }
}
