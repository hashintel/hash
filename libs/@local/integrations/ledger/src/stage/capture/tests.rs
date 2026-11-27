use alloc::collections::BTreeMap;
use std::{fs, path::PathBuf};

use hash_integrations_definition::SourceName;
use pretty_assertions::assert_eq;
use rstest::rstest;
use tempfile::TempDir;

use super::capture;
use crate::{
    run::{self, CapturePart, CapturedFile, RunId, RunRecord, Stage},
    stage::failure::permanent,
    storage::{CasVersion, Storage},
    testing::{parquet, started},
};

fn name(table: &str) -> SourceName {
    table.parse().expect("should be a source name")
}

async fn loaded(storage: &Storage, run: RunId) -> (RunRecord, CasVersion) {
    run::load(storage, run).await.expect("should load run.json")
}

#[tokio::test]
async fn capture_stores_files() {
    let storage = Storage::memory();
    let run = RunId::new();
    started(&storage, run).await;
    let directory = TempDir::new().expect("should create a directory");
    let aircraft = directory.path().join("aircraft.parquet");
    let flights = directory.path().join("flights.parquet");
    parquet(&aircraft, &[1, 2, 3]);
    parquet(&flights, &[1, 2]);

    let files = BTreeMap::from([
        (name("aircraft"), aircraft.clone()),
        (name("flights"), flights.clone()),
    ]);
    capture(&storage, run, &files)
        .await
        .expect("should capture the run");

    let key = |table: &str| format!("runs/{run}/capture/{table}.parquet");
    let size = |file: &PathBuf| fs::metadata(file).expect("should read the size").len();
    assert_eq!(
        loaded(&storage, run).await.0.capture,
        Some(CapturePart {
            sources: BTreeMap::from([
                (
                    "aircraft".into(),
                    CapturedFile {
                        key: key("aircraft").into(),
                        size: size(&aircraft),
                        rows: 3,
                        watermark: None,
                    },
                ),
                (
                    "flights".into(),
                    CapturedFile {
                        key: key("flights").into(),
                        size: size(&flights),
                        rows: 2,
                        watermark: None,
                    },
                ),
            ]),
        }),
        "the capture part should hold the key, size and row count of each file"
    );
    for (table, file) in [("aircraft", &aircraft), ("flights", &flights)] {
        let (stored, _) = storage
            .read_versioned(&key(table))
            .await
            .expect("should read the stored file")
            .expect("the file should be stored");
        assert_eq!(
            stored,
            fs::read(file).expect("should read the local file"),
            "the stored {table} file should be the local file"
        );
    }
}

#[tokio::test]
async fn capture_repeated() {
    let storage = Storage::memory();
    let run = RunId::new();
    started(&storage, run).await;
    let directory = TempDir::new().expect("should create a directory");
    let aircraft = directory.path().join("aircraft.parquet");
    parquet(&aircraft, &[1, 2, 3]);
    let files = BTreeMap::from([(name("aircraft"), aircraft)]);
    capture(&storage, run, &files)
        .await
        .expect("should capture the run");
    let before = loaded(&storage, run).await;

    // Files that do not exist: a second capture that read or uploaded them would fail.
    let missing = BTreeMap::from([(name("aircraft"), directory.path().join("missing.parquet"))]);
    capture(&storage, run, &missing)
        .await
        .expect("capturing a captured run again should succeed");

    assert_eq!(
        loaded(&storage, run).await,
        before,
        "a second capture should leave run.json unchanged"
    );
}

#[rstest]
#[case::missing(None, "No such file or directory (os error 2)")]
#[case::not_parquet(Some(b"aircraft,rows\n".as_slice()), "Invalid Parquet file. Corrupt footer")]
#[tokio::test]
async fn capture_invalid_file(#[case] content: Option<&[u8]>, #[case] reason: &str) {
    let storage = Storage::memory();
    let run = RunId::new();
    started(&storage, run).await;
    let directory = TempDir::new().expect("should create a directory");
    let aircraft = directory.path().join("aircraft.parquet");
    if let Some(content) = content {
        fs::write(&aircraft, content).expect("should write the file");
    }

    let error = capture(
        &storage,
        run,
        &BTreeMap::from([(name("aircraft"), aircraft)]),
    )
    .await
    .expect_err("the file should be refused");

    assert_eq!(
        *error.current_context(),
        permanent(Stage::Capture, "capture_file_invalid")
    );
    let failure = loaded(&storage, run)
        .await
        .0
        .failure
        .expect("the failure should be recorded");
    assert_eq!(
        (failure.stage, &*failure.code),
        (Stage::Capture, "capture_file_invalid")
    );
    assert!(
        failure
            .message
            .starts_with("Capture failed for good: capture_file_invalid: ")
            && failure.message.ends_with(reason),
        "the message should end with the reason the file was refused: {}",
        failure.message
    );
}
