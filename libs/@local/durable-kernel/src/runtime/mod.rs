//! Runs application domains and their external operations.
//!
//! [`Kernel`] validates configuration and registers record types. [`Kernel::start`] recovers
//! every owned shard before starting an effect driver for each shard. [`RunningKernel`] accepts
//! events and reads state.
//!
//! Drivers plan operations from state, execute them, and record completion events. An effect is
//! finished once all its completion events are durable. An unwinding panic during execution
//! schedules a delayed retry while the driver handles other work.
//! Driver errors that cannot be retried stop the affected shard and are returned by
//! [`RunningKernel::shutdown`].
//!
//! Run one process per shard set. Opening a replacement writer invalidates the old one.
//! [`RunningKernel::shutdown`] waits for active effects and closes storage. Dropping a
//! [`RunningKernel`] cancels effect tasks and asks command loops to close. Recovery may repeat an
//! external write whose completion was not recorded.

mod config;
mod driver;
mod error;
mod kernel;
mod running;
#[cfg(test)]
mod tests;

use alloc::{collections::BTreeMap, sync::Arc};
use core::{num::NonZeroU64, time::Duration};

use error_stack::Report;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

pub use self::{
    config::{KernelConfig, SnapshotPolicy},
    error::KernelError,
    running::Submitted,
};
use crate::{
    domain::{Hosted, SimpleDomain},
    keyspace::Keyspace,
    registry::RecordRegistry,
    routing::Shard,
    shard_log::{ShardCommandError, ShardCommandHandle, ShardOwner},
};

/// Holds a validated configuration. [`start`](Self::start) opens the shard storage.
pub struct Kernel {
    config: KernelConfig,
    keyspace: Keyspace,
    shards: Vec<Shard>,
    shard_capacity: NonZeroU64,
    registry: Arc<RecordRegistry>,
}

/// Owns the shard writers and effect tasks until shutdown or drop.
///
/// Use [`submit`](Self::submit) to store events and [`read`](Self::read) to inspect state.
/// [`shutdown`](Self::shutdown) waits for active effects. Dropping the handle cancels them.
pub struct RunningKernel<S: SimpleDomain> {
    shards: BTreeMap<u8, ShardCommandHandle<Hosted<S>>>,
    recovered_snapshots: BTreeMap<u8, Option<u64>>,
    drivers: Vec<JoinHandle<Result<(), Report<KernelError>>>>,
    loops: Vec<JoinHandle<Result<(), ShardCommandError>>>,
    owners: Vec<ShardOwner<Hosted<S>>>,
    shutdown: CancellationToken,
}

struct DriverSettings {
    poll_interval: Duration,
    snapshot_policy: SnapshotPolicy,
}
