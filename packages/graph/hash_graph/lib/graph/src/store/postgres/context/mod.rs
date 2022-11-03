mod ontology;

use async_trait::async_trait;
use error_stack::{Context, Result, ResultExt};
use type_system::uri::{BaseUri, VersionedUri};

pub use self::ontology::OntologyRecord;
use crate::store::{postgres::ontology::OntologyDatabaseType, AsClient, PostgresStore, QueryError};

/// Context used for querying the database directly.
///
/// This is only used as an implementation detail inside of the [`postgres`] module.
///
/// [`postgres`]: super::super
// TODO: Use the context to hold query data
//   see https://app.asana.com/0/0/1202884883200946/f
#[async_trait]
pub trait PostgresContext {
    async fn read_latest_ontology_type<T>(
        &self,
        base_uri: &BaseUri,
    ) -> Result<OntologyRecord<T>, QueryError>
    where
        T: OntologyDatabaseType + TryFrom<serde_json::Value, Error: Context>;

    async fn read_versioned_ontology_type<T>(
        &self,
        uri: &VersionedUri,
    ) -> Result<OntologyRecord<T>, QueryError>
    where
        T: OntologyDatabaseType + TryFrom<serde_json::Value, Error: Context>;
}

#[async_trait]
impl<C: AsClient> PostgresContext for PostgresStore<C> {
    async fn read_versioned_ontology_type<T>(
        &self,
        uri: &VersionedUri,
    ) -> Result<OntologyRecord<T>, QueryError>
    where
        T: OntologyDatabaseType + TryFrom<serde_json::Value, Error: Context>,
    {
        ontology::read_versioned_type(&self.client, uri)
            .await
            .attach_printable("could not read ontology type")
            .attach_printable_lazy(|| uri.clone())
    }

    async fn read_latest_ontology_type<T>(
        &self,
        base_uri: &BaseUri,
    ) -> Result<OntologyRecord<T>, QueryError>
    where
        T: OntologyDatabaseType + TryFrom<serde_json::Value, Error: Context>,
    {
        ontology::read_latest_type(&self.client, base_uri)
            .await
            .attach_printable("could not read ontology type")
            .attach_printable_lazy(|| base_uri.clone())
    }
}
