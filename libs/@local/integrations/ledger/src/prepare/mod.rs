//! Stage 2: turns the changed rows of a capture into entity changes in the sync table.

mod ids;
mod issues;
mod rows;

use error_stack::Report;
use hash_integrations_engine::ArtifactRef;
use serde::{Deserialize, Serialize};

use crate::run::{RunContext, RunId, StageError};

/// The result of Prepare, written to `run.json` as the prepare part.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PrepareOutput {
    /// The number of rows the run added to the sync table.
    pub rows: u64,
    /// The issues file. Present when a row was left out or a value could not be converted.
    pub issues: Option<ArtifactRef>,
    /// The number of entries in the issues file.
    pub issue_count: u64,
}

/// Appends one change per captured row of the run `run` to the sync table and writes the prepare
/// part.
///
/// Reads `run.json` for the input and the capture part of the run. Loads the capture files, runs
/// the pipelines of the definition to build one table per target, assigns the entity id of each
/// row and resolves its properties. A row without a usable source id is left out, and a value
/// that cannot be converted is left out of its row. Both are listed in the issues file of the
/// run. The rows are appended to the sync table first, the issues file is stored second, and the
/// prepare part is written to `run.json` last. A run whose prepare part is present returns that
/// part.
///
/// # Errors
///
/// - [`Code::RunNotReady`] if the run has no `run.json`, or its capture part is missing
/// - [`Code::InvalidDefinition`] if the stored definition cannot be parsed
/// - [`Code::QueryInvalid`] if a target reads more than one source, or a pipeline query fails
/// - [`Code::CaptureMissing`] if the capture part has no file for a source the definition reads
/// - [`Code::WorkspaceUnavailable`] if the workspace cannot run a query
/// - [`Code::StorageUnavailable`] if `run.json` cannot be read, or the sync table, the issues file
///   or `run.json` cannot be written
///
/// [`Code::RunNotReady`]: crate::Code::RunNotReady
/// [`Code::InvalidDefinition`]: crate::Code::InvalidDefinition
/// [`Code::QueryInvalid`]: crate::Code::QueryInvalid
/// [`Code::CaptureMissing`]: crate::Code::CaptureMissing
/// [`Code::WorkspaceUnavailable`]: crate::Code::WorkspaceUnavailable
/// [`Code::StorageUnavailable`]: crate::Code::StorageUnavailable
#[tracing::instrument(level = "debug", skip_all, fields(run_id = %run))]
pub async fn prepare(
    context: &RunContext,
    run: RunId,
) -> Result<PrepareOutput, Report<StageError>> {
    unimplemented!()
}
