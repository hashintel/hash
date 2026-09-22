use hash_graph_postgres_store::{
    Environment, load_env,
    store::{
        DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
        PostgresStoreSettings,
    },
};
use hash_graph_store::pool::StorePool;
use hash_telemetry::logging::env_filter;
use tokio_postgres::NoTls;

pub(crate) fn init_logging() {
    let _: Result<_, _> = tracing_subscriber::fmt()
        .with_ansi(true)
        .with_env_filter(env_filter(None))
        .with_file(true)
        .with_line_number(true)
        .with_test_writer()
        .try_init();
}

/// The database the tests run against, as the `HASH_GRAPH_PG_*` environment names it.
pub(crate) fn connection_info() -> DatabaseConnectionInfo {
    load_env(Environment::Test);

    let user = std::env::var("HASH_GRAPH_PG_USER").unwrap_or_else(|_| "graph".to_owned());
    let password = std::env::var("HASH_GRAPH_PG_PASSWORD").unwrap_or_else(|_| "graph".to_owned());
    let host = std::env::var("HASH_GRAPH_PG_HOST").unwrap_or_else(|_| "localhost".to_owned());
    let port = std::env::var("HASH_GRAPH_PG_PORT").map_or(5432, |port| {
        port.parse::<u16>().expect("could not parse port")
    });
    let database = std::env::var("HASH_GRAPH_PG_DATABASE").unwrap_or_else(|_| "graph".to_owned());

    DatabaseConnectionInfo::new(DatabaseType::Postgres, user, password, host, port, database)
}

pub struct DatabaseTestWrapper {
    _pool: PostgresStorePool,
    pub connection: <PostgresStorePool as StorePool>::Store<'static>,
}

impl DatabaseTestWrapper {
    pub async fn new() -> Self {
        init_logging();

        let pool = PostgresStorePool::new(
            &connection_info(),
            &DatabasePoolConfig::default(),
            NoTls,
            PostgresStoreSettings::default(),
        )
        .expect("should build the connection pool");

        let connection = pool
            .acquire_owned(None)
            .await
            .expect("could not acquire a database connection");

        Self {
            _pool: pool,
            connection,
        }
    }
}
