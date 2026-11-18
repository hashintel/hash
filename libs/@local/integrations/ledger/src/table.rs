//! Parquet row files: typed rows written to storage, and such a file loaded into a workspace.
//!
//! The issues file and the files of the sync table are row files.

use error_stack::Report;
use hash_integrations_engine::{ArtifactRef, Workspace};

use crate::run::{RunContext, StageError};

/// The type of the values of a [`Column`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ColumnKind {
    Text,
    UInt16,
    UInt32,
    UInt64,
    Boolean,
}

/// A column of a row file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Column {
    pub name: &'static str,
    pub kind: ColumnKind,
    pub nullable: bool,
}

/// One value of a row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Cell {
    Null,
    Text(Box<str>),
    UInt(u64),
    Boolean(bool),
}

/// A row file that is being written.
///
/// Rows are buffered and written to a Parquet file in the scratch folder of the run. The file
/// reaches storage only when it is [stored](Self::store).
#[derive(Debug)]
pub(crate) struct RowFile {
    columns: &'static [Column],
}

impl RowFile {
    /// Starts a row file with `columns`.
    ///
    /// # Errors
    ///
    /// - [`Code::ScratchUnavailable`] if the file cannot be created in the scratch folder
    ///
    /// [`Code::ScratchUnavailable`]: crate::Code::ScratchUnavailable
    pub(crate) async fn create(
        context: &RunContext,
        columns: &'static [Column],
    ) -> Result<Self, Report<StageError>> {
        unimplemented!()
    }

    /// Adds one row. `row` has one cell per column, in the order of the columns.
    ///
    /// # Errors
    ///
    /// - [`Code::RowInvalid`] if a cell does not fit its column
    /// - [`Code::ScratchUnavailable`] if the rows cannot be written to the scratch folder
    ///
    /// [`Code::RowInvalid`]: crate::Code::RowInvalid
    /// [`Code::ScratchUnavailable`]: crate::Code::ScratchUnavailable
    pub(crate) async fn push(&mut self, row: Box<[Cell]>) -> Result<(), Report<StageError>> {
        unimplemented!()
    }

    /// Closes the file, uploads it and returns its reference.
    ///
    /// # Errors
    ///
    /// - [`Code::ScratchUnavailable`] if the file cannot be closed
    /// - [`Code::StorageUnavailable`] if the file cannot be uploaded
    ///
    /// [`Code::ScratchUnavailable`]: crate::Code::ScratchUnavailable
    /// [`Code::StorageUnavailable`]: crate::Code::StorageUnavailable
    pub(crate) async fn store(
        self,
        context: &RunContext,
    ) -> Result<ArtifactRef, Report<StageError>> {
        unimplemented!()
    }
}

/// Fetches the row file `file` and loads it into the table `table` of `workspace`.
///
/// # Errors
///
/// - [`Code::StorageUnavailable`] if the file cannot be fetched
/// - [`Code::WorkspaceUnavailable`] if the workspace cannot load the file
///
/// [`Code::StorageUnavailable`]: crate::Code::StorageUnavailable
/// [`Code::WorkspaceUnavailable`]: crate::Code::WorkspaceUnavailable
pub(crate) async fn load_table(
    context: &RunContext,
    workspace: &Workspace,
    file: &ArtifactRef,
    table: Box<str>,
) -> Result<(), Report<StageError>> {
    unimplemented!()
}
