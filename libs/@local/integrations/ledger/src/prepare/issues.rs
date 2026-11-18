//! The issues file of a run: the rows that were left out and the property values that could not
//! be converted.

use error_stack::Report;
use hash_integrations_engine::ArtifactRef;
use type_system::{knowledge::entity::id::EntityId, ontology::VersionedUrl};

use super::{properties::FailureReason, rows::Kind};
use crate::run::{RunContext, StageError};

/// Why a row or one of its properties is listed in the issues file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display)]
pub(super) enum IssueName {
    /// The row has no usable source id, so it is left out.
    #[display("missing_id")]
    MissingId,
    /// The link row lacks one of its two endpoints, so it is left out.
    #[display("missing_endpoint")]
    MissingEndpoint,
    /// The value of a property cannot be converted, so the property is left out of its row.
    #[display("property_unconverted")]
    PropertyUnconverted,
}

/// One entry of the issues file. Its fields are the seven columns of the file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Issue {
    pub kind: Kind,
    /// The name of the sink or link pipeline in the definition.
    pub target: Box<str>,
    /// The id of the entity or link. `None` for a row that was left out.
    pub entity_id: Option<EntityId>,
    /// The primary key of the source row as JSON. It holds source values.
    pub key: Option<Box<str>>,
    /// Written to the `issue` column.
    pub name: IssueName,
    /// The property that was left out. `None` for a row that was left out.
    pub property: Option<VersionedUrl>,
    /// Why the property could not be converted. `None` for a row that was left out.
    pub reason: Option<FailureReason>,
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
