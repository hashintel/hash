//! Defines how the command loop reads and updates a domain's state.
//!
//! The loop serializes appends, assigns journal sequences, and recovers when an append is
//! commit-unknown. The domain supplies record encoding, validation, and
//! state updates through [`Domain`]. A prepared mutation changes the projection
//! only after its record is durable.
//!
//! [`EventDomain`] defines event handling. [`QueryDomain`], [`ControlDomain`], and
//! [`SnapshotDomain`] add reads, control requests, and snapshot recovery. Implement all four
//! to use [`crate::shard_log::OpenedShard`] for custom runtimes. Application code
//! can instead implement [`crate::domain::SimpleDomain`], which supplies this adapter.

use std::io::Write;

use chrono::{DateTime, Utc};
use error_stack::Report;

use crate::{
    ids::EventId,
    registry::{CompatError, DurableRecord, UntrimmedJournalRecord},
    routing::Shard,
    shard_log::ShardCommandError,
};

/// The result of [`EventDomain::prepare`]. A duplicate leaves state unchanged. A mutation is
/// applied after the record becomes durable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Prepared<T> {
    Noop,
    Mutation(T),
}

/// Reports snapshot use and replay progress to [`SnapshotDomain::note_snapshot_recovery`].
#[derive(Debug, Clone)]
pub struct SnapshotRecoveryStats {
    pub replayed_events: u64,
    pub replay_elapsed: core::time::Duration,
    pub corruption_fallbacks: u64,
    pub latest_snapshot_created_at: Option<DateTime<Utc>>,
}

/// Defines record validation, state updates, and journal replay for one shard.
///
/// [`prepare`](Self::prepare) must leave state unchanged. [`finalize`](Self::finalize) applies
/// accepted changes after storage confirms the append. [`replay`](Self::replay) rebuilds the
/// same state from stored records, and
/// [`validate_recovered_prefix`](Self::validate_recovered_prefix) checks that recovered state
/// includes all acknowledged events.
pub trait EventDomain: Send + Sync + 'static {
    /// The wire format, including every supported record version.
    type Record: UntrimmedJournalRecord + Send;
    /// The validated record type used for new submissions and state updates.
    type RecordCurrent: Send;
    /// Application state after applying the durable journal.
    type Projection: Send + Sync;
    /// The mutation that `prepare` returns and `finalize` applies.
    type Delta: Send;
    /// An error from validating or applying a record. Proposal validation returns this value
    /// unchanged in [`crate::shard_log::ShardCommandOutcome::Rejected`].
    type FoldError: core::error::Error + Send + Sync + 'static;
    /// An error from restoring or checking durable state.
    type RecoveryError: core::error::Error + Send + Sync + 'static;
    /// Identifies the state that changed, for notifications after an append.
    type StateKey: Clone + Send + core::fmt::Debug;
    /// Work to resume after recovery.
    type WorkIntent: Clone + Send + core::fmt::Debug + PartialEq + Eq;

    /// Creates the state for an empty journal.
    fn empty_projection() -> Self::Projection;

    fn record_shard(record: &Self::RecordCurrent) -> Shard;
    /// Builds the error for a record submitted to the wrong shard.
    fn reject_foreign_shard(record: &Self::RecordCurrent) -> Self::FoldError;
    fn record_event_id(record: &Self::RecordCurrent) -> EventId;
    fn record_state_key(record: &Self::RecordCurrent) -> Self::StateKey;
    /// Encodes a submission in the format decoded by [`Self::Record`].
    ///
    /// # Errors
    ///
    /// Returns an error if the record cannot be encoded or exceeds the size limit.
    fn encode_record<W: Write>(
        record: &Self::RecordCurrent,
        writer: W,
    ) -> Result<(), Report<CompatError>>;
    /// # Errors
    ///
    /// Returns an error if the proposed record violates the domain’s validation rules.
    fn prepare(
        projection: &Self::Projection,
        record: &Self::RecordCurrent,
    ) -> Result<Prepared<Self::Delta>, Self::FoldError>;
    /// Applies a mutation at its durable journal sequence. The command loop calls it after a
    /// [`Prepared::Mutation`] is appended. Duplicates are skipped before the append.
    ///
    /// # Errors
    ///
    /// Returns an error if the mutation cannot be applied.
    fn finalize(
        projection: &mut Self::Projection,
        delta: Self::Delta,
        shard_sequence: u64,
    ) -> Result<(), Self::FoldError>;

    fn state_sequence(projection: &Self::Projection, key: &Self::StateKey) -> Option<u64>;

    /// Returns the last journal sequence applied to the projection.
    fn through_sequence(projection: &Self::Projection) -> Option<u64>;
    /// Validates and applies a stored record during startup or append recovery.
    ///
    /// # Errors
    ///
    /// Returns an error if the record cannot be applied at this sequence. Recovery stops on
    /// this error.
    fn replay(
        projection: &mut Self::Projection,
        shard: Shard,
        sequence: u64,
        record: Self::Record,
    ) -> Result<(), Report<Self::RecoveryError>>;
    /// Checks that recovered state includes all acknowledged events.
    ///
    /// # Errors
    ///
    /// Returns an error if recovery loses or changes an acknowledged event, or moves the
    /// sequence backwards.
    fn validate_recovered_prefix(
        previous: &Self::Projection,
        recovered: &Self::Projection,
    ) -> Result<(), Report<Self::RecoveryError>>;
    /// Returns the planned or blocked work that the scheduler must resume.
    fn live_work(projection: &Self::Projection) -> Vec<Self::WorkIntent>;
    /// Returns the keys that receive one state-change notification at startup.
    fn initial_state_keys(projection: &Self::Projection) -> Vec<Self::StateKey>;
}

/// Reads state inside the command loop.
pub trait QueryDomain: EventDomain {
    type Query: Send;
    type QueryResult: Send;

    fn answer(projection: &Self::Projection, query: Self::Query) -> Self::QueryResult;
}

/// Resolves control requests through journal records.
pub trait ControlDomain: EventDomain {
    type ControlRequest: Send;
    /// Pre-append view of a control request against the projection.
    type ControlSnapshot: Send;
    type ControlOutcome: Clone + Send + core::fmt::Debug + PartialEq + Eq;
    /// A rejection found before submitting the control request.
    type ControlRejection: Send;

    fn control_shard(request: &Self::ControlRequest) -> Shard;
    /// Returns the rejection message for a control request proposed to the wrong shard.
    fn describe_foreign_control(request: &Self::ControlRequest) -> String;
    /// # Errors
    ///
    /// Returns an error when the control request cannot be inspected against the projection.
    fn inspect_control(
        projection: &Self::Projection,
        request: &Self::ControlRequest,
    ) -> Result<Self::ControlSnapshot, Report<ShardCommandError>>;
    fn control_prior_outcome(snapshot: &Self::ControlSnapshot) -> Option<Self::ControlOutcome>;
    /// Returns the event ID reported when the control request has already been handled.
    fn control_event_id(request: &Self::ControlRequest) -> EventId;
    /// Builds the journal record that accepts or rejects a pending control request.
    ///
    /// # Errors
    ///
    /// Returns an error if the request cannot be converted to a valid record.
    fn build_control_record(
        projection: &Self::Projection,
        request: &Self::ControlRequest,
        preflight_rejection: Option<Self::ControlRejection>,
    ) -> Result<Self::RecordCurrent, Self::FoldError>;
    /// Reads the stored outcome for this control request.
    ///
    /// # Errors
    ///
    /// Returns an error if the outcome is missing or belongs to a different request. The
    /// command loop treats this as a recovery failure.
    fn control_outcome_after_append(
        projection: &Self::Projection,
        request: &Self::ControlRequest,
    ) -> Result<Self::ControlOutcome, Report<Self::RecoveryError>>;
}

/// Captures state and loads it during recovery.
pub trait SnapshotDomain: EventDomain {
    /// A snapshot stored through the same record registry and shard log as events.
    type Snapshot: DurableRecord + Send + Sync;
    /// State captured inside the command loop for a snapshot publisher to store.
    type SnapshotCapture: Send;
    /// Resources needed to load snapshot data, such as an artifact store. Use `()` when
    /// snapshots contain all their data.
    type SnapshotContext: Clone + Send + Sync + 'static;

    fn capture_snapshot(
        shard: Shard,
        projection: &Self::Projection,
    ) -> Option<Self::SnapshotCapture>;
    /// Checks a saved snapshot’s shard and journal sequence and returns
    /// `(shard, through_log_sequence)`. An error rejects the candidate.
    ///
    /// # Errors
    ///
    /// Returns an error when the snapshot’s shard or journal sequence is invalid.
    fn snapshot_bounds(
        snapshot: &Self::Snapshot,
    ) -> Result<(Shard, u64), Report<Self::RecoveryError>>;
    /// Returns the timestamp recorded in the snapshot. Recovery reports it.
    fn snapshot_created_at(snapshot: &Self::Snapshot) -> DateTime<Utc>;
    /// Loads state from a snapshot. An error makes recovery try an older snapshot, then the
    /// full journal.
    ///
    /// # Errors
    ///
    /// Returns an error if the snapshot cannot reconstruct valid state for this shard.
    fn load_snapshot_projection(
        context: &Self::SnapshotContext,
        shard: Shard,
        snapshot: &Self::Snapshot,
    ) -> impl core::future::Future<Output = Result<Self::Projection, Report<Self::RecoveryError>>> + Send;

    /// Observes one completed snapshot-enabled recovery.
    fn note_snapshot_recovery(_context: &Self::SnapshotContext, _stats: &SnapshotRecoveryStats) {}
    /// Observes the command loop stopping because its writer was fenced.
    fn note_fenced(_context: &Self::SnapshotContext) {}
}

/// Combines the operations required by the command loop.
///
/// Implement [`EventDomain`], [`QueryDomain`], [`ControlDomain`], and [`SnapshotDomain`].
pub trait Domain: QueryDomain + ControlDomain + SnapshotDomain {}

impl<T: QueryDomain + ControlDomain + SnapshotDomain> Domain for T {}
