use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use futures::{StreamExt, TryStreamExt};
use serde::Deserialize;
use tokio_postgres::{GenericClient, RowStream};

use crate::{
    ontology::{
        types::{uri::BaseUri, DataType, EntityType, LinkType, PropertyType},
        AccountId, PersistedDataType, PersistedEntityType, PersistedLinkType,
        PersistedOntologyIdentifier, PersistedPropertyType,
    },
    store::{
        crud::Read,
        postgres::{ontology::OntologyDatabaseType, parameter_list},
        query::{OntologyQuery, OntologyVersion},
        AsClient, PostgresStore, QueryError,
    },
};

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

async fn by_uri_by_version<T: OntologyDatabaseType>(
    client: &(impl GenericClient + Sync),
    uri: &BaseUri,
    version: u32,
) -> Result<RowStream, QueryError> {
    client
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
        .into_report()
        .change_context(QueryError)
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
                by_uri_by_version::<T::Inner>(self.as_client(), uri, version).await?
            }
            (None, Some(OntologyVersion::Latest)) => {
                by_latest_version::<T::Inner>(self.as_client()).await?
            }
            _ => todo!(),
        };

        row_stream
            .map(|row_result| {
                let row = row_result.into_report().change_context(QueryError)?;

                let element: T::Inner = serde_json::from_value(row.get(0))
                    .into_report()
                    .change_context(QueryError)?;

                let uri = element.versioned_uri().clone();
                let account_id: AccountId = row.get(1);

                Ok(T::new(
                    element,
                    PersistedOntologyIdentifier::new(uri, account_id),
                ))
            })
            .try_collect()
            .await
    }
}
