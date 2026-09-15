use core::{
    convert::Infallible,
    future::{Future, ready},
};

use durable_kernel::{
    domain::{
        DomainEvent, EventRecord, EventRecordV1, Executor, Fold, PartitionKey, Retry, SimpleDomain,
        shard_of,
    },
    registry::DurableRecord as _,
    runtime::{Kernel, KernelConfig, Submitted},
    shard_log::{ShardCommandError, ShardCommandErrorKind},
};
use error_stack::Report;
use serde::{Deserialize, Serialize};

const MAX_RECORD_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct Payload(String);

impl DomainEvent for Payload {
    fn name() -> &'static str {
        "event_size_test_payload"
    }

    fn partition(&self) -> PartitionKey {
        PartitionKey::parse("payloads").expect("test partition should be valid")
    }
}

#[derive(Clone, Default, Serialize, Deserialize)]
struct PayloadCount(usize);

impl Fold<Payload> for PayloadCount {
    type Rejection = Infallible;

    fn validate(&self, _: &Payload) -> Result<(), Report<Infallible>> {
        Ok(())
    }

    fn apply(&mut self, _: &Payload) {
        self.0 += 1;
    }
}

struct PayloadDomain;

impl SimpleDomain for PayloadDomain {
    type Event = Payload;
    type Projection = PayloadCount;
}

struct NoEffects;

impl Executor<PayloadDomain> for NoEffects {
    type Effect = ();

    fn plan(&self, _: &PayloadCount) -> Vec<()> {
        Vec::new()
    }

    fn execute(&self, (): &()) -> impl Future<Output = Result<Vec<Payload>, Retry>> + Send {
        ready(Ok(Vec::new()))
    }
}

fn record(payload: Payload) -> EventRecord<Payload> {
    EventRecord::V1(EventRecordV1::new(payload).expect("payload identity should be computed"))
}

fn payload_at_limit() -> Payload {
    let overhead = record(Payload(String::new()))
        .encode()
        .expect("empty payload should encode")
        .len();
    Payload("x".repeat(MAX_RECORD_BYTES - overhead))
}

#[test]
fn record_size_boundary() {
    let payload = payload_at_limit();
    let encoded = record(payload.clone())
        .encode()
        .expect("record at the limit should encode");
    assert_eq!(encoded.len(), MAX_RECORD_BYTES);
    let EventRecord::V1(decoded) =
        EventRecord::<Payload>::decode(&encoded).expect("record at the limit should decode");
    assert_eq!(decoded.event, payload);

    let oversized = record(Payload(format!("{}x", payload.0)));
    oversized
        .encode()
        .expect_err("record one byte over the limit should fail encoding");
    let bytes = serde_json::to_vec(&oversized).expect("oversized fixture should serialize");
    assert_eq!(bytes.len(), MAX_RECORD_BYTES + 1);
    EventRecord::<Payload>::decode(&bytes)
        .expect_err("record one byte over the limit should fail decoding");
}

#[tokio::test]
async fn oversized_submission_preserves_recovery() {
    let directory = tempfile::tempdir().expect("storage directory should be created");
    let payload = payload_at_limit();
    let key = payload.partition();
    let mut config = KernelConfig::new(
        "event-size-test",
        format!("file://{}", directory.path().display()),
    );
    config.shards = vec![u16::from(shard_of(&key).get())];
    config.snapshot_every_events = 0;
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
            .kind,
        ShardCommandErrorKind::DefinitelyNotCommitted
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
