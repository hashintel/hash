use error_stack::Report;
use hash_integrations_definition::ConnectorId;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{EventId, RecordError, StateVersionId, StateVersionRef, WorkId, content_digest};
use crate::ArtifactRef;

// Origin: `WorkManifest` in labs `pocs/integrations_rs/src/orchestrator/work.rs`, storing the
// integration instead of taking it as an argument, and without its stored work ID or creation
// time.
/// The Graph effects a piece of work delivers, and why.
///
/// Stored as `{"version":"v1","value":{…}}`. The ID is computed from the content, so it is not
/// stored in the record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "version",
    content = "value",
    rename_all = "lowercase",
    deny_unknown_fields
)]
pub enum WorkManifest {
    V1(WorkManifestV1),
}

/// The first version of a work manifest.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkManifestV1 {
    pub web: Uuid,
    pub connector: ConnectorId,
    /// The actor the run acts as.
    pub owner: Uuid,
    pub kind: WorkKind,
    /// The index of the effects to deliver.
    pub effects: ArtifactRef,
    pub effect_count: u64,
    /// How each effect's identity is computed.
    pub effect_identity_version: u32,
    /// How the effects are encoded.
    pub effect_encoding_version: u32,
}

/// Why the effects are delivered.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    content = "value",
    rename_all = "lowercase",
    deny_unknown_fields
)]
pub enum WorkKind {
    /// Delivers the new state version a run planned.
    Apply {
        run_id: Uuid,
        candidate: StateVersionRef,
    },
    /// Delivers the state from before a failed run, or the empty state if `target` is `None`.
    Restore {
        failed_run_id: Uuid,
        failed_work_id: WorkId,
        target: Option<StateVersionRef>,
        /// The state the failed run may have partly delivered.
        contaminated: StateVersionRef,
    },
    /// Delivers the applied state again.
    Reconcile {
        target: StateVersionRef,
        /// The event that completed the apply of `target`, so each apply is reconciled anew, or
        /// `None` if no completed apply is recorded.
        applied_incarnation: Option<EventId>,
        /// One more than the cycle of the integration's last completed reconcile.
        cycle: u64,
    },
}

// Origin: `RestoreWorkIdentity` in labs `pocs/integrations_rs/src/orchestrator/work.rs`.
#[derive(Serialize)]
struct RestoreIdentity<'work> {
    web: Uuid,
    connector: &'work ConnectorId,
    owner: Uuid,
    failed_work_id: WorkId,
    target: Option<StateVersionId>,
    contaminated: StateVersionId,
}

// Origin: `ReconcileWorkIdentity` in labs `pocs/integrations_rs/src/orchestrator/work.rs`.
#[derive(Serialize)]
struct ReconcileIdentity<'work> {
    web: Uuid,
    connector: &'work ConnectorId,
    owner: Uuid,
    target: StateVersionId,
    applied_incarnation: Option<EventId>,
    cycle: u64,
}

impl WorkManifest {
    /// Identifies the work.
    ///
    /// An apply is identified by its whole manifest. A restore or reconcile is identified by its
    /// integration, owner and kind, using only the IDs of the states it names. Its effects, and a
    /// restore's `failed_run_id`, are not part of the ID, so planning the effects again after a
    /// crash keeps it.
    #[must_use]
    pub fn id(&self) -> WorkId {
        let Self::V1(work) = self;
        WorkId(match &work.kind {
            WorkKind::Apply { .. } => content_digest("apply:v1", self),
            WorkKind::Restore {
                failed_work_id,
                target,
                contaminated,
                ..
            } => content_digest(
                "restore:v1",
                &RestoreIdentity {
                    web: work.web,
                    connector: &work.connector,
                    owner: work.owner,
                    failed_work_id: *failed_work_id,
                    target: target.as_ref().map(|target| target.id),
                    contaminated: contaminated.id,
                },
            ),
            WorkKind::Reconcile {
                target,
                applied_incarnation,
                cycle,
            } => content_digest(
                "reconcile:v1",
                &ReconcileIdentity {
                    web: work.web,
                    connector: &work.connector,
                    owner: work.owner,
                    target: target.id,
                    applied_incarnation: *applied_incarnation,
                    cycle: *cycle,
                },
            ),
        })
    }

    /// Decodes the stored work manifest identified by `id`.
    ///
    /// # Errors
    ///
    /// Returns [`RecordError::Decode`] if the bytes are too large or not a work manifest, or
    /// [`RecordError::Mismatch`] if they are a work manifest other than `id`.
    pub fn decode(bytes: &[u8], id: WorkId) -> Result<Self, Report<RecordError>> {
        let manifest: Self = super::decode(bytes)?;
        if manifest.id() != id {
            return Err(Report::new(RecordError::Mismatch));
        }
        Ok(manifest)
    }
}
