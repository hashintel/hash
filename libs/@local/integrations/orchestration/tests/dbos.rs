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
    future::{Future, ready},
    num::NonZero,
    sync::atomic::{AtomicBool, AtomicU32, Ordering},
    time::Duration,
};

use error_stack::Report;
use hash_integrations_orchestration::{
    BackendError, FailureKind, FunctionVersion, Payload, RetryPolicy, RunError, RunFailure,
    RunFunction, RunId, RunPhase, RunStart, RunStatus, Runs as _, StartError, StepContext,
    StepFailure, StepIndex, StepName, Worker as _,
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

const fn finished(status: &RunStatus) -> bool {
    matches!(
        status.phase,
        RunPhase::Completed | RunPhase::Failed(_) | RunPhase::Cancelled
    )
}

/// Starts one run of `function` on a worker, waits for it to finish and returns its status.
async fn run_to_end<F: RunFunction + 'static>(
    function: Arc<F>,
    input: &(impl serde::Serialize + Sync),
) -> RunStatus {
    let config = config();
    let postgres = postgres().await;
    let backend = Arc::new(
        DbosBackend::connect(config.clone())
            .await
            .expect("should connect"),
    );
    let (worker, shutdown) = spawn_worker(&backend, function);
    let run = run_id("run-1");

    backend
        .start(run.clone(), start(F::VERSION, input))
        .await
        .expect("should start the run");
    let status = wait_until(&backend, &run, finished).await;

    stop_worker(worker, &shutdown).await;
    backend.close().await;
    drop_schema(&postgres, &config.schema).await;
    status
}

#[tokio::test]
async fn run_executes_its_steps() {
    assert_eq!(
        run_to_end(Arc::new(DoubleThenAddOne), &20_u32).await,
        RunStatus {
            phase: RunPhase::Completed,
            steps_recorded: 2
        }
    );
}

/// One step that fails until it has been attempted `succeed_after` times.
struct Failing {
    kind: FailureKind,
    succeed_after: u32,
    attempts: AtomicU32,
}

impl Failing {
    fn new(kind: FailureKind, succeed_after: u32) -> Arc<Self> {
        Arc::new(Self {
            kind,
            succeed_after,
            attempts: AtomicU32::new(0),
        })
    }
}

impl RunFunction for Failing {
    type Input = ();

    const VERSION: FunctionVersion = FunctionVersion::new(1);

    async fn run(&self, context: &mut impl StepContext, (): ()) -> Result<(), Report<RunError>> {
        context
            .run(step("flaky"), || async {
                if self.attempts.fetch_add(1, Ordering::SeqCst) < self.succeed_after {
                    return Err(Report::new(StepFailure {
                        kind: self.kind,
                        code: "flaky".parse().expect("should be a failure code"),
                    }));
                }
                Ok(())
            })
            .await
    }
}

fn failed_step(attempts: u32) -> RunPhase {
    RunPhase::Failed(RunFailure::Step {
        index: StepIndex::new(0),
        name: step("flaky"),
        attempts: NonZero::new(attempts).expect("attempts should be nonzero"),
        code: "flaky".parse().expect("should be a failure code"),
    })
}

#[tokio::test]
async fn step_retries_then_succeeds() {
    let function = Failing::new(FailureKind::Retryable, 1);

    let status = run_to_end(Arc::clone(&function), &()).await;

    assert_eq!(status.phase, RunPhase::Completed);
    assert_eq!(
        status.steps_recorded, 1,
        "one checkpoint should cover both attempts"
    );
    assert_eq!(function.attempts.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn step_fails_permanently() {
    let function = Failing::new(FailureKind::Permanent, u32::MAX);

    let status = run_to_end(Arc::clone(&function), &()).await;

    assert_eq!(status.phase, failed_step(1));
    assert_eq!(
        function.attempts.load(Ordering::SeqCst),
        1,
        "a permanent failure should not be retried"
    );
}

#[tokio::test]
async fn step_exhausts_its_attempts() {
    let function = Failing::new(FailureKind::Retryable, u32::MAX);

    let status = run_to_end(Arc::clone(&function), &()).await;

    assert_eq!(
        status.phase,
        failed_step(3),
        "the policy allows three attempts"
    );
    assert_eq!(function.attempts.load(Ordering::SeqCst), 3);
}

/// Fails on its own, before requesting any step.
struct FailsItself;

impl RunFunction for FailsItself {
    type Input = ();

    const VERSION: FunctionVersion = FunctionVersion::new(1);

    fn run(
        &self,
        _: &mut impl StepContext,
        (): (),
    ) -> impl Future<Output = Result<(), Report<RunError>>> + Send {
        ready(Err(Report::new(RunError::Failed {
            code: "bad-definition".parse().expect("should be a failure code"),
        })))
    }
}

#[tokio::test]
async fn run_function_fails_itself() {
    assert_eq!(
        run_to_end(Arc::new(FailsItself), &()).await,
        RunStatus {
            phase: RunPhase::Failed(RunFailure::Function {
                code: "bad-definition".parse().expect("should be a failure code"),
            }),
            steps_recorded: 0
        }
    );
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
