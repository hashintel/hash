use async_trait::async_trait;
use error_stack::{Context, Result, ResultExt};
use type_system::uri::VersionedUri;

use crate::{
    knowledge::EntityId,
    store::{
        postgres::{
            ontology::OntologyDatabaseType,
            resolve::{entity, entity::EntityRecord, ontology, OntologyRecord},
        },
        AsClient, PostgresStore, QueryError,
    },
};

/// Context used for [`Resolve`].
///
/// This is only used as an implementation detail inside of the [`postgres`] module.
///
/// [`Resolve`]: crate::store::query::Resolve
/// [`postgres`]: super::super
// TODO: Use the context to hold query data
//   see https://app.asana.com/0/0/1202884883200946/f
#[async_trait]
pub trait PostgresContext {
    async fn read_all_ontology_types<T>(&self) -> Result<ontology::RecordStream<T>, QueryError>
    where
        T: OntologyDatabaseType + TryFrom<serde_json::Value, Error: Context>;

    async fn read_versioned_ontology_type<T>(
        &self,
        uri: &VersionedUri,
    ) -> Result<OntologyRecord<T>, QueryError>
    where
        T: OntologyDatabaseType + TryFrom<serde_json::Value, Error: Context>;

    async fn read_all_entities(&self) -> Result<entity::RecordStream, QueryError>;

    async fn read_latest_entity_by_id(
        &self,
        entity_id: EntityId,
    ) -> Result<EntityRecord, QueryError>;
}

#[async_trait]
impl<C: AsClient> PostgresContext for PostgresStore<C> {
    async fn read_all_ontology_types<T>(&self) -> Result<ontology::RecordStream<T>, QueryError>
    where
        T: OntologyDatabaseType + TryFrom<serde_json::Value, Error: Context>,
    {
        Ok(ontology::read_all_types(&self.client, T::table())
            .await
            .attach_printable("could not read ontology types")?)
    }

    async fn read_versioned_ontology_type<T>(
        &self,
        uri: &VersionedUri,
    ) -> Result<OntologyRecord<T>, QueryError>
    where
        T: OntologyDatabaseType + TryFrom<serde_json::Value, Error: Context>,
    {
        ontology::read_versioned_type(&self.client, T::table(), uri)
            .await
            .attach_printable("could not read ontology type")
    }

    async fn read_all_entities(&self) -> Result<entity::RecordStream, QueryError> {
        Ok(entity::read_all_entities(&self.client)
            .await
            .attach_printable("could not read entities")?)
    }

    async fn read_latest_entity_by_id(
        &self,
        entity_id: EntityId,
    ) -> Result<EntityRecord, QueryError> {
        Ok(entity::read_latest_entity_by_id(&self.client, entity_id)
            .await
            .attach_printable("could not read entity")?)
    }
}
