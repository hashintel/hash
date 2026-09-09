//! The kernel runtime opens a configured [`Kernel`], registers a domain, and
//! starts its executor. The resulting [`RunningKernel`] accepts submissions,
//! serves reads, and supports an orderly shutdown.
//!
//! All shards recover before any executor starts. Each shard driver reads its
//! projection, plans work, executes it, and appends the returned events. Those
//! events record completion so the next plan can omit completed work. A set of
//! executed effect IDs also prevents repeated execution within a session.
//! A retry delay applies to one effect, allowing the driver to process the rest
//! of the plan while that effect waits.
//!
//! Run one process per shard set. Opening a second `SlateDB` writer invalidates
//! the first writer. Call [`RunningKernel::shutdown`] to finish the active
//! effects and close storage. Dropping the kernel cancels its effect tasks and
//! asks its command loops to close. An external write may already have succeeded
//! when its task is cancelled, so recovery can repeat that effect.

use alloc::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};
use core::{fmt, num::NonZeroUsize, time::Duration};

use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use crate::{
    domain::{self, EventRecordV1, Executor, Hosted, PartitionKey, SimpleDomain, effect_id},
    keyspace::{Keyspace, Namespace},
    registry::CompatError,
    routing::Shard,
    shard_log::{
        LogStorageOptions, OpenedShard, ShardCommandConfig, ShardCommandError,
        ShardCommandErrorKind, ShardCommandHandle, ShardCommandOutcome, ShardLogLocation,
        StateChangeFeed,
    },
};

#[derive(Debug)]
pub enum KernelError {
    Config(String),
    Registration(String),
    InvalidEvent(String),
    Storage(String),
    NotOwned { shard: u16 },
    Rejected { message: String },
    Internal(String),
}

impl fmt::Display for KernelError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Config(message) => write!(formatter, "kernel configuration invalid: {message}"),
            Self::Registration(message) => {
                write!(formatter, "kernel registration failed: {message}")
            }
            Self::InvalidEvent(message) => write!(formatter, "kernel record invalid: {message}"),
            Self::Storage(message) => write!(formatter, "kernel storage failed: {message}"),
            Self::NotOwned { shard } => write!(
                formatter,
                "partition routes to shard {shard}, which this kernel does not own"
            ),
            Self::Rejected { message } => write!(formatter, "event rejected: {message}"),
            Self::Internal(message) => write!(formatter, "kernel internal failure: {message}"),
        }
    }
}

impl core::error::Error for KernelError {}

#[derive(Debug, Clone)]
pub struct KernelConfig {
    /// Every storage key starts with this namespace.
    pub name: String,
    /// Storage location expressed as a local file URL or an S3 URL.
    pub blob_url: String,
    pub aws_region: Option<String>,
    /// The kernel rejects submissions routed outside these shards.
    pub shards: Vec<u16>,
    /// Attempts a snapshot after this many journal sequence positions have
    /// passed since the last snapshot. A value of zero disables snapshots.
    pub snapshot_every_events: u64,
    /// Idle drivers wait this long. It is also the default retry delay.
    pub poll_interval: Duration,
    pub channel_capacity: NonZeroUsize,
    pub safe_append_retries: u32,
    pub block_cache_bytes: u64,
    pub meta_cache_bytes: u64,
}

impl KernelConfig {
    pub fn new(name: impl Into<String>, blob_url: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            blob_url: blob_url.into(),
            aws_region: None,
            shards: Vec::new(),
            snapshot_every_events: 512,
            poll_interval: Duration::from_millis(250),
            channel_capacity: NonZeroUsize::new(64).unwrap_or(NonZeroUsize::MIN),
            safe_append_retries: 3,
            block_cache_bytes: 64 * 1024 * 1024,
            meta_cache_bytes: 8 * 1024 * 1024,
        }
    }
}

/// Validates the namespace and shard selection before storage opens in `start`.
pub struct Kernel {
    config: KernelConfig,
    keyspace: Keyspace,
    shards: Vec<Shard>,
}

impl Kernel {
    /// # Errors
    ///
    /// Returns an error for an invalid namespace, an empty shard selection, or an invalid shard
    /// number.
    pub fn open(config: KernelConfig) -> Result<Self, KernelError> {
        let namespace = Namespace::parse(&config.name)
            .map_err(|error| KernelError::Config(error.to_string()))?;
        if config.shards.is_empty() {
            return Err(KernelError::Config(
                "at least one owned shard is required".to_owned(),
            ));
        }
        let shards = config
            .shards
            .iter()
            .map(|&value| Shard::try_from(value))
            .collect::<Result<BTreeSet<_>, _>>()
            .map_err(|error| KernelError::Config(error.to_string()))?
            .into_iter()
            .collect();
        Ok(Self {
            keyspace: Keyspace::new(namespace),
            config,
            shards,
        })
    }

    /// Registers the domain's record names and checks for conflicting codecs.
    ///
    /// # Errors
    ///
    /// Returns an error when the domain’s record declarations conflict with registered codecs.
    pub fn register<S: SimpleDomain>(self) -> Result<Self, KernelError> {
        domain::register::<S>().map_err(|error| KernelError::Registration(error.to_string()))?;
        Ok(self)
    }

    /// Recovers every owned shard and starts one effect driver per shard.
    ///
    /// # Errors
    ///
    /// Returns an error when storage initialization or shard recovery fails.
    pub async fn start<S, X>(&self, executor: X) -> Result<RunningKernel<S>, KernelError>
    where
        S: SimpleDomain,
        X: Executor<S>,
    {
        let executor = Arc::new(executor);
        let shutdown = CancellationToken::new();
        let storage = LogStorageOptions {
            blob_url: self.config.blob_url.clone(),
            aws_region: self.config.aws_region.clone(),
            shard_capacity: self.shards.len() as u64,
            block_cache_bytes: self.config.block_cache_bytes,
            meta_cache_bytes: self.config.meta_cache_bytes,
        };
        let mut running = RunningKernel {
            shards: BTreeMap::new(),
            recovered_snapshots: BTreeMap::new(),
            drivers: Vec::new(),
            loops: Vec::new(),
            shutdown,
        };
        let mut feeds = Vec::new();
        for &shard in &self.shards {
            let recovered = async {
                let location =
                    ShardLogLocation::for_kernel(shard, &self.keyspace.shard_log(shard), &storage)
                        .map_err(|error| KernelError::Storage(format!("{error:?}")))?;
                OpenedShard::open(location)
                    .await
                    .map_err(|error| command_failure(&error))?
                    .recover_with_snapshots::<Hosted<S>>(&())
                    .await
                    .map_err(|error| command_failure(&error))
            }
            .await;
            let recovered = match recovered {
                Ok(recovered) => recovered,
                Err(error) => {
                    if let Err(close_error) = running.shutdown().await {
                        tracing::warn!(%close_error, "failed to close shards after startup failure");
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
                .insert(shard.get(), started.recovery.snapshot_through_log_sequence);
            feeds.push((handle.clone(), started.state_changes));
            running.loops.push(started.task);
            running.shards.insert(shard.get(), handle);
        }
        for (handle, state_changes) in feeds {
            running.drivers.push(tokio::spawn(drive_shard::<S, X>(
                handle,
                state_changes,
                Arc::clone(&executor),
                DriverSettings {
                    poll_interval: self.config.poll_interval,
                    snapshot_every_events: self.config.snapshot_every_events,
                },
                running.shutdown.clone(),
            )));
        }
        Ok(running)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Submitted {
    Applied,
    AlreadyDurable,
}

pub struct RunningKernel<S: SimpleDomain> {
    shards: BTreeMap<u8, ShardCommandHandle<Hosted<S>>>,
    recovered_snapshots: BTreeMap<u8, Option<u64>>,
    drivers: Vec<JoinHandle<Result<(), KernelError>>>,
    loops: Vec<JoinHandle<Result<(), ShardCommandError>>>,
    shutdown: CancellationToken,
}

impl<S: SimpleDomain> RunningKernel<S> {
    fn handle_for(
        &self,
        key: &PartitionKey,
    ) -> Result<&ShardCommandHandle<Hosted<S>>, KernelError> {
        let shard = domain::shard_of(key);
        self.shards
            .get(&shard.get())
            .ok_or_else(|| KernelError::NotOwned {
                shard: u16::from(shard.get()),
            })
    }

    /// Validates and durably appends one event. Submitting the same event again
    /// returns `AlreadyDurable`. A rejection includes the fold's reason.
    ///
    /// # Errors
    ///
    /// Returns an error when the event cannot be encoded, its shard is not owned, or the command
    /// loop fails.
    pub async fn submit(&self, event: S::Event) -> Result<Submitted, KernelError> {
        let record = EventRecordV1::new(event).map_err(|error| invalid_event(&error))?;
        let handle = self.handle_for(&record.partition)?;
        match handle.propose(record).await {
            Ok(ShardCommandOutcome::Applied { .. }) => Ok(Submitted::Applied),
            Ok(ShardCommandOutcome::AlreadyDurable { .. }) => Ok(Submitted::AlreadyDurable),
            Err(error) if error.kind == ShardCommandErrorKind::InvalidCandidate => {
                Err(KernelError::Rejected {
                    message: error.message,
                })
            }
            Err(error) => Err(command_failure(&error)),
        }
    }

    /// Reads the projection for the shard containing `key`.
    ///
    /// The projection includes every partition on that shard, so the closure selects the data it
    /// needs. The closure runs inside the command loop and must not block.
    ///
    /// # Errors
    ///
    /// Returns an error when the partition’s shard is not owned or the command loop fails.
    pub async fn read<R, F>(&self, key: &PartitionKey, read: F) -> Result<R, KernelError>
    where
        R: Send + 'static,
        F: FnOnce(&S::Projection) -> R + Send + 'static,
    {
        let handle = self.handle_for(key)?;
        handle
            .read(move |projection| read(projection.domain()))
            .await
            .map_err(|error| command_failure(&error))
    }

    /// Snapshot sequence restored during recovery for each shard. A value of
    /// `None` means recovery replayed the full journal.
    #[must_use]
    pub const fn recovery_snapshots(&self) -> &BTreeMap<u8, Option<u64>> {
        &self.recovered_snapshots
    }

    /// Waits for active effects to return, then closes each shard writer.
    /// Executors must bound their own requests for shutdown to finish promptly.
    ///
    /// # Errors
    ///
    /// Returns an error when a driver or shard loop fails during shutdown.
    pub async fn shutdown(mut self) -> Result<(), KernelError> {
        self.shutdown.cancel();
        let mut first_error = None;
        for driver in &mut self.drivers {
            match driver.await {
                Ok(Ok(())) => {}
                Ok(Err(error)) => {
                    first_error.get_or_insert(error);
                }
                Err(join_error) => {
                    first_error
                        .get_or_insert_with(|| KernelError::Internal(join_error.to_string()));
                }
            }
        }
        for handle in self.shards.values() {
            // A loop that already stopped reports Closed here, which is an
            // expected outcome.
            let _: Result<_, _> = handle.shutdown().await;
        }
        for task in &mut self.loops {
            match task.await {
                Ok(Ok(())) => {}
                Ok(Err(error)) => {
                    first_error.get_or_insert_with(|| command_failure(&error));
                }
                Err(join_error) => {
                    first_error
                        .get_or_insert_with(|| KernelError::Internal(join_error.to_string()));
                }
            }
        }
        first_error.map_or(Ok(()), Err)
    }
}

impl<S: SimpleDomain> Drop for RunningKernel<S> {
    fn drop(&mut self) {
        self.shutdown.cancel();
        for driver in &self.drivers {
            driver.abort();
        }
        for handle in self.shards.values() {
            handle.stop_admission();
            handle.cancel_owned_writer();
        }
    }
}

struct DriverSettings {
    poll_interval: Duration,
    snapshot_every_events: u64,
}

fn command_failure(error: &ShardCommandError) -> KernelError {
    KernelError::Internal(error.to_string())
}

fn invalid_event(error: &CompatError) -> KernelError {
    KernelError::InvalidEvent(error.to_string())
}

fn settle_driver_error(
    error: &ShardCommandError,
    shutdown: &CancellationToken,
) -> Result<(), KernelError> {
    if shutdown.is_cancelled() || error.kind == ShardCommandErrorKind::Closed {
        Ok(())
    } else {
        Err(command_failure(error))
    }
}

#[expect(
    clippy::integer_division_remainder_used,
    reason = "tokio select uses modulo to choose its polling order"
)]
async fn drive_shard<S, X>(
    handle: ShardCommandHandle<Hosted<S>>,
    mut state_changes: StateChangeFeed<PartitionKey>,
    executor: Arc<X>,
    settings: DriverSettings,
    shutdown: CancellationToken,
) -> Result<(), KernelError>
where
    S: SimpleDomain,
    X: Executor<S>,
{
    let mut executed: BTreeSet<String> = BTreeSet::new();
    let mut retries = BTreeMap::<String, tokio::time::Instant>::new();
    loop {
        if shutdown.is_cancelled() {
            return Ok(());
        }
        let planner = Arc::clone(&executor);
        let effects = match handle
            .read(move |projection| planner.plan(projection.domain()))
            .await
        {
            Ok(effects) => effects,
            Err(error) => return settle_driver_error(&error, &shutdown),
        };
        let mut progressed = false;
        for effect in effects {
            if shutdown.is_cancelled() {
                return Ok(());
            }
            let id = effect_id(&effect)
                .map_err(|error| KernelError::Internal(format!("effect identity: {error}")))?;
            if executed.contains(&id) {
                continue;
            }
            if retries
                .get(&id)
                .is_some_and(|deadline| *deadline > tokio::time::Instant::now())
            {
                continue;
            }
            match executor.execute(&effect).await {
                Ok(events) => {
                    retries.remove(&id);
                    executed.insert(id);
                    progressed = true;
                    for event in events {
                        let record =
                            EventRecordV1::new(event).map_err(|error| invalid_event(&error))?;
                        match handle.propose(record).await {
                            Ok(_outcome) => {}
                            Err(error) if error.kind == ShardCommandErrorKind::InvalidCandidate => {
                                // Completion events must validate as part of
                                // the executor contract.
                                // The session set stops hot re-execution until the next restart.
                                tracing::warn!(
                                    error = %error,
                                    "effect completion event was rejected"
                                );
                            }
                            Err(error) => return settle_driver_error(&error, &shutdown),
                        }
                    }
                }
                Err(retry) => {
                    tracing::debug!(reason = %retry.reason, "effect execution retries later");
                    let deadline = tokio::time::Instant::now()
                        .checked_add(retry.after.unwrap_or(settings.poll_interval))
                        .ok_or_else(|| {
                            KernelError::Internal("effect retry delay is out of range".to_owned())
                        })?;
                    retries.insert(id, deadline);
                }
            }
        }
        maybe_snapshot(&handle, settings.snapshot_every_events).await;
        let now = tokio::time::Instant::now();
        retries.retain(|_, deadline| *deadline > now);
        if !progressed {
            let delay = retries
                .values()
                .map(|deadline| deadline.saturating_duration_since(now))
                .min()
                .unwrap_or(settings.poll_interval)
                .min(settings.poll_interval);
            tokio::select! {
                () = shutdown.cancelled() => return Ok(()),
                _changed = state_changes.receiver.recv() => {}
                () = tokio::time::sleep(delay) => {}
            }
        }
    }
}

/// Snapshotting is best effort because a failed or skipped snapshot only
/// means longer replay.
async fn maybe_snapshot<S: SimpleDomain>(
    handle: &ShardCommandHandle<Hosted<S>>,
    every_events: u64,
) {
    if every_events == 0 {
        return;
    }
    match handle.capture_snapshot(every_events).await {
        Ok(Some(payload)) => {
            let record = payload.into_record(chrono::Utc::now().to_rfc3339());
            if let Err(error) = handle.commit_snapshot(record).await {
                tracing::warn!(error = %error, "snapshot commit failed; replay stays longer");
            }
        }
        Ok(None) => {}
        Err(error) => {
            tracing::debug!(error = %error, "snapshot capture unavailable");
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use serde::{Deserialize, Serialize};

    use super::*;
    use crate::domain::{DomainEvent, Fold, Rejection, Retry};

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    #[serde(tag = "kind", rename_all = "snake_case")]
    enum RtEvent {
        Incremented {
            counter: String,
            request: u32,
            amount: u64,
        },
        Archived {
            counter: String,
            total: u64,
        },
    }

    impl DomainEvent for RtEvent {
        fn name() -> &'static str {
            "runtime_counter_event"
        }

        fn partition(&self) -> PartitionKey {
            let counter = match self {
                Self::Incremented { counter, .. } | Self::Archived { counter, .. } => counter,
            };
            PartitionKey::parse(counter.as_str()).expect("test counters should be valid keys")
        }
    }

    #[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
    struct RtCounters {
        totals: BTreeMap<String, u64>,
        archived: Vec<u64>,
    }

    impl Fold<RtEvent> for RtCounters {
        fn validate(&self, event: &RtEvent) -> Result<(), Rejection> {
            match event {
                RtEvent::Incremented { amount: 0, .. } => {
                    Err(Rejection::new("increment must be nonzero"))
                }
                RtEvent::Incremented { .. } | RtEvent::Archived { .. } => Ok(()),
            }
        }

        fn apply(&mut self, event: &RtEvent) {
            match event {
                RtEvent::Incremented {
                    counter, amount, ..
                } => {
                    let total = self.totals.entry(counter.clone()).or_default();
                    *total = total.saturating_add(*amount);
                }
                RtEvent::Archived { counter, total } => {
                    self.totals.remove(counter);
                    self.archived.push(*total);
                }
            }
        }
    }

    struct RtDomain;

    impl SimpleDomain for RtDomain {
        type Event = RtEvent;
        type Projection = RtCounters;
    }

    #[derive(Debug, Clone, PartialEq, Serialize)]
    struct ArchiveEffect {
        counter: String,
        total: u64,
    }

    /// The completion event removes the counter from subsequent plans.
    struct ArchiveExecutor {
        threshold: u64,
        external: Arc<Mutex<Vec<(String, u64)>>>,
    }

    impl Executor<RtDomain> for ArchiveExecutor {
        type Effect = ArchiveEffect;

        fn plan(&self, projection: &RtCounters) -> Vec<ArchiveEffect> {
            projection
                .totals
                .iter()
                .filter(|(_counter, &total)| total >= self.threshold)
                .map(|(counter, &total)| ArchiveEffect {
                    counter: counter.clone(),
                    total,
                })
                .collect()
        }

        #[expect(
            clippy::unused_async_trait_impl,
            reason = "executor side effects run when the future is polled"
        )]
        async fn execute(&self, effect: &ArchiveEffect) -> Result<Vec<RtEvent>, Retry> {
            self.external
                .lock()
                .expect("test mutex should not be poisoned")
                .push((effect.counter.clone(), effect.total));
            Ok(vec![RtEvent::Archived {
                counter: effect.counter.clone(),
                total: effect.total,
            }])
        }
    }

    fn increment(counter: &str, request: u32, amount: u64) -> RtEvent {
        RtEvent::Incremented {
            counter: counter.to_owned(),
            request,
            amount,
        }
    }

    fn config(blob_url: &str, shard: u8) -> KernelConfig {
        let mut config = KernelConfig::new("kernelapp", blob_url);
        config.aws_region = std::env::var("AWS_REGION")
            .or_else(|_missing| std::env::var("AWS_DEFAULT_REGION"))
            .ok();
        config.shards = vec![u16::from(shard)];
        config.poll_interval = Duration::from_millis(20);
        config.snapshot_every_events = 2;
        config
    }

    async fn wait_until<F>(mut condition: F)
    where
        F: AsyncFnMut() -> bool,
    {
        tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                if condition().await {
                    return;
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        })
        .await
        .expect("condition should hold within the timeout");
    }

    #[tokio::test]
    async fn kernel_end_to_end_executes_effects_once_and_recovers() {
        let blob = tempfile::tempdir().expect("blob root tempdir should be created");
        exercise_end_to_end(&format!("file://{}", blob.path().display())).await;
    }

    /// Runs the same sequence over an S3-compatible endpoint. The `SlateDB` shard
    /// log, snapshots, and artifact store all use object storage.
    #[tokio::test]
    #[ignore = "requires an S3-compatible endpoint and \
                INTEGRATIONS_KERNEL_S3_URL=s3://bucket/scratch-prefix"]
    async fn kernel_end_to_end_on_s3() {
        let base_url = std::env::var("INTEGRATIONS_KERNEL_S3_URL")
            .expect("INTEGRATIONS_KERNEL_S3_URL should be set to s3://bucket/scratch-prefix");
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock should be after the epoch")
            .as_nanos();
        let run_url = format!(
            "{}/kernel-e2e-{}-{}",
            base_url.trim_end_matches('/'),
            std::process::id(),
            unique
        );
        exercise_end_to_end(&run_url).await;
    }

    async fn exercise_end_to_end(blob_url: &str) {
        let orders = PartitionKey::parse("orders").expect("key should be valid");
        let shard = domain::shard_of(&orders);
        let external = Arc::new(Mutex::new(Vec::new()));

        let kernel = Kernel::open(config(blob_url, shard.get()))
            .expect("kernel should open")
            .register::<RtDomain>()
            .expect("domain should register");
        let running = kernel
            .start(ArchiveExecutor {
                threshold: 10,
                external: Arc::clone(&external),
            })
            .await
            .expect("kernel should start");

        assert_eq!(
            running
                .submit(increment("orders", 1, 6))
                .await
                .expect("submit should succeed"),
            Submitted::Applied
        );
        assert_eq!(
            running
                .submit(increment("orders", 2, 5))
                .await
                .expect("submit should succeed"),
            Submitted::Applied
        );
        wait_until(async || {
            running
                .read(&orders, |projection| projection.archived.clone())
                .await
                .expect("read should succeed")
                == vec![11]
        })
        .await;
        assert_eq!(
            *external.lock().expect("test mutex should not be poisoned"),
            vec![("orders".to_owned(), 11)],
            "the effect must execute exactly once in this session"
        );
        assert_eq!(
            running
                .read(&orders, |projection| projection.totals.clone())
                .await
                .expect("read should succeed"),
            BTreeMap::new(),
            "archiving resets the counter"
        );
        assert_eq!(
            running
                .submit(increment("orders", 1, 6))
                .await
                .expect("resubmit should succeed"),
            Submitted::AlreadyDurable
        );
        let rejection = running
            .submit(increment("orders", 9, 0))
            .await
            .expect_err("zero increment should be rejected");
        assert!(rejection.to_string().contains("increment must be nonzero"));
        running.shutdown().await.expect("shutdown should succeed");

        // A fresh executor starts with state recovered through the snapshot.
        // The archived counter plans no work, so nothing executes again.
        let external_after = Arc::new(Mutex::new(Vec::new()));
        let kernel = Kernel::open(config(blob_url, shard.get()))
            .expect("kernel should reopen")
            .register::<RtDomain>()
            .expect("domain should re-register");
        let running = kernel
            .start(ArchiveExecutor {
                threshold: 10,
                external: Arc::clone(&external_after),
            })
            .await
            .expect("kernel should restart");
        assert!(
            running.recovery_snapshots()[&shard.get()].is_some(),
            "recovery must adopt a committed snapshot"
        );
        assert_eq!(
            running
                .read(&orders, |projection| projection.archived.clone())
                .await
                .expect("read after restart should succeed"),
            vec![11]
        );
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert!(
            external_after
                .lock()
                .expect("test mutex should not be poisoned")
                .is_empty(),
            "a folded completion must not re-execute after restart"
        );
        running
            .shutdown()
            .await
            .expect("shutdown after restart should succeed");
    }

    #[tokio::test]
    async fn retry_delay_allows_other_effects_to_complete() {
        struct RetryingExecutor {
            attempts: Arc<Mutex<Vec<(u8, tokio::time::Instant)>>>,
        }

        impl Executor<RtDomain> for RetryingExecutor {
            type Effect = u8;

            fn plan(&self, projection: &RtCounters) -> Vec<u8> {
                match projection.totals.get("ready") {
                    None => vec![1, 2],
                    Some(1) => vec![1],
                    Some(_) => Vec::new(),
                }
            }

            #[expect(
                clippy::unused_async_trait_impl,
                reason = "executor side effects run when the future is polled"
            )]
            async fn execute(&self, effect: &u8) -> Result<Vec<RtEvent>, Retry> {
                let mut attempts = self
                    .attempts
                    .lock()
                    .expect("test mutex should not be poisoned");
                attempts.push((*effect, tokio::time::Instant::now()));
                if attempts.len() == 1 {
                    Err(Retry {
                        reason: "destination unavailable".to_owned(),
                        after: Some(Duration::from_millis(200)),
                    })
                } else {
                    Ok(vec![increment("ready", u32::from(*effect), 1)])
                }
            }
        }

        let blob = tempfile::tempdir().expect("blob root tempdir should be created");
        let key = PartitionKey::parse("ready").expect("key should be valid");
        let attempts = Arc::new(Mutex::new(Vec::new()));
        let running = Kernel::open(config(
            &format!("file://{}", blob.path().display()),
            domain::shard_of(&key).get(),
        ))
        .expect("kernel should open")
        .register::<RtDomain>()
        .expect("domain should register")
        .start(RetryingExecutor {
            attempts: Arc::clone(&attempts),
        })
        .await
        .expect("kernel should start");
        wait_until(async || {
            running
                .read(&key, |state| state.totals.get("ready") == Some(&2))
                .await
                .expect("read should succeed")
        })
        .await;
        {
            let attempts = attempts.lock().expect("test mutex should not be poisoned");
            assert_eq!(
                attempts
                    .iter()
                    .map(|(effect, _)| *effect)
                    .collect::<Vec<_>>(),
                vec![1, 2, 1],
                "the second effect should complete before the first retries"
            );
            assert!(
                attempts[2].1.duration_since(attempts[0].1) >= Duration::from_millis(200),
                "state changes should preserve the pending retry delay"
            );
            drop(attempts);
        }
        running.shutdown().await.expect("shutdown should succeed");
    }

    #[tokio::test]
    async fn failed_start_does_not_run_an_executor() {
        struct CountingPlanner(Arc<core::sync::atomic::AtomicUsize>);

        impl Executor<RtDomain> for CountingPlanner {
            type Effect = ();

            fn plan(&self, _: &RtCounters) -> Vec<()> {
                self.0.fetch_add(1, core::sync::atomic::Ordering::SeqCst);
                Vec::new()
            }

            async fn execute(&self, (): &()) -> Result<Vec<RtEvent>, Retry> {
                unreachable!("empty plans should never execute");
            }
        }
        let blob = tempfile::tempdir().expect("blob root tempdir should be created");
        let mut settings = config(&format!("file://{}", blob.path().display()), 0);
        settings.shards = vec![0, 1];
        let kernel = Kernel::open(settings)
            .expect("kernel should open")
            .register::<RtDomain>()
            .expect("domain should register");
        let blocked = blob
            .path()
            .join(kernel.keyspace.shard_log(kernel.shards[1]));
        std::fs::create_dir_all(blocked.parent().expect("log path should have a parent"))
            .expect("log parent should be created");
        std::fs::write(blocked, b"not a directory").expect("second shard path should be blocked");

        let calls = Arc::new(core::sync::atomic::AtomicUsize::new(0));
        assert!(
            kernel
                .start(CountingPlanner(Arc::clone(&calls)))
                .await
                .is_err()
        );
        assert_eq!(
            calls.load(core::sync::atomic::Ordering::SeqCst),
            0,
            "a failed startup should never invoke the executor"
        );
        assert_eq!(
            Arc::strong_count(&calls),
            1,
            "startup should release the executor"
        );
    }

    #[tokio::test]
    async fn dropping_kernel_stops_an_in_flight_executor() {
        struct WaitingExecutor(Arc<tokio::sync::Notify>);

        impl Executor<RtDomain> for WaitingExecutor {
            type Effect = ();

            fn plan(&self, _: &RtCounters) -> Vec<()> {
                vec![()]
            }

            async fn execute(&self, (): &()) -> Result<Vec<RtEvent>, Retry> {
                self.0.notify_one();
                core::future::pending().await
            }
        }

        let blob = tempfile::tempdir().expect("blob root tempdir should be created");
        let entered = Arc::new(tokio::sync::Notify::new());
        let executor = Arc::downgrade(&entered);
        let running = Kernel::open(config(&format!("file://{}", blob.path().display()), 0))
            .expect("kernel should open")
            .register::<RtDomain>()
            .expect("domain should register")
            .start(WaitingExecutor(Arc::clone(&entered)))
            .await
            .expect("kernel should start");
        tokio::time::timeout(Duration::from_secs(10), entered.notified())
            .await
            .expect("effect should start");
        let handle = running.shards[&0].clone();
        let mut loops = running
            .loops
            .iter()
            .map(JoinHandle::abort_handle)
            .collect::<Vec<_>>();
        drop(entered);
        drop(running);
        wait_until(async || executor.upgrade().is_none()).await;
        wait_until(async || loops.iter_mut().all(|task| task.is_finished())).await;
        assert!(
            handle.read(|_| ()).await.is_err(),
            "dropped kernel should reject reads"
        );
    }

    #[tokio::test]
    async fn foreign_partitions_are_not_owned() {
        let blob = tempfile::tempdir().expect("blob root tempdir should be created");
        let blob_url = format!("file://{}", blob.path().display());
        let orders = PartitionKey::parse("orders").expect("key should be valid");
        let shard = domain::shard_of(&orders);
        let foreign = (0..1024_u32)
            .map(|attempt| format!("other-{attempt}"))
            .find(|candidate| {
                domain::shard_of(
                    &PartitionKey::parse(candidate.as_str()).expect("key should be valid"),
                ) != shard
            })
            .expect("some key should route elsewhere");

        let kernel = Kernel::open(config(&blob_url, shard.get()))
            .expect("kernel should open")
            .register::<RtDomain>()
            .expect("domain should register");
        let running = kernel
            .start(ArchiveExecutor {
                threshold: u64::MAX,
                external: Arc::new(Mutex::new(Vec::new())),
            })
            .await
            .expect("kernel should start");
        let error = running
            .submit(increment(&foreign, 1, 1))
            .await
            .expect_err("foreign partition should be refused");
        assert!(matches!(error, KernelError::NotOwned { .. }));
        running.shutdown().await.expect("shutdown should succeed");
    }
}
