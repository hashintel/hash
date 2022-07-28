mod data_type;
mod entity;
mod entity_type;
mod link_type;
mod links;
mod property_type;

use error_stack::Result;
use graph::{
    knowledge::{Entity, EntityId, Link, Links, Outgoing},
    ontology::{
        types::{uri::VersionedUri, DataType, EntityType, LinkType, Persisted, PropertyType},
        AccountId, VersionId,
    },
    store::{
        error::LinkActivationError, AsClient, DatabaseConnectionInfo, DatabaseType, InsertionError,
        PostgresStore, PostgresStorePool, QueryError, Store, StorePool, UpdateError,
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
                .expect("Could start test transaction"),
        );

        let account_id = AccountId::new(Uuid::new_v4());
        store
            .insert_account_id(account_id)
            .await
            .expect("could not insert account id");

        for data_type in data_types {
            store
                .create_data_type(
                    serde_json::from_str(data_type).expect("could not parse data type"),
                    account_id,
                )
                .await?;
        }

        for property_type in property_types {
            store
                .create_property_type(
                    serde_json::from_str(property_type).expect("could not parse data type"),
                    account_id,
                )
                .await?;
        }

        // Insert link types before entity types so entity types can refer to them
        for link_type in link_types {
            store
                .create_link_type(
                    serde_json::from_str(link_type).expect("could not parse link type"),
                    account_id,
                )
                .await?;
        }

        for entity_type in entity_types {
            store
                .create_entity_type(
                    serde_json::from_str(entity_type).expect("could not parse entity type"),
                    account_id,
                )
                .await?;
        }

        Ok(DatabaseApi { store, account_id })
    }
}
impl DatabaseApi<'_> {
    pub async fn create_data_type(
        &mut self,
        data_type: DataType,
    ) -> Result<Persisted<DataType>, InsertionError> {
        self.store
            .create_data_type(data_type, self.account_id)
            .await
    }

    pub async fn get_data_type(
        &mut self,
        version_id: VersionId,
    ) -> Result<Persisted<DataType>, QueryError> {
        self.store.get_data_type(version_id).await
    }

    pub async fn update_data_type(
        &mut self,
        data_type: DataType,
    ) -> Result<Persisted<DataType>, UpdateError> {
        self.store
            .update_data_type(data_type, self.account_id)
            .await
    }

    pub async fn create_property_type(
        &mut self,
        property_type: PropertyType,
    ) -> Result<Persisted<PropertyType>, InsertionError> {
        self.store
            .create_property_type(property_type, self.account_id)
            .await
    }

    pub async fn get_property_type(
        &mut self,
        version_id: VersionId,
    ) -> Result<Persisted<PropertyType>, QueryError> {
        self.store.get_property_type(version_id).await
    }

    pub async fn update_property_type(
        &mut self,
        property_type: PropertyType,
    ) -> Result<Persisted<PropertyType>, UpdateError> {
        self.store
            .update_property_type(property_type, self.account_id)
            .await
    }

    pub async fn create_entity_type(
        &mut self,
        entity_type: EntityType,
    ) -> Result<Persisted<EntityType>, InsertionError> {
        self.store
            .create_entity_type(entity_type, self.account_id)
            .await
    }

    pub async fn get_entity_type(
        &mut self,
        version_id: VersionId,
    ) -> Result<Persisted<EntityType>, QueryError> {
        self.store.get_entity_type(version_id).await
    }

    pub async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
    ) -> Result<Persisted<EntityType>, UpdateError> {
        self.store
            .update_entity_type(entity_type, self.account_id)
            .await
    }

    pub async fn create_link_type(
        &mut self,
        link_type: LinkType,
    ) -> Result<Persisted<LinkType>, InsertionError> {
        self.store
            .create_link_type(link_type, self.account_id)
            .await
    }

    pub async fn get_link_type(
        &mut self,
        version_id: VersionId,
    ) -> Result<Persisted<LinkType>, QueryError> {
        self.store.get_link_type(version_id).await
    }

    pub async fn update_link_type(
        &mut self,
        link_type: LinkType,
    ) -> Result<Persisted<LinkType>, UpdateError> {
        self.store
            .update_link_type(link_type, self.account_id)
            .await
    }

    pub async fn create_entity(
        &mut self,
        entity: &Entity,
        entity_type_uri: VersionedUri,
    ) -> Result<EntityId, InsertionError> {
        self.store
            .create_entity(entity, entity_type_uri, self.account_id)
            .await
    }

    pub async fn get_entity(&mut self, entity_id: EntityId) -> Result<Entity, QueryError> {
        self.store.get_entity(entity_id).await
    }

    pub async fn update_entity(
        &mut self,
        entity_id: EntityId,
        entity: &Entity,
        entity_type_uri: VersionedUri,
    ) -> Result<(), UpdateError> {
        self.store
            .update_entity(entity_id, entity, entity_type_uri, self.account_id)
            .await
    }

    async fn create_link(
        &mut self,
        source_entity: EntityId,
        target_entity: EntityId,
        link_type_uri: VersionedUri,
    ) -> Result<Link, InsertionError> {
        let link = Link::new(source_entity, target_entity, link_type_uri);
        self.store.create_link(link, self.account_id).await
    }

    pub async fn get_link_target(
        &self,
        source_entity_id: EntityId,
        link_type_uri: VersionedUri,
    ) -> Result<Outgoing, QueryError> {
        self.store
            .get_link_target(source_entity_id, link_type_uri)
            .await
    }

    pub async fn get_entity_links(&self, source_entity_id: EntityId) -> Result<Links, QueryError> {
        self.store.get_entity_links(source_entity_id).await
    }

    async fn remove_link(
        &mut self,
        source_entity: EntityId,
        target_entity: EntityId,
        link_type_uri: VersionedUri,
    ) -> Result<(), LinkActivationError> {
        let link = Link::new(source_entity, target_entity, link_type_uri);
        self.store.inactivate_link(link).await
    }
}

#[tokio::test]
async fn can_connect() {
    DatabaseTestWrapper::new().await;
}
