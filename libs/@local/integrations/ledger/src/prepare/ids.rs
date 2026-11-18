//! Derives the id of each entity and link from its source id.

use error_stack::Report;
use hash_integrations_engine::Workspace;

use super::rows::TargetRows;
use crate::run::{RunContext, RunInput, StageError};

/// Adds the entity id of every row to the table of `target`.
///
/// An entity id is derived from the web, the namespace, the entity type and the source id. A
/// link also gets the ids of its two endpoints.
///
/// # Errors
///
/// - [`Code::RowKey`] if a row has no usable source id
/// - [`Code::DuplicateEntityId`] if two rows have the same entity id
/// - [`Code::WorkspaceUnavailable`] if the workspace cannot run a query
///
/// [`Code::RowKey`]: crate::Code::RowKey
/// [`Code::DuplicateEntityId`]: crate::Code::DuplicateEntityId
/// [`Code::WorkspaceUnavailable`]: crate::Code::WorkspaceUnavailable
pub(super) async fn assign(
    context: &RunContext,
    workspace: &Workspace,
    input: &RunInput,
    target: &TargetRows,
) -> Result<(), Report<StageError>> {
    unimplemented!()
}
