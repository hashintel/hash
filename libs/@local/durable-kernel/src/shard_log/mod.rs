//! Stores and recovers one journal per shard using local files or S3.
//!
//! [`crate::runtime`] manages this layer for application domains. For custom runtimes, open an
//! [`OpenedShard`], recover its state, then enable commands on the [`RecoveredShard`]. Verify
//! ownership before enabling the writer. Opening a replacement writer invalidates the old one.
//!
//! [`ShardCommandHandle`] serializes submissions and applies each record after it is durable.
//! Keep the [`ShardOwner`] until shutdown. Dropping it stops the shard.
//! [`AppendFailureKind`] says whether a failed append can be retried or requires recovery.
//! Use [`read_journal`] to inspect stored events without acquiring a writer.
//! Implement [`JournalStorage`] to use another backend with the same command and recovery checks.

use alloc::sync::Arc;
use core::{ops::Bound, time::Duration};

use error_stack::Report;
use opendata_common::StorageConfig;

use crate::{registry::RecordRegistry, sequence::JournalSequence};

mod backend;
mod command_loop;
mod error;
mod location;
mod scan;
#[cfg(test)]
mod tests;
mod writer;

pub use backend::{
    JournalReader, JournalStorage, JournalStream, JournalWriter, StorageReader, StorageStream,
    StorageWriter,
};
pub use command_loop::{
    ControlResolution, OpenedShard, QueuedWhenStopped, RecoveredShard, ShardCommandConfig,
    ShardCommandError, ShardCommandErrorKind, ShardCommandHandle, ShardCommandKind,
    ShardCommandOutcome, ShardOwner, StartedShard, StartupRecovery, StateChangeFeed,
};

pub use self::{
    error::{AppendFailureKind, ShardAppendError, ShardLogOpenError, StorageConfigError},
    location::{LogStorageOptions, read_journal, storage_for_path},
};
use self::{
    scan::{scan_records, scan_snapshot_records},
    writer::{flush_with_timeout, wait_until_durable_with},
};

const EVENTS_KEY: &[u8] = b"events";
const PROJECTION_SNAPSHOTS_KEY: &[u8] = b"projection-snapshots";
const APPEND_TIMEOUT: Duration = Duration::from_secs(30);
const DURABILITY_TIMEOUT: Duration = Duration::from_secs(60);
/// Number of durability waits before an append is reported as commit-unknown. A leased shard
/// stops on that result and must reacquire its lease.
const DURABILITY_WAIT_ATTEMPTS: u32 = 3;
const PINNED_FENCE_MESSAGE: &str = "detected newer db client";

/// The journal sequence of a snapshot reference and the snapshot record it points to.
type SnapshotCandidate<T> = (
    JournalSequence,
    Result<T, Report<crate::registry::CompatError>>,
);

#[derive(Debug, Clone)]
/// Holds a journal's storage configuration and shared record registry.
///
/// Share one registry across locations that must agree on record names and codecs.
pub struct ShardLogLocation<S: JournalStorage = StorageConfig> {
    shard: crate::routing::Shard,
    storage: S,
    read_timeout: Duration,
    durability_timeout: Duration,
    registry: Arc<RecordRegistry>,
}

/// Owns the writer for one shard.
struct ShardLogWriter<W: JournalWriter = StorageWriter> {
    backend: W,
    durability_timeout: Duration,
    registry: Arc<RecordRegistry>,
}

struct RecoveryRange {
    bounds: (Bound<JournalSequence>, Bound<JournalSequence>),
    window: (JournalSequence, JournalSequence),
}
