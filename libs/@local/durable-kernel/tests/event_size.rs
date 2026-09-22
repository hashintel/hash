use core::{
    convert::Infallible,
    future::{Future, ready},
};

use durable_kernel::{
    DurableError,
    domain::{
        DomainEvent, EventRecord, EventRecordV1, Executor, Fold, PartitionKey, Retry, SimpleDomain,
        shard_of,
    },
    keyspace::Namespace,
    registry::CompatError,
    runtime::{Kernel, KernelConfig, SnapshotPolicy, Submitted},
    shard_log::{AppendFailureKind, ShardAppendError, ShardCommandError, ShardCommandErrorKind},
};
use error_stack::Report;
use serde::{Deserialize, Serialize};

const MAX_RECORD_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
struct Payload(String);

impl DomainEvent for Payload {
    fn name() -> &'static str {
        "event_size_test_payload"
    }

    fn partition(&self) -> PartitionKey {
        PartitionKey::parse("payloads").expect("test partition should be valid")
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct PayloadCount(usize);

impl Fold<Payload> for PayloadCount {
    type Rejection = Infallible;
    type Validated = usize;

    fn validate(&self, _: &Payload) -> Result<Self::Validated, Report<Infallible>> {
        Ok(self.0 + 1)
    }

    fn apply(&mut self, validated: Self::Validated) {
        self.0 = validated;
    }

    fn replay(&mut self, _: &Payload) {
        self.0 += 1;
    }
}

struct PayloadDomain;

impl SimpleDomain for PayloadDomain {
    type Event = Payload;
    type Projection = PayloadCount;

    fn empty_projection() -> Self::Projection {
        PayloadCount(0)
    }
}

struct NoEffects;

impl Executor<PayloadDomain> for NoEffects {
    type Effect = ();
    type Error = Infallible;

    fn plan<'a>(&'a self, _: &'a PayloadCount) -> impl IntoIterator<Item = ()> + 'a {
        core::iter::empty()
    }

    fn execute(
        &self,
        (): &(),
    ) -> impl Future<Output = Result<Vec<Payload>, Retry<Self::Error>>> + Send {
        ready(Ok(Vec::new()))
    }
}

fn record(payload: Payload) -> EventRecord<Payload> {
    EventRecord::V1(EventRecordV1::new(payload).expect("payload identity should be computed"))
}

fn encode(
    record: &impl durable_kernel::registry::DurableRecord,
) -> Result<Vec<u8>, Report<CompatError>> {
    let mut bytes = Vec::new();
    record.encode(&mut bytes)?;
    Ok(bytes)
}

fn payload_at_limit() -> Payload {
    let overhead = encode(&record(Payload(String::new())))
        .expect("empty payload should encode")
        .len();
    Payload("x".repeat(MAX_RECORD_BYTES - overhead))
}

#[test]
fn record_size_boundary() {
    let payload = payload_at_limit();
    let encoded =
        encode(&record(Payload(payload.0.clone()))).expect("record at the limit should encode");
    assert_eq!(encoded.len(), MAX_RECORD_BYTES);
    let EventRecord::V1(decoded) = EventRecord::<Payload>::decode_borrowed(&encoded)
        .expect("record at the limit should decode");
    assert_eq!(decoded.event(), &payload);

    let oversized = record(Payload(format!("{}x", payload.0)));
    let error =
        encode(&oversized).expect_err("record one byte over the limit should fail encoding");
    let expected = CompatError::TooLarge {
        name: Payload::name(),
        actual_bytes: MAX_RECORD_BYTES + 1,
        max_bytes: MAX_RECORD_BYTES,
    };
    assert_eq!(error.current_context(), &expected);
    let bytes = serde_json::to_vec(&oversized).expect("oversized fixture should serialize");
    assert_eq!(bytes.len(), MAX_RECORD_BYTES + 1);
    let error = EventRecord::<Payload>::decode_borrowed(&bytes)
        .expect_err("record one byte over the limit should fail decoding");
    assert_eq!(error.current_context(), &expected);
}

#[tokio::test]
async fn oversized_submission_preserves_recovery() {
    let directory = tempfile::tempdir().expect("storage directory should be created");
    let payload = payload_at_limit();
    let key = payload.partition();
    let mut config = KernelConfig::new(
        Namespace::parse("event-size-test").expect("test namespace should be valid"),
        format!("file://{}", directory.path().display()),
    );
    config.shards = vec![shard_of(&key)];
    config.snapshot_policy = SnapshotPolicy::Disabled;
    config.safe_append_retries = 0;
    let kernel = Kernel::open(config)
        .expect("configuration should be valid")
        .register::<PayloadDomain>()
        .expect("domain should register");
    let running = kernel.start(NoEffects).await.expect("kernel should start");
    let error = running
        .submit(Payload(format!("{}x", payload.0)))
        .await
        .expect_err("oversized submission should fail before append");
    assert_eq!(
        error
            .downcast_ref::<ShardCommandError>()
            .expect("submission failure should retain the command error")
            .kind(),
        ShardCommandErrorKind::DefinitelyNotCommitted
    );
    assert_eq!(
        error
            .downcast_ref::<ShardAppendError>()
            .expect("submission failure should retain append classification")
            .kind,
        AppendFailureKind::DefinitelyNotCommitted
    );
    assert!(
        matches!(error.downcast_ref::<CompatError>(), Some(CompatError::TooLarge { actual_bytes, max_bytes, .. }) if *actual_bytes == MAX_RECORD_BYTES + 1 && *max_bytes == MAX_RECORD_BYTES),
        "submission failure should retain the codec error"
    );
    assert_eq!(
        error.downcast_ref::<DurableError>(),
        Some(&DurableError::EncodeRecord {
            name: Payload::name()
        }),
        "submission failure should identify the record encoding operation"
    );
    assert_eq!(
        running
            .read(&key, |state| state.0)
            .await
            .expect("state should be readable"),
        0
    );
    assert!(matches!(
        running
            .submit(payload)
            .await
            .expect("record at the limit should be accepted"),
        Submitted::Applied
    ));
    running.shutdown().await.expect("kernel should shut down");

    let recovered = kernel
        .start(NoEffects)
        .await
        .expect("accepted events should recover without snapshots");
    assert!(
        recovered.recovery_snapshots().values().all(Option::is_none),
        "disabled snapshots should leave recovery to the journal"
    );
    assert_eq!(
        recovered
            .read(&key, |state| state.0)
            .await
            .expect("recovered state should be readable"),
        1
    );
    recovered
        .shutdown()
        .await
        .expect("recovered kernel should shut down");
}
