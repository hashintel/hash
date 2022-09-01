use async_trait::async_trait;
use error_stack::{Context, IntoReport, Result, ResultExt, StreamExt as _};
use futures::{StreamExt, TryStreamExt};
use tokio_postgres::{GenericClient, RowStream};
use type_system::{EntityType, LinkType};

use crate::{
    ontology::{AccountId, PersistedEntityType, PersistedLinkType, PersistedOntologyIdentifier},
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

async fn all<T: OntologyDatabaseType>(
    client: &(impl GenericClient + Sync),
) -> Result<RowStream, QueryError> {
    client
        .query_raw(
            &format!(
                r#"
                SELECT schema, created_by
                FROM {};
                "#,
                T::table()
            ),
            parameter_list([]),
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

fn apply_filter<T: OntologyDatabaseType>(element: T, query: &OntologyQuery<'_, T>) -> Option<T> {
    let uri = element.versioned_uri();

    if let Some(base_uri) = query.uri() {
        if uri.base_uri() != base_uri {
            return None;
        }
    }

    if let Some(OntologyVersion::Exact(version)) = query.version() {
        if uri.version() != version {
            return None;
        }
    }

    Some(element)
}

// TODO: Unify methods for Ontology types using `Expression`s
//   see https://app.asana.com/0/0/1202884883200959/f
#[async_trait]
impl<C: AsClient, T> Read<T> for PostgresStore<C>
where
    T: PersistedOntologyType + Send,
    T::Inner: OntologyDatabaseType + TryFrom<serde_json::Value>,
    <<T as PersistedOntologyType>::Inner as TryFrom<serde_json::Value>>::Error: Context,
{
    type Query<'q> = OntologyQuery<'q, T::Inner>;

    async fn read<'query>(&self, query: &Self::Query<'query>) -> Result<Vec<T>, QueryError> {
        let row_stream = if let Some(OntologyVersion::Latest) = query.version() {
            by_latest_version::<T::Inner>(self.as_client()).await?
        } else {
            all::<T::Inner>(self.as_client()).await?
        };

        row_stream
            .map(IntoReport::into_report)
            .change_context(QueryError)
            .try_filter_map(|row| async move {
                let element: T::Inner = T::Inner::try_from(row.get(0))
                    .into_report()
                    .change_context(QueryError)?;

                let account_id: AccountId = row.get(1);

                Ok(apply_filter(element, query).map(|element| {
                    let uri = element.versioned_uri();
                    let identifier = PersistedOntologyIdentifier::new(uri.clone(), account_id);
                    T::new(element, identifier)
                }))
            })
            .try_collect()
            .await
    }
}
