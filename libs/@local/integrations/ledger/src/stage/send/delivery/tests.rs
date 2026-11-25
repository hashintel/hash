use axum::http::{Method, StatusCode};
use error_stack::Report;
use pretty_assertions::assert_eq;
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;

use super::{Delivery, Unavailable};
use crate::{
    RunId,
    run::{BatchLimits, FailedEntity, SendPart},
    stage::send::{
        plan::Plan,
        testing::{Graph, Received, entity, provenance, row},
    },
    sync_table::{Op, SyncRow},
};

/// Delivers `rows` to `graph`, and checks that the counts add up to the rows.
async fn deliver(graph: &Graph, rows: &[SyncRow]) -> Result<SendPart, Report<Unavailable>> {
    let plan =
        Plan::new(rows, &provenance(), BatchLimits::default()).expect("should plan the rows");
    let client = graph.serve().await;
    let part = Delivery::new(&client, ActorEntityUuid::new(Uuid::from_u128(0xAC70)))
        .deliver(&plan)
        .await?;
    assert_eq!(
        part.created
            + part.updated
            + part.archived
            + part.archive_missing
            + part.failed.len() as u64,
        rows.len() as u64,
        "the counts should add up to the rows"
    );
    Ok(part)
}

fn bulk(method: Method, entities: &[u128], status: StatusCode) -> Received {
    Received {
        method,
        bulk: true,
        entities: entities.to_vec(),
        status,
    }
}

fn single(method: Method, entity: u128, status: StatusCode) -> Received {
    Received {
        method,
        bulk: false,
        entities: vec![entity],
        status,
    }
}

/// A `send` part without counts or failed entities.
fn counts() -> SendPart {
    SendPart {
        created: 0,
        updated: 0,
        archived: 0,
        create_existed: 0,
        update_missing: 0,
        archive_missing: 0,
        failed: Vec::new(),
    }
}

/// The failed entity `uuid` at `batch` and `index`, refused with `status`.
fn failed(batch: u32, index: u32, uuid: u128, status: StatusCode) -> FailedEntity {
    FailedEntity {
        batch,
        index,
        entity_id: entity(uuid),
        status: status.as_u16(),
        message: "".into(),
    }
}

/// `part` with the message of each failed entity checked to be the Graph's, which names the
/// entity, and then cleared.
fn without_messages(mut part: SendPart) -> SendPart {
    for failure in &mut part.failed {
        let uuid = Uuid::from(failure.entity_id.entity_uuid).as_u128();
        assert!(
            failure.message.contains(&format!("refused {uuid}")),
            "the failed entity should keep the Graph's message, which names it: {}",
            failure.message
        );
        failure.message = "".into();
    }
    part
}

#[tokio::test]
async fn bulk_applied_in_one_request() {
    let graph = Graph::holding(&[4]);
    let run = RunId::new();
    let rows = [
        row(run, Op::CreateEntity, 0, 1),
        row(run, Op::CreateEntity, 1, 2),
        row(run, Op::CreateEntity, 2, 3),
        row(run, Op::ArchiveEntity, 3, 4),
    ];

    let part = deliver(&graph, &rows)
        .await
        .expect("should deliver the run");

    assert_eq!(
        graph.received(),
        vec![
            bulk(Method::POST, &[1, 2, 3], StatusCode::OK),
            bulk(Method::PATCH, &[4], StatusCode::OK),
        ],
        "each accepted batch should be one bulk request"
    );
    assert_eq!(
        part,
        SendPart {
            created: 3,
            archived: 1,
            ..counts()
        },
        "every write of an accepted batch should be counted"
    );
}

#[tokio::test]
async fn refused_creates_sent_one_by_one() {
    let graph = Graph::holding(&[2]);
    graph.refuse(3);
    let run = RunId::new();
    let rows = [
        row(run, Op::CreateEntity, 0, 1),
        row(run, Op::CreateEntity, 1, 2),
        row(run, Op::CreateEntity, 2, 3),
    ];

    let part = deliver(&graph, &rows)
        .await
        .expect("should deliver the run");

    assert_eq!(
        graph.received(),
        vec![
            bulk(Method::POST, &[1, 2, 3], StatusCode::BAD_REQUEST),
            single(Method::POST, 1, StatusCode::OK),
            single(Method::POST, 2, StatusCode::CONFLICT),
            single(Method::PATCH, 2, StatusCode::OK),
            single(Method::POST, 3, StatusCode::BAD_REQUEST),
        ],
        "a refused batch should be sent again one write at a time, patching an entity that exists"
    );
    assert_eq!(
        without_messages(part),
        SendPart {
            created: 1,
            updated: 1,
            create_existed: 1,
            failed: vec![failed(0, 2, 3, StatusCode::BAD_REQUEST)],
            ..counts()
        },
        "the entity that exists should count as updated and `create_existed`, the refused one as \
         failed"
    );
}

#[tokio::test]
async fn refused_updates_and_archives_sent_one_by_one() {
    let graph = Graph::holding(&[1, 3, 5, 6]);
    graph.refuse(5);
    graph.refuse(6);
    let run = RunId::new();
    let rows = [
        row(run, Op::UpdateEntity, 0, 1),
        row(run, Op::UpdateEntity, 1, 5),
        row(run, Op::UpdateEntity, 2, 2),
        row(run, Op::ArchiveEntity, 3, 3),
        row(run, Op::ArchiveEntity, 4, 6),
        row(run, Op::ArchiveEntity, 5, 4),
    ];

    let part = deliver(&graph, &rows)
        .await
        .expect("should deliver the run");

    assert_eq!(
        graph.received(),
        vec![
            bulk(Method::PATCH, &[1, 5, 2], StatusCode::BAD_REQUEST),
            single(Method::PATCH, 1, StatusCode::OK),
            single(Method::PATCH, 5, StatusCode::BAD_REQUEST),
            single(Method::PATCH, 2, StatusCode::NOT_FOUND),
            single(Method::POST, 2, StatusCode::OK),
            bulk(Method::PATCH, &[3, 6, 4], StatusCode::BAD_REQUEST),
            single(Method::PATCH, 3, StatusCode::OK),
            single(Method::PATCH, 6, StatusCode::BAD_REQUEST),
            single(Method::PATCH, 4, StatusCode::NOT_FOUND),
        ],
        "an update of a missing entity should create it, and an archive of one should be left"
    );
    assert_eq!(
        without_messages(part),
        SendPart {
            created: 1,
            updated: 1,
            archived: 1,
            update_missing: 1,
            archive_missing: 1,
            failed: vec![
                failed(0, 1, 5, StatusCode::BAD_REQUEST),
                failed(1, 1, 6, StatusCode::BAD_REQUEST),
            ],
            ..counts()
        },
        "a refused update or archive should be failed, by its batch and its place in it"
    );
    assert_eq!(
        graph.held(),
        [(1, false), (2, false), (3, true), (5, false), (6, false)]
            .into_iter()
            .collect(),
        "the Graph should hold the updated, created and archived entities"
    );
}

#[tokio::test]
async fn fallback_refused_is_failed() {
    let graph = Graph::holding(&[1]);
    graph.refuse_with(Method::PATCH, 1, StatusCode::FORBIDDEN);
    graph.refuse_with(Method::POST, 2, StatusCode::BAD_REQUEST);
    let run = RunId::new();
    let rows = [
        row(run, Op::CreateEntity, 0, 1),
        row(run, Op::UpdateEntity, 1, 2),
    ];

    let part = deliver(&graph, &rows)
        .await
        .expect("should deliver the run");

    assert_eq!(
        graph.received(),
        vec![
            bulk(Method::POST, &[1], StatusCode::CONFLICT),
            single(Method::POST, 1, StatusCode::CONFLICT),
            single(Method::PATCH, 1, StatusCode::FORBIDDEN),
            bulk(Method::PATCH, &[2], StatusCode::NOT_FOUND),
            single(Method::PATCH, 2, StatusCode::NOT_FOUND),
            single(Method::POST, 2, StatusCode::BAD_REQUEST),
        ],
        "each write should fall back once"
    );
    assert_eq!(
        without_messages(part),
        SendPart {
            failed: vec![
                failed(0, 0, 1, StatusCode::FORBIDDEN),
                failed(1, 0, 2, StatusCode::BAD_REQUEST),
            ],
            ..counts()
        },
        "a refused fallback should be failed and counted nowhere else"
    );
}

#[tokio::test]
async fn status_means_something_only_for_its_request() {
    let graph = Graph::holding(&[2]);
    graph.refuse_with(Method::POST, 1, StatusCode::NOT_FOUND);
    graph.refuse_with(Method::PATCH, 2, StatusCode::CONFLICT);
    let run = RunId::new();
    let rows = [
        row(run, Op::CreateEntity, 0, 1),
        row(run, Op::UpdateEntity, 1, 2),
    ];

    let part = deliver(&graph, &rows)
        .await
        .expect("should deliver the run");

    assert_eq!(
        graph.received(),
        vec![
            bulk(Method::POST, &[1], StatusCode::NOT_FOUND),
            single(Method::POST, 1, StatusCode::NOT_FOUND),
            bulk(Method::PATCH, &[2], StatusCode::CONFLICT),
            single(Method::PATCH, 2, StatusCode::CONFLICT),
        ],
        "a 404 after a create and a 409 after a patch should have no fallback"
    );
    assert_eq!(
        without_messages(part),
        SendPart {
            failed: vec![
                failed(0, 0, 1, StatusCode::NOT_FOUND),
                failed(1, 0, 2, StatusCode::CONFLICT),
            ],
            ..counts()
        },
        "a 404 after a create and a 409 after a patch should be failed"
    );
}

#[tokio::test]
async fn unavailable_in_bulk_stops() {
    let graph = Graph::default();
    graph.stop_after(1);
    let run = RunId::new();
    let rows = [
        row(run, Op::CreateEntity, 0, 1),
        row(run, Op::UpdateEntity, 1, 2),
    ];

    let error = deliver(&graph, &rows)
        .await
        .expect_err("should stop when the Graph is not available");

    assert_eq!(*error.current_context(), Unavailable);
    assert_eq!(
        graph.received(),
        vec![
            bulk(Method::POST, &[1], StatusCode::OK),
            bulk(Method::PATCH, &[2], StatusCode::SERVICE_UNAVAILABLE),
        ],
        "nothing should be sent after the Graph stopped answering"
    );
}

#[tokio::test]
async fn unavailable_in_single_write_stops() {
    let graph = Graph::holding(&[2]);
    graph.stop_after(2);
    let run = RunId::new();
    let rows = [
        row(run, Op::CreateEntity, 0, 1),
        row(run, Op::CreateEntity, 1, 2),
        row(run, Op::CreateEntity, 2, 3),
    ];

    let error = deliver(&graph, &rows)
        .await
        .expect_err("should stop when the Graph is not available");

    assert_eq!(*error.current_context(), Unavailable);
    assert_eq!(
        graph.received(),
        vec![
            bulk(Method::POST, &[1, 2, 3], StatusCode::CONFLICT),
            single(Method::POST, 1, StatusCode::OK),
            single(Method::POST, 2, StatusCode::SERVICE_UNAVAILABLE),
        ],
        "a single write the Graph cannot answer should stop Send, not be failed"
    );
}

#[tokio::test]
async fn unavailable_in_fallback_stops() {
    let graph = Graph::holding(&[2]);
    graph.stop_after(3);
    let run = RunId::new();
    let rows = [
        row(run, Op::CreateEntity, 0, 1),
        row(run, Op::CreateEntity, 1, 2),
    ];

    let error = deliver(&graph, &rows)
        .await
        .expect_err("should stop when the Graph is not available");

    assert_eq!(*error.current_context(), Unavailable);
    assert_eq!(
        graph.received(),
        vec![
            bulk(Method::POST, &[1, 2], StatusCode::CONFLICT),
            single(Method::POST, 1, StatusCode::OK),
            single(Method::POST, 2, StatusCode::CONFLICT),
            single(Method::PATCH, 2, StatusCode::SERVICE_UNAVAILABLE),
        ],
        "a fallback the Graph cannot answer should stop Send, not be failed"
    );
}
