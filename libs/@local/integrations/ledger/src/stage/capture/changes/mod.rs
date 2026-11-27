//! The changes of a source's Delta table between two of its versions, as a capture file.
//!
//! A collector such as dlt writes each table of a source as a Delta table with its change data
//! feed on. delta-kernel reads the feed of the versions a run captures, DuckDB collapses it to one
//! net change per key, and the result is a capture file: the table's columns and `_change`.

#[cfg(test)]
mod tests;

use alloc::sync::Arc;
use std::{fs::File, path::Path};

use buoyant_kernel::{
    Engine, KernelError, KernelResult, Snapshot, Version,
    arrow::datatypes::Schema as ArrowSchema,
    engine::{arrow_conversion::TryIntoArrow as _, arrow_data::ArrowEngineData},
    engine_data::EngineData,
    schema::StructType,
    table_changes::TableChanges,
};
use buoyant_kernel_engine::DefaultEngineBuilder;
use duckdb::{Connection, params};
use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::PrimaryKey;
use object_store::ObjectStore;
use parquet::arrow::ArrowWriter;
use url::Url;

use crate::stage::prepare::Identifier;

/// Reports why the changes of a source's table could not be read.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub(crate) enum ChangesError {
    /// The bucket could not be read. Trying again can help.
    #[display("the source's table could not be read")]
    Storage,
    /// The table does not exist, has no change data feed for the versions, or its rows cannot be
    /// collapsed. Trying again cannot help.
    #[display("the changes of the source's table cannot be captured")]
    Invalid,
}

/// The columns the change data feed adds to a table's own.
const FEED_COLUMNS: [&str; 3] = ["_change_type", "_commit_version", "_commit_timestamp"];

/// The prefix of the columns dlt adds to every table it writes.
const COLLECTOR_PREFIX: &str = "_dlt_";

/// The versions of a table a run captures: those after `from`, up to and including `to`. Without
/// `from`, the run captures every row of the table at `to`, as inserts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Window {
    pub from: Option<Version>,
    pub to: Version,
}

/// A source's Delta table, read through delta-kernel. Its functions block.
pub(crate) struct SourceTable {
    url: Url,
    engine: Arc<dyn Engine>,
}

impl SourceTable {
    /// The Delta table at `url`, read through `store`, the bucket the URL names.
    pub(crate) fn open(store: Arc<dyn ObjectStore>, mut url: Url) -> Self {
        // delta-kernel takes a table's root as a folder.
        if !url.path().ends_with('/') {
            url.set_path(&format!("{}/", url.path()));
        }
        Self {
            url,
            engine: Arc::new(DefaultEngineBuilder::new(store).build()),
        }
    }

    /// The table's newest version.
    ///
    /// # Errors
    ///
    /// Returns [`ChangesError::Invalid`] if there is no table at the URL, and
    /// [`ChangesError::Storage`] if the bucket cannot be read.
    pub(crate) fn version(&self) -> Result<Version, Report<ChangesError>> {
        Snapshot::builder_for(self.url.as_str())
            .build(self.engine.as_ref())
            .map(|snapshot| snapshot.version())
            .map_err(kernel_error)
    }

    /// Writes the net change of each key of the table in `window` to the capture file `file`, and
    /// returns its number of rows. `scratch` is a folder for the feed while it is collapsed.
    ///
    /// # Errors
    ///
    /// Returns [`ChangesError::Invalid`] if the table has no change data feed for the window, or
    /// its rows cannot be collapsed by `key`, and [`ChangesError::Storage`] if the bucket cannot be
    /// read.
    pub(crate) fn write_changes(
        &self,
        window: Window,
        key: &PrimaryKey,
        scratch: &Path,
        file: &Path,
    ) -> Result<u64, Report<ChangesError>> {
        let feed = scratch.join("feed.parquet");
        let kind = self.write_feed(window, &feed)?;
        Collapse {
            feed: &feed,
            key,
            kind,
        }
        .write(file)
    }

    /// Writes the rows the window covers to `feed`, as delta-kernel gives them.
    fn write_feed(&self, window: Window, feed: &Path) -> Result<FeedKind, Report<ChangesError>> {
        let engine = Arc::clone(&self.engine);
        match window.from {
            Some(from) if from < window.to => {
                let changes = TableChanges::try_new(
                    self.url.clone(),
                    engine.as_ref(),
                    from + 1,
                    Some(window.to),
                )
                .map_err(kernel_error)?;
                let schema = arrow_schema(changes.schema())?;
                let batches = changes
                    .into_scan_builder()
                    .build()
                    .and_then(|scan| scan.execute(engine))
                    .map_err(kernel_error)?;
                write_parquet(feed, schema, batches)?;
                Ok(FeedKind::Changes)
            }
            from => {
                let snapshot = Snapshot::builder_for(self.url.as_str())
                    .at_version(window.to)
                    .build(engine.as_ref())
                    .map_err(kernel_error)?;
                let schema = arrow_schema(&snapshot.schema())?;
                if from.is_some() {
                    // Nothing changed since the last run: the file has the columns and no rows.
                    write_parquet(feed, schema, core::iter::empty())?;
                } else {
                    let batches = snapshot
                        .scan_builder()
                        .build()
                        .and_then(|scan| scan.execute(Arc::clone(&engine)))
                        .map_err(kernel_error)?;
                    write_parquet(feed, schema, batches)?;
                }
                Ok(FeedKind::Snapshot)
            }
        }
    }
}

/// What the rows of a feed are.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FeedKind {
    /// The table's rows at one version.
    Snapshot,
    /// The change data feed of several versions.
    Changes,
}

/// The step that turns a feed into a capture file, in DuckDB.
struct Collapse<'feed> {
    feed: &'feed Path,
    key: &'feed PrimaryKey,
    kind: FeedKind,
}

impl Collapse<'_> {
    /// Writes the capture file `file` and returns its number of rows.
    ///
    /// The rows of a snapshot are inserts. The changes of a key collapse to its net change, by
    /// `_commit_version`: a key inserted and deleted in the window has no row; a key inserted in
    /// the window is an insert; a key deleted in the end is a delete; any other key is an update
    /// with its last values. A delete and an insert of a key in one version are an update, and an
    /// update that changed no column of the table's own is dropped.
    fn write(&self, file: &Path) -> Result<u64, Report<ChangesError>> {
        let connection = Connection::open_in_memory().change_context(ChangesError::Invalid)?;
        connection
            .execute(
                "CREATE TEMPORARY TABLE feed AS SELECT * FROM read_parquet(?)",
                params![path_text(self.feed)?],
            )
            .change_context(ChangesError::Invalid)?;
        let columns = connection
            .prepare("SELECT column_name FROM (DESCRIBE feed)")
            .and_then(|mut statement| {
                statement
                    .query_map([], |row| row.get::<_, String>(0))?
                    .collect::<duckdb::Result<Vec<_>>>()
            })
            .change_context(ChangesError::Invalid)?;
        let data = columns
            .iter()
            .filter(|column| {
                !column.starts_with(COLLECTOR_PREFIX) && !FEED_COLUMNS.contains(&column.as_str())
            })
            .map(String::as_str)
            .collect::<Vec<_>>();
        let key = self
            .key
            .columns()
            .iter()
            .map(AsRef::as_ref)
            .collect::<Vec<&str>>();
        let select = match self.kind {
            FeedKind::Snapshot => snapshot_select(&data, &key),
            FeedKind::Changes => changes_select(&data, &key),
        };
        connection
            .execute("SET VARIABLE capture_file = ?", params![path_text(file)?])
            .and_then(|_| {
                // `COPY` takes no bound parameters; the variable holds the path.
                connection.execute_batch(&format!(
                    "COPY ({select}) TO (getvariable('capture_file')) (FORMAT parquet)"
                ))
            })
            .and_then(|()| {
                connection.query_row(
                    "SELECT count(*) FROM read_parquet(getvariable('capture_file'))",
                    [],
                    |row| row.get(0),
                )
            })
            .change_context(ChangesError::Invalid)
    }
}

/// The rows of a snapshot, as inserts, ordered by key.
fn snapshot_select(data: &[&str], key: &[&str]) -> String {
    format!(
        "SELECT {}, 'insert' AS _change FROM feed ORDER BY {}",
        list(data, ""),
        list(key, "")
    )
}

/// The net change of each key of a change data feed, ordered by the version of its last change,
/// then by key.
fn changes_select(data: &[&str], key: &[&str]) -> String {
    let same_key = key
        .iter()
        .map(|column| {
            let column = Identifier::new(column);
            format!("pre.{column} = post.{column}")
        })
        .collect::<Vec<_>>()
        .join(" AND ");
    // A commit that rewrites a file without change data files gives the rows of a key it kept as a
    // delete and an insert of the same version, which is an update.
    format!(
        "WITH paired AS ( SELECT * REPLACE ( CASE WHEN _change_type = 'delete' AND count(*) \
         FILTER (_change_type = 'insert') OVER (PARTITION BY {key}, _commit_version) > 0 THEN \
         'update_preimage' WHEN _change_type = 'insert' AND count(*) FILTER (_change_type = \
         'delete') OVER (PARTITION BY {key}, _commit_version) > 0 THEN 'update_postimage' ELSE \
         _change_type END AS _change_type) FROM feed), pre AS (SELECT * FROM paired WHERE \
         _change_type = 'update_preimage'), changes AS ( SELECT * FROM paired AS post WHERE \
         _change_type <> 'update_preimage' AND NOT EXISTS ( SELECT 1 FROM pre WHERE \
         post._change_type = 'update_postimage' AND pre._commit_version = post._commit_version \
         AND {same_key} AND ROW({pre_data}) IS NOT DISTINCT FROM ROW({post_data}))), ranked AS ( \
         SELECT *, first_value(_change_type) OVER (PARTITION BY {key} ORDER BY _commit_version) \
         AS _first, row_number() OVER (PARTITION BY {key} ORDER BY _commit_version DESC) AS \
         _latest FROM changes) SELECT {data}, CASE WHEN _change_type = 'delete' THEN 'delete' \
         WHEN _first = 'insert' THEN 'insert' ELSE 'update' END AS _change FROM ranked WHERE \
         _latest = 1 AND NOT (_change_type = 'delete' AND _first = 'insert') ORDER BY \
         _commit_version, {key}",
        pre_data = list(data, "pre."),
        post_data = list(data, "post."),
        key = list(key, ""),
        data = list(data, ""),
    )
}

/// `columns` as a list of quoted names, each after `prefix`.
fn list(columns: &[&str], prefix: &str) -> String {
    columns
        .iter()
        .map(|column| format!("{prefix}{}", Identifier::new(column)))
        .collect::<Vec<_>>()
        .join(", ")
}

/// `path` as text, for DuckDB.
fn path_text(path: &Path) -> Result<&str, Report<ChangesError>> {
    path.to_str().ok_or_else(|| {
        Report::new(ChangesError::Invalid).attach(format!("`{}` is not text", path.display()))
    })
}

/// `schema` as an Arrow schema.
fn arrow_schema(schema: &StructType) -> Result<ArrowSchema, Report<ChangesError>> {
    schema
        .try_into_arrow()
        .change_context(ChangesError::Invalid)
}

/// Writes `batches` to the Parquet file `path`, which has the columns of `schema` also without
/// rows.
fn write_parquet(
    path: &Path,
    schema: ArrowSchema,
    batches: impl Iterator<Item = KernelResult<Box<dyn EngineData>>>,
) -> Result<(), Report<ChangesError>> {
    let file = File::create(path).change_context(ChangesError::Invalid)?;
    let mut writer =
        ArrowWriter::try_new(file, Arc::new(schema), None).change_context(ChangesError::Invalid)?;
    for batch in batches {
        let batch = batch
            .and_then(ArrowEngineData::try_from_engine_data)
            .map_err(kernel_error)?;
        writer
            .write(batch.record_batch())
            .change_context(ChangesError::Invalid)?;
    }
    writer.close().change_context(ChangesError::Invalid)?;
    Ok(())
}

/// What an error of delta-kernel means: a bucket that cannot be read can be read again.
#[expect(
    clippy::wildcard_enum_match_arm,
    reason = "every other error of delta-kernel is about the table, not the bucket"
)]
fn kernel_error(error: KernelError) -> Report<ChangesError> {
    let mut cause = &error;
    while let KernelError::Backtraced { source, .. } = cause {
        cause = source;
    }
    let context = match cause {
        KernelError::IOError(_) | KernelError::ObjectStore(_) => ChangesError::Storage,
        _ => ChangesError::Invalid,
    };
    Report::new(error).change_context(context)
}
