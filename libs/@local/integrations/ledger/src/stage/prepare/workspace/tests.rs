use alloc::collections::BTreeMap;
use core::{assert_matches, num::NonZeroUsize, str::FromStr as _};
use std::{
    fs::{self, File},
    path::Path,
};

use duckdb::types::{TimeUnit, Value};
use error_stack::Report;
use hash_integrations_definition::{VariableName, Variables};
use parquet::{
    arrow::{ArrowWriter, arrow_reader::ParquetRecordBatchReaderBuilder},
    basic::Compression,
    file::properties::WriterProperties,
};
use pretty_assertions::assert_eq;
use tempfile::TempDir;

use super::{ByteSize, StatementError, Workspace, WorkspaceConfig};

const MIB: u64 = 1024 * 1024;

fn open_with(directory: &TempDir, config: WorkspaceConfig) -> Workspace {
    Workspace::open(&directory.path().join("workspace.duckdb"), config)
        .expect("the workspace should open")
}

fn open(directory: &TempDir) -> Workspace {
    open_with(directory, WorkspaceConfig::default())
}

fn first_value(workspace: &Workspace, sql: &str) -> Result<Value, Report<StatementError>> {
    let rows = workspace.query(sql)?;
    let row = rows.iter().next().expect("the query should return a row");
    Ok(row.first().expect("the row should have a value").clone())
}

/// Writes the rows of `sql` to a Snappy-compressed Parquet file at `path`.
fn write_parquet(path: &Path, sql: &str) {
    let duckdb = duckdb::Connection::open_in_memory().expect("should open an in-memory database");
    let mut statement = duckdb.prepare(sql).expect("the query should parse");
    let batches = statement.query_arrow([]).expect("the query should run");
    let properties = WriterProperties::builder()
        .set_compression(Compression::SNAPPY)
        .build();
    let file = File::create(path).expect("should create the Parquet file");
    let mut writer = ArrowWriter::try_new(file, batches.get_schema(), Some(properties))
        .expect("should open the Parquet writer");
    for batch in batches {
        writer.write(&batch).expect("should write the rows");
    }
    writer.close().expect("should finish the Parquet file");
}

#[test]
fn query_returns_rows_in_column_order() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory);

    workspace
        .create_table(
            "flights",
            "SELECT * FROM (VALUES ('BA117', 214), ('LH400', 364)) AS flights (code, seats)",
        )
        .expect("the table should be created");
    let rows = workspace
        .query("SELECT seats, code FROM flights ORDER BY code")
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

#[test]
fn query_without_rows_keeps_columns() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory);

    let rows = workspace
        .query("SELECT 1 AS id, 'a' AS name WHERE false")
        .expect("the query should run");

    assert_eq!(
        rows.columns(),
        [Box::from("id"), Box::from("name")],
        "the columns should be named although no row matched"
    );
    assert_eq!(rows.iter().len(), 0, "the query should return no rows");
}

#[test]
fn create_table_replaces_table() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory);

    for sql in ["SELECT 'BA117' AS code", "SELECT 2 AS seats;"] {
        workspace
            .create_table("departure \"board\"", sql)
            .expect("the table should be created");
    }

    let rows = workspace
        .query("SELECT * FROM \"departure \"\"board\"\"\"")
        .expect("the query should run");
    assert_eq!(
        rows.columns(),
        [Box::from("seats")],
        "the second query should replace the table"
    );
}

#[test]
fn query_failure_keeps_workspace_open() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory);

    let report = workspace
        .query("SELECT * FROM missing")
        .expect_err("a query of a missing table should fail");

    assert_matches!(
        report.current_context(),
        StatementError::Failed,
        "the failed statement should be reported, not {report:?}"
    );
    assert!(
        report.downcast_ref::<duckdb::Error>().is_some(),
        "the DuckDB error should stay in the report, not {report:?}"
    );
    assert_eq!(
        first_value(&workspace, "SELECT 1").expect("the next query should run"),
        Value::Int(1),
        "the next query should return its value"
    );
}

#[test]
fn query_refuses_other_statements() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory);

    for sql in [
        "CREATE TABLE flights (code TEXT)",
        "CALL enable_logging()",
        "SELECT 1; DROP TABLE flights",
        "SELEC 1",
    ] {
        let report = workspace
            .query(sql)
            .expect_err("only a `SELECT` should run");
        assert_matches!(
            report.current_context(),
            StatementError::NotSelect { reason } if !reason.is_empty(),
            "`{sql}` should be refused with DuckDB's reason, not by {report:?}"
        );
    }
}

#[test]
fn create_table_refuses_other_statement_counts() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory);

    for (sql, count) in [("SELECT 1; SELECT 2", 2), ("", 0), ("-- nothing", 0)] {
        let report = workspace
            .create_table("flights", sql)
            .expect_err("SQL that is not one statement should be refused");
        assert_matches!(
            report.current_context(),
            StatementError::StatementCount { count: found } if *found == count,
            "`{sql}` should be refused as {count} statements, not by {report:?}"
        );
    }
    workspace
        .create_table("flights", "SELECT 1; -- one statement")
        .expect("a trailing `;` and comment should be accepted");
}

#[test]
fn query_refuses_disallowed_table_functions() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory);

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
            .query(sql)
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
        .expect("the allowed table functions should run"),
        Value::BigInt(8),
        "the query should count every combination"
    );
}

#[test]
fn open_locks_settings() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory);

    let rows = workspace
        .query(
            "SELECT current_setting('allow_community_extensions'), \
             current_setting('autoinstall_known_extensions'), \
             current_setting('autoload_known_extensions'), \
             current_setting('enable_external_access'), current_setting('lock_configuration')",
        )
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

#[test]
fn query_reads_supported_types() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory);

    let rows = workspace
        .query(
            "SELECT TIMESTAMP '2024-01-01 12:00', 1.5::DECIMAL(4, 1), 1::HUGEINT, DATE \
             '2024-01-01', '12:00'::TIME, INTERVAL 1 DAY, '\\x01'::BLOB, 'a'::ENUM('a', 'b'), \
             [1], {'a': 1}, MAP {'a': 1}, 1::UNION(n INTEGER, s TEXT)",
        )
        .expect("every column type should be readable");

    assert_eq!(
        rows.iter().next().map(<[Value]>::len),
        Some(12),
        "the row should hold every value"
    );
}

#[test]
fn query_refuses_unsupported_types() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory);

    for sql in [
        "SELECT '12:00'::TIME_NS AS departs",
        "SELECT ['12:00'::TIME_NS] AS departs",
        "SELECT {'at': '12:00'::TIME_NS} AS departs",
        "SELECT MAP {'at': '12:00'::TIME_NS} AS departs",
    ] {
        let report = workspace
            .query(sql)
            .expect_err("the column type should be refused");
        assert_matches!(
            report.current_context(),
            StatementError::UnsupportedType { column, .. } if &**column == "departs",
            "`{sql}` should be refused for its column type, not by {report:?}"
        );
    }
    assert_eq!(
        first_value(&workspace, "SELECT '12:00'::TIME").expect("the workspace should stay open"),
        Value::Time64(TimeUnit::Microsecond, 43_200_000_000),
        "a supported time should be read"
    );
}

#[test]
fn open_applies_limits() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open_with(
        &directory,
        WorkspaceConfig {
            memory_limit: Some(ByteSize::from_bytes(256 * MIB)),
            temp_directory_limit: Some(ByteSize::from_bytes(1024 * MIB)),
            threads: NonZeroUsize::new(2),
            ..WorkspaceConfig::default()
        },
    );

    let rows = workspace
        .query(
            "SELECT current_setting('memory_limit'), current_setting('max_temp_directory_size'), \
             current_setting('threads')",
        )
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

#[test]
fn query_binds_parameters() {
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
    );

    workspace
        .create_table(
            "flights",
            "SELECT * FROM (VALUES ('BA117', 214), ('LH400', 364)) AS flights (code, seats) WHERE \
             seats >= $min_seats::INTEGER - 100",
        )
        .expect("the table should be created");
    let rows = workspace
        .query(
            "SELECT code, $EXCLUDED AS excluded FROM flights WHERE seats > $MIN_SEATS::INTEGER \
             AND code <> $excluded",
        )
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

#[test]
fn query_refuses_unknown_parameter() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory);

    for (sql, name) in [("SELECT $MISSING", "MISSING"), ("SELECT ?", "1")] {
        let report = workspace
            .query(sql)
            .expect_err("a parameter without a value should be refused");
        assert_matches!(
            report.current_context(),
            StatementError::UnknownParameter { name: found } if &**found == name,
            "`{sql}` should be refused for parameter `{name}`, not by {report:?}"
        );
    }
}

#[test]
fn load_capture_types_and_empty_schema() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory);
    let path = directory.path().join("types.parquet");
    write_parquet(
        &path,
        "
            SELECT
                i,
                [i, i + 1] AS pair,
                struct_pack(label := 'a', value := i) AS nested,
                12.30::DECIMAL(12, 2) AS amount
            FROM range(5000) AS items(i)
            ",
    );
    assert_eq!(
        workspace
            .load_capture(&path, "loaded")
            .expect("should restore typed rows"),
        5000,
        "should return the number of rows"
    );
    let rows = workspace
        .query(
            "
                SELECT
                    count(*),
                    min(amount)::VARCHAR,
                    max(pair[2]),
                    min(nested.label),
                    count(*) FILTER (WHERE i <> rowid)
                FROM loaded
                ",
        )
        .expect("should query restored nested types");
    assert_eq!(
        rows.iter().next(),
        Some(
            [
                Value::BigInt(5000),
                Value::Text("12.30".to_owned()),
                Value::BigInt(5000),
                Value::Text("a".to_owned()),
                Value::BigInt(0)
            ]
            .as_slice()
        ),
        "should preserve types and the order of the rows across multiple Arrow batches"
    );
    let empty = directory.path().join("empty-load.parquet");
    write_parquet(
        &empty,
        "
            SELECT
                1::INTEGER AS id,
                ''::VARCHAR AS label
            WHERE false
            ",
    );
    assert_eq!(
        workspace
            .load_capture(&empty, "empty_loaded")
            .expect("should restore the empty schema"),
        0,
        "should load no rows"
    );
    let rows = workspace
        .query(
            "
                SELECT id, label
                FROM empty_loaded
                ",
        )
        .expect("should preserve empty columns");
    assert_eq!(rows.iter().len(), 0, "should preserve an empty result");
}

#[test]
fn load_invalid_capture_preserves_table() {
    let directory = TempDir::new().expect("should create a directory");
    let workspace = open(&directory);
    let path = directory.path().join("corrupt.parquet");
    workspace
        .create_table("existing", "SELECT 1 AS id")
        .expect("should create the original table");
    write_parquet(&path, "SELECT i AS id FROM range(5000) AS items(i)");
    // Overwrites the first page and keeps the footer, so the file opens and the load fails
    // inside its transaction, after the table was replaced.
    let mut bytes = fs::read(&path).expect("should read the capture");
    bytes
        .get_mut(4..20)
        .expect("the capture should be longer than 20 bytes")
        .fill(0xFF);
    fs::write(&path, bytes).expect("should corrupt the capture");
    ParquetRecordBatchReaderBuilder::try_new(File::open(&path).expect("should open the capture"))
        .expect("the footer of the corrupt capture should stay readable");
    let error = workspace
        .load_capture(&path, "existing")
        .expect_err("should reject a corrupt capture");
    assert_matches!(
        error.current_context(),
        StatementError::Failed,
        "should report a failed load"
    );
    let rows = workspace
        .query(
            "
                SELECT id
                FROM existing
                ",
        )
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
                ",
        )
        .expect_err("should keep internal schema access out of user SQL");
    assert_matches!(
        error.current_context(),
        StatementError::TableFunction { .. },
        "should reject the internal table function"
    );
}

#[test]
fn describe_count_and_pipeline_sql() {
    let directory = TempDir::new().expect("should create a directory");
    let variables = Variables::try_from(BTreeMap::from([(
        VariableName::from_str("MIN_SEATS").expect("should be a valid variable name"),
        "300".into(),
    )]))
    .expect("the variables should be valid");
    let workspace = open_with(
        &directory,
        WorkspaceConfig {
            variables,
            ..WorkspaceConfig::default()
        },
    );
    workspace
        .create_table(
            "flights",
            "SELECT * FROM (VALUES ('BA117', 214), ('LH400', 364)) AS flights (code, seats)",
        )
        .expect("the table should be created");

    let sql = workspace
        .pipeline_sql("SELECT code, seats FROM flights WHERE seats > $MIN_SEATS::INTEGER; -- long")
        .expect("a single `SELECT` should be accepted");
    assert!(
        !sql.contains(';') && !sql.contains("--"),
        "the terminator and the comment should be removed from `{sql}`"
    );
    assert_matches!(
        workspace
            .pipeline_sql("SELECT 1; SELECT 2")
            .expect_err("two statements should be refused")
            .current_context(),
        StatementError::StatementCount { count: 2 },
        "only a single `SELECT` should be embedded"
    );
    assert_eq!(
        workspace
            .describe(&sql)
            .expect("the query should be described"),
        [
            ("code".to_owned(), "VARCHAR".to_owned()),
            ("seats".to_owned(), "INTEGER".to_owned()),
        ],
        "each column's name and DuckDB type should be returned"
    );
    assert_eq!(
        workspace
            .count("SELECT count(*) FROM flights")
            .expect("the count should run"),
        2,
        "the count should be the number of rows"
    );
    assert_eq!(
        workspace
            .count("SELECT count(*) FROM duckdb_tables()")
            .expect("the count should run"),
        1,
        "describing a query should create no table"
    );
}
