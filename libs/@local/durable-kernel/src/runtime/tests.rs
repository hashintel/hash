use alloc::{collections::BTreeMap, sync::Arc};
use core::{convert::Infallible, num::NonZeroU64, time::Duration};
use std::sync::Mutex;

use error_stack::Report;
use serde::{Deserialize, Serialize};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

use super::{Kernel, KernelConfig, KernelError, RunningKernel, SnapshotPolicy, Submitted};
use crate::{
    domain::{
        self, DomainEvent, EventRecordV1, Executor, Fold, PartitionKey, ProjectionQuery, Retry,
        SimpleDomain,
    },
    ids::EffectId,
    keyspace::Namespace,
    registry::CompatError,
    routing::Shard,
    shard_log::{ShardLogOpenError, StorageConfigError},
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

    fn empty_projection() -> Self::Projection {
        Self
    }
}

impl Fold<InvalidJsonEvent> for InvalidJsonDomain {
    type Error = Infallible;
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
        owners: Vec::new(),
        shutdown: CancellationToken::new(),
    };
    let event = InvalidJsonEvent(BTreeMap::from([((1, 2), 3)]));
    let error = running
        .submit(event)
        .await
        .expect_err("JSON should reject a map with tuple keys");

    assert!(matches!(
        error.current_context(),
        KernelError::BuildEventRecord
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
        "`FoldError` should expose its report as a source"
    );
    let report: Report<KernelError> = Report::from(rejection);

    assert!(
        report.contains::<serde_json::Error>(),
        "the `FoldError` conversion should retain the JSON cause"
    );
    assert!(
        report.contains::<CompatError>(),
        "the `FoldError` conversion should retain the codec context"
    );
    assert_eq!(
        report.downcast_ref::<CodecAttempt>(),
        Some(&CodecAttempt(3))
    );
    assert!(
        format!("{report:?}").contains("codec diagnostic"),
        "the `FoldError` conversion should retain printable attachments"
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

struct ArchivedValues;

impl ProjectionQuery<RtCounters> for ArchivedValues {
    type Output = Vec<u64>;

    fn answer(self, projection: &RtCounters) -> Self::Output {
        projection.archived.clone()
    }
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
    type Error = CounterRejection;
    type Validated = RtEvent;

    fn validate(
        &self,
        event: &RtEvent,
    ) -> Result<Self::Validated, error_stack::Report<Self::Error>> {
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

    fn empty_projection() -> Self::Projection {
        RtCounters::default()
    }
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
    type Error = Infallible;

    fn plan<'a>(
        &'a self,
        projection: &'a RtCounters,
    ) -> impl IntoIterator<Item = ArchiveEffect> + 'a {
        projection
            .totals
            .iter()
            .filter(|(_, total)| **total >= self.threshold)
            .map(|(counter, &total)| ArchiveEffect {
                counter: counter.clone(),
                total,
            })
    }

    #[expect(
        clippy::unused_async_trait_impl,
        reason = "executor side effects run when the future is polled"
    )]
    async fn execute(&self, effect: &ArchiveEffect) -> Result<Vec<RtEvent>, Retry<Self::Error>> {
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
async fn registry_lives_until_running_kernel_shuts_down() {
    let blob = tempfile::tempdir().expect("blob root should be created");
    let partition = PartitionKey::parse("orders").expect("partition should parse");
    let kernel = Kernel::open(config(
        &format!("file://{}", blob.path().display()),
        partition.shard().get(),
    ))
    .expect("kernel should open");
    let registry = Arc::downgrade(&kernel.registry);
    let running = kernel
        .start(ArchiveExecutor {
            threshold: 10,
            external: Arc::new(Mutex::new(Vec::new())),
        })
        .await
        .expect("kernel should start");
    drop(kernel);

    running
        .submit(increment("orders", 1, 1))
        .await
        .expect("running kernel should retain its registered codec");
    assert!(registry.upgrade().is_some());

    running.shutdown().await.expect("shutdown should succeed");
    assert!(
        registry.upgrade().is_none(),
        "shutdown should release the registry after its last owner is dropped"
    );
}

#[tokio::test]
async fn effect_reintroduced_after_completion() {
    let blob = tempfile::tempdir().expect("blob root should be created");
    let partition = PartitionKey::parse("orders").expect("partition should parse");
    let external = Arc::new(Mutex::new(Vec::new()));
    let kernel = Kernel::open(config(
        &format!("file://{}", blob.path().display()),
        partition.shard().get(),
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
    wait_until(async || external.lock().expect("mutex should not be poisoned").len() == 3).await;
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
    let shard = orders.shard();
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
        "the effect should execute exactly once before the restart"
    );
    assert_eq!(
        running
            .read(&orders, |projection| projection.totals.clone())
            .await
            .expect("read should succeed"),
        BTreeMap::new(),
        "archiving should reset the counter"
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
            .query(&orders, ArchivedValues)
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
        KernelError::NoOwnedShards
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
        key.shard().get(),
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
        .read(domain::KernelProjection::through_sequence)
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

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("destination unavailable")]
struct DestinationUnavailable;

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
        type Error = DestinationUnavailable;

        fn plan<'a>(&'a self, projection: &'a RtCounters) -> impl IntoIterator<Item = u8> + 'a {
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
        async fn execute(&self, effect: &u8) -> Result<Vec<RtEvent>, Retry<Self::Error>> {
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
                    reason: Report::new(DestinationUnavailable),
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
        key.shard().get(),
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
        type Error = Infallible;

        fn plan<'a>(&'a self, projection: &'a RtCounters) -> impl IntoIterator<Item = ()> + 'a {
            projection.totals.contains_key("ready").then_some(())
        }

        fn execute(
            &self,
            (): &(),
        ) -> impl Future<Output = Result<Vec<RtEvent>, Retry<Self::Error>>> + Send {
            core::future::ready(Ok(vec![increment("ready", 2, 0)]))
        }
    }

    let blob = tempfile::tempdir().expect("blob directory should be created");
    let key = PartitionKey::parse("ready").expect("key should be valid");
    let other = PartitionKey::parse("orders").expect("key should be valid");
    assert_ne!(key.shard(), other.shard());
    let mut settings = config(
        &format!("file://{}", blob.path().display()),
        key.shard().get(),
    );
    settings.shards.push(other.shard());
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
    assert_eq!(
        report.current_context(),
        &KernelError::ShardDriver { shard: key.shard() }
    );
    let expected_effect = EffectId::for_effect(&()).expect("effect ID should encode");
    let expected_event = EventRecordV1::new(increment("ready", 2, 0))
        .expect("completion record should encode")
        .event_id();
    assert!(
        report.frames().any(|frame| matches!(
            frame.downcast_ref::<KernelError>(),
            Some(KernelError::CompletionEventRejected { effect_id, event_id })
                if *effect_id == expected_effect && *event_id == expected_event
        )),
        "driver failure should identify the rejected completion event and its effect"
    );
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
async fn startup_storage_source() {
    let directory = tempfile::tempdir().expect("test directory should be created");
    let path = directory.path().join("blocked");
    std::fs::write(&path, b"not a directory").expect("storage path should be blocked");
    let error = Kernel::open(config(&format!("file://{}", path.display()), 0))
        .expect("kernel configuration should be valid")
        .register::<RtDomain>()
        .expect("domain should register")
        .start(ArchiveExecutor {
            threshold: 1,
            external: Arc::new(Mutex::new(Vec::new())),
        })
        .await
        .err()
        .expect("a file at the storage root should prevent startup");

    assert!(matches!(
        error.current_context(),
        KernelError::ConfigureStorage { .. }
    ));
    assert!(matches!(
        error.downcast_ref::<StorageConfigError>(),
        Some(StorageConfigError::CreateLocalDirectory { path: failed_path }) if failed_path == &path
    ));
    assert_eq!(
        error
            .downcast_ref::<std::io::Error>()
            .expect("startup report should retain the filesystem cause")
            .kind(),
        std::io::ErrorKind::AlreadyExists
    );
}

#[tokio::test]
async fn failed_start_does_not_run_an_executor() {
    struct CountingPlanner(Arc<core::sync::atomic::AtomicUsize>);

    impl Executor<RtDomain> for CountingPlanner {
        type Effect = ();
        type Error = Infallible;

        fn plan<'a>(&'a self, _: &'a RtCounters) -> impl IntoIterator<Item = ()> + 'a {
            self.0.fetch_add(1, core::sync::atomic::Ordering::SeqCst);
            core::iter::empty()
        }

        async fn execute(&self, (): &()) -> Result<Vec<RtEvent>, Retry<Self::Error>> {
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
    let error = kernel
        .start(CountingPlanner(Arc::clone(&calls)))
        .await
        .err()
        .expect("blocked shard storage should prevent startup");
    assert!(matches!(
        error.downcast_ref::<ShardLogOpenError>(),
        Some(ShardLogOpenError::WriterTimeout { shard, .. }) if *shard == Shard::from_u8(1)
    ));
    assert!(
        error.contains::<tokio::time::error::Elapsed>(),
        "startup should retain the writer timeout cause"
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
        type Error = Infallible;

        fn plan<'a>(&'a self, _: &'a RtCounters) -> impl IntoIterator<Item = ()> + 'a {
            core::iter::once(())
        }

        async fn execute(&self, (): &()) -> Result<Vec<RtEvent>, Retry<Self::Error>> {
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
    let shard = orders.shard();
    let foreign = (0..1024_u32)
        .map(|attempt| format!("other-{attempt}"))
        .find(|candidate| {
            PartitionKey::parse(candidate.as_str())
                .expect("key should be valid")
                .shard()
                != shard
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
        .expect_err("foreign partition should be rejected");
    assert!(matches!(
        error.current_context(),
        KernelError::NotOwned { .. }
    ));
    running.shutdown().await.expect("shutdown should succeed");
}
