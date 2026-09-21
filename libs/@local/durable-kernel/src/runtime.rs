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
//! [`RunningKernel::shutdown`] waits for active effects and closes storage. Dropping it cancels
//! effect tasks and asks command loops to close. Recovery may repeat an external write whose
//! completion was not recorded.

use alloc::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};
use core::{
    num::{NonZeroU64, NonZeroUsize},
    time::Duration,
};

use error_stack::{Report, ResultExt as _};
use tokio::task::JoinHandle;
use tokio_util::{sync::CancellationToken, task::AbortOnDropHandle};

use crate::{
    domain::{self, EventRecordV1, Executor, Hosted, PartitionKey, SimpleDomain, effect_id},
    ids::EffectId,
    keyspace::{Keyspace, Namespace},
    routing::Shard,
    shard_log::{
        LogStorageOptions, OpenedShard, ShardCommandConfig, ShardCommandError,
        ShardCommandErrorKind, ShardCommandHandle, ShardCommandOutcome, ShardLogLocation,
        StateChangeFeed,
    },
};

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[error(ignore)]
/// A configuration, storage, or runtime failure returned in an [`error_stack::Report`].
pub enum KernelError {
    #[display("kernel configuration invalid: {_0}")]
    Config(String),
    #[display("kernel registration failed: {_0}")]
    Registration(String),
    #[display("kernel record invalid: {_0}")]
    InvalidEvent(String),
    #[display("kernel storage failed: {_0}")]
    Storage(String),
    #[display("shard command failed")]
    Command,
    #[display("partition routes to shard {shard}, which this kernel does not own")]
    NotOwned { shard: u16 },
    #[display("kernel internal failure: {_0}")]
    Internal(String),
}

impl From<ShardCommandError> for Report<KernelError> {
    fn from(error: ShardCommandError) -> Self {
        Report::new(error).change_context(KernelError::Command)
    }
}

impl<R: core::error::Error + Send + Sync + 'static> From<domain::FoldError<R>>
    for Report<KernelError>
{
    fn from(error: domain::FoldError<R>) -> Self {
        let context = KernelError::InvalidEvent("event validation failed".to_owned());
        match error {
            domain::FoldError::InvalidRecord(error) => error.change_context(context),
            domain::FoldError::Rejected {
                event_id,
                rejection,
            } => rejection.change_context(context).attach(event_id),
            error @ (domain::FoldError::ForeignShard { .. }
            | domain::FoldError::ConflictingReuse { .. }
            | domain::FoldError::NonIncreasingSequence { .. }) => {
                Report::new(error).change_context(context)
            }
        }
    }
}

/// Controls when a shard saves snapshots.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SnapshotPolicy {
    Disabled,
    /// Waits at least this many journal sequence positions between snapshot attempts.
    Every(NonZeroU64),
}

const DEFAULT_SNAPSHOT_INTERVAL: NonZeroU64 =
    NonZeroU64::new(512).expect("default snapshot interval should be nonzero");

#[derive(Debug, Clone)]
/// Storage and scheduling settings for the shards owned by this process.
///
/// [`new`](Self::new) supplies defaults. Set [`shards`](Self::shards) before opening a kernel.
pub struct KernelConfig {
    /// Every storage key starts with this namespace.
    pub name: Namespace,
    /// Storage location expressed as a local file URL or an S3 URL.
    pub blob_url: String,
    pub aws_region: Option<String>,
    /// The kernel rejects submissions routed outside these shards.
    pub shards: Vec<Shard>,
    pub snapshot_policy: SnapshotPolicy,
    /// Idle drivers wait this long. It is also the default retry delay.
    pub poll_interval: Duration,
    /// Maximum queued commands per shard. Submissions wait when the queue is full.
    pub channel_capacity: NonZeroUsize,
    /// Retry limit for appends known not to have reached storage.
    pub safe_append_retries: u32,
    pub block_cache_bytes: u64,
    pub meta_cache_bytes: u64,
}

impl KernelConfig {
    /// Enables snapshots and retries. Set [`shards`](Self::shards) before opening a kernel.
    ///
    /// ```
    /// use durable_kernel::{
    ///     domain::{PartitionKey, shard_of},
    ///     keyspace::Namespace,
    ///     runtime::{Kernel, KernelConfig},
    /// };
    ///
    /// let key = PartitionKey::parse("customers").expect("key should be valid");
    /// let name = Namespace::parse("customer-sync").expect("namespace should be valid");
    /// let mut config = KernelConfig::new(name, "file:///tmp/customer-sync");
    /// config.shards = vec![shard_of(&key)];
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

/// A validated configuration ready to open shard storage with [`start`](Self::start).
pub struct Kernel {
    config: KernelConfig,
    keyspace: Keyspace,
    shards: Vec<Shard>,
    shard_capacity: NonZeroU64,
}

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
        let shard_capacity = NonZeroU64::new(shards.len() as u64).ok_or_else(|| {
            Report::new(KernelError::Config(
                "at least one owned shard is required".to_owned(),
            ))
        })?;
        Ok(Self {
            keyspace: Keyspace::new(config.name.clone()),
            config,
            shards,
            shard_capacity,
        })
    }

    /// Registers the domain's record names and checks for conflicting codecs.
    ///
    /// # Errors
    ///
    /// Returns an error when the domain’s record declarations conflict with registered codecs.
    pub fn register<S: SimpleDomain>(self) -> Result<Self, Report<KernelError>> {
        domain::register::<S>().change_context_lazy(|| {
            KernelError::Registration("conflicting record declarations".to_owned())
        })?;
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
        domain::register::<S>().change_context_lazy(|| {
            KernelError::Registration("conflicting record declarations".to_owned())
        })?;
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
            shutdown,
        };
        let mut feeds = Vec::new();
        for &shard in &self.shards {
            let recovered = async {
                let location =
                    ShardLogLocation::for_kernel(shard, &self.keyspace.shard_log(shard), &storage)
                        .change_context_lazy(|| {
                            KernelError::Storage("invalid storage configuration".to_owned())
                        })?;
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
                        tracing::warn!(
                            ?close_error,
                            "failed to close shards after startup failure"
                        );
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
            let driver = AbortOnDropHandle::new(tokio::spawn(drive_shard::<S, X>(
                handle.clone(),
                state_changes,
                Arc::clone(&executor),
                DriverSettings {
                    poll_interval: self.config.poll_interval,
                    snapshot_policy: self.config.snapshot_policy,
                },
                running.shutdown.clone(),
            )));
            running.drivers.push(tokio::spawn(async move {
                let result = driver
                    .await
                    .unwrap_or_else(|error| {
                        Err(Report::new(error).change_context(KernelError::Internal(
                            "effect driver task failed".to_owned(),
                        )))
                    })
                    .attach_with(|| format!("shard: {}", handle.shard().get()));
                if let Err(error) = &result {
                    handle.stop_admission();
                    handle.cancel_owned_writer();
                    tracing::error!(?error, "effect driver failed; shard stopped");
                }
                result
            }));
        }
        Ok(running)
    }
}

#[derive(Debug)]
/// Whether a submitted event was rejected, newly stored, or already present in the journal.
pub enum Submitted<R> {
    /// Validation refused the event. It was not appended.
    Rejected(error_stack::Report<R>),
    Applied,
    AlreadyDurable,
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
    shutdown: CancellationToken,
}

impl<S: SimpleDomain> RunningKernel<S> {
    fn handle_for(
        &self,
        key: &PartitionKey,
    ) -> Result<&ShardCommandHandle<Hosted<S>>, Report<KernelError>> {
        let shard = domain::shard_of(key);
        self.shards.get(&shard.get()).ok_or_else(|| {
            Report::new(KernelError::NotOwned {
                shard: u16::from(shard.get()),
            })
        })
    }

    /// Submits an event and waits for it to become durable.
    ///
    /// An identical event returns [`Submitted::AlreadyDurable`]. Validation failures return
    /// [`Submitted::Rejected`] with the original report from
    /// [`Fold::validate`](crate::domain::Fold::validate), including its context and attachments.
    ///
    /// # Errors
    ///
    /// Returns an error if encoding fails, the process does not own the event’s shard, or the
    /// command loop fails.
    pub async fn submit(
        &self,
        event: S::Event,
    ) -> Result<Submitted<<S::Projection as domain::Fold<S::Event>>::Rejection>, Report<KernelError>>
    {
        let record = EventRecordV1::new(event).change_context_lazy(|| {
            KernelError::InvalidEvent("event record construction failed".to_owned())
        })?;
        let handle = self.handle_for(record.partition())?;
        match handle
            .propose(record)
            .await
            .change_context(KernelError::Command)?
        {
            ShardCommandOutcome::Applied { .. } => Ok(Submitted::Applied),
            ShardCommandOutcome::AlreadyDurable { .. } => Ok(Submitted::AlreadyDurable),
            ShardCommandOutcome::Rejected {
                rejection: domain::FoldError::Rejected { rejection, .. },
            } => Ok(Submitted::Rejected(rejection)),
            ShardCommandOutcome::Rejected { rejection } => Err(Report::from(rejection)),
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
    pub async fn read<R, F>(&self, key: &PartitionKey, read: F) -> Result<R, Report<KernelError>>
    where
        R: Send + 'static,
        F: FnOnce(&S::Projection) -> R + Send + 'static,
    {
        let handle = self.handle_for(key)?;
        handle
            .read(move |projection| read(projection.domain()))
            .await
            .change_context(KernelError::Command)
    }

    /// Snapshot sequence restored during recovery for each shard. A value of
    /// `None` means recovery replayed the full journal.
    #[must_use]
    pub const fn recovery_snapshots(&self) -> &BTreeMap<u8, Option<u64>> {
        &self.recovered_snapshots
    }

    /// Waits for active effects to return, then closes each shard writer.
    /// Executors must set request timeouts so shutdown can finish.
    ///
    /// # Errors
    ///
    /// Returns an error when a driver or shard loop failed while running or during shutdown.
    pub async fn shutdown(mut self) -> Result<(), Report<KernelError>> {
        self.shutdown.cancel();
        let mut first_error = None;
        for driver in &mut self.drivers {
            match driver.await {
                Ok(Ok(())) => {}
                Ok(Err(error)) => {
                    first_error.get_or_insert(error);
                }
                Err(join_error) => {
                    first_error.get_or_insert_with(|| {
                        Report::new(join_error)
                            .change_context(KernelError::Internal("runtime task failed".to_owned()))
                    });
                }
            }
        }
        for handle in self.shards.values() {
            if let Err(error) = handle.shutdown().await
                && error.current_context().kind != ShardCommandErrorKind::Closed
            {
                first_error.get_or_insert_with(|| error.change_context(KernelError::Command));
            }
        }
        for task in &mut self.loops {
            match task.await {
                Ok(Ok(())) => {}
                Ok(Err(error)) => {
                    first_error.get_or_insert_with(|| Report::from(error));
                }
                Err(join_error) => {
                    first_error.get_or_insert_with(|| {
                        Report::new(join_error)
                            .change_context(KernelError::Internal("runtime task failed".to_owned()))
                    });
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
    snapshot_policy: SnapshotPolicy,
}

fn settle_driver_error(
    error: Report<ShardCommandError>,
    shutdown: &CancellationToken,
) -> Result<(), Report<KernelError>> {
    if shutdown.is_cancelled() {
        Ok(())
    } else {
        Err(error.change_context(KernelError::Command))
    }
}

async fn execute_effect<S, X>(
    executor: Arc<X>,
    effect: X::Effect,
    id: &EffectId,
) -> Result<Result<Vec<S::Event>, domain::Retry>, Report<KernelError>>
where
    S: SimpleDomain,
    X: Executor<S>,
{
    match AbortOnDropHandle::new(tokio::spawn(async move { executor.execute(&effect).await })).await
    {
        Ok(outcome) => Ok(outcome),
        Err(error) if error.is_panic() => {
            tracing::warn!(%error, effect_id = %id, "effect panicked; retrying later");
            Ok(Err(domain::Retry {
                reason: "effect execution panicked".to_owned(),
                after: None,
            }))
        }
        Err(error) => Err(Report::new(error)
            .change_context(KernelError::Internal("effect task cancelled".to_owned()))),
    }
}

fn retain_planned_effects<E>(
    effects: &[(EffectId, E)],
    executed: &mut BTreeSet<EffectId>,
    retries: &mut BTreeMap<EffectId, tokio::time::Instant>,
) {
    let planned_ids: BTreeSet<_> = effects.iter().map(|(id, _)| *id).collect();
    executed.retain(|id| planned_ids.contains(id));
    retries.retain(|id, _| planned_ids.contains(id));
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
) -> Result<(), Report<KernelError>>
where
    S: SimpleDomain,
    X: Executor<S>,
{
    let mut executed: BTreeSet<EffectId> = BTreeSet::new();
    let mut retries = BTreeMap::<EffectId, tokio::time::Instant>::new();
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
            Err(error) => return settle_driver_error(error, &shutdown),
        };
        let effects = effects
            .into_iter()
            .map(|effect| effect_id(&effect).map(|id| (id, effect)))
            .collect::<Result<Vec<_>, _>>()
            .change_context_lazy(|| {
                KernelError::Internal("effect identity serialization failed".to_owned())
            })?;
        retain_planned_effects(&effects, &mut executed, &mut retries);
        let mut progressed = false;
        for (id, effect) in effects {
            if shutdown.is_cancelled() {
                return Ok(());
            }
            if executed.contains(&id)
                || retries
                    .get(&id)
                    .is_some_and(|deadline| *deadline > tokio::time::Instant::now())
            {
                continue;
            }
            match execute_effect::<S, X>(Arc::clone(&executor), effect, &id).await? {
                Ok(events) => {
                    for event in events {
                        let record = EventRecordV1::new(event).change_context_lazy(|| {
                            KernelError::InvalidEvent("event record construction failed".to_owned())
                        })?;
                        match handle.propose(record).await {
                            Ok(
                                ShardCommandOutcome::Applied { .. }
                                | ShardCommandOutcome::AlreadyDurable { .. },
                            ) => {}
                            Ok(ShardCommandOutcome::Rejected { rejection }) => {
                                return Err(Report::from(rejection)
                                    .attach("effect completion event was rejected")
                                    .attach(format!("effect ID: {id}")));
                            }
                            Err(error) => return settle_driver_error(error, &shutdown),
                        }
                    }
                    retries.remove(&id);
                    executed.insert(id);
                    progressed = true;
                }
                Err(retry) => {
                    tracing::debug!(reason = %retry.reason, "effect execution retries later");
                    let deadline = tokio::time::Instant::now()
                        .checked_add(retry.after.unwrap_or(settings.poll_interval))
                        .ok_or_else(|| {
                            Report::new(KernelError::Internal(
                                "effect retry delay is out of range".to_owned(),
                            ))
                        })?;
                    retries.insert(id, deadline);
                }
            }
        }
        maybe_snapshot(&handle, settings.snapshot_policy).await;
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

async fn maybe_snapshot<S: SimpleDomain>(
    handle: &ShardCommandHandle<Hosted<S>>,
    policy: SnapshotPolicy,
) {
    let SnapshotPolicy::Every(interval) = policy else {
        return;
    };
    match handle.capture_snapshot(interval.get()).await {
        Ok(Some(payload)) => {
            let record = payload.into_record(chrono::Utc::now());
            if let Err(error) = handle.commit_snapshot(record).await {
                tracing::warn!(error = ?error, "snapshot save failed; recovery will replay more events");
            }
        }
        Ok(None) => {}
        Err(error) => {
            tracing::debug!(error = ?error, "snapshot capture unavailable");
        }
    }
}

#[cfg(test)]
mod tests {
    use alloc::{collections::BTreeMap, sync::Arc};
    use core::{convert::Infallible, num::NonZeroU64, time::Duration};
    use std::sync::Mutex;

    use error_stack::Report;
    use serde::{Deserialize, Serialize};
    use tokio::task::JoinHandle;
    use tokio_util::sync::CancellationToken;

    use super::{Kernel, KernelConfig, KernelError, RunningKernel, SnapshotPolicy, Submitted};
    use crate::{
        domain::{self, DomainEvent, Executor, Fold, PartitionKey, Retry, SimpleDomain},
        keyspace::Namespace,
        registry::CompatError,
        routing::Shard,
        shard_log::{ShardCommandError, ShardCommandErrorKind},
    };

    #[derive(Debug, Clone, Serialize, Deserialize)]
    struct InvalidJsonEvent(BTreeMap<(u8, u8), u8>);

    impl DomainEvent for InvalidJsonEvent {
        fn name() -> &'static str {
            "invalid_json_event"
        }

        fn partition(&self) -> PartitionKey {
            PartitionKey::parse("orders").expect("partition should be valid")
        }
    }

    #[derive(Default, Clone, Serialize, Deserialize)]
    struct InvalidJsonDomain;

    impl SimpleDomain for InvalidJsonDomain {
        type Event = InvalidJsonEvent;
        type Projection = Self;
    }

    impl Fold<InvalidJsonEvent> for InvalidJsonDomain {
        type Rejection = Infallible;
        type Validated = ();

        fn validate(&self, _: &InvalidJsonEvent) -> Result<(), Report<Infallible>> {
            Ok(())
        }

        fn apply(&mut self, (): ()) {}

        fn replay(&mut self, _: &InvalidJsonEvent) {}
    }

    #[tokio::test]
    async fn invalid_event_source() {
        let running = RunningKernel::<InvalidJsonDomain> {
            shards: BTreeMap::new(),
            recovered_snapshots: BTreeMap::new(),
            drivers: Vec::new(),
            loops: Vec::new(),
            shutdown: CancellationToken::new(),
        };
        let event = InvalidJsonEvent(BTreeMap::from([((1, 2), 3)]));
        let error = running
            .submit(event)
            .await
            .expect_err("JSON should reject a map with tuple keys");

        assert!(matches!(
            error.current_context(),
            KernelError::InvalidEvent(_)
        ));
        assert!(matches!(
            error.downcast_ref::<CompatError>(),
            Some(CompatError::Encode {
                name: "invalid_json_event",
            })
        ));
        let source = error
            .downcast_ref::<serde_json::Error>()
            .expect("serialization error should remain available through the runtime context");
        assert!(
            source.is_syntax(),
            "tuple keys should retain the JSON syntax error"
        );
    }

    #[test]
    fn fold_error_sources() {
        #[derive(Debug, PartialEq, Eq)]
        struct CodecAttempt(u32);

        let source = serde_json::to_value(InvalidJsonEvent(BTreeMap::from([((1, 2), 3)])))
            .expect_err("tuple keys should fail encoding");
        let report = Report::new(source)
            .change_context(CompatError::Encode {
                name: InvalidJsonEvent::name(),
            })
            .attach("codec diagnostic")
            .attach_opaque(CodecAttempt(3));
        let rejection = domain::FoldError::<Infallible>::from(report);
        assert!(
            core::error::Error::source(&rejection).is_some(),
            "fold error should expose its report as a source"
        );
        let report: Report<KernelError> = Report::from(rejection);

        assert!(
            report.contains::<serde_json::Error>(),
            "fold conversion should retain the JSON cause"
        );
        assert!(
            report.contains::<CompatError>(),
            "fold conversion should retain the codec context"
        );
        assert_eq!(
            report.downcast_ref::<CodecAttempt>(),
            Some(&CodecAttempt(3))
        );
        assert!(
            format!("{report:?}").contains("codec diagnostic"),
            "fold conversion should retain printable attachments"
        );
    }

    #[test]
    fn command_failure_source() {
        let source = ShardCommandError {
            kind: ShardCommandErrorKind::Closed,
            message: "command queue is closed".to_owned(),
        };
        let error: Report<KernelError> = Report::from(source.clone());

        assert_eq!(error.downcast_ref::<ShardCommandError>(), Some(&source));
        assert_eq!(
            format!("{error:?}").matches(&source.message).count(),
            1,
            "source message should appear once in the report"
        );
    }

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

    #[derive(Debug, derive_more::Display, derive_more::Error)]
    enum CounterRejection {
        #[display("increment for {counter} must be nonzero")]
        ZeroIncrement { counter: String },
    }

    #[derive(Debug, derive_more::Display, derive_more::Error)]
    #[display("invalid increment amount: {amount}")]
    struct InvalidAmount {
        amount: u64,
    }

    #[derive(Debug, derive_more::Display)]
    #[display("counter: {_0}")]
    struct RejectedCounter(String);

    impl Fold<RtEvent> for RtCounters {
        type Rejection = CounterRejection;
        type Validated = RtEvent;

        fn validate(
            &self,
            event: &RtEvent,
        ) -> Result<Self::Validated, error_stack::Report<Self::Rejection>> {
            match event {
                RtEvent::Incremented {
                    counter, amount: 0, ..
                } => Err(error_stack::Report::new(InvalidAmount { amount: 0 })
                    .change_context(CounterRejection::ZeroIncrement {
                        counter: counter.clone(),
                    })
                    .attach(RejectedCounter(counter.clone()))),
                RtEvent::Incremented { .. } | RtEvent::Archived { .. } => Ok(event.clone()),
            }
        }

        fn apply(&mut self, validated: Self::Validated) {
            self.replay(&validated);
        }

        fn replay(&mut self, event: &RtEvent) {
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
                .filter(|(_, total)| **total >= self.threshold)
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
        let mut config = KernelConfig::new(
            Namespace::parse("kernelapp").expect("test namespace should be valid"),
            blob_url,
        );
        config.aws_region = std::env::var("AWS_REGION")
            .or_else(|_missing| std::env::var("AWS_DEFAULT_REGION"))
            .ok();
        config.shards = vec![Shard::from_u8(shard)];
        config.poll_interval = Duration::from_millis(20);
        config.snapshot_policy =
            SnapshotPolicy::Every(NonZeroU64::new(2).expect("test interval should be nonzero"));
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

    #[tokio::test]
    async fn effect_reintroduced_after_completion() {
        let blob = tempfile::tempdir().expect("blob root should be created");
        let partition = PartitionKey::parse("orders").expect("partition should parse");
        let external = Arc::new(Mutex::new(Vec::new()));
        let kernel = Kernel::open(config(
            &format!("file://{}", blob.path().display()),
            domain::shard_of(&partition).get(),
        ))
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
        running
            .submit(increment("orders", 1, 10))
            .await
            .expect("first event should apply");
        wait_until(async || {
            running
                .read(&partition, |state| state.archived.len())
                .await
                .expect("state should be readable")
                == 1
        })
        .await;
        // A different total makes the driver observe a plan without the first effect.
        running
            .submit(increment("orders", 2, 11))
            .await
            .expect("second event should apply");
        wait_until(async || {
            running
                .read(&partition, |state| state.archived.len())
                .await
                .expect("state should be readable")
                == 2
        })
        .await;
        running
            .submit(increment("orders", 3, 10))
            .await
            .expect("third event should apply");
        wait_until(async || external.lock().expect("mutex should not be poisoned").len() == 3)
            .await;
        running.shutdown().await.expect("shutdown should succeed");
    }

    /// Checks recovery using an S3-compatible endpoint.
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

        assert!(matches!(
            running
                .submit(increment("orders", 1, 6))
                .await
                .expect("submit should succeed"),
            Submitted::Applied
        ));
        assert!(matches!(
            running
                .submit(increment("orders", 2, 5))
                .await
                .expect("submit should succeed"),
            Submitted::Applied
        ));
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
        assert!(matches!(
            running
                .submit(increment("orders", 1, 6))
                .await
                .expect("resubmit should succeed"),
            Submitted::AlreadyDurable
        ));
        running.shutdown().await.expect("shutdown should succeed");

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
            "recovery should load a saved snapshot"
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
            "an effect with a saved completion should not run again after restart"
        );
        running
            .shutdown()
            .await
            .expect("shutdown after restart should succeed");
    }

    #[test]
    fn open_empty_shards() {
        let mut settings = config("file:///unused", 0);
        settings.shards.clear();
        let Err(report) = Kernel::open(settings) else {
            panic!("an empty shard selection should be rejected");
        };
        assert!(matches!(
            report.current_context(),
            KernelError::Config(message) if message == "at least one owned shard is required"
        ));
    }

    #[test]
    fn open_duplicate_shards() {
        let mut settings = config("file:///unused", 0);
        settings.shards = vec![Shard::from_u8(2), Shard::from_u8(1), Shard::from_u8(2)];
        let kernel = Kernel::open(settings).expect("repeated shards should be accepted");
        assert_eq!(
            kernel.shards,
            vec![Shard::from_u8(1), Shard::from_u8(2)],
            "shards should be opened once in sorted order"
        );
        assert_eq!(kernel.shard_capacity.get(), 2);
    }

    #[tokio::test]
    async fn rejection_preserves_context_and_attachments() {
        let blob = tempfile::tempdir().expect("blob directory should be created");
        let key = PartitionKey::parse("orders").expect("partition key should be valid");
        let kernel = Kernel::open(config(
            &format!("file://{}", blob.path().display()),
            domain::shard_of(&key).get(),
        ))
        .expect("kernel configuration should be valid")
        .register::<RtDomain>()
        .expect("domain should register");
        let running = kernel
            .start(ArchiveExecutor {
                threshold: 10,
                external: Arc::new(Mutex::new(Vec::new())),
            })
            .await
            .expect("kernel should start");

        for _attempt in 0..2 {
            let outcome = running
                .submit(increment("orders", 1, 0))
                .await
                .expect("validation should return a submission outcome");
            let Submitted::Rejected(report) = outcome else {
                panic!("zero increment should be rejected");
            };
            assert!(
                matches!(report.current_context(), CounterRejection::ZeroIncrement { counter } if counter == "orders")
            );
            assert_eq!(
                report
                    .downcast_ref::<InvalidAmount>()
                    .expect("original error should survive submission")
                    .amount,
                0
            );
            assert_eq!(
                report
                    .downcast_ref::<RejectedCounter>()
                    .expect("typed attachment should survive submission")
                    .0,
                "orders"
            );
        }
        let through = running
            .handle_for(&key)
            .expect("shard should be owned")
            .read(domain::KernelProjection::through_log_sequence)
            .await
            .expect("read should succeed");
        assert_eq!(
            through, None,
            "rejections should not append journal records"
        );
        assert!(
            running
                .read(&key, |state| state.totals.is_empty())
                .await
                .expect("read should succeed"),
            "rejections should leave state unchanged"
        );
        assert!(matches!(
            running
                .submit(increment("orders", 2, 1))
                .await
                .expect("valid submission should succeed"),
            Submitted::Applied
        ));
        running.shutdown().await.expect("shutdown should succeed");
    }

    #[tokio::test]
    async fn retry_delay_allows_other_effects_to_complete() {
        check_retry_order(false).await;
    }

    #[tokio::test]
    async fn effect_panic_retry_order() {
        check_retry_order(true).await;
    }

    async fn check_retry_order(panic_first: bool) {
        struct RetryingExecutor {
            attempts: Arc<Mutex<Vec<(u8, tokio::time::Instant)>>>,
            panic_first: bool,
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
                let first = attempts.len() == 1;
                drop(attempts);
                if first {
                    assert!(!self.panic_first, "injected effect panic");
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
        let mut settings = config(
            &format!("file://{}", blob.path().display()),
            domain::shard_of(&key).get(),
        );
        settings.poll_interval = Duration::from_millis(200);
        let running = Kernel::open(settings)
            .expect("kernel should open")
            .register::<RtDomain>()
            .expect("domain should register")
            .start(RetryingExecutor {
                attempts: Arc::clone(&attempts),
                panic_first,
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
    async fn completion_rejection_stops_affected_shard() {
        struct RejectingExecutor;

        impl Executor<RtDomain> for RejectingExecutor {
            type Effect = ();

            fn plan(&self, projection: &RtCounters) -> Vec<()> {
                if projection.totals.contains_key("ready") {
                    vec![()]
                } else {
                    Vec::new()
                }
            }

            fn execute(&self, (): &()) -> impl Future<Output = Result<Vec<RtEvent>, Retry>> + Send {
                core::future::ready(Ok(vec![increment("ready", 2, 0)]))
            }
        }

        let blob = tempfile::tempdir().expect("blob directory should be created");
        let key = PartitionKey::parse("ready").expect("key should be valid");
        let other = PartitionKey::parse("orders").expect("key should be valid");
        assert_ne!(domain::shard_of(&key), domain::shard_of(&other));
        let mut settings = config(
            &format!("file://{}", blob.path().display()),
            domain::shard_of(&key).get(),
        );
        settings.shards.push(domain::shard_of(&other));
        let running = Kernel::open(settings)
            .expect("kernel should open")
            .register::<RtDomain>()
            .expect("domain should register")
            .start(RejectingExecutor)
            .await
            .expect("kernel should start");
        running
            .submit(increment("ready", 1, 1))
            .await
            .expect("event should be durable");
        wait_until(async || running.read(&key, |_| ()).await.is_err()).await;
        let stopped = running
            .submit(increment("ready", 3, 1))
            .await
            .expect_err("failed shard should reject submissions");
        assert!(matches!(stopped.current_context(), KernelError::Command));
        assert!(matches!(
            running
                .submit(increment("orders", 1, 1))
                .await
                .expect("other shard should accept events"),
            Submitted::Applied
        ));
        let report = running
            .shutdown()
            .await
            .expect_err("shutdown should report the rejected completion");
        assert!(matches!(
            report.current_context(),
            KernelError::InvalidEvent(_)
        ));
        assert!(
            matches!(report.downcast_ref::<CounterRejection>(), Some(CounterRejection::ZeroIncrement { counter }) if counter == "ready")
        );
        assert_eq!(
            report
                .downcast_ref::<InvalidAmount>()
                .expect("rejection cause should survive")
                .amount,
            0
        );
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
        settings.shards = vec![Shard::from_u8(0), Shard::from_u8(1)];
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
        assert!(matches!(
            error.current_context(),
            KernelError::NotOwned { .. }
        ));
        running.shutdown().await.expect("shutdown should succeed");
    }
}
