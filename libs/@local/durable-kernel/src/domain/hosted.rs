use alloc::collections::BTreeMap;
use core::{fmt, marker::PhantomData};
use std::io::Write;

use error_stack::{Report, ResultExt as _};
use tokio::sync::oneshot;

use super::{
    EventRecord, EventRecordV1, Fold, FoldError, HostedQuery, PartitionKey, ProjectionQuery,
    ProjectionSnapshot, RecoveryError, SimpleDomain,
};
use crate::{
    ids::{EventId, JournalRecordDigest},
    port::{EventDomain, Prepared, QueryDomain},
    registry::{
        CompatError, DeclarationError, DurableRecord as _, RecordRegistry, VersionedRecord as _,
    },
    routing::Shard,
    sequence::JournalSequence,
    shard_log::{ShardCommandError, ShardCommandHandle},
};

/// Application state together with processed event IDs and journal sequences.
///
/// The kernel uses these fields to detect duplicates and check that recovery preserves
/// acknowledged events.
#[derive(Debug, Clone, Default)]
pub struct KernelProjection<P> {
    seen: BTreeMap<EventId, JournalRecordDigest>,
    partitions: BTreeMap<PartitionKey, JournalSequence>,
    through_sequence: Option<JournalSequence>,
    domain: P,
}

impl<P> KernelProjection<P> {
    pub const fn domain(&self) -> &P {
        &self.domain
    }

    pub const fn through_sequence(&self) -> Option<JournalSequence> {
        self.through_sequence
    }

    pub fn partition_sequence(&self, key: &PartitionKey) -> Option<JournalSequence> {
        self.partitions.get(key).copied()
    }

    pub(super) const fn seen(&self) -> &BTreeMap<EventId, JournalRecordDigest> {
        &self.seen
    }

    pub(super) const fn partitions(&self) -> &BTreeMap<PartitionKey, JournalSequence> {
        &self.partitions
    }

    pub(super) const fn restored(
        seen: BTreeMap<EventId, JournalRecordDigest>,
        partitions: BTreeMap<PartitionKey, JournalSequence>,
        through_sequence: JournalSequence,
        domain: P,
    ) -> Self {
        Self {
            seen,
            partitions,
            through_sequence: Some(through_sequence),
            domain,
        }
    }
}

/// Adapts [`SimpleDomain`] to the [`crate::port`] traits used by the command loop: events,
/// queries, and snapshots.
pub struct Hosted<S>(PhantomData<fn() -> S>);

impl<S> fmt::Debug for Hosted<S> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Hosted")
    }
}

impl<S> Clone for Hosted<S> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<S> Copy for Hosted<S> {}

/// Registers the application’s event and snapshot record names before the first append.
///
/// # Errors
///
/// Returns an error if a record name conflicts with an existing declaration or a declaration is
/// invalid.
pub fn register<S: SimpleDomain>(
    registry: &RecordRegistry,
) -> Result<(), Report<DeclarationError>> {
    registry.register(EventRecord::<S::Event>::declaration())?;
    registry.register(ProjectionSnapshot::<S>::declaration())?;
    Ok(())
}

/// A validated application change and the metadata recorded after a durable append.
pub struct PreparedEvent<S: SimpleDomain> {
    event_id: EventId,
    partition: PartitionKey,
    digest: JournalRecordDigest,
    change: <S::Projection as Fold<S::Event>>::Validated,
}

impl<S: SimpleDomain> EventDomain for Hosted<S> {
    type Delta = PreparedEvent<S>;
    type FoldError = FoldError<<S::Projection as Fold<S::Event>>::Error>;
    type Projection = KernelProjection<S::Projection>;
    type Record = EventRecord<S::Event>;
    type RecordCurrent = EventRecordV1<S::Event>;
    type RecoveryError = RecoveryError;
    type StateKey = PartitionKey;
    type WorkIntent = !;

    fn empty_projection() -> Self::Projection {
        KernelProjection {
            seen: BTreeMap::new(),
            partitions: BTreeMap::new(),
            through_sequence: None,
            domain: S::empty_projection(),
        }
    }

    fn record_shard(record: &Self::RecordCurrent) -> Shard {
        record.partition().shard()
    }

    fn reject_foreign_shard(record: &Self::RecordCurrent) -> Self::FoldError {
        FoldError::ForeignShard {
            event_id: record.event_id(),
            partition: record.partition().clone(),
        }
    }

    fn record_event_id(record: &Self::RecordCurrent) -> EventId {
        record.event_id()
    }

    fn record_state_key(record: &Self::RecordCurrent) -> PartitionKey {
        record.partition().clone()
    }

    fn encode_record<W: Write>(
        record: &Self::RecordCurrent,
        writer: W,
    ) -> Result<(), Report<CompatError>> {
        record.encode(writer)
    }

    fn prepare(
        projection: &Self::Projection,
        record: &Self::RecordCurrent,
    ) -> Result<Prepared<Self::Delta>, Self::FoldError> {
        let digest = record.digest()?;
        if let Some(seen) = projection.seen.get(&record.event_id()) {
            return if *seen == digest {
                Ok(Prepared::Noop)
            } else {
                Err(FoldError::ConflictingReuse {
                    event_id: record.event_id(),
                })
            };
        }
        let change = projection
            .domain
            .validate(record.event())
            .map_err(|rejection| FoldError::Rejected {
                event_id: record.event_id(),
                rejection,
            })?;
        Ok(Prepared::Mutation(PreparedEvent {
            event_id: record.event_id(),
            partition: record.partition().clone(),
            digest,
            change,
        }))
    }

    fn finalize(
        projection: &mut Self::Projection,
        delta: Self::Delta,
        shard_sequence: JournalSequence,
    ) -> Result<(), Self::FoldError> {
        let PreparedEvent {
            event_id,
            partition,
            digest,
            change,
        } = delta;
        if let Some(previous) = projection.through_sequence
            && shard_sequence <= previous
        {
            return Err(FoldError::NonIncreasingSequence {
                previous,
                proposed: shard_sequence,
            });
        }
        projection.seen.insert(event_id, digest);
        projection.partitions.insert(partition, shard_sequence);
        projection.through_sequence = Some(shard_sequence);
        projection.domain.apply(change);
        Ok(())
    }

    fn state_sequence(
        projection: &Self::Projection,
        key: &PartitionKey,
    ) -> Option<JournalSequence> {
        projection.partitions.get(key).copied()
    }

    fn through_sequence(projection: &Self::Projection) -> Option<JournalSequence> {
        projection.through_sequence
    }

    fn replay(
        projection: &mut Self::Projection,
        shard: Shard,
        sequence: JournalSequence,
        record: Self::Record,
    ) -> Result<(), Report<RecoveryError>> {
        let record = record
            .normalize()
            .change_context(RecoveryError::InvalidRecord { sequence })?;
        let record_shard = record.partition().shard();
        if record_shard != shard {
            return Err(Report::new(RecoveryError::ForeignShard {
                sequence,
                expected: shard,
                actual: record_shard,
            }));
        }
        if let Some(previous) = projection.through_sequence
            && sequence <= previous
        {
            return Err(Report::new(RecoveryError::NonIncreasingSequence {
                previous,
                proposed: sequence,
            }));
        }
        let digest = record
            .digest()
            .change_context(RecoveryError::InvalidRecord { sequence })?;
        match projection.seen.get(&record.event_id()) {
            // A lost acknowledgement can leave duplicate records in the journal.
            Some(seen) if *seen == digest => {
                projection.through_sequence = Some(sequence);
                Ok(())
            }
            Some(_seen) => Err(Report::new(RecoveryError::ConflictingReuse {
                event_id: record.event_id(),
                sequence,
            })),
            None => {
                projection.seen.insert(record.event_id(), digest);
                projection
                    .partitions
                    .insert(record.partition().clone(), sequence);
                projection.through_sequence = Some(sequence);
                projection.domain.replay(record.event());
                Ok(())
            }
        }
    }

    fn live_work(_projection: &Self::Projection) -> impl IntoIterator<Item = !> {
        core::iter::empty()
    }

    fn initial_state_keys(projection: &Self::Projection) -> impl IntoIterator<Item = PartitionKey> {
        projection.partitions.keys().cloned()
    }
}

impl<S: SimpleDomain> QueryDomain for Hosted<S> {
    type Query = HostedQuery<S::Projection>;
    type QueryResult = ();

    fn answer(projection: &Self::Projection, query: Self::Query) -> Self::QueryResult {
        query.answer(projection);
    }
}

impl<S: SimpleDomain> ShardCommandHandle<Hosted<S>> {
    /// Runs a closure against the shard’s state inside the command loop. The closure must not
    /// block.
    ///
    /// # Errors
    ///
    /// Returns an error if the loop closes before returning the result.
    pub async fn read<R, F>(&self, read: F) -> Result<R, Report<ShardCommandError>>
    where
        R: Send + 'static,
        F: for<'a> FnOnce(&'a KernelProjection<S::Projection>) -> R + Send + 'static,
    {
        self.read_query(read).await
    }

    /// Reads the shard’s state with `query`.
    ///
    /// The query runs inside the command loop and must not block.
    ///
    /// # Errors
    ///
    /// Returns an error if the loop closes before returning the result.
    pub async fn read_query<Q>(&self, query: Q) -> Result<Q::Output, Report<ShardCommandError>>
    where
        Q: ProjectionQuery<KernelProjection<S::Projection>> + 'static,
        Q::Output: 'static,
    {
        let (reply, response) = oneshot::channel();
        self.query(HostedQuery::new(query, reply)).await?;
        response
            .await
            .change_context(ShardCommandError::ReplyDropped {
                command: crate::shard_log::ShardCommandKind::Query,
            })
    }
}
