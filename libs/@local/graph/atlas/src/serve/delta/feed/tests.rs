use alloc::sync::Arc;
use core::{future, ops::ControlFlow, pin::pin, time::Duration};

use arc_swap::{ArcSwap, Guard};
use futures::FutureExt as _;
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, EntityEvent, EntityUpdate,
    PostgresStorePool, PostgresStoreSettings,
};
use hash_graph_temporal_versioning::Timestamp;
use hashql_core::id::Id as _;
use rand::{SeedableRng as _, rngs::StdRng};
use tokio::{
    sync::{mpsc, oneshot},
    time::Instant,
};
use tokio_postgres::NoTls;
use type_system::knowledge::entity::{EntityId, id::EntityEditionId};
use uuid::Uuid;

use super::{DeltaFeedError, DeltaFeedTask, DeltaFeedTaskOptions, Placement, Publication, pump};
use crate::{
    dataset::auxiliary::{Label, OwnedLegend},
    identity::{NodeRowId, OntologyRowId},
    math::{Vec2, nz},
    postgres::{Classification, id::ArchivedEntityId},
    serve::{
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
    completed: mpsc::Sender<PendingEntry<Completed>>,
    publication: Publication,
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
    let (task, publication) = DeltaFeedTask::new(
        delta,
        Arc::new(pool),
        DeltaFeedTaskOptions {
            safety_lag: Duration::from_secs(60),
            tick_rate: Duration::from_secs(5),
        },
        Timestamp::UNIX_EPOCH,
        Some(Placement {
            requests: tx,
            completed: rx,
        }),
    )
    .expect("should construct the feed");
    Fixture {
        _generation: generation,
        task,
        requests,
        completed,
        publication,
    }
}

#[tokio::test]
async fn new_interval_zero() {
    let fixture = fixture("feed-new-interval-zero").await;
    let result = DeltaFeedTask::new(
        fixture.task.delta,
        fixture.task.pool,
        DeltaFeedTaskOptions {
            tick_rate: Duration::ZERO,
            safety_lag: Duration::ZERO,
        },
        Timestamp::UNIX_EPOCH,
        None,
    );
    let error = result
        .map(|_| ())
        .expect_err("should refuse a zero interval");
    assert!(matches!(
        error.current_context(),
        DeltaFeedError::InvalidInterval
    ));
}

#[tokio::test]
async fn new_replay_window() {
    let fixture = fixture("feed-new-replay-window").await;
    let earliest =
        Timestamp::from_unix_timestamp(time::Date::MIN.midnight().assume_utc().unix_timestamp());
    for (watermark, lag) in [
        (Timestamp::UNIX_EPOCH, Duration::MAX),
        (earliest, Duration::from_secs(1)),
    ] {
        let result = DeltaFeedTask::new(
            fixture.task.delta.clone(),
            Arc::clone(&fixture.task.pool),
            DeltaFeedTaskOptions {
                tick_rate: Duration::from_secs(5),
                safety_lag: lag,
            },
            watermark,
            None,
        );
        let error = result
            .map(|_| ())
            .expect_err("should refuse an unrepresentable replay window");
        assert!(matches!(
            error.current_context(),
            DeltaFeedError::InvalidSafetyLag
        ));
    }
    let (task, _publication) = DeltaFeedTask::new(
        fixture.task.delta,
        fixture.task.pool,
        DeltaFeedTaskOptions {
            tick_rate: Duration::from_secs(5),
            safety_lag: Duration::ZERO,
        },
        earliest,
        None,
    )
    .expect("should admit a zero lag at the earliest timestamp");
    assert_eq!(task.watermark - task.safety_lag, earliest);
}

/// Construction separates subsequent writes from a publication captured before startup.
#[tokio::test]
async fn new_captured_revision() {
    let fixture = fixture("feed-new-captured-revision").await;
    let captured = Epoch::from(Guard::from_inner(Arc::new(fixture.task.delta.clone())));
    let world = Arc::clone(&fixture.task.delta.world);
    let base = NodeRowId::MIN;
    let identity = world
        .layout
        .index
        .key_of(&captured, base)
        .expect("should resolve the base row");
    let (mut task, _publication) = DeltaFeedTask::new(
        fixture.task.delta,
        fixture.task.pool,
        fixture.task.options,
        Timestamp::UNIX_EPOCH,
        None,
    )
    .expect("should construct the feed");
    assert_eq!(task.delta.revision, captured.revision().plus(1));
    assert!(task.delta.withdraw(identity));
    assert!(world.layout.position(&captured, base).is_some());
    let current = Epoch::from(Guard::from_inner(Arc::new(task.delta.clone())));
    assert_eq!(world.layout.position(&current, base), None);
}

/// A queued notification exchanges one allocation without waiting for a database tick.
#[tokio::test]
async fn publication_exchange() {
    let mut fixture = fixture("feed-publication-exchange").await;
    let revision = fixture.task.delta.revision;
    let mut publication = pin!(
        fixture
            .publication
            .next(Arc::new(fixture.task.delta.clone()))
    );
    assert!(publication.as_mut().now_or_never().is_none());
    fixture.task.notify.notify_one();
    assert!(publication.as_mut().now_or_never().is_none());
    let period = Duration::from_hours(24);
    let mut interval = tokio::time::interval_at(Instant::now() + period, period);
    assert_eq!(
        fixture
            .task
            .step(&mut interval)
            .now_or_never()
            .expect("should receive the exchange")
            .expect("should publish"),
        ControlFlow::Continue(false)
    );
    let published = publication.await.expect("should receive the publication");
    assert_eq!(published.revision, revision);
    assert_eq!(fixture.task.delta.revision, revision.plus(1));
}

/// The publication loop swaps complete deltas while retaining an earlier capture.
#[tokio::test]
async fn publication_captured() {
    let fixture = fixture("feed-publication-captured").await;
    let current = Arc::new(ArcSwap::from_pointee(fixture.task.delta.clone()));
    let previous = current.load_full();
    let captured = Epoch::from(current.load());
    let world = Arc::clone(&fixture.task.delta.world);
    let row = NodeRowId::MIN;
    let identity = world
        .layout
        .index
        .key_of(&captured, row)
        .expect("should resolve the base identity");
    let (mut task, publication) = DeltaFeedTask::new(
        fixture.task.delta,
        fixture.task.pool,
        fixture.task.options,
        Timestamp::UNIX_EPOCH,
        None,
    )
    .expect("should construct the feed");
    let mut publishing = pin!(publication.run(Arc::clone(&current), previous, future::pending()));
    assert!(publishing.as_mut().now_or_never().is_none());
    let period = Duration::from_hours(24);
    let mut interval = tokio::time::interval_at(Instant::now() + period, period);
    for withdraw in [true, false, true] {
        if withdraw {
            assert!(task.delta.withdraw(identity));
        } else {
            assert_eq!(
                task.delta.update_node(
                    identity,
                    OwnedLegend::new(OntologyRowId::MIN, Label::new("revived")),
                    Vec2::ZERO
                ),
                Some(true)
            );
        }
        let revision = task.delta.revision;
        task.notify.notify_one();
        assert!(publishing.as_mut().now_or_never().is_none());
        assert_eq!(
            task.step(&mut interval)
                .now_or_never()
                .expect("should accept the exchange")
                .expect("should publish"),
            ControlFlow::Continue(false)
        );
        assert!(publishing.as_mut().now_or_never().is_none());
        let latest = Epoch::from(current.load());
        assert_eq!(latest.revision(), revision);
        assert_eq!(world.layout.position(&latest, row).is_none(), withdraw);
        assert!(world.layout.position(&captured, row).is_some());
    }
}

/// Shutdown closes the exchange, and feed exit closes both placement directions.
#[tokio::test]
async fn publication_shutdown() {
    let mut fixture = fixture("feed-publication-shutdown").await;
    let current = Arc::new(ArcSwap::from_pointee(fixture.task.delta.clone()));
    let previous = current.load_full();
    let (stop, shutdown) = oneshot::channel();
    let mut publishing = pin!(fixture.publication.run(current, previous, async move {
        shutdown.await.expect("should receive the shutdown request");
    }));
    assert!(publishing.as_mut().now_or_never().is_none());
    stop.send(()).expect("should request shutdown");
    publishing
        .as_mut()
        .now_or_never()
        .expect("should observe shutdown")
        .expect("should stop publication normally");
    assert!(fixture.task.update.is_closed());
    let period = Duration::from_hours(24);
    let mut interval = tokio::time::interval_at(Instant::now() + period, period);
    assert_eq!(
        fixture
            .task
            .step(&mut interval)
            .now_or_never()
            .expect("should observe exchange closure")
            .expect("should stop the feed normally"),
        ControlFlow::Break(())
    );
    drop(fixture.task);
    assert!(fixture.completed.is_closed());
    assert!(fixture.requests.recv().await.is_none());
}

#[tokio::test]
async fn publication_closed() {
    let fixture = fixture("feed-publication-closed").await;
    let previous = Arc::new(fixture.task.delta.clone());
    drop(fixture.task);
    let error = fixture
        .publication
        .next(previous)
        .await
        .err()
        .expect("should report the stopped task");
    assert!(matches!(error.current_context(), DeltaFeedError::Closed));
}

/// Missing projector channels leave placement work pending while preserving publication shutdown.
#[tokio::test]
async fn placement_disabled() {
    let fixture = fixture("feed-placement-disabled").await;
    let (mut task, publication) = DeltaFeedTask::new(
        fixture.task.delta,
        fixture.task.pool,
        fixture.task.options,
        Timestamp::UNIX_EPOCH,
        None,
    )
    .expect("should construct a feed without placement");
    queue_node(&mut task, 100, 1);
    let period = Duration::from_hours(24);
    let mut interval = tokio::time::interval_at(Instant::now() + period, period);
    assert!(task.step(&mut interval).now_or_never().is_none());
    assert!(task.pending.has_placements());
    drop(publication);
    assert_eq!(
        task.step(&mut interval)
            .now_or_never()
            .expect("should observe publication closure")
            .expect("should stop the feed"),
        ControlFlow::Break(())
    );
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
    let placement = fixture
        .task
        .placement
        .as_ref()
        .expect("should have placement channels");
    assert!(pump(&mut fixture.task.pending, &placement.requests, None).is_continue());
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
    fixture
        .task
        .placement
        .as_mut()
        .expect("should have placement channels")
        .completed
        .close();
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
