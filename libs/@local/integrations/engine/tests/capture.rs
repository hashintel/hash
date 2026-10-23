#![expect(missing_docs, reason = "integration tests")]

extern crate alloc;

use alloc::collections::BTreeMap;
use core::time::Duration;
use std::{
    fs::{self, File},
    path::Path,
};

use arrow_array::{Array as _, Int64Array, ListArray, StringArray};
use duckdb::types::Value;
use hash_integrations_definition::{VariableName, Variables};
use hash_integrations_engine::{
    CaptureError, SourceCapture, StatementError, Workspace, WorkspaceConfig,
};
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use pretty_assertions::assert_eq;
use tempfile::TempDir;

async fn open(directory: &TempDir) -> Workspace {
    Workspace::open(
        directory.path().join("workspace.duckdb"),
        WorkspaceConfig::default(),
    )
    .await
    .expect("the workspace should open")
}

fn entries(directory: &Path) -> usize {
    fs::read_dir(directory)
        .expect("the directory should be readable")
        .count()
}

#[tokio::test]
async fn capture_parameters_and_batches() {
    const ROW_COUNT: usize = 150_000;

    let directory = TempDir::new().expect("should create a directory");
    let workspace = Workspace::open(
        directory.path().join("workspace.duckdb"),
        WorkspaceConfig {
            variables: Variables::try_from(BTreeMap::from([(
                "COUNT"
                    .parse::<VariableName>()
                    .expect("should parse the name"),
                ROW_COUNT.to_string().into(),
            )]))
            .expect("should build variables"),
            ..WorkspaceConfig::default()
        },
    )
    .await
    .expect("the workspace should open");
    let target = directory.path().join("source.parquet");
    let capture = workspace
        .capture(
            "
                SELECT
                    i,
                    CASE WHEN i % 2 = 0 THEN 'even' END AS label,
                    [i, i + 1] AS pair
                FROM range($COUNT::BIGINT) AS source(i)
                ORDER BY i
                "
            .into(),
            target.clone(),
        )
        .await
        .expect("the capture should be published");
    workspace.close().await.expect("the workspace should close");

    assert_eq!(capture.path(), target);
    assert_eq!(
        capture.rows(),
        u64::try_from(ROW_COUNT).expect("the row count should fit in u64")
    );
    assert_eq!(
        capture.bytes(),
        fs::metadata(&target).expect("should stat capture").len()
    );
    let recovered = SourceCapture::open(target.clone()).expect("the capture should reopen");
    assert_eq!(recovered.rows(), capture.rows());
    let builder = ParquetRecordBatchReaderBuilder::try_new(
        File::open(target).expect("the capture should open"),
    )
    .expect("the footer should be valid");
    assert_eq!(builder.metadata().num_row_groups(), 3);
    let reader = builder.build().expect("the reader should build");
    let mut rows = 0;
    let mut nulls = 0;
    for batch in reader {
        let batch = batch.expect("the batch should decode");
        let ids = batch
            .column(0)
            .as_any()
            .downcast_ref::<Int64Array>()
            .expect("captured IDs should retain their integer type");
        let expected = i64::try_from(rows).expect("the row offset should fit in an integer");
        assert_eq!(ids.value(0), expected);
        let labels = batch
            .column(1)
            .as_any()
            .downcast_ref::<StringArray>()
            .expect("captured labels should retain their string type");
        assert_eq!(labels.value(0), "even");
        let pairs = batch
            .column(2)
            .as_any()
            .downcast_ref::<ListArray>()
            .expect("captured pairs should retain their list type");
        let first_pair = pairs.value(0);
        let values = first_pair
            .as_any()
            .downcast_ref::<Int64Array>()
            .expect("captured list values should retain their integer type");
        assert_eq!(values.values().as_ref(), [expected, expected + 1]);
        rows += batch.num_rows();
        nulls += batch.column(1).null_count();
    }
    assert_eq!(rows, ROW_COUNT);
    assert_eq!(nulls, ROW_COUNT.div_euclid(2));
}

#[tokio::test]
async fn capture_empty_schema() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;
    let target = directory.path().join("empty.parquet");
    let capture = workspace
        .capture(
            "
                SELECT 1::INTEGER AS id
                WHERE false
                "
            .into(),
            target.clone(),
        )
        .await
        .expect("the empty capture should be published");
    assert_eq!(capture.rows(), 0);
    let reader = ParquetRecordBatchReaderBuilder::try_new(
        File::open(target).expect("the capture should open"),
    )
    .expect("the footer should be valid");
    assert_eq!(reader.schema().field(0).name(), "id");
    assert_eq!(reader.schema().field(0).data_type().to_string(), "Int32");
}

#[tokio::test]
async fn capture_existing_target() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;
    let target = directory.path().join("source.parquet");
    workspace
        .capture("SELECT 1 AS id".into(), target.clone())
        .await
        .expect("the capture should be published");
    let original = fs::read(&target).expect("the capture should be readable");
    let error = workspace
        .capture("SELECT 2 AS id".into(), target.clone())
        .await
        .expect_err("a capture should never be replaced");
    assert!(matches!(
        error.current_context(),
        CaptureError::Exists { .. }
    ));
    assert_eq!(
        fs::read(target).expect("should read the original"),
        original
    );
}

#[tokio::test]
async fn capture_failed_query_cleanup() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;
    let output = TempDir::new().expect("should create an output directory");
    let error = workspace
        .capture(
            "
                SELECT
                    CAST(
                        CASE WHEN i = 999999 THEN 'bad' ELSE '1' END
                        AS INTEGER
                    ) AS id
                FROM range(1000000) AS source(i)
                "
            .into(),
            output.path().join("failed.parquet"),
        )
        .await
        .expect_err("a late conversion failure should abort the capture");
    assert!(matches!(error.current_context(), CaptureError::Query));
    assert_eq!(entries(output.path()), 0, "partial files should be removed");
    workspace
        .query("SELECT 1".into())
        .await
        .expect("the workspace should survive a failed capture");
}

#[tokio::test]
async fn capture_restricted_sql() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;
    let target = directory.path().join("source.parquet");
    let error = workspace
        .capture(
            "
                SELECT *
                FROM read_csv('/etc/passwd')
                "
            .into(),
            target.clone(),
        )
        .await
        .expect_err("source SQL should retain the table function restrictions");
    assert!(error.contains::<StatementError>());
    assert!(!target.exists(), "invalid SQL should not publish a capture");
    let setting = workspace
        .query("SELECT current_setting('enable_external_access')".into())
        .await
        .expect("the setting should be readable");
    assert_eq!(
        setting.iter().next().expect("should return a row").first(),
        Some(&Value::Boolean(false))
    );
}

#[tokio::test]
async fn capture_workspace_file() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;
    let error = workspace
        .capture(
            "SELECT 1".into(),
            directory.path().join("workspace.duckdb.wal"),
        )
        .await
        .expect_err("workspace files should be protected");
    assert!(matches!(
        error.current_context(),
        CaptureError::WorkspaceFile { .. }
    ));
    workspace
        .query("SELECT 1".into())
        .await
        .expect("the workspace should stay usable");
}

#[tokio::test]
async fn capture_cancelled_cleanup() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;
    let output = TempDir::new().expect("should create an output directory");
    assert!(
        tokio::time::timeout(
            Duration::from_millis(20),
            workspace.capture(
                "
                    SELECT i
                    FROM range(1000000000000) AS source(i)
                    "
                .into(),
                output.path().join("cancelled.parquet"),
            )
        )
        .await
        .is_err(),
        "the large capture should be cancelled"
    );
    workspace
        .query("SELECT 1".into())
        .await
        .expect("the workspace should serve the next request");
    assert_eq!(
        entries(output.path()),
        0,
        "cancellation should remove partial files"
    );
}

#[tokio::test]
async fn copy_local_capture_independence() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;
    let source = directory.path().join("local.parquet");
    let target = directory.path().join("capture.parquet");
    workspace
        .capture("SELECT 1 AS id".into(), source.clone())
        .await
        .expect("should create a local source");
    let capture = SourceCapture::copy_from(&source, &target).expect("the local source should copy");
    fs::write(&source, b"modified source").expect("should modify the live source");
    assert_eq!(
        SourceCapture::open(target.clone())
            .expect("the capture should remain valid")
            .rows(),
        1
    );
    assert_eq!(capture.rows(), 1);
    let error = SourceCapture::copy_from(&source, &target)
        .expect_err("retry should preserve the published capture");
    assert!(matches!(
        error.current_context(),
        CaptureError::Exists { .. }
    ));
}

#[test]
fn copy_invalid_parquet_cleanup() {
    let directory = TempDir::new().expect("should create a directory");
    let source = directory.path().join("local.parquet");
    fs::write(&source, b"invalid parquet").expect("the source should be written");
    let error = SourceCapture::copy_from(&source, &directory.path().join("capture.parquet"))
        .expect_err("an invalid source should not be published");
    assert!(matches!(error.current_context(), CaptureError::Read));
    assert_eq!(
        entries(directory.path()),
        1,
        "only the source file should remain"
    );
}

#[tokio::test]
async fn load_capture_types_and_empty_schema() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;
    let capture = workspace
        .capture(
            "
                SELECT
                    i,
                    [i, i + 1] AS pair,
                    struct_pack(label := 'a', value := i) AS nested,
                    12.30::DECIMAL(12, 2) AS amount
                FROM range(5000) AS items(i)
                "
            .into(),
            directory.path().join("types.parquet"),
        )
        .await
        .expect("should capture typed rows");
    workspace
        .load_capture(capture, "loaded".into())
        .await
        .expect("should restore typed rows");
    let rows = workspace
        .query(
            "
                SELECT
                    count(*),
                    min(amount)::VARCHAR,
                    max(pair[2]),
                    min(nested.label)
                FROM loaded
                "
            .into(),
        )
        .await
        .expect("should query restored nested types");
    assert_eq!(
        rows.iter().next(),
        Some(
            [
                Value::BigInt(5000),
                Value::Text("12.30".to_owned()),
                Value::BigInt(5000),
                Value::Text("a".to_owned())
            ]
            .as_slice()
        ),
        "should preserve types across multiple Arrow batches"
    );
    let empty = workspace
        .capture(
            "
                SELECT
                    1::INTEGER AS id,
                    ''::VARCHAR AS label
                WHERE false
                "
            .into(),
            directory.path().join("empty-load.parquet"),
        )
        .await
        .expect("should capture an empty schema");
    workspace
        .load_capture(empty, "empty_loaded".into())
        .await
        .expect("should restore the empty schema");
    let rows = workspace
        .query(
            "
                SELECT id, label
                FROM empty_loaded
                "
            .into(),
        )
        .await
        .expect("should preserve empty columns");
    assert_eq!(rows.iter().len(), 0, "should preserve an empty result");
    workspace.close().await.expect("should close the workspace");
}

#[tokio::test]
async fn load_invalid_capture_preserves_table() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;
    let path = directory.path().join("corrupt.parquet");
    let capture = workspace
        .capture("SELECT 2 AS id".into(), path.clone())
        .await
        .expect("should capture a row");
    workspace
        .create_table("existing".into(), "SELECT 1 AS id".into())
        .await
        .expect("should create the original table");
    fs::write(path, b"not parquet").expect("should corrupt the capture");
    let error = workspace
        .load_capture(capture, "existing".into())
        .await
        .expect_err("should reject a corrupt capture");
    assert!(
        matches!(error.current_context(), CaptureError::Read),
        "should report a read failure"
    );
    let rows = workspace
        .query(
            "
                SELECT id
                FROM existing
                "
            .into(),
        )
        .await
        .expect("should preserve the original table");
    assert_eq!(
        rows.iter().next(),
        Some([Value::Int(1)].as_slice()),
        "should retain the original rows after a failed import"
    );
    let error = workspace
        .query(
            "
                SELECT *
                FROM _capture_schema()
                "
            .into(),
        )
        .await
        .expect_err("should keep internal schema access out of user SQL");
    assert!(
        matches!(
            error.current_context(),
            StatementError::TableFunction { .. }
        ),
        "should reject the internal table function"
    );
    workspace.close().await.expect("should close the workspace");
}
