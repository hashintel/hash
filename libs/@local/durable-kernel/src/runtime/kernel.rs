use alloc::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};
use core::num::NonZeroU64;

use error_stack::{Report, ResultExt as _};
use tokio_util::sync::CancellationToken;

use super::{DriverSettings, Kernel, KernelConfig, KernelError, RunningKernel, driver::run_shard};
use crate::{
    domain::{self, Executor, Hosted, SimpleDomain},
    keyspace::Keyspace,
    registry::RecordRegistry,
    shard_log::{LogStorageOptions, OpenedShard, ShardCommandConfig, ShardLogLocation},
};

impl Kernel {
    /// Prepares the selected shards for [`start`](Self::start). Repeated shards are opened once.
    ///
    /// # Errors
    ///
    /// Returns an error for an empty shard selection.
    pub fn open(config: KernelConfig) -> Result<Self, Report<KernelError>> {
        let shards: Vec<_> = config
            .shards
            .iter()
            .copied()
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect();
        let shard_capacity =
            NonZeroU64::new(shards.len() as u64).ok_or(KernelError::NoOwnedShards)?;
        Ok(Self {
            keyspace: Keyspace::new(config.name.clone()),
            config,
            shards,
            shard_capacity,
            registry: Arc::new(RecordRegistry::default()),
        })
    }

    /// Registers the domain's record names and checks for conflicting codecs.
    ///
    /// # Errors
    ///
    /// Returns an error when the domain’s record declarations conflict with registered codecs.
    pub fn register<S: SimpleDomain>(self) -> Result<Self, Report<KernelError>> {
        domain::register::<S>(&self.registry).change_context(KernelError::RegisterDomain)?;
        Ok(self)
    }

    /// Recovers every owned shard and starts one effect driver per shard.
    ///
    /// # Errors
    ///
    /// Returns an error when domain registration, storage initialization, or shard recovery fails.
    pub async fn start<S, X>(&self, executor: X) -> Result<RunningKernel<S>, Report<KernelError>>
    where
        S: SimpleDomain,
        X: Executor<S>,
    {
        domain::register::<S>(&self.registry).change_context(KernelError::RegisterDomain)?;
        let executor = Arc::new(executor);
        let shutdown = CancellationToken::new();
        let storage = LogStorageOptions {
            blob_url: self.config.blob_url.clone(),
            aws_region: self.config.aws_region.clone(),
            shard_capacity: self.shard_capacity,
            block_cache_bytes: self.config.block_cache_bytes,
            meta_cache_bytes: self.config.meta_cache_bytes,
        };

        let mut running = RunningKernel {
            shards: BTreeMap::new(),
            recovered_snapshots: BTreeMap::new(),
            drivers: Vec::new(),
            loops: Vec::new(),
            owners: Vec::new(),
            shutdown,
        };

        let mut feeds = Vec::new();

        for &shard in &self.shards {
            let recovered = async {
                let location = ShardLogLocation::for_kernel(
                    shard,
                    &self.keyspace.shard_log(shard),
                    &storage,
                    Arc::clone(&self.registry),
                )
                .change_context(KernelError::ConfigureStorage { shard })?;
                OpenedShard::open(location)
                    .await
                    .change_context(KernelError::Command)?
                    .recover_with_snapshots::<Hosted<S>>(&())
                    .await
                    .change_context(KernelError::Command)
            }
            .await;

            let recovered = match recovered {
                Ok(recovered) => recovered,
                Err(error) => {
                    if let Err(close_error) = running.shutdown().await {
                        tracing::warn!(?close_error, "could not close shards after startup failed");
                    }
                    return Err(error);
                }
            };

            let started = recovered.enable(ShardCommandConfig::new(
                self.config.channel_capacity,
                self.config.safe_append_retries,
            ));

            let handle = started.handle.clone();
            running
                .recovered_snapshots
                .insert(shard.get(), started.recovery.snapshot_through_sequence);

            feeds.push((handle.clone(), started.state_changes));
            running.loops.push(started.task);
            running.owners.push(started.owner);
            running.shards.insert(shard.get(), handle);
        }

        for (owner, (handle, state_changes)) in
            core::mem::take(&mut running.owners).into_iter().zip(feeds)
        {
            running.drivers.push(tokio::spawn(run_shard::<S, X>(
                owner,
                handle,
                state_changes,
                Arc::clone(&executor),
                DriverSettings {
                    poll_interval: self.config.poll_interval,
                    snapshot_policy: self.config.snapshot_policy,
                },
                running.shutdown.clone(),
            )));
        }

        Ok(running)
    }
}
