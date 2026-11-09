//! Tests of the DBOS backend against the Postgres database that `infra/compose` starts.
//!
//! DBOS creates its schema itself, which the per-service users of the compose stack may not, so
//! the tests connect as the superuser named by `POSTGRES_USER` and `POSTGRES_PASSWORD`, as the
//! compose file does, to the `postgres` database at `POSTGRES_HOST` and `POSTGRES_PORT`. Each test
//! takes a schema of its own and drops it at the end, so tests run in parallel and leave nothing
//! behind.

extern crate alloc;

use alloc::sync::Arc;
use core::{
    num::NonZero,
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

use error_stack::Report;
use hash_integrations_orchestration::{
    BackendError, FunctionVersion, Payload, RetryPolicy, RunError, RunFunction, RunId, RunPhase,
    RunStart, RunStatus, Runs as _, StartError, StepContext, StepName, Worker as _,
    dbos::{DbosBackend, DbosConfig},
};
use tokio::{sync::Notify, task::JoinHandle};
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

/// Three steps, of which the second waits until the test releases it.
struct Gated {
    release: Notify,
    ran_last: AtomicBool,
}

impl RunFunction for Gated {
    type Input = ();

    const VERSION: FunctionVersion = FunctionVersion::new(1);

    async fn run(&self, context: &mut impl StepContext, (): ()) -> Result<(), Report<RunError>> {
        context.run(step("first"), || async { Ok(()) }).await?;
        context
            .run(step("wait"), || async {
                self.release.notified().await;
                Ok(())
            })
            .await?;
        context
            .run(step("last"), || async {
                self.ran_last.store(true, Ordering::SeqCst);
                Ok(())
            })
            .await
    }
}

fn step(name: &str) -> StepName {
    name.parse().expect("should be a step name")
}

fn run_id(name: &str) -> RunId {
    name.parse().expect("should be a run ID")
}

fn start<T: serde::Serialize>(version: FunctionVersion, input: &T) -> RunStart {
    RunStart {
        admission: "web/test".parse().expect("should be an admission key"),
        version,
        policy: RetryPolicy {
            max_attempts: NonZero::new(3).expect("three should be nonzero"),
            initial_delay: Duration::from_millis(10),
            max_delay: Duration::from_millis(100),
            multiplier: NonZero::new(2).expect("two should be nonzero"),
        },
        input: Payload::encode(input).expect("should encode the input"),
    }
}

/// Runs `function` on a worker until the returned token is cancelled.
fn spawn_worker<F: RunFunction + 'static>(
    backend: &Arc<DbosBackend>,
    function: Arc<F>,
) -> (
    JoinHandle<Result<(), Report<BackendError>>>,
    CancellationToken,
) {
    let shutdown = CancellationToken::new();
    let worker = tokio::spawn({
        let (backend, shutdown) = (Arc::clone(backend), shutdown.clone());
        async move { backend.work(function, shutdown).await }
    });
    (worker, shutdown)
}

/// Polls the run's status until `done` accepts it, for up to ten seconds.
async fn wait_until(
    backend: &DbosBackend,
    run: &RunId,
    done: impl Fn(&RunStatus) -> bool,
) -> RunStatus {
    for _ in 0..100 {
        let status = backend
            .status(run)
            .await
            .expect("should read the run's status")
            .expect("the run should exist");
        if done(&status) {
            return status;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    panic!("the run should reach the expected status within ten seconds");
}

async fn stop_worker(
    worker: JoinHandle<Result<(), Report<BackendError>>>,
    shutdown: &CancellationToken,
) {
    shutdown.cancel();
    worker
        .await
        .expect("the worker task should join")
        .expect("the worker should shut down cleanly");
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
    let (worker, shutdown) = spawn_worker(&backend, Arc::new(DoubleThenAddOne));
    let run = run_id("run-1");

    backend
        .start(run.clone(), start(DoubleThenAddOne::VERSION, &20_u32))
        .await
        .expect("should start the run");
    let status = wait_until(&backend, &run, |status| {
        status.phase != RunPhase::Pending && status.phase != RunPhase::Running
    })
    .await;

    assert_eq!(
        status,
        RunStatus {
            phase: RunPhase::Completed,
            steps_recorded: 2
        }
    );
    stop_worker(worker, &shutdown).await;
    backend.close().await;
    drop_schema(&postgres, &config.schema).await;
}

/// Without a worker, a started run stays queued and holds its admission key.
#[tokio::test]
async fn start_without_worker() {
    let config = config();
    let postgres = postgres().await;
    let backend = DbosBackend::connect(config.clone())
        .await
        .expect("should connect");
    let first = start(DoubleThenAddOne::VERSION, &20_u32);

    backend
        .start(run_id("run-1"), first.clone())
        .await
        .expect("should start the run");
    backend
        .start(run_id("run-1"), first)
        .await
        .expect("starting the same run again should attach to it");

    let mismatch = backend
        .start(run_id("run-1"), start(DoubleThenAddOne::VERSION, &21_u32))
        .await
        .expect_err("a different start under the same ID should be rejected");
    assert_eq!(*mismatch.current_context(), StartError::StartMismatch);

    let active = backend
        .start(run_id("run-2"), start(DoubleThenAddOne::VERSION, &20_u32))
        .await
        .expect_err("a second run under an active admission key should be rejected");
    assert_eq!(
        *active.current_context(),
        StartError::AlreadyActive {
            active: run_id("run-1")
        }
    );

    assert_eq!(
        backend
            .status(&run_id("run-1"))
            .await
            .expect("should read the status"),
        Some(RunStatus {
            phase: RunPhase::Pending,
            steps_recorded: 0
        })
    );
    assert_eq!(
        backend
            .status(&run_id("run-9"))
            .await
            .expect("should read the status"),
        None,
        "an unknown run should have no status"
    );
    backend.close().await;
    drop_schema(&postgres, &config.schema).await;
}

#[tokio::test]
async fn cancel_stops_before_the_next_step() {
    let config = config();
    let postgres = postgres().await;
    let backend = Arc::new(
        DbosBackend::connect(config.clone())
            .await
            .expect("should connect"),
    );
    let function = Arc::new(Gated {
        release: Notify::new(),
        ran_last: AtomicBool::new(false),
    });
    let (worker, shutdown) = spawn_worker(&backend, Arc::clone(&function));
    let run = run_id("run-1");

    backend
        .start(run.clone(), start(Gated::VERSION, &()))
        .await
        .expect("should start the run");
    let running = wait_until(&backend, &run, |status| status.steps_recorded == 1).await;
    assert_eq!(running.phase, RunPhase::Running);

    backend.cancel(&run).await.expect("should cancel the run");
    function.release.notify_one();
    let cancelled = wait_until(&backend, &run, |status| status.steps_recorded == 2).await;

    assert_eq!(cancelled.phase, RunPhase::Cancelled);
    assert!(
        !function.ran_last.load(Ordering::SeqCst),
        "the step after the cancel should not run"
    );
    backend
        .cancel(&run_id("run-9"))
        .await
        .expect("cancelling an unknown run should succeed");
    stop_worker(worker, &shutdown).await;
    backend.close().await;
    drop_schema(&postgres, &config.schema).await;
}
