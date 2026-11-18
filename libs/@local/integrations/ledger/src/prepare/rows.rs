//! Loads the capture files into the workspace and runs the pipelines of the definition.

use alloc::collections::BTreeSet;

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

/// Builds one table per target from the capture files.
///
/// Each capture file is staged first: staging adds `_key` and takes `_op` from the file's
/// `_change` column. Each row of a table carries the `_op` of the captured row it was built from.
///
/// # Errors
///
/// - [`Code::CaptureMissing`] if `capture` has no file for a source the definition reads
/// - [`Code::QueryInvalid`] if a target reads more than one source, or a pipeline query fails
/// - [`Code::WorkspaceUnavailable`] if the workspace cannot run a query
///
/// [`Code::CaptureMissing`]: crate::Code::CaptureMissing
/// [`Code::QueryInvalid`]: crate::Code::QueryInvalid
/// [`Code::WorkspaceUnavailable`]: crate::Code::WorkspaceUnavailable
pub(super) async fn prepare_rows(
    context: &RunContext,
    workspace: &Workspace,
    definition: &Definition,
    capture: &CaptureOutput,
) -> Result<Vec<TargetRows>, Report<StageError>> {
    unimplemented!()
}
