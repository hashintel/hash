//! Tests of the DBOS backend against the Postgres database that `infra/compose` starts.
//!
//! DBOS creates its schema itself, which the per-service users of the compose stack may not, so
//! the tests connect as the superuser named by `POSTGRES_USER` and `POSTGRES_PASSWORD`, as the
//! compose file does, to the `postgres` database at `POSTGRES_HOST` and `POSTGRES_PORT`. Each test
//! takes a schema of its own and drops it at the end, so tests run in parallel and leave nothing
//! behind.

use hash_integrations_orchestration::dbos::{DbosBackend, DbosConfig};
use tokio_postgres::NoTls;
use uuid::Uuid;

fn database_url() -> String {
    let user = std::env::var("POSTGRES_USER").unwrap_or_else(|_| "postgres".to_owned());
    let password = std::env::var("POSTGRES_PASSWORD").unwrap_or_else(|_| "postgres".to_owned());
    let host = std::env::var("POSTGRES_HOST").unwrap_or_else(|_| "localhost".to_owned());
    let port = std::env::var("POSTGRES_PORT").unwrap_or_else(|_| "5432".to_owned());
    format!("postgres://{user}:{password}@{host}:{port}/postgres")
}

/// A configuration whose schema no other test uses.
fn config() -> DbosConfig {
    let mut config = DbosConfig::new(database_url());
    config.schema = format!("dbos_test_{}", Uuid::new_v4().simple());
    config
}

async fn postgres() -> tokio_postgres::Client {
    let (client, connection) = tokio_postgres::connect(&database_url(), NoTls)
        .await
        .expect("should connect to the compose Postgres");
    tokio::spawn(async move {
        connection
            .await
            .expect("the connection should stay open until the client is dropped");
    });
    client
}

async fn table_count(postgres: &tokio_postgres::Client, schema: &str) -> i64 {
    postgres
        .query_one(
            "SELECT count(*) FROM information_schema.tables WHERE table_schema = $1",
            &[&schema],
        )
        .await
        .expect("should count the schema's tables")
        .get(0)
}

async fn drop_schema(postgres: &tokio_postgres::Client, schema: &str) {
    postgres
        .batch_execute(&format!("DROP SCHEMA \"{schema}\" CASCADE"))
        .await
        .expect("should drop the test schema");
}

#[tokio::test]
async fn connect_migrates_the_schema() {
    let config = config();
    let postgres = postgres().await;
    assert_eq!(
        table_count(&postgres, &config.schema).await,
        0,
        "a fresh schema should have no tables"
    );

    let backend = DbosBackend::connect(config.clone())
        .await
        .expect("should migrate a fresh schema and connect");
    backend.close().await;
    assert!(
        table_count(&postgres, &config.schema).await > 0,
        "DBOS should have created its tables"
    );

    let backend = DbosBackend::connect(config.clone())
        .await
        .expect("should connect to a migrated schema");
    backend.close().await;

    drop_schema(&postgres, &config.schema).await;
}
