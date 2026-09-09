use alloc::sync::{Arc, Weak};
use core::{future, time::Duration};

use arc_swap::Guard;
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
    PostgresStoreSettings,
};
use hash_graph_temporal_versioning::Timestamp;
use hashql_core::id::Id as _;
use rand::{SeedableRng as _, rngs::StdRng};
use tokio::sync::oneshot;
use tokio_postgres::NoTls;

use super::{DeltaTask, DeltaTaskError, DeltaTaskOptions};
use crate::{
    device::Device,
    identity::NodeRowId,
    math::nz,
    serve2::{
        delta::{
            Delta,
            epoch::Epoch,
            feed::{DeltaFeedTask, DeltaFeedTaskOptions},
            placement::DeltaPlacementTaskOptions,
            projector::projector,
        },
        tests::fixture::{TamperFixture, secret},
        world::World,
    },
};

struct Fixture {
    _generation: TamperFixture,
    task: DeltaTask,
    pool: Weak<PostgresStorePool>,
}

fn options() -> DeltaTaskOptions {
    DeltaTaskOptions {
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
    }
}

async fn fixture(name: &str, placement: bool) -> Fixture {
    let generation = TamperFixture::publish(name);
    let world = Arc::new(
        World::open(generation.generation().clone(), &secret()).expect("should open the world"),
    );
    let delta = Delta::new(world, StdRng::seed_from_u64(17)).expect("should initialize the delta");
    // Failure and shutdown cases use an unconnected pool without a database server.
    let pool = Arc::new(
        PostgresStorePool::new(
            &DatabaseConnectionInfo::new(
                DatabaseType::Postgres,
                "task-test".to_owned(),
                String::new(),
                "/no-task-test-postgres".to_owned(),
                5432,
                "task-test".to_owned(),
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
    let task = DeltaTask::new(
        delta,
        pool,
        Timestamp::UNIX_EPOCH,
        placement.then(|| projector(None)),
        None,
        options(),
    )
    .expect("should construct the runner");
    Fixture {
        _generation: generation,
        task,
        pool: weak,
    }
}

/// A reader starts at the supplied revision and retains its world after the runner drops.
#[tokio::test]
async fn reader_initial() {
    let fixture = fixture("delta-task-reader-initial", false).await;
    let reader = fixture.task.reader();
    let world = Arc::clone(&fixture.task.previous.world);
    let epoch = reader.load();
    assert_eq!(epoch.revision(), fixture.task.previous.revision);
    assert!(world.layout.position(&epoch, NodeRowId::MIN).is_some());
    drop(fixture.task);
    assert!(fixture.pool.upgrade().is_none());
    assert!(
        world
            .layout
            .position(&reader.load(), NodeRowId::MIN)
            .is_some()
    );
}

/// Replacement cannot alter an epoch held from an earlier publication.
#[tokio::test]
async fn reader_captured() {
    let fixture = fixture("delta-task-reader-captured", false).await;
    let reader = fixture.task.reader();
    let captured = reader.load();
    let mut next = fixture.task.previous.as_ref().clone();
    let world = Arc::clone(&next.world);
    let row = NodeRowId::MIN;
    let identity = world
        .layout
        .index
        .key_of(&captured, row)
        .expect("should resolve the base identity");
    next.revision.increment_by(1);
    assert!(next.withdraw(identity));
    fixture.task.current.store(Arc::new(next));
    assert!(world.layout.position(&captured, row).is_some());
    assert_eq!(world.layout.position(&reader.load(), row), None);
}

/// Dropping an unpolled runner future releases both workers and their completion receiver.
#[tokio::test]
async fn run_cancelled() {
    let fixture = fixture("delta-task-run-cancelled", true).await;
    let reader = fixture.task.reader();
    let completed = fixture
        .task
        .placement
        .as_ref()
        .expect("should have a placement worker")
        .completed
        .clone();
    assert!(!completed.is_closed());
    drop(fixture.task.run(future::pending()));
    assert!(completed.is_closed());
    assert!(fixture.pool.upgrade().is_none());
    assert!(reader.load().contains_node(NodeRowId::MIN));
}

/// A failed publication closes the chain and the runner joins its worker siblings.
#[tokio::test]
async fn run_publication_closed() {
    let mut fixture = fixture("delta-task-publication-closed", true).await;
    let reader = fixture.task.reader();
    let previous = fixture.task.previous.as_ref().clone();
    let captured = Epoch::from(Guard::from_inner(Arc::new(previous.clone())));
    let (feed, publication) = DeltaFeedTask::new(
        previous,
        fixture.pool.upgrade().expect("should retain the pool"),
        options().feed,
        Timestamp::UNIX_EPOCH,
        None,
    )
    .expect("should construct the replacement publication channel");
    drop(feed);
    fixture.task.publication = publication;
    let completed = fixture
        .task
        .placement
        .as_ref()
        .expect("should have a placement worker")
        .completed
        .clone();
    let error = tokio::spawn(fixture.task.run(future::pending()))
        .await
        .expect("should join the runner")
        .expect_err("should report publication failure");
    assert!(matches!(
        error.current_contexts().collect::<Vec<_>>().as_slice(),
        [DeltaTaskError::Publication]
    ));
    assert!(completed.is_closed());
    assert!(fixture.pool.upgrade().is_none());
    assert_eq!(reader.load().revision(), captured.revision());
}

/// An already-requested shutdown starts no worker and leaves its reader usable.
#[tokio::test]
async fn run_shutdown_ready() {
    let fixture = fixture("delta-task-shutdown-ready", true).await;
    let reader = fixture.task.reader();
    let completed = fixture
        .task
        .placement
        .as_ref()
        .expect("should have a placement worker")
        .completed
        .clone();
    fixture
        .task
        .run(future::ready(()))
        .await
        .expect("should accept an immediate shutdown");
    assert!(completed.is_closed());
    assert!(fixture.pool.upgrade().is_none());
    assert!(reader.load().contains_node(NodeRowId::MIN));
}

/// Completing the owner's shutdown future joins the workers without invalidating a capture.
#[tokio::test]
async fn run_shutdown_active() {
    let fixture = fixture("delta-task-shutdown-active", true).await;
    let reader = fixture.task.reader();
    let captured = reader.load();
    let completed = fixture
        .task
        .placement
        .as_ref()
        .expect("should have a placement worker")
        .completed
        .clone();
    let (stop, shutdown) = oneshot::channel();
    let running = tokio::spawn(fixture.task.run(async move {
        let _ = shutdown.await;
    }));
    tokio::task::yield_now().await;
    assert!(!running.is_finished());
    stop.send(()).expect("should request shutdown");
    tokio::time::timeout(Duration::from_secs(5), running)
        .await
        .expect("should drain without waiting for a database poll")
        .expect("should join the runner")
        .expect("should stop normally");
    assert!(completed.is_closed());
    assert!(fixture.pool.upgrade().is_none());
    assert_eq!(reader.load().revision(), captured.revision());
    assert!(captured.contains_node(NodeRowId::MIN));
}

#[tokio::test]
async fn open_without_axes() {
    let fixture = fixture("delta-task-open-without-axes", false).await;
    let (reader, task) = DeltaTask::open(
        fixture.task.previous.as_ref().clone(),
        fixture.pool.upgrade().expect("should retain the pool"),
        options(),
        Device::Cpu.pin(0).resolve(),
        None,
    )
    .expect("should skip a generation without temporal axes");
    assert!(task.is_none());
    assert!(reader.load().contains_node(NodeRowId::MIN));
}
