//! Tests of the DBOS backend against the Postgres database that `infra/compose` starts.
//!
//! DBOS creates its schema itself, which the per-service users of the compose stack may not, so
//! the tests connect as the superuser named by `POSTGRES_USER` and `POSTGRES_PASSWORD`, as the
//! compose file does, to the `postgres` database at `POSTGRES_HOST` and `POSTGRES_PORT`. Each test
//! takes a schema of its own and drops it at the end, so tests run in parallel and leave nothing
//! behind.

extern crate alloc;

use alloc::sync::Arc;
use core::{num::NonZero, time::Duration};

use error_stack::Report;
use hash_integrations_orchestration::{
    FunctionVersion, Payload, RetryPolicy, RunError, RunFunction, RunStart, StepContext, StepName,
    Worker as _,
    dbos::{DbosBackend, DbosConfig},
};
use tokio_postgres::NoTls;
use tokio_util::sync::CancellationToken;
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

/// Doubles its input in one step and adds one in another.
struct DoubleThenAddOne;

impl RunFunction for DoubleThenAddOne {
    type Input = u32;

    const VERSION: FunctionVersion = FunctionVersion::new(1);

    async fn run(
        &self,
        context: &mut impl StepContext,
        input: u32,
    ) -> Result<(), Report<RunError>> {
        let doubled: u32 = context
            .run(step("double"), || async move { Ok(input * 2) })
            .await?;
        let _added: u32 = context
            .run(step("add-one"), || async move { Ok(doubled + 1) })
            .await?;
        Ok(())
    }
}

fn step(name: &str) -> StepName {
    name.parse().expect("should be a step name")
}

fn start(input: u32) -> RunStart {
    RunStart {
        admission: "web/test".parse().expect("should be an admission key"),
        version: DoubleThenAddOne::VERSION,
        policy: RetryPolicy {
            max_attempts: NonZero::new(3).expect("three should be nonzero"),
            initial_delay: Duration::from_millis(10),
            max_delay: Duration::from_millis(100),
            multiplier: NonZero::new(2).expect("two should be nonzero"),
        },
        input: Payload::encode(&input).expect("should encode the input"),
    }
}

/// Polls the run's `workflow_status` row until it reads `expected`, for up to ten seconds.
async fn wait_for_status(
    postgres: &tokio_postgres::Client,
    schema: &str,
    run: &str,
    expected: &str,
) {
    let query = format!("SELECT status FROM \"{schema}\".workflow_status WHERE workflow_uuid = $1");
    for _ in 0..100 {
        let status: String = postgres
            .query_one(&query, &[&run])
            .await
            .expect("should read the run's workflow row")
            .get(0);
        if status == expected {
            return;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("the run should reach {expected} within ten seconds");
}

#[tokio::test]
async fn run_executes_its_steps() {
    let config = config();
    let postgres = postgres().await;
    let backend = Arc::new(
        DbosBackend::connect(config.clone())
            .await
            .expect("should connect"),
    );
    let shutdown = CancellationToken::new();
    let worker = tokio::spawn({
        let (backend, shutdown) = (Arc::clone(&backend), shutdown.clone());
        async move { backend.work(Arc::new(DoubleThenAddOne), shutdown).await }
    });

    backend
        .start("run-1".parse().expect("should be a run ID"), start(20))
        .await
        .expect("should start the run");
    wait_for_status(&postgres, &config.schema, "run-1", "SUCCESS").await;

    shutdown.cancel();
    worker
        .await
        .expect("the worker task should join")
        .expect("the worker should shut down cleanly");
    backend.close().await;
    drop_schema(&postgres, &config.schema).await;
}
