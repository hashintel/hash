use error_stack::{Context, IntoReport, Result, ResultExt};
use futures::{Stream, StreamExt};
use tokio_postgres::{GenericClient, RowStream};
use type_system::uri::VersionedUri;

use crate::{
    ontology::AccountId,
    store::{
        postgres::{ontology::OntologyDatabaseType, parameter_list},
        AsClient, QueryError,
    },
};

pub type RecordStream<T>
where
    T: TryFrom<serde_json::Value, Error: Context>,
= impl Stream<Item = Result<OntologyRecord<T>, QueryError>>;

/// Associates a database entry with the information about the latest version of the corresponding
/// entry.
///
/// This is used for filtering by the latest version.
#[derive(Debug)]
pub struct OntologyRecord<T> {
    pub record: T,
    pub account_id: AccountId, // TODO - rename to owned_by_id
    pub is_latest: bool,
}

fn row_stream_to_record_stream<T>(
    row_stream: RowStream,
) -> impl Stream<Item = Result<OntologyRecord<T>, QueryError>>
where
    T: TryFrom<serde_json::Value, Error: Context>,
{
    row_stream.map(|row| {
        let row = row.into_report().change_context(QueryError)?;
        let record: T = serde_json::Value::try_into(row.get(0))
            .into_report()
            .change_context(QueryError)?;

        Ok(OntologyRecord {
            record,
            account_id: row.get(1),
            is_latest: row.get(2),
        })
    })
}

pub async fn read_all_types<T>(
    client: &impl AsClient,
    table: &str,
) -> Result<RecordStream<T>, QueryError>
where
    T: TryFrom<serde_json::Value, Error: Context>,
{
    let row_stream = client
        .as_client()
        .query_raw(
            &format!(
                r#"
                SELECT schema, owned_by_id, MAX(version) OVER (PARTITION by base_uri) = version as latest
                FROM {table} type_table
                INNER JOIN type_ids
                ON type_table.version_id = type_ids.version_id
                ORDER BY base_uri, version DESC;
                "#,
            ),
            parameter_list([]),
        )
        .await
        .into_report().change_context(QueryError)?;
    Ok(row_stream_to_record_stream(row_stream))
}

pub async fn read_versioned_type<T>(
    client: &impl AsClient,
    uri: &VersionedUri,
) -> Result<OntologyRecord<T>, QueryError>
where
    T: OntologyDatabaseType + TryFrom<serde_json::Value, Error: Context>,
{
    let row = client
        .as_client()
        .query_one(
            &format!(
                r#"
                SELECT schema, owned_by_id, (
                    SELECT MAX(version) as latest
                    FROM type_ids
                    WHERE base_uri = $1
                )
                FROM {} type_table
                INNER JOIN type_ids
                ON type_table.version_id = type_ids.version_id
                WHERE base_uri = $1 AND version = $2;
                "#,
                T::table()
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

    Ok(OntologyRecord {
        record,
        account_id,
        is_latest: latest as u32 == uri.version(),
    })
}
