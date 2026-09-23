//! Serializes changes to one shard's journal and projection.
//!
//! Producers submit typed records through a command handle. The loop checks
//! each proposal against its projection and applies the change after the append
//! is durable. External effects run outside the loop, so their completion
//! events may arrive after another command has changed the state.

mod append;
mod error;
mod handle;
mod recovery;
mod run;
mod startup;

use core::num::NonZeroUsize;

use chrono::{DateTime, Utc};
use tokio::sync::mpsc;
use tokio_util::sync::{CancellationToken, DropGuard};

use self::handle::Command;
pub use self::{
    error::{QueuedWhenStopped, ShardCommandError, ShardCommandErrorKind, ShardCommandKind},
    startup::{OpenedShard, RecoveredShard, StartedShard},
};
use crate::{
    ids::EventId,
    port::{Domain, EventDomain},
    sequence::JournalSequence,
    shard_log::{JournalStorage, ShardLogLocation, ShardLogWriter},
};

pub(crate) const DEFAULT_CHANNEL_CAPACITY: NonZeroUsize =
    NonZeroUsize::new(64).expect("default channel capacity should be nonzero");

const DEFAULT_SAFE_APPEND_RETRIES: u32 = 3;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ShardCommandOutcome<R = !> {
    /// Validation rejected the record before it was appended.
    Rejected {
        rejection: R,
    },
    Applied {
        event_id: EventId,
        shard_sequence: JournalSequence,
    },
    AlreadyDurable {
        event_id: EventId,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ControlResolution<D: Domain> {
    pub append: ShardCommandOutcome,
    pub outcome: D::ControlOutcome,
}

#[derive(Debug, Clone, PartialEq, Eq)]
/// Holds the durable journal end, the restored snapshot, and the pending work that recovery found
/// before startup.
pub struct StartupRecovery<W> {
    pub durable_end_exclusive: JournalSequence,
    /// The last journal sequence that the restored snapshot includes, or `None` when startup
    /// replayed the complete journal.
    pub snapshot_through_sequence: Option<JournalSequence>,
    pub live_work: Vec<W>,
}

/// Reports keys whose state changed. Notifications may be dropped if the channel is full.
///
/// `initial` contains the keys recovered at startup, so consumers can rebuild their state even
/// if the previous process missed a notification.
#[derive(Debug)]
pub struct StateChangeFeed<K> {
    pub initial: Vec<K>,
    pub receiver: mpsc::Receiver<K>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RecoveryMode {
    LocalReopen,
    FullLeaseHandshake,
}

#[derive(Debug, Clone, Copy)]
pub struct ShardCommandConfig {
    channel_capacity: NonZeroUsize,
    safe_append_retries: u32,
    recovery_mode: RecoveryMode,
}

/// [`Default`] permits local writer reopen for tests and callers that manage recovery without
/// leases.
///
/// [`ShardCommandConfig::new`] requires lease reacquisition after a commit-unknown append.
impl Default for ShardCommandConfig {
    fn default() -> Self {
        Self {
            channel_capacity: DEFAULT_CHANNEL_CAPACITY,
            safe_append_retries: DEFAULT_SAFE_APPEND_RETRIES,
            recovery_mode: RecoveryMode::LocalReopen,
        }
    }
}

impl ShardCommandConfig {
    /// Requires lease reacquisition after a commit-unknown append.
    #[must_use]
    pub const fn new(channel_capacity: NonZeroUsize, safe_append_retries: u32) -> Self {
        Self {
            channel_capacity,
            safe_append_retries,
            recovery_mode: RecoveryMode::FullLeaseHandshake,
        }
    }

    #[must_use]
    pub const fn require_full_lease_handshake(mut self) -> Self {
        self.recovery_mode = RecoveryMode::FullLeaseHandshake;
        self
    }

    /// Reopens the writer locally after a commit-unknown append, as [`Default`] does.
    #[must_use]
    pub const fn allow_local_reopen(mut self) -> Self {
        self.recovery_mode = RecoveryMode::LocalReopen;
        self
    }
}

#[derive(Debug, Clone)]
/// Submits commands to one shard. Clones share the same writer and command queue.
pub struct ShardCommandHandle<D: Domain> {
    sender: mpsc::Sender<Command<D>>,
    admission_closed: CancellationToken,
    shard: crate::routing::Shard,
}

/// Owns the right to stop a shard. Submission handles can be cloned independently.
///
/// Dropping the owner rejects new commands and asks the loop to close its writer. An append
/// already in progress may finish. Use [`shutdown`](Self::shutdown) to finish queued commands
/// before closing.
#[derive(Debug)]
pub struct ShardOwner<D: Domain> {
    // Declared first so that it drops first: ownership is cancelled before the command channel
    // closes.
    _ownership: DropGuard,
    sender: mpsc::Sender<Command<D>>,
    admission_closed: CancellationToken,
}

struct CommandLoop<D: Domain, S: JournalStorage> {
    location: ShardLogLocation<S>,
    writer: Option<ShardLogWriter<S::Writer>>,
    projection: D::Projection,
    last_snapshot_attempt_through_sequence: Option<JournalSequence>,
    snapshot_context: Option<D::SnapshotContext>,
    safe_append_retries: u32,
    recovery_mode: RecoveryMode,
    receiver: mpsc::Receiver<Command<D>>,
    state_change_sender: mpsc::Sender<D::StateKey>,
    admission_closed: CancellationToken,
    ownership_lost: CancellationToken,
}

struct RecoveredProjection<D: EventDomain> {
    projection: D::Projection,
    snapshot_through_sequence: Option<JournalSequence>,
    snapshot_created_at: Option<DateTime<Utc>>,
    replayed_events: u64,
    corruption_fallbacks: u64,
}
