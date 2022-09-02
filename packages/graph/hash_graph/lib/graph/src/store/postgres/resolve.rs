use async_trait::async_trait;
use error_stack::{Context, IntoReport, Result, ResultExt};
use futures::{Stream, StreamExt};
use tokio_postgres::{GenericClient, RowStream};
use type_system::{uri::VersionedUri, DataType, LinkType, PropertyType};

use crate::{
    ontology::AccountId,
    store::{postgres::parameter_list, AsClient, PostgresStore, QueryError},
};

type RecordStream<T>
where
    T: TryFrom<serde_json::Value>,
    <T as TryFrom<serde_json::Value>>::Error: Context,
= impl Stream<Item = Result<Record<T>, QueryError>>;

/// Context used for [`Resolve`].
///
/// This is only used as an implementation detail inside of the [`postgres`] module.
///
/// [`Resolve`]: crate::store::query::Resolve
/// [`postgres`]: super
// TODO: Use the context to hold query data
//   see https://app.asana.com/0/0/1202884883200946/f
#[async_trait]
pub trait PostgresContext {
    async fn read_all_data_types(&self) -> Result<RecordStream<DataType>, QueryError>;

    async fn read_versioned_data_type(
        &self,
        uri: &VersionedUri,
    ) -> Result<Record<DataType>, QueryError>;

    async fn read_all_property_types(&self) -> Result<RecordStream<PropertyType>, QueryError>;

    async fn read_versioned_property_type(
        &self,
        uri: &VersionedUri,
    ) -> Result<Record<PropertyType>, QueryError>;

    async fn read_all_link_types(&self) -> Result<RecordStream<LinkType>, QueryError>;

    async fn read_versioned_link_type(
        &self,
        uri: &VersionedUri,
    ) -> Result<Record<LinkType>, QueryError>;
}

/// Associates a database entry with the information about the latest version of the corresponding
/// entry.
///
/// This is used for filtering by the latest version.
#[derive(Debug)]
pub struct Record<T> {
    pub record: T,
    pub account_id: AccountId,
    pub is_latest: bool,
}

fn row_stream_to_record_stream<T>(row_stream: RowStream) -> RecordStream<T>
where
    T: TryFrom<serde_json::Value>,
    <T as TryFrom<serde_json::Value>>::Error: Context,
{
    row_stream.map(|row| {
        let row = row.into_report().change_context(QueryError)?;
        let record: T = serde_json::Value::try_into(row.get(0))
            .into_report()
            .change_context(QueryError)?;

        Ok(Record {
            record,
            account_id: row.get(1),
            is_latest: row.get(2),
        })
    })
}

async fn read_all_types(client: &impl AsClient, table: &str) -> Result<RowStream, QueryError> {
    client
        .as_client()
        .query_raw(
            &format!(
                r#"
                SELECT schema, created_by, MAX(version) OVER (PARTITION by base_uri) = version as latest
                FROM {table} type_table
                INNER JOIN ids
                ON type_table.version_id = ids.version_id
                ORDER BY base_uri, version DESC;
                "#,
            ),
            parameter_list([]),
        )
        .await
        .into_report().change_context(QueryError)
}

async fn read_versioned_type<T>(
    client: &impl AsClient,
    table: &str,
    uri: &VersionedUri,
) -> Result<Record<T>, QueryError>
where
    T: TryFrom<serde_json::Value>,
    <T as TryFrom<serde_json::Value>>::Error: Context,
{
    let row = client
        .as_client()
        .query_one(
            &format!(
                r#"
                SELECT schema, created_by, (
                    SELECT MAX(version) as latest 
                    FROM ids 
                    WHERE base_uri = $1
                )
                FROM {table} type_table
                INNER JOIN ids
                ON type_table.version_id = ids.version_id
                WHERE base_uri = $1 AND version = $2;
                "#
            ),
            &[&uri.base_uri().as_str(), &i64::from(uri.version())],
        )
        .await
        .into_report()
        .change_context(QueryError)?;

    let record = T::try_from(row.get(0))
        .into_report()
        .change_context(QueryError)?;
    let account_id = row.get(1);
    let latest: i64 = row.get(2);

    Ok(Record {
        record,
        account_id,
        is_latest: latest as u32 == uri.version(),
    })
}

#[async_trait]
impl<C: AsClient> PostgresContext for PostgresStore<C> {
    async fn read_all_data_types(&self) -> Result<RecordStream<DataType>, QueryError> {
        Ok(row_stream_to_record_stream(
            read_all_types(&self.client, "data_types")
                .await
                .attach_printable("could not read data types")?,
        ))
    }

    async fn read_versioned_data_type(
        &self,
        uri: &VersionedUri,
    ) -> Result<Record<DataType>, QueryError> {
        read_versioned_type(&self.client, "data_types", uri)
            .await
            .attach_printable("could not read data type")
    }

    async fn read_all_property_types(&self) -> Result<RecordStream<PropertyType>, QueryError> {
        Ok(row_stream_to_record_stream(
            read_all_types(&self.client, "property_types")
                .await
                .attach_printable("could not read property types")?,
        ))
    }

    async fn read_versioned_property_type(
        &self,
        uri: &VersionedUri,
    ) -> Result<Record<PropertyType>, QueryError> {
        read_versioned_type(&self.client, "property_types", uri)
            .await
            .attach_printable("could not read property type")
    }

    async fn read_all_link_types(&self) -> Result<RecordStream<LinkType>, QueryError> {
        Ok(row_stream_to_record_stream(
            read_all_types(&self.client, "link_types")
                .await
                .attach_printable("could not read link types")?,
        ))
    }

    async fn read_versioned_link_type(
        &self,
        uri: &VersionedUri,
    ) -> Result<Record<LinkType>, QueryError> {
        read_versioned_type(&self.client, "link_types", uri)
            .await
            .attach_printable("could not read link type")
    }
}
