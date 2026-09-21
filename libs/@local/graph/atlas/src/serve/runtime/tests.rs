//! Cases covering one generation's runtime lifecycle: opening, probing and joining its feed.

use alloc::sync::{Arc, Weak};
use core::{
    assert_matches,
    future::{self, Future},
    time::Duration,
};
use std::io;

use error_stack::{Report, ReportSink};
use futures::FutureExt as _;
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
    PostgresStoreSettings,
};
use hashql_core::id::Id as _;
use rand::{SeedableRng as _, TryCryptoRng, TryRng, rngs::StdRng};
use tokio::{sync::oneshot, task::JoinHandle};
use tokio_postgres::NoTls;
use tokio_util::sync::CancellationToken;

use super::{Feed, FeedOptions, FeedState, Runtime, RuntimeError};
use crate::{
    dataset::TemporalAxes,
    device::Device,
    file::generation::{Generation, GenerationRoot},
    identity::NodeRowId,
    math::nz,
    serve::{
        delta::{
            Delta, DeltaFeedTaskOptions, DeltaPlacementTaskOptions, DeltaReader, DeltaTaskError,
            DeltaTaskOptions,
        },
        tests::fixture::{TamperFixture, secret},
        world::World,
    },
};

/// The fixed seed every fixture's generator uses for repeatable arrivals.
const SEED: u64 = 0xC0FF_EE11;

// awaitable test adapters compose the runtime's stop-and-poll operations. The manager slot cannot
// await inside its state machine.

/// Waits for `runtime`'s runner and yields its result, or [`None`] without an unjoined runner.
///
/// # Errors
///
/// Returns the [`RuntimeError`] the runner reported, or the join failure of a runner that
/// panicked.
async fn join(runtime: &mut Runtime) -> Option<Result<(), Report<RuntimeError>>> {
    future::poll_fn(|context| runtime.poll_join(context)).await
}

/// Requests shutdown of `runtime` and waits for its runner.
///
/// # Errors
///
/// Returns the [`RuntimeError`] the runner reported. A runtime with no runner to join
/// succeeds.
async fn shutdown(runtime: &mut Runtime) -> Result<(), Report<RuntimeError>> {
    runtime.stop();
    join(runtime).await.unwrap_or(Ok(()))
}

/// Returns the common runtime-test feed configuration.
///
/// The feed and placement loops both use five-second periods. Placement runs on the CPU with no
/// workflow. It admits one pending item and allows one attempt in each database and workflow phase.
fn options() -> FeedOptions {
    FeedOptions {
        task: DeltaTaskOptions {
            feed: DeltaFeedTaskOptions {
                tick_rate: Duration::from_secs(5),
                safety_lag: Duration::from_secs(60),
            },
            placement: DeltaPlacementTaskOptions {
                tick_rate: Duration::from_secs(5),
                tries_workflow: 1,
                tries_database: 1,
                minimum_projection_interval: 1,
                max_pending: nz!(1),
            },
        },
        device: Device::Cpu.pin(0).resolve(),
        workflow: None,
    }
}

/// Builds an empty test store pool and a weak ownership probe.
///
/// The weak handle detects whether the runtime retained its pool reference.
///
/// # Panics
///
/// Panics if store-pool construction fails.
fn unconnected_pool() -> (Arc<PostgresStorePool>, Weak<PostgresStorePool>) {
    let pool = Arc::new(
        PostgresStorePool::new(
            &DatabaseConnectionInfo::new(
                DatabaseType::Postgres,
                "runtime-test".to_owned(),
                String::new(),
                "/no-runtime-test-postgres".to_owned(),
                5432,
                "runtime-test".to_owned(),
            ),
            &DatabasePoolConfig {
                max_connections: nz!(1),
            },
            NoTls,
            PostgresStoreSettings::default(),
        )
        .expect("should construct an unconnected pool"),
    );
    let weak = Arc::downgrade(&pool);
    (pool, weak)
}

/// Runs `test` under a one-second virtual timeout on a paused current-thread runtime.
///
/// # Panics
///
/// Panics if runtime construction fails, if `test` panics, or if the virtual timeout expires.
#[track_caller]
fn run_controlled(test: impl Future<Output = ()>) {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .start_paused(true)
        .build()
        .expect("should build the runtime");

    let result =
        runtime.block_on(async { tokio::time::timeout(Duration::from_secs(1), test).await });
    result.expect("the controlled test should finish without a stalled task");
}

#[test]
#[should_panic(expected = "the controlled test should finish without a stalled task")]
fn controlled_stall() {
    run_controlled(async {
        tokio::time::advance(Duration::ZERO).await;
        future::pending::<()>().await;
    });
}

/// Builds a published generation with temporal axes.
///
/// The returned fixture owns its directory. A feed opens only over a generation carrying axes.
///
/// # Panics
///
/// Panics on fixture-publication failure or a missing parent directory. Root opening, staging,
/// artifact copying, generation sealing, and generation reopening must also succeed.
fn axes_fixture(name: &str) -> (TamperFixture, Generation) {
    let fixture = TamperFixture::publish(name);
    let generation = fixture.generation();
    let root = GenerationRoot::new(generation.path().parent().expect("the fixture has a root"))
        .expect("the fixture root should open");
    let published = {
        let staging = root.stage().expect("the staging should open");

        for file in generation.repository().files.files() {
            std::fs::copy(generation.path_of(&file.name), staging.path_of(&file.name))
                .expect("the fixture artifact should copy");
        }

        let mut repository = generation.repository().clone();
        repository.metadata.snapshot.axes = Some(TemporalAxes::now());
        staging
            .seal(&repository)
            .expect("the generation should seal")
    };
    let generation = root
        .open(published.id())
        .expect("the generation should open");
    (fixture, generation)
}

/// Builds a runtime around `feed` and returns its directory fixture.
///
/// # Panics
///
/// Panics on failure during fixture publication or world opening.
fn controlled(name: &str, feed: Feed) -> (TamperFixture, Runtime) {
    let fixture = TamperFixture::publish(name);
    let world = Arc::new(
        World::open(fixture.generation().clone(), &secret()).expect("the world should open"),
    );
    let delta = Delta::new(Arc::clone(&world), StdRng::seed_from_u64(SEED))
        .expect("the delta should initialize");
    let runtime = Runtime {
        world,
        reader: DeltaReader::from(delta),
        feed: Some(feed),
    };
    (fixture, runtime)
}

/// Waits for runner completion before testing nonblocking probe state.
///
/// This distinguishes a finished-runner verdict from scheduler timing.
///
/// # Panics
///
/// Panics if `runtime` has no feed. If the runner has not finished, it also panics when polled
/// outside a Tokio runtime with time enabled.
async fn feed_finished(runtime: &Runtime) {
    let feed = runtime.feed.as_ref().expect("should own a feed");
    while !feed.task.is_finished() {
        tokio::time::sleep(Duration::from_millis(1)).await;
    }
}

/// An entropy source that rejects every request.
///
/// It models entropy from which runtime startup cannot seed a delta lifetime.
struct UnavailableEntropy;

impl TryRng for UnavailableEntropy {
    type Error = io::Error;

    fn try_next_u32(&mut self) -> Result<u32, Self::Error> {
        Err(io::Error::other("entropy unavailable"))
    }

    fn try_next_u64(&mut self) -> Result<u64, Self::Error> {
        Err(io::Error::other("entropy unavailable"))
    }

    fn try_fill_bytes(&mut self, dst: &mut [u8]) -> Result<(), Self::Error> {
        let _: &mut [u8] = dst;
        Err(io::Error::other("entropy unavailable"))
    }
}

impl TryCryptoRng for UnavailableEntropy {}

/// Avoids starting a runner when feed options are absent.
///
/// The returned runtime never retains the unused store pool, and its world remains readable.
#[tokio::test]
async fn open_disabled() {
    let (_fixture, generation) = axes_fixture("runtime-open-disabled");
    let (pool, weak_pool) = unconnected_pool();
    let mut runtime = Runtime::open(
        generation,
        &secret(),
        pool,
        StdRng::seed_from_u64(SEED),
        None,
    )
    .expect("the disabled feed should open");

    assert!(runtime.reader().load().contains_node(NodeRowId::MIN));
    assert!(weak_pool.upgrade().is_none());
    assert_matches!(runtime.try_join(), Ok(FeedState::Absent));
    assert!(join(&mut runtime).await.is_none());
}

/// Avoids starting a feed when temporal axes are absent.
///
/// Opening without axes drops the unused store pool.
#[tokio::test]
async fn open_without_axes() {
    let fixture = TamperFixture::publish("runtime-open-without-axes");
    let (pool, weak_pool) = unconnected_pool();
    let mut runtime = Runtime::open(
        fixture.generation().clone(),
        &secret(),
        pool,
        StdRng::seed_from_u64(SEED),
        Some(options()),
    )
    .expect("the generation without axes should open");

    assert!(runtime.reader().load().contains_node(NodeRowId::MIN));
    assert!(weak_pool.upgrade().is_none());
    assert_matches!(runtime.try_join(), Ok(FeedState::Absent));
    assert!(join(&mut runtime).await.is_none());
}

/// Keeps world and reader handles usable after temporal-feed shutdown.
///
/// A generation with axes and no projector opens with a live feed. Shutting it down
/// joins the runner, and the world, the reader clones and a snapshot taken before the
/// shutdown all stay readable afterward, with the generation directory left on disk.
#[tokio::test]
async fn open_temporal() {
    let (_fixture, generation) = axes_fixture("runtime-open-temporal");
    assert!(generation.repository().files.projector.is_none());
    let (pool, weak_pool) = unconnected_pool();
    let mut runtime = Runtime::open(
        generation,
        &secret(),
        pool,
        StdRng::seed_from_u64(SEED),
        Some(options()),
    )
    .expect("the temporal generation should open");

    let world = Arc::clone(runtime.world());
    let reader = runtime.reader().clone();
    let captured = reader.load();
    assert!(runtime.feed.is_some());

    shutdown(&mut runtime).await.expect("the feed should join");
    drop(runtime);

    assert!(weak_pool.upgrade().is_none());
    assert!(reader.load().contains_node(NodeRowId::MIN));
    assert!(captured.contains_node(NodeRowId::MIN));
    assert!(world.generation().path().is_dir());
}

/// Releases runtime resources when feed options are invalid.
///
/// A zero tick rate refuses at open with a feed error, and the refusal releases the
/// pool reference rather than leaking it into a runtime that never opened.
#[tokio::test]
async fn open_invalid_interval() {
    let (_fixture, generation) = axes_fixture("runtime-open-invalid-interval");
    let (pool, weak_pool) = unconnected_pool();
    let mut options = options();
    options.task.feed.tick_rate = Duration::ZERO;
    let error = Runtime::open(
        generation,
        &secret(),
        pool,
        StdRng::seed_from_u64(SEED),
        Some(options),
    )
    .err()
    .expect("a zero interval should fail");

    assert_matches!(error.current_context(), RuntimeError::Feed);
    assert!(weak_pool.upgrade().is_none());
}

/// Refuses startup and releases the store pool when the entropy source returns an error.
#[tokio::test]
async fn start_entropy_failure() {
    let fixture = TamperFixture::publish("runtime-start-entropy-failure");
    let world = Arc::new(
        World::open(fixture.generation().clone(), &secret()).expect("the world should open"),
    );
    let (pool, weak_pool) = unconnected_pool();
    let error = Runtime::start(world, pool, UnavailableEntropy, None)
        .err()
        .expect("unavailable entropy should fail");

    assert_matches!(error.current_context(), RuntimeError::Entropy);
    assert!(weak_pool.upgrade().is_none());
}

/// Retains a signalled runner until shutdown joins it.
///
/// The eventual join returns its result exactly once.
#[test]
fn shutdown_cancelled() {
    run_controlled(async {
        let (observed, observation) = oneshot::channel::<()>();
        let (release, released) = oneshot::channel::<()>();

        let cancel = CancellationToken::new();
        let cancelled = cancel.clone().cancelled_owned();

        let task = tokio::spawn(async move {
            cancelled.await;
            observed
                .send(())
                .expect("the observation should remain open");
            released.await.expect("the worker should be released");
            Ok(())
        });

        let (_fixture, mut runtime) = controlled(
            "runtime-shutdown-cancelled",
            Feed {
                shutdown: cancel,
                task,
            },
        );

        assert!(shutdown(&mut runtime).now_or_never().is_none());
        observation
            .await
            .expect("the worker should observe shutdown");
        assert!(runtime.feed.is_some());
        release
            .send(())
            .expect("the worker should still await release");
        join(&mut runtime)
            .await
            .expect("the join handle should remain owned")
            .expect("the worker should join");
        assert!(join(&mut runtime).await.is_none());
    });
}

/// Treats shutdown as idempotent after the runner joins.
///
/// A second call succeeds, and another join yields nothing.
#[test]
fn shutdown_repeated() {
    run_controlled(async {
        let cancel = CancellationToken::new();
        let cancelled = cancel.clone().cancelled_owned();

        let task = tokio::spawn(async move {
            cancelled.await;
            Ok(())
        });

        let (_fixture, mut runtime) = controlled(
            "runtime-shutdown-repeated",
            Feed {
                shutdown: cancel,
                task,
            },
        );

        shutdown(&mut runtime)
            .await
            .expect("the worker should join");
        shutdown(&mut runtime)
            .await
            .expect("repeated shutdown should succeed");
        assert!(join(&mut runtime).await.is_none());
    });
}

/// Consumes a feed failure exactly once.
///
/// The delta failure becomes a feed error. A later join finds no runner.
#[test]
fn join_feed_error() {
    run_controlled(async {
        let cancel = CancellationToken::new();

        let task = tokio::spawn(async {
            let mut sink = ReportSink::new();
            sink.attempt(Err::<(), _>(Report::new(DeltaTaskError::Feed)));
            sink.finish()
        });

        let (_fixture, mut runtime) = controlled(
            "runtime-join-feed-error",
            Feed {
                shutdown: cancel,
                task,
            },
        );

        let error = join(&mut runtime)
            .await
            .expect("the runner should have a result")
            .expect_err("the runner should report its failure");
        assert_matches!(error.current_context(), RuntimeError::Feed);
        assert!(join(&mut runtime).await.is_none());
    });
}

/// Converts a runner panic into a consumed join error.
///
/// The caller does not unwind, and a later join finds no runner.
#[test]
fn join_panic() {
    run_controlled(async {
        let cancel = CancellationToken::new();
        let task: JoinHandle<Result<(), Report<[DeltaTaskError]>>> =
            tokio::spawn(async { panic!("controlled worker panic") });

        let (_fixture, mut runtime) = controlled(
            "runtime-join-panic",
            Feed {
                shutdown: cancel,
                task,
            },
        );

        let error = join(&mut runtime)
            .await
            .expect("the runner should have a result")
            .expect_err("the runner should report its panic");
        assert_matches!(error.current_context(), RuntimeError::Join);
        assert!(join(&mut runtime).await.is_none());
    });
}

/// Consumes a finished runner exactly once through nonblocking probes.
///
/// The non-blocking probe reports a running runner while the worker waits, reports it
/// finished once it ends, giving up the feed at that point, and absent from then on,
/// with a later shutdown still succeeding.
#[test]
fn try_join_pending() {
    run_controlled(async {
        let (release, released) = oneshot::channel::<()>();
        let task = tokio::spawn(async move {
            released.await.expect("should release the worker");
            Ok(())
        });
        let (_fixture, mut runtime) = controlled(
            "runtime-try-join-pending",
            Feed {
                shutdown: CancellationToken::new(),
                task,
            },
        );

        assert_matches!(runtime.try_join(), Ok(FeedState::Running));
        assert!(runtime.feed.is_some());
        release.send(()).expect("should retain the waiting worker");
        feed_finished(&runtime).await;

        assert_matches!(runtime.try_join(), Ok(FeedState::Finished));
        assert!(runtime.feed.is_none());
        assert_matches!(runtime.try_join(), Ok(FeedState::Absent));
        assert!(join(&mut runtime).await.is_none());
        shutdown(&mut runtime).await.expect("should remain joined");
    });
}

/// Returns and consumes a finished feed error once.
///
/// Later probes report absence, and shutdown succeeds.
#[test]
fn try_join_feed_error() {
    run_controlled(async {
        let task = tokio::spawn(async { Err(Report::new(DeltaTaskError::Feed).expand()) });
        let (_fixture, mut runtime) = controlled(
            "runtime-try-join-feed-error",
            Feed {
                shutdown: CancellationToken::new(),
                task,
            },
        );
        feed_finished(&runtime).await;

        let error = runtime
            .try_join()
            .expect_err("should report the feed failure");
        assert_matches!(error.current_context(), RuntimeError::Feed);
        assert!(runtime.feed.is_none());
        assert_matches!(runtime.try_join(), Ok(FeedState::Absent));
        assert!(join(&mut runtime).await.is_none());
        shutdown(&mut runtime).await.expect("should remain joined");
    });
}

/// Returns and consumes a finished join error once.
///
/// Later probes report absence, and shutdown succeeds.
#[test]
fn try_join_panic() {
    run_controlled(async {
        let task = tokio::spawn(async { panic!("controlled worker panic") });
        let (_fixture, mut runtime) = controlled(
            "runtime-try-join-panic",
            Feed {
                shutdown: CancellationToken::new(),
                task,
            },
        );
        feed_finished(&runtime).await;

        let error = runtime
            .try_join()
            .expect_err("should report the runner panic");
        assert_matches!(error.current_context(), RuntimeError::Join);
        assert!(runtime.feed.is_none());
        assert_matches!(runtime.try_join(), Ok(FeedState::Absent));
        assert!(join(&mut runtime).await.is_none());
        shutdown(&mut runtime).await.expect("should remain joined");
    });
}

/// Retains a completed runner after a probe exhausts its budget.
///
/// [`tokio::task::consume_budget`] spends the budget that the join probe also needs. A scheduler
/// yield then makes the completed result observable.
#[test]
fn try_join_exhausted_budget() {
    /// Probes to spend on the drain, well past the budget one task poll starts with.
    const DRAIN_PROBES: usize = 1024;

    run_controlled(async {
        let task = tokio::spawn(async { Ok(()) });
        let (_fixture, mut runtime) = controlled(
            "runtime-try-join-exhausted-budget",
            Feed {
                shutdown: CancellationToken::new(),
                task,
            },
        );
        feed_finished(&runtime).await;

        let exhausted =
            (0..DRAIN_PROBES).any(|_| tokio::task::consume_budget().now_or_never().is_none());
        assert!(
            exhausted,
            "consuming budget should report pending once the drain spends it"
        );

        assert_matches!(runtime.try_join(), Ok(FeedState::Running));
        assert!(runtime.feed.is_some());

        tokio::task::yield_now().await;

        assert_matches!(runtime.try_join(), Ok(FeedState::Finished));
        assert!(runtime.feed.is_none());
        assert_matches!(runtime.try_join(), Ok(FeedState::Absent));
        assert!(join(&mut runtime).await.is_none());
        shutdown(&mut runtime).await.expect("should remain joined");
    });
}

/// Requests graceful shutdown without aborting the runner when the runtime drops.
///
/// Worker-owned resources remain held until completion, and reader clones remain valid.
#[test]
fn drop_graceful() {
    run_controlled(async {
        let resource = Arc::new(());
        let weak = Arc::downgrade(&resource);
        let (started, startup) = oneshot::channel::<()>();
        let (observed, observation) = oneshot::channel::<()>();
        let (release, released) = oneshot::channel::<()>();
        let (done, finished) = oneshot::channel::<()>();

        let cancel = CancellationToken::new();
        let cancelled = cancel.clone().cancelled_owned();

        let task = tokio::spawn(async move {
            started
                .send(())
                .expect("the startup observation should remain open");
            cancelled.await;
            observed
                .send(())
                .expect("the observation should remain open");
            released.await.expect("the worker should be released");
            drop(resource);
            done.send(()).expect("the completion should remain open");
            Ok(())
        });

        let (_fixture, runtime) = controlled(
            "runtime-drop-graceful",
            Feed {
                shutdown: cancel,
                task,
            },
        );
        let reader = runtime.reader().clone();
        startup
            .await
            .expect("the worker should start before its owner drops");
        drop(runtime);

        observation
            .await
            .expect("the worker should observe shutdown");
        assert!(weak.upgrade().is_some());
        release
            .send(())
            .expect("the worker should still await release");
        finished
            .await
            .expect("the worker should finish without an abort");
        assert!(weak.upgrade().is_none());
        assert!(reader.load().contains_node(NodeRowId::MIN));
    });
}
