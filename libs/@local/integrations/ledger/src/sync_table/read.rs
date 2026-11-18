//! Reads the rows of a run from the sync table.

use error_stack::Report;

use super::Change;
use crate::run::{RunContext, RunId, StageError};

/// Reads the rows of `run`, sorted by [`Operation`] first and by [`Change::order_id`] second.
///
/// # Errors
///
/// - [`Code::StorageUnavailable`] if the table cannot be read
/// - [`Code::RowInvalid`] if a stored row is not a [`Change`]
///
/// [`Operation`]: super::Operation
/// [`Code::StorageUnavailable`]: crate::Code::StorageUnavailable
/// [`Code::RowInvalid`]: crate::Code::RowInvalid
pub(crate) async fn in_send_order(
    context: &RunContext,
    run: RunId,
) -> Result<Vec<Change>, Report<StageError>> {
    unimplemented!()
}
