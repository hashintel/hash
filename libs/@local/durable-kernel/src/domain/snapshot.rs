use alloc::collections::BTreeMap;
use std::io::Write;

use chrono::{DateTime, Utc};
use error_stack::Report;
use serde::{Deserialize, Serialize};

use super::{
    Hosted, KernelProjection, PartitionKey, RecoveryError, SimpleDomain,
    record::{decode_v1_envelope, encode_json},
};
use crate::{
    ids::{EventId, JournalRecordDigest},
    port::SnapshotDomain,
    registry::{CompatError, DurabilityClass, DurableRecord, MigrationPolicy, RecordDeclaration},
    routing::Shard,
    sequence::JournalSequence,
};

pub(super) const MAX_SNAPSHOT_BYTES: usize = 15 * 1024 * 1024;

/// Metadata shared by application snapshot declarations.
pub(super) const DOMAIN_SNAPSHOT_DECLARATION: RecordDeclaration = RecordDeclaration {
    name: "domain_projection_snapshot",
    codec: core::any::TypeId::of::<()>(),
    owning_module: "kernel::domain",
    emitted_version: 1,
    supported_versions: &[1],
    algorithm_versions: &[],
    durability: DurabilityClass::ImmutableJournal,
    migration: MigrationPolicy::NeverRetireWhileUntrimmed,
};

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, bound = "")]
pub struct ProjectionSnapshotV1<S: SimpleDomain> {
    shard: Shard,
    through_sequence: JournalSequence,
    created_at: DateTime<Utc>,
    seen: BTreeMap<EventId, JournalRecordDigest>,
    partitions: BTreeMap<PartitionKey, JournalSequence>,
    domain: S::Projection,
}

/// Stores application state and the journal sequence it includes.
///
/// The state is stored inline, up to `MAX_SNAPSHOT_BYTES`. Larger states skip snapshotting.
/// Recovery uses an earlier snapshot or replays the full journal.
#[derive(Serialize)]
#[serde(
    tag = "version",
    content = "data",
    rename_all = "snake_case",
    bound = ""
)]
pub enum ProjectionSnapshot<S: SimpleDomain> {
    V1(ProjectionSnapshotV1<S>),
}

/// State captured by the command loop for a snapshot. The effect driver adds the timestamp
/// outside the command loop.
pub struct ProjectionSnapshotPayload<S: SimpleDomain> {
    shard: Shard,
    through_sequence: JournalSequence,
    seen: BTreeMap<EventId, JournalRecordDigest>,
    partitions: BTreeMap<PartitionKey, JournalSequence>,
    domain: S::Projection,
}

impl<S: SimpleDomain> ProjectionSnapshotPayload<S> {
    pub fn into_record(self, created_at: DateTime<Utc>) -> ProjectionSnapshot<S> {
        ProjectionSnapshot::V1(ProjectionSnapshotV1 {
            shard: self.shard,
            through_sequence: self.through_sequence,
            created_at,
            seen: self.seen,
            partitions: self.partitions,
            domain: self.domain,
        })
    }
}

impl RecordDeclaration {
    fn for_snapshot<S: SimpleDomain>() -> Self {
        Self {
            name: core::any::type_name::<ProjectionSnapshot<S>>(),
            codec: core::any::TypeId::of::<S::Projection>(),
            ..DOMAIN_SNAPSHOT_DECLARATION
        }
    }
}

impl<S: SimpleDomain> DurableRecord for ProjectionSnapshot<S> {
    const MIGRATION_POLICY: MigrationPolicy = MigrationPolicy::NeverRetireWhileUntrimmed;

    fn declaration() -> RecordDeclaration {
        RecordDeclaration::for_snapshot::<S>()
    }

    fn encode<W: Write>(&self, writer: W) -> Result<(), Report<CompatError>> {
        encode_json(
            self,
            writer,
            DOMAIN_SNAPSHOT_DECLARATION.name,
            MAX_SNAPSHOT_BYTES,
        )
    }

    fn decode(bytes: &[u8]) -> Result<Self, Report<CompatError>> {
        decode_v1_envelope(bytes, DOMAIN_SNAPSHOT_DECLARATION.name, MAX_SNAPSHOT_BYTES)
            .map(Self::V1)
    }
}

impl<S: SimpleDomain> SnapshotDomain for Hosted<S> {
    type Snapshot = ProjectionSnapshot<S>;
    type SnapshotCapture = ProjectionSnapshotPayload<S>;
    type SnapshotContext = ();

    fn capture_snapshot(
        shard: Shard,
        projection: &Self::Projection,
    ) -> Option<ProjectionSnapshotPayload<S>> {
        let through_sequence = projection.through_sequence()?;
        Some(ProjectionSnapshotPayload {
            shard,
            through_sequence,
            seen: projection.seen().clone(),
            partitions: projection.partitions().clone(),
            domain: projection.domain().clone(),
        })
    }

    fn snapshot_bounds(
        snapshot: &ProjectionSnapshot<S>,
    ) -> Result<(Shard, JournalSequence), Report<RecoveryError>> {
        let ProjectionSnapshot::V1(record) = snapshot;
        let shard = record.shard;
        Ok((shard, record.through_sequence))
    }

    fn snapshot_created_at(snapshot: &ProjectionSnapshot<S>) -> DateTime<Utc> {
        let ProjectionSnapshot::V1(record) = snapshot;
        record.created_at
    }

    #[expect(
        clippy::unused_async_trait_impl,
        reason = "snapshot validation runs when the trait future is polled"
    )]
    async fn load_snapshot_projection(
        _context: &(),
        shard: Shard,
        snapshot: &ProjectionSnapshot<S>,
    ) -> Result<Self::Projection, Report<RecoveryError>> {
        let ProjectionSnapshot::V1(record) = snapshot;
        let snapshot_shard = record.shard;
        if snapshot_shard != shard {
            return Err(Report::new(RecoveryError::SnapshotShardMismatch {
                expected: shard,
                actual: snapshot_shard,
            }));
        }
        Ok(KernelProjection::restored(
            record.seen.clone(),
            record.partitions.clone(),
            record.through_sequence,
            record.domain.clone(),
        ))
    }
}
