#![expect(missing_docs, reason = "integration tests")]

use core::num::NonZeroUsize;
use std::{fs, path::Path};

use duckdb::types::Value;
use error_stack::Report;
use hash_integrations_engine::{
    ByteSize, CloseError, DiskLimitError, OpenError, StatementError, StringLiteral, Workspace,
    WorkspaceConfig,
};
use tempfile::TempDir;

const MIB: u64 = 1024 * 1024;

async fn open(directory: &TempDir, config: WorkspaceConfig) -> Workspace {
    Workspace::open(directory.path().join("workspace.duckdb"), config)
        .await
        .expect("the workspace should open")
}

async fn first_value(workspace: &Workspace, sql: &str) -> Result<Value, Report<StatementError>> {
    let rows = workspace.query(sql.to_owned(), []).await?;
    let row = rows.iter().next().expect("the query should return a row");
    Ok(row.first().expect("the row should have a value").clone())
}

/// Returns the message of the DuckDB error in `report`.
fn duckdb_message(report: &Report<StatementError>) -> String {
    report
        .downcast_ref::<duckdb::Error>()
        .expect("the report should hold a DuckDB error")
        .to_string()
}

fn read_csv(path: &Path) -> String {
    let path = path.to_str().expect("the path should be UTF-8");
    format!(
        "SELECT count(*) FROM read_csv({})",
        StringLiteral::new(path)
    )
}

fn write_csv(path: &Path) -> String {
    let path = path.to_str().expect("the path should be UTF-8");
    format!(
        "COPY (SELECT 'BA117' AS code) TO {}",
        StringLiteral::new(path)
    )
}

#[tokio::test]
async fn query_returns_rows_in_column_order() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory, WorkspaceConfig::default()).await;

    workspace
        .execute(
            "CREATE TABLE flights (code TEXT, seats INTEGER)".to_owned(),
            [],
        )
        .await
        .expect("the table should be created");
    workspace
        .execute(
            "INSERT INTO flights VALUES (?, ?), (?, ?)".to_owned(),
            [
                Value::Text("BA117".to_owned()),
                Value::Int(214),
                Value::Text("LH400".to_owned()),
                Value::Int(364),
            ],
        )
        .await
        .expect("the rows should be inserted");
    let rows = workspace
        .query(
            "SELECT seats, code FROM flights ORDER BY code".to_owned(),
            [],
        )
        .await
        .expect("the query should run");

    assert_eq!(
        rows.columns(),
        ["seats", "code"],
        "the columns should be in the selected order"
    );
    assert_eq!(
        rows.iter().collect::<Vec<_>>(),
        [
            [Value::Int(214), Value::Text("BA117".to_owned())],
            [Value::Int(364), Value::Text("LH400".to_owned())],
        ],
        "the rows should hold the inserted values in the selected column order"
    );
}

#[tokio::test]
async fn query_without_rows_keeps_columns() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory, WorkspaceConfig::default()).await;

    let rows = workspace
        .query("SELECT 1 AS id, 'a' AS name WHERE false".to_owned(), [])
        .await
        .expect("the query should run");

    assert_eq!(
        rows.columns(),
        ["id", "name"],
        "the columns should be named although no row matched"
    );
    assert_eq!(rows.iter().len(), 0, "the query should return no rows");
}

#[tokio::test]
async fn failed_statement_keeps_workspace_open() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory, WorkspaceConfig::default()).await;

    let report = workspace
        .execute("SELECT * FROM missing".to_owned(), [])
        .await
        .expect_err("a query of a missing table should fail");

    assert!(
        matches!(report.current_context(), StatementError::Failed),
        "the statement should be reported as failed, not {report:?}"
    );
    assert!(
        report.frames().any(error_stack::Frame::is::<duckdb::Error>),
        "the DuckDB error should stay in the report as the source"
    );
    assert_eq!(
        first_value(&workspace, "SELECT 1")
            .await
            .expect("the next query should run"),
        Value::Int(1),
        "the next query should return its value"
    );
}

#[tokio::test]
async fn statements_open_files_only_in_allowed_directories() {
    let directory = TempDir::new().expect("should create a directory");
    let allowed = directory.path().join("allowed");
    let other = directory.path().join("allowed-other");
    fs::create_dir_all(&allowed).expect("should create the allowed directory");
    fs::create_dir_all(&other).expect("should create the other directory");
    fs::write(allowed.join("flights.csv"), "code\nBA117\n").expect("should write a file");
    fs::write(other.join("flights.csv"), "code\nBA117\n").expect("should write a file");
    let workspace = open(
        &directory,
        WorkspaceConfig {
            allowed_directories: vec![allowed.clone()],
            ..WorkspaceConfig::default()
        },
    )
    .await;

    assert_eq!(
        first_value(&workspace, &read_csv(&allowed.join("flights.csv")))
            .await
            .expect("a file in an allowed directory should be readable"),
        Value::BigInt(1),
        "the file should hold one row"
    );
    workspace
        .execute(write_csv(&allowed.join("copy.csv")), [])
        .await
        .expect("a file in an allowed directory should be writable");

    for statement in [
        read_csv(&other.join("flights.csv")),
        write_csv(&other.join("copy.csv")),
    ] {
        let report = workspace
            .execute(statement.clone(), [])
            .await
            .expect_err("a file outside the allowed directories should be refused");
        assert!(
            duckdb_message(&report).starts_with("Permission Error"),
            "`{statement}` should be refused by the sandbox, not by {report:?}"
        );
    }
}

#[tokio::test]
async fn open_refuses_relative_directory() {
    let directory = TempDir::new().expect("should create a directory");
    let path = directory.path().join("workspace.duckdb");

    let report = Workspace::open(
        path.clone(),
        WorkspaceConfig {
            allowed_directories: vec!["allowed".into()],
            ..WorkspaceConfig::default()
        },
    )
    .await
    .expect_err("a relative allowed directory should be refused");

    assert!(
        matches!(
            report.current_context(),
            OpenError::RelativeDirectory { .. }
        ),
        "the relative directory should be reported, not {report:?}"
    );
    assert!(!path.exists(), "the database file should not be created");
}

#[tokio::test]
async fn statements_cannot_change_settings() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory, WorkspaceConfig::default()).await;

    for (statement, refusal) in [
        (
            "SET memory_limit = '1GB'",
            "the configuration has been locked",
        ),
        (
            "SET enable_external_access = true",
            "the configuration has been locked",
        ),
        ("INSTALL httpfs", "file system operations are disabled"),
    ] {
        let report = workspace
            .execute(statement.to_owned(), [])
            .await
            .expect_err("the statement should be refused");
        assert!(
            duckdb_message(&report).contains(refusal),
            "`{statement}` should be refused because {refusal}, not by {report:?}"
        );
    }
}

#[tokio::test]
async fn snapshot_holds_statements_sent_before_it() {
    let directory = TempDir::new().expect("should create a directory");
    let target = directory.path().join("snapshot.duckdb");
    fs::write(&target, "not a database").expect("should write a file");
    let workspace = open(&directory, WorkspaceConfig::default()).await;

    workspace
        .execute(
            "CREATE TABLE flights AS SELECT 'BA117' AS code".to_owned(),
            [],
        )
        .await
        .expect("the table should be created");
    workspace
        .snapshot(target.clone())
        .await
        .expect("the snapshot should be written");
    workspace
        .execute("INSERT INTO flights VALUES ('LH400')".to_owned(), [])
        .await
        .expect("the row should be inserted");

    let snapshot = duckdb::Connection::open(&target).expect("the snapshot should open");
    let rows: i64 = snapshot
        .query_row("SELECT count(*) FROM flights", [], |row| row.get(0))
        .expect("the snapshot should hold the table");
    assert_eq!(rows, 1, "the snapshot should hold only the first row");
}

#[tokio::test]
async fn close_checkpoints_database() {
    let directory = TempDir::new().expect("should create a directory");
    let path = directory.path().join("workspace.duckdb");
    let workspace = open(&directory, WorkspaceConfig::default()).await;
    workspace
        .execute(
            "CREATE TABLE flights AS SELECT 'BA117' AS code".to_owned(),
            [],
        )
        .await
        .expect("the table should be created");

    workspace.close().await.expect("the workspace should close");

    assert!(
        !path.with_extension("duckdb.wal").exists(),
        "closing should move the log into the database file"
    );
    let database = duckdb::Connection::open(&path).expect("the database should open");
    let rows: i64 = database
        .query_row("SELECT count(*) FROM flights", [], |row| row.get(0))
        .expect("the database should hold the table");
    assert_eq!(rows, 1, "the database should hold the created row");
}

#[tokio::test]
async fn close_reports_uncommitted_transaction() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory, WorkspaceConfig::default()).await;
    for statement in ["BEGIN", "CREATE TABLE flights AS SELECT 'BA117' AS code"] {
        workspace
            .execute(statement.to_owned(), [])
            .await
            .expect("the statement should run");
    }

    let report = workspace
        .close()
        .await
        .expect_err("closing with uncommitted changes should fail");

    assert!(
        matches!(report.current_context(), CloseError::Checkpoint),
        "the failed checkpoint should be reported, not {report:?}"
    );
    let reopened = open(&directory, WorkspaceConfig::default()).await;
    let report = reopened
        .query("SELECT * FROM flights".to_owned(), [])
        .await
        .expect_err("the uncommitted table should be gone");
    assert!(
        duckdb_message(&report).contains("Table with name flights does not exist"),
        "the table should be missing, not {report:?}"
    );
}

#[tokio::test]
async fn open_applies_limits() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(
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
                .to_owned(),
            [],
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

#[tokio::test]
async fn open_refuses_files_over_disk_limit() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory, WorkspaceConfig::default()).await;
    workspace
        .execute(
            "CREATE TABLE flights AS SELECT 'BA117' AS code".to_owned(),
            [],
        )
        .await
        .expect("the table should be created");
    workspace.close().await.expect("the workspace should close");

    let report = Workspace::open(
        directory.path().join("workspace.duckdb"),
        WorkspaceConfig {
            disk_limit: Some(ByteSize::from_bytes(1)),
            ..WorkspaceConfig::default()
        },
    )
    .await
    .expect_err("files over the disk limit should not open");

    assert!(
        matches!(report.current_context(), OpenError::DiskLimit),
        "the disk limit should be reported, not {report:?}"
    );
    assert!(
        matches!(
            report.downcast_ref::<DiskLimitError>(),
            Some(DiskLimitError::Exceeded { limit, .. }) if limit.bytes() == 1
        ),
        "the report should hold the size and the limit, not {report:?}"
    );
}

#[tokio::test]
async fn statement_over_disk_limit_fails() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(
        &directory,
        WorkspaceConfig {
            disk_limit: Some(ByteSize::from_bytes(2 * MIB)),
            ..WorkspaceConfig::default()
        },
    )
    .await;

    let report = workspace
        .execute(
            "CREATE TABLE numbers AS SELECT random() AS value FROM range(1000000)".to_owned(),
            [],
        )
        .await
        .expect_err("a statement that takes the files over the limit should fail");

    assert!(
        matches!(report.current_context(), StatementError::DiskLimit),
        "the disk limit should be reported, not {report:?}"
    );
    workspace.close().await.expect("the workspace should close");
    let database = duckdb::Connection::open(directory.path().join("workspace.duckdb"))
        .expect("the database should open");
    let rows: i64 = database
        .query_row("SELECT count(*) FROM numbers", [], |row| row.get(0))
        .expect("the table should stay in the database");
    assert_eq!(rows, 1_000_000, "the statement's changes should stay");
}

#[tokio::test]
async fn disk_limit_counts_temp_directory() {
    let directory = TempDir::new().expect("should create a directory");
    let temp = directory.path().join("workspace.duckdb.tmp");
    fs::create_dir_all(&temp).expect("should create the temporary directory");
    let workspace = open(
        &directory,
        WorkspaceConfig {
            disk_limit: Some(ByteSize::from_bytes(2 * MIB)),
            ..WorkspaceConfig::default()
        },
    )
    .await;

    let path = temp.join("numbers.csv");
    let path = path.to_str().expect("the path should be UTF-8");
    let report = workspace
        .execute(
            format!(
                "COPY (SELECT random() AS value FROM range(1000000)) TO {}",
                StringLiteral::new(path)
            ),
            [],
        )
        .await
        .expect_err("a file in the temporary directory should count towards the limit");

    assert!(
        matches!(report.current_context(), StatementError::DiskLimit),
        "the disk limit should be reported, not {report:?}"
    );
}

#[tokio::test]
async fn disk_limit_checkpoints_before_refusing() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(
        &directory,
        WorkspaceConfig {
            disk_limit: Some(ByteSize::from_bytes(MIB)),
            ..WorkspaceConfig::default()
        },
    )
    .await;
    workspace
        .execute(
            "CREATE TABLE counters AS SELECT range AS id, 0 AS count FROM range(10000)".to_owned(),
            [],
        )
        .await
        .expect("the table should be created");

    for _ in 0..50 {
        workspace
            .execute("UPDATE counters SET count = count + 1".to_owned(), [])
            .await
            .expect("each update should fit once the log is checkpointed");
    }

    assert_eq!(
        first_value(&workspace, "SELECT min(count) FROM counters")
            .await
            .expect("the query should run"),
        Value::Int(50),
        "every update should have run"
    );
}
