use error_stack::{Context, IntoReport, Result, ResultExt};
use tokio_postgres::GenericClient;
use type_system::uri::BaseUri;

use crate::{
    provenance::{CreatedById, OwnedById, UpdatedById},
    store::{postgres::ontology::OntologyDatabaseType, AsClient, QueryError},
};

/// Associates a database entry with the information about the latest version of the corresponding
/// entry.
///
/// This is used for filtering by the latest version.
#[derive(Debug)]
pub struct OntologyRecord<T> {
    pub record: T,
    pub owned_by_id: OwnedById,
    pub created_by_id: CreatedById,
    pub updated_by_id: UpdatedById,
    pub is_latest: bool,
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
                SELECT schema, owned_by_id, created_by_id, updated_by_id
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
    let owned_by_id = OwnedById::new(row.get(1));
    let created_by_id = CreatedById::new(row.get(2));
    let updated_by_id = UpdatedById::new(row.get(3));

    Ok(OntologyRecord {
        record,
        owned_by_id,
        is_latest: true,
        created_by_id,
        updated_by_id,
    })
}
