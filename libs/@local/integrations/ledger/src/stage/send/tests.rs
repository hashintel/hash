use alloc::collections::BTreeMap;
use core::assert_matches;

use axum::http::{Method, StatusCode};
use pretty_assertions::assert_eq;
use testcontainers::ContainerAsync;
use testcontainers_modules::minio::MinIO;

use super::{
    send,
    testing::{Graph, Received, row},
};
use crate::{
    RunId,
    run::{self, CapturePart, Failure, PreparePart, RunRecord, SendPart, Stage, current},
    stage::StageError,
    storage::Storage,
    sync_table::{self, Op, SyncRow},
    testing::{bucket, minio, namespace, started},
};

/// A bucket on a new MinIO container that lives as long as the returned container.
async fn storage() -> (ContainerAsync<MinIO>, Storage) {
    let (minio, port) = minio().await;
    let storage = Storage::s3(bucket(port), &namespace()).expect("should open the bucket");
    (minio, storage)
}

/// Starts `run` and records it as captured, and as prepared with `prepared` rows, with `rows` in
/// the sync table.
async fn prepared_with(storage: &Storage, run: RunId, rows: Vec<SyncRow>, prepared: u64) {
    started(storage, run).await;
    let (mut record, version) = run::load(storage, run).await.expect("should load the run");
    record.capture = Some(CapturePart {
        sources: BTreeMap::new(),
    });
    record.prepare = Some(PreparePart {
        rows: prepared,
        issues: None,
        issue_count: 0,
    });
    sync_table::write(storage, run, rows)
        .await
        .expect("should write the rows");
    run::save(storage, &record, Some(&version))
        .await
        .expect("should save the run");
}

/// Starts `run` and records it as captured and prepared, with `rows` in the sync table.
async fn prepared(storage: &Storage, run: RunId, rows: Vec<SyncRow>) {
    let count = rows.len() as u64;
    prepared_with(storage, run, rows, count).await;
}

async fn load(storage: &Storage, run: RunId) -> RunRecord {
    run::load(storage, run)
        .await
        .expect("should load the run")
        .0
}

/// The active and the last completed run of `current.json`.
async fn runs(storage: &Storage) -> (Option<RunId>, Option<RunId>) {
    let (current, _) = current::read(storage)
        .await
        .expect("should read `current.json`");
    (current.active, current.last_completed)
}

fn bulk(method: Method, entities: &[u128]) -> Received {
    Received {
        method,
        bulk: true,
        entities: entities.to_vec(),
        status: StatusCode::OK,
    }
}

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

#[tokio::test]
async fn send_completes_run() {
    let (_minio, storage) = storage().await;
    let graph = Graph::holding(&[3, 4]);
    let client = graph.serve().await;
    let run = RunId::new();
    prepared(
        &storage,
        run,
        vec![
            row(run, Op::ArchiveEntity, 0, 4),
            row(run, Op::CreateEntity, 1, 2),
            row(run, Op::UpdateEntity, 2, 3),
            row(run, Op::CreateEntity, 3, 1),
        ],
    )
    .await;

    send(&storage, run, &client)
        .await
        .expect("should send the run");

    assert_eq!(
        graph.received(),
        vec![
            bulk(Method::POST, &[2, 1]),
            bulk(Method::PATCH, &[3]),
            bulk(Method::PATCH, &[4]),
        ],
        "the rows should arrive in the fixed order"
    );
    let record = load(&storage, run).await;
    assert_eq!(
        record.send,
        Some(SendPart {
            created: 2,
            updated: 1,
            archived: 1,
            ..counts()
        }),
        "the `send` part should hold the counts"
    );
    assert_eq!(
        runs(&storage).await,
        (None, Some(run)),
        "the run should be the last completed run"
    );
    let actor = record.input.actor.to_string();
    assert!(
        graph
            .actors()
            .iter()
            .all(|sent| sent.as_deref() == Some(actor.as_str())),
        "every request should act for the run's actor"
    );
    for provenance in graph.provenances() {
        let source = &provenance["sources"][0];
        assert_eq!(
            (&source["location"]["name"], &source["type"]),
            (
                &serde_json::json!("aviation"),
                &serde_json::json!("integration")
            ),
            "every body should name the connector as its integration source"
        );
        assert!(
            source["loadedAt"]
                .as_str()
                .is_some_and(|loaded| loaded.starts_with("1970-01-01T00:00:00")),
            "every body should be loaded when the run was submitted"
        );
    }

    send(&storage, run, &client)
        .await
        .expect("should send the completed run again");
    assert_eq!(
        graph.received(),
        Vec::new(),
        "a second Send of a completed run should send nothing"
    );
}

#[tokio::test]
async fn send_empty_run() {
    let (_minio, storage) = storage().await;
    let graph = Graph::default();
    let client = graph.serve().await;
    let run = RunId::new();
    prepared(&storage, run, Vec::new()).await;

    send(&storage, run, &client)
        .await
        .expect("should send the run");

    assert_eq!(graph.received(), Vec::new(), "nothing should be sent");
    assert_eq!(
        load(&storage, run).await.send,
        Some(counts()),
        "every count should be 0"
    );
    assert_eq!(runs(&storage).await, (None, Some(run)));
}

#[tokio::test]
async fn send_rerun_after_unavailable_graph() {
    let (_minio, storage) = storage().await;
    let graph = Graph::holding(&[3]);
    let client = graph.serve().await;
    let run = RunId::new();
    prepared(
        &storage,
        run,
        vec![
            row(run, Op::CreateEntity, 0, 1),
            row(run, Op::CreateEntity, 1, 2),
            row(run, Op::UpdateEntity, 2, 3),
        ],
    )
    .await;
    graph.stop_after(1);

    let error = send(&storage, run, &client)
        .await
        .expect_err("should stop when the Graph is not available");
    assert_matches!(
        error.current_context(),
        StageError::Retryable { stage: Stage::Send }
    );
    let record = load(&storage, run).await;
    assert_eq!(
        (record.send, record.failure),
        (None, None),
        "nothing should be recorded"
    );
    assert_eq!(
        runs(&storage).await,
        (Some(run), None),
        "the run should still be active"
    );

    graph.resume();
    graph.received();
    send(&storage, run, &client)
        .await
        .expect("should send the run once the Graph is back");

    assert_eq!(
        load(&storage, run).await.send,
        Some(SendPart {
            updated: 3,
            create_existed: 2,
            ..counts()
        }),
        "the creates applied before the Graph stopped should count as `create_existed`"
    );
    assert_eq!(
        graph.held(),
        [(1, false), (2, false), (3, false)].into_iter().collect(),
        "the Graph should end with the same entities"
    );
}

#[tokio::test]
async fn send_row_invalid() {
    let (_minio, storage) = storage().await;
    let graph = Graph::default();
    let client = graph.serve().await;
    let run = RunId::new();
    let mut link = row(run, Op::CreateLink, 1, 3);
    link.right_entity_id = None;
    prepared(&storage, run, vec![row(run, Op::CreateEntity, 0, 1), link]).await;

    let error = send(&storage, run, &client)
        .await
        .expect_err("should refuse a link without both ends");

    assert_matches!(
        error.current_context(),
        StageError::Permanent {
            stage: Stage::Send,
            code: "send_row_invalid"
        }
    );
    assert_eq!(
        graph.received(),
        Vec::new(),
        "nothing should be sent before a row is refused"
    );
    let record = load(&storage, run).await;
    assert_eq!(record.send, None, "the run should have no `send` part");
    assert_eq!(
        record.failure.map(|Failure { code, .. }| code),
        Some("send_row_invalid".into()),
        "the failure should be recorded"
    );
    assert_eq!(
        runs(&storage).await,
        (Some(run), None),
        "the failed run should not be completed"
    );
}

#[tokio::test]
async fn send_rows_missing() {
    let (_minio, storage) = storage().await;
    let graph = Graph::default();
    let client = graph.serve().await;
    let run = RunId::new();
    prepared_with(&storage, run, vec![row(run, Op::CreateEntity, 0, 1)], 2).await;

    let error = send(&storage, run, &client)
        .await
        .expect_err("should refuse a table with fewer rows than Prepare wrote");

    assert_matches!(
        error.current_context(),
        StageError::Permanent {
            stage: Stage::Send,
            code: "send_rows_missing"
        }
    );
    assert_eq!(graph.received(), Vec::new(), "nothing should be sent");
}

#[tokio::test]
async fn send_sent_run_only_completes() {
    let (_minio, storage) = storage().await;
    let graph = Graph::default();
    let client = graph.serve().await;
    let run = RunId::new();
    prepared(&storage, run, vec![row(run, Op::CreateEntity, 0, 1)]).await;
    let (mut record, version) = run::load(&storage, run).await.expect("should load the run");
    let part = SendPart {
        created: 1,
        ..counts()
    };
    record.send = Some(part.clone());
    run::save(&storage, &record, Some(&version))
        .await
        .expect("should save the run");

    send(&storage, run, &client)
        .await
        .expect("should complete the run");

    assert_eq!(
        graph.received(),
        Vec::new(),
        "a run with its `send` part should not be sent again"
    );
    assert_eq!(
        load(&storage, run).await.send,
        Some(part),
        "the `send` part should be left as it was"
    );
    assert_eq!(
        runs(&storage).await,
        (None, Some(run)),
        "the run should be completed"
    );
}
