//! Cuts the requests of a run into batches.

use error_stack::Report;

use crate::{
    run::{BatchSettings, StageError},
    sync_table::Change,
};

/// Assigns each change to a batch, in send order.
#[derive(Debug)]
pub(super) struct Batcher {
    settings: BatchSettings,
}

impl Batcher {
    pub(super) const fn new(settings: BatchSettings) -> Self {
        Self { settings }
    }

    /// Returns the index of the batch that takes `change`, whose request body has `bytes` bytes.
    ///
    /// A new batch starts when the operation changes, when create switches to update, at the
    /// write limit, at the byte limit, or when the entity of `change` is already in the open
    /// batch.
    ///
    /// # Errors
    ///
    /// - [`Code::PlanTooLarge`] if the run has more batches than a `u32` counts
    ///
    /// [`Code::PlanTooLarge`]: crate::Code::PlanTooLarge
    pub(super) fn assign(
        &mut self,
        change: &Change,
        bytes: u64,
    ) -> Result<u32, Report<StageError>> {
        unimplemented!()
    }
}
