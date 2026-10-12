#![expect(missing_docs, reason = "integration tests")]

use core::{future::poll_fn, pin::Pin, task::Poll, time::Duration};
use std::path::PathBuf;

use duckdb::types::{TimeUnit, Value};
use error_stack::Report;
use hash_integrations_engine::{
    DataErrorType, OpenError, QueryErrorType, StatementError, Workspace,
};
use pretty_assertions::assert_eq;
use tempfile::TempDir;

fn database_path(directory: &TempDir) -> PathBuf {
    directory.path().join("workspace.duckdb")
}

async fn open(directory: &TempDir) -> Workspace {
    Workspace::open(database_path(directory))
        .await
        .expect("the workspace should open")
}

async fn first_value(workspace: &Workspace, sql: &str) -> Result<Value, Report<StatementError>> {
    let rows = workspace.query(sql.into()).await?;
    let row = rows.iter().next().expect("the query should return a row");
    Ok(row.first().expect("the row should have a value").clone())
}

/// Polls `request` once, which sends it to the workspace thread, and checks that it still waits
/// for its reply.
async fn send(mut request: Pin<&mut impl Future>) {
    assert!(
        poll_fn(|context| Poll::Ready(request.as_mut().poll(context).is_pending())).await,
        "the request should still be waiting for its reply"
    );
}

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

    assert!(
        matches!(
            report.current_context(),
            StatementError::InvalidQuery {
                error_type: QueryErrorType::Catalog
            }
        ),
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

#[tokio::test]
async fn query_reports_invalid_data() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    let report = workspace
        .query("SELECT 'BA117'::INTEGER".into())
        .await
        .expect_err("a cast of text that is not a number should fail");

    assert!(
        matches!(
            report.current_context(),
            StatementError::InvalidData {
                error_type: DataErrorType::Conversion
            }
        ),
        "the value should be reported, not {report:?}"
    );
}

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
        assert!(
            matches!(
                report.current_context(),
                StatementError::NotSelect { reason } if !reason.is_empty()
            ),
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
        assert!(
            matches!(
                report.current_context(),
                StatementError::StatementCount { count: found } if *found == count
            ),
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
        assert!(
            matches!(
                report.current_context(),
                StatementError::TableFunction { name: found } if &**found == name
            ),
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
        assert!(
            matches!(
                report.current_context(),
                StatementError::UnsupportedType { column, .. } if &**column == "departs"
            ),
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

#[tokio::test]
async fn open_refuses_second_workspace() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    let report = Workspace::open(database_path(&directory))
        .await
        .expect_err("a second workspace should not open the database");
    assert!(
        matches!(report.current_context(), OpenError::Locked { .. }),
        "the lock should be reported, not {report:?}"
    );

    workspace.close().await.expect("the workspace should close");
    open(&directory).await;
}

#[tokio::test]
async fn dropping_request_interrupts_query() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    let mut query = Box::pin(workspace.query("SELECT count(*) FROM range(1000000000000)".into()));
    send(query.as_mut()).await;
    tokio::time::sleep(Duration::from_millis(100)).await;
    drop(query);

    assert_eq!(
        tokio::time::timeout(Duration::from_secs(10), first_value(&workspace, "SELECT 1"))
            .await
            .expect("the next query should run once the dropped one is interrupted")
            .expect("the next query should succeed"),
        Value::Int(1),
        "the next query should return its value"
    );
}

#[tokio::test]
async fn dropping_queued_request_skips_it() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    let mut running = Box::pin(workspace.query("SELECT count(*) FROM range(1000000000000)".into()));
    let mut queued = Box::pin(workspace.create_table("skipped".into(), "SELECT 1 AS id".into()));
    send(running.as_mut()).await;
    send(queued.as_mut()).await;
    drop(queued);
    drop(running);

    assert_eq!(
        tokio::time::timeout(
            Duration::from_secs(10),
            first_value(
                &workspace,
                "SELECT count(*) FROM information_schema.tables WHERE table_name = 'skipped'"
            )
        )
        .await
        .expect("the next query should run once the dropped one is interrupted")
        .expect("the next query should succeed"),
        Value::BigInt(0),
        "the dropped request should not create its table"
    );
}

#[tokio::test]
async fn dropping_workspace_interrupts_running_query() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    let mut query = Box::pin(workspace.query("SELECT count(*) FROM range(1000000000000)".into()));
    send(query.as_mut()).await;
    tokio::time::sleep(Duration::from_millis(100)).await;
    drop(query);
    drop(workspace);

    // The thread releases the lock once the interrupted query returns and the database closes.
    let reopened = tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            match Workspace::open(database_path(&directory)).await {
                Err(report) if matches!(report.current_context(), OpenError::Locked { .. }) => {
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
                result => break result,
            }
        }
    })
    .await
    .expect("the lock should be released once the dropped workspace interrupts its query");
    reopened.expect("the database should open once the lock is released");
}
