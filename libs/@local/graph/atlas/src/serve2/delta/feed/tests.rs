use alloc::sync::Arc;
use core::{ops::ControlFlow, time::Duration};

use arc_swap::Guard;
use error_stack::Report;
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
    DeltaFeedError, DeltaFeedTask, DeltaFeedTaskOptions, DeltaFeedTaskScratch,
    pending::{Pending, Placement, Stage},
};
use crate::{
    dataset::auxiliary::{Label, OwnedIcon, OwnedLabel, OwnedLegend},
    identity::{NodeRowId, OntologyRowId},
    math::{BoxedVecN, Vec2, nz},
    postgres::{Classification, edition_display::DisplayParts, id::ArchivedEntityId},
    salt::{fit::prepare::IdentityProvider as _, lod::stage::WIRE_FRAME},
    serve2::{
        delta::{
            Delta,
            epoch::Epoch,
            placement::{Completed, Initial, PendingEntry, PlacementError},
            projector::{Position, projector},
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

fn display(label: &str) -> DisplayParts {
    DisplayParts {
        label: OwnedLabel::from(label),
        icon: OwnedIcon::from("icon"),
        representative: Uuid::from_u128(1000).into(),
    }
}

fn projected() -> Position {
    projector(None)
        .project([&BoxedVecN::zero()])
        .next()
        .expect("should return a projection")
        .expect("should project a finite position")
}

fn epoch(delta: &Delta) -> Epoch {
    Epoch::from(Guard::from_inner(Arc::new(delta.clone())))
}

fn queue_node(task: &mut DeltaFeedTask, seed: u128, seconds: i64) {
    task.pending.observe(update(seed, seconds, false));
    task.apply_classifications([(ArchivedEntityId::from(entity(seed)), Classification::Node)]);
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
    assert_eq!(task.pending.updates.len(), 1);
}

/// Fitted nodes reuse their retained coordinates for metadata updates and revival.
#[tokio::test]
async fn classify_fitted_revival() {
    let mut fixture = fixture("feed-fitted-revival").await;
    let task = &mut fixture.task;
    let row = NodeRowId::MIN;
    let entity = task
        .delta
        .world
        .layout
        .index
        .identity
        .key_of(row)
        .expect("should resolve the fitted identity");
    let position = task
        .delta
        .node_position(entity)
        .expect("should retain fitted coordinates");
    assert!(task.delta.withdraw(entity));
    let mut event = match update(100, 1, false) {
        EntityEvent::Updated(event) => event,
        _ => unreachable!(),
    };
    event.entity = EntityId::from(entity);
    task.pending.observe(EntityEvent::Updated(event));
    task.apply_classifications([(entity, Classification::Node)]);
    assert!(task.pending.next_placement().is_none());
    assert!(
        matches!(task.pending.updates[&entity].stage, Stage::Node(Placement::Ready(held)) if held == position)
    );
    assert!(
        task.apply_displays(
            [(event.edition, Some(display("revived")))]
                .into_iter()
                .collect()
        )
    );
    assert!(task.apply_ready());
    assert!(task.pending.updates.is_empty());
    assert_eq!(
        task.delta.world.layout.position(&epoch(&task.delta), row),
        Some(position)
    );
}

/// A full input retains unsent nodes and drains all admitted requests without duplication.
#[tokio::test]
async fn pump_backpressure() {
    let mut fixture = fixture("feed-pump-backpressure").await;
    for seed in 100..103 {
        queue_node(&mut fixture.task, seed, 1);
    }
    assert!(fixture.task.pump(None).is_continue());
    assert!(fixture.task.pump(None).is_continue());
    let mut admitted = Vec::new();
    for _ in 0..3 {
        admitted.push(
            fixture
                .requests
                .try_recv()
                .expect("should admit one request at capacity")
                .entity,
        );
        assert!(fixture.task.pump(None).is_continue());
    }
    admitted.sort_unstable_by_key(|entity| Uuid::from(entity.entity_uuid));
    assert_eq!(admitted, [entity(100), entity(101), entity(102)]);
    assert!(fixture.requests.try_recv().is_err());
    assert!(fixture.task.pending.next_placement().is_none());
}

/// Input closure ends admission without marking an unsent update as running.
#[tokio::test]
async fn pump_closed() {
    let mut fixture = fixture("feed-pump-closed").await;
    queue_node(&mut fixture.task, 100, 1);
    fixture.requests.close();
    assert!(fixture.task.pump(None).is_break());
    assert!(fixture.task.pending.next_placement().is_some());
}

/// An archive cancels a queued placement result before it can allocate or revive a node.
#[tokio::test]
async fn receive_archived() {
    let mut fixture = fixture("feed-receive-archived").await;
    queue_node(&mut fixture.task, 100, 1);
    assert!(fixture.task.pump(None).is_continue());
    let request = fixture.requests.try_recv().expect("should submit the node");
    fixture.task.scratch.events.push(update(100, 2, true));
    fixture.task.apply_events();
    fixture.task.receive(PendingEntry {
        event: request.event,
        entity: request.entity,
        phase: Completed(Ok(projected())),
    });
    fixture.task.apply_placements();
    assert!(fixture.task.pending.updates.is_empty());
    assert!(fixture.task.scratch.positions.is_empty());
    assert_eq!(
        fixture
            .task
            .delta
            .node_row(ArchivedEntityId::from(entity(100))),
        None
    );
}

/// Placement failure removes pending work, and an overlapping read does not restart its budget.
#[tokio::test]
async fn receive_failed() {
    let mut fixture = fixture("feed-receive-failed").await;
    queue_node(&mut fixture.task, 100, 1);
    assert!(fixture.task.pump(None).is_continue());
    let request = fixture.requests.try_recv().expect("should submit the node");
    fixture.task.receive(PendingEntry {
        event: request.event,
        entity: request.entity,
        phase: Completed(Err(Report::new(PlacementError::Exhaustion))),
    });
    assert!(fixture.task.pending.updates.is_empty());
    fixture.task.pending.observe(update(100, 1, false));
    assert!(fixture.task.pending.updates.is_empty());
    queue_node(&mut fixture.task, 100, 2);
    assert!(fixture.task.pending.next_placement().is_some());
}

/// Successful placement applies fitted-frame normalization before the edition's display.
#[tokio::test]
async fn receive_wire_coordinates() {
    let mut fixture = fixture("feed-receive-wire-coordinates").await;
    queue_node(&mut fixture.task, 100, 1);
    assert!(fixture.task.pump(None).is_continue());
    let request = fixture.requests.try_recv().expect("should submit the node");
    let position = projected();
    let expected = fixture
        .task
        .delta
        .world
        .fitted_bounds()
        .normalize_into(WIRE_FRAME, &[position.get()])[0];
    assert_ne!(
        expected,
        position.get(),
        "should use a non-identity normalization case"
    );
    fixture.task.receive(PendingEntry {
        event: request.event,
        entity: request.entity,
        phase: Completed(Ok(position)),
    });
    fixture.task.apply_placements();
    let entity = ArchivedEntityId::from(request.entity);
    let edition = fixture.task.pending.updates[&entity].event.edition;
    fixture
        .task
        .apply_displays([(edition, Some(display("placed")))].into_iter().collect());
    assert!(fixture.task.apply_ready());
    let node = fixture
        .task
        .delta
        .node_row(entity)
        .expect("should allocate the node");
    assert_eq!(
        fixture
            .task
            .delta
            .world
            .layout
            .position(&epoch(&fixture.task.delta), node),
        Some(expected)
    );
    assert!(fixture.task.scratch.positions.is_empty());
    assert!(fixture.task.scratch.completed.is_empty());
}

/// Link updates require endpoint rows and never request an embedding.
#[tokio::test]
async fn edge_missing_endpoint() {
    let mut fixture = fixture("feed-edge-missing-endpoint").await;
    let task = &mut fixture.task;
    let edge = ArchivedEntityId::from(entity(100));
    let node = ArchivedEntityId::from(entity(101));
    task.pending.observe(update(100, 1, false));
    task.apply_classifications([(
        edge,
        Classification::Edge {
            source: Some(node),
            target: Some(node),
        },
    )]);
    assert!(task.pending.next_placement().is_none());
    let edition = task.pending.updates[&edge].event.edition;
    task.apply_displays([(edition, Some(display("link")))].into_iter().collect());
    assert!(!task.apply_ready());
    assert_eq!(task.pending.updates.len(), 1);
    task.delta
        .update_node(
            node,
            OwnedLegend::new(OntologyRowId::MIN, Label::new("node")),
            Vec2::ZERO,
        )
        .expect("should allocate the endpoint");
    assert!(task.apply_ready());
    assert!(task.pending.updates.is_empty());
}

/// A replaced edition ignores an older display response and accepts only its own edition.
#[tokio::test]
async fn display_replaced_edition() {
    let mut fixture = fixture("feed-display-replaced-edition").await;
    let task = &mut fixture.task;
    let entity = ArchivedEntityId::from(entity(100));
    task.delta
        .update_node(
            entity,
            OwnedLegend::new(OntologyRowId::MIN, Label::new("initial")),
            Vec2::ZERO,
        )
        .expect("should allocate the node");
    queue_node(task, 100, 1);
    let old = task.pending.updates[&entity].event.edition;
    queue_node(task, 100, 2);
    let current = task.pending.updates[&entity].event.edition;
    assert!(!task.apply_displays([(old, Some(display("old")))].into_iter().collect()));
    assert!(task.pending.updates[&entity].legend.is_none());
    assert!(!task.apply_displays([(current, None)].into_iter().collect()));
    assert!(task.pending.updates[&entity].needs_legend());
    assert!(task.apply_displays([(current, Some(display("new")))].into_iter().collect()));
    assert_eq!(
        task.pending.updates[&entity]
            .legend
            .as_ref()
            .expect("should capture the current display")
            .label(),
        "new"
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
    assert!(fixture.task.pump(None).is_continue());
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

/// A failed superseded request releases admission without discarding its replacement.
#[tokio::test]
async fn receive_superseded_failure() {
    let mut fixture = fixture("feed-superseded-failure").await;
    queue_node(&mut fixture.task, 100, 1);
    assert!(fixture.task.pump(None).is_continue());
    let request = fixture
        .requests
        .try_recv()
        .expect("should submit the first update");
    queue_node(&mut fixture.task, 100, 2);
    assert!(fixture.task.pending.next_placement().is_none());
    fixture.task.receive(PendingEntry {
        event: request.event,
        entity: request.entity,
        phase: Completed(Err(Report::new(PlacementError::Exhaustion))),
    });
    assert!(fixture.task.pending.next_placement().is_some());
    assert!(fixture.task.pump(None).is_continue());
    let replacement = fixture
        .requests
        .try_recv()
        .expect("should submit the replacement");
    assert_ne!(replacement.event, request.event);
}

/// An added node's revival reuses its first position while older epochs remain withdrawn.
#[tokio::test]
async fn classify_added_revival() {
    let mut fixture = fixture("feed-classify-added-revival").await;
    let task = &mut fixture.task;
    let entity = ArchivedEntityId::from(entity(100));
    let position = Vec2::new(0.5, -0.25);
    task.delta
        .update_node(
            entity,
            OwnedLegend::new(OntologyRowId::MIN, Label::new("original")),
            position,
        )
        .expect("should allocate a node");
    task.delta.revision.increment_by(1);
    task.delta.withdraw(entity);
    let withdrawn = epoch(&task.delta);
    task.delta.revision.increment_by(1);
    queue_node(task, 100, 1);
    assert!(
        matches!(task.pending.updates[&entity].stage, Stage::Node(Placement::Ready(held)) if held == position)
    );
    let edition = task.pending.updates[&entity].event.edition;
    task.apply_displays([(edition, Some(display("revived")))].into_iter().collect());
    assert!(task.apply_ready());
    let row = task
        .delta
        .node_row(entity)
        .expect("should resolve the retained row");
    assert_eq!(task.delta.world.layout.position(&withdrawn, row), None);
    assert_eq!(
        task.delta.world.layout.position(&epoch(&task.delta), row),
        Some(position)
    );
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
