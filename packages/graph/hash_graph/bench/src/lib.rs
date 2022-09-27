use std::str::FromStr;

use graph::{
    ontology::AccountId,
    store::{
        DataTypeStore, DatabaseConnectionInfo, DatabaseType, EntityTypeStore, LinkTypeStore,
        PostgresStorePool, PropertyTypeStore, StorePool,
    },
};
use tokio::runtime::Runtime;
use tokio_postgres::NoTls;
use type_system::{DataType, EntityType, LinkType, PropertyType};

type Pool = PostgresStorePool<NoTls>;
pub type Store = <Pool as StorePool>::Store<'static>;

// TODO - deduplicate with integration/postgres/mod.rs
pub struct StoreWrapper {
    _pool: Pool,
    pub store: Store,
}

impl StoreWrapper {
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

        let store = pool
            .acquire_owned() // necessary as otherwise we have a self-referential struct
            .await
            .expect("could not acquire a database connection");

        Self { _pool: pool, store }
    }

    pub async fn seed<D, P, L, E>(
        &mut self,
        account_id: AccountId,
        data_types: D,
        property_types: P,
        link_types: L,
        entity_types: E,
    ) where
        D: IntoIterator<Item = &'static str>,
        P: IntoIterator<Item = &'static str>,
        L: IntoIterator<Item = &'static str>,
        E: IntoIterator<Item = &'static str>,
    {
        for data_type in data_types {
            self.store
                .create_data_type(
                    DataType::from_str(data_type).expect("could not parse data type"),
                    account_id,
                )
                .await
                .expect("failed to create data type");
        }

        for property_type in property_types {
            self.store
                .create_property_type(
                    PropertyType::from_str(property_type).expect("could not parse property type"),
                    account_id,
                )
                .await
                .expect("failed to create property type");
        }

        // Insert link types before entity types so entity types can refer to them
        for link_type in link_types {
            self.store
                .create_link_type(
                    LinkType::from_str(link_type).expect("could not parse link type"),
                    account_id,
                )
                .await
                .expect("failed to create link type");
        }

        for entity_type in entity_types {
            self.store
                .create_entity_type(
                    EntityType::from_str(entity_type).expect("could not parse entity type"),
                    account_id,
                )
                .await
                .expect("failed to create entity type");
        }
    }
}

pub fn setup() -> (Runtime, StoreWrapper) {
    let runtime = Runtime::new().unwrap();

    let store_wrapper = runtime.block_on(StoreWrapper::new());
    (runtime, store_wrapper)
}
