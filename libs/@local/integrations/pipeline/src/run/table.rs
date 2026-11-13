//! Bounded checkpoint writers and the only Parquet handoff into a stage workspace.
use alloc::sync::Arc;
use std::path::PathBuf;

use arrow_array::{
    ArrayRef, BooleanArray, RecordBatch, StringArray, UInt16Array, UInt32Array, UInt64Array,
};
use error_stack::Report;
use parquet::arrow::ArrowWriter;
use tempfile::NamedTempFile;

use super::{Code, RunContext, StageError, error};
use crate::{ArtifactRef, Format, SourceCapture, Workspace};

const BATCH_ROWS: usize = 1024;
const BUFFER_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ColumnKind {
    Text,
    UInt16,
    UInt32,
    UInt64,
    Boolean,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Column {
    pub name: &'static str,
    pub kind: ColumnKind,
    pub nullable: bool,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Cell {
    Null,
    Text(Box<str>),
    UInt(u64),
    Boolean(bool),
}

/// A writer bounded by record count and text size, independent of the complete file size.
pub(crate) struct RowFile {
    columns: Box<[Column]>,
    target: PathBuf,
    writer: ArrowWriter<NamedTempFile>,
    pending: Vec<Box<[Cell]>>,
    pending_bytes: usize,
    rows: u64,
}

impl RowFile {
    /// Performs blocking file IO; callers writing more than one batch use a blocking task.
    pub(crate) fn create(
        context: &RunContext,
        columns: &[Column],
    ) -> Result<Self, Report<StageError>> {
        Self::create_at(context.scratch_file(Format::Parquet), columns)
    }

    /// Starts a writer at a run-local path that can be moved into a blocking task.
    pub(crate) fn create_at(
        target: PathBuf,
        columns: &[Column],
    ) -> Result<Self, Report<StageError>> {
        if columns.is_empty()
            || columns.iter().enumerate().any(|(index, column)| {
                columns
                    .iter()
                    .take(index)
                    .any(|prior| prior.name == column.name)
            })
        {
            return Err(Code::RowInvalid.report());
        }
        let partial = SourceCapture::stage(&target).map_err(error::capture)?;
        let schema = batch(columns, &[])?.schema();
        let writer =
            ArrowWriter::try_new(partial, schema, Some(SourceCapture::writer_properties()))
                .map_err(error::scratch)?;
        Ok(Self {
            columns: columns.into(),
            target,
            writer,
            pending: Vec::new(),
            pending_bytes: 0,
            rows: 0,
        })
    }

    pub(crate) fn push(&mut self, row: &[Cell]) -> Result<(), Report<StageError>> {
        if row.len() != self.columns.len() {
            return Err(Code::RowInvalid.report());
        }
        for (column, cell) in self.columns.iter().zip(row) {
            let valid = match (column.kind, cell) {
                (_, Cell::Null) => column.nullable,
                (ColumnKind::Text, Cell::Text(_))
                | (ColumnKind::Boolean, Cell::Boolean(_))
                | (ColumnKind::UInt64, Cell::UInt(_)) => true,
                (ColumnKind::UInt16, Cell::UInt(value)) => u16::try_from(*value).is_ok(),
                (ColumnKind::UInt32, Cell::UInt(value)) => u32::try_from(*value).is_ok(),
                _ => false,
            };
            if !valid {
                return Err(Code::RowInvalid.report());
            }
        }
        self.pending_bytes += row
            .iter()
            .map(|cell| match cell {
                Cell::Text(text) => text.len(),
                Cell::Null | Cell::UInt(_) | Cell::Boolean(_) => 0,
            })
            .sum::<usize>();
        self.pending.push(row.into());
        self.rows += 1;
        if self.pending.len() >= BATCH_ROWS || self.pending_bytes >= BUFFER_BYTES {
            self.write_pending()?;
        }
        Ok(())
    }

    fn write_pending(&mut self) -> Result<(), Report<StageError>> {
        if self.pending.is_empty() {
            return Ok(());
        }
        self.writer
            .write(&batch(&self.columns, &self.pending)?)
            .map_err(error::scratch)?;
        if self.writer.in_progress_size() >= BUFFER_BYTES {
            self.writer.flush().map_err(error::scratch)?;
        }
        self.pending.clear();
        self.pending_bytes = 0;
        Ok(())
    }

    pub(crate) fn close(mut self) -> Result<SourceCapture, Report<StageError>> {
        self.write_pending()?;
        let partial = self.writer.into_inner().map_err(error::scratch)?;
        SourceCapture::publish(partial, &self.target, self.rows).map_err(error::capture)
    }

    pub(crate) async fn store(
        self,
        context: &RunContext,
    ) -> Result<ArtifactRef, Report<StageError>> {
        let capture = tokio::task::spawn_blocking(move || self.close())
            .await
            .map_err(error::scratch)??;
        context.publish(capture.path(), Format::Parquet).await
    }
}

fn batch(columns: &[Column], rows: &[Box<[Cell]>]) -> Result<RecordBatch, Report<StageError>> {
    let arrays = columns.iter().enumerate().map(|(index, column)| {
        let cells = || {
            rows.iter().map(move |row| {
                row.get(index)
                    .expect("should have the validated number of columns")
            })
        };
        let array: ArrayRef = match column.kind {
            ColumnKind::Text => Arc::new(StringArray::from_iter(cells().map(|cell| match cell {
                Cell::Text(text) => Some(text.as_ref()),
                Cell::Null | Cell::UInt(_) | Cell::Boolean(_) => None,
            }))),
            ColumnKind::Boolean => {
                Arc::new(BooleanArray::from_iter(cells().map(|cell| match cell {
                    Cell::Boolean(value) => Some(*value),
                    Cell::Null | Cell::Text(_) | Cell::UInt(_) => None,
                })))
            }
            ColumnKind::UInt16 => {
                Arc::new(UInt16Array::from_iter(cells().map(|cell| match cell {
                    Cell::UInt(value) => u16::try_from(*value).ok(),
                    Cell::Null | Cell::Text(_) | Cell::Boolean(_) => None,
                })))
            }
            ColumnKind::UInt32 => {
                Arc::new(UInt32Array::from_iter(cells().map(|cell| match cell {
                    Cell::UInt(value) => u32::try_from(*value).ok(),
                    Cell::Null | Cell::Text(_) | Cell::Boolean(_) => None,
                })))
            }
            ColumnKind::UInt64 => {
                Arc::new(UInt64Array::from_iter(cells().map(|cell| match cell {
                    Cell::UInt(value) => Some(*value),
                    Cell::Null | Cell::Text(_) | Cell::Boolean(_) => None,
                })))
            }
        };
        (column.name, array, column.nullable)
    });
    RecordBatch::try_from_iter_with_nullable(arrays).map_err(error::scratch)
}

pub(crate) async fn store_query(
    context: &RunContext,
    workspace: &Workspace,
    sql: Box<str>,
) -> Result<ArtifactRef, Report<StageError>> {
    let capture = workspace
        .capture(sql, context.scratch_file(Format::Parquet))
        .await
        .map_err(error::capture)?;
    context.publish(capture.path(), Format::Parquet).await
}
pub(crate) async fn load_table(
    context: &RunContext,
    workspace: &Workspace,
    file: &ArtifactRef,
    table: Box<str>,
) -> Result<(), Report<StageError>> {
    let path = context.fetch(file).await?;
    let capture = tokio::task::spawn_blocking(move || SourceCapture::open(path))
        .await
        .map_err(error::scratch)?
        .map_err(error::capture)?;
    workspace
        .load_capture(capture, table)
        .await
        .map_err(error::capture)
}
