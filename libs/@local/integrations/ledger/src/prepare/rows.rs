//! Loads the capture files into the workspace and runs the pipelines of the definition.

use alloc::collections::{BTreeMap, BTreeSet};

use error_stack::Report;
use hash_integrations_definition::{Definition, SourceName};
use hash_integrations_engine::Workspace;

use crate::{
    capture::CaptureOutput,
    run::{RunContext, StageError},
};

/// Whether a target writes entities or links.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, derive_more::Display)]
pub(super) enum Kind {
    #[display("entity")]
    Entity,
    #[display("link")]
    Link,
}

/// The table a pipeline built for one sink or link pipeline, and the sources it reads.
#[derive(Debug)]
pub(super) struct TargetRows {
    pub kind: Kind,
    /// The name of the sink or link pipeline in the definition.
    pub name: Box<str>,
    pub table: Box<str>,
    pub columns: Vec<Box<str>>,
    pub sources: BTreeSet<SourceName>,
}

/// Stages each capture file as the table its pipelines read, and returns the table of each
/// source.
///
/// Staging numbers the rows in file order in `_seq`, adds `_key` from the primary key, and takes
/// `_op` from the file's `_change` column. This is the step a later variant of Prepare, such as
/// hash and diff, replaces.
///
/// # Errors
///
/// - [`Code::CaptureMissing`] if `capture` has no file for a source the definition reads
/// - [`Code::DataInvalid`] if a `_change` is not `insert`, `update` or `delete`, or a primary key
///   column is missing
/// - [`Code::WorkspaceUnavailable`] if the workspace cannot load or stage a file
///
/// [`Code::CaptureMissing`]: crate::Code::CaptureMissing
/// [`Code::DataInvalid`]: crate::Code::DataInvalid
/// [`Code::WorkspaceUnavailable`]: crate::Code::WorkspaceUnavailable
pub(super) async fn stage_sources(
    context: &RunContext,
    workspace: &Workspace,
    definition: &Definition,
    capture: &CaptureOutput,
) -> Result<BTreeMap<SourceName, Box<str>>, Report<StageError>> {
    unimplemented!()
}

/// Runs the pipelines of the definition on the `staged` tables and builds one table per target.
///
/// Each row of a target table carries the `_op` and the `_seq` of the captured row it was built
/// from.
///
/// # Errors
///
/// - [`Code::QueryInvalid`] if an entity target reads more than one source, a target table has lost
///   `_seq`, or a pipeline query fails
/// - [`Code::WorkspaceUnavailable`] if the workspace cannot run a query
///
/// [`Code::QueryInvalid`]: crate::Code::QueryInvalid
/// [`Code::WorkspaceUnavailable`]: crate::Code::WorkspaceUnavailable
pub(super) async fn prepare_rows(
    workspace: &Workspace,
    definition: &Definition,
    staged: &BTreeMap<SourceName, Box<str>>,
) -> Result<Vec<TargetRows>, Report<StageError>> {
    unimplemented!()
}
