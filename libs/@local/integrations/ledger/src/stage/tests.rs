use std::io;

use error_stack::Report;
use pretty_assertions::assert_eq;

use super::{
    StageError, begin, end,
    failure::{permanent, retryable},
};
use crate::{
    run::{self, Failure, RunId, RunRecord, Stage, current},
    storage::{CasVersion, Storage},
    testing::started,
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
