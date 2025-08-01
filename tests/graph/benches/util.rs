use core::mem::ManuallyDrop;
use std::{collections::HashMap, fs, path::Path};

use hash_graph_postgres_store::{
    Environment, load_env,
    store::{
        AsClient, DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStore,
        PostgresStorePool, PostgresStoreSettings, error::BaseUrlAlreadyExists,
    },
};
use hash_graph_store::{
    data_type::{CreateDataTypeParams, DataTypeStore as _, UpdateDataTypesParams},
    entity_type::{CreateEntityTypeParams, EntityTypeStore as _, UpdateEntityTypesParams},
    migration::StoreMigration as _,
    pool::StorePool,
    property_type::{CreatePropertyTypeParams, PropertyTypeStore as _, UpdatePropertyTypesParams},
    query::ConflictBehavior,
};
use hash_repo_chores::benches::generate_path;
use tokio::runtime::Runtime;
use tokio_postgres::NoTls;
use tracing::Instrument as _;
use tracing_flame::FlameLayer;
use tracing_subscriber::{prelude::*, registry::Registry};
use type_system::{
    ontology::{
        data_type::DataType,
        entity_type::EntityType,
        property_type::PropertyType,
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{
        actor::{ActorEntityUuid, ActorType},
        actor_group::WebId,
    },
    provenance::{OriginProvenance, OriginType},
};

type Pool = PostgresStorePool;
pub type Store = <Pool as StorePool>::Store<'static>;

// TODO - deduplicate with integration/postgres.rs
pub struct StoreWrapper {
    delete_on_drop: bool,
    pub bench_db_name: String,
    source_db_pool: Pool,
    pool: ManuallyDrop<Pool>,
    pub store: ManuallyDrop<Store>,
    #[expect(clippy::allow_attributes, reason = "False positive")]
    #[allow(dead_code, reason = "False positive")]
    pub account_id: ActorEntityUuid,
}

pub fn setup_subscriber(
    group_id: &str,
    function_id: Option<&str>,
    value_str: Option<&str>,
) -> impl Drop {
    struct Guard<A, B>(A, B);
    #[expect(clippy::empty_drop)]
    impl<A, B> Drop for Guard<A, B> {
        fn drop(&mut self) {}
    }

    let target_dir = Path::new("out").join(generate_path(group_id, function_id, value_str));
    fs::create_dir_all(&target_dir).expect("could not create directory");
    let flame_file = target_dir.join("tracing.folded");

    let (flame_layer, file_guard) =
        FlameLayer::with_file(flame_file).expect("could not create flame layer");

    let subscriber = Registry::default().with(flame_layer);

    let default_guard = tracing::subscriber::set_default(subscriber);
    Guard(default_guard, file_guard)
}

impl StoreWrapper {
    #[expect(clippy::too_many_lines)]
    pub async fn new(
        bench_db_name: &str,
        fail_on_exists: bool,
        delete_on_drop: bool,
        account_id: ActorEntityUuid,
    ) -> Self {
        load_env(Environment::Test);

        let super_user = std::env::var("POSTGRES_USER").unwrap_or_else(|_| "postgres".to_owned());
        let super_password =
            std::env::var("POSTGRES_PASSWORD").unwrap_or_else(|_| "postgres".to_owned());

        let user = std::env::var("HASH_GRAPH_PG_USER").unwrap_or_else(|_| "graph".to_owned());
        let password =
            std::env::var("HASH_GRAPH_PG_PASSWORD").unwrap_or_else(|_| "graph".to_owned());
        let host = std::env::var("HASH_GRAPH_PG_HOST").unwrap_or_else(|_| "localhost".to_owned());
        let port = std::env::var("HASH_GRAPH_PG_PORT")
            .map(|port| {
                port.parse::<u16>()
                    .unwrap_or_else(|_| panic!("{port} is not a valid port"))
            })
            .unwrap_or(5432);
        let database =
            std::env::var("HASH_GRAPH_PG_DATABASE").unwrap_or_else(|_| "graph".to_owned());

        let source_db_connection_info = DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            super_user.clone(), // super user as we need to create and delete tables
            super_password.clone(),
            host.clone(),
            port,
            database,
        );

        let bench_db_connection_info = DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            user,
            password,
            host.clone(),
            port,
            bench_db_name.to_owned(),
        );

        let source_db_pool = PostgresStorePool::new(
            &source_db_connection_info,
            &DatabasePoolConfig::default(),
            NoTls,
            PostgresStoreSettings::default(),
        )
        .await
        .expect("could not connect to database");

        // Create a new connection to the source database, copy the database, drop the connection
        {
            let conn = source_db_pool
                .acquire_owned(None)
                .await
                .expect("could not acquire a database connection");
            let client = conn.as_client();

            let exists: bool = client
                .query_one(
                    "
                    SELECT EXISTS(
                        SELECT 1 FROM pg_catalog.pg_database WHERE datname = $1
                    );
                    ",
                    &[&bench_db_name],
                )
                .instrument(tracing::info_span!(
                    "SELECT",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres"
                ))
                .await
                .expect("failed to check if database exists")
                .get(0);

            assert!(
                !(fail_on_exists && exists),
                "database `{bench_db_name}` exists, and `fails_on_exists` was set to true",
            );

            if !(exists) {
                client
                    .execute(
                        "
                        /* KILL ALL EXISTING CONNECTION FROM ORIGINAL DB*/
                        SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity
                        WHERE pg_stat_activity.datname = $1 AND pid <> pg_backend_pid();
                        ",
                        &[&source_db_connection_info.database()],
                    )
                    .instrument(tracing::info_span!(
                        "SELECT",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
                    .await
                    .expect("failed to kill existing connections");

                client
                    .execute(
                        &format!(
                            "
                            /* CLONE DATABASE TO NEW ONE */
                            CREATE DATABASE {bench_db_name} WITH TEMPLATE {} OWNER {};
                            ",
                            source_db_connection_info.database(),
                            bench_db_connection_info.user()
                        ),
                        &[],
                    )
                    .instrument(tracing::info_span!(
                        "CREATE DATABASE",
                        otel.kind = "client",
                        db.system = "postgresql",
                        peer.service = "Postgres"
                    ))
                    .await
                    .expect("failed to clone database");
            }
        }

        // Connect as super user and run the migrations
        {
            let db_pool = PostgresStorePool::new(
                &DatabaseConnectionInfo::new(
                    DatabaseType::Postgres,
                    super_user,
                    super_password,
                    host,
                    port,
                    bench_db_name.to_owned(),
                ),
                &DatabasePoolConfig::default(),
                NoTls,
                PostgresStoreSettings::default(),
            )
            .await
            .expect("could not connect to database");

            db_pool
                .acquire(None)
                .await
                .expect("could not acquire a database connection")
                .run_migrations()
                .await
                .expect("could not run migrations");
        }

        let pool = PostgresStorePool::new(
            &bench_db_connection_info,
            &DatabasePoolConfig::default(),
            NoTls,
            PostgresStoreSettings::default(),
        )
        .await
        .expect("could not connect to database");

        // _owned is necessary as otherwise we have a self-referential struct
        let store = pool
            .acquire_owned(None)
            .await
            .expect("could not acquire a database connection");

        Self {
            delete_on_drop,
            source_db_pool,
            bench_db_name: bench_db_name.to_owned(),
            pool: ManuallyDrop::new(pool),
            store: ManuallyDrop::new(store),
            account_id,
        }
    }
}

impl Drop for StoreWrapper {
    fn drop(&mut self) {
        if !(self.delete_on_drop) {
            return;
        }
        #[expect(unsafe_code)]
        // We're in the process of dropping the parent struct, we just need to ensure we release
        // the connections of this pool before deleting the database
        // SAFETY: The values of `store` and `pool` are not accessed after dropping
        unsafe {
            ManuallyDrop::drop(&mut self.store);
            ManuallyDrop::drop(&mut self.pool);
        }

        let runtime = Runtime::new().expect("could not create runtime");
        runtime.block_on(async {
            self.source_db_pool
                .acquire_owned(None)
                .await
                .expect("could not acquire a database connection")
                .as_client()
                .execute(
                    &format!(
                        "
                        DROP DATABASE IF EXISTS {};
                        ",
                        self.bench_db_name
                    ),
                    &[],
                )
                .instrument(tracing::info_span!(
                    "DROP DATABASE",
                    otel.kind = "client",
                    db.system = "postgresql",
                    peer.service = "Postgres"
                ))
                .await
                .expect("failed to drop database");
        });
    }
}

#[expect(clippy::too_many_lines)]
pub async fn seed<D, P, E, C>(
    store: &mut PostgresStore<C>,
    account_id: ActorEntityUuid,
    data_types: D,
    property_types: P,
    entity_types: E,
) where
    D: IntoIterator<Item = &'static str, IntoIter: Send> + Send,
    P: IntoIterator<Item = &'static str, IntoIter: Send> + Send,
    E: IntoIterator<Item = &'static str, IntoIter: Send> + Send,
    C: AsClient,
{
    for data_type_str in data_types {
        let data_type: DataType =
            serde_json::from_str(data_type_str).expect("could not parse data type");

        match store
            .create_data_type(
                account_id,
                CreateDataTypeParams {
                    schema: data_type.clone(),
                    ownership: OntologyOwnership::Local {
                        web_id: WebId::new(account_id),
                    },
                    conflict_behavior: ConflictBehavior::Fail,
                    provenance: ProvidedOntologyEditionProvenance {
                        actor_type: ActorType::User,
                        origin: OriginProvenance::from_empty_type(OriginType::Api),
                        sources: Vec::new(),
                    },
                    conversions: HashMap::new(),
                },
            )
            .await
        {
            Ok(_) => {}
            Err(report) => {
                if report.contains::<BaseUrlAlreadyExists>() {
                    store
                        .update_data_type(
                            account_id,
                            UpdateDataTypesParams {
                                schema: data_type,
                                provenance: ProvidedOntologyEditionProvenance {
                                    actor_type: ActorType::User,
                                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                                    sources: Vec::new(),
                                },
                                conversions: HashMap::new(),
                            },
                        )
                        .await
                        .expect("failed to update data type");
                } else {
                    panic!("failed to create data type: {report:?}");
                }
            }
        }
    }

    for property_type_str in property_types {
        let property_type: PropertyType =
            serde_json::from_str(property_type_str).expect("could not parse property type");

        match store
            .create_property_type(
                account_id,
                CreatePropertyTypeParams {
                    schema: property_type.clone(),
                    ownership: OntologyOwnership::Local {
                        web_id: WebId::new(account_id),
                    },
                    conflict_behavior: ConflictBehavior::Fail,
                    provenance: ProvidedOntologyEditionProvenance {
                        actor_type: ActorType::User,
                        origin: OriginProvenance::from_empty_type(OriginType::Api),
                        sources: Vec::new(),
                    },
                },
            )
            .await
        {
            Ok(_) => {}
            Err(report) => {
                if report.contains::<BaseUrlAlreadyExists>() {
                    store
                        .update_property_type(
                            account_id,
                            UpdatePropertyTypesParams {
                                schema: property_type,
                                provenance: ProvidedOntologyEditionProvenance {
                                    actor_type: ActorType::User,
                                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                                    sources: Vec::new(),
                                },
                            },
                        )
                        .await
                        .expect("failed to update property type");
                } else {
                    panic!("failed to create property type: {report:?}");
                }
            }
        }
    }

    for entity_type_str in entity_types {
        let entity_type: EntityType =
            serde_json::from_str(entity_type_str).expect("could not parse entity type");

        match store
            .create_entity_type(
                account_id,
                CreateEntityTypeParams {
                    schema: entity_type.clone(),
                    ownership: OntologyOwnership::Local {
                        web_id: WebId::new(account_id),
                    },
                    conflict_behavior: ConflictBehavior::Fail,
                    provenance: ProvidedOntologyEditionProvenance {
                        actor_type: ActorType::User,
                        origin: OriginProvenance::from_empty_type(OriginType::Api),
                        sources: Vec::new(),
                    },
                },
            )
            .await
        {
            Ok(_) => {}
            Err(report) => {
                if report.contains::<BaseUrlAlreadyExists>() {
                    store
                        .update_entity_type(
                            account_id,
                            UpdateEntityTypesParams {
                                schema: entity_type,
                                provenance: ProvidedOntologyEditionProvenance {
                                    actor_type: ActorType::User,
                                    origin: OriginProvenance::from_empty_type(OriginType::Api),
                                    sources: Vec::new(),
                                },
                            },
                        )
                        .await
                        .expect("failed to update entity type");
                } else {
                    panic!("failed to create entity type: {report:?}");
                }
            }
        }
    }
}

pub fn setup(
    db_name: &str,
    fail_on_exists: bool,
    delete_on_drop: bool,
    account_id: ActorEntityUuid,
) -> (Runtime, StoreWrapper) {
    let runtime = Runtime::new().expect("could not create runtime");

    let store_wrapper = runtime.block_on(StoreWrapper::new(
        db_name,
        fail_on_exists,
        delete_on_drop,
        account_id,
    ));
    (runtime, store_wrapper)
}
