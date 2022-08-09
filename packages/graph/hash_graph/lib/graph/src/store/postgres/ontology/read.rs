use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use postgres_types::ToSql;
use serde::Deserialize;
use tokio_postgres::GenericClient;

use crate::{
    ontology::types::uri::VersionedUri,
    store::{
        crud, crud::AllLatest, postgres::ontology::OntologyDatabaseType, AsClient, PostgresStore,
        QueryError,
    },
};

#[async_trait]
impl<'i, C: AsClient, T> crud::Read<'i, &'i VersionedUri, T> for PostgresStore<C>
where
    for<'de> T: OntologyDatabaseType + Deserialize<'de>,
{
    type Output = T;

    async fn get(&self, uri: &'i VersionedUri) -> Result<Self::Output, QueryError> {
        let version = i64::from(uri.version());
        // Generally bad practice to construct a query without preparation, but it's not possible to
        // pass a table name as a parameter and `T::table()` is well-defined, so this is a safe
        // usage.
        let row = self
            .as_client()
            .query_one(
                &format!(
                    r#"
                    SELECT schema
                    FROM {}
                    WHERE version_id = (
                        SELECT version_id
                        FROM ids
                        WHERE base_uri = $1 AND version = $2
                    )
                    "#,
                    T::table()
                ),
                &[uri.base_uri(), &version],
            )
            .await
            .into_report()
            .change_context(QueryError)
            .attach_printable_lazy(|| uri.clone())?;

        serde_json::from_value(row.get(0))
            .into_report()
            .change_context(QueryError)
    }
}

#[async_trait]
impl<C: AsClient, T> crud::Read<'_, AllLatest, T> for PostgresStore<C>
where
    for<'de> T: OntologyDatabaseType + Deserialize<'de> + Send,
{
    type Output = Vec<T>;

    async fn get(&self, _: AllLatest) -> Result<Self::Output, QueryError> {
        // Generally bad practice to construct a query without preparation, but it's not possible to
        // pass a table name as a parameter and `T::table()` is well-defined, so this is a safe
        // usage.
        let row_stream = self
            .as_client()
            .query_raw(
                &format!(
                    r#"
                    SELECT DISTINCT ON(base_uri) schema
                    FROM {table}
                    INNER JOIN ids ON ids.version_id = {table}.version_id
                    ORDER BY base_uri, version DESC;
                    "#,
                    table = T::table()
                ),
                // Requires a concrete type, which implements
                // `IntoIterator<Item = impl BorrowToSql>`
                [] as [&(dyn ToSql + Sync); 0],
            )
            .await
            .into_report()
            .change_context(QueryError)?;

        row_stream
            .map(|row_result| {
                let row = row_result.into_report().change_context(QueryError)?;
                serde_json::from_value(row.get(0))
                    .into_report()
                    .change_context(QueryError)
            })
            .try_collect()
            .await
    }
}
