use alloc::collections::BTreeMap;
use std::{
    io,
    path::{Path, PathBuf},
};

use axum::http::Method;
use error_stack::Report;
use hash_integrations_definition::{Definition, SourceName};
use pretty_assertions::assert_eq;
use serde_json::{Value, json};
use tempfile::TempDir;
use uuid::Uuid;

use super::{
    StageError, begin, capture, end,
    failure::{permanent, retryable},
    prepare_incremental, send,
};
use crate::{
    StartError,
    run::{self, Failure, RunId, RunRecord, Stage, current},
    start, status,
    storage::{CasVersion, Storage},
    sync_table::{self, Op},
    testing::{AVIATION, Graph, bucket, minio, namespace, start_input, started},
};

async fn loaded(storage: &Storage, run: RunId) -> (RunRecord, CasVersion) {
    run::load(storage, run).await.expect("should load run.json")
}

#[tokio::test]
async fn end_retryable() {
    let storage = Storage::memory();
    let run = RunId::new();
    started(&storage, run).await;
    let before = loaded(&storage, run).await;

    let open = begin(&storage, run, Stage::Capture)
        .await
        .expect("should begin Capture of a started run");
    let error = end(&storage, open, Err(Report::new(retryable(Stage::Capture))))
        .await
        .expect_err("the stage's error should be returned");

    assert_eq!(*error.current_context(), retryable(Stage::Capture));
    assert_eq!(
        loaded(&storage, run).await,
        before,
        "a retryable error should leave run.json unchanged"
    );
}

#[tokio::test]
async fn end_permanent() {
    let storage = Storage::memory();
    let run = RunId::new();
    started(&storage, run).await;

    let open = begin(&storage, run, Stage::Capture)
        .await
        .expect("should begin Capture of a started run");
    let failed = Report::new(io::Error::from(io::ErrorKind::NotFound))
        .change_context(permanent(Stage::Capture, "capture_file_invalid"));
    let error = end(&storage, open, Err(failed))
        .await
        .expect_err("the stage's error should be returned");

    assert_eq!(
        *error.current_context(),
        permanent(Stage::Capture, "capture_file_invalid")
    );
    assert_eq!(
        loaded(&storage, run).await.0.failure,
        Some(Failure {
            stage: Stage::Capture,
            code: "capture_file_invalid".into(),
            message: "Capture failed for good: capture_file_invalid: entity not found".into(),
        }),
        "a permanent error should be recorded with the text of each error in the report"
    );
}

#[tokio::test]
async fn begin_failed_run() {
    let storage = Storage::memory();
    let run = RunId::new();
    started(&storage, run).await;
    let open = begin(&storage, run, Stage::Capture)
        .await
        .expect("should begin Capture of a started run");
    let failed = Report::new(permanent(Stage::Capture, "capture_file_invalid"));
    let ended = end(&storage, open, Err(failed)).await;
    assert!(ended.is_err(), "the stage's error should be returned");
    let before = loaded(&storage, run).await;

    let error = begin(&storage, run, Stage::Capture)
        .await
        .expect_err("a failed run should be refused");

    assert_eq!(
        *error.current_context(),
        permanent(Stage::Capture, "run_failed")
    );
    assert_eq!(
        loaded(&storage, run).await,
        before,
        "a refused stage should write nothing"
    );
}

#[tokio::test]
async fn begin_other_run() {
    let storage = Storage::memory();
    let active = RunId::new();
    started(&storage, active).await;
    // A run with a `run.json` that `current.json` does not name.
    let other = RunId::new();
    let (mut record, _) = loaded(&storage, active).await;
    record.input.run = other;
    run::save(&storage, &record, None)
        .await
        .expect("should create the other run's run.json");

    let error = begin(&storage, other, Stage::Capture)
        .await
        .expect_err("a run current.json does not name should be refused");

    assert_eq!(
        *error.current_context(),
        permanent(Stage::Capture, "run_not_active")
    );
}

#[tokio::test]
async fn begin_not_ready() {
    let storage = Storage::memory();
    let run = RunId::new();
    started(&storage, run).await;

    let error = begin(&storage, run, Stage::Prepare)
        .await
        .expect_err("Prepare of a run without a capture part should be refused");

    assert_eq!(
        *error.current_context(),
        StageError::NotReady {
            stage: Stage::Prepare
        }
    );
}

#[tokio::test]
async fn end_changed() {
    let storage = Storage::memory();
    let run = RunId::new();
    started(&storage, run).await;
    let first = begin(&storage, run, Stage::Capture)
        .await
        .expect("should begin the first attempt");
    let second = begin(&storage, run, Stage::Capture)
        .await
        .expect("should begin the second attempt");
    end(&storage, first, Ok(()))
        .await
        .expect("the first attempt should save run.json");
    let before = loaded(&storage, run).await;

    let error = end(&storage, second, Ok(()))
        .await
        .expect_err("run.json changed since the second attempt read it");

    assert_eq!(*error.current_context(), retryable(Stage::Capture));
    assert_eq!(
        loaded(&storage, run).await,
        before,
        "the second attempt should overwrite nothing"
    );
}

#[tokio::test]
async fn begin_completed_run() {
    let storage = Storage::memory();
    let run = RunId::new();
    started(&storage, run).await;
    current::complete(&storage, run)
        .await
        .expect("should complete the run");

    begin(&storage, run, Stage::Capture)
        .await
        .expect("a stage should begin on the last completed run");
}

/// The capture files of the aviation example, by table: an insert, an update and a delete of an
/// aircraft, and an insert and an update of an airfield.
fn aviation_captures() -> BTreeMap<SourceName, PathBuf> {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/aviation");
    ["aircraft", "airfields"]
        .into_iter()
        .map(|table| {
            (
                table.parse().expect("should be a source name"),
                fixtures.join(format!("{table}.parquet")),
            )
        })
        .collect()
}

/// The status of `run` as `sync status` prints it, without the run's ID and time.
async fn summary(storage: &Storage, run: RunId) -> Value {
    let status = status(storage, Some(run))
        .await
        .expect("should read the run's status");
    let mut summary = serde_json::to_value(status).expect("the status should serialize");
    let fields = summary
        .as_object_mut()
        .expect("the status should be an object");
    fields.remove("run");
    fields.remove("submitted_at");
    summary
}

/// A run of the aviation example through every stage, against MinIO and a test Graph that holds
/// the entities the run updates and archives.
#[tokio::test]
async fn whole_pipeline() {
    let (_minio, port) = minio().await;
    let storage = Storage::s3(bucket(port), &namespace()).expect("should open the bucket");
    let directory = TempDir::new().expect("should create a directory");
    let run = RunId::new();

    started(&storage, run).await;
    assert_eq!(
        summary(&storage, run).await,
        json!({
            "connector": "aviation", "state": "active",
            "capture": null, "prepare": null, "send": null, "failure": null,
        })
    );
    let definition = Definition::from_yaml(AVIATION).expect("should be a valid definition");
    let refused = start(&storage, &definition, start_input(RunId::new(), AVIATION))
        .await
        .expect_err("a second run should not start while the run is active");
    assert_eq!(
        *refused.current_context(),
        StartError::RunActive { active: run }
    );

    let captures = aviation_captures();
    capture(&storage, run, &captures)
        .await
        .expect("should capture the run");
    for table in captures.keys() {
        storage
            .download(&run::capture_file(run, table), directory.path())
            .await
            .expect("the capture file should be in the bucket");
    }
    assert_eq!(
        summary(&storage, run).await["capture"],
        json!({ "rows": { "aircraft": 3, "airfields": 2 } })
    );

    prepare_incremental(&storage, run)
        .await
        .expect("should prepare the run");
    assert_eq!(
        summary(&storage, run).await["prepare"],
        json!({ "rows": 8, "issues": 0 })
    );

    let rows = sync_table::read(&storage, run)
        .await
        .expect("should read the sync table");
    let held = rows
        .iter()
        .filter(|row| !matches!(row.op, Op::CreateEntity | Op::CreateLink))
        .map(|row| Uuid::from(row.entity_id.entity_uuid).as_u128())
        .collect::<Vec<_>>();
    let graph = Graph::holding(&held);
    send(&storage, run, &graph.serve().await)
        .await
        .expect("should send the run");
    let requests = graph
        .received()
        .into_iter()
        .map(|(method, bulk, entities)| (method, bulk, entities.len()))
        .collect::<Vec<_>>();
    assert_eq!(
        requests,
        [
            (Method::POST, true, 2),
            (Method::PATCH, true, 2),
            (Method::POST, true, 1),
            (Method::PATCH, true, 1),
            (Method::PATCH, true, 1),
            (Method::PATCH, true, 1),
        ],
        "each kind of change should arrive in one bulk request, in the order of `Op`: entity \
         creates, entity updates, link creates, link updates, link archives, entity archives"
    );
    assert_eq!(
        summary(&storage, run).await,
        json!({
            "connector": "aviation", "state": "completed",
            "capture": { "rows": { "aircraft": 3, "airfields": 2 } },
            "prepare": { "rows": 8, "issues": 0 },
            "send": { "created": 3, "updated": 3, "archived": 2, "mismatches": 0, "failed": 0 },
            "failure": null,
        })
    );
    let (current, _) = current::read(&storage)
        .await
        .expect("should read current.json");
    assert_eq!((current.active, current.last_completed), (None, Some(run)));

    started(&storage, RunId::new()).await;
}
