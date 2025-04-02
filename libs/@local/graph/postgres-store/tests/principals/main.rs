#![expect(clippy::panic_in_result_fn, clippy::significant_drop_tightening)]
#![feature(assert_matches)]

mod ai;
mod machine;
mod role;
mod team;
mod user;
mod web;

use error_stack::Report;
use hash_graph_authorization::{AuthorizationApi, NoAuthorization};
use hash_graph_postgres_store::{
    Environment, load_env,
    store::{
        AsClient, DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStore,
        PostgresStorePool, PostgresStoreSettings, error::StoreError,
    },
};
use hash_graph_store::pool::StorePool;
use hash_tracing::logging::env_filter;
use tokio_postgres::NoTls;

pub fn init_logging() {
    // It's likely that the initialization failed due to a previous initialization attempt. In this
    // case, we can ignore the error.
    let _: Result<_, _> = tracing_subscriber::fmt()
        .with_ansi(true)
        .with_env_filter(env_filter(None))
        .with_file(true)
        .with_line_number(true)
        .with_test_writer()
        .try_init();
}

pub struct DatabaseTestWrapper<A: AuthorizationApi> {
    _pool: PostgresStorePool,
    connection: <PostgresStorePool as StorePool>::Store<'static, A>,
}

impl DatabaseTestWrapper<NoAuthorization> {
    pub(crate) async fn new() -> Self {
        load_env(Environment::Test);
        init_logging();

        let user = std::env::var("HASH_GRAPH_PG_USER").unwrap_or_else(|_| "graph".to_owned());
        let password =
            std::env::var("HASH_GRAPH_PG_PASSWORD").unwrap_or_else(|_| "graph".to_owned());
        let host = std::env::var("HASH_GRAPH_PG_HOST").unwrap_or_else(|_| "localhost".to_owned());
        let port = std::env::var("HASH_GRAPH_PG_PORT")
            .map(|port| port.parse::<u16>().expect("could not parse port"))
            .unwrap_or(5432);
        let database =
            std::env::var("HASH_GRAPH_PG_DATABASE").unwrap_or_else(|_| "graph".to_owned());

        let connection_info = DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            user,
            password,
            host,
            port,
            database,
        );

        let pool = PostgresStorePool::new(
            &connection_info,
            &DatabasePoolConfig::default(),
            NoTls,
            PostgresStoreSettings::default(),
        )
        .await
        .expect("could not connect to database");

        let connection = pool
            .acquire_owned(NoAuthorization, None)
            .await
            .expect("could not acquire a database connection");

        Self {
            _pool: pool,
            connection,
        }
    }

    pub(crate) async fn client(
        &mut self,
    ) -> Result<PostgresStore<impl AsClient, impl AuthorizationApi>, Report<StoreError>> {
        self.connection.transaction().await
    }
}
