mod data_type;
mod entity;
mod entity_type;
mod link_type;
mod links;
mod property_type;

use error_stack::Result;
use graph::{
    knowledge::{
        Entity, EntityId, Link, Links, Outgoing, PersistedEntity, PersistedEntityIdentifier,
    },
    ontology::{
        types::{uri::VersionedUri, DataType, EntityType, LinkType, PropertyType},
        AccountId,
    },
    store::{
        error::LinkActivationError,
        query::{
            DataTypeQuery, EntityQuery, EntityTypeQuery, LinkQuery, LinkTypeQuery,
            PropertyTypeQuery,
        },
        AsClient, DataTypeStore, DatabaseConnectionInfo, DatabaseType, EntityStore,
        EntityTypeStore, InsertionError, LinkStore, LinkTypeStore, PostgresStore,
        PostgresStorePool, PropertyTypeStore, QueryError, StorePool, UpdateError,
    },
};
use tokio_postgres::{NoTls, Transaction};
use uuid::Uuid;

pub struct DatabaseTestWrapper {
    _pool: PostgresStorePool<NoTls>,
    connection: <PostgresStorePool<NoTls> as StorePool>::Store<'static>,
}

pub struct DatabaseApi<'pool> {
    store: PostgresStore<Transaction<'pool>>,
    account_id: AccountId,
}

impl DatabaseTestWrapper {
    pub async fn new() -> Self {
        const USER: &str = "graph";

        const PASSWORD: &str = "graph";
        const HOST: &str = "localhost";
        const PORT: u16 = 5432;
        const DATABASE: &str = "graph";

        let connection_info = DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            USER.to_owned(),
            PASSWORD.to_owned(),
            HOST.to_owned(),
            PORT,
            DATABASE.to_owned(),
        );

        let pool = PostgresStorePool::new(&connection_info, NoTls)
            .await
            .expect("could not connect to database");

        let connection = pool
            .acquire_owned()
            .await
            .expect("could not acquire a database connection");

        Self {
            _pool: pool,
            connection,
        }
    }

    pub async fn seed<D, P, L, E>(
        &mut self,
        data_types: D,
        property_types: P,
        link_types: L,
        entity_types: E,
    ) -> Result<DatabaseApi<'_>, InsertionError>
    where
        D: IntoIterator<Item = &'static str>,
        P: IntoIterator<Item = &'static str>,
        L: IntoIterator<Item = &'static str>,
        E: IntoIterator<Item = &'static str>,
    {
        let mut store = PostgresStore::new(
            self.connection
                .as_mut_client()
                .transaction()
                .await
                .expect("could not start test transaction"),
        );

        let account_id = AccountId::new(Uuid::new_v4());
        store
            .insert_account_id(account_id)
            .await
            .expect("could not insert account id");

        for data_type in data_types {
            store
                .create_data_type(
                    &serde_json::from_str(data_type).expect("could not parse data type"),
                    account_id,
                )
                .await?;
        }

        for property_type in property_types {
            store
                .create_property_type(
                    &serde_json::from_str(property_type).expect("could not parse data type"),
                    account_id,
                )
                .await?;
        }

        // Insert link types before entity types so entity types can refer to them
        for link_type in link_types {
            store
                .create_link_type(
                    &serde_json::from_str(link_type).expect("could not parse link type"),
                    account_id,
                )
                .await?;
        }

        for entity_type in entity_types {
            store
                .create_entity_type(
                    &serde_json::from_str(entity_type).expect("could not parse entity type"),
                    account_id,
                )
                .await?;
        }

        Ok(DatabaseApi { store, account_id })
    }
}

// TODO: Add get_all_* methods
impl DatabaseApi<'_> {
    pub async fn create_data_type(&mut self, data_type: &DataType) -> Result<(), InsertionError> {
        self.store
            .create_data_type(data_type, self.account_id)
            .await
    }

    pub async fn get_data_type(&mut self, uri: &VersionedUri) -> Result<DataType, QueryError> {
        Ok(self
            .store
            .get_data_type(
                &DataTypeQuery::new()
                    .with_uri(uri.base_uri())
                    .with_version(uri.version()),
            )
            .await?
            .pop()
            .expect("No data type found"))
    }

    pub async fn update_data_type(&mut self, data_type: &DataType) -> Result<(), UpdateError> {
        self.store
            .update_data_type(data_type, self.account_id)
            .await
    }

    pub async fn create_property_type(
        &mut self,
        property_type: &PropertyType,
    ) -> Result<(), InsertionError> {
        self.store
            .create_property_type(property_type, self.account_id)
            .await
    }

    pub async fn get_property_type(
        &mut self,
        uri: &VersionedUri,
    ) -> Result<PropertyType, QueryError> {
        Ok(self
            .store
            .get_property_type(
                &PropertyTypeQuery::new()
                    .with_uri(uri.base_uri())
                    .with_version(uri.version()),
            )
            .await?
            .pop()
            .expect("No property type found"))
    }

    pub async fn update_property_type(
        &mut self,
        property_type: &PropertyType,
    ) -> Result<(), UpdateError> {
        self.store
            .update_property_type(property_type, self.account_id)
            .await
    }

    pub async fn create_entity_type(
        &mut self,
        entity_type: &EntityType,
    ) -> Result<(), InsertionError> {
        self.store
            .create_entity_type(entity_type, self.account_id)
            .await
    }

    pub async fn get_entity_type(&mut self, uri: &VersionedUri) -> Result<EntityType, QueryError> {
        Ok(self
            .store
            .get_entity_type(
                &EntityTypeQuery::new()
                    .with_uri(uri.base_uri())
                    .with_version(uri.version()),
            )
            .await?
            .pop()
            .expect("No entity type found"))
    }

    pub async fn update_entity_type(
        &mut self,
        entity_type: &EntityType,
    ) -> Result<(), UpdateError> {
        self.store
            .update_entity_type(entity_type, self.account_id)
            .await
    }

    pub async fn create_link_type(&mut self, link_type: &LinkType) -> Result<(), InsertionError> {
        self.store
            .create_link_type(link_type, self.account_id)
            .await
    }

    pub async fn get_link_type(&mut self, uri: &VersionedUri) -> Result<LinkType, QueryError> {
        Ok(self
            .store
            .get_link_type(
                &LinkTypeQuery::new()
                    .with_uri(uri.base_uri())
                    .with_version(uri.version()),
            )
            .await?
            .pop()
            .expect("No link type found"))
    }

    pub async fn update_link_type(&mut self, link_type: &LinkType) -> Result<(), UpdateError> {
        self.store
            .update_link_type(link_type, self.account_id)
            .await
    }

    pub async fn create_entity(
        &mut self,
        entity: &Entity,
        entity_type_uri: VersionedUri,
    ) -> Result<PersistedEntityIdentifier, InsertionError> {
        self.store
            .create_entity(entity, entity_type_uri, self.account_id)
            .await
    }

    pub async fn get_entity(&mut self, entity_id: EntityId) -> Result<PersistedEntity, QueryError> {
        Ok(self
            .store
            .get_entity(&EntityQuery::new().with_id(entity_id).with_latest_version())
            .await?
            .pop()
            .expect("No entity found"))
    }

    pub async fn update_entity(
        &mut self,
        entity_id: EntityId,
        entity: &Entity,
        entity_type_uri: VersionedUri,
    ) -> Result<PersistedEntityIdentifier, UpdateError> {
        self.store
            .update_entity(entity_id, entity, entity_type_uri, self.account_id)
            .await
    }

    async fn create_link(
        &mut self,
        source_entity: EntityId,
        target_entity: EntityId,
        link_type_uri: VersionedUri,
    ) -> Result<(), InsertionError> {
        let link = Link::new(source_entity, target_entity, link_type_uri);
        self.store.create_link(&link, self.account_id).await
    }

    pub async fn get_link_target(
        &self,
        source_entity: EntityId,
        link_type_uri: VersionedUri,
    ) -> Result<Outgoing, QueryError> {
        Ok(self
            .store
            .get_links(
                &LinkQuery::new()
                    .with_source_entity_id(source_entity)
                    .with_link_types(|link_types| {
                        link_types
                            .with_uri(link_type_uri.base_uri())
                            .with_version(link_type_uri.version())
                    }),
            )
            .await?
            .pop()
            .expect("No link found")
            .outgoing()[&link_type_uri]
            .clone())
    }

    pub async fn get_entity_links(&self, source_entity: EntityId) -> Result<Links, QueryError> {
        Ok(self
            .store
            .get_links(&LinkQuery::new().with_source_entity_id(source_entity))
            .await?
            .pop()
            .expect("No links found"))
    }

    async fn remove_link(
        &mut self,
        source_entity: EntityId,
        target_entity: EntityId,
        link_type_uri: VersionedUri,
    ) -> Result<(), LinkActivationError> {
        let link = Link::new(source_entity, target_entity, link_type_uri);
        self.store.inactivate_link(&link).await
    }
}

#[tokio::test]
async fn can_connect() {
    DatabaseTestWrapper::new().await;
}
