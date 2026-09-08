use alloc::sync::Arc;
use core::{
    future::{Future as _, pending, ready},
    ops::ControlFlow,
    pin::pin,
    task::{Context, Waker},
    time::Duration,
};

use error_stack::Report;
use futures::FutureExt as _;
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
    PostgresStoreSettings,
};
use hashql_core::id::Id as _;
use tokio::{sync::mpsc, time::Instant};
use tokio_postgres::NoTls;
use type_system::{
    knowledge::entity::EntityId,
    principal::actor::{ActorId, ActorType},
};
use uuid::Uuid;

use super::{
    Completed, DeltaPlacementError, DeltaPlacementTask, DeltaPlacementTaskOptions, Initial,
    PendingEntry, PlacementError, Tick,
    pending::{Pending, Project, SubmitWorkflow},
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::{BoxedVecN, nz},
    postgres::id::ArchivedEntityId,
    serve2::delta::{
        feed::EventId,
        projector::{ProjectionError, projector},
    },
};

fn request(event: u32) -> PendingEntry<Initial> {
    PendingEntry {
        event: EventId::new(event),
        entity: EntityId::from(ArchivedEntityId {
            web_id: Uuid::from_u128(1).into(),
            entity_uuid: Uuid::from_u128(u128::from(event)).into(),
        }),
        phase: Initial,
    }
}

fn completion(event: u32) -> PendingEntry<Completed> {
    request(event).transition(Completed(Err(Report::new(PlacementError::Exhaustion))))
}

fn options() -> DeltaPlacementTaskOptions {
    DeltaPlacementTaskOptions {
        tick_rate: Duration::from_hours(24),
        tries_workflow: 2,
        tries_database: 2,
        minimum_projection_interval: 5,
        max_pending: nz!(2),
    }
}

async fn task() -> DeltaPlacementTask {
    // Pool construction opens no connection. These cases stop before store acquisition.
    let pool = PostgresStorePool::new(
        &DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            "placement-test".to_owned(),
            String::new(),
            "/no-placement-test-postgres".to_owned(),
            5432,
            "placement-test".to_owned(),
        ),
        &DatabasePoolConfig {
            max_connections: nz!(1),
        },
        NoTls,
        PostgresStoreSettings::default(),
    )
    .await
    .expect("should construct an unconnected pool");
    DeltaPlacementTask::new(Arc::new(pool), options(), None)
        .expect("should accept a non-zero interval")
}

#[tokio::test]
async fn interval_zero() {
    let task = task().await;
    let mut options = options();
    options.tick_rate = Duration::ZERO;
    let error = DeltaPlacementTask::new(task.pool, options, None)
        .err()
        .expect("should refuse a zero interval");
    assert!(matches!(
        error.current_context(),
        DeltaPlacementError::InvalidInterval
    ));
}

#[tokio::test]
async fn projection_cadence() {
    let mut task = task().await;
    assert!(!task.projection_due());
    task.pending.project.push(request(1).transition(Project {
        embedding: BoxedVecN::zero(),
    }));
    assert!(task.projection_due());
    task.last_projection_at = Some(Tick::new(10));
    task.tick = Tick::new(14);
    assert!(!task.projection_due());
    task.tick = Tick::new(15);
    assert!(task.projection_due());
    task.tick = Tick::new(16);
    assert!(task.projection_due());
    task.pending.project.clear();
    assert!(!task.projection_due());
}

#[tokio::test]
async fn delivery_preserves_cadence() {
    let mut task = task().await;
    task.pending
        .completed
        .extend([completion(1), completion(2)]);
    let (_requests, mut rx) = mpsc::channel(1);
    let (tx, mut completed) = mpsc::channel(2);
    let mut input_open = true;
    let period = Duration::from_hours(24);
    let mut interval = tokio::time::interval_at(Instant::now() + period, period);

    assert!(
        task.wait_for_tick(&mut rx, &tx, &mut input_open, &mut interval)
            .now_or_never()
            .is_none()
    );
    assert_eq!(
        completed
            .try_recv()
            .expect("should deliver the first result")
            .event,
        EventId::new(1)
    );
    assert_eq!(
        completed
            .try_recv()
            .expect("should deliver the second result")
            .event,
        EventId::new(2)
    );
    assert_eq!(task.pending.len(), 0);
    assert_eq!(task.tick, Tick::new(0));
}

#[tokio::test]
async fn admission_capacity() {
    let mut task = task().await;
    let (requests, mut rx) = mpsc::channel(3);
    for event in 1..=3 {
        requests
            .try_send(request(event))
            .expect("should queue each request within input capacity");
    }
    let (tx, _completed) = mpsc::channel(1);
    let mut input_open = true;
    let period = Duration::from_hours(24);
    let mut interval = tokio::time::interval_at(Instant::now() + period, period);

    assert!(
        task.wait_for_tick(&mut rx, &tx, &mut input_open, &mut interval)
            .now_or_never()
            .is_none()
    );
    assert_eq!(task.pending.len(), 2);
    assert_eq!(rx.len(), 1);
    assert_eq!(task.pending.poll_database[0].phase.tries, 2);
    assert_eq!(task.pending.poll_database[1].phase.tries, 2);
}

#[tokio::test]
async fn input_closed_drain() {
    let mut task = task().await;
    task.pending
        .completed
        .extend([completion(1), completion(2)]);
    let (requests, mut rx) = mpsc::channel(1);
    drop(requests);
    let (tx, mut completed) = mpsc::channel(2);
    let mut input_open = true;
    let period = Duration::from_hours(24);
    let mut interval = tokio::time::interval_at(Instant::now() + period, period);

    assert_eq!(
        task.wait_for_tick(&mut rx, &tx, &mut input_open, &mut interval)
            .now_or_never(),
        Some(ControlFlow::Break(()))
    );
    assert!(!input_open);
    assert_eq!(task.pending.len(), 0);
    assert_eq!(
        completed
            .try_recv()
            .expect("should deliver the first result")
            .event,
        EventId::new(1)
    );
    assert_eq!(
        completed
            .try_recv()
            .expect("should deliver the second result")
            .event,
        EventId::new(2)
    );
}

#[tokio::test]
async fn output_closed() {
    let mut task = task().await;
    task.pending.completed.push_back(completion(1));
    let (_requests, mut rx) = mpsc::channel(1);
    let (tx, completed) = mpsc::channel(1);
    drop(completed);
    let mut input_open = true;
    let period = Duration::from_hours(24);
    let mut interval = tokio::time::interval_at(Instant::now() + period, period);
    assert_eq!(
        task.wait_for_tick(&mut rx, &tx, &mut input_open, &mut interval)
            .now_or_never(),
        Some(ControlFlow::Break(()))
    );
}

#[tokio::test]
async fn ready_tick_full_output() {
    let mut task = task().await;
    task.pending.completed.push_back(completion(2));
    let (_requests, mut rx) = mpsc::channel(1);
    let (tx, _completed) = mpsc::channel(1);
    tx.try_send(completion(1))
        .expect("should fill the output channel");
    let mut input_open = true;
    let mut interval = tokio::time::interval(Duration::from_hours(24));
    assert_eq!(
        task.wait_for_tick(&mut rx, &tx, &mut input_open, &mut interval)
            .await,
        ControlFlow::Continue(())
    );
    assert_eq!(task.pending.completed.len(), 1);
    assert_eq!(task.pending.completed[0].event, EventId::new(2));
}

#[tokio::test]
async fn actor_lookup_failure() {
    let mut cached = None;
    let mut pending = Pending::default();
    pending
        .submit_workflow
        .push(request(1).transition(SubmitWorkflow));
    let result = DeltaPlacementTask::resolve_actor(
        &mut cached,
        &mut pending,
        ready(Err::<ActorId, _>("unavailable")),
    )
    .await;
    assert_eq!(result, ControlFlow::Break(()));
    assert_eq!(cached, Some(ControlFlow::Break(())));
    assert!(pending.submit_workflow.is_empty());
    assert_eq!(pending.completed.len(), 1);
    assert!(matches!(
        pending.completed[0]
            .phase
            .0
            .as_ref()
            .expect_err("should exhaust the submission")
            .current_context(),
        PlacementError::Exhaustion
    ));
}

#[tokio::test]
async fn actor_unavailable_cached() {
    let mut cached = Some(ControlFlow::Break(()));
    let mut entries = Pending::default();
    entries
        .submit_workflow
        .push(request(1).transition(SubmitWorkflow));
    let result = DeltaPlacementTask::resolve_actor(
        &mut cached,
        &mut entries,
        pending::<Result<ActorId, &str>>(),
    )
    .now_or_never();
    assert_eq!(result, Some(ControlFlow::Break(())));
    assert!(entries.submit_workflow.is_empty());
    assert_eq!(entries.completed.len(), 1);
}

#[tokio::test]
async fn actor_available_cached() {
    let actor = ActorId::new(Uuid::from_u128(1), ActorType::Machine);
    let mut cached = None;
    let mut entries = Pending::default();
    entries
        .submit_workflow
        .push(request(1).transition(SubmitWorkflow));
    assert_eq!(
        DeltaPlacementTask::resolve_actor(&mut cached, &mut entries, ready(Ok::<_, &str>(actor)))
            .await,
        ControlFlow::Continue(actor)
    );
    assert_eq!(cached, Some(ControlFlow::Continue(actor)));
    assert_eq!(
        DeltaPlacementTask::resolve_actor(
            &mut cached,
            &mut entries,
            pending::<Result<ActorId, &str>>()
        )
        .now_or_never(),
        Some(ControlFlow::Continue(actor))
    );
    assert_eq!(entries.submit_workflow.len(), 1);
    assert!(entries.completed.is_empty());
}

#[tokio::test]
async fn projection_owned_batch() {
    let mut projector = projector(None);
    let input = BoxedVecN::from([1.0; PROJECTOR_DIMENSIONS]);
    let expected = projector
        .project([&input])
        .next()
        .expect("should return one result")
        .expect("should project a finite input");
    let batch = vec![
        request(17).transition(Project { embedding: input }),
        request(3).transition(Project {
            embedding: BoxedVecN::from([f32::NAN; PROJECTOR_DIMENSIONS]),
        }),
        request(9).transition(Project {
            embedding: BoxedVecN::from([1.0; PROJECTOR_DIMENSIONS]),
        }),
    ];
    let (projector, completed) = DeltaPlacementTask::project(projector, batch)
        .await
        .expect("should complete the offloaded batch");
    let completed: Vec<_> = completed.collect();
    assert_eq!(
        completed
            .iter()
            .map(|entry| entry.event)
            .collect::<Vec<_>>(),
        [EventId::new(17), EventId::new(3), EventId::new(9)]
    );
    for entry in &completed {
        let entity = request(entry.event.as_u32()).entity;
        assert_eq!(entry.entity, entity);
    }
    assert_eq!(
        completed[0]
            .phase
            .0
            .as_ref()
            .expect("should place the first row"),
        &expected
    );
    assert_eq!(
        completed[2]
            .phase
            .0
            .as_ref()
            .expect("should place the last row"),
        &expected
    );
    let error = completed[1]
        .phase
        .0
        .as_ref()
        .expect_err("should retain the row failure");
    assert!(matches!(
        error.current_context(),
        PlacementError::Projection
    ));
    assert_eq!(
        error.downcast_ref::<ProjectionError>(),
        Some(&ProjectionError::NonFiniteProjection)
    );

    let (_, completed) = DeltaPlacementTask::project(
        projector,
        vec![request(20).transition(Project {
            embedding: BoxedVecN::from([1.0; PROJECTOR_DIMENSIONS]),
        })],
    )
    .await
    .expect("should reuse the returned projector");
    let completed: Vec<_> = completed.collect();
    assert_eq!(completed.len(), 1);
    assert_eq!(
        completed[0]
            .phase
            .0
            .as_ref()
            .expect("should place the next batch"),
        &expected
    );
}

#[tokio::test]
async fn projection_worker_yield() {
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(1)
        .build()
        .expect("should build the test worker pool");
    let batch = vec![request(1).transition(Project {
        embedding: BoxedVecN::zero(),
    })];
    let mut job = pin!(DeltaPlacementTask::project(projector(None), batch));
    // The only worker cannot run the queued projection until this first poll returns.
    let first = pool.install(|| job.as_mut().poll(&mut Context::from_waker(Waker::noop())));
    assert!(first.is_pending());
    let (_, completed) = job.await.expect("should return after the worker runs");
    let completed: Vec<_> = completed.collect();
    assert_eq!(completed.len(), 1);
    assert_eq!(completed[0].event, EventId::new(1));
}
