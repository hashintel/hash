//! The sync table: every entity change of every run. Prepare writes a run's rows, and Send reads
//! them.
//!
//! The table is a Delta table under `sync/` in the integration's place in the bucket, read and
//! written through DuckDB. It is partitioned by run, and a run's rows are written once, in one
//! commit.

mod row;
#[cfg(test)]
mod tests;

use duckdb::params;
use error_stack::{Report, ResultExt as _};

pub(crate) use self::row::{Op, SyncRow, order_key};
use crate::{
    RunId,
    lake::{Column, Columns, Lake, LakeError, LakeSettings, Table, failed},
    storage::Storage,
};

/// Reports why the sync table could not be written or read.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub(crate) enum SyncTableError {
    /// The bucket or DuckDB could not be used. Running the stage again can help.
    #[display("the sync table could not be reached")]
    Storage,
    /// A row cannot be written or read. Running the stage again cannot help.
    #[display("the sync table cannot hold the rows")]
    Invalid,
    /// The storage has no bucket. Running the stage again cannot help.
    #[display("the storage has no bucket for the sync table")]
    Unconfigured,
}

/// The key of the table below the integration's place in the bucket.
const TABLE: &str = "sync";

/// The columns of the table besides `run`: the other fields of [`SyncRow`]. Ids and types are
/// text, and the properties JSON text.
fn columns() -> Columns {
    Columns::new([
        Column::new("seq", "BIGINT"),
        Column::new("op", "VARCHAR"),
        Column::new("entity_id", "VARCHAR"),
        Column::new("entity_type", "VARCHAR"),
        Column::new("left_entity_id", "VARCHAR"),
        Column::new("right_entity_id", "VARCHAR"),
        Column::new("properties", "VARCHAR"),
    ])
}

/// What an error of the lake means for the sync table.
fn from_lake(report: Report<LakeError>) -> Report<SyncTableError> {
    let context = match report.current_context() {
        LakeError::Storage => SyncTableError::Storage,
        LakeError::Invalid => SyncTableError::Invalid,
        LakeError::Unconfigured => SyncTableError::Unconfigured,
    };
    report.change_context(context)
}

/// The sync table, attached to a [`Lake`].
#[derive(Debug)]
pub(crate) struct SyncTable<'lake> {
    lake: &'lake Lake,
    table: Table<'lake>,
}

impl<'lake> SyncTable<'lake> {
    /// Attaches the sync table to `lake`.
    ///
    /// # Errors
    ///
    /// Returns [`SyncTableError::Storage`] if the table's location cannot be attached.
    pub(crate) fn open(lake: &'lake Lake) -> Result<Self, Report<SyncTableError>> {
        Ok(Self {
            lake,
            table: lake.table(TABLE).map_err(from_lake)?,
        })
    }

    /// Writes `rows` as the rows of `run`, in one commit, and returns the number of rows of `run`
    /// in the table.
    ///
    /// A run is written once. If its rows are in the table already, from an earlier attempt or
    /// from another process, the table is left as it is, and the number is that of those rows. A
    /// write without rows commits nothing, so it does not mark the run as written.
    ///
    /// # Errors
    ///
    /// Returns [`SyncTableError::Invalid`] if a row is not of `run` or the table cannot hold the
    /// rows, and [`SyncTableError::Storage`] if the table cannot be read or written.
    pub(crate) fn write(
        &self,
        run: RunId,
        rows: &[SyncRow],
    ) -> Result<u64, Report<SyncTableError>> {
        if let Some(row) = rows.iter().find(|row| row.run != run) {
            return Err(Report::new(SyncTableError::Invalid).attach(format!(
                "a row of run {} was written for run {run}",
                row.run
            )));
        }
        if self.table.has_run(run).map_err(from_lake)? {
            return self.table.rows(run).map_err(from_lake);
        }
        let staged = self.lake.stage_rows(&columns()).map_err(from_lake)?;
        let mut appender = staged.appender().map_err(from_lake)?;
        for row in rows {
            appender
                .append_row(params![
                    row.seq,
                    row.op,
                    row.entity_id.to_string(),
                    row.entity_type.to_string(),
                    row.left_entity_id.map(|id| id.to_string()),
                    row.right_entity_id.map(|id| id.to_string()),
                    row.properties_text()?,
                ])
                .change_context(SyncTableError::Invalid)?;
        }
        appender.flush().map_err(failed).map_err(from_lake)?;
        drop(appender);
        self.table.append_run(run, &staged).map_err(from_lake)
    }

    /// The rows of `run`, ordered by `seq`, then by [`order_key`]. A run that was never written
    /// has no rows.
    ///
    /// # Errors
    ///
    /// Returns [`SyncTableError::Invalid`] if the table has other columns or a row cannot be read,
    /// and [`SyncTableError::Storage`] if the table cannot be read.
    pub(crate) fn read(&self, run: RunId) -> Result<Vec<SyncRow>, Report<SyncTableError>> {
        if !self.table.exists().map_err(from_lake)? {
            return Ok(Vec::new());
        }
        let mut rows = self
            .table
            .read_run(run, &columns(), from_lake, |row| SyncRow::read(row, run))?;
        rows.sort_by_key(|row| (row.seq, order_key(&row.entity_id)));
        Ok(rows)
    }
}

/// The rows of `run` in the sync table of `storage`, as [`SyncTable::read`] reads them.
///
/// # Errors
///
/// Returns the errors of [`SyncTable::read`], and [`SyncTableError::Unconfigured`] if the storage
/// has no bucket.
pub(crate) async fn read(
    storage: &Storage,
    run: RunId,
) -> Result<Vec<SyncRow>, Report<SyncTableError>> {
    LakeSettings::of(storage)
        .map_err(from_lake)?
        .run(from_lake, move |lake| SyncTable::open(lake)?.read(run))
        .await
}

/// Writes `rows` as the rows of `run` in the sync table of `storage`, as [`SyncTable::write`]
/// writes them.
#[cfg(test)]
pub(crate) async fn write(
    storage: &Storage,
    run: RunId,
    rows: Vec<SyncRow>,
) -> Result<u64, Report<SyncTableError>> {
    LakeSettings::of(storage)
        .map_err(from_lake)?
        .run(from_lake, move |lake| {
            SyncTable::open(lake)?.write(run, &rows)
        })
        .await
}
