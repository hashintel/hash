use core::{error::Error, fmt};

use error_stack::Report;

use super::PartitionKey;
use crate::{ids::EventId, registry::CompatError, routing::Shard};

/// A rejected record or state update. Application validation reports retain their typed
/// context and attachments in [`Self::Rejected`].
#[derive(Debug)]
pub enum FoldError<R> {
    Rejected {
        event_id: EventId,
        rejection: Report<R>,
    },
    ForeignShard {
        event_id: EventId,
        partition: PartitionKey,
    },
    ConflictingReuse {
        event_id: EventId,
    },
    InvalidRecord(Report<CompatError>),
    NonIncreasingSequence {
        previous: u64,
        proposed: u64,
    },
}

impl<R: fmt::Display> fmt::Display for FoldError<R> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Rejected { event_id, .. } => write!(formatter, "event {event_id} was rejected"),
            Self::ForeignShard {
                event_id,
                partition,
            } => write!(
                formatter,
                "event {event_id} partition {partition} routes to a different shard"
            ),
            Self::ConflictingReuse { event_id } => {
                write!(
                    formatter,
                    "event ID {event_id} was reused with different content"
                )
            }
            Self::InvalidRecord(_) => formatter.write_str("event record is invalid"),
            Self::NonIncreasingSequence { previous, proposed } => write!(
                formatter,
                "shard sequence {proposed} does not advance {previous}"
            ),
        }
    }
}

impl<R: Error + 'static> Error for FoldError<R> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Rejected { rejection, .. } => Some(rejection.as_error()),
            Self::InvalidRecord(error) => Some(error.as_error()),
            Self::ForeignShard { .. }
            | Self::ConflictingReuse { .. }
            | Self::NonIncreasingSequence { .. } => None,
        }
    }
}

impl<R> From<Report<CompatError>> for FoldError<R> {
    fn from(error: Report<CompatError>) -> Self {
        Self::InvalidRecord(error)
    }
}

/// An error while restoring or checking durable state.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum RecoveryError {
    #[display("domain record at sequence {sequence} is invalid")]
    InvalidRecord { sequence: u64 },
    #[display(
        "domain record at sequence {sequence} routes to shard {} instead of {}",
        actual.path_segment(),
        expected.path_segment()
    )]
    ForeignShard {
        sequence: u64,
        expected: Shard,
        actual: Shard,
    },
    #[display("domain record sequence {proposed} does not advance {previous}")]
    NonIncreasingSequence { previous: u64, proposed: u64 },
    #[display("event ID {event_id} was reused with different content at sequence {sequence}")]
    ConflictingReuse { event_id: EventId, sequence: u64 },
    #[display(
        "snapshot for shard {} was offered to shard {}",
        actual.path_segment(),
        expected.path_segment()
    )]
    SnapshotShardMismatch { expected: Shard, actual: Shard },
    #[display("recovered journal sequence {recovered:?} is below the previous {previous}")]
    RegressedSequence {
        previous: u64,
        recovered: Option<u64>,
    },
    #[display("durable prefix lost or changed acknowledged event {event_id}")]
    LostEvent { event_id: EventId },
}
