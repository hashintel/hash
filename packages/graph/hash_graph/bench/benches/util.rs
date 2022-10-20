use std::{mem::ManuallyDrop, str::FromStr};

use graph::{
    ontology::AccountId,
    store::{
        AsClient, BaseUriAlreadyExists, DataTypeStore, DatabaseConnectionInfo, DatabaseType,
        EntityTypeStore, LinkTypeStore, PostgresStore, PostgresStorePool, PropertyTypeStore,
        StorePool,
    },
};
use tokio::runtime::Runtime;
use tokio_postgres::NoTls;
use type_system::{DataType, EntityType, LinkType, PropertyType};

type Pool = PostgresStorePool<NoTls>;
pub type Store = <Pool as StorePool>::Store<'static>;

// TODO - deduplicate with integration/postgres/mod.rs
pub struct StoreWrapper {
    delete_on_drop: bool,
    pub bench_db_name: String,
    source_db_pool: Pool,
    pool: ManuallyDrop<Pool>,
    pub store: ManuallyDrop<Store>,
}

impl StoreWrapper {
    pub async fn new(bench_db_name: &str, fail_on_exists: bool, delete_on_drop: bool) -> Self {
        let source_db_connection_info = DatabaseConnectionInfo::new(
            // TODO - get these from env
            //  https://app.asana.com/0/0/1203071961523005/f
            DatabaseType::Postgres,
            "postgres".to_owned(), // super user as we need to create and delete tables
            "postgres".to_owned(),
            "localhost".to_owned(),
            5432,
            "graph".to_owned(),
        );

        let bench_db_connection_info = DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            "graph".to_owned(),
            "graph".to_owned(),
            "localhost".to_owned(),
            5432,
            bench_db_name.to_owned(),
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

            let exists: bool = client
                .query_one(
                    r#"
                    SELECT EXISTS(
                        SELECT 1 FROM pg_catalog.pg_database WHERE datname = $1
                    );
                    "#,
                    &[&bench_db_name],
                )
                .await
                .expect("failed to check if database exists")
                .get(0);

            assert!(
                !(fail_on_exists && exists),
                "database `{}` exists, and `fails_on_exists` was set to true",
                bench_db_name
            );

            if !(exists) {
                client
                    .execute(
                        r#"
                        /* KILL ALL EXISTING CONNECTION FROM ORIGINAL DB*/
                        SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity
                        WHERE pg_stat_activity.datname = $1 AND pid <> pg_backend_pid();
                        "#,
                        &[&source_db_connection_info.database()],
                    )
                    .await
                    .expect("failed to kill existing connections");

                client
                    .execute(
                        &format!(
                            r#"
                            /* CLONE DATABASE TO NEW ONE */
                            CREATE DATABASE {bench_db_name} WITH TEMPLATE {} OWNER {};
                            "#,
                            source_db_connection_info.database(),
                            bench_db_connection_info.user()
                        ),
                        &[],
                    )
                    .await
                    .expect("failed to clone database");
            }
        }

        let pool = PostgresStorePool::new(&bench_db_connection_info, NoTls)
            .await
            .expect("could not connect to database");

        // _owned is necessary as otherwise we have a self-referential struct
        let store = pool
            .acquire_owned()
            .await
            .expect("could not acquire a database connection");

        Self {
            delete_on_drop,
            source_db_pool,
            bench_db_name: bench_db_name.to_owned(),
            pool: ManuallyDrop::new(pool),
            store: ManuallyDrop::new(store),
        }
    }
}

impl Drop for StoreWrapper {
    fn drop(&mut self) {
        if !(self.delete_on_drop) {
            return;
        }
        // We're in the process of dropping the parent struct, we just need to ensure we release
        // the connections of this pool before deleting the database
        // SAFETY: The values of `store` and `pool` are not accessed after dropping
        unsafe {
            ManuallyDrop::drop(&mut self.store);
            ManuallyDrop::drop(&mut self.pool);
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

pub async fn seed<D, P, L, E, C>(
    store: &mut PostgresStore<C>,
    owned_by_id: AccountId,
    data_types: D,
    property_types: P,
    link_types: L,
    entity_types: E,
) where
    D: IntoIterator<Item = &'static str>,
    P: IntoIterator<Item = &'static str>,
    L: IntoIterator<Item = &'static str>,
    E: IntoIterator<Item = &'static str>,
    C: AsClient,
{
    for data_type_str in data_types {
        let data_type = DataType::from_str(data_type_str).expect("could not parse data type");

        match store
            .create_data_type(data_type.clone(), owned_by_id, owned_by_id)
            .await
        {
            Ok(_) => {}
            Err(report) => {
                if report.contains::<BaseUriAlreadyExists>() {
                    store
                        .update_data_type(data_type, owned_by_id)
                        .await
                        .expect("failed to update data type");
                } else {
                    Err(report).expect("failed to create data type")
                }
            }
        }
    }

    for property_type_str in property_types {
        let property_type =
            PropertyType::from_str(property_type_str).expect("could not parse property type");

        match store
            .create_property_type(property_type.clone(), owned_by_id, owned_by_id)
            .await
        {
            Ok(_) => {}
            Err(report) => {
                if report.contains::<BaseUriAlreadyExists>() {
                    store
                        .update_property_type(property_type, owned_by_id)
                        .await
                        .expect("failed to update property type");
                } else {
                    Err(report).expect("failed to create property type")
                }
            }
        }
    }

    // Insert link types before entity types so entity types can refer to them
    for link_type_str in link_types {
        let link_type = LinkType::from_str(link_type_str).expect("could not parse link type");

        match store
            .create_link_type(link_type.clone(), owned_by_id, owned_by_id)
            .await
        {
            Ok(_) => {}
            Err(report) => {
                if report.contains::<BaseUriAlreadyExists>() {
                    store
                        .update_link_type(link_type, owned_by_id)
                        .await
                        .expect("failed to update link type");
                } else {
                    Err(report).expect("failed to create link type")
                }
            }
        }
    }

    for entity_type_str in entity_types {
        let entity_type =
            EntityType::from_str(entity_type_str).expect("could not parse entity type");

        match store
            .create_entity_type(entity_type.clone(), owned_by_id, owned_by_id)
            .await
        {
            Ok(_) => {}
            Err(report) => {
                if report.contains::<BaseUriAlreadyExists>() {
                    store
                        .update_entity_type(entity_type, owned_by_id)
                        .await
                        .expect("failed to update entity type");
                } else {
                    Err(report).expect("failed to create entity type")
                }
            }
        }
    }
}

pub fn setup(db_name: &str, fail_on_exists: bool, delete_on_drop: bool) -> (Runtime, StoreWrapper) {
    let runtime = Runtime::new().unwrap();

    let store_wrapper =
        runtime.block_on(StoreWrapper::new(db_name, fail_on_exists, delete_on_drop));
    (runtime, store_wrapper)
}
