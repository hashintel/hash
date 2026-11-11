use error_stack::Report;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{RecordError, StateVersionId, content_digest};
use crate::ArtifactRef;

// Origin: `StateVersion` in labs `pocs/integrations_rs/src/orchestrator/work.rs`, without its
// phase, definition digest, schema versions and timestamps.
/// What one run produced: its source state and the Graph projection it plans.
///
/// Stored as `{"version":"v1","value":{…}}`. The ID is computed from the content, so it is not
/// stored in the record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "version", content = "value", rename_all = "lowercase")]
pub enum StateVersion {
    V1(StateVersionV1),
}

/// The first version of a state version.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StateVersionV1 {
    /// The actor the run acts as.
    pub owner: Uuid,
    /// The state the run started from, or `None` for the first state of an integration.
    pub parent: Option<StateVersionRef>,
    /// One more than the parent's generation, or 1 for the first state.
    pub generation: u64,
    /// The DuckDB snapshot of the run's workspace.
    pub workspace: ArtifactRef,
    /// The captures of the run's sources.
    pub captures: Vec<ArtifactRef>,
    /// What the Graph holds once this state is applied.
    pub desired_projection: ArtifactRef,
}

/// Points at a stored state version.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StateVersionRef {
    pub id: StateVersionId,
    pub artifact: ArtifactRef,
}

impl StateVersion {
    #[must_use]
    pub fn id(&self) -> StateVersionId {
        StateVersionId(content_digest("state-version:v1", self))
    }

    /// Decodes the stored state version identified by `id`.
    ///
    /// # Errors
    ///
    /// Returns [`RecordError::Decode`] if the bytes are too large or not a state version, or
    /// [`RecordError::Mismatch`] if they are a state version other than `id`.
    pub fn decode(bytes: &[u8], id: StateVersionId) -> Result<Self, Report<RecordError>> {
        let state: Self = super::decode(bytes)?;
        if state.id() != id {
            return Err(Report::new(RecordError::Mismatch));
        }
        Ok(state)
    }
}
