//! Appends the rows of a run to the sync table.

use error_stack::Report;

use super::Change;
use crate::run::{RunContext, StageError};

/// Appends `changes` to the sync table.
///
/// The changes belong to one run and are ordered by [`Change::order_id`].
///
/// # Errors
///
/// - [`Code::StorageUnavailable`] if the table cannot be written
///
/// [`Code::StorageUnavailable`]: crate::Code::StorageUnavailable
pub(crate) async fn append(
    context: &RunContext,
    changes: &[Change],
) -> Result<(), Report<StageError>> {
    unimplemented!()
}
