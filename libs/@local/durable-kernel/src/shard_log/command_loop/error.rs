use crate::{
    ids::EventId, routing::Shard, sequence::JournalSequence, shard_log::AppendFailureKind,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display)]
pub enum ShardCommandErrorKind {
    #[display("invalid command")]
    InvalidCandidate,
    #[display("record was not committed")]
    DefinitelyNotCommitted,
    #[display("record commit status is unknown")]
    CommitUnknown,
    #[display("a replacement writer owns the journal")]
    Fenced,
    #[display("shard recovery failed")]
    Recovery,
    #[display("shard command loop is closed")]
    Closed,
}

impl ShardCommandErrorKind {
    pub(super) const fn is_terminal(self) -> bool {
        matches!(self, Self::CommitUnknown | Self::Fenced | Self::Recovery)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display)]
pub enum ShardCommandKind {
    #[display("proposal")]
    Propose,
    #[display("control read")]
    InspectControl,
    #[display("control request")]
    ResolveControl,
    #[display("snapshot capture")]
    CaptureSnapshot,
    #[display("snapshot commit")]
    CommitSnapshot,
    #[display("query")]
    Query,
    #[display("shutdown")]
    Shutdown,
}

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum ShardCommandError {
    #[display("could not append event {event_id}: {kind}")]
    AppendEvent {
        event_id: EventId,
        kind: AppendFailureKind,
    },
    #[display("could not append snapshot through sequence {through_sequence}: {kind}")]
    AppendSnapshot {
        through_sequence: JournalSequence,
        kind: AppendFailureKind,
    },
    #[display("shard command loop stopped before replying to {command}")]
    ReplyDropped { command: ShardCommandKind },
    #[display("shard command loop is not accepting {command}")]
    AdmissionClosed { command: ShardCommandKind },
    #[display("shard command loop closed before accepting {command}")]
    QueueClosed { command: ShardCommandKind },
    #[display("shard command loop is already stopping")]
    AlreadyStopping,
    #[display("shard command loop is shutting down")]
    ShuttingDown,
    #[display("could not open shard writer")]
    OpenWriter,
    #[display("shard writer is unavailable")]
    WriterUnavailable,
    #[display("could not register record {name}")]
    RegisterRecord { name: &'static str },
    #[display("could not close writer after startup failure")]
    CloseStartupWriter,
    #[display("could not recover shard during startup")]
    RecoverStartup,
    #[display("could not recover shard after event {event_id} failed")]
    RecoverAfterFailure { event_id: EventId },
    #[display("could not close writer before recovery")]
    CloseUnrecoveredWriter,
    #[display("could not close recovered writer before enabling commands")]
    CloseRecoveredWriter,
    #[display("shard ownership was lost")]
    OwnershipLost,
    #[display("shard ownership was lost before appending an event")]
    OwnershipLostBeforeAppend,
    #[display("shard ownership was lost before appending a snapshot")]
    OwnershipLostBeforeSnapshot,
    #[display("control request for shard {} was proposed to shard {}", actual.get(), expected.get())]
    ControlShardMismatch { expected: Shard, actual: Shard },
    #[display("could not inspect control request")]
    InspectControl,
    #[display("could not build control record for event {event_id}")]
    BuildControlRecord { event_id: EventId },
    #[display("control record for event {event_id} was rejected")]
    ControlRecordRejected { event_id: EventId },
    #[display("could not read stored control outcome for event {event_id}")]
    ReadControlOutcome { event_id: EventId },
    #[display("could not apply durable event {event_id} at sequence {sequence}")]
    FinalizeRecord {
        event_id: EventId,
        sequence: JournalSequence,
    },
    #[display("acknowledged event {event_id} is absent after recovery")]
    MissingRecoveredEvent { event_id: EventId },
    #[display("acknowledged event {event_id} conflicts after recovery")]
    ConflictingRecoveredEvent { event_id: EventId },
    #[display("could not read snapshot bounds")]
    ReadSnapshotBounds,
    #[display("projection snapshot for shard {:03x} was proposed to shard {:03x}", actual.get(), expected.get())]
    SnapshotShardMismatch { expected: Shard, actual: Shard },
    #[display("cannot reference a snapshot for an empty projection")]
    SnapshotForEmptyProjection,
    #[display(
        "projection snapshot through journal sequence {snapshot_through} is ahead of the \
         projection at {current_sequence}"
    )]
    SnapshotAheadOfProjection {
        snapshot_through: JournalSequence,
        current_sequence: JournalSequence,
    },
    #[display("could not validate snapshot registration for {name}")]
    ValidateSnapshotRegistration { name: &'static str },
    #[display("could not encode projection snapshot")]
    EncodeSnapshot,
    #[display("recovering event {event_id} requires acquiring a new lease")]
    LeaseRequired { event_id: EventId },
    #[display("could not reopen shard writer")]
    ReopenWriter,
    #[display("recovered journal prefix is invalid")]
    ValidateRecoveredPrefix,
    #[display("could not close shard writer")]
    CloseWriter,
    #[display("could not read stored journal events")]
    ReadJournal,
    #[display("could not replay stored event at sequence {sequence}")]
    ReplayRecord { sequence: JournalSequence },
}

impl ShardCommandError {
    #[must_use]
    pub const fn kind(&self) -> ShardCommandErrorKind {
        match self {
            Self::AppendEvent { kind, .. } | Self::AppendSnapshot { kind, .. } => match kind {
                AppendFailureKind::DefinitelyNotCommitted => {
                    ShardCommandErrorKind::DefinitelyNotCommitted
                }
                AppendFailureKind::CommitUnknown => ShardCommandErrorKind::CommitUnknown,
                AppendFailureKind::Fenced => ShardCommandErrorKind::Fenced,
            },
            Self::LeaseRequired { .. } => ShardCommandErrorKind::CommitUnknown,
            Self::OwnershipLost
            | Self::OwnershipLostBeforeAppend
            | Self::OwnershipLostBeforeSnapshot => ShardCommandErrorKind::Fenced,
            Self::ReplyDropped { .. }
            | Self::AdmissionClosed { .. }
            | Self::QueueClosed { .. }
            | Self::AlreadyStopping
            | Self::ShuttingDown => ShardCommandErrorKind::Closed,
            Self::ControlShardMismatch { .. }
            | Self::InspectControl
            | Self::BuildControlRecord { .. }
            | Self::ControlRecordRejected { .. }
            | Self::SnapshotShardMismatch { .. }
            | Self::SnapshotForEmptyProjection
            | Self::SnapshotAheadOfProjection { .. }
            | Self::EncodeSnapshot => ShardCommandErrorKind::InvalidCandidate,
            Self::OpenWriter
            | Self::WriterUnavailable
            | Self::RegisterRecord { .. }
            | Self::CloseStartupWriter
            | Self::RecoverStartup
            | Self::RecoverAfterFailure { .. }
            | Self::CloseUnrecoveredWriter
            | Self::CloseRecoveredWriter
            | Self::ReadControlOutcome { .. }
            | Self::FinalizeRecord { .. }
            | Self::MissingRecoveredEvent { .. }
            | Self::ConflictingRecoveredEvent { .. }
            | Self::ReadSnapshotBounds
            | Self::ValidateSnapshotRegistration { .. }
            | Self::ReopenWriter
            | Self::ValidateRecoveredPrefix
            | Self::CloseWriter
            | Self::ReadJournal
            | Self::ReplayRecord { .. } => ShardCommandErrorKind::Recovery,
        }
    }
}

/// Marks a command that was still queued when the command loop stopped. The report's current
/// context is the error that stopped the loop.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display)]
#[display("command was queued when the command loop stopped")]
pub struct QueuedWhenStopped;
