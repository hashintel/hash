use alloc::{collections::BTreeMap, rc::Rc, sync::Arc};
use core::{
    future::poll_fn,
    marker::PhantomData,
    num::{NonZeroU64, NonZeroUsize},
    task::Poll,
    time::Duration,
};

use chrono::{DateTime, Utc};
use error_stack::Report;
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::{
    DomainEvent, EventRecord, EventRecordV1, Fold, FoldError, Hosted, InvalidPartitionKey,
    KernelProjection, MAX_PARTITION_KEY_BYTES, PartitionKey, ProjectionSnapshot, RecoveryError,
    SimpleDomain, register, snapshot::MAX_SNAPSHOT_BYTES,
};
use crate::{
    DurableError,
    ids::{EffectId, EventId, JournalRecordDigest},
    port::{EventDomain as _, Prepared, SnapshotDomain as _},
    registry::{self, CompatError, DurableRecord as _, RecordRegistry, VersionedRecord as _},
    routing::Shard,
    sequence::JournalSequence,
    shard_log::{
        AppendFailureKind, JournalStorage, LogStorageOptions, OpenedShard, QueuedWhenStopped,
        RecoveredShard, ShardAppendError, ShardCommandConfig, ShardCommandError,
        ShardCommandErrorKind, ShardCommandOutcome, ShardLogLocation, StartedShard,
    },
    sim::{SimAppendOutcome, SimAppendResult, SimKey, SimLogHandle},
};

fn encode(record: &impl registry::DurableRecord) -> Result<Vec<u8>, Report<CompatError>> {
    let mut bytes = Vec::new();
    record.encode(&mut bytes)?;
    Ok(bytes)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum CounterEvent {
    Incremented { counter: String, amount: u64 },
    Reset { counter: String },
}

impl CounterEvent {
    fn counter(&self) -> &str {
        match self {
            Self::Incremented { counter, .. } | Self::Reset { counter } => counter,
        }
    }
}

impl DomainEvent for CounterEvent {
    fn name() -> &'static str {
        "toy_counter_event"
    }

    fn partition(&self) -> PartitionKey {
        PartitionKey::parse(self.counter()).expect("test counters should be valid keys")
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct BorrowedEvent<'a> {
    counter: &'a str,
    amount: u64,
    #[serde(skip)]
    local: PhantomData<Rc<()>>,
}

impl DomainEvent for BorrowedEvent<'_> {
    fn name() -> &'static str {
        "borrowed_counter_event"
    }

    fn partition(&self) -> PartitionKey {
        PartitionKey::parse(self.counter).expect("test counter should be a valid key")
    }
}

#[derive(Serialize, Deserialize)]
struct U128Event {
    amount: u128,
}

impl DomainEvent for U128Event {
    fn name() -> &'static str {
        "u128_event"
    }

    fn partition(&self) -> PartitionKey {
        PartitionKey::parse("orders").expect("test partition should be valid")
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
struct Counters {
    totals: BTreeMap<String, u64>,
}

struct CounterChange {
    counter: String,
    total: Option<u64>,
}

impl Counters {
    fn change_for(&self, event: &CounterEvent) -> CounterChange {
        let total = match event {
            CounterEvent::Incremented { counter, amount } => Some(
                self.totals
                    .get(counter)
                    .copied()
                    .unwrap_or(0)
                    .saturating_add(*amount),
            ),
            CounterEvent::Reset { .. } => None,
        };
        CounterChange {
            counter: event.counter().to_owned(),
            total,
        }
    }
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
enum CounterRejection {
    #[display("increment must be nonzero")]
    ZeroIncrement,
    #[display("adding {increment} to {current} would overflow the counter")]
    Overflow { current: u64, increment: u64 },
}

impl Fold<CounterEvent> for Counters {
    type Error = CounterRejection;
    type Validated = CounterChange;

    fn validate(&self, event: &CounterEvent) -> Result<Self::Validated, Report<Self::Error>> {
        match event {
            CounterEvent::Incremented { amount: 0, .. } => {
                Err(Report::new(CounterRejection::ZeroIncrement))
            }
            CounterEvent::Incremented { counter, amount } => {
                let current = self.totals.get(counter).copied().unwrap_or(0);
                if current.checked_add(*amount).is_none() {
                    Err(Report::new(CounterRejection::Overflow {
                        current,
                        increment: *amount,
                    }))
                } else {
                    Ok(self.change_for(event))
                }
            }
            CounterEvent::Reset { .. } => Ok(self.change_for(event)),
        }
    }

    fn apply(&mut self, validated: Self::Validated) {
        let CounterChange { counter, total } = validated;
        match total {
            Some(total) => {
                self.totals.insert(counter, total);
            }
            None => {
                self.totals.remove(&counter);
            }
        }
    }

    fn replay(&mut self, event: &CounterEvent) {
        self.apply(self.change_for(event));
    }
}

struct ToyDomain;

impl SimpleDomain for ToyDomain {
    type Event = CounterEvent;
    type Projection = Counters;

    fn empty_projection() -> Self::Projection {
        Counters::default()
    }
}

type Toy = Hosted<ToyDomain>;

fn incremented(counter: &str, amount: u64) -> EventRecordV1<CounterEvent> {
    EventRecordV1::new(CounterEvent::Incremented {
        counter: counter.to_owned(),
        amount,
    })
    .expect("toy event should be valid")
}

fn toy_log_path(shard: Shard) -> String {
    format!("domain-toy/control/v1/shards/{}/log", shard.path_segment())
}

fn local_location(shard: Shard, root: &std::path::Path) -> ShardLogLocation {
    ShardLogLocation::for_kernel(
        shard,
        &toy_log_path(shard),
        &LogStorageOptions {
            blob_url: format!("file://{}", root.display()),
            aws_region: None,
            shard_capacity: NonZeroU64::MIN,
            block_cache_bytes: 0,
            meta_cache_bytes: 0,
        },
        Arc::default(),
    )
    .expect("local test storage should be configured")
}

fn with_seen(
    projection: &KernelProjection<Counters>,
    seen: BTreeMap<EventId, JournalRecordDigest>,
) -> KernelProjection<Counters> {
    KernelProjection::restored(
        seen,
        projection.partitions().clone(),
        projection
            .through_sequence()
            .expect("an applied event should set the journal sequence"),
        projection.domain().clone(),
    )
}

async fn start(
    location: ShardLogLocation<impl JournalStorage>,
) -> (crate::shard_log::ShardCommandHandle<Toy>, StartedShard<Toy>) {
    let opened = OpenedShard::open(location)
        .await
        .expect("shard should open");
    let recovered: RecoveredShard<Toy, _> = opened.recover().await.expect("shard should recover");
    let started = recovered.enable(ShardCommandConfig::default());
    (started.handle.clone(), started)
}

#[test]
fn effect_id_wire_format() {
    let effect = json!({ "customer_id": "customer-1", "name": "Ada Lovelace" });
    let id = EffectId::for_effect(&effect).expect("effect should serialize");
    let expected = "5617d66e306cb0d9b3a6abb95211f169521164124936452f321899df23264bc0";
    assert_eq!(
        id.to_string(),
        expected,
        "effect IDs should match the fixed idempotency key"
    );
    assert_eq!(
        serde_json::to_value(id).expect("effect ID should serialize"),
        json!(expected)
    );
}

#[test]
fn wire_shape_is_frozen() {
    let record = incremented("orders", 5);
    assert_eq!(
        record.event_id().to_string(),
        "06ccc9f5d9b454676b6d0fc90cdc732d917cf17c8bb3f1427be236ff896f2d10"
    );
    let encoded = encode(&EventRecord::V1(record.clone())).expect("record should encode");
    let expected = format!(
        r#"{{"version":"v1","data":{{"event_id":"{}","partition":"orders","event":{{"kind":"incremented","counter":"orders","amount":5}}}}}}"#,
        record.event_id()
    );
    assert_eq!(
        String::from_utf8(encoded.clone()).expect("encoded record should be valid UTF-8"),
        expected
    );
    let decoded = EventRecord::<CounterEvent>::decode_borrowed(&encoded)
        .expect("record should decode")
        .normalize()
        .expect("record should normalize");
    assert_eq!(decoded.event_id(), record.event_id());
    assert_eq!(decoded.partition(), record.partition());
    assert_eq!(decoded.event(), record.event());
}

#[test]
fn routing_v1_partition_assignment() {
    let key = PartitionKey::parse("orders").expect("partition should be valid");
    assert_eq!(
        key.shard(),
        Shard::from_u8(228),
        "routing-v1 should keep the journal assigned to a partition"
    );
}

#[test]
fn record_decode_borrowed_event() {
    let counter = String::from("orders");
    let record = EventRecordV1::new(BorrowedEvent {
        counter: &counter,
        amount: 5,
        local: PhantomData,
    })
    .expect("borrowed event should form a record");
    let encoded =
        serde_json::to_string(&EventRecord::V1(record)).expect("borrowed record should serialize");
    let EventRecord::V1(decoded) =
        EventRecord::<BorrowedEvent<'_>>::decode_borrowed(encoded.as_bytes())
            .expect("record should decode an event borrowed from its input");
    assert_eq!(decoded.event().counter, counter);

    let mut changed: serde_json::Value =
        serde_json::from_str(&encoded).expect("record should be valid JSON");
    changed["data"]["event"]["amount"] = json!(6);
    let changed = serde_json::to_string(&changed).expect("changed record should serialize");
    let error = EventRecord::<BorrowedEvent<'_>>::decode_borrowed(changed.as_bytes())
        .expect_err("changing an event should invalidate its stored ID");
    assert!(
        matches!(error.current_context(), CompatError::EventIdMismatch { .. }),
        "borrowed event decoding should check the stored event ID: {error}"
    );
}

#[test]
fn record_identity_and_decode_accept_u128() {
    #[derive(Serialize)]
    struct DataFirstEnvelope<'a, E> {
        data: &'a EventRecordV1<E>,
        version: &'static str,
    }

    let event = U128Event { amount: u128::MAX };
    let record = EventRecordV1::new(event).expect("u128 event should produce an ID");
    record
        .digest()
        .expect("u128 event should produce a record digest");
    let data_first = serde_json::to_vec(&DataFirstEnvelope {
        data: &record,
        version: "v1",
    })
    .expect("data-first record should encode");

    let EventRecord::V1(decoded) = EventRecord::<U128Event>::decode_borrowed(&data_first)
        .expect("data-first u128 event should decode");
    assert_eq!(decoded.event().amount, u128::MAX);
}

#[test]
fn record_decode_envelope() {
    let error = EventRecord::<CounterEvent>::decode_borrowed(br#"{"version":"v2","data":{}}"#)
        .expect_err("unsupported record version should be rejected");
    assert_eq!(
        error.current_context(),
        &CompatError::UnsupportedVersion {
            name: CounterEvent::name(),
            version: "v2".to_owned(),
        }
    );

    let error =
        EventRecord::<CounterEvent>::decode_borrowed(br#"{"version":"v1","data":{},"extra":true}"#)
            .expect_err("unknown envelope field should be rejected");
    assert_eq!(
        error.current_context(),
        &CompatError::Decode {
            name: CounterEvent::name()
        }
    );
    assert!(
        error.contains::<serde_json::Error>(),
        "unknown fields should retain the serde error"
    );
}

fn toy_snapshot(shard: &str, padding: usize) -> ProjectionSnapshot<ToyDomain> {
    let projection = KernelProjection::restored(
        BTreeMap::new(),
        BTreeMap::new(),
        JournalSequence::new(0),
        Counters {
            totals: BTreeMap::from([(format!("counter{}", "x".repeat(padding)), 0)]),
        },
    );
    Hosted::<ToyDomain>::capture_snapshot(
        shard.parse().expect("test shard should parse"),
        &projection,
    )
    .expect("a projection with a journal sequence should be captured")
    .into_record(DateTime::UNIX_EPOCH)
}

#[test]
fn snapshots_encode_and_decode_at_the_size_boundary() {
    let base = encode(&toy_snapshot("00f", 0))
        .expect("snapshot without padding should encode")
        .len();

    let encoded = encode(&toy_snapshot("00f", MAX_SNAPSHOT_BYTES - base))
        .expect("a snapshot of exactly the maximum should encode");
    assert_eq!(encoded.len(), MAX_SNAPSHOT_BYTES);
    ProjectionSnapshot::<ToyDomain>::decode(&encoded).expect("maximum-size snapshot should decode");

    let error = encode(&toy_snapshot("00f", MAX_SNAPSHOT_BYTES - base + 1))
        .expect_err("an oversized snapshot should be rejected at encode");
    assert_eq!(
        error.current_context(),
        &CompatError::TooLarge {
            name: super::snapshot::DOMAIN_SNAPSHOT_DECLARATION.name,
            actual_bytes: MAX_SNAPSHOT_BYTES + 1,
            max_bytes: MAX_SNAPSHOT_BYTES,
        }
    );

    let mut padded = encoded;
    padded.push(b' ');
    assert!(
        ProjectionSnapshot::<ToyDomain>::decode(&padded).is_err(),
        "an oversized snapshot should be rejected at decode"
    );
}

#[test]
fn snapshot_shard_decode() {
    let mut fixture = json!({
        "version": "v1",
        "data": {
            "shard": "00f",
            "through_sequence": 0,
            "created_at": "1970-01-01T00:00:00Z",
            "seen": {},
            "partitions": {},
            "domain": { "totals": {} }
        }
    });
    let bytes = serde_json::to_vec(&fixture).expect("snapshot fixture should serialize");
    let snapshot =
        ProjectionSnapshot::<ToyDomain>::decode(&bytes).expect("stored snapshot should decode");
    assert_eq!(
        Toy::snapshot_bounds(&snapshot).expect("snapshot bounds should be valid"),
        (Shard::from_u8(15), JournalSequence::new(0))
    );
    assert_eq!(
        encode(&snapshot).expect("snapshot should encode"),
        bytes,
        "typed shard should preserve the stored snapshot format"
    );

    for invalid in ["0f", "00f1", "xyz", "", "00F", "100"] {
        fixture["data"]["shard"] = json!(invalid);
        let bytes = serde_json::to_vec(&fixture).expect("snapshot fixture should serialize");
        let error = ProjectionSnapshot::<ToyDomain>::decode(&bytes)
            .err()
            .expect("an invalid shard should fail snapshot decoding");
        assert!(
            matches!(error.current_context(), CompatError::Decode { .. }),
            "shard {invalid:?} should make the snapshot malformed: {error}"
        );
    }
}

#[tokio::test]
async fn snapshot_restore_foreign_shard() {
    let snapshot = toy_snapshot("00f", 0);
    let error = Toy::load_snapshot_projection(&(), Shard::from_u8(16), &snapshot)
        .await
        .expect_err("a snapshot should only restore to its own shard");
    assert_eq!(
        error.current_context(),
        &RecoveryError::SnapshotShardMismatch {
            expected: Shard::from_u8(16),
            actual: Shard::from_u8(15),
        }
    );
}

#[tokio::test]
async fn snapshot_timestamp_recovery() {
    let journal = SimLogHandle::new(42, Vec::new());
    let record = incremented("orders", 5);
    let location =
        ShardLogLocation::simulated(record.partition().shard(), journal.clone(), Arc::default());
    let (handle, started) = start(location.clone()).await;
    handle.propose(record).await.expect("event should apply");
    let snapshot = handle
        .capture_snapshot(1)
        .await
        .expect("capture should succeed")
        .expect("snapshot should be due")
        .into_record(DateTime::UNIX_EPOCH);
    started
        .owner
        .shutdown()
        .await
        .expect("shutdown should succeed");
    started
        .task
        .await
        .expect("loop task should join")
        .expect("loop should shut down");

    let mut fixture = serde_json::to_value(snapshot).expect("snapshot should serialize");
    fixture["data"]["created_at"] = json!("sim-step-1");
    let bytes = serde_json::to_vec(&fixture).expect("snapshot fixture should serialize");
    assert!(
        matches!(
            journal
                .acquire_writer()
                .append_record(SimKey::Snapshots, bytes),
            SimAppendResult::Acked(_)
        ),
        "snapshot with an invalid timestamp should be stored for recovery"
    );

    let recovered: RecoveredShard<Toy, _> = OpenedShard::open(location)
        .await
        .expect("shard should reopen")
        .recover_with_snapshots(&())
        .await
        .expect("recovery should fall back to the journal");
    assert!(
        recovered
            .startup_recovery()
            .snapshot_through_sequence
            .is_none(),
        "recovery should skip the snapshot with an invalid timestamp"
    );
    let restarted = recovered.enable(ShardCommandConfig::default());
    let totals = restarted
        .handle
        .read(|projection| projection.domain().totals.clone())
        .await
        .expect("replayed state should be readable");
    assert_eq!(totals.get("orders"), Some(&5));
    restarted
        .owner
        .shutdown()
        .await
        .expect("shutdown should succeed");
    restarted
        .task
        .await
        .expect("loop task should join")
        .expect("loop should shut down");
}

#[test]
fn replay_preserves_historical_admission() {
    let event = CounterEvent::Incremented {
        counter: "orders".to_owned(),
        amount: 0,
    };
    assert!(
        Counters::default().validate(&event).is_err(),
        "current admission should reject zero"
    );
    let record = EventRecordV1::new(event).expect("historical record should have a valid ID");
    let shard = record.partition().shard();
    let mut projection = KernelProjection::<Counters>::default();
    Toy::replay(
        &mut projection,
        shard,
        JournalSequence::new(0),
        EventRecord::V1(record),
    )
    .expect("historical replay should bypass current admission rules");
    assert_eq!(projection.domain().totals.get("orders"), Some(&0));
}

#[test]
fn record_from_parts_mismatched_fields() {
    let record = incremented("orders", 5);
    let other = incremented("payments", 6);
    for (event_id, partition, expected) in [
        (
            other.event_id(),
            record.partition(),
            CompatError::EventIdMismatch {
                name: CounterEvent::name(),
                expected: record.event_id(),
                actual: other.event_id(),
            },
        ),
        (
            record.event_id(),
            other.partition(),
            CompatError::PartitionMismatch {
                name: CounterEvent::name(),
                expected: record.partition().clone(),
                actual: other.partition().clone(),
            },
        ),
    ] {
        let error = EventRecordV1::from_parts(event_id, partition.clone(), record.event().clone())
            .expect_err("mismatched fields should be rejected");
        assert_eq!(error.current_context(), &expected);
    }
}

#[tokio::test]
async fn record_decode_invalid_fields() {
    let record = incremented("orders", 5);
    let other = incremented("payments", 6);
    for (field, value, expected_error, expected) in [
        (
            "event_id",
            json!(other.event_id()),
            "event ID mismatch",
            CompatError::EventIdMismatch {
                name: CounterEvent::name(),
                expected: record.event_id(),
                actual: other.event_id(),
            },
        ),
        (
            "partition",
            json!(other.partition()),
            "record partition",
            CompatError::PartitionMismatch {
                name: CounterEvent::name(),
                expected: record.partition().clone(),
                actual: other.partition().clone(),
            },
        ),
        (
            "extra",
            json!(true),
            "unknown field",
            CompatError::Decode {
                name: CounterEvent::name(),
            },
        ),
    ] {
        let mut record_json = serde_json::to_value(&record).expect("record should serialize");
        record_json[field] = value;
        let error = serde_json::from_value::<EventRecordV1<CounterEvent>>(record_json.clone())
            .expect_err("invalid record should fail deserialization");
        assert!(
            error.to_string().contains(expected_error),
            "error should contain {expected_error:?}: {error}"
        );

        let bytes = serde_json::to_vec(&json!({"version": "v1", "data": record_json}))
            .expect("wire record should serialize");
        let journal = SimLogHandle::new(42, Vec::new());
        let SimAppendResult::Acked(sequence) = journal
            .acquire_writer()
            .append_record(SimKey::Events, bytes)
        else {
            panic!("corrupt record fixture should append");
        };
        let opened = OpenedShard::open(ShardLogLocation::simulated(
            record.partition().shard(),
            journal,
            Arc::default(),
        ))
        .await
        .expect("shard should open");
        let error = opened
            .recover::<Toy>()
            .await
            .err()
            .expect("a corrupt event should stop recovery");
        assert_eq!(
            error.current_context().kind(),
            ShardCommandErrorKind::Recovery
        );
        assert_eq!(
            error.downcast_ref::<CompatError>(),
            Some(&expected),
            "recovery should retain the typed decode failure"
        );
        assert_eq!(
            error.downcast_ref::<DurableError>(),
            Some(&DurableError::DecodeRecord {
                name: CounterEvent::name(),
                sequence,
            }),
            "recovery should identify the record and sequence that failed decoding"
        );
        if field == "extra" {
            let source = error
                .downcast_ref::<serde_json::Error>()
                .expect("recovery should retain the JSON error");
            assert!(source.to_string().contains(expected_error));
        }
    }
}

#[tokio::test]
async fn recovery_foreign_shard() {
    let record = incremented("orders", 5);
    let actual = record.partition().shard();
    let expected = Shard::from_u8(actual.get().wrapping_add(1));
    let journal = SimLogHandle::new(42, Vec::new());
    let bytes = encode(&EventRecord::V1(record)).expect("record should encode");
    let SimAppendResult::Acked(sequence) = journal
        .acquire_writer()
        .append_record(SimKey::Events, bytes)
    else {
        panic!("record should be durable before recovery");
    };
    let opened = OpenedShard::open(ShardLogLocation::simulated(
        expected,
        journal,
        Arc::default(),
    ))
    .await
    .expect("shard should open");
    let error = opened
        .recover::<Toy>()
        .await
        .err()
        .expect("a record for another shard should stop recovery");
    assert_eq!(
        error.current_context().kind(),
        ShardCommandErrorKind::Recovery
    );
    assert_eq!(
        error.downcast_ref::<RecoveryError>(),
        Some(&RecoveryError::ForeignShard {
            sequence,
            expected,
            actual,
        }),
        "the command error should retain the replay failure and both shard IDs"
    );
}

#[test]
fn prepare_dedupes_rejects_and_admits() {
    let mut projection = KernelProjection::<Counters>::default();
    let record = incremented("orders", 5);

    let Prepared::Mutation(delta) =
        Toy::prepare(&projection, &record).expect("fresh event should be admitted")
    else {
        panic!("fresh event should be a mutation");
    };
    Toy::finalize(&mut projection, delta, JournalSequence::new(0))
        .expect("finalize at sequence zero should succeed");
    assert_eq!(projection.domain().totals["orders"], 5);
    assert_eq!(
        projection.partition_sequence(record.partition()),
        Some(JournalSequence::new(0))
    );

    assert!(matches!(
        Toy::prepare(&projection, &record),
        Ok(Prepared::Noop)
    ));

    let other_digest = incremented("orders", 6)
        .digest()
        .expect("digest should compute");
    let mut seen = projection.seen().clone();
    seen.insert(record.event_id(), other_digest);
    projection = with_seen(&projection, seen);
    assert!(
        matches!(
            Toy::prepare(&projection, &record),
            Err(FoldError::ConflictingReuse { event_id }) if event_id == record.event_id()
        ),
        "reuse with a different digest should be rejected"
    );

    let rejected = incremented("orders", 0);
    let error = Toy::prepare(&projection, &rejected)
        .err()
        .expect("validation should reject");
    assert!(
        matches!(error, FoldError::Rejected { rejection, .. } if matches!(rejection.current_context(), CounterRejection::ZeroIncrement))
    );
}

#[test]
fn replay_tolerates_double_append_and_refuses_conflicts() {
    let record = incremented("orders", 5);
    let shard = record.partition().shard();
    let mut projection = KernelProjection::<Counters>::default();

    Toy::replay(
        &mut projection,
        shard,
        JournalSequence::new(0),
        EventRecord::V1(record.clone()),
    )
    .expect("first replay should apply");
    Toy::replay(
        &mut projection,
        shard,
        JournalSequence::new(1),
        EventRecord::V1(record.clone()),
    )
    .expect("duplicate replay should be a no-op");
    assert_eq!(projection.domain().totals["orders"], 5);
    assert_eq!(projection.through_sequence(), Some(JournalSequence::new(1)));

    let error = Toy::replay(
        &mut projection,
        shard,
        JournalSequence::new(1),
        EventRecord::V1(incremented("orders", 7)),
    )
    .expect_err("a non-advancing sequence should be rejected");
    assert_eq!(
        error.current_context(),
        &RecoveryError::NonIncreasingSequence {
            previous: JournalSequence::new(1),
            proposed: JournalSequence::new(1),
        }
    );

    let other_digest = incremented("orders", 7)
        .digest()
        .expect("digest should compute");
    let mut seen = projection.seen().clone();
    seen.insert(record.event_id(), other_digest);
    projection = with_seen(&projection, seen);
    let event_id = record.event_id();
    let error = Toy::replay(
        &mut projection,
        shard,
        JournalSequence::new(2),
        EventRecord::V1(record),
    )
    .expect_err("an event ID stored with different content should be rejected");
    assert_eq!(
        error.current_context(),
        &RecoveryError::ConflictingReuse {
            event_id,
            sequence: JournalSequence::new(2),
        }
    );
}

#[test]
fn recovered_prefix_cannot_regress_or_lose_events() {
    let record = incremented("orders", 5);
    let shard = record.partition().shard();
    let mut acknowledged = KernelProjection::<Counters>::default();
    Toy::replay(
        &mut acknowledged,
        shard,
        JournalSequence::new(0),
        EventRecord::V1(record),
    )
    .expect("acknowledged record should replay");

    let empty = KernelProjection::<Counters>::default();
    let error = Toy::validate_recovered_prefix(&acknowledged, &empty)
        .expect_err("recovery should preserve the acknowledged prefix");
    assert_eq!(
        error.current_context(),
        &RecoveryError::RegressedSequence {
            previous: JournalSequence::new(0),
            recovered: None,
        }
    );
    Toy::validate_recovered_prefix(&acknowledged, &acknowledged.clone())
        .expect("identical state should preserve the acknowledged prefix");
    Toy::validate_recovered_prefix(&empty, &acknowledged)
        .expect("recovery should extend an empty prefix");

    let mut advanced = acknowledged.clone();
    let record = incremented("orders", 5);
    Toy::replay(
        &mut advanced,
        shard,
        JournalSequence::new(1),
        EventRecord::V1(record),
    )
    .expect("duplicate replay should advance the sequence");
    let error = Toy::validate_recovered_prefix(&advanced, &acknowledged)
        .expect_err("a lower recovered sequence should be a regression");
    assert_eq!(
        error.current_context(),
        &RecoveryError::RegressedSequence {
            previous: JournalSequence::new(1),
            recovered: Some(JournalSequence::new(0)),
        }
    );
    Toy::validate_recovered_prefix(&acknowledged, &advanced)
        .expect("a later sequence should preserve the acknowledged prefix");

    let event_id = incremented("orders", 5).event_id();
    let mut seen = advanced.seen().clone();
    seen.remove(&event_id);
    let missing = with_seen(&advanced, seen);
    let error = Toy::validate_recovered_prefix(&advanced, &missing)
        .expect_err("advancing the journal should not hide a missing acknowledged event");
    assert_eq!(
        error.current_context(),
        &RecoveryError::LostEvent { event_id }
    );
}

#[tokio::test]
async fn propose_read_dedupe_and_reject_through_the_real_loop() {
    let root = tempfile::tempdir().expect("object store root tempdir should be created");
    let record = incremented("orders", 5);
    let shard = record.partition().shard();
    let location = local_location(shard, root.path());

    let (handle, started) = start(location).await;
    assert!(matches!(
        handle
            .propose(record.clone())
            .await
            .expect("propose should succeed"),
        ShardCommandOutcome::Applied { .. }
    ));
    assert!(matches!(
        handle
            .propose(record.clone())
            .await
            .expect("duplicate propose should succeed"),
        ShardCommandOutcome::AlreadyDurable { .. }
    ));
    let totals = handle
        .read(|projection| projection.domain().totals.clone())
        .await
        .expect("read should succeed");
    assert_eq!(totals["orders"], 5);

    let rejection = handle
        .propose(incremented("orders", 0))
        .await
        .expect("proposal should return its validation outcome");
    let ShardCommandOutcome::Rejected {
        rejection: FoldError::Rejected { rejection, .. },
    } = rejection
    else {
        panic!("zero increment should return a domain rejection");
    };
    assert!(matches!(
        rejection.current_context(),
        CounterRejection::ZeroIncrement
    ));

    started
        .owner
        .shutdown()
        .await
        .expect("shutdown should succeed");
    started
        .task
        .await
        .expect("loop task should join")
        .expect("loop should stop without an error");
}

#[tokio::test]
async fn shutdown_full_queue() {
    tokio::time::timeout(Duration::from_secs(5), async {
        for cancel_shutdown in [false, true] {
            let journal = SimLogHandle::new(42, Vec::new());
            let record = incremented("orders", 5);
            let location = ShardLogLocation::simulated(
                record.partition().shard(),
                journal.clone(),
                Arc::default(),
            );
            let recovered: RecoveredShard<Toy, _> = OpenedShard::open(location)
                .await
                .expect("shard should open")
                .recover()
                .await
                .expect("shard should recover");
            let hold = journal.pause_before_append();
            let started = recovered.enable(ShardCommandConfig::new(NonZeroUsize::MIN, 0));
            let handle = started.handle.clone();
            let active = tokio::spawn(async move { handle.propose(record).await });
            hold.entered().notified().await;
            let handle = started.handle.clone();
            let queued =
                tokio::spawn(async move { handle.propose(incremented("orders", 7)).await });
            while started.handle.queue_capacity() != 0 {
                tokio::task::yield_now().await;
            }
            let mut blocked = Box::pin(started.handle.propose(incremented("orders", 9)));
            poll_fn(|context| {
                assert!(
                    blocked.as_mut().poll(context).is_pending(),
                    "a full queue should block admission"
                );
                Poll::Ready(())
            })
            .await;
            let mut shutdown = Box::pin(started.owner.shutdown());
            poll_fn(|context| {
                assert!(
                    shutdown.as_mut().poll(context).is_pending(),
                    "shutdown should wait for accepted commands"
                );
                Poll::Ready(())
            })
            .await;
            let error = blocked
                .await
                .expect_err("shutdown should release blocked admission before the queue advances");
            assert_eq!(
                error.current_context().kind(),
                ShardCommandErrorKind::Closed
            );
            let shutdown = if cancel_shutdown {
                drop(shutdown);
                None
            } else {
                Some(shutdown)
            };
            hold.release().notify_one();
            for (index, proposal) in [active, queued].into_iter().enumerate() {
                let outcome = proposal.await.expect("proposal task should join");
                if cancel_shutdown && index == 1 {
                    let error = outcome.expect_err("losing the owner should stop accepted work");
                    assert_eq!(
                        error.current_context().kind(),
                        ShardCommandErrorKind::Fenced
                    );
                } else {
                    assert!(matches!(
                        outcome.expect("accepted proposal should finish"),
                        ShardCommandOutcome::Applied { .. }
                    ));
                }
            }
            if let Some(shutdown) = shutdown {
                shutdown.await.expect("shutdown should close the writer");
            }
            let stopped = started.task.await.expect("loop task should join");
            if cancel_shutdown {
                assert_eq!(
                    stopped.expect_err("owner drop should stop the loop").kind(),
                    ShardCommandErrorKind::Fenced
                );
                assert_eq!(
                    journal.durable_entries(SimKey::Events).len(),
                    1,
                    "owner drop should let the active append finish and reject queued writes"
                );
            } else {
                stopped.expect("loop should shut down without an error");
                assert_eq!(
                    journal.durable_entries(SimKey::Events).len(),
                    2,
                    "only the accepted proposals should be stored"
                );
            }
        }
    })
    .await
    .expect("shutdown should release all callers");
}

#[tokio::test]
async fn owner_drop_idle_shard() {
    tokio::time::timeout(Duration::from_secs(5), async {
        let journal = SimLogHandle::new(42, Vec::new());
        let record = incremented("orders", 5);
        let location = ShardLogLocation::simulated(
            record.partition().shard(),
            journal.clone(),
            Arc::default(),
        );
        let (handle, started) = start(location).await;
        handle
            .read(|_| ())
            .await
            .expect("loop should accept a read before losing ownership");
        drop(started.owner);
        let error = handle
            .propose(record)
            .await
            .expect_err("owner drop should close admission on existing clones");
        assert_eq!(
            error.current_context().kind(),
            ShardCommandErrorKind::Closed
        );
        let error = started
            .task
            .await
            .expect("loop task should join")
            .expect_err("owner drop should wake the idle loop");
        assert_eq!(error.kind(), ShardCommandErrorKind::Fenced);
        assert!(
            journal.durable_entries(SimKey::Events).is_empty(),
            "a stopped shard should not write the rejected proposal"
        );
    })
    .await
    .expect("owner drop should stop the idle loop");
}

#[tokio::test]
async fn terminal_failure_reports() {
    tokio::time::timeout(Duration::from_secs(5), async {
        let journal = SimLogHandle::new(42, Vec::new());
        let record = incremented("orders", 5);
        let event_id = record.event_id();
        let location = ShardLogLocation::simulated(
            record.partition().shard(),
            journal.clone(),
            Arc::default(),
        );
        let recovered: RecoveredShard<Toy, _> = OpenedShard::open(location)
            .await
            .expect("shard should open")
            .recover()
            .await
            .expect("shard should recover");
        let hold = journal.pause_before_append();
        let started = recovered.enable(ShardCommandConfig::new(NonZeroUsize::MIN, 0));
        journal.force_outcomes([SimAppendOutcome::Fenced]);
        let handle = started.handle.clone();
        let active = tokio::spawn(async move { handle.propose(record).await });
        hold.entered().notified().await;
        let handle = started.handle.clone();
        let queued = tokio::spawn(async move { handle.propose(incremented("orders", 7)).await });
        while started.handle.queue_capacity() != 0 {
            tokio::task::yield_now().await;
        }
        hold.release().notify_one();

        let failure = active
            .await
            .expect("active proposal should join")
            .expect_err("injected append should fail");
        assert_eq!(
            failure.current_context(),
            &ShardCommandError::AppendEvent {
                event_id,
                kind: AppendFailureKind::Fenced,
            },
            "the failed proposal should identify its event and retry classification"
        );
        assert_eq!(
            failure
                .downcast_ref::<ShardAppendError>()
                .expect("active proposal should retain its append failure")
                .kind,
            AppendFailureKind::Fenced
        );
        assert!(
            format!("{failure:?}").contains("simulated newer writer epoch"),
            "active proposal should retain the storage attachment"
        );

        let stopped = queued
            .await
            .expect("queued proposal should join")
            .expect_err("queued proposal should stop");
        assert_eq!(
            stopped.current_context(),
            failure.current_context(),
            "queued callers should receive the event ID and classification that stopped the loop"
        );
        assert!(
            stopped.contains::<QueuedWhenStopped>(),
            "queued proposal should report that it was not executed"
        );
        let terminal = started
            .task
            .await
            .expect("loop task should join")
            .expect_err("fencing should stop the loop");
        assert_eq!(
            &terminal,
            failure.current_context(),
            "the loop task should identify the event that stopped it"
        );
    })
    .await
    .expect("terminal failure should release active and queued callers");
}

#[tokio::test]
async fn terminal_failure_dropped_caller() {
    tokio::time::timeout(Duration::from_secs(5), async {
        let journal = SimLogHandle::new(42, Vec::new());
        let record = incremented("orders", 5);
        let location = ShardLogLocation::simulated(
            record.partition().shard(),
            journal.clone(),
            Arc::default(),
        );
        let recovered: RecoveredShard<Toy, _> = OpenedShard::open(location)
            .await
            .expect("shard should open")
            .recover()
            .await
            .expect("shard should recover");
        let hold = journal.pause_before_append();
        let started = recovered.enable(ShardCommandConfig::new(NonZeroUsize::MIN, 0));
        journal.force_outcomes([SimAppendOutcome::Fenced]);
        let handle = started.handle.clone();
        let active = tokio::spawn(async move { handle.propose(record).await });
        hold.entered().notified().await;
        active.abort();
        let _: Result<_, _> = active.await;
        hold.release().notify_one();

        let terminal = started
            .task
            .await
            .expect("loop task should join")
            .expect_err("fencing should stop the loop after its caller disconnects");
        assert_eq!(terminal.kind(), ShardCommandErrorKind::Fenced);
        let error = started
            .handle
            .propose(incremented("orders", 7))
            .await
            .expect_err("stopped loop should reject new proposals");
        assert_eq!(
            error.current_context().kind(),
            ShardCommandErrorKind::Closed
        );
    })
    .await
    .expect("terminal failure should stop the loop without a waiting caller");
}

#[tokio::test]
async fn prepared_change_append_failure() {
    let journal = SimLogHandle::new(42, Vec::new());
    let first = incremented("orders", 5);
    let location =
        ShardLogLocation::simulated(first.partition().shard(), journal.clone(), Arc::default());
    let recovered: RecoveredShard<Toy, _> = OpenedShard::open(location.clone())
        .await
        .expect("shard should open")
        .recover()
        .await
        .expect("shard should recover");
    let started = recovered.enable(ShardCommandConfig::new(NonZeroUsize::MIN, 0));
    let handle = &started.handle;
    handle
        .propose(first)
        .await
        .expect("first event should apply");

    let retry = incremented("orders", 7);
    journal.force_outcomes([SimAppendOutcome::DefinitelyNotCommitted]);
    let error = handle
        .propose(retry.clone())
        .await
        .expect_err("the injected append failure should be returned");
    assert_eq!(
        error.current_context().kind(),
        ShardCommandErrorKind::DefinitelyNotCommitted
    );
    let after_failure = handle
        .read(|projection| projection.domain().clone())
        .await
        .expect("state should remain readable after a failed append");
    assert_eq!(
        after_failure.totals.get("orders"),
        Some(&5),
        "a failed append should leave the prepared total unapplied"
    );

    handle
        .propose(incremented("orders", 3))
        .await
        .expect("another event should apply before the retry");
    assert!(
        matches!(
            handle.propose(retry).await.expect("retry should succeed"),
            ShardCommandOutcome::Applied { .. }
        ),
        "the failed event should apply on retry"
    );
    let live = handle
        .read(|projection| projection.domain().clone())
        .await
        .expect("state should be readable after the retry");
    assert_eq!(
        live.totals.get("orders"),
        Some(&15),
        "retry should prepare from the new total of 8"
    );
    assert_eq!(
        journal.durable_entries(SimKey::Events).len(),
        3,
        "each accepted event should be stored once"
    );
    started
        .owner
        .shutdown()
        .await
        .expect("shutdown should succeed");
    started
        .task
        .await
        .expect("loop task should join")
        .expect("loop should shut down");

    let (handle, restarted) = start(location).await;
    let replayed = handle
        .read(|projection| projection.domain().clone())
        .await
        .expect("replayed state should be readable");
    assert_eq!(replayed, live, "replay should reproduce the live state");
    restarted
        .owner
        .shutdown()
        .await
        .expect("shutdown should succeed");
    restarted
        .task
        .await
        .expect("loop task should join")
        .expect("loop should shut down");
}

#[tokio::test]
async fn crash_replay_rebuilds_state_and_still_dedupes() {
    let root = tempfile::tempdir().expect("object store root tempdir should be created");
    let first = incremented("orders", 5);
    let shard = first.partition().shard();
    let second = incremented("orders", 7);
    let reset = EventRecordV1::new(CounterEvent::Reset {
        counter: "orders".to_owned(),
    })
    .expect("reset event should be valid");

    let after_reset = incremented("orders", 3);

    let location = local_location(shard, root.path());
    let (handle, started) = start(location.clone()).await;
    for record in [
        first.clone(),
        second.clone(),
        reset.clone(),
        after_reset.clone(),
    ] {
        assert!(matches!(
            handle
                .propose(record)
                .await
                .expect("propose should succeed"),
            ShardCommandOutcome::Applied { .. }
        ));
    }
    let totals = handle
        .read(|projection| projection.domain().totals.clone())
        .await
        .expect("read should succeed");
    assert_eq!(totals["orders"], 3);
    started
        .owner
        .shutdown()
        .await
        .expect("shutdown should succeed");
    started
        .task
        .await
        .expect("loop task should join")
        .expect("loop should stop without an error");

    let (handle, started) = start(location).await;
    let through = handle
        .read(KernelProjection::through_sequence)
        .await
        .expect("recovered sequence read should succeed")
        .expect("recovered projection should have a durable sequence");
    assert!(through < started.recovery.durable_end_exclusive);
    assert_eq!(
        started.state_changes.initial,
        vec![first.partition().clone()]
    );
    let totals = handle
        .read(|projection| projection.domain().totals.clone())
        .await
        .expect("read after recovery should succeed");
    assert_eq!(totals["orders"], 3);
    assert!(
        matches!(
            handle
                .propose(second)
                .await
                .expect("replayed duplicate should be acknowledged"),
            ShardCommandOutcome::AlreadyDurable { .. }
        ),
        "resubmitting a stored event after restart should leave state unchanged"
    );
    assert!(matches!(
        handle
            .propose(incremented("orders", 2))
            .await
            .expect("fresh event after recovery should be accepted"),
        ShardCommandOutcome::Applied { .. }
    ));
    let totals = handle
        .read(|projection| projection.domain().totals.clone())
        .await
        .expect("read after new appends should succeed");
    assert_eq!(totals["orders"], 5);
    started
        .owner
        .shutdown()
        .await
        .expect("shutdown should succeed");
    started
        .task
        .await
        .expect("loop task should join")
        .expect("loop should stop without an error");
}

#[tokio::test]
async fn foreign_partition_is_rejected() {
    let root = tempfile::tempdir().expect("object store root tempdir should be created");
    let record = incremented("orders", 5);
    let shard = record.partition().shard();
    let foreign = (0..1024_u32)
        .map(|attempt| incremented(&format!("other-{attempt}"), 1))
        .find(|candidate| candidate.partition().shard() != shard)
        .expect("some key should route elsewhere");

    let location = local_location(shard, root.path());
    let (handle, started) = start(location).await;
    let error = handle
        .propose(foreign)
        .await
        .expect("proposal should return its validation outcome");
    assert!(matches!(
        error,
        ShardCommandOutcome::Rejected {
            rejection: FoldError::ForeignShard { .. }
        }
    ));
    started
        .owner
        .shutdown()
        .await
        .expect("shutdown should succeed");
    started
        .task
        .await
        .expect("loop task should join")
        .expect("loop should stop without an error");
}

#[tokio::test]
async fn snapshots_bound_recovery_and_roundtrip_state() {
    let root = tempfile::tempdir().expect("object store root tempdir should be created");
    let record = incremented("orders", 5);
    let shard = record.partition().shard();
    let location = local_location(shard, root.path());

    let (handle, started) = start(location.clone()).await;
    for event in [record.clone(), incremented("orders", 7)] {
        handle.propose(event).await.expect("propose should succeed");
    }
    let payload = handle
        .capture_snapshot(1)
        .await
        .expect("snapshot capture should succeed")
        .expect("a span of two events should be snapshot-worthy");
    let snapshot = payload.into_record(Utc::now());
    handle
        .commit_snapshot(snapshot)
        .await
        .expect("snapshot commit should succeed");
    handle
        .propose(incremented("orders", 3))
        .await
        .expect("post-snapshot event should be accepted");
    started
        .owner
        .shutdown()
        .await
        .expect("shutdown should succeed");
    started
        .task
        .await
        .expect("loop task should join")
        .expect("loop should stop without an error");

    let opened = OpenedShard::open(location)
        .await
        .expect("shard should reopen");
    let recovered: RecoveredShard<Toy, _> = opened
        .recover_with_snapshots(&())
        .await
        .expect("recovery with snapshots should succeed");
    let restarted = recovered.enable(ShardCommandConfig::default());
    assert!(
        restarted.recovery.snapshot_through_sequence.is_some(),
        "recovery should load the saved snapshot"
    );
    let totals = restarted
        .handle
        .read(|projection| projection.domain().totals.clone())
        .await
        .expect("read after snapshot recovery should succeed");
    assert_eq!(totals["orders"], 15);
    restarted
        .owner
        .shutdown()
        .await
        .expect("shutdown should succeed");
    restarted
        .task
        .await
        .expect("loop task should join")
        .expect("loop should stop without an error");
}

#[test]
fn partition_keys_are_validated() {
    PartitionKey::parse("orders").expect("ordinary partition key should be valid");
    PartitionKey::parse("x".repeat(MAX_PARTITION_KEY_BYTES))
        .expect("partition key at the length limit should be valid");
    assert_eq!(PartitionKey::parse(""), Err(InvalidPartitionKey::Empty));
    assert_eq!(
        PartitionKey::parse("has space"),
        Err(InvalidPartitionKey::UnsafeCharacter)
    );
    assert_eq!(
        PartitionKey::parse("control\u{7}"),
        Err(InvalidPartitionKey::UnsafeCharacter)
    );
    assert_eq!(
        PartitionKey::parse("x".repeat(MAX_PARTITION_KEY_BYTES + 1)),
        Err(InvalidPartitionKey::TooLong {
            actual_bytes: MAX_PARTITION_KEY_BYTES + 1
        })
    );
}

#[derive(Clone, Serialize, Deserialize)]
struct OtherCounterEvent(CounterEvent);

impl DomainEvent for OtherCounterEvent {
    fn name() -> &'static str {
        CounterEvent::name()
    }

    fn partition(&self) -> PartitionKey {
        self.0.partition()
    }
}

#[test]
fn registration_conflicting_event_type() {
    let registry = RecordRegistry::default();
    register::<ToyDomain>(&registry).expect("toy domain should register");
    let error = registry
        .register(EventRecord::<OtherCounterEvent>::declaration())
        .expect_err("another event type with the same name should be rejected");
    assert!(matches!(
        error.current_context(),
        registry::DeclarationError::ConflictingDeclaration { .. }
    ));

    let independent_registry = RecordRegistry::default();
    independent_registry
        .register(EventRecord::<OtherCounterEvent>::declaration())
        .expect("another registry should allow its own codec for the name");
    registry
        .require::<EventRecord<CounterEvent>>()
        .expect("the original registry should retain its codec");
}

async fn snapshot_failure(
    outcome: crate::sim::SimAppendOutcome,
) -> (
    crate::sim::SimLogHandle,
    StartedShard<Toy>,
    Report<crate::shard_log::ShardCommandError>,
) {
    let journal = crate::sim::SimLogHandle::new(42, Vec::new());
    let record = incremented("orders", 5);
    let location =
        ShardLogLocation::simulated(record.partition().shard(), journal.clone(), Arc::default());
    let recovered: RecoveredShard<Toy, _> = OpenedShard::open(location)
        .await
        .expect("shard should open")
        .recover_with_snapshots(&())
        .await
        .expect("shard should recover");
    let started = recovered.enable(ShardCommandConfig::default().require_full_lease_handshake());
    started
        .handle
        .propose(record)
        .await
        .expect("event should apply");
    let snapshot = started
        .handle
        .capture_snapshot(1)
        .await
        .expect("capture should succeed")
        .expect("snapshot should be due")
        .into_record(Utc::now());
    let (_, snapshot_through) =
        Toy::snapshot_bounds(&snapshot).expect("captured snapshot should have valid bounds");
    journal.force_outcomes([outcome]);
    let error = started
        .handle
        .commit_snapshot(snapshot)
        .await
        .expect_err("injected snapshot failure should be returned");
    assert!(
        matches!(error.current_context(), ShardCommandError::AppendSnapshot { through_sequence, .. }
            if *through_sequence == snapshot_through),
        "snapshot append failure should identify the captured journal sequence"
    );
    (journal, started, error)
}

#[tokio::test]
async fn snapshot_commit_unknown_continues() {
    use crate::{shard_log::ShardCommandErrorKind, sim::SimAppendOutcome};

    for outcome in [
        SimAppendOutcome::CommitUnknownDurable,
        SimAppendOutcome::CommitUnknownLost,
    ] {
        let (journal, started, error) = snapshot_failure(outcome).await;
        assert_eq!(
            error.current_context().kind(),
            ShardCommandErrorKind::CommitUnknown
        );
        let next = incremented("orders", 7);
        let shard = next.partition().shard();
        assert!(matches!(
            started
                .handle
                .propose(next)
                .await
                .expect("next event should apply"),
            ShardCommandOutcome::Applied { .. }
        ));
        let totals = started
            .handle
            .read(|state| state.domain().totals.clone())
            .await
            .expect("state should remain readable");
        assert_eq!(totals.get("orders"), Some(&12));
        journal.force_outcomes([SimAppendOutcome::CommitUnknownLost]);
        let record = incremented("orders", 9);
        let event_id = record.event_id();
        let error = started
            .handle
            .propose(record)
            .await
            .expect_err("a commit-unknown event append should stop the shard");
        assert_eq!(
            error.current_context().kind(),
            ShardCommandErrorKind::CommitUnknown
        );
        assert_eq!(
            error
                .downcast_ref::<ShardAppendError>()
                .expect("recovery failure should retain the commit-unknown append")
                .kind,
            AppendFailureKind::CommitUnknown
        );
        assert_eq!(
            error.current_context(),
            &ShardCommandError::LeaseRequired { event_id },
            "lease recovery should identify the commit-unknown event"
        );
        started
            .task
            .await
            .expect("task should join")
            .expect_err("a commit-unknown event should be terminal");

        let location = ShardLogLocation::simulated(shard, journal, Arc::default());
        let recovered: RecoveredShard<Toy, _> = OpenedShard::open(location)
            .await
            .expect("shard should reopen")
            .recover_with_snapshots(&())
            .await
            .expect("recovery should handle either snapshot outcome");
        let restarted =
            recovered.enable(ShardCommandConfig::default().require_full_lease_handshake());
        let totals = restarted
            .handle
            .read(|state| state.domain().totals.clone())
            .await
            .expect("recovered state should be readable");
        assert_eq!(totals.get("orders"), Some(&12));
        restarted
            .owner
            .shutdown()
            .await
            .expect("shutdown should succeed");
        restarted
            .task
            .await
            .expect("task should join")
            .expect("loop should stop without an error");
    }
}

#[tokio::test]
async fn snapshot_fenced_stops_shard() {
    let (_, started, error) = snapshot_failure(crate::sim::SimAppendOutcome::Fenced).await;
    assert_eq!(
        error.current_context().kind(),
        crate::shard_log::ShardCommandErrorKind::Fenced
    );
    let terminal = started
        .task
        .await
        .expect("task should join")
        .expect_err("fencing should stop the shard");
    assert_eq!(
        terminal.kind(),
        crate::shard_log::ShardCommandErrorKind::Fenced
    );
}

#[tokio::test]
async fn snapshot_failed_attempt_interval() {
    let root = tempfile::tempdir().expect("object store root should be created");
    let record = incremented("orders", 5);
    let shard = record.partition().shard();
    let location = local_location(shard, root.path());
    let (handle, started) = start(location).await;
    handle
        .propose(record)
        .await
        .expect("event should be applied");
    handle
        .capture_snapshot(1)
        .await
        .expect("capture should succeed")
        .expect("snapshot should be due");
    let projection = handle
        .read(KernelProjection::clone)
        .await
        .expect("read should succeed");
    let mut oversized = projection.domain().clone();
    oversized.totals.insert("x".repeat(MAX_SNAPSHOT_BYTES), 0);
    let snapshot = Toy::capture_snapshot(
        shard,
        &KernelProjection::restored(
            projection.seen().clone(),
            projection.partitions().clone(),
            projection
                .through_sequence()
                .expect("an applied event should set the journal sequence"),
            oversized,
        ),
    )
    .expect("a projection with a journal sequence should be captured")
    .into_record(Utc::now());
    let error = handle
        .commit_snapshot(snapshot)
        .await
        .expect_err("oversized snapshot should fail");
    assert_eq!(
        error.current_context().kind(),
        ShardCommandErrorKind::InvalidCandidate
    );
    assert!(
        matches!(
            error.downcast_ref::<CompatError>(),
            Some(CompatError::TooLarge {
                max_bytes: MAX_SNAPSHOT_BYTES,
                ..
            })
        ),
        "snapshot failure should retain the size error"
    );
    assert!(
        handle
            .capture_snapshot(1)
            .await
            .expect("capture should succeed")
            .is_none(),
        "unchanged state should not be captured again after failure"
    );
    handle
        .propose(incremented("orders", 7))
        .await
        .expect("next event should be applied");
    assert!(
        handle
            .capture_snapshot(1)
            .await
            .expect("capture should succeed")
            .is_some(),
        "new journal progress should permit another snapshot attempt"
    );
    started
        .owner
        .shutdown()
        .await
        .expect("shutdown should succeed");
    started
        .task
        .await
        .expect("loop task should join")
        .expect("loop should stop without an error");
}
