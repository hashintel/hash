use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use postgres_types::ToSql;
use serde::Deserialize;
use tokio_postgres::{GenericClient, RowStream};

use crate::{
    ontology::types::uri::BaseUri,
    store::{
        crud::Read,
        postgres::ontology::OntologyDatabaseType,
        query::{OntologyQuery, OntologyVersion},
        AsClient, PostgresStore, QueryError,
    },
};

fn parameter_list<const N: usize>(list: [&(dyn ToSql + Sync); N]) -> [&(dyn ToSql + Sync); N] {
    list
}

async fn by_uri_by_version<T: OntologyDatabaseType>(
    client: &(impl GenericClient + Sync),
    uri: &BaseUri,
    version: u32,
) -> Result<RowStream, QueryError> {
    client
        .query_raw(
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
            parameter_list([uri, &i64::from(version)]),
        )
        .await
        .into_report()
        .change_context(QueryError)
}

async fn by_latest_version<T: OntologyDatabaseType>(
    client: &(impl GenericClient + Sync),
) -> Result<RowStream, QueryError> {
    client
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
            parameter_list([]),
        )
        .await
        .into_report()
        .change_context(QueryError)
}

#[async_trait]
impl<C: AsClient, T> Read<T> for PostgresStore<C>
where
    for<'de> T: OntologyDatabaseType + Deserialize<'de> + Send,
{
    type Query<'q> = OntologyQuery<'q, T>;

    async fn read<'query>(&self, query: &Self::Query<'query>) -> Result<Vec<T>, QueryError> {
        let row_stream = match (query.uri(), query.version()) {
            (Some(uri), Some(OntologyVersion::Exact(version))) => {
                by_uri_by_version::<T>(self.as_client(), uri, version).await?
            }
            (None, Some(OntologyVersion::Latest)) => {
                by_latest_version::<T>(self.as_client()).await?
            }
            _ => todo!(),
        };

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
