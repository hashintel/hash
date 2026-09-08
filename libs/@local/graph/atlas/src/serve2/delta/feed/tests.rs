use alloc::sync::Arc;
use core::{ops::ControlFlow, time::Duration};

use arc_swap::Guard;
use futures::FutureExt as _;
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, EntityEvent, EntityUpdate,
    PostgresStorePool, PostgresStoreSettings,
};
use hash_graph_temporal_versioning::Timestamp;
use hashql_core::id::Id as _;
use rand::{SeedableRng as _, rngs::StdRng};
use tokio::{
    sync::{Notify, mpsc, oneshot},
    time::Instant,
};
use tokio_postgres::NoTls;
use type_system::knowledge::entity::{EntityId, id::EntityEditionId};
use uuid::Uuid;

use super::{
    DeltaFeedError, DeltaFeedTask, DeltaFeedTaskOptions, DeltaFeedTaskScratch, pending::Pending,
    pump,
};
use crate::{
    dataset::auxiliary::{Label, OwnedLegend},
    identity::OntologyRowId,
    math::{Vec2, nz},
    postgres::{Classification, id::ArchivedEntityId},
    serve2::{
        delta::{
            Delta,
            epoch::Epoch,
            placement::{Completed, Initial, PendingEntry},
        },
        tests::fixture::{TamperFixture, secret},
        world::World,
    },
};

struct Fixture {
    _generation: TamperFixture,
    task: DeltaFeedTask,
    requests: mpsc::Receiver<PendingEntry<Initial>>,
    _completed: mpsc::Sender<PendingEntry<Completed>>,
    _publications: mpsc::Sender<(Delta, oneshot::Sender<Delta>)>,
}

async fn fixture(name: &str) -> Fixture {
    let generation = TamperFixture::publish(name);
    let world = World::open(generation.generation().clone(), &secret())
        .expect("should open the synthetic world");
    let delta =
        Delta::new(Arc::new(world), StdRng::seed_from_u64(12)).expect("should create a delta");
    // Pool construction opens no connection. These cases supply read results directly.
    let pool = PostgresStorePool::new(
        &DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            "feed-test".to_owned(),
            String::new(),
            "/no-feed-test-postgres".to_owned(),
            5432,
            "feed-test".to_owned(),
        ),
        &DatabasePoolConfig {
            max_connections: nz!(1),
        },
        NoTls,
        PostgresStoreSettings::default(),
    )
    .await
    .expect("should construct an unconnected pool");
    let (tx, requests) = mpsc::channel(1);
    let (completed, rx) = mpsc::channel(4);
    let (publications, update) = mpsc::channel(1);
    Fixture {
        _generation: generation,
        task: DeltaFeedTask {
            delta,
            pool: Arc::new(pool),
            options: DeltaFeedTaskOptions {
                safety_lag: Duration::from_secs(60),
                tick_rate: Duration::from_secs(5),
            },
            watermark: Timestamp::from_unix_timestamp(0),
            safety_lag: time::Duration::seconds(60),
            replayed: false,
            update,
            notify: Notify::new(),
            rx,
            tx,
            pending: Pending::default(),
            scratch: DeltaFeedTaskScratch::default(),
        },
        requests,
        _completed: completed,
        _publications: publications,
    }
}

pub(super) fn entity(seed: u128) -> EntityId {
    EntityId::from(ArchivedEntityId {
        web_id: Uuid::from_u128(1).into(),
        entity_uuid: Uuid::from_u128(seed).into(),
    })
}

pub(super) fn update(seed: u128, seconds: i64, archived: bool) -> EntityEvent {
    EntityEvent::Updated(EntityUpdate {
        entity: entity(seed),
        edition: EntityEditionId::new(Uuid::from_u128(
            seed * 1_000 + u128::from(seconds.unsigned_abs()),
        )),
        archived,
        changed_at: Timestamp::from_unix_timestamp(seconds),
    })
}

fn queue_node(task: &mut DeltaFeedTask, seed: u128, seconds: i64) {
    task.pending.observe(update(seed, seconds, false));
    task.pending.classify(
        &task.delta,
        [(ArchivedEntityId::from(entity(seed)), Classification::Node)],
    );
}

/// The first quiet replay publishes once, and overlap never decreases the watermark.
#[tokio::test]
async fn replay_watermark() {
    let mut fixture = fixture("feed-replay-watermark").await;
    let task = &mut fixture.task;
    assert!(task.apply_events());
    assert!(!task.apply_events());
    task.scratch.events.push(update(100, 10, false));
    assert!(!task.apply_events());
    assert_eq!(task.watermark, Timestamp::from_unix_timestamp(10));
    task.scratch.events.push(update(100, 9, false));
    assert!(!task.apply_events());
    assert_eq!(task.watermark, Timestamp::from_unix_timestamp(10));
    assert_eq!(
        task.pending.classifications().collect::<Vec<_>>(),
        [ArchivedEntityId::from(entity(100))]
    );
}

/// Publication reuses the supplied allocation and a cancelled reply preserves the revision.
#[tokio::test]
async fn exchange_cancelled_reply() {
    let mut fixture = fixture("feed-exchange-cancelled-reply").await;
    let task = &mut fixture.task;
    let previous = task.delta.clone();
    let revision = task.delta.revision;
    let (reply, receive) = oneshot::channel();
    task.exchange(previous, reply);
    let published = receive.await.expect("should receive the publication");
    assert_eq!(published.revision, revision);
    assert_eq!(task.delta.revision, revision.plus(1));
    let (reply, receive) = oneshot::channel();
    drop(receive);
    task.exchange(published, reply);
    assert_eq!(task.delta.revision, revision.plus(1));
}

/// Capacity becoming available resumes admission without a database tick.
#[tokio::test]
async fn step_capacity_ready() {
    let mut fixture = fixture("feed-step-capacity-ready").await;
    queue_node(&mut fixture.task, 100, 1);
    queue_node(&mut fixture.task, 101, 1);
    assert!(pump(&mut fixture.task.pending, &fixture.task.tx, None).is_continue());
    let period = Duration::from_hours(24);
    let mut interval = tokio::time::interval_at(Instant::now() + period, period);
    assert!(fixture.task.step(&mut interval).now_or_never().is_none());
    let first = fixture
        .requests
        .try_recv()
        .expect("should release input capacity");
    let result = fixture
        .task
        .step(&mut interval)
        .now_or_never()
        .expect("should use the available capacity")
        .expect("should keep the placement channel open");
    assert_eq!(result, ControlFlow::Continue(false));
    let second = fixture
        .requests
        .try_recv()
        .expect("should submit the next node");
    assert_ne!(first.entity, second.entity);
    assert_eq!(fixture.task.watermark, Timestamp::from_unix_timestamp(0));
    assert!(!fixture.task.replayed);
}

/// Result-channel closure reports task failure without waiting for a database tick.
#[tokio::test]
async fn step_result_closed() {
    let mut fixture = fixture("feed-step-result-closed").await;
    fixture.task.rx.close();
    let period = Duration::from_hours(24);
    let mut interval = tokio::time::interval_at(Instant::now() + period, period);
    let error = fixture
        .task
        .step(&mut interval)
        .now_or_never()
        .expect("should observe channel closure")
        .expect_err("should report the missing placement task");
    assert!(matches!(
        error.current_context(),
        DeltaFeedError::PlacementClosed
    ));
}

/// Closing publication requests ends the task without advancing its database watermark.
#[tokio::test]
async fn step_publication_closed() {
    let mut fixture = fixture("feed-step-publication-closed").await;
    fixture.task.update.close();
    let period = Duration::from_hours(24);
    let mut interval = tokio::time::interval_at(Instant::now() + period, period);
    assert_eq!(
        fixture
            .task
            .step(&mut interval)
            .now_or_never()
            .expect("should observe publication closure")
            .expect("should stop normally"),
        ControlFlow::Break(())
    );
    assert_eq!(fixture.task.watermark, Timestamp::from_unix_timestamp(0));
}

#[tokio::test]
async fn replay_withdrawal() {
    let mut fixture = fixture("feed-replay-withdrawal").await;
    let task = &mut fixture.task;
    let key = ArchivedEntityId::from(entity(100));
    task.delta
        .update_node(
            key,
            OwnedLegend::new(OntologyRowId::MIN, Label::new("visible")),
            Vec2::ZERO,
        )
        .expect("should allocate the node");
    let row = task
        .delta
        .node_row(key)
        .expect("should retain the node's row");
    task.scratch.events.push(update(100, 1, true));
    assert!(task.apply_events());
    let epoch = Epoch::from(Guard::from_inner(Arc::new(task.delta.clone())));
    assert_eq!(task.delta.world.layout.position(&epoch, row), None);
    assert_eq!(task.delta.node_row(key), Some(row));
}
