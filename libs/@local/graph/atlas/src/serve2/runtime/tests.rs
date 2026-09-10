use alloc::sync::{Arc, Weak};
use core::{
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
    serve2::{
        delta::{
            Delta, DeltaFeedTaskOptions, DeltaPlacementTaskOptions, DeltaReader, DeltaTaskError,
            DeltaTaskOptions,
        },
        tests::fixture::{TamperFixture, secret},
        world::World,
    },
};

const SEED: u64 = 0xC0FF_EE11;

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

async fn unconnected_pool() -> (Arc<PostgresStorePool>, Weak<PostgresStorePool>) {
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
        .await
        .expect("should construct an unconnected pool"),
    );
    let weak = Arc::downgrade(&pool);
    (pool, weak)
}

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

async fn feed_finished(runtime: &Runtime) {
    let feed = runtime.feed.as_ref().expect("should own a feed");
    while !feed.task.is_finished() {
        tokio::time::sleep(Duration::from_millis(1)).await;
    }
}

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

#[tokio::test]
async fn open_disabled() {
    let (_fixture, generation) = axes_fixture("runtime-open-disabled");
    let (pool, weak_pool) = unconnected_pool().await;
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
    core::assert_matches!(runtime.try_join(), Ok(FeedState::Absent));
    assert!(runtime.join().await.is_none());
}

#[tokio::test]
async fn open_without_axes() {
    let fixture = TamperFixture::publish("runtime-open-without-axes");
    let (pool, weak_pool) = unconnected_pool().await;
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
    core::assert_matches!(runtime.try_join(), Ok(FeedState::Absent));
    assert!(runtime.join().await.is_none());
}

#[tokio::test]
async fn open_temporal() {
    let (_fixture, generation) = axes_fixture("runtime-open-temporal");
    assert!(generation.repository().files.projector.is_none());
    let (pool, weak_pool) = unconnected_pool().await;
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

    runtime.shutdown().await.expect("the feed should join");
    drop(runtime);

    assert!(weak_pool.upgrade().is_none());
    assert!(reader.load().contains_node(NodeRowId::MIN));
    assert!(captured.contains_node(NodeRowId::MIN));
    assert!(world.generation().path().is_dir());
}

#[tokio::test]
async fn open_invalid_interval() {
    let (_fixture, generation) = axes_fixture("runtime-open-invalid-interval");
    let (pool, weak_pool) = unconnected_pool().await;
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

    core::assert_matches!(error.current_context(), RuntimeError::Feed);
    assert!(weak_pool.upgrade().is_none());
}

#[tokio::test]
async fn start_entropy_failure() {
    let fixture = TamperFixture::publish("runtime-start-entropy-failure");
    let world = Arc::new(
        World::open(fixture.generation().clone(), &secret()).expect("the world should open"),
    );
    let (pool, weak_pool) = unconnected_pool().await;
    let error = Runtime::start(world, pool, UnavailableEntropy, None)
        .err()
        .expect("unavailable entropy should fail");

    core::assert_matches!(error.current_context(), RuntimeError::Entropy);
    assert!(weak_pool.upgrade().is_none());
}

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

        assert!(runtime.shutdown().now_or_never().is_none());
        observation
            .await
            .expect("the worker should observe shutdown");
        assert!(runtime.feed.is_some());
        release
            .send(())
            .expect("the worker should still await release");
        runtime
            .join()
            .await
            .expect("the join handle should remain owned")
            .expect("the worker should join");
        assert!(runtime.join().await.is_none());
    });
}

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

        runtime.shutdown().await.expect("the worker should join");
        runtime
            .shutdown()
            .await
            .expect("repeated shutdown should succeed");
        assert!(runtime.join().await.is_none());
    });
}

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

        let error = runtime
            .join()
            .await
            .expect("the runner should have a result")
            .expect_err("the runner should report its failure");
        core::assert_matches!(error.current_context(), RuntimeError::Feed);
        assert!(runtime.join().await.is_none());
    });
}

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

        let error = runtime
            .join()
            .await
            .expect("the runner should have a result")
            .expect_err("the runner should report its panic");
        core::assert_matches!(error.current_context(), RuntimeError::Join);
        assert!(runtime.join().await.is_none());
    });
}

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

        core::assert_matches!(runtime.try_join(), Ok(FeedState::Running));
        assert!(runtime.feed.is_some());
        release.send(()).expect("should retain the waiting worker");
        feed_finished(&runtime).await;

        core::assert_matches!(runtime.try_join(), Ok(FeedState::Finished));
        assert!(runtime.feed.is_none());
        core::assert_matches!(runtime.try_join(), Ok(FeedState::Absent));
        assert!(runtime.join().await.is_none());
        runtime.shutdown().await.expect("should remain joined");
    });
}

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
        core::assert_matches!(error.current_context(), RuntimeError::Feed);
        assert!(runtime.feed.is_none());
        core::assert_matches!(runtime.try_join(), Ok(FeedState::Absent));
        assert!(runtime.join().await.is_none());
        runtime.shutdown().await.expect("should remain joined");
    });
}

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
        core::assert_matches!(error.current_context(), RuntimeError::Join);
        assert!(runtime.feed.is_none());
        core::assert_matches!(runtime.try_join(), Ok(FeedState::Absent));
        assert!(runtime.join().await.is_none());
        runtime.shutdown().await.expect("should remain joined");
    });
}

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
