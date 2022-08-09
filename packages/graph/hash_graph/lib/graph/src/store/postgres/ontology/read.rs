use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use postgres_types::ToSql;
use serde::Deserialize;
use tokio_postgres::GenericClient;

use crate::{
    ontology::{AccountId, PersistedOntologyType},
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

#[async_trait]
impl<C: AsClient, T> Read<PersistedOntologyType<T>> for PostgresStore<C>
where
    for<'de> T: OntologyDatabaseType + Deserialize<'de> + Send,
{
    type Query<'q> = OntologyQuery<'q, T>;

    async fn read<'query>(
        &self,
        query: &Self::Query<'query>,
    ) -> Result<Vec<PersistedOntologyType<T>>, QueryError> {
        let row_stream = match (query.uri(), query.version()) {
            (Some(uri), Some(OntologyVersion::Exact(version))) => {
                self.as_client()
                    .query_raw(
                        &format!(
                            r#"
                            SELECT schema, created_by
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
            }
            (None, Some(OntologyVersion::Latest)) => {
                self.as_client()
                    .query_raw(
                        &format!(
                            r#"
                            SELECT DISTINCT ON(base_uri) schema, created_by
                            FROM {table}
                            INNER JOIN ids ON ids.version_id = {table}.version_id
                            ORDER BY base_uri, version DESC;
                            "#,
                            table = T::table()
                        ),
                        parameter_list([]),
                    )
                    .await
            }
            _ => todo!(),
        };

        row_stream
            .into_report()
            .change_context(QueryError)?
            .map(|row_result| {
                let row = row_result.into_report().change_context(QueryError)?;

                let element: T = serde_json::from_value(row.get(0))
                    .into_report()
                    .change_context(QueryError)?;
                let account_id: AccountId = row.get(1);

                Ok(PersistedOntologyType::new(element, account_id))
            })
            .try_collect()
            .await
    }
}
