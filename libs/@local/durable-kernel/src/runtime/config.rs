use core::{
    num::{NonZeroU64, NonZeroUsize},
    time::Duration,
};

use crate::{keyspace::Namespace, routing::Shard};

/// Controls when a shard saves snapshots.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SnapshotPolicy {
    Disabled,
    /// Attempts a snapshot once the journal sequence has advanced by at least this much since the
    /// previous attempt.
    Every(NonZeroU64),
}

const DEFAULT_SNAPSHOT_INTERVAL: NonZeroU64 =
    NonZeroU64::new(512).expect("default snapshot interval should be nonzero");

#[derive(Debug, Clone)]
/// Configures storage and scheduling for the shards this process owns.
///
/// [`new`](Self::new) supplies defaults. Set [`shards`](Self::shards) before opening a kernel.
pub struct KernelConfig {
    /// Every storage key starts with this namespace.
    pub name: Namespace,
    /// The storage location, as a local file URL or an S3 URL.
    pub blob_url: String,
    pub aws_region: Option<String>,
    /// The kernel rejects submissions routed outside these shards.
    pub shards: Vec<Shard>,
    pub snapshot_policy: SnapshotPolicy,
    /// Idle drivers wait this long. It is also the default retry delay.
    pub poll_interval: Duration,
    /// The maximum number of queued commands per shard. Submissions wait when the queue is full.
    pub channel_capacity: NonZeroUsize,
    /// The maximum number of retries for an append that did not reach storage.
    pub safe_append_retries: u32,
    pub block_cache_bytes: u64,
    pub meta_cache_bytes: u64,
}

impl KernelConfig {
    /// Creates a configuration that attempts a snapshot after the journal sequence advances by at
    /// least 512 and retries an append up to three times when it did not reach storage. Set
    /// [`shards`](Self::shards) before opening a kernel.
    ///
    /// ```
    /// use durable_kernel::{
    ///     domain::PartitionKey,
    ///     keyspace::Namespace,
    ///     runtime::{Kernel, KernelConfig},
    /// };
    ///
    /// let key = PartitionKey::parse("customers").expect("key should be valid");
    /// let name = Namespace::parse("customer-sync").expect("namespace should be valid");
    /// let mut config = KernelConfig::new(name, "file:///tmp/customer-sync");
    /// config.shards = vec![key.shard()];
    /// let kernel = Kernel::open(config).expect("configuration should be valid");
    /// ```
    pub fn new(name: Namespace, blob_url: impl Into<String>) -> Self {
        Self {
            name,
            blob_url: blob_url.into(),
            aws_region: None,
            shards: Vec::new(),
            snapshot_policy: SnapshotPolicy::Every(DEFAULT_SNAPSHOT_INTERVAL),
            poll_interval: Duration::from_millis(250),
            channel_capacity: NonZeroUsize::new(64).unwrap_or(NonZeroUsize::MIN),
            safe_append_retries: 3,
            block_cache_bytes: 64 * 1024 * 1024,
            meta_cache_bytes: 8 * 1024 * 1024,
        }
    }
}
