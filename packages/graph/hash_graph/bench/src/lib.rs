use std::{mem::ManuallyDrop, str::FromStr};

use graph::{
    ontology::AccountId,
    store::{
        AsClient, DataTypeStore, DatabaseConnectionInfo, DatabaseType, EntityTypeStore,
        LinkTypeStore, PostgresStorePool, PropertyTypeStore, StorePool,
    },
};
use tokio::runtime::Runtime;
use tokio_postgres::NoTls;
use type_system::{DataType, EntityType, LinkType, PropertyType};

type Pool = PostgresStorePool<NoTls>;
pub type Store = <Pool as StorePool>::Store<'static>;

// TODO - deduplicate with integration/postgres/mod.rs
pub struct StoreWrapper {
    bench_db_name: String,
    source_db_pool: Pool,
    _pool: ManuallyDrop<Pool>,
    pub store: ManuallyDrop<Store>,
}

impl StoreWrapper {
    pub async fn new(bench_db_name: &str) -> Self {
        let source_db_connection_info = DatabaseConnectionInfo::new(
            // TODO - get these from env
            DatabaseType::Postgres,
            "postgres".to_owned(), // super user as we need to create an delete tables
            "postgres".to_owned(),
            "localhost".to_owned(),
            5432,
            "graph".to_owned(),
        );

        let source_db_pool = PostgresStorePool::new(&source_db_connection_info, NoTls)
            .await
            .expect("could not connect to database");

        // Create a new connection to the source database, copy the database, drop the connection
        {
            let conn = source_db_pool
                .acquire_owned()
                .await
                .expect("could not acquire a database connection");
            let client = conn.as_client();

            let _ = client.execute(
                r#"
                        /* KILL ALL EXISTING CONNECTION FROM ORIGINAL DB (sourcedb)*/
                        SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity
                        WHERE pg_stat_activity.datname = '{DEV_DATABASE}' AND pid <> pg_backend_pid();
                        "#,
                &[],
            ).await.expect("failed to kill existing connections");

            let _ = client
                .execute(
                    &format!(
                        r#"
                        /* CLONE DATABASE TO NEW ONE(TARGET_DB) */
                        CREATE DATABASE {bench_db_name} WITH TEMPLATE {} OWNER {};
                        "#,
                        source_db_connection_info.database(),
                        source_db_connection_info.user()
                    ),
                    &[],
                )
                .await
                .expect("failed to clone database");
        }

        let bench_db_connection_info = DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            "graph".to_owned(),
            "graph".to_owned(),
            "localhost".to_owned(),
            5432,
            bench_db_name.to_owned(),
        );

        let pool = PostgresStorePool::new(&bench_db_connection_info, NoTls)
            .await
            .expect("could not connect to database");

        let store = pool
            .acquire_owned() // _owned is necessary as otherwise we have a self-referential struct
            .await
            .expect("could not acquire a database connection");

        Self {
            source_db_pool,
            bench_db_name: bench_db_name.to_owned(),
            _pool: ManuallyDrop::new(pool),
            store: ManuallyDrop::new(store),
        }
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

impl Drop for StoreWrapper {
    fn drop(&mut self) {
        // SAFETY: We're in the process of dropping the parent struct, we just need to ensure we
        //  release the connections of this pool before deleting the database
        unsafe {
            ManuallyDrop::drop(&mut self.store);
            ManuallyDrop::drop(&mut self._pool);
        }

        let runtime = Runtime::new().unwrap();
        runtime.block_on(async {
            let conn = self
                .source_db_pool
                .acquire_owned()
                .await
                .expect("could not acquire a database connection");

            conn.as_client()
                .execute(
                    &format!(
                        r#"
                        DROP DATABASE IF EXISTS {};
                        "#,
                        self.bench_db_name
                    ),
                    &[],
                )
                .await
                .expect("failed to drop database");
        });
    }
}

pub fn setup(db_name: &str) -> (Runtime, StoreWrapper) {
    let runtime = Runtime::new().unwrap();

    let store_wrapper = runtime.block_on(StoreWrapper::new(db_name));
    (runtime, store_wrapper)
}
