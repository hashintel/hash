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

/// Kernel-owned outcome of `Domain::prepare`.
///
/// The event is either already reflected in the projection as an idempotent duplicate or carries a
/// mutation that is finalized after the append becomes durable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Prepared<T> {
    Noop,
    Mutation(T),
}

/// Recovery telemetry handed to `Domain::note_snapshot_recovery` after a
/// shard's startup or ambiguity replay completes with snapshots enabled.
#[derive(Debug, Clone)]
pub struct SnapshotRecoveryStats {
    pub replayed_events: u64,
    pub replay_elapsed: core::time::Duration,
    pub corruption_fallbacks: u64,
    pub latest_snapshot_created_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub trait Domain: Send + Sync + 'static {
    /// Journal wire codec expressed as the full versioned enum that covers
    /// every supported version.
    type Record: UntrimmedJournalRecord + Send + Sync;
    /// Verified current-version record that producers propose, the loop
    /// appends, and the fold consumes.
    type RecordCurrent: Clone + Send;
    /// Pure fold state. `Default` is the empty pre-history projection.
    type Projection: Default + Send + Sync;
    /// Prepared mutation between `prepare` and `finalize`.
    type Delta: Send;
    /// Fold rejection whose `Display` output becomes the candidate-rejection
    /// message, so implementations must keep it self-contained.
    type FoldError: core::fmt::Display + Send;
    /// Key of the domain's state-change signal for the aggregate whose
    /// checkpoint state advanced.
    type StateKey: Clone + Send + core::fmt::Debug;
    type Query: Send;
    type QueryResult: Send;
    type ControlRequest: Send;
    /// Pre-append view of a control request against the projection.
    type ControlSnapshot: Send;
    type ControlOutcome: Clone + Send + core::fmt::Debug + PartialEq + Eq;
    /// Reason a caller-side preflight already rejected a control request.
    type ControlRejection: Send;
    /// Committed projection snapshot record that bounds replay. It is appended
    /// to the shard log through the same registered-record discipline as events.
    type Snapshot: DurableRecord + Send + Sync;
    /// In-memory capture handed to the out-of-loop snapshot publisher.
    type SnapshotCapture: Send;
    /// Domain-owned context for materializing snapshot payloads during recovery, for example an
    /// artifact store when snapshot payloads are indirected.
    ///
    /// A domain whose snapshots are self-contained uses `()`.
    type SnapshotContext: Clone + Send + Sync + 'static;
    /// Recovered live-work descriptor reported to the scheduler at startup.
    type WorkIntent: Clone + Send + core::fmt::Debug + PartialEq + Eq;

    fn record_shard(record: &Self::RecordCurrent) -> Shard;
    /// The fold error rejecting a record proposed to the wrong shard.
    fn reject_foreign_shard(record: &Self::RecordCurrent) -> Self::FoldError;
    fn record_event_id(record: &Self::RecordCurrent) -> EventId;
    fn record_state_key(record: &Self::RecordCurrent) -> Self::StateKey;
    fn wire(record: Self::RecordCurrent) -> Self::Record;
    /// # Errors
    ///
    /// Returns a fold error when the proposed record violates domain invariants.
    fn prepare(
        projection: &Self::Projection,
        record: &Self::RecordCurrent,
    ) -> Result<Prepared<Self::Delta>, Self::FoldError>;
    /// Applies a prepared mutation at its durable sequence. Only called for
    /// `Prepared::Mutation`. Duplicates return before the append.
    ///
    /// # Errors
    ///
    /// Returns a fold error when the durable mutation cannot be applied.
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
    /// Promotes a not-yet-resolved control request into the journal record
    /// that durably resolves its acceptance or rejection.
    ///
    /// # Errors
    ///
    /// Returns a fold error when the control request cannot become a valid journal record.
    fn promote_control(
        projection: &Self::Projection,
        request: &Self::ControlRequest,
        preflight_rejection: Option<Self::ControlRejection>,
    ) -> Result<Self::RecordCurrent, Self::FoldError>;
    /// Reads back the outcome the fold recorded for `request` and verifies it
    /// binds this exact request. `Err` is a recovery-grade inconsistency.
    ///
    /// # Errors
    ///
    /// Returns an error when the recorded outcome is missing or belongs to another request.
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
    /// Materializes the projection a snapshot references. `Err` falls back
    /// to an older snapshot or full replay and never fails recovery.
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
    /// Validates and folds one scanned record during startup or ambiguity
    /// recovery. `Err` is recovery-fatal for the shard.
    ///
    /// # Errors
    ///
    /// Returns an error when a journal record is invalid or cannot be folded at its sequence.
    fn replay(
        projection: &mut Self::Projection,
        shard: Shard,
        sequence: u64,
        record: Self::Record,
    ) -> Result<(), String>;
    /// Proves a freshly recovered prefix extends what this process already
    /// acknowledged without a sequence regression or a lost or changed event.
    ///
    /// # Errors
    ///
    /// Returns an error when recovery loses or changes an acknowledged event, or regresses its
    /// sequence.
    fn validate_recovered_prefix(
        previous: &Self::Projection,
        recovered: &Self::Projection,
    ) -> Result<(), String>;
    /// Planned or blocked live work that the scheduler must resume.
    fn live_work(projection: &Self::Projection) -> Vec<Self::WorkIntent>;
    /// Keys whose state-change signal should fire once at startup.
    fn initial_state_keys(projection: &Self::Projection) -> Vec<Self::StateKey>;
}
