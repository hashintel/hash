use alloc::sync::Arc;
use core::{pin::pin, time::Duration};
use std::io::Write;

use bytes::Bytes;
use error_stack::{Report, ResultExt as _};
use futures_util::TryStreamExt as _;
use serde::{Deserialize, Serialize};
use tempfile::TempDir;

use super::{
    AppendFailureKind, JournalReader as _, JournalStorage, JournalStream as _, OpenedShard,
    ShardLogLocation, ShardLogOpenError, ShardLogRecovery, ShardLogWriter, post_invocation_source,
    read_journal, wait_until_durable_with,
};
use crate::{
    DurableError,
    registry::{
        CompatError, DeclarationError, DurableRecord, MigrationPolicy, RecordDeclaration,
        RecordRegistry, UntrimmedJournalRecord, VersionedRecord,
    },
    routing::Shard,
};

#[tokio::test]
async fn flush_stalled() {
    let error = super::flush_with_timeout(
        core::future::pending(),
        core::time::Duration::from_millis(1),
    )
    .await
    .expect_err("stalled flush should time out");
    assert_eq!(
        error.current_context().kind,
        AppendFailureKind::CommitUnknown
    );
    assert_eq!(
        error.downcast_ref::<DurableError>(),
        Some(&DurableError::FlushTimeout {
            timeout: Duration::from_millis(1)
        })
    );
    assert!(
        error.contains::<tokio::time::error::Elapsed>(),
        "flush timeout should retain the elapsed error"
    );
}

const TEST_RECORD_DECLARATION: RecordDeclaration = RecordDeclaration {
    name: "kernel_shard_log_test_record",
    codec: core::any::TypeId::of::<TestRecord>(),
    owning_module: "durable_kernel::shard_log::tests",
    emitted_version: 1,
    supported_versions: &[1],
    algorithm_versions: &[],
    durability: crate::registry::DurabilityClass::ImmutableJournal,
    migration: MigrationPolicy::NeverRetireWhileUntrimmed,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct TestRecord {
    body: String,
    #[serde(skip)]
    fail_encode: bool,
}

impl DurableRecord for TestRecord {
    const MIGRATION_POLICY: MigrationPolicy = MigrationPolicy::NeverRetireWhileUntrimmed;

    fn declaration() -> RecordDeclaration {
        TEST_RECORD_DECLARATION
    }

    fn encode<W: Write>(&self, writer: W) -> Result<(), Report<CompatError>> {
        if self.fail_encode {
            return Err(Report::new(CompatError::Encode {
                name: Self::declaration().name,
            })
            .attach("injected encode failure"));
        }
        serde_json::to_writer(writer, self).change_context(CompatError::Encode {
            name: Self::declaration().name,
        })
    }

    fn decode(bytes: &[u8]) -> Result<Self, Report<CompatError>> {
        serde_json::from_slice(bytes).change_context(CompatError::Decode {
            name: Self::declaration().name,
        })
    }
}

impl VersionedRecord for TestRecord {
    type Current = Self;

    fn normalize(self) -> Result<Self, Report<CompatError>> {
        Ok(self)
    }
}

impl UntrimmedJournalRecord for TestRecord {}

fn record(body: &str) -> TestRecord {
    TestRecord {
        body: body.to_owned(),
        fail_encode: false,
    }
}

struct TestPrefixCapability {
    root: TempDir,
    object_store_root: std::path::PathBuf,
    registry: Arc<RecordRegistry>,
}

impl TestPrefixCapability {
    fn new() -> Self {
        let registry = Arc::new(RecordRegistry::default());
        registry
            .register(TEST_RECORD_DECLARATION)
            .expect("test declaration should register");
        let root = tempfile::tempdir().expect("test object-store root should be created");
        Self {
            object_store_root: root.path().to_path_buf(),
            root,
            registry,
        }
    }

    fn log_path(shard: Shard) -> String {
        format!(
            "tenants/alice/control/v1/shards/{}/log",
            shard.path_segment()
        )
    }

    fn location(&self, shard: Shard) -> ShardLogLocation {
        ShardLogLocation::disposable_local(
            shard,
            &Self::log_path(shard),
            &self.object_store_root,
            Arc::clone(&self.registry),
        )
    }

    fn root(&self) -> &std::path::Path {
        self.root.path()
    }
}

#[tokio::test]
async fn open_invalid_storage() {
    let capability = TestPrefixCapability::new();
    let shard = Shard::from_u8(7);
    let blocked = capability.root().join("blocked");
    std::fs::write(&blocked, b"not a directory").expect("storage root should be blocked");
    let location = ShardLogLocation::disposable_local(
        shard,
        &TestPrefixCapability::log_path(shard),
        &blocked,
        Arc::clone(&capability.registry),
    );

    let writer_error = OpenedShard::open(location.clone())
        .await
        .err()
        .expect("a file at the storage root should prevent opening a writer");
    assert!(matches!(
        writer_error.downcast_ref::<ShardLogOpenError>(),
        Some(ShardLogOpenError::Writer { shard: failed_shard }) if *failed_shard == shard
    ));
    assert!(
        writer_error.contains::<opendata_log::Error>(),
        "writer open should retain the storage error through the command context"
    );

    let reader_error = read_journal::<TestRecord>(&location)
        .await
        .expect_err("a file at the storage root should prevent reading the journal");
    assert!(matches!(
        reader_error.downcast_ref::<ShardLogOpenError>(),
        Some(ShardLogOpenError::Reader { shard: failed_shard }) if *failed_shard == shard
    ));
    assert!(
        reader_error.contains::<opendata_log::Error>(),
        "journal read should retain the storage error"
    );
}

#[tokio::test]
async fn shards_append_independently_and_each_append_is_one_physical_record() {
    let capability = TestPrefixCapability::new();
    let shard_zero = Shard::try_from(0).expect("test shard should be in range");
    let shard_one = Shard::try_from(1).expect("test shard should be in range");
    let zero_location = capability.location(shard_zero);
    let one_location = capability.location(shard_one);
    let zero = ShardLogWriter::open(&zero_location)
        .await
        .expect("writer should open");
    let one = ShardLogWriter::open(&one_location)
        .await
        .expect("writer should open");

    let zero_sequence = zero
        .append(&record("zero"))
        .await
        .expect("record should append");
    let one_sequence = one
        .append(&record("one"))
        .await
        .expect("record should append");
    zero.close().await.expect("writer should close");
    one.close().await.expect("writer should close");

    let zero_reader = ShardLogRecovery::open(&zero_location)
        .await
        .expect("recovery reader should open");
    let one_reader = ShardLogRecovery::open(&one_location)
        .await
        .expect("recovery reader should open");
    let zero_records = zero_reader
        .scan::<TestRecord>()
        .await
        .expect("records should scan");
    let one_records = one_reader
        .scan::<TestRecord>()
        .await
        .expect("records should scan");
    assert_eq!(zero_records, vec![(zero_sequence, record("zero"))]);
    assert_eq!(one_records, vec![(one_sequence, record("one"))]);
    zero_reader.close().await;
    one_reader.close().await;
}

async fn check_recovery_scans(location: ShardLogLocation<impl JournalStorage>) {
    let writer = ShardLogWriter::open(&location)
        .await
        .expect("writer should open");
    let first = writer
        .append(&record("first"))
        .await
        .expect("event should append");
    let snapshot = writer
        .append_registered(super::PROJECTION_SNAPSHOTS_KEY, &record("snapshot"))
        .await
        .expect("snapshot should append");
    let last = writer
        .append(&record("last"))
        .await
        .expect("event should append");
    let end = writer.durable_end_exclusive();
    let mut beyond_end = pin!(
        writer
            .backend
            .scan(
                bytes::Bytes::from_static(super::EVENTS_KEY),
                end + 5..end + 10,
            )
            .await
            .expect("a range beyond the durable end should scan")
    );
    assert!(
        beyond_end
            .try_next()
            .await
            .expect("empty scan should finish")
            .is_none()
    );
    assert_eq!(
        beyond_end.next_sequence(),
        end + 5,
        "an empty scan should keep its cursor at the requested start"
    );
    assert_eq!(
        writer
            .scan_suffix::<TestRecord>(None, first + 1)
            .await
            .expect("bounded scan should succeed"),
        vec![(first, record("first"))],
        "recovery should exclude records beyond the captured end"
    );
    assert_eq!(
        writer
            .scan_suffix::<TestRecord>(Some(first), end)
            .await
            .expect("suffix should scan"),
        vec![(last, record("last"))],
        "event replay should skip snapshots and sequence gaps"
    );
    let snapshots = writer
        .scan_projection_snapshots::<TestRecord>(end)
        .await
        .expect("snapshots should scan");
    assert_eq!(
        snapshots
            .into_iter()
            .map(|(sequence, candidate)| (sequence, candidate.expect("snapshot should decode")))
            .collect::<Vec<_>>(),
        vec![(snapshot, record("snapshot"))]
    );
    let error = writer
        .scan_suffix::<TestRecord>(Some(last), end + 1)
        .await
        .expect_err("recovery should reject a scan that stops before its expected end");
    assert_eq!(
        error.current_context(),
        &DurableError::IncompleteScan {
            name: TestRecord::declaration().name,
            observed_end: end,
            expected_end: end + 1
        },
        "recovery should report the incomplete range"
    );
    let error = writer
        .scan_projection_snapshots::<TestRecord>(end + 1)
        .await
        .expect_err("snapshot scan should reject an incomplete range");
    assert_eq!(
        error.current_context(),
        &DurableError::IncompleteScan {
            name: TestRecord::declaration().name,
            observed_end: end,
            expected_end: end + 1
        },
        "snapshot recovery should report the incomplete range"
    );
    writer.close().await.expect("writer should close");
}

#[tokio::test]
async fn recovery_scan_bounds() {
    let capability = TestPrefixCapability::new();
    let shard = Shard::from_u8(9);
    check_recovery_scans(capability.location(shard)).await;
    check_recovery_scans(ShardLogLocation::simulated(
        shard,
        crate::sim::SimLogHandle::new(42, Vec::new()),
        Arc::clone(&capability.registry),
    ))
    .await;
}

#[tokio::test]
async fn scan_closed_storage() {
    let capability = TestPrefixCapability::new();
    let location = capability.location(Shard::from_u8(9));
    let writer = ShardLogWriter::open(&location)
        .await
        .expect("writer should open");
    let event = writer
        .append(&record("event"))
        .await
        .expect("event should append");
    let snapshot = writer
        .append_registered(super::PROJECTION_SNAPSHOTS_KEY, &record("snapshot"))
        .await
        .expect("snapshot should append");
    let mut scans = Vec::new();
    for (key, sequence) in [
        (super::EVENTS_KEY, event),
        (super::PROJECTION_SNAPSHOTS_KEY, snapshot),
    ] {
        let key = Bytes::from_static(key);
        let stream = writer
            .backend
            .scan(key.clone(), sequence..)
            .await
            .expect("scan should open before storage closes");
        scans.push((key, sequence, stream));
    }
    writer.close().await.expect("writer should close");

    for (key, next_sequence, mut stream) in scans {
        for _ in 0..2 {
            let error = stream
                .try_next()
                .await
                .expect_err("reading from closed storage should fail on each attempt");
            assert_eq!(
                error.current_context(),
                &DurableError::ReadRecord {
                    key: key.clone(),
                    next_sequence
                },
                "read failure should identify the scan key and cursor"
            );
            assert!(
                error.contains::<opendata_log::Error>(),
                "read failure should include the storage error"
            );
        }
    }
}

#[tokio::test]
async fn journal_registration_conflict() {
    let directory = tempfile::tempdir().expect("storage directory should be created");
    let registry = Arc::new(RecordRegistry::default());
    registry
        .register(RecordDeclaration {
            codec: core::any::TypeId::of::<u8>(),
            ..TEST_RECORD_DECLARATION
        })
        .expect("conflicting codec should register first");
    let location = ShardLogLocation::disposable_local(
        Shard::from_u8(1),
        "registration-conflict",
        directory.path(),
        registry,
    );

    let error = read_journal::<TestRecord>(&location)
        .await
        .expect_err("a conflicting codec should prevent reading the journal");
    assert_eq!(
        error.current_context(),
        &DurableError::RegisterRecord {
            name: TEST_RECORD_DECLARATION.name,
        }
    );
    assert!(
        matches!(
            error.downcast_ref::<DeclarationError>(),
            Some(DeclarationError::ConflictingDeclaration { .. })
        ),
        "registration failure should retain the declaration conflict"
    );
}

#[tokio::test]
async fn pre_invocation_encoding_failure_is_definitely_not_committed() {
    let capability = TestPrefixCapability::new();
    let location = capability.location(Shard::try_from(9).expect("test shard should be in range"));
    let writer = ShardLogWriter::open(&location)
        .await
        .expect("writer should open");
    let mut invalid = record("valid-body");
    invalid.fail_encode = true;
    let error = writer
        .append(&invalid)
        .await
        .expect_err("invalid record should fail encoding");
    assert_eq!(
        error.current_context().kind,
        AppendFailureKind::DefinitelyNotCommitted
    );
    assert_eq!(
        error.downcast_ref::<CompatError>(),
        Some(&CompatError::Encode {
            name: TestRecord::declaration().name
        })
    );
    assert_eq!(
        error.downcast_ref::<DurableError>(),
        Some(&DurableError::EncodeRecord {
            name: TestRecord::declaration().name
        })
    );
    writer.close().await.expect("writer should close");
}

#[tokio::test]
async fn unregistered_record_is_refused_before_any_append_side_effect() {
    #[derive(Debug, Clone, Serialize, Deserialize)]
    struct UnregisteredRecord;

    const UNREGISTERED_DECLARATION: RecordDeclaration = RecordDeclaration {
        name: "kernel_shard_log_unregistered_record",
        ..TEST_RECORD_DECLARATION
    };

    impl DurableRecord for UnregisteredRecord {
        const MIGRATION_POLICY: MigrationPolicy = MigrationPolicy::NeverRetireWhileUntrimmed;

        fn declaration() -> RecordDeclaration {
            UNREGISTERED_DECLARATION
        }

        fn encode<W: Write>(&self, _writer: W) -> Result<(), Report<CompatError>> {
            Ok(())
        }

        fn decode(_bytes: &[u8]) -> Result<Self, Report<CompatError>> {
            Ok(Self)
        }
    }

    impl VersionedRecord for UnregisteredRecord {
        type Current = Self;

        fn normalize(self) -> Result<Self, Report<CompatError>> {
            Ok(self)
        }
    }

    impl UntrimmedJournalRecord for UnregisteredRecord {}

    let other_registry = RecordRegistry::default();
    other_registry
        .register(UnregisteredRecord::declaration())
        .expect("the record should register in an unrelated registry");
    let capability = TestPrefixCapability::new();
    let location = capability.location(Shard::try_from(10).expect("test shard should be in range"));
    let writer = ShardLogWriter::open(&location)
        .await
        .expect("writer should open");
    let error = writer
        .append(&UnregisteredRecord)
        .await
        .expect_err("unregistered record should be rejected");
    assert_eq!(
        error.current_context().kind,
        AppendFailureKind::DefinitelyNotCommitted
    );
    assert!(matches!(
        error.downcast_ref::<crate::registry::DeclarationError>(),
        Some(crate::registry::DeclarationError::Unregistered { .. })
    ));
    assert_eq!(
        error.downcast_ref::<DurableError>(),
        Some(&DurableError::ValidateRecordRegistration {
            name: UNREGISTERED_DECLARATION.name,
        })
    );
    writer.close().await.expect("writer should close");
    assert!(
        read_journal::<TestRecord>(&location)
            .await
            .expect("journal should be readable after rejection")
            .is_empty(),
        "rejected append should leave the journal empty"
    );
}

#[tokio::test]
async fn durability_wait_retries_after_timeout() {
    let capability = TestPrefixCapability::new();
    let location = capability.location(Shard::try_from(41).expect("test shard should be in range"));
    let writer = ShardLogWriter::open(&location)
        .await
        .expect("writer should open");
    let first = writer
        .append(&record("stall-probe"))
        .await
        .expect("record should append");

    // After the second append, the exclusive durable end is `first + 2`.
    let required = first + 2;
    let (waited, appended) = tokio::join!(
        wait_until_durable_with(writer.raw_log(), required, Duration::from_millis(20), 50,),
        async {
            tokio::time::sleep(Duration::from_millis(150)).await;
            writer.append(&record("stall-probe-second")).await
        }
    );
    appended.expect("delayed record should append");
    waited.expect("a timed-out wait should retry until the append is durable");

    let started = std::time::Instant::now();
    let error = wait_until_durable_with(
        writer.raw_log(),
        required + 1_000,
        Duration::from_millis(10),
        3,
    )
    .await
    .expect_err("waiting for a sequence that is never stored should fail");
    assert_eq!(
        error.current_context(),
        &DurableError::DurabilityTimeout {
            required: required + 1_000,
            attempts: 3,
            attempt_timeout: Duration::from_millis(10),
        }
    );
    assert!(
        started.elapsed() >= Duration::from_millis(30),
        "all three attempts should time out before the wait fails"
    );
    writer.close().await.expect("writer should close");
}

#[test]
fn only_the_pinned_slate_fence_message_is_classified_as_fenced() {
    assert_eq!(
        post_invocation_source(
            DurableError::FlushRecord,
            std::io::Error::other("storage error: Closed error: detected newer DB client")
        )
        .current_context()
        .kind,
        AppendFailureKind::Fenced
    );
    assert_eq!(
        post_invocation_source(
            DurableError::FlushRecord,
            std::io::Error::other("unrelated fencing proxy timeout")
        )
        .current_context()
        .kind,
        AppendFailureKind::CommitUnknown
    );
}

#[tokio::test]
async fn newer_writer_fences_old_writer_with_typed_failure_kind() {
    let capability = TestPrefixCapability::new();
    let location = capability.location(Shard::try_from(39).expect("test shard should be in range"));
    let first = ShardLogWriter::open(&location)
        .await
        .expect("writer should open");
    first
        .append(&record("first"))
        .await
        .expect("record should append");
    let second = ShardLogWriter::open(&location)
        .await
        .expect("writer should open");
    second
        .append(&record("second"))
        .await
        .expect("record should append");

    let error = first
        .append(&record("stale"))
        .await
        .expect_err("stale writer should be fenced");
    assert_eq!(error.current_context().kind, AppendFailureKind::Fenced);

    let _: Result<_, _> = first.close().await;
    second.close().await.expect("writer should close");
    let reader = ShardLogRecovery::open(&location)
        .await
        .expect("recovery reader should open");
    let records = reader
        .scan::<TestRecord>()
        .await
        .expect("records should scan");
    assert_eq!(records.len(), 2);
    assert_eq!(records[0].1, record("first"));
    assert_eq!(records[1].1, record("second"));
    reader.close().await;
}
