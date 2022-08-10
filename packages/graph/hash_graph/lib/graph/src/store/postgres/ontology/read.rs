use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use postgres_types::ToSql;
use serde::Deserialize;
use tokio_postgres::GenericClient;

use crate::{
    ontology::{
        types::{DataType, EntityType, LinkType, PropertyType},
        AccountId, PersistedDataType, PersistedEntityType, PersistedLinkType,
        PersistedOntologyIdentifier, PersistedPropertyType,
    },
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

pub trait PersistedOntologyType {
    type Inner;

    fn new(inner: Self::Inner, identifier: PersistedOntologyIdentifier) -> Self;
}

impl PersistedOntologyType for PersistedDataType {
    type Inner = DataType;

    fn new(inner: Self::Inner, identifier: PersistedOntologyIdentifier) -> Self {
        Self { inner, identifier }
    }
}

impl PersistedOntologyType for PersistedPropertyType {
    type Inner = PropertyType;

    fn new(inner: Self::Inner, identifier: PersistedOntologyIdentifier) -> Self {
        Self { inner, identifier }
    }
}

impl PersistedOntologyType for PersistedLinkType {
    type Inner = LinkType;

    fn new(inner: Self::Inner, identifier: PersistedOntologyIdentifier) -> Self {
        Self { inner, identifier }
    }
}

impl PersistedOntologyType for PersistedEntityType {
    type Inner = EntityType;

    fn new(inner: Self::Inner, identifier: PersistedOntologyIdentifier) -> Self {
        Self { inner, identifier }
    }
}

#[async_trait]
impl<C: AsClient, T> Read<T> for PostgresStore<C>
where
    T: PersistedOntologyType + Send,
    for<'de> T::Inner: OntologyDatabaseType + Deserialize<'de>,
{
    type Query<'q> = OntologyQuery<'q, T::Inner>;

    async fn read<'query>(&self, query: &Self::Query<'query>) -> Result<Vec<T>, QueryError> {
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
                            <T::Inner as OntologyDatabaseType>::table()
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
                            table = <T::Inner as OntologyDatabaseType>::table()
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

                let element: T::Inner = serde_json::from_value(row.get(0))
                    .into_report()
                    .change_context(QueryError)?;
                let account_id: AccountId = row.get(1);

                let uri = element.versioned_uri().clone();

                Ok(T::new(
                    element,
                    PersistedOntologyIdentifier::new(uri, account_id),
                ))
            })
            .try_collect()
            .await
    }
}
