use core::ops::ControlFlow;

use error_stack::Report;
use hashql_core::collections::FastHashMap;
use tokio::sync::mpsc;
use type_system::knowledge::entity::EntityId;
use uuid::Uuid;

use super::{
    Completed, Initial, Pending, PendingEntry, PollDatabase, PollWorkflow, Project, SubmitWorkflow,
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    math::BoxedVecN,
    postgres::id::ArchivedEntityId,
    serve2::delta::{feed::EventId, placement::PlacementError},
};

fn entity(value: u128) -> EntityId {
    EntityId::from(ArchivedEntityId {
        web_id: Uuid::from_u128(1).into(),
        entity_uuid: Uuid::from_u128(value).into(),
    })
}

fn embedding(fill: f32) -> BoxedVecN<PROJECTOR_DIMENSIONS> {
    BoxedVecN::from([fill; PROJECTOR_DIMENSIONS])
}

fn errored(event: u32, entity_value: u128) -> PendingEntry<Completed> {
    PendingEntry {
        event: EventId::new(event),
        entity: entity(entity_value),
        phase: Completed(Err(Report::new(PlacementError::Exhaustion))),
    }
}

#[test]
fn enqueue_budget() {
    let mut pending = Pending::default();
    let initial = PendingEntry {
        event: EventId::new(1),
        entity: entity(1),
        phase: Initial,
    };

    pending.enqueue(initial, 4);

    assert_eq!(pending.poll_database.len(), 1);
    assert_eq!(pending.poll_database[0].event, EventId::new(1));
    assert_eq!(pending.poll_database[0].entity, entity(1));
    assert_eq!(pending.poll_database[0].phase.tries, 4);
}

#[test]
fn database_hit() {
    let mut pending = Pending::default();
    let hit_entity = entity(1);
    let miss_entity = entity(2);

    pending.poll_database.push(PendingEntry {
        event: EventId::new(10),
        entity: hit_entity,
        phase: PollDatabase { tries: 3 },
    });
    pending.poll_database.push(PendingEntry {
        event: EventId::new(11),
        entity: miss_entity,
        phase: PollDatabase { tries: 3 },
    });

    let source = embedding(0.25);
    let source_ptr = source.as_array().as_ptr();
    let mut embeddings = FastHashMap::default();
    embeddings.extend([(ArchivedEntityId::from(hit_entity), source)]);

    pending.transition_database(&mut embeddings);

    assert_eq!(pending.poll_database.len(), 1);
    assert_eq!(pending.poll_database[0].entity, miss_entity);
    assert!(pending.submit_workflow.is_empty());

    assert_eq!(pending.project.len(), 1);
    let projected = &pending.project[0];
    assert_eq!(projected.event, EventId::new(10));
    assert_eq!(projected.entity, hit_entity);
    assert_eq!(
        projected.phase.embedding.as_array().as_ptr(),
        source_ptr,
        "should move the map's allocation into the project entry, not clone it"
    );

    assert!(
        embeddings
            .remove(&ArchivedEntityId::from(hit_entity))
            .is_none()
    );
}

#[test]
fn database_final_hit() {
    let mut pending = Pending::default();
    let hit_entity = entity(1);

    pending.poll_database.push(PendingEntry {
        event: EventId::new(20),
        entity: hit_entity,
        phase: PollDatabase { tries: 1 },
    });

    let mut embeddings = FastHashMap::default();
    embeddings.extend([(ArchivedEntityId::from(hit_entity), embedding(0.75))]);

    pending.transition_database(&mut embeddings);

    assert!(pending.poll_database.is_empty());
    assert!(pending.submit_workflow.is_empty());
    assert_eq!(pending.project.len(), 1);
    assert_eq!(pending.project[0].entity, hit_entity);
}

#[test]
fn database_zero_hit() {
    let mut pending = Pending::default();
    let hit_entity = entity(1);

    pending.poll_database.push(PendingEntry {
        event: EventId::new(21),
        entity: hit_entity,
        phase: PollDatabase { tries: 0 },
    });

    let mut embeddings = FastHashMap::default();
    embeddings.extend([(ArchivedEntityId::from(hit_entity), embedding(0.75))]);

    pending.transition_database(&mut embeddings);

    assert!(pending.poll_database.is_empty());
    assert!(pending.submit_workflow.is_empty());
    assert_eq!(pending.project.len(), 1);
    assert_eq!(pending.project[0].entity, hit_entity);
}

#[test]
fn database_miss() {
    let mut pending = Pending::default();
    let miss_entity = entity(1);

    pending.poll_database.push(PendingEntry {
        event: EventId::new(30),
        entity: miss_entity,
        phase: PollDatabase { tries: 2 },
    });

    let mut embeddings = FastHashMap::default();

    pending.transition_database(&mut embeddings);

    assert_eq!(pending.poll_database.len(), 1);
    assert_eq!(pending.poll_database[0].phase.tries, 1);
    assert!(pending.submit_workflow.is_empty());

    pending.transition_database(&mut embeddings);

    assert!(pending.poll_database.is_empty());
    assert_eq!(pending.submit_workflow.len(), 1);
    assert_eq!(pending.submit_workflow[0].entity, miss_entity);
    assert_eq!(pending.submit_workflow[0].event, EventId::new(30));

    pending.transition_database(&mut embeddings);

    assert!(pending.poll_database.is_empty());
    assert_eq!(
        pending.submit_workflow.len(),
        1,
        "should not promote the same entry a second time"
    );
}

#[test]
fn workflow_hit() {
    let mut pending = Pending::default();
    let hit_entity = entity(1);

    pending.poll_workflow.push(PendingEntry {
        event: EventId::new(40),
        entity: hit_entity,
        phase: PollWorkflow { tries: 2 },
    });

    let mut embeddings = FastHashMap::default();
    let key = ArchivedEntityId::from(hit_entity);
    embeddings.extend([(key, embedding(0.5))]);

    pending.transition_workflow(&mut embeddings);

    assert!(pending.poll_workflow.is_empty());
    assert!(pending.completed.is_empty());
    assert_eq!(pending.project.len(), 1);
    assert_eq!(pending.project[0].entity, hit_entity);
    assert_eq!(pending.project[0].phase.embedding, embedding(0.5));
    assert!(embeddings.remove(&key).is_none());
}

#[test]
fn workflow_final_hit() {
    let mut pending = Pending::default();
    let hit_entity = entity(1);

    pending.poll_workflow.push(PendingEntry {
        event: EventId::new(42),
        entity: hit_entity,
        phase: PollWorkflow { tries: 1 },
    });

    let mut embeddings = FastHashMap::default();
    embeddings.extend([(ArchivedEntityId::from(hit_entity), embedding(0.5))]);

    pending.transition_workflow(&mut embeddings);

    assert!(pending.poll_workflow.is_empty());
    assert!(pending.completed.is_empty());
    assert_eq!(pending.project.len(), 1);
    assert_eq!(pending.project[0].entity, hit_entity);
}

#[test]
fn workflow_zero_hit() {
    let mut pending = Pending::default();
    let hit_entity = entity(1);

    pending.poll_workflow.push(PendingEntry {
        event: EventId::new(43),
        entity: hit_entity,
        phase: PollWorkflow { tries: 0 },
    });

    let mut embeddings = FastHashMap::default();
    embeddings.extend([(ArchivedEntityId::from(hit_entity), embedding(0.5))]);

    pending.transition_workflow(&mut embeddings);

    assert!(pending.poll_workflow.is_empty());
    assert!(pending.completed.is_empty());
    assert_eq!(pending.project.len(), 1);
    assert_eq!(pending.project[0].entity, hit_entity);
}

#[test]
fn workflow_exhaustion() {
    let mut pending = Pending::default();
    let miss_entity = entity(1);

    pending.poll_workflow.push(PendingEntry {
        event: EventId::new(41),
        entity: miss_entity,
        phase: PollWorkflow { tries: 2 },
    });

    let mut embeddings = FastHashMap::default();

    pending.transition_workflow(&mut embeddings);

    assert_eq!(pending.poll_workflow.len(), 1);
    assert_eq!(pending.poll_workflow[0].phase.tries, 1);
    assert!(pending.completed.is_empty());

    pending.transition_workflow(&mut embeddings);

    assert!(pending.poll_workflow.is_empty());
    assert_eq!(pending.completed.len(), 1);
    assert_eq!(pending.completed[0].entity, miss_entity);
    let Err(report) = &pending.completed[0].phase.0 else {
        panic!("should complete with an error after the final workflow miss")
    };
    assert!(matches!(
        report.current_context(),
        PlacementError::Exhaustion
    ));

    pending.transition_workflow(&mut embeddings);

    assert!(pending.poll_workflow.is_empty());
    assert_eq!(
        pending.completed.len(),
        1,
        "should not exhaust the same entry a second time"
    );
}

#[test]
fn submit_exhaustion() {
    let mut pending = Pending::default();
    let first = entity(1);
    let second = entity(2);

    pending.submit_workflow.push(PendingEntry {
        event: EventId::new(50),
        entity: first,
        phase: SubmitWorkflow,
    });
    pending.submit_workflow.push(PendingEntry {
        event: EventId::new(51),
        entity: second,
        phase: SubmitWorkflow,
    });

    pending.exhaust_submit_workflow();

    assert!(pending.submit_workflow.is_empty());
    assert_eq!(pending.completed.len(), 2);

    assert_eq!(pending.completed[0].entity, first);
    let Err(first_report) = &pending.completed[0].phase.0 else {
        panic!("should complete with an error")
    };
    assert!(matches!(
        first_report.current_context(),
        PlacementError::Exhaustion
    ));

    assert_eq!(pending.completed[1].entity, second);
    let Err(second_report) = &pending.completed[1].phase.0 else {
        panic!("should complete with an error")
    };
    assert!(matches!(
        second_report.current_context(),
        PlacementError::Exhaustion
    ));
}

#[test]
fn len_phases() {
    let mut pending = Pending::default();

    assert_eq!(pending.len(), 0);

    pending.poll_database.push(PendingEntry {
        event: EventId::new(60),
        entity: entity(1),
        phase: PollDatabase { tries: 3 },
    });
    pending.submit_workflow.push(PendingEntry {
        event: EventId::new(61),
        entity: entity(2),
        phase: SubmitWorkflow,
    });
    pending.poll_workflow.push(PendingEntry {
        event: EventId::new(62),
        entity: entity(3),
        phase: PollWorkflow { tries: 2 },
    });
    pending.project.push(PendingEntry {
        event: EventId::new(63),
        entity: entity(4),
        phase: Project {
            embedding: embedding(0.1),
        },
    });
    pending.completed.push_back(errored(64, 5));

    assert_eq!(pending.len(), 5);
}

#[test]
fn flush_full() {
    let (tx, mut rx) = mpsc::channel(1);
    let mut pending = Pending::default();

    let first = entity(1);
    let second = entity(2);
    let third = entity(3);

    pending.completed.push_back(errored(70, 1));
    pending.completed.push_back(errored(71, 2));
    pending.completed.push_back(errored(72, 3));

    let result = pending.flush(&tx);

    assert!(matches!(result, ControlFlow::Continue(())));
    assert_eq!(pending.completed.len(), 2);
    assert_eq!(pending.completed[0].entity, second);
    assert_eq!(pending.completed[1].entity, third);

    let received = rx
        .try_recv()
        .expect("should carry the first entry through the one open slot");
    assert_eq!(received.entity, first);
}

#[test]
fn flush_resume() {
    let (tx, mut rx) = mpsc::channel(1);
    let mut pending = Pending::default();

    let first = entity(1);
    let second = entity(2);
    let third = entity(3);

    pending.completed.push_back(errored(80, 1));
    pending.completed.push_back(errored(81, 2));
    pending.completed.push_back(errored(82, 3));

    assert!(matches!(pending.flush(&tx), ControlFlow::Continue(())));
    let received_first = rx
        .try_recv()
        .expect("should send the first entry before the channel fills");
    assert_eq!(received_first.entity, first);

    assert!(matches!(pending.flush(&tx), ControlFlow::Continue(())));
    let received_second = rx
        .try_recv()
        .expect("should send the second entry once capacity frees");
    assert_eq!(received_second.entity, second);

    assert!(matches!(pending.flush(&tx), ControlFlow::Continue(())));
    let received_third = rx
        .try_recv()
        .expect("should send the third entry once capacity frees again");
    assert_eq!(received_third.entity, third);

    assert!(pending.completed.is_empty());
}

#[test]
fn flush_closed() {
    let (tx, rx) = mpsc::channel::<PendingEntry<Completed>>(1);
    drop(rx);

    let mut pending = Pending::default();
    pending.completed.push_back(errored(90, 1));

    let result = pending.flush(&tx);

    assert!(matches!(result, ControlFlow::Break(())));
    assert!(pending.completed.is_empty());
}
