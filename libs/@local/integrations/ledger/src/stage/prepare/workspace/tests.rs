// From `engine/tests/workspace.rs:1-45`
#![expect(missing_docs, reason = "integration tests")]

extern crate alloc;

use alloc::collections::BTreeMap;
use core::{
    assert_matches, future::poll_fn, num::NonZeroUsize, pin::Pin, str::FromStr as _, task::Poll,
    time::Duration,
};
use std::{
    fs,
    path::{Path, PathBuf},
};

use duckdb::types::{TimeUnit, Value};
use error_stack::Report;
use hash_integrations_definition::{VariableName, Variables};
use hash_integrations_engine::{
    ByteSize, DataErrorType, OpenError, QueryErrorType, SnapshotError, StatementError, Workspace,
    WorkspaceConfig,
};
use pretty_assertions::assert_eq;
use tempfile::TempDir;

const MIB: u64 = 1024 * 1024;

fn database_path(directory: &TempDir) -> PathBuf {
    directory.path().join("workspace.duckdb")
}

async fn open_with(directory: &TempDir, config: WorkspaceConfig) -> Workspace {
    Workspace::open(database_path(directory), config)
        .await
        .expect("the workspace should open")
}

async fn open(directory: &TempDir) -> Workspace {
    open_with(directory, WorkspaceConfig::default()).await
}

async fn first_value(workspace: &Workspace, sql: &str) -> Result<Value, Report<StatementError>> {
    let rows = workspace.query(sql.into()).await?;
    let row = rows.iter().next().expect("the query should return a row");
    Ok(row.first().expect("the row should have a value").clone())
}

// From `engine/tests/workspace.rs:65-166`
#[tokio::test]
async fn query_returns_rows_in_column_order() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    workspace
        .create_table(
            "flights".into(),
            "SELECT * FROM (VALUES ('BA117', 214), ('LH400', 364)) AS flights (code, seats)".into(),
        )
        .await
        .expect("the table should be created");
    let rows = workspace
        .query("SELECT seats, code FROM flights ORDER BY code".into())
        .await
        .expect("the query should run");

    assert_eq!(
        rows.columns(),
        [Box::from("seats"), Box::from("code")],
        "the columns should be in the selected order"
    );
    assert_eq!(
        rows.iter().collect::<Vec<_>>(),
        [
            [Value::Int(214), Value::Text("BA117".to_owned())],
            [Value::Int(364), Value::Text("LH400".to_owned())],
        ],
        "the rows should hold the table's values in the selected column order"
    );
}

#[tokio::test]
async fn query_without_rows_keeps_columns() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    let rows = workspace
        .query("SELECT 1 AS id, 'a' AS name WHERE false".into())
        .await
        .expect("the query should run");

    assert_eq!(
        rows.columns(),
        [Box::from("id"), Box::from("name")],
        "the columns should be named although no row matched"
    );
    assert_eq!(rows.iter().len(), 0, "the query should return no rows");
}

#[tokio::test]
async fn create_table_replaces_table() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    for sql in ["SELECT 'BA117' AS code", "SELECT 2 AS seats;"] {
        workspace
            .create_table("departure \"board\"".into(), sql.into())
            .await
            .expect("the table should be created");
    }

    let rows = workspace
        .query("SELECT * FROM \"departure \"\"board\"\"\"".into())
        .await
        .expect("the query should run");
    assert_eq!(
        rows.columns(),
        [Box::from("seats")],
        "the second query should replace the table"
    );
}

#[tokio::test]
async fn query_failure_keeps_workspace_open() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    let report = workspace
        .query("SELECT * FROM missing".into())
        .await
        .expect_err("a query of a missing table should fail");

    assert_matches!(
        report.current_context(),
        StatementError::InvalidQuery {
            error_type: QueryErrorType::Catalog
        },
        "the missing table should be reported, not {report:?}"
    );
    assert!(
        report.downcast_ref::<duckdb::Error>().is_some(),
        "the DuckDB error should stay in the report, not {report:?}"
    );
    assert_eq!(
        first_value(&workspace, "SELECT 1")
            .await
            .expect("the next query should run"),
        Value::Int(1),
        "the next query should return its value"
    );
}

// From `engine/tests/workspace.rs:187-356`
#[tokio::test]
async fn query_refuses_other_statements() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    for sql in [
        "CREATE TABLE flights (code TEXT)",
        "CALL enable_logging()",
        "SELECT 1; DROP TABLE flights",
        "SELEC 1",
    ] {
        let report = workspace
            .query(sql.into())
            .await
            .expect_err("only a `SELECT` should run");
        assert_matches!(
            report.current_context(),
            StatementError::NotSelect { reason } if !reason.is_empty(),
            "`{sql}` should be refused with DuckDB's reason, not by {report:?}"
        );
    }
}

#[tokio::test]
async fn create_table_refuses_other_statement_counts() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    for (sql, count) in [("SELECT 1; SELECT 2", 2), ("", 0), ("-- nothing", 0)] {
        let report = workspace
            .create_table("flights".into(), sql.into())
            .await
            .expect_err("SQL that is not one statement should be refused");
        assert_matches!(
            report.current_context(),
            StatementError::StatementCount { count: found } if *found == count,
            "`{sql}` should be refused as {count} statements, not by {report:?}"
        );
    }
    workspace
        .create_table("flights".into(), "SELECT 1; -- one statement".into())
        .await
        .expect("a trailing `;` and comment should be accepted");
}

#[tokio::test]
async fn query_refuses_disallowed_table_functions() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    for (sql, name) in [
        ("SELECT * FROM enable_logging()", "enable_logging"),
        ("SELECT * FROM checkpoint()", "checkpoint"),
        ("SELECT * FROM query('SELECT 1')", "query"),
        ("SELECT * FROM read_csv('flights.csv')", "read_csv"),
        (
            "SELECT 1 WHERE EXISTS (SELECT * FROM force_checkpoint())",
            "force_checkpoint",
        ),
        (
            "WITH logs AS (SELECT * FROM truncate_duckdb_logs()) SELECT 1",
            "truncate_duckdb_logs",
        ),
    ] {
        let report = workspace
            .query(sql.into())
            .await
            .expect_err("the table function should be refused");
        assert_matches!(
            report.current_context(),
            StatementError::TableFunction { name: found } if &**found == name,
            "`{sql}` should be refused for calling `{name}`, not by {report:?}"
        );
    }

    assert_eq!(
        first_value(
            &workspace,
            "SELECT count(*) FROM RANGE(2), generate_series(1, 2), unnest([1, 2])"
        )
        .await
        .expect("the allowed table functions should run"),
        Value::BigInt(8),
        "the query should count every combination"
    );
}

#[tokio::test]
async fn open_locks_settings() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    let rows = workspace
        .query(
            "SELECT current_setting('allow_community_extensions'), \
             current_setting('autoinstall_known_extensions'), \
             current_setting('autoload_known_extensions'), \
             current_setting('enable_external_access'), current_setting('lock_configuration')"
                .into(),
        )
        .await
        .expect("the settings should be readable");

    assert_eq!(
        rows.iter().next(),
        Some(
            [
                Value::Boolean(false),
                Value::Boolean(false),
                Value::Boolean(false),
                Value::Boolean(false),
                Value::Boolean(true),
            ]
            .as_slice()
        ),
        "the workspace should disable extensions and file access, and lock the settings"
    );
}

#[tokio::test]
async fn query_reads_supported_types() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    let rows = workspace
        .query(
            "SELECT TIMESTAMP '2024-01-01 12:00', 1.5::DECIMAL(4, 1), 1::HUGEINT, DATE \
             '2024-01-01', '12:00'::TIME, INTERVAL 1 DAY, '\\x01'::BLOB, 'a'::ENUM('a', 'b'), \
             [1], {'a': 1}, MAP {'a': 1}, 1::UNION(n INTEGER, s TEXT)"
                .into(),
        )
        .await
        .expect("every column type should be readable");

    assert_eq!(
        rows.iter().next().map(<[Value]>::len),
        Some(12),
        "the row should hold every value"
    );
}

#[tokio::test]
async fn query_refuses_unsupported_types() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    for sql in [
        "SELECT '12:00'::TIME_NS AS departs",
        "SELECT ['12:00'::TIME_NS] AS departs",
        "SELECT {'at': '12:00'::TIME_NS} AS departs",
        "SELECT MAP {'at': '12:00'::TIME_NS} AS departs",
    ] {
        let report = workspace
            .query(sql.into())
            .await
            .expect_err("the column type should be refused");
        assert_matches!(
            report.current_context(),
            StatementError::UnsupportedType { column, .. } if &**column == "departs",
            "`{sql}` should be refused for its column type, not by {report:?}"
        );
    }
    assert_eq!(
        first_value(&workspace, "SELECT '12:00'::TIME")
            .await
            .expect("the workspace should stay open"),
        Value::Time64(TimeUnit::Microsecond, 43_200_000_000),
        "a supported time should be read"
    );
}

// From `engine/tests/workspace.rs:601-636`
#[tokio::test]
async fn open_applies_limits() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open_with(
        &directory,
        WorkspaceConfig {
            memory_limit: Some(ByteSize::from_bytes(256 * MIB)),
            temp_directory_limit: Some(ByteSize::from_bytes(1024 * MIB)),
            threads: NonZeroUsize::new(2),
            ..WorkspaceConfig::default()
        },
    )
    .await;

    let rows = workspace
        .query(
            "SELECT current_setting('memory_limit'), current_setting('max_temp_directory_size'), \
             current_setting('threads')"
                .into(),
        )
        .await
        .expect("the settings should be readable");

    assert_eq!(
        rows.iter().next(),
        Some(
            [
                Value::Text("256.0 MiB".to_owned()),
                Value::Text("1.0 GiB".to_owned()),
                Value::BigInt(2),
            ]
            .as_slice()
        ),
        "DuckDB should use the configured limits"
    );
}

// From `engine/tests/workspace.rs:765-834`
#[tokio::test]
async fn query_binds_parameters() {
    let directory = TempDir::new().expect("should create a directory");
    let variables = Variables::try_from(BTreeMap::from(
        [
            ("MIN_SEATS", "300"),
            ("Excluded", "'); DROP TABLE flights; --"),
        ]
        .map(|(name, value)| {
            (
                VariableName::from_str(name).expect("should be a valid variable name"),
                value.into(),
            )
        }),
    ))
    .expect("the variables should be valid");
    let workspace = open_with(
        &directory,
        WorkspaceConfig {
            variables,
            ..WorkspaceConfig::default()
        },
    )
    .await;

    workspace
        .create_table(
            "flights".into(),
            "SELECT * FROM (VALUES ('BA117', 214), ('LH400', 364)) AS flights (code, seats) WHERE \
             seats >= $min_seats::INTEGER - 100"
                .into(),
        )
        .await
        .expect("the table should be created");
    let rows = workspace
        .query(
            "SELECT code, $EXCLUDED AS excluded FROM flights WHERE seats > $MIN_SEATS::INTEGER \
             AND code <> $excluded"
                .into(),
        )
        .await
        .expect("the query should run");

    assert_eq!(
        rows.iter().collect::<Vec<_>>(),
        [[
            Value::Text("LH400".to_owned()),
            Value::Text("'); DROP TABLE flights; --".to_owned()),
        ]],
        "each parameter should be bound as text, matched without regard to case"
    );
}

#[tokio::test]
async fn query_refuses_unknown_parameter() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    for (sql, name) in [("SELECT $MISSING", "MISSING"), ("SELECT ?", "1")] {
        let report = workspace
            .query(sql.into())
            .await
            .expect_err("a parameter without a value should be refused");
        assert_matches!(
            report.current_context(),
            StatementError::UnknownParameter { name: found } if &**found == name,
            "`{sql}` should be refused for parameter `{name}`, not by {report:?}"
        );
    }
}

// From `engine/tests/capture.rs:5-32`
use alloc::collections::BTreeMap;
use core::{assert_matches, time::Duration};
use std::{
    fs::{self, File},
    path::Path,
};

use arrow_array::{Array as _, Int64Array, ListArray, StringArray};
use duckdb::types::Value;
use hash_integrations_definition::{VariableName, Variables};
use hash_integrations_engine::{
    ByteSize, CaptureError, SourceCapture, StatementError, Workspace, WorkspaceConfig,
};
use parquet::arrow::arrow_reader::ParquetRecordBatchReaderBuilder;
use pretty_assertions::assert_eq;
use proptest::{property_test, test_runner::Config as ProptestConfig};
use rstest::rstest;
use tempfile::TempDir;
use tokio::runtime::Builder;

async fn open(directory: &TempDir) -> Workspace {
    Workspace::open(
        directory.path().join("workspace.duckdb"),
        WorkspaceConfig::default(),
    )
    .await
    .expect("the workspace should open")
}

// From `engine/tests/capture.rs:457-592`
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
    assert_matches!(
        error.current_context(),
        CaptureError::Read,
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
    assert_matches!(
        error.current_context(),
        StatementError::TableFunction { .. },
        "should reject the internal table function"
    );
    workspace.close().await.expect("should close the workspace");
}
