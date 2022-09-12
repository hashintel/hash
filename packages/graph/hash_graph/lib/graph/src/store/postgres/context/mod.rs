mod entity;
mod links;
mod ontology;

use async_trait::async_trait;
use error_stack::{Context, Result, ResultExt};
use type_system::uri::VersionedUri;

pub use self::{entity::EntityRecord, links::LinkRecord, ontology::OntologyRecord};
use crate::{
    knowledge::EntityId,
    store::{postgres::ontology::OntologyDatabaseType, AsClient, PostgresStore, QueryError},
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

    async fn read_all_links(&self) -> Result<links::RecordStream, QueryError>;

    async fn read_links_by_source(
        &self,
        entity_id: EntityId,
    ) -> Result<links::RecordStream, QueryError>;

    async fn read_links_by_target(
        &self,
        entity_id: EntityId,
    ) -> Result<links::RecordStream, QueryError>;
}

#[async_trait]
impl<C: AsClient> PostgresContext for PostgresStore<C> {
    async fn read_all_ontology_types<T>(&self) -> Result<ontology::RecordStream<T>, QueryError>
    where
        T: OntologyDatabaseType + TryFrom<serde_json::Value, Error: Context>,
    {
        ontology::read_all_types(&self.client, T::table())
            .await
            .attach_printable("could not read ontology types")
    }

    async fn read_versioned_ontology_type<T>(
        &self,
        uri: &VersionedUri,
    ) -> Result<OntologyRecord<T>, QueryError>
    where
        T: OntologyDatabaseType + TryFrom<serde_json::Value, Error: Context>,
    {
        ontology::read_versioned_type(&self.client, uri)
            .await
            .attach_printable_lazy(|| format!("could not read ontology type: {uri}"))
    }

    async fn read_all_entities(&self) -> Result<entity::RecordStream, QueryError> {
        entity::read_all_entities(&self.client)
            .await
            .attach_printable("could not read entities")
    }

    async fn read_latest_entity_by_id(
        &self,
        entity_id: EntityId,
    ) -> Result<EntityRecord, QueryError> {
        entity::read_latest_entity_by_id(&self.client, entity_id)
            .await
            .attach_printable_lazy(|| format!("could not read entity: {entity_id}"))
    }

    async fn read_all_links(&self) -> Result<links::RecordStream, QueryError> {
        links::read_all_links(&self.client)
            .await
            .attach_printable("could not read links")
    }

    async fn read_links_by_source(
        &self,
        entity_id: EntityId,
    ) -> Result<links::RecordStream, QueryError> {
        links::read_links_by_source(&self.client, entity_id)
            .await
            .attach_printable_lazy(|| format!("could not read outgoing links: {entity_id}"))
    }

    async fn read_links_by_target(
        &self,
        entity_id: EntityId,
    ) -> Result<links::RecordStream, QueryError> {
        links::read_links_by_target(&self.client, entity_id)
            .await
            .attach_printable("could not read incoming links")
            .attach_printable_lazy(|| format!("target entity: {entity_id}"))
    }
}
