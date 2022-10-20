use error_stack::{Context, IntoReport, Result, ResultExt};
use futures::{Stream, StreamExt};
use tokio_postgres::{GenericClient, RowStream};
use type_system::uri::{BaseUri, VersionedUri};

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
    pub owned_by_id: AccountId,
    pub created_by_id: AccountId,
    pub updated_by_id: AccountId,
    pub removed_by_id: Option<AccountId>,
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
            owned_by_id: row.get(1),
            is_latest: row.get(2),
            created_by_id: row.get(3),
            updated_by_id: row.get(4),
            removed_by_id: row.get(5),
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
                SELECT schema, owned_by_id, MAX(version) OVER (PARTITION by base_uri) = version as latest, created_by_id, updated_by_id, removed_by_id
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

pub async fn read_latest_type<T>(
    client: &impl AsClient,
    base_uri: &BaseUri,
) -> Result<OntologyRecord<T>, QueryError>
where
    T: OntologyDatabaseType + TryFrom<serde_json::Value, Error: Context>,
{
    let row = client
        .as_client()
        .query_one(
            &format!(
                r#"
                SELECT schema, owned_by_id, created_by_id, updated_by_id, removed_by_id
                FROM {} type_table
                INNER JOIN type_ids
                ON type_table.version_id = type_ids.version_id
                WHERE base_uri = $1 AND version = (
                    SELECT MAX(version)
                    FROM type_ids
                    WHERE base_uri = $1
                );
                "#,
                T::table()
            ),
            &[&base_uri.as_str()],
        )
        .await
        .into_report()
        .change_context(QueryError)?;

    let record = T::try_from(row.get(0))
        .into_report()
        .change_context(QueryError)?;
    let owned_by_id = row.get(1);
    let created_by_id = row.get(2);
    let updated_by_id = row.get(3);
    let removed_by_id = row.get(4);

    Ok(OntologyRecord {
        record,
        owned_by_id,
        is_latest: true,
        created_by_id,
        updated_by_id,
        removed_by_id,
    })
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
                ), created_by_id, updated_by_id, removed_by_id
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
    let owned_by_id = row.get(1);
    let latest: i64 = row.get(2);
    let created_by_id = row.get(3);
    let updated_by_id = row.get(4);
    let removed_by_id = row.get(5);

    Ok(OntologyRecord {
        record,
        owned_by_id,
        is_latest: latest as u32 == uri.version(),
        created_by_id,
        updated_by_id,
        removed_by_id,
    })
}
