//! Defines how the command loop reads and updates a domain's state.
//!
//! The loop serializes appends, assigns sequences, and recovers when an append's
//! outcome is uncertain. The domain supplies record encoding, validation, and
//! state updates through [`Domain`]. A prepared mutation changes the projection
//! only after its record is durable.

use crate::{
    ids::EventId,
    registry::{DurableRecord, UntrimmedJournalRecord},
    routing::Shard,
    shard_log::ShardCommandError,
};

/// The result of [`Domain::prepare`]. A duplicate leaves state unchanged; a mutation is applied
/// after the record becomes durable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Prepared<T> {
    Noop,
    Mutation(T),
}

/// Reports snapshot use and replay progress to [`Domain::note_snapshot_recovery`].
#[derive(Debug, Clone)]
pub struct SnapshotRecoveryStats {
    pub replayed_events: u64,
    pub replay_elapsed: core::time::Duration,
    pub corruption_fallbacks: u64,
    pub latest_snapshot_created_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub trait Domain: Send + Sync + 'static {
    /// The wire format, including every supported record version.
    type Record: UntrimmedJournalRecord + Send + Sync;
    /// The validated record type used for new submissions and state updates.
    type RecordCurrent: Clone + Send;
    /// Application state. [`Default`] must represent an empty journal.
    type Projection: Default + Send + Sync;
    /// Prepared mutation between `prepare` and `finalize`.
    type Delta: Send;
    /// An error from validating or applying a record. Proposal validation returns this value
    /// unchanged in [`crate::shard_log::ShardCommandOutcome::Rejected`].
    type FoldError: core::fmt::Display + Send;
    /// Identifies the state that changed, for notifications after an append.
    type StateKey: Clone + Send + core::fmt::Debug;
    type Query: Send;
    type QueryResult: Send;
    type ControlRequest: Send;
    /// Pre-append view of a control request against the projection.
    type ControlSnapshot: Send;
    type ControlOutcome: Clone + Send + core::fmt::Debug + PartialEq + Eq;
    /// A rejection found before submitting the control request.
    type ControlRejection: Send;
    /// A snapshot stored through the same record registry and shard log as events.
    type Snapshot: DurableRecord + Send + Sync;
    /// State captured inside the command loop for a snapshot publisher to store.
    type SnapshotCapture: Send;
    /// Resources needed to load snapshot data, such as an artifact store. Use `()` when
    /// snapshots contain all their data.
    type SnapshotContext: Clone + Send + Sync + 'static;
    /// Work to resume after recovery.
    type WorkIntent: Clone + Send + core::fmt::Debug + PartialEq + Eq;

    fn record_shard(record: &Self::RecordCurrent) -> Shard;
    /// Builds the error for a record submitted to the wrong shard.
    fn reject_foreign_shard(record: &Self::RecordCurrent) -> Self::FoldError;
    fn record_event_id(record: &Self::RecordCurrent) -> EventId;
    fn record_state_key(record: &Self::RecordCurrent) -> Self::StateKey;
    fn wire(record: Self::RecordCurrent) -> Self::Record;
    /// # Errors
    ///
    /// Returns an error if the proposed record violates the domain’s validation rules.
    fn prepare(
        projection: &Self::Projection,
        record: &Self::RecordCurrent,
    ) -> Result<Prepared<Self::Delta>, Self::FoldError>;
    /// Applies a mutation at its durable sequence. Called after [`Prepared::Mutation`];
    /// duplicates are skipped before append.
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

    fn answer(projection: &Self::Projection, query: Self::Query) -> Self::QueryResult;

    fn control_shard(request: &Self::ControlRequest) -> Shard;
    /// Rejection message for a control request proposed to the wrong shard.
    fn describe_foreign_control(request: &Self::ControlRequest) -> String;
    /// # Errors
    ///
    /// Returns an error when the control request cannot be inspected against the projection.
    fn inspect_control(
        projection: &Self::Projection,
        request: &Self::ControlRequest,
    ) -> Result<Self::ControlSnapshot, ShardCommandError>;
    fn control_prior_outcome(snapshot: &Self::ControlSnapshot) -> Option<Self::ControlOutcome>;
    /// Deterministic event identity a duplicate control resolution reports.
    fn control_event_id(request: &Self::ControlRequest) -> EventId;
    /// Builds the journal record that accepts or rejects a pending control request.
    ///
    /// # Errors
    ///
    /// Returns an error if the request cannot be converted to a valid record.
    fn promote_control(
        projection: &Self::Projection,
        request: &Self::ControlRequest,
        preflight_rejection: Option<Self::ControlRejection>,
    ) -> Result<Self::RecordCurrent, Self::FoldError>;
    /// Reads the stored outcome for this control request.
    ///
    /// # Errors
    ///
    /// Returns an error if the outcome is missing or belongs to a different request. The loop
    /// treats this as a recovery failure.
    fn control_outcome_after_append(
        projection: &Self::Projection,
        request: &Self::ControlRequest,
    ) -> Result<Self::ControlOutcome, String>;

    fn capture_snapshot(
        shard: Shard,
        projection: &Self::Projection,
    ) -> Option<Self::SnapshotCapture>;
    /// Validates a committed snapshot's addressing and returns
    /// `(shard, through_log_sequence)`. An error rejects the candidate.
    ///
    /// # Errors
    ///
    /// Returns an error when the snapshot addressing or sequence bounds are invalid.
    fn snapshot_bounds(snapshot: &Self::Snapshot) -> Result<(Shard, u64), String>;
    /// Audit timestamp recorded in the snapshot, for recovery telemetry.
    fn snapshot_created_at(snapshot: &Self::Snapshot) -> String;
    /// Loads state from a snapshot. An error makes recovery try an older snapshot, then the
    /// full journal.
    fn load_snapshot_projection(
        context: &Self::SnapshotContext,
        shard: Shard,
        snapshot: &Self::Snapshot,
    ) -> impl core::future::Future<Output = Result<Self::Projection, String>> + Send;

    /// Observes one completed snapshot-enabled recovery.
    fn note_snapshot_recovery(_context: &Self::SnapshotContext, _stats: &SnapshotRecoveryStats) {}
    /// Observes the loop stopping because its writer was fenced.
    fn note_fenced(_context: &Self::SnapshotContext) {}

    /// The projection's inclusive durable high-water mark.
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
    ) -> Result<(), String>;
    /// Checks that recovered state preserves all acknowledged events.
    ///
    /// # Errors
    ///
    /// Returns an error if recovery loses or changes an acknowledged event, or moves the
    /// sequence backwards.
    fn validate_recovered_prefix(
        previous: &Self::Projection,
        recovered: &Self::Projection,
    ) -> Result<(), String>;
    /// Planned or blocked live work that the scheduler must resume.
    fn live_work(projection: &Self::Projection) -> Vec<Self::WorkIntent>;
    /// Keys whose state-change signal should fire once at startup.
    fn initial_state_keys(projection: &Self::Projection) -> Vec<Self::StateKey>;
}
