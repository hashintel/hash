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
    future::{Future, ready},
    net::SocketAddr,
    num::NonZero,
    sync::atomic::{AtomicBool, AtomicU32, Ordering},
    time::Duration,
};

use error_stack::Report;
use hash_integrations_orchestration::{
    AdmissionKey, BackendError, FailureKind, FunctionVersion, Payload, RetryPolicy, RunError,
    RunFailure, RunFunction, RunId, RunPhase, RunStart, RunStatus, Runs as _, StartError,
    StepContext, StepFailure, StepIndex, StepName, Worker as _,
    restate::{RestateBackend, RestateConfig},
};
use tokio::{runtime::Runtime, sync::Notify, task::JoinHandle};
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

/// A configuration whose worker listens on a free port.
fn config() -> RestateConfig {
    let port = std::net::TcpListener::bind("0.0.0.0:0")
        .and_then(|listener| listener.local_addr())
        .expect("should find a free port")
        .port();
    RestateConfig {
        ingress_url: env("RESTATE_INGRESS_URL", "http://localhost:8080"),
        admin_url: env("RESTATE_ADMIN_URL", "http://localhost:9070"),
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
    async fn spawn<F: RunFunction + 'static>(config: &RestateConfig, function: Arc<F>) -> Self {
        let runtime = Runtime::new().expect("should build the worker's runtime");
        let shutdown = CancellationToken::new();
        let task = runtime.spawn({
            let (backend, shutdown) = (RestateBackend::new(config.clone()), shutdown.clone());
            async move { backend.work(function, shutdown).await }
        });

        let deployments = format!("{}/deployments", config.admin_url);
        for _ in 0..100 {
            let registered = reqwest::get(&deployments)
                .await
                .expect("should reach Restate's admin API")
                .text()
                .await
                .expect("should read the deployments");
            if registered.contains(&config.worker_url) {
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
        if let Some(runtime) = self.runtime.take() {
            runtime.shutdown_background();
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
    let worker = TestWorker::spawn(&config, function).await;
    let run = run_id();

    backend
        .start(run.clone(), start(&admission_key(), F::VERSION, input))
        .await
        .expect("should start the run");
    let status = wait_until(&backend, &run, finished).await;

    worker.stop().await;
    status
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

/// With no worker running, a started run stays queued and holds its admission key.
///
/// Restate accepts a run once it knows the run object, so a worker registers first and stops.
#[tokio::test]
async fn start_without_worker() {
    let _server = lock_server();
    let config = config();
    let backend = RestateBackend::new(config.clone());
    TestWorker::spawn(&config, Arc::new(DoubleThenAddOne))
        .await
        .stop()
        .await;
    let (admission, run) = (admission_key(), run_id());
    let first = start(&admission, DoubleThenAddOne::VERSION, &20_u32);

    backend
        .start(run.clone(), first.clone())
        .await
        .expect("should start the run");
    backend
        .start(run.clone(), first)
        .await
        .expect("starting the same run again should attach to it");

    let mismatch = backend
        .start(
            run.clone(),
            start(&admission, DoubleThenAddOne::VERSION, &21_u32),
        )
        .await
        .expect_err("a different start under the same ID should be rejected");
    assert_eq!(*mismatch.current_context(), StartError::StartMismatch);

    let active = backend
        .start(
            run_id(),
            start(&admission, DoubleThenAddOne::VERSION, &20_u32),
        )
        .await
        .expect_err("a second run under an active admission key should be rejected");
    assert_eq!(
        *active.current_context(),
        StartError::AlreadyActive {
            active: run.clone()
        }
    );

    assert_eq!(
        backend.status(&run).await.expect("should read the status"),
        Some(RunStatus {
            phase: RunPhase::Pending,
            steps_recorded: 0
        })
    );
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
    let worker = TestWorker::spawn(&config, Arc::clone(&function)).await;
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
