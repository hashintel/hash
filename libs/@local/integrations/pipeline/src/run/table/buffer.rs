//! Bounded asynchronous facade for blocking checkpoint writers.
use core::mem;

use error_stack::Report;

use super::{Cell, Column, RowFile};
use crate::{ArtifactRef, Code, Format, RunContext, StageError, run::error};

const BUFFER_ROWS: usize = 1_024;
const BUFFER_BYTES: usize = 8 * 1024 * 1024;

/// Moves file creation, row-group writes and finalization off the async executor.
pub(crate) struct BufferedFile {
    file: Option<RowFile>,
    rows: Vec<Box<[Cell]>>,
    bytes: usize,
}

impl BufferedFile {
    pub(crate) async fn create(
        context: &RunContext,
        columns: &'static [Column],
    ) -> Result<Self, Report<StageError>> {
        let path = context.scratch_file(Format::Parquet);
        let file = tokio::task::spawn_blocking(move || RowFile::create_at(path, columns))
            .await
            .map_err(error::scratch)??;
        Ok(Self {
            file: Some(file),
            rows: Vec::new(),
            bytes: 0,
        })
    }

    pub(crate) async fn push(&mut self, row: Box<[Cell]>) -> Result<(), Report<StageError>> {
        self.bytes += row
            .iter()
            .map(|cell| match cell {
                Cell::Text(text) => text.len(),
                Cell::Null | Cell::UInt(_) | Cell::Boolean(_) => 0,
            })
            .sum::<usize>();
        self.rows.push(row);
        if self.rows.len() >= BUFFER_ROWS || self.bytes >= BUFFER_BYTES {
            self.flush().await?;
        }
        Ok(())
    }

    async fn flush(&mut self) -> Result<(), Report<StageError>> {
        if self.rows.is_empty() {
            return Ok(());
        }
        let mut file = self
            .file
            .take()
            .ok_or_else(|| Code::ScratchUnavailable.report())?;
        let rows = mem::take(&mut self.rows);
        self.bytes = 0;
        self.file = Some(
            tokio::task::spawn_blocking(move || {
                for row in rows {
                    file.push(&row)?;
                }
                Ok::<_, Report<StageError>>(file)
            })
            .await
            .map_err(error::scratch)??,
        );
        Ok(())
    }

    pub(crate) async fn store(
        mut self,
        context: &RunContext,
    ) -> Result<ArtifactRef, Report<StageError>> {
        self.flush().await?;
        self.file
            .take()
            .ok_or_else(|| Code::ScratchUnavailable.report())?
            .store(context)
            .await
    }
}
