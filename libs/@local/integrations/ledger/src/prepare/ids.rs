//! Derives the id of each entity and link from its source id.

use error_stack::Report;
use hash_integrations_engine::Workspace;

use super::{issues::Issue, rows::TargetRows};
use crate::run::{RunContext, RunInput, StageError};

/// Adds the entity id of every row to the table of `target` and returns the rows it left out.
///
/// An entity id is derived from the web, the namespace, the entity type and the source id. A
/// link also gets the ids of its two endpoints. A row without a usable source id, or a link row
/// without both endpoints, is left out of the table and returned as an [`Issue`]. Several rows
/// may have the same entity id: an incremental capture can hold more than one change to an
/// entity.
///
/// # Errors
///
/// - [`Code::WorkspaceUnavailable`] if the workspace cannot run a query
///
/// [`Code::WorkspaceUnavailable`]: crate::Code::WorkspaceUnavailable
pub(super) async fn assign(
    context: &RunContext,
    workspace: &Workspace,
    input: &RunInput,
    target: &TargetRows,
) -> Result<Vec<Issue>, Report<StageError>> {
    unimplemented!()
}
