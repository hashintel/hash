use alloc::sync::Arc;
use std::path::Path;

use arrow_array::{RecordBatch, StringArray};
use deltalake_core::{
    DeltaTable, DeltaTableBuilder,
    arrow::datatypes::{DataType as ArrowDataType, Field, Schema},
    datafusion::prelude::{SessionContext, col, lit},
    kernel::{DataType, StructField},
    protocol::SaveMode,
    table::config::TableProperty,
};
use duckdb::{Connection, params};
use hash_integrations_definition::PrimaryKey;
use object_store::local::LocalFileSystem;
use pretty_assertions::assert_eq;
use rstest::rstest;
use tempfile::TempDir;
use url::Url;

use super::{Collapse, FeedKind, SourceTable, Window};

/// A row of a capture file: its key, its model and its change.
type Captured = (String, Option<String>, String);

fn key() -> PrimaryKey {
    PrimaryKey::new(["tail".parse().expect("should be a column name")])
        .expect("should be a primary key")
}

/// The rows of the capture file at `path`, in its order.
fn captured(path: &Path) -> Vec<Captured> {
    let connection = Connection::open_in_memory().expect("should open DuckDB");
    connection
        .prepare("SELECT tail, model, _change FROM read_parquet(?)")
        .and_then(|mut statement| {
            statement
                .query_map(params![path.to_str()], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                })?
                .collect::<duckdb::Result<Vec<_>>>()
        })
        .expect("should read the capture file")
}

fn row(tail: &str, model: Option<&str>, change: &str) -> Captured {
    (
        tail.to_owned(),
        model.map(ToOwned::to_owned),
        change.to_owned(),
    )
}

/// A row of a change data feed: its key, its model, the id dlt gave it, its change type and its
/// version.
type FeedRow = (&'static str, &'static str, &'static str, &'static str, i64);

/// Collapses the feed of `rows`, of `kind`, into a capture file and reads it back.
fn collapse(kind: FeedKind, rows: &[FeedRow]) -> Vec<Captured> {
    let directory = TempDir::new().expect("should create a directory");
    let feed = directory.path().join("feed.parquet");
    let connection = Connection::open_in_memory().expect("should open DuckDB");
    connection
        .execute_batch(
            "CREATE TABLE feed (tail VARCHAR, model VARCHAR, _dlt_id VARCHAR, _change_type \
             VARCHAR, _commit_version BIGINT, _commit_timestamp TIMESTAMP)",
        )
        .expect("should create the feed");
    for (tail, model, dlt_id, change, version) in rows {
        connection
            .execute(
                "INSERT INTO feed VALUES (?, ?, ?, ?, ?, now()::TIMESTAMP)",
                params![tail, model, dlt_id, change, version],
            )
            .expect("should insert a row");
    }
    connection
        .execute("SET VARIABLE feed = ?", params![feed.to_str()])
        .and_then(|_| {
            connection.execute_batch("COPY feed TO (getvariable('feed')) (FORMAT parquet)")
        })
        .expect("should write the feed");

    let file = directory.path().join("capture.parquet");
    Collapse {
        feed: &feed,
        key: &key(),
        kind,
    }
    .write(&file)
    .expect("should collapse the feed");
    captured(&file)
}

#[rstest]
#[case::insert(&[("A", "x", "1", "insert", 1)], &[("A", "x", "insert")])]
#[case::insert_then_update(
    &[
        ("A", "x", "1", "insert", 1),
        ("A", "x", "1", "update_preimage", 2),
        ("A", "y", "2", "update_postimage", 2),
    ],
    &[("A", "y", "insert")],
)]
#[case::insert_then_delete(&[("A", "x", "1", "insert", 1), ("A", "x", "1", "delete", 2)], &[])]
#[case::update(
    &[("A", "x", "1", "update_preimage", 2), ("A", "y", "2", "update_postimage", 2)],
    &[("A", "y", "update")],
)]
#[case::unchanged_update(
    &[("A", "x", "1", "update_preimage", 2), ("A", "x", "2", "update_postimage", 2)],
    &[],
)]
#[case::delete(&[("A", "x", "1", "delete", 2)], &[("A", "x", "delete")])]
#[case::delete_then_insert(
    &[("A", "x", "1", "delete", 2), ("A", "z", "2", "insert", 3)],
    &[("A", "z", "update")],
)]
#[case::order_by_last_version_then_key(
    &[
        ("C", "c", "1", "insert", 3),
        ("B", "b", "2", "insert", 2),
        ("A", "a", "3", "insert", 3),
    ],
    &[("B", "b", "insert"), ("A", "a", "insert"), ("C", "c", "insert")],
)]
fn changes_collapse_to_the_net_change(
    #[case] feed: &[FeedRow],
    #[case] expected: &[(&str, &str, &str)],
) {
    assert_eq!(
        collapse(FeedKind::Changes, feed),
        expected
            .iter()
            .map(|(tail, model, change)| row(tail, Some(model), change))
            .collect::<Vec<_>>()
    );
}

#[test]
fn snapshot_rows_are_inserts() {
    assert_eq!(
        collapse(
            FeedKind::Snapshot,
            &[("B", "b", "1", "", 0), ("A", "a", "2", "", 0)]
        ),
        [row("A", Some("a"), "insert"), row("B", Some("b"), "insert")],
        "a snapshot's rows should be inserts, ordered by key"
    );
}

/// A local Delta table with its change data feed on, written with deltalake-core.
struct LocalTable {
    directory: TempDir,
    table: Option<DeltaTable>,
}

impl LocalTable {
    async fn create() -> Self {
        let directory = TempDir::new().expect("should create a directory");
        let table = DeltaTableBuilder::from_url(
            Url::from_directory_path(directory.path()).expect("should be a URL"),
        )
        .and_then(DeltaTableBuilder::build)
        .expect("should open the location")
        .create()
        .with_columns([
            StructField::new("tail", DataType::STRING, false),
            StructField::new("model", DataType::STRING, true),
        ])
        .with_configuration_property(TableProperty::EnableChangeDataFeed, Some("true"))
        .await
        .expect("should create the table");
        Self {
            directory,
            table: Some(table),
        }
    }

    fn take(&mut self) -> DeltaTable {
        self.table.take().expect("the table should be open")
    }

    fn batch(rows: &[(&str, &str)]) -> RecordBatch {
        RecordBatch::try_new(
            Arc::new(Schema::new(vec![
                Field::new("tail", ArrowDataType::Utf8, false),
                Field::new("model", ArrowDataType::Utf8, true),
            ])),
            vec![
                Arc::new(StringArray::from_iter_values(rows.iter().map(|row| row.0))),
                Arc::new(StringArray::from_iter_values(rows.iter().map(|row| row.1))),
            ],
        )
        .expect("should be a batch")
    }

    /// Writes `rows`, appended to the table's or replacing them. A replacement rewrites the
    /// table's files, so the feed reads the removed rows as deleted and the added ones as inserted.
    async fn write(&mut self, rows: &[(&str, &str)], mode: SaveMode) {
        let table = self
            .take()
            .write([Self::batch(rows)])
            .with_save_mode(mode)
            .await
            .expect("should write the rows");
        self.table = Some(table);
    }

    /// Merges `rows` by their tail, as dlt does, which writes the changes as change data files.
    async fn merge(&mut self, rows: &[(&str, &str)]) {
        let source = SessionContext::new()
            .read_batch(Self::batch(rows))
            .expect("should read the rows");
        let (table, _) = self
            .take()
            .merge(source, col("target.tail").eq(col("source.tail")))
            .with_source_alias("source")
            .with_target_alias("target")
            .when_matched_update(|update| update.update("model", col("source.model")))
            .and_then(|merge| {
                merge.when_not_matched_insert(|insert| {
                    insert
                        .set("tail", col("source.tail"))
                        .set("model", col("source.model"))
                })
            })
            .expect("should build the merge")
            .await
            .expect("should merge the rows");
        self.table = Some(table);
    }

    async fn delete(&mut self, tail: &str) {
        let (table, _) = self
            .take()
            .delete()
            .with_predicate(col("tail").eq(lit(tail)))
            .await
            .expect("should delete the row");
        self.table = Some(table);
    }

    /// The capture file from `from` to the newest version, read through delta-kernel.
    async fn changes(&self, from: Option<u64>) -> (u64, Vec<Captured>) {
        let url = Url::from_directory_path(self.directory.path()).expect("should be a URL");
        // delta-kernel and DuckDB block.
        tokio::task::spawn_blocking(move || {
            let source = SourceTable::open(Arc::new(LocalFileSystem::new()), url);
            let to = source.version().expect("should read the version");
            let scratch = TempDir::new().expect("should create a directory");
            let file = scratch.path().join("capture.parquet");
            let rows = source
                .write_changes(Window { from, to }, &key(), scratch.path(), &file)
                .expect("should write the changes");
            let captured = captured(&file);
            assert_eq!(
                rows,
                captured.len() as u64,
                "the row count should match the file"
            );
            (to, captured)
        })
        .await
        .expect("should not panic")
    }

    /// Whether a commit wrote change data files.
    fn has_change_data(&self) -> bool {
        self.directory.path().join("_change_data").is_dir()
    }
}

#[tokio::test(flavor = "multi_thread")]
async fn first_capture_is_the_whole_table() {
    let mut table = LocalTable::create().await;
    table
        .write(&[("SE-XXX", "DC-3"), ("N100", "L-1049")], SaveMode::Append)
        .await;

    assert_eq!(
        table.changes(None).await,
        (
            1,
            vec![
                row("N100", Some("L-1049"), "insert"),
                row("SE-XXX", Some("DC-3"), "insert")
            ]
        )
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn rewritten_files_are_changes() {
    let mut table = LocalTable::create().await;
    table
        .write(
            &[("SE-XXX", "DC-3"), ("N100", "L-1049"), ("G-OLD", "Ju 52")],
            SaveMode::Append,
        )
        .await;
    table
        .write(
            &[("SE-XXX", "DC-3"), ("N100", "L-1049G"), ("D-NEW", "Do 228")],
            SaveMode::Overwrite,
        )
        .await;

    assert_eq!(
        table.changes(Some(1)).await,
        (
            2,
            vec![
                row("D-NEW", Some("Do 228"), "insert"),
                row("G-OLD", Some("Ju 52"), "delete"),
                row("N100", Some("L-1049G"), "update"),
            ]
        ),
        "a key whose row was rewritten unchanged should have no change"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn merges_and_deletes_are_read_from_change_data_files() {
    let mut table = LocalTable::create().await;
    table
        .write(
            &[("SE-XXX", "DC-3"), ("N100", "L-1049"), ("G-OLD", "Ju 52")],
            SaveMode::Append,
        )
        .await;
    table
        .merge(&[("SE-XXX", "DC-3"), ("N100", "L-1049G"), ("D-NEW", "Do 228")])
        .await;
    table.delete("G-OLD").await;
    assert!(
        table.has_change_data(),
        "the merge and the delete should write change data files"
    );

    assert_eq!(
        table.changes(Some(1)).await,
        (
            3,
            vec![
                row("D-NEW", Some("Do 228"), "insert"),
                row("N100", Some("L-1049G"), "update"),
                row("G-OLD", Some("Ju 52"), "delete"),
            ]
        ),
        "an unchanged row of the merge should have no change"
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn no_new_version_gives_an_empty_file() {
    let mut table = LocalTable::create().await;
    table.write(&[("SE-XXX", "DC-3")], SaveMode::Append).await;

    assert_eq!(table.changes(Some(1)).await, (1, Vec::new()));
}
