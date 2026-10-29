#![expect(missing_docs, reason = "integration tests")]

extern crate alloc;

use alloc::collections::BTreeMap;
use core::{
    future::poll_fn, num::NonZeroUsize, pin::Pin, str::FromStr as _, task::Poll, time::Duration,
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

/// Returns the number of rows in `table` of the database at `path`.
fn count_rows(path: &Path, table: &str) -> i64 {
    duckdb::Connection::open(path)
        .expect("the database should open")
        .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .expect("the database should hold the table")
}

/// Polls `request` once and checks that it is still pending.
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

    let report = Workspace::open(database_path(&directory), WorkspaceConfig::default())
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
    let workspace = Workspace::open(
        database_path(&directory),
        WorkspaceConfig {
            queue_capacity: NonZeroUsize::MIN,
            ..WorkspaceConfig::default()
        },
    )
    .await
    .expect("the workspace should open");

    let mut running = Box::pin(workspace.query("SELECT count(*) FROM range(1000000000000)".into()));
    let mut queued = Box::pin(workspace.create_table("skipped".into(), "SELECT 1 AS id".into()));
    let mut waiting =
        Box::pin(workspace.create_table("skipped_too".into(), "SELECT 2 AS id".into()));
    send(running.as_mut()).await;
    send(queued.as_mut()).await;
    send(waiting.as_mut()).await;
    drop(waiting);
    drop(queued);
    drop(running);

    assert_eq!(
        tokio::time::timeout(
            Duration::from_secs(10),
            first_value(
                &workspace,
                "SELECT count(*) FROM information_schema.tables WHERE table_name IN ('skipped', \
                 'skipped_too')"
            )
        )
        .await
        .expect("the next query should run once the dropped one is interrupted")
        .expect("the next query should succeed"),
        Value::BigInt(0),
        "the dropped requests should not create their tables"
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
            match Workspace::open(database_path(&directory), WorkspaceConfig::default()).await {
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

#[tokio::test]
async fn snapshot_holds_tables_created_before_it() {
    let directory = TempDir::new().expect("should create a directory");
    let target = directory.path().join("snapshot.duckdb");
    fs::write(&target, "not a database").expect("should write a file");
    let workspace = open(&directory).await;

    workspace
        .create_table("flights".into(), "SELECT 'BA117' AS code".into())
        .await
        .expect("the table should be created");
    workspace
        .snapshot(target.clone())
        .await
        .expect("the snapshot should be written");
    workspace
        .create_table(
            "flights".into(),
            "SELECT * FROM (VALUES ('BA117'), ('LH400')) AS flights (code)".into(),
        )
        .await
        .expect("the table should be replaced");

    assert_eq!(
        count_rows(&target, "flights"),
        1,
        "the snapshot should hold only the first table"
    );
    assert!(
        !directory.path().join("snapshot.duckdb.partial").exists(),
        "the partial copy should be renamed to the target"
    );
}

#[tokio::test]
async fn snapshot_refuses_invalid_targets() {
    let directory = TempDir::new().expect("should create a directory");
    fs::create_dir_all(directory.path().join("nested")).expect("should create a directory");
    let workspace = open(&directory).await;

    for target in [
        PathBuf::from("snapshot.duckdb"),
        directory.path().join("nested/../snapshot.duckdb"),
    ] {
        let report = workspace
            .snapshot(target.clone())
            .await
            .expect_err("a relative target or one with `..` should be refused");
        assert!(
            matches!(
                report.current_context(),
                SnapshotError::InvalidTarget { .. }
            ),
            "`{}` should be refused, not by {report:?}",
            target.display()
        );
    }
}

#[tokio::test]
async fn snapshot_refuses_workspace_files() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;

    for target in [
        database_path(&directory),
        directory.path().join("workspace.duckdb.wal"),
        directory.path().join("workspace.duckdb.tmp"),
        directory.path().join("workspace.duckdb.lock"),
    ] {
        let report = workspace
            .snapshot(target.clone())
            .await
            .expect_err("a workspace file should not be a snapshot target");
        assert!(
            matches!(
                report.current_context(),
                SnapshotError::WorkspaceFile { .. }
            ),
            "`{}` should be refused, not by {report:?}",
            target.display()
        );
    }
}

#[tokio::test]
async fn snapshot_failure_removes_partial_copy() {
    let directory = TempDir::new().expect("should create a directory");
    let target = directory.path().join("snapshot");
    fs::create_dir_all(&target).expect("should create a directory");
    let workspace = open(&directory).await;

    let report = workspace
        .snapshot(target)
        .await
        .expect_err("a directory should not be replaced by the snapshot");

    assert!(
        matches!(report.current_context(), SnapshotError::Write { .. }),
        "the failed write should be reported, not {report:?}"
    );
    assert!(
        !directory.path().join("snapshot.partial").exists(),
        "the partial copy should be removed"
    );
}

#[tokio::test]
async fn snapshot_replaces_link_at_partial_path() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;
    workspace
        .create_table("flights".into(), "SELECT 'BA117' AS code".into())
        .await
        .expect("the table should be created");

    let target = directory.path().join("snapshot");
    fs::hard_link(
        database_path(&directory),
        directory.path().join("snapshot.partial"),
    )
    .expect("should link the database file");
    workspace
        .snapshot(target.clone())
        .await
        .expect("the snapshot should replace the link");
    workspace.close().await.expect("the workspace should close");

    assert_eq!(
        count_rows(&database_path(&directory), "flights"),
        1,
        "the database should keep its table"
    );
    assert_eq!(
        count_rows(&target, "flights"),
        1,
        "the snapshot should hold the table"
    );
}

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

#[tokio::test]
async fn open_refuses_files_over_disk_limit() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory).await;
    workspace
        .create_table("flights".into(), "SELECT 'BA117' AS code".into())
        .await
        .expect("the table should be created");
    workspace.close().await.expect("the workspace should close");

    let report = Workspace::open(
        database_path(&directory),
        WorkspaceConfig {
            disk_limit: Some(ByteSize::from_bytes(1)),
            ..WorkspaceConfig::default()
        },
    )
    .await
    .expect_err("files over the disk limit should not open");

    assert!(
        matches!(
            report.current_context(),
            OpenError::DiskLimit { used, limit }
                if *limit == ByteSize::from_bytes(1) && used > limit
        ),
        "the size and the limit should be reported, not {report:?}"
    );
}

#[tokio::test]
async fn create_table_over_disk_limit_keeps_table() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open_with(
        &directory,
        WorkspaceConfig {
            disk_limit: Some(ByteSize::from_bytes(2 * MIB)),
            ..WorkspaceConfig::default()
        },
    )
    .await;

    let report = workspace
        .create_table(
            "numbers".into(),
            "SELECT random() AS value FROM range(300000)".into(),
        )
        .await
        .expect_err("a table that takes the files over the limit should be reported");

    assert!(
        matches!(
            report.current_context(),
            StatementError::DiskLimit { used, limit } if used > limit
        ),
        "the disk limit should be reported, not {report:?}"
    );
    workspace.close().await.expect("the workspace should close");
    assert_eq!(
        count_rows(&database_path(&directory), "numbers"),
        300_000,
        "the table should stay in the database"
    );
}

#[tokio::test]
async fn disk_limit_counts_temp_directory() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open_with(
        &directory,
        WorkspaceConfig {
            disk_limit: Some(ByteSize::from_bytes(2 * MIB)),
            ..WorkspaceConfig::default()
        },
    )
    .await;
    let temp = directory.path().join("workspace.duckdb.tmp");
    fs::create_dir_all(&temp).expect("should create the temporary directory");
    let spilled = vec![0_u8; usize::try_from(3 * MIB).expect("the size should fit")];
    fs::write(temp.join("spilled"), spilled).expect("should write a file");

    let report = workspace
        .query("SELECT 1".into())
        .await
        .expect_err("a file in the temporary directory should count towards the limit");

    assert!(
        matches!(report.current_context(), StatementError::DiskLimit { .. }),
        "the disk limit should be reported, not {report:?}"
    );
}

#[tokio::test]
async fn disk_limit_checkpoints_before_refusing() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open_with(
        &directory,
        WorkspaceConfig {
            disk_limit: Some(ByteSize::from_bytes(MIB)),
            ..WorkspaceConfig::default()
        },
    )
    .await;

    // Each table adds about 120 KB to the log, so the log alone passes the limit by the ninth.
    for count in 0..20 {
        workspace
            .create_table(
                "counters".into(),
                format!("SELECT range AS id, {count} AS count FROM range(10000)").into(),
            )
            .await
            .expect("each table should fit once the log is checkpointed");
    }

    let log = fs::metadata(directory.path().join("workspace.duckdb.wal"))
        .map_or(0, |metadata| metadata.len());
    assert!(
        log < MIB,
        "the log should be checkpointed before it passes the limit, but it holds {log} bytes"
    );
    assert_eq!(
        first_value(&workspace, "SELECT min(count) FROM counters")
            .await
            .expect("the query should run"),
        Value::Int(19),
        "the last table should be kept"
    );
}

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
        assert!(
            matches!(
                report.current_context(),
                StatementError::UnknownParameter { name: found } if &**found == name
            ),
            "`{sql}` should be refused for parameter `{name}`, not by {report:?}"
        );
    }
}
