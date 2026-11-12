//! Tests of the Restate backend against a Restate server. Start one with:
//!
//! ```sh
//! docker run --rm -p 8080:8080 -p 9070:9070 --add-host=host.docker.internal:host-gateway \
//!     docker.restate.dev/restatedev/restate:1.8.1
//! ```
//!
//! `RESTATE_INGRESS_URL` and `RESTATE_ADMIN_URL` name another server. `RESTATE_WORKER_HOST` names
//! the host at which the server reaches the tests' workers, `host.docker.internal` by default.
//!
//! Each test registers a worker of its own, and the server sends new runs to the worker registered
//! last. So each test holds [`lock_server`] and the tests run one at a time, each with run IDs and
//! an admission key that no other test uses.

extern crate alloc;

use alloc::sync::Arc;
use core::{
    future::{self, Future, ready},
    net::SocketAddr,
    num::NonZero,
    sync::atomic::{AtomicBool, AtomicU32, Ordering},
    time::Duration,
};

use error_stack::Report;
use hash_integrations_orchestration::{
    AdmissionKey, BackendError, BucketScope, CoordinationStore as _, FailureKind, FunctionVersion,
    Payload, RetryPolicy, RunError, RunFailure, RunFunction, RunId, RunPhase, RunStart, RunStatus,
    Runs as _, StepContext, StepFailure, StepIndex, StepName, TokenBucket, Worker as _,
    restate::{RestateBackend, RestateConfig, WorkerConfig},
};
use time::UtcDateTime;
use tokio::{
    runtime::Runtime,
    sync::Notify,
    task::{JoinHandle, JoinSet},
};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

/// Waits for the Restate server and holds it until the returned file is dropped. The lock is a
/// file because nextest runs each test in a process of its own.
fn lock_server() -> std::fs::File {
    let file = std::fs::File::create(std::env::temp_dir().join("hash-restate-tests.lock"))
        .expect("should create the lock file");
    file.lock().expect("should lock the lock file");
    file
}

fn env(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_owned())
}

/// Where the tests' Restate server is.
fn config() -> RestateConfig {
    RestateConfig {
        ingress_url: env("RESTATE_INGRESS_URL", "http://localhost:8080"),
        admin_url: env("RESTATE_ADMIN_URL", "http://localhost:9070"),
    }
}

/// A worker that listens on a free port.
fn worker_config() -> WorkerConfig {
    let port = std::net::TcpListener::bind("0.0.0.0:0")
        .and_then(|listener| listener.local_addr())
        .expect("should find a free port")
        .port();
    WorkerConfig {
        listen: SocketAddr::from(([0, 0, 0, 0], port)),
        worker_url: format!(
            "http://{}:{port}",
            env("RESTATE_WORKER_HOST", "host.docker.internal")
        ),
        step_timeout: Duration::from_mins(1),
    }
}

/// A worker on a runtime of its own. Dropping it drops the runtime and with it every task and
/// connection of the worker, which is what Restate sees when a worker's process dies.
struct TestWorker {
    runtime: Option<Runtime>,
    shutdown: CancellationToken,
    task: Option<JoinHandle<Result<(), Report<BackendError>>>>,
}

impl TestWorker {
    /// Runs `function` on a worker and waits until Restate knows the worker's URL.
    async fn spawn<F: RunFunction + 'static>(
        config: &RestateConfig,
        worker: WorkerConfig,
        function: Arc<F>,
    ) -> Self {
        let runtime = Runtime::new().expect("should build the worker's runtime");
        let shutdown = CancellationToken::new();
        let worker_url = worker.worker_url.clone();
        let task = runtime.spawn({
            let worker = RestateBackend::new(config.clone()).worker(worker);
            let shutdown = shutdown.clone();
            async move { worker.work(function, shutdown).await }
        });

        let deployments = format!("{}/deployments", config.admin_url);
        for _ in 0..100 {
            let registered = reqwest::get(&deployments)
                .await
                .expect("should reach Restate's admin API")
                .text()
                .await
                .expect("should read the deployments");
            if registered.contains(&worker_url) {
                return Self {
                    runtime: Some(runtime),
                    shutdown,
                    task: Some(task),
                };
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        panic!("the worker should register with Restate within ten seconds");
    }

    /// Shuts the worker down as a deployment would.
    async fn stop(mut self) {
        self.shutdown.cancel();
        self.task
            .take()
            .expect("the worker should have a task until it is stopped")
            .await
            .expect("the worker task should join")
            .expect("the worker should shut down cleanly");
    }
}

impl Drop for TestWorker {
    fn drop(&mut self) {
        // A runtime cannot be dropped on a thread that runs another one.
        if let Some(runtime) = self.runtime.take() {
            std::thread::spawn(move || drop(runtime))
                .join()
                .expect("the worker's runtime should shut down");
        }
    }
}

fn step(name: &str) -> StepName {
    name.parse().expect("should be a step name")
}

/// A run ID no other run has.
fn run_id() -> RunId {
    Uuid::new_v4()
        .simple()
        .to_string()
        .parse()
        .expect("should be a run ID")
}

/// An admission key no other test uses.
fn admission_key() -> AdmissionKey {
    format!("web/{}", Uuid::new_v4().simple())
        .parse()
        .expect("should be an admission key")
}

fn start<T: serde::Serialize>(
    admission: &AdmissionKey,
    version: FunctionVersion,
    input: &T,
) -> RunStart {
    RunStart {
        admission: admission.clone(),
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

/// Polls the run's status until `done` accepts it, for up to thirty seconds.
async fn wait_until(
    backend: &RestateBackend,
    run: &RunId,
    done: impl Fn(&RunStatus) -> bool,
) -> RunStatus {
    for _ in 0..300 {
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
    panic!("the run should reach the expected status within thirty seconds");
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
    let _server = lock_server();
    let config = config();
    let backend = RestateBackend::new(config.clone());
    let worker = TestWorker::spawn(&config, worker_config(), function).await;
    let run = run_id();

    backend
        .start(run.clone(), start(&admission_key(), F::VERSION, input))
        .await
        .expect("should start the run");
    let status = wait_until(&backend, &run, finished).await;

    worker.stop().await;
    status
}

// Steps: how a run executes them, retries them and fails.

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
        "one recorded step should cover both attempts"
    );
    assert_eq!(function.attempts.load(Ordering::SeqCst), 2);
}

#[tokio::test]
async fn step_fails_permanently() {
    let function = Failing::new(FailureKind::Permanent, u32::MAX);

    let status = run_to_end(Arc::clone(&function), &()).await;

    assert_eq!(status.phase, failed_step(1));
    assert_eq!(status.steps_recorded, 0);
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

// Runs: starting and cancelling them.

/// With no worker running, a started run stays queued. Restate attaches a run that is started
/// again to the run with its ID, and queues a second run under the same admission key.
///
/// Restate accepts a run once it knows the run object, so a worker registers first and stops.
#[tokio::test]
async fn start_without_worker() {
    let _server = lock_server();
    let config = config();
    let backend = RestateBackend::new(config.clone());
    TestWorker::spawn(&config, worker_config(), Arc::new(DoubleThenAddOne))
        .await
        .stop()
        .await;
    let (admission, run, second) = (admission_key(), run_id(), run_id());
    let first = start(&admission, DoubleThenAddOne::VERSION, &20_u32);

    backend
        .start(run.clone(), first.clone())
        .await
        .expect("should start the run");
    backend
        .start(run.clone(), first.clone())
        .await
        .expect("starting the same run again should attach to it");
    backend
        .start(second.clone(), first)
        .await
        .expect("a second run under the admission key should queue");

    for queued in [&run, &second] {
        assert_eq!(
            backend
                .status(queued)
                .await
                .expect("should read the status"),
            Some(RunStatus {
                phase: RunPhase::Pending,
                steps_recorded: 0
            })
        );
    }
    assert_eq!(
        backend
            .status(&run_id())
            .await
            .expect("should read the status"),
        None,
        "an unknown run should have no status"
    );
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

#[tokio::test]
async fn cancel_stops_before_the_next_step() {
    let _server = lock_server();
    let config = config();
    let backend = RestateBackend::new(config.clone());
    let function = Arc::new(Gated {
        release: Notify::new(),
        ran_last: AtomicBool::new(false),
    });
    let worker = TestWorker::spawn(&config, worker_config(), Arc::clone(&function)).await;
    let run = run_id();

    backend
        .start(run.clone(), start(&admission_key(), Gated::VERSION, &()))
        .await
        .expect("should start the run");
    let running = wait_until(&backend, &run, |status| status.steps_recorded == 1).await;
    assert_eq!(running.phase, RunPhase::Running);

    backend.cancel(&run).await.expect("should cancel the run");
    function.release.notify_one();
    let cancelled = wait_until(&backend, &run, finished).await;

    assert_eq!(
        cancelled,
        RunStatus {
            phase: RunPhase::Cancelled,
            steps_recorded: 2
        },
        "the step that was executing should finish and be recorded"
    );
    assert!(
        !function.ran_last.load(Ordering::SeqCst),
        "the step after the cancel should not run"
    );
    backend
        .cancel(&run)
        .await
        .expect("cancelling a finished run should succeed");
    backend
        .cancel(&run_id())
        .await
        .expect("cancelling an unknown run should succeed");
    worker.stop().await;
}

// Workers: one that dies, one that hangs, and two versions side by side.

/// Two steps, of which the second waits until the test releases it. Counts how often the first
/// step's body runs, which a replay must not add to. `V` is the function's version.
struct Resumable<const V: u32> {
    release: Notify,
    first_runs: AtomicU32,
}

impl<const V: u32> Resumable<V> {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            release: Notify::new(),
            first_runs: AtomicU32::new(0),
        })
    }
}

impl<const V: u32> RunFunction for Resumable<V> {
    type Input = ();

    const VERSION: FunctionVersion = FunctionVersion::new(V);

    async fn run(&self, context: &mut impl StepContext, (): ()) -> Result<(), Report<RunError>> {
        context
            .run(step("first"), || async {
                self.first_runs.fetch_add(1, Ordering::SeqCst);
                Ok(())
            })
            .await?;
        context
            .run(step("wait"), || async {
                self.release.notified().await;
                Ok(())
            })
            .await
    }
}

/// Starts a run of `function` on a worker at `worker`'s URL and kills the worker while the run's
/// second step is executing.
async fn kill_worker_after_first_step(
    config: &RestateConfig,
    worker: WorkerConfig,
    backend: &RestateBackend,
    function: Arc<Resumable<1>>,
) -> RunId {
    let worker = TestWorker::spawn(config, worker, function).await;
    let run = run_id();
    backend
        .start(
            run.clone(),
            start(&admission_key(), FunctionVersion::new(1), &()),
        )
        .await
        .expect("should start the run");
    wait_until(backend, &run, |status| status.steps_recorded == 1).await;
    drop(worker);
    run
}

/// A worker has no identity: the run of a worker that died continues on whichever worker answers
/// at the same URL next.
#[tokio::test]
async fn killed_worker_resumes_on_another() {
    let _server = lock_server();
    let config = config();
    let backend = RestateBackend::new(config.clone());
    let worker_config = worker_config();
    let function = Resumable::<1>::new();
    let run = kill_worker_after_first_step(
        &config,
        worker_config.clone(),
        &backend,
        Arc::clone(&function),
    )
    .await;

    function.release.notify_one();
    let worker = TestWorker::spawn(&config, worker_config, Arc::clone(&function)).await;
    let status = wait_until(&backend, &run, finished).await;

    assert_eq!(
        status,
        RunStatus {
            phase: RunPhase::Completed,
            steps_recorded: 2
        }
    );
    assert_eq!(
        function.first_runs.load(Ordering::SeqCst),
        1,
        "the recorded first step should replay without running again"
    );
    worker.stop().await;
}

/// [`Resumable`] with its first step renamed, as a changed deployment would have it.
struct Renamed {
    first_runs: AtomicU32,
}

impl RunFunction for Renamed {
    type Input = ();

    const VERSION: FunctionVersion = FunctionVersion::new(1);

    async fn run(&self, context: &mut impl StepContext, (): ()) -> Result<(), Report<RunError>> {
        context
            .run(step("primary"), || async {
                self.first_runs.fetch_add(1, Ordering::SeqCst);
                Ok(())
            })
            .await?;
        context.run(step("wait"), || async { Ok(()) }).await
    }
}

/// Restate refuses to replay a journal against a step with another name. It retries the run, so
/// the run neither fails nor executes the renamed step.
#[tokio::test]
async fn renamed_step_does_not_complete() {
    let _server = lock_server();
    let config = config();
    let backend = RestateBackend::new(config.clone());
    let worker_config = worker_config();
    let run = kill_worker_after_first_step(
        &config,
        worker_config.clone(),
        &backend,
        Resumable::<1>::new(),
    )
    .await;

    let renamed = Arc::new(Renamed {
        first_runs: AtomicU32::new(0),
    });
    let _worker = TestWorker::spawn(&config, worker_config, Arc::clone(&renamed)).await;
    tokio::time::sleep(Duration::from_secs(3)).await;

    assert_eq!(
        backend.status(&run).await.expect("should read the status"),
        Some(RunStatus {
            phase: RunPhase::Running,
            steps_recorded: 1
        })
    );
    assert_eq!(
        renamed.first_runs.load(Ordering::SeqCst),
        0,
        "the renamed step should not execute"
    );
}

/// One step that never returns the first time it executes.
struct HangsOnce {
    attempts: AtomicU32,
}

impl RunFunction for HangsOnce {
    type Input = ();

    const VERSION: FunctionVersion = FunctionVersion::new(1);

    async fn run(&self, context: &mut impl StepContext, (): ()) -> Result<(), Report<RunError>> {
        context
            .run(step("hang"), || async {
                if self.attempts.fetch_add(1, Ordering::SeqCst) == 0 {
                    future::pending::<()>().await;
                }
                Ok(())
            })
            .await
    }
}

/// Restate aborts an attempt whose step runs past the step timeout and starts another.
#[tokio::test]
async fn hung_step_is_retried() {
    let _server = lock_server();
    let config = config();
    let backend = RestateBackend::new(config.clone());
    let function = Arc::new(HangsOnce {
        attempts: AtomicU32::new(0),
    });
    let worker_config = WorkerConfig {
        step_timeout: Duration::from_secs(2),
        ..worker_config()
    };
    let worker = TestWorker::spawn(&config, worker_config, Arc::clone(&function)).await;
    let run = run_id();

    backend
        .start(
            run.clone(),
            start(&admission_key(), HangsOnce::VERSION, &()),
        )
        .await
        .expect("should start the run");
    let status = wait_until(&backend, &run, finished).await;

    assert_eq!(
        status,
        RunStatus {
            phase: RunPhase::Completed,
            steps_recorded: 1
        }
    );
    assert_eq!(function.attempts.load(Ordering::SeqCst), 2);
    worker.stop().await;
}

/// Each version of the run function has a worker URL of its own. A run stays on the URL it
/// started on, and new runs go to the URL registered last.
#[tokio::test]
async fn run_stays_on_its_version() {
    let _server = lock_server();
    let config = config();
    let backend = RestateBackend::new(config.clone());
    let (one, two) = (Resumable::<1>::new(), Resumable::<2>::new());
    let (run_one, run_two) = (run_id(), run_id());

    let worker_one = TestWorker::spawn(&config, worker_config(), Arc::clone(&one)).await;
    backend
        .start(
            run_one.clone(),
            start(&admission_key(), FunctionVersion::new(1), &()),
        )
        .await
        .expect("should start the first run");
    wait_until(&backend, &run_one, |status| status.steps_recorded == 1).await;

    let worker_two = TestWorker::spawn(&config, worker_config(), Arc::clone(&two)).await;
    backend
        .start(
            run_two.clone(),
            start(&admission_key(), FunctionVersion::new(2), &()),
        )
        .await
        .expect("should start the second run");
    wait_until(&backend, &run_two, |status| status.steps_recorded == 1).await;

    one.release.notify_one();
    two.release.notify_one();
    for run in [&run_one, &run_two] {
        assert_eq!(
            wait_until(&backend, run, finished).await.phase,
            RunPhase::Completed,
            "each run should finish on the version that started it"
        );
    }
    assert_eq!(one.first_runs.load(Ordering::SeqCst), 1);
    assert_eq!(two.first_runs.load(Ordering::SeqCst), 1);

    let outdated = run_id();
    backend
        .start(
            outdated.clone(),
            start(&admission_key(), FunctionVersion::new(1), &()),
        )
        .await
        .expect("should start the outdated run");
    assert_eq!(
        wait_until(&backend, &outdated, finished).await.phase,
        RunPhase::Failed(RunFailure::Function {
            code: "version-mismatch"
                .parse()
                .expect("should be a failure code"),
        }),
        "a run started with an old version should not execute on the new one"
    );
    worker_one.stop().await;
    worker_two.stop().await;
}

// Token buckets.

/// A bucket scope no other test uses.
fn scope() -> BucketScope {
    format!("web/{}", Uuid::new_v4().simple())
        .parse()
        .expect("should be a bucket scope")
}

fn at(seconds: f64) -> UtcDateTime {
    UtcDateTime::UNIX_EPOCH + Duration::from_secs_f64(seconds)
}

/// The balances are whole numbers in these tests, so comparing them as integers avoids float
/// comparisons.
#[expect(
    clippy::cast_possible_truncation,
    reason = "the balances in these tests are small whole numbers"
)]
async fn consume(backend: &RestateBackend, scope: &BucketScope, ops: u32, seconds: f64) -> i64 {
    let bucket = TokenBucket {
        rate_per_second: NonZero::new(100).expect("should be nonzero"),
        capacity: NonZero::new(200).expect("should be nonzero"),
    };
    let balance = backend
        .consume(scope, bucket, ops, at(seconds))
        .await
        .expect("should consume from the bucket");
    balance.round() as i64
}

#[tokio::test]
async fn token_bucket_refills_and_goes_into_debt() {
    let _server = lock_server();
    let config = config();
    let backend = RestateBackend::new(config.clone());
    let worker = TestWorker::spawn(&config, worker_config(), Arc::new(DoubleThenAddOne)).await;
    let (first, second) = (scope(), scope());

    assert_eq!(
        consume(&backend, &first, 150, 1000.0).await,
        50,
        "a new bucket should start full"
    );
    assert_eq!(
        consume(&backend, &first, 0, 1000.5).await,
        100,
        "half a second should refill fifty tokens"
    );
    assert_eq!(
        consume(&backend, &first, 0, 9999.0).await,
        200,
        "a refill should stop at the capacity"
    );
    assert_eq!(
        consume(&backend, &first, 300, 9999.0).await,
        -100,
        "taking more than the balance should go into debt"
    );
    assert_eq!(
        consume(&backend, &second, 5, 9999.0).await,
        195,
        "scopes should have buckets of their own"
    );
    worker.stop().await;
}

#[tokio::test]
async fn token_bucket_serialises_concurrent_consumes() {
    let _server = lock_server();
    let config = config();
    let backend = Arc::new(RestateBackend::new(config.clone()));
    let worker = TestWorker::spawn(&config, worker_config(), Arc::new(DoubleThenAddOne)).await;
    let scope = scope();
    consume(&backend, &scope, 200, 1000.0).await;

    let mut consumes = JoinSet::new();
    for _ in 0..10 {
        let (backend, scope) = (Arc::clone(&backend), scope.clone());
        consumes.spawn(async move { consume(&backend, &scope, 30, 1000.0).await });
    }
    let mut balances = consumes.join_all().await;
    balances.sort_unstable();

    assert_eq!(
        balances,
        (1..=10).rev().map(|n| -30 * n).collect::<Vec<_>>(),
        "ten concurrent consumes should each see a distinct balance"
    );
    worker.stop().await;
}
