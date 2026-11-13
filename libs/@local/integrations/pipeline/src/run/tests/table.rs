use std::fs::File;

use duckdb::types::Value;
use hash_integrations_definition::Variables;
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use similar_asserts::assert_eq;
use tempfile::TempDir;

use super::{context, run_id};
use crate::{
    Code, StageError,
    run::{
        error, marker,
        table::{Cell, Column, ColumnKind, RowFile, load_table, store_query},
    },
};

const COLUMNS: [Column; 6] = [
    Column {
        name: "label",
        kind: ColumnKind::Text,
        nullable: false,
    },
    Column {
        name: "optional",
        kind: ColumnKind::Text,
        nullable: true,
    },
    Column {
        name: "small",
        kind: ColumnKind::UInt16,
        nullable: true,
    },
    Column {
        name: "medium",
        kind: ColumnKind::UInt32,
        nullable: false,
    },
    Column {
        name: "large",
        kind: ColumnKind::UInt64,
        nullable: false,
    },
    Column {
        name: "flag",
        kind: ColumnKind::Boolean,
        nullable: false,
    },
];

#[tokio::test]
async fn row_file_preserves_types_and_empty_schema() {
    let directory = TempDir::new().expect("should create directory");
    let context = context(directory.path());
    let mut file = RowFile::create(&context, &COLUMNS).expect("should create file");
    file.push(&[
        Cell::Text("first".into()),
        Cell::Null,
        Cell::UInt(u64::from(u16::MAX)),
        Cell::UInt(u64::from(u32::MAX)),
        Cell::UInt(u64::MAX),
        Cell::Boolean(true),
    ])
    .expect("should accept integer limits and null");
    let bad = file
        .push(&[
            Cell::Text("bad".into()),
            Cell::Null,
            Cell::UInt(u64::from(u16::MAX) + 1),
            Cell::UInt(0),
            Cell::UInt(0),
            Cell::Boolean(false),
        ])
        .expect_err("should reject out-of-range cell");
    assert_eq!(Code::of(&bad), Some(Code::RowInvalid));
    let artifact = file
        .store(&context)
        .await
        .expect("should store valid prefix");
    let empty = RowFile::create(&context, &COLUMNS)
        .expect("should create empty file")
        .store(&context)
        .await
        .expect("should store empty file");
    let fresh = super::context(directory.path());
    let workspace = fresh
        .open_workspace(Variables::default())
        .await
        .expect("should open workspace");
    load_table(&fresh, &workspace, &artifact, "rows".into())
        .await
        .expect("should load rows");
    load_table(&fresh, &workspace, &empty, "empty_rows".into())
        .await
        .expect("should load empty schema");
    let rows = workspace
        .query("SELECT * FROM rows".into())
        .await
        .expect("should read cells");
    assert_eq!(
        rows.iter().map(<[_]>::to_vec).collect::<Vec<_>>(),
        vec![vec![
            Value::Text("first".into()),
            Value::Null,
            Value::USmallInt(u16::MAX),
            Value::UInt(u32::MAX),
            Value::UBigInt(u64::MAX),
            Value::Boolean(true)
        ]]
    );
    let schema = workspace
        .query(
            "SELECT data_type FROM information_schema.columns WHERE table_name='empty_rows' ORDER \
             BY ordinal_position"
                .into(),
        )
        .await
        .expect("should read empty schema");
    assert_eq!(
        schema.iter().map(<[_]>::to_vec).collect::<Vec<_>>(),
        [
            "VARCHAR",
            "VARCHAR",
            "USMALLINT",
            "UINTEGER",
            "UBIGINT",
            "BOOLEAN"
        ]
        .map(|name| vec![Value::Text(name.into())])
        .to_vec()
    );
    assert_eq!(
        workspace
            .query("SELECT * FROM empty_rows".into())
            .await
            .expect("should read empty file")
            .iter()
            .count(),
        0
    );
    workspace
        .close()
        .await
        .map_err(error::close)
        .expect("should close workspace");
}

#[tokio::test]
async fn row_file_flushes_bounded_batches() {
    let directory = TempDir::new().expect("should create directory");
    let context = context(directory.path());
    let file = RowFile::create(
        &context,
        &[Column {
            name: "index",
            kind: ColumnKind::UInt64,
            nullable: false,
        }],
    )
    .expect("should create row file");
    let capture = tokio::task::spawn_blocking(move || {
        let mut file = file;
        for index in 0..70_000 {
            file.push(&[Cell::UInt(index)]).expect("should append row");
        }
        file.close().expect("should close row file")
    })
    .await
    .expect("should finish blocking writer");
    assert_eq!(capture.rows(), 70_000);
    let reader = ParquetRecordBatchReaderBuilder::try_new(
        File::open(capture.path()).expect("should open file"),
    )
    .expect("should read footer");
    assert_eq!(
        reader
            .metadata()
            .row_groups()
            .iter()
            .map(parquet::file::metadata::RowGroupMetaData::num_rows)
            .collect::<Vec<_>>(),
        vec![64 * 1024, 4_464]
    );
    let workspace = context
        .open_workspace(Variables::default())
        .await
        .expect("should open workspace");
    workspace
        .load_capture(capture, "numbered".into())
        .await
        .expect("should load row file");
    let rows = workspace
        .query("SELECT count(*)::UBIGINT, sum(index)::UBIGINT FROM numbered".into())
        .await
        .expect("should read all rows");
    assert_eq!(
        rows.iter().map(<[_]>::to_vec).collect::<Vec<_>>(),
        vec![vec![Value::UBigInt(70_000), Value::UBigInt(2_449_965_000)]]
    );
    workspace.close().await.expect("should close workspace");
}

#[tokio::test]
async fn export_invalid_decimal_has_no_marker() {
    let directory = TempDir::new().expect("should create directory");
    let context = context(directory.path());
    let workspace = context
        .open_workspace(Variables::default())
        .await
        .expect("should open workspace");
    let key = context.namespace.diff_output(run_id(1).into());
    for _ in 0..2 {
        let failure = store_query(
            &context,
            &workspace,
            "SELECT 100000000000000000000000000000000000000::HUGEINT AS too_wide".into(),
        )
        .await
        .expect_err("should reject invalid decimal before publication");
        assert_eq!(Code::of(&failure), Some(Code::DataInvalid));
        assert_eq!(*failure.current_context(), StageError::Permanent);
        assert!(
            marker::finished::<serde_json::Value>(&context, &key)
                .await
                .expect("should read marker")
                .is_none(),
            "should have no completion marker for failed export"
        );
    }
    let empty = store_query(
        &context,
        &workspace,
        "SELECT 1::UBIGINT AS id WHERE false".into(),
    )
    .await
    .expect("should export empty schema");
    load_table(&context, &workspace, &empty, "valid_empty".into())
        .await
        .expect("should reload empty schema");
    assert_eq!(
        workspace
            .query("SELECT * FROM valid_empty".into())
            .await
            .expect("should read empty export")
            .iter()
            .count(),
        0
    );
    workspace.close().await.expect("should close workspace");
}

#[tokio::test]
async fn query_failure_retains_shared_classification() {
    let directory = TempDir::new().expect("should create directory");
    let context = context(directory.path());
    let workspace = context
        .open_workspace(Variables::default())
        .await
        .expect("should open workspace");
    let failure = workspace
        .query("SELECT * FROM missing_table".into())
        .await
        .map_err(error::statement)
        .expect_err("should classify the workspace statement");
    assert_eq!(Code::of(&failure), Some(Code::QueryInvalid));
    assert_eq!(*failure.current_context(), StageError::Permanent);
    workspace.close().await.expect("should close workspace");
}
