use hash_crypto::Secret;
use hash_graph_postgres_store::{
    Environment, load_env,
    store::{
        DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
        PostgresStoreSettings,
    },
};

pub(super) fn pool() -> PostgresStorePool {
    load_env(Environment::Test);
    let connection_info = DatabaseConnectionInfo::new(
        DatabaseType::Postgres,
        std::env::var("HASH_GRAPH_PG_USER").unwrap_or_else(|_| "graph".to_owned()),
        Secret::from_string(
            std::env::var("HASH_GRAPH_PG_PASSWORD").unwrap_or_else(|_| "graph".to_owned()),
        ),
        std::env::var("HASH_GRAPH_PG_HOST").unwrap_or_else(|_| "localhost".to_owned()),
        std::env::var("HASH_GRAPH_PG_PORT").map_or(5432, |port| {
            port.parse().expect("the Postgres port should be valid")
        }),
        std::env::var("HASH_GRAPH_PG_DATABASE").unwrap_or_else(|_| "graph".to_owned()),
    );
    PostgresStorePool::new(
        &connection_info,
        &DatabasePoolConfig::default(),
        PostgresStoreSettings::default(),
    )
    .expect("the Postgres pool should be configured")
}
