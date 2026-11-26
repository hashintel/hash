use alloc::collections::BTreeMap;
use std::{fs, path::Path};

use hash_integrations_definition::SourceName;
use pretty_assertions::assert_eq;
use rstest::rstest;
use tempfile::TempDir;
use testcontainers::ContainerAsync;
use testcontainers_modules::minio::MinIO;

use super::capture;
use crate::{
    lake::{Column, Columns, LakeSettings, failed},
    run::{self, CapturePart, CapturedTable, RunId, RunRecord, Stage},
    stage::failure::permanent,
    storage::{CasVersion, Storage},
    testing::{bucket, minio, namespace, parquet, started},
};

/// A bucket on a new MinIO container that lives as long as the returned container.
async fn storage() -> (ContainerAsync<MinIO>, Storage) {
    let (minio, port) = minio().await;
    let storage = Storage::s3(bucket(port), &namespace()).expect("should open the bucket");
    (minio, storage)
}

fn name(table: &str) -> SourceName {
    table.parse().expect("should be a source name")
}

/// The query that reads the Parquet file at `path`.
fn read_parquet(path: &Path) -> Box<str> {
    format!(
        "SELECT * FROM read_parquet('{}')",
        path.to_string_lossy().replace('\'', "''")
    )
    .into()
}

async fn loaded(storage: &Storage, run: RunId) -> (RunRecord, CasVersion) {
    run::load(storage, run).await.expect("should load run.json")
}

/// The ids of `run` in the capture table of `table`, in the order of `_seq`.
fn captured(storage: &Storage, run: RunId, table: &str) -> Vec<i64> {
    let lake = LakeSettings::of(storage)
        .and_then(|settings| settings.open())
        .expect("should open the lake");
    let table = lake
        .table(&format!("capture/{table}"))
        .expect("should attach the table");
    let mut rows = table
        .read_run(
            run,
            &Columns::new([Column::new("_seq", "BIGINT"), Column::new("id", "BIGINT")]),
            |report| report,
            |row| {
                Ok((
                    row.get::<_, i64>(0).map_err(failed)?,
                    row.get::<_, i64>(1).map_err(failed)?,
                ))
            },
        )
        .expect("should read the rows");
    rows.sort_unstable();
    rows.into_iter().map(|(_, id)| id).collect()
}

#[tokio::test]
async fn capture_appends_query_rows() {
    let (_minio, storage) = storage().await;
    let run = RunId::new();
    started(&storage, run).await;
    let directory = TempDir::new().expect("should create a directory");
    let aircraft = directory.path().join("aircraft.parquet");
    let flights = directory.path().join("flights.parquet");
    parquet(&aircraft, &[1, 2, 3]);
    parquet(&flights, &[1, 2]);

    let queries = BTreeMap::from([
        (name("aircraft"), read_parquet(&aircraft)),
        (name("flights"), read_parquet(&flights)),
    ]);
    capture(&storage, run, &queries)
        .await
        .expect("should capture the run");

    assert_eq!(
        loaded(&storage, run).await.0.capture,
        Some(CapturePart {
            sources: BTreeMap::from([
                (
                    "aircraft".into(),
                    CapturedTable {
                        key: "capture/aircraft".into(),
                        rows: 3,
                    },
                ),
                (
                    "flights".into(),
                    CapturedTable {
                        key: "capture/flights".into(),
                        rows: 2,
                    },
                ),
            ]),
        }),
        "the capture part should hold the key and row count of each table"
    );
    assert_eq!(
        (
            captured(&storage, run, "aircraft"),
            captured(&storage, run, "flights")
        ),
        (vec![1, 2, 3], vec![1, 2]),
        "the capture tables should hold the run's rows"
    );
}

#[tokio::test]
async fn capture_from_delta_table() {
    let (_minio, storage) = storage().await;
    let directory = TempDir::new().expect("should create a directory");
    let first = RunId::new();
    started(&storage, first).await;
    let aircraft = directory.path().join("aircraft.parquet");
    parquet(&aircraft, &[1, 2, 3]);
    capture(
        &storage,
        first,
        &BTreeMap::from([(name("aircraft"), read_parquet(&aircraft))]),
    )
    .await
    .expect("should capture the first run");
    run::current::complete(&storage, first)
        .await
        .expect("should complete the first run");

    let root = storage.bucket().expect("should have a bucket").uri.clone();
    let from_delta = format!(
        "SELECT * EXCLUDE (run, _seq) FROM delta_scan('{}/capture/aircraft') WHERE run = \
         '{first}' AND id > 1",
        root.trim_end_matches('/')
    );
    let second = RunId::new();
    started(&storage, second).await;
    capture(
        &storage,
        second,
        &BTreeMap::from([(name("fleet"), from_delta.into_boxed_str())]),
    )
    .await
    .expect("should capture the second run from a Delta table");

    assert_eq!(
        captured(&storage, second, "fleet"),
        vec![2, 3],
        "the table should hold the rows the query reads from the Delta table"
    );
}

#[tokio::test]
async fn capture_repeated() {
    let (_minio, storage) = storage().await;
    let run = RunId::new();
    started(&storage, run).await;
    let directory = TempDir::new().expect("should create a directory");
    let aircraft = directory.path().join("aircraft.parquet");
    parquet(&aircraft, &[1, 2, 3]);
    capture(
        &storage,
        run,
        &BTreeMap::from([(name("aircraft"), read_parquet(&aircraft))]),
    )
    .await
    .expect("should capture the run");
    let before = loaded(&storage, run).await;

    // A file that does not exist: a second capture that ran the query would fail.
    let missing = BTreeMap::from([(
        name("aircraft"),
        read_parquet(&directory.path().join("missing.parquet")),
    )]);
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
#[case::missing_file(None, "No files found")]
#[case::not_parquet(Some(b"aircraft,rows\n".as_slice()), "No magic bytes found at end of file")]
#[tokio::test]
async fn capture_invalid_query(#[case] content: Option<&[u8]>, #[case] reason: &str) {
    let (_minio, storage) = storage().await;
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
        &BTreeMap::from([(name("aircraft"), read_parquet(&aircraft))]),
    )
    .await
    .expect_err("the query should be refused");

    assert_eq!(
        *error.current_context(),
        permanent(Stage::Capture, "capture_query_invalid")
    );
    let failure = loaded(&storage, run)
        .await
        .0
        .failure
        .expect("the failure should be recorded");
    assert_eq!(
        (failure.stage, &*failure.code),
        (Stage::Capture, "capture_query_invalid")
    );
    assert!(
        failure
            .message
            .starts_with("Capture failed for good: capture_query_invalid: ")
            && failure.message.contains(reason),
        "the message should hold the reason the query was refused: {}",
        failure.message
    );
}

#[tokio::test]
async fn capture_other_columns_refused() {
    let (_minio, storage) = storage().await;
    let directory = TempDir::new().expect("should create a directory");
    let first = RunId::new();
    started(&storage, first).await;
    let aircraft = directory.path().join("aircraft.parquet");
    parquet(&aircraft, &[1, 2]);
    capture(
        &storage,
        first,
        &BTreeMap::from([(name("aircraft"), read_parquet(&aircraft))]),
    )
    .await
    .expect("should capture the first run");
    run::current::complete(&storage, first)
        .await
        .expect("should complete the first run");

    let second = RunId::new();
    started(&storage, second).await;
    let error = capture(
        &storage,
        second,
        &BTreeMap::from([(name("aircraft"), "SELECT 'SE-XXX' AS registration".into())]),
    )
    .await
    .expect_err("a query with other columns should be refused");

    assert_eq!(
        *error.current_context(),
        permanent(Stage::Capture, "capture_query_invalid"),
        "a table's columns should be fixed by its first capture"
    );
    assert_eq!(
        captured(&storage, first, "aircraft"),
        vec![1, 2],
        "the first run's rows should stay"
    );
}

#[tokio::test]
async fn capture_not_a_query() {
    let (_minio, storage) = storage().await;
    let run = RunId::new();
    started(&storage, run).await;

    let error = capture(
        &storage,
        run,
        &BTreeMap::from([(name("aircraft"), "DROP TABLE aircraft".into())]),
    )
    .await
    .expect_err("a statement that is not a query should be refused");

    assert_eq!(
        *error.current_context(),
        permanent(Stage::Capture, "capture_query_invalid")
    );
}
