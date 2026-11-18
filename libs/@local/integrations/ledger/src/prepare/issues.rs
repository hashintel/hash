//! The issues file of a run: the property values that could not be converted.

use error_stack::Report;
use hash_integrations_engine::ArtifactRef;
use type_system::knowledge::entity::id::EntityId;

use super::properties::ConversionFailure;
use crate::run::{RunContext, StageError};

/// A property that was left out of the change of `entity_id`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Issue {
    pub entity_id: EntityId,
    pub failure: ConversionFailure,
}

/// Stores `issues` as the issues file of the run, or returns `None` if there are none.
///
/// # Errors
///
/// - [`Code::StorageUnavailable`] if the file cannot be written
///
/// [`Code::StorageUnavailable`]: crate::Code::StorageUnavailable
pub(super) async fn store(
    context: &RunContext,
    issues: &[Issue],
) -> Result<Option<ArtifactRef>, Report<StageError>> {
    unimplemented!()
}
