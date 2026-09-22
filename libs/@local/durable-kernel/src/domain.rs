//! Application events, state, and external operations.
//!
//! Implement [`DomainEvent`] for events, [`Fold`] for state updates, and [`Executor`] for
//! external work. [`SimpleDomain`] connects the event and state types. The [`crate::runtime`]
//! runs the executor. [`Hosted`] adapts these types to the lower-level [`crate::port`] API.
//!
//! The kernel handles event IDs, duplicate detection, journal sequencing, snapshots, and
//! recovery. Submit events through [`crate::runtime::RunningKernel::submit`].

use alloc::collections::BTreeMap;
use core::{any::Any, error::Error, fmt, marker::PhantomData};
use std::io::{self, Write};

use chrono::{DateTime, Utc};
use error_stack::{Report, ResultExt as _};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::json;
use sha2::{Digest as _, Sha256};

use crate::{
    ids::{EffectId, EventId, JournalRecordDigest, content_digest_bytes},
    port::{ControlDomain, EventDomain, Prepared, QueryDomain, SnapshotDomain},
    registry::{
        AlgorithmVersion, CompatError, DeclarationError, DurabilityClass, DurableRecord,
        MigrationPolicy, RecordDeclaration, RecordRegistry, UntrimmedJournalRecord,
        VersionedRecord, reject_unknown_fields,
    },
    routing::{SHARD_COUNT, Shard},
    shard_log::{ShardCommandError, ShardCommandHandle},
};

pub const MAX_PARTITION_KEY_BYTES: usize = 1024;
const MAX_EVENT_RECORD_BYTES: usize = 4 * 1024 * 1024;

struct BoundedWriter<W> {
    inner: W,
    max_bytes: usize,
    encoded_bytes: usize,
}

impl<W: Write> BoundedWriter<W> {
    const fn new(inner: W, max_bytes: usize) -> Self {
        Self {
            inner,
            max_bytes,
            encoded_bytes: 0,
        }
    }
}

impl<W: Write> Write for BoundedWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let remaining = self.max_bytes.saturating_sub(self.encoded_bytes);
        self.inner.write_all(buf.get(..remaining).unwrap_or(buf))?;
        self.encoded_bytes = self.encoded_bytes.saturating_add(buf.len());
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.inner.flush()
    }
}

fn encode_json<T: Serialize>(
    value: &T,
    writer: impl Write,
    name: &'static str,
    max_bytes: usize,
) -> Result<(), Report<CompatError>> {
    let mut writer = BoundedWriter::new(writer, max_bytes);
    serde_json::to_writer(&mut writer, value).change_context(CompatError::Encode { name })?;
    if writer.encoded_bytes > max_bytes {
        return Err(Report::new(CompatError::TooLarge {
            name,
            actual_bytes: writer.encoded_bytes,
            max_bytes,
        }));
    }
    Ok(())
}

/// An application event stored in the journal.
///
/// Event IDs are computed from serialized contents. An event's contents and partition must stay
/// the same each time it is submitted.
///
/// Repeated submissions of the same event are deduplicated. Give distinct actions with
/// identical payloads a request ID or another distinguishing field.
///
/// Keep decoding all stored event versions when changing this type. A versioned serde enum is
/// one way to retain that compatibility.
pub trait DomainEvent {
    /// The event name stored in journal records. Keep this stable so existing records remain
    /// readable.
    fn name() -> &'static str;

    /// The partition used for shard routing, state-change notifications, and startup key
    /// discovery.
    fn partition(&self) -> PartitionKey;
}

/// Maintains application state for all partitions on one shard.
///
/// [`validate`](Self::validate) checks new submissions before they are appended.
/// [`apply`](Self::apply) consumes the prepared change after a durable append.
/// [`replay`](Self::replay) must produce the same state change from the accepted event,
/// without rerunning admission rules. Both paths must be deterministic.
///
/// State is serialized into snapshots. Its serialization must also be deterministic.
pub trait Fold<E>: Clone + Send + Sync + Serialize + DeserializeOwned + 'static {
    /// The application error reported when validation rejects an event.
    type Rejection: Error + Send + Sync + 'static;

    /// The state change prepared by validation and consumed after the event is durable.
    type Validated: Send;

    /// # Errors
    ///
    /// Returns a rejection when the event violates the domain’s validation rules.
    fn validate(&self, event: &E) -> Result<Self::Validated, Report<Self::Rejection>>;
    fn apply(&mut self, validated: Self::Validated);
    /// Applies an accepted historical event without rerunning admission rules.
    fn replay(&mut self, event: &E);
}

/// Connects an application’s event and state types.
///
/// Pass an [`Executor`] to [`Kernel::start`](crate::runtime::Kernel::start) to run external
/// operations.
pub trait SimpleDomain: Send + Sync + 'static {
    type Event: DomainEvent + Serialize + DeserializeOwned + Send + 'static;
    type Projection: Fold<Self::Event>;

    /// Creates the application state for an empty journal.
    fn empty_projection() -> Self::Projection;
}

/// Plans and executes external operations from application state.
///
/// [`plan`](Self::plan) must be a pure function of the state. [`execute`](Self::execute)
/// returns completion events. After those events are applied, the next plan must exclude the
/// completed effect.
///
/// A crash after an external write but before its completion event is saved can cause the
/// effect to run again. Pass [`effect_id`] as an idempotency key to a system that stores the
/// result and returns it for repeated requests.
pub trait Executor<S: SimpleDomain>: Send + Sync + 'static {
    type Effect: Serialize + Clone + Send + Sync + 'static;
    type Error: Error + Send + Sync + 'static;

    fn plan<'a>(
        &'a self,
        projection: &'a S::Projection,
    ) -> impl IntoIterator<Item = Self::Effect> + 'a;

    /// Runs one external operation and returns the events that record its result.
    ///
    /// Completion events are saved individually. They must pass validation against state that
    /// may have changed during execution. Retries can repeat the external operation.
    ///
    /// # Errors
    ///
    /// Returns [`Retry`] with the failure report and an optional delay before another attempt.
    fn execute(
        &self,
        effect: &Self::Effect,
    ) -> impl core::future::Future<Output = Result<Vec<S::Event>, Retry<Self::Error>>> + Send;
}

/// Delays another attempt at this effect while the driver processes other work.
/// The delay is held in memory, so a restart can retry the effect immediately.
#[derive(Debug)]
pub struct Retry<E> {
    pub reason: Report<E>,
    /// Uses the runtime polling interval when `None`.
    pub after: Option<core::time::Duration>,
}

/// Computes an idempotency key from an effect’s serialized contents.
///
/// # Errors
///
/// Returns an error if the effect cannot be serialized as JSON.
pub fn effect_id<T: Serialize>(effect: &T) -> Result<EffectId, serde_json::Error> {
    content_digest_bytes("domain-effect:v1", effect).map(EffectId::from_bytes)
}

#[derive(
    Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, derive_more::Display,
)]
#[serde(try_from = "String", into = "String")]
pub struct PartitionKey(String);

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum InvalidPartitionKey {
    #[display("partition key must not be empty")]
    Empty,
    #[display("partition key is {actual_bytes} bytes; maximum is {MAX_PARTITION_KEY_BYTES}")]
    TooLong { actual_bytes: usize },
    #[display("partition key must not contain whitespace or control characters")]
    UnsafeCharacter,
}

impl PartitionKey {
    /// Parses a partition key of at most 1024 bytes.
    ///
    /// # Errors
    ///
    /// Returns an error for an empty key, a key over the byte limit, or whitespace or control
    /// characters.
    pub fn parse(value: impl Into<String>) -> Result<Self, InvalidPartitionKey> {
        let value = value.into();
        if value.is_empty() {
            return Err(InvalidPartitionKey::Empty);
        }
        if value.len() > MAX_PARTITION_KEY_BYTES {
            return Err(InvalidPartitionKey::TooLong {
                actual_bytes: value.len(),
            });
        }
        if value
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
        {
            return Err(InvalidPartitionKey::UnsafeCharacter);
        }
        Ok(Self(value))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl TryFrom<String> for PartitionKey {
    type Error = InvalidPartitionKey;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::parse(value)
    }
}

impl From<PartitionKey> for String {
    fn from(key: PartitionKey) -> Self {
        key.0
    }
}

/// Routes a partition to a stable shard by interpreting eight digest bytes as a big-endian integer
/// and reducing it by the shard count.
///
/// The result does not depend on the process that computes it.
///
/// # Panics
///
/// Panics if a shard index cannot be represented.
#[expect(
    clippy::big_endian_bytes,
    reason = "shard routing defines the digest prefix as big-endian"
)]
#[must_use]
pub fn shard_of(key: &PartitionKey) -> Shard {
    let digest: [u8; 32] = Sha256::digest(key.as_str().as_bytes()).into();
    let routing_value = u64::from_be_bytes(
        *digest
            .first_chunk::<8>()
            .expect("digest should contain eight prefix bytes"),
    );
    Shard::try_from(
        u16::try_from(routing_value % core::num::NonZeroU64::from(SHARD_COUNT))
            .expect("shard index should fit in u16"),
    )
    .expect("a value reduced modulo the shard count should be a valid shard")
}

/// Wraps an application event with its partition and event ID.
///
/// Records are stored under [`DomainEvent::name`], which must be unique to the event type.
/// [`DurableRecord::decode`] reports ID and partition mismatches as [`CompatError`] values.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(
    tag = "version",
    content = "data",
    rename_all = "snake_case",
    bound(deserialize = "E: DomainEvent + Serialize + Deserialize<'de>")
)]
pub enum EventRecord<E> {
    V1(EventRecordV1<E>),
}

/// An event record whose ID and partition match the event.
#[derive(Debug, Clone, Serialize)]
pub struct EventRecordV1<E> {
    event_id: EventId,
    partition: PartitionKey,
    event: E,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EventRecordFields<E> {
    event_id: EventId,
    partition: PartitionKey,
    event: E,
}

impl<'de, E: DomainEvent + Serialize + Deserialize<'de>> Deserialize<'de> for EventRecordV1<E> {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let EventRecordFields {
            event_id,
            partition,
            event,
        } = EventRecordFields::deserialize(deserializer)?;
        Self::from_parts(event_id, partition, event)
            .map_err(|error| serde::de::Error::custom(format!("{error:#}")))
    }
}

fn derive_event_id<E: DomainEvent + Serialize>(
    partition: &PartitionKey,
    event: &E,
) -> Result<EventId, Report<CompatError>> {
    let event =
        serde_json::to_value(event).change_context(CompatError::Encode { name: E::name() })?;
    content_digest_bytes(
        "domain-event:v1",
        &json!({ "partition": partition, "event": event }),
    )
    .map(EventId::from_bytes)
    .change_context(CompatError::Encode { name: E::name() })
}

impl<E> EventRecordV1<E> {
    pub const fn event_id(&self) -> EventId {
        self.event_id
    }

    pub const fn partition(&self) -> &PartitionKey {
        &self.partition
    }

    pub const fn event(&self) -> &E {
        &self.event
    }

    pub fn into_event(self) -> E {
        self.event
    }
}

impl<E: DomainEvent + Serialize> EventRecordV1<E> {
    /// Derives an event’s identity and builds its journal record.
    ///
    /// # Errors
    ///
    /// Returns an error if the event cannot be serialized to derive its identity.
    pub fn new(event: E) -> Result<Self, Report<CompatError>> {
        let partition = event.partition();
        let event_id = derive_event_id(&partition, &event)?;
        Ok(Self {
            event_id,
            partition,
            event,
        })
    }

    /// Creates a record from an event and its stored ID and partition.
    ///
    /// # Errors
    ///
    /// Returns an error if the ID or partition does not match the event, or if the event
    /// cannot be serialized.
    pub fn from_parts(
        event_id: EventId,
        partition: PartitionKey,
        event: E,
    ) -> Result<Self, Report<CompatError>> {
        let record = Self::new(event)?;
        if partition != record.partition {
            return Err(Report::new(CompatError::PartitionMismatch {
                name: E::name(),
                expected: record.partition,
                actual: partition,
            }));
        }
        if event_id != record.event_id {
            return Err(Report::new(CompatError::EventIdMismatch {
                name: E::name(),
                expected: record.event_id,
                actual: event_id,
            }));
        }
        Ok(Self {
            event_id,
            partition,
            event: record.event,
        })
    }

    fn encode(&self, writer: impl Write) -> Result<(), Report<CompatError>> {
        #[derive(Serialize)]
        struct Envelope<'a, E> {
            version: &'static str,
            data: &'a EventRecordV1<E>,
        }

        encode_json(
            &Envelope {
                version: "v1",
                data: self,
            },
            writer,
            E::name(),
            MAX_EVENT_RECORD_BYTES,
        )
    }

    fn digest(&self) -> Result<JournalRecordDigest, Report<CompatError>> {
        let event = serde_json::to_value(&self.event)
            .change_context(CompatError::Encode { name: E::name() })?;
        content_digest_bytes(
            "domain-record:v1",
            &json!({
                "event_id": self.event_id,
                "partition": self.partition,
                "event": event,
            }),
        )
        .map(JournalRecordDigest::from_bytes)
        .change_context(CompatError::Encode { name: E::name() })
    }
}

/// Builds a record declaration using [`DomainEvent::name`].
fn event_declaration<E: DomainEvent + 'static>() -> RecordDeclaration {
    RecordDeclaration {
        name: E::name(),
        codec: core::any::TypeId::of::<E>(),
        owning_module: "kernel::domain",
        emitted_version: 1,
        supported_versions: &[1],
        algorithm_versions: &[AlgorithmVersion {
            name: "domain_event_identity",
            version: 1,
        }],
        durability: DurabilityClass::ImmutableJournal,
        migration: MigrationPolicy::NeverRetireWhileUntrimmed,
    }
}

impl<E: DomainEvent + Serialize + DeserializeOwned + 'static> DurableRecord for EventRecord<E> {
    const MIGRATION_POLICY: MigrationPolicy = MigrationPolicy::NeverRetireWhileUntrimmed;

    fn declaration() -> RecordDeclaration {
        event_declaration::<E>()
    }

    fn encode<W: Write>(&self, writer: W) -> Result<(), Report<CompatError>> {
        match self {
            Self::V1(record) => record.encode(writer),
        }
    }

    fn decode(bytes: &[u8]) -> Result<Self, Report<CompatError>> {
        #[derive(Deserialize)]
        struct Envelope<E> {
            data: EventRecordFields<E>,
        }

        if bytes.len() > MAX_EVENT_RECORD_BYTES {
            return Err(Report::new(CompatError::TooLarge {
                name: E::name(),
                actual_bytes: bytes.len(),
                max_bytes: MAX_EVENT_RECORD_BYTES,
            }));
        }
        let value: serde_json::Value = serde_json::from_slice(bytes)
            .change_context(CompatError::Decode { name: E::name() })?;
        reject_unknown_fields(E::name(), "", &value, &["version", "data"])?;
        let version = value
            .get("version")
            .ok_or_else(|| CompatError::MissingVersion { name: E::name() })?
            .as_str()
            .ok_or_else(|| CompatError::InvalidVersionType { name: E::name() })?;
        if version != "v1" {
            return Err(Report::new(CompatError::UnsupportedVersion {
                name: E::name(),
                version: version.to_owned(),
            }));
        }
        let Envelope { data } = serde_json::from_value(value)
            .change_context(CompatError::Decode { name: E::name() })?;
        EventRecordV1::from_parts(data.event_id, data.partition, data.event).map(Self::V1)
    }
}

impl<E: DomainEvent + Serialize + DeserializeOwned + 'static> VersionedRecord for EventRecord<E> {
    type Current = EventRecordV1<E>;

    fn normalize(self) -> Result<Self::Current, Report<CompatError>> {
        let Self::V1(record) = self;
        Ok(record)
    }
}

impl<E: DomainEvent + Serialize + DeserializeOwned + 'static> UntrimmedJournalRecord
    for EventRecord<E>
{
}

/// Application state together with processed event IDs and journal positions.
///
/// The kernel uses these fields to detect duplicates and check that recovery preserves
/// acknowledged events.
#[derive(Debug, Clone, Default)]
pub struct KernelProjection<P> {
    seen: BTreeMap<EventId, JournalRecordDigest>,
    partitions: BTreeMap<PartitionKey, u64>,
    through_log_sequence: Option<u64>,
    domain: P,
}

impl<P> KernelProjection<P> {
    pub const fn domain(&self) -> &P {
        &self.domain
    }

    pub const fn through_log_sequence(&self) -> Option<u64> {
        self.through_log_sequence
    }

    pub fn partition_sequence(&self, key: &PartitionKey) -> Option<u64> {
        self.partitions.get(key).copied()
    }
}

/// A rejected record or state update. Application validation reports retain their typed
/// context and attachments in [`Self::Rejected`].
#[derive(Debug)]
pub enum FoldError<R> {
    Rejected {
        event_id: EventId,
        rejection: Report<R>,
    },
    ForeignShard {
        event_id: EventId,
        partition: PartitionKey,
    },
    ConflictingReuse {
        event_id: EventId,
    },
    InvalidRecord(Report<CompatError>),
    NonIncreasingSequence {
        previous: u64,
        proposed: u64,
    },
}

impl<R: fmt::Display> fmt::Display for FoldError<R> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Rejected { event_id, .. } => write!(formatter, "event {event_id} was rejected"),
            Self::ForeignShard {
                event_id,
                partition,
            } => write!(
                formatter,
                "event {event_id} partition {partition} routes to a different shard"
            ),
            Self::ConflictingReuse { event_id } => {
                write!(
                    formatter,
                    "event ID {event_id} was reused with different content"
                )
            }
            Self::InvalidRecord(_) => formatter.write_str("event record is invalid"),
            Self::NonIncreasingSequence { previous, proposed } => write!(
                formatter,
                "shard sequence {proposed} does not advance {previous}"
            ),
        }
    }
}

impl<R: Error + 'static> Error for FoldError<R> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Rejected { rejection, .. } => Some(rejection.as_error()),
            Self::InvalidRecord(error) => Some(error.as_error()),
            Self::ForeignShard { .. }
            | Self::ConflictingReuse { .. }
            | Self::NonIncreasingSequence { .. } => None,
        }
    }
}

impl<R> From<Report<CompatError>> for FoldError<R> {
    fn from(error: Report<CompatError>) -> Self {
        Self::InvalidRecord(error)
    }
}

/// A read-only closure executed against the projection inside the command loop.
pub struct ReadQuery<P>(BoxedRead<P>);

type BoxedRead<P> = Box<dyn for<'a> FnOnce(&'a KernelProjection<P>) -> Box<dyn Any + Send> + Send>;

pub type ReadResult = Box<dyn Any + Send>;

/// An uninhabited type for control requests and work items that [`Hosted`] does not produce.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Never {}

/// Metadata shared by application snapshot declarations.
const DOMAIN_SNAPSHOT_DECLARATION: RecordDeclaration = RecordDeclaration {
    name: "domain_projection_snapshot",
    codec: core::any::TypeId::of::<()>(),
    owning_module: "kernel::domain",
    emitted_version: 1,
    supported_versions: &[1],
    algorithm_versions: &[],
    durability: DurabilityClass::ImmutableJournal,
    migration: MigrationPolicy::NeverRetireWhileUntrimmed,
};

fn snapshot_declaration<S: SimpleDomain>() -> RecordDeclaration {
    RecordDeclaration {
        name: core::any::type_name::<ProjectionSnapshot<S>>(),
        codec: core::any::TypeId::of::<S::Projection>(),
        ..DOMAIN_SNAPSHOT_DECLARATION
    }
}

const MAX_SNAPSHOT_BYTES: usize = 15 * 1024 * 1024;

/// Stores application state and the journal position it includes.
///
/// The state is stored inline, up to `MAX_SNAPSHOT_BYTES`. Larger states skip snapshotting.
/// Recovery uses an earlier snapshot or replays the full journal.
#[derive(Serialize, Deserialize)]
#[serde(
    tag = "version",
    content = "data",
    rename_all = "snake_case",
    bound = ""
)]
pub enum ProjectionSnapshot<S: SimpleDomain> {
    V1(ProjectionSnapshotV1<S>),
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields, bound = "")]
pub struct ProjectionSnapshotV1<S: SimpleDomain> {
    shard: Shard,
    through_log_sequence: u64,
    created_at: DateTime<Utc>,
    seen: BTreeMap<EventId, JournalRecordDigest>,
    partitions: BTreeMap<PartitionKey, u64>,
    domain: S::Projection,
}

/// State captured by the command loop for a snapshot. The driver adds the timestamp outside the
/// loop.
pub struct ProjectionSnapshotPayload<S: SimpleDomain> {
    shard: Shard,
    through_log_sequence: u64,
    seen: BTreeMap<EventId, JournalRecordDigest>,
    partitions: BTreeMap<PartitionKey, u64>,
    domain: S::Projection,
}

impl<S: SimpleDomain> ProjectionSnapshotPayload<S> {
    pub fn into_record(self, created_at: DateTime<Utc>) -> ProjectionSnapshot<S> {
        ProjectionSnapshot::V1(ProjectionSnapshotV1 {
            shard: self.shard,
            through_log_sequence: self.through_log_sequence,
            created_at,
            seen: self.seen,
            partitions: self.partitions,
            domain: self.domain,
        })
    }
}

impl<S: SimpleDomain> DurableRecord for ProjectionSnapshot<S> {
    const MIGRATION_POLICY: MigrationPolicy = MigrationPolicy::NeverRetireWhileUntrimmed;

    fn declaration() -> RecordDeclaration {
        snapshot_declaration::<S>()
    }

    fn encode<W: Write>(&self, writer: W) -> Result<(), Report<CompatError>> {
        encode_json(
            self,
            writer,
            DOMAIN_SNAPSHOT_DECLARATION.name,
            MAX_SNAPSHOT_BYTES,
        )
    }

    fn decode(bytes: &[u8]) -> Result<Self, Report<CompatError>> {
        if bytes.len() > MAX_SNAPSHOT_BYTES {
            return Err(Report::new(CompatError::TooLarge {
                name: DOMAIN_SNAPSHOT_DECLARATION.name,
                actual_bytes: bytes.len(),
                max_bytes: MAX_SNAPSHOT_BYTES,
            }));
        }
        let value: serde_json::Value =
            serde_json::from_slice(bytes).change_context(CompatError::Decode {
                name: DOMAIN_SNAPSHOT_DECLARATION.name,
            })?;
        reject_unknown_fields(
            DOMAIN_SNAPSHOT_DECLARATION.name,
            "",
            &value,
            &["version", "data"],
        )?;
        let version = value
            .get("version")
            .ok_or(CompatError::MissingVersion {
                name: DOMAIN_SNAPSHOT_DECLARATION.name,
            })?
            .as_str()
            .ok_or(CompatError::InvalidVersionType {
                name: DOMAIN_SNAPSHOT_DECLARATION.name,
            })?;
        if version != "v1" {
            return Err(Report::new(CompatError::UnsupportedVersion {
                name: DOMAIN_SNAPSHOT_DECLARATION.name,
                version: version.to_owned(),
            }));
        }
        serde_json::from_value(value).change_context(CompatError::Decode {
            name: DOMAIN_SNAPSHOT_DECLARATION.name,
        })
    }
}

/// Adapts [`SimpleDomain`] to the [`crate::port::Domain`] interface used by the command loop.
pub struct Hosted<S>(PhantomData<fn() -> S>);

impl<S> fmt::Debug for Hosted<S> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("Hosted")
    }
}

impl<S> Clone for Hosted<S> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<S> Copy for Hosted<S> {}

/// Registers the application’s event and snapshot record names before the first append.
///
/// # Errors
///
/// Returns an error if a record name conflicts with an existing declaration or a declaration is
/// invalid.
pub fn register<S: SimpleDomain>(
    registry: &RecordRegistry,
) -> Result<(), Report<DeclarationError>> {
    registry.register(EventRecord::<S::Event>::declaration())?;
    registry.register(ProjectionSnapshot::<S>::declaration())?;
    Ok(())
}

/// A validated application change and the metadata recorded after a durable append.
pub struct PreparedEvent<S: SimpleDomain> {
    event_id: EventId,
    partition: PartitionKey,
    digest: JournalRecordDigest,
    change: <S::Projection as Fold<S::Event>>::Validated,
}

/// An error while restoring or checking durable state.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum RecoveryError {
    #[display("domain record at sequence {sequence} is invalid")]
    InvalidRecord { sequence: u64 },
    #[display(
        "domain record at sequence {sequence} routes to shard {} instead of {}",
        crate::routing::shard_path(*actual),
        crate::routing::shard_path(*expected)
    )]
    ForeignShard {
        sequence: u64,
        expected: Shard,
        actual: Shard,
    },
    #[display("domain record sequence {proposed} does not advance {previous}")]
    NonIncreasingSequence { previous: u64, proposed: u64 },
    #[display("event ID {event_id} was reused with different content at sequence {sequence}")]
    ConflictingReuse { event_id: EventId, sequence: u64 },
    #[display(
        "snapshot for shard {} was offered to shard {}",
        crate::routing::shard_path(*actual),
        crate::routing::shard_path(*expected)
    )]
    SnapshotShardMismatch { expected: Shard, actual: Shard },
    #[display("durable prefix regressed from {previous} to {recovered:?}")]
    RegressedSequence {
        previous: u64,
        recovered: Option<u64>,
    },
    #[display("durable prefix lost or changed acknowledged event {event_id}")]
    LostEvent { event_id: EventId },
}

impl<S: SimpleDomain> EventDomain for Hosted<S> {
    type Delta = PreparedEvent<S>;
    type FoldError = FoldError<<S::Projection as Fold<S::Event>>::Rejection>;
    type Projection = KernelProjection<S::Projection>;
    type Record = EventRecord<S::Event>;
    type RecordCurrent = EventRecordV1<S::Event>;
    type RecoveryError = RecoveryError;
    type StateKey = PartitionKey;
    type WorkIntent = Never;

    fn empty_projection() -> Self::Projection {
        KernelProjection {
            seen: BTreeMap::new(),
            partitions: BTreeMap::new(),
            through_log_sequence: None,
            domain: S::empty_projection(),
        }
    }

    fn record_shard(record: &Self::RecordCurrent) -> Shard {
        shard_of(&record.partition)
    }

    fn reject_foreign_shard(record: &Self::RecordCurrent) -> Self::FoldError {
        FoldError::ForeignShard {
            event_id: record.event_id,
            partition: record.partition.clone(),
        }
    }

    fn record_event_id(record: &Self::RecordCurrent) -> EventId {
        record.event_id
    }

    fn record_state_key(record: &Self::RecordCurrent) -> PartitionKey {
        record.partition.clone()
    }

    fn encode_record<W: Write>(
        record: &Self::RecordCurrent,
        writer: W,
    ) -> Result<(), Report<CompatError>> {
        record.encode(writer)
    }

    fn prepare(
        projection: &Self::Projection,
        record: &Self::RecordCurrent,
    ) -> Result<Prepared<Self::Delta>, Self::FoldError> {
        let digest = record.digest()?;
        if let Some(seen) = projection.seen.get(&record.event_id) {
            return if *seen == digest {
                Ok(Prepared::Noop)
            } else {
                Err(FoldError::ConflictingReuse {
                    event_id: record.event_id,
                })
            };
        }
        let change = projection
            .domain
            .validate(&record.event)
            .map_err(|rejection| FoldError::Rejected {
                event_id: record.event_id,
                rejection,
            })?;
        Ok(Prepared::Mutation(PreparedEvent {
            event_id: record.event_id,
            partition: record.partition.clone(),
            digest,
            change,
        }))
    }

    fn finalize(
        projection: &mut Self::Projection,
        delta: Self::Delta,
        shard_sequence: u64,
    ) -> Result<(), Self::FoldError> {
        let PreparedEvent {
            event_id,
            partition,
            digest,
            change,
        } = delta;
        if let Some(previous) = projection.through_log_sequence
            && shard_sequence <= previous
        {
            return Err(FoldError::NonIncreasingSequence {
                previous,
                proposed: shard_sequence,
            });
        }
        projection.seen.insert(event_id, digest);
        projection.partitions.insert(partition, shard_sequence);
        projection.through_log_sequence = Some(shard_sequence);
        projection.domain.apply(change);
        Ok(())
    }

    fn state_sequence(projection: &Self::Projection, key: &PartitionKey) -> Option<u64> {
        projection.partitions.get(key).copied()
    }

    fn through_sequence(projection: &Self::Projection) -> Option<u64> {
        projection.through_log_sequence
    }

    fn replay(
        projection: &mut Self::Projection,
        shard: Shard,
        sequence: u64,
        record: Self::Record,
    ) -> Result<(), Report<RecoveryError>> {
        let record = record
            .normalize()
            .change_context(RecoveryError::InvalidRecord { sequence })?;
        let record_shard = shard_of(&record.partition);
        if record_shard != shard {
            return Err(Report::new(RecoveryError::ForeignShard {
                sequence,
                expected: shard,
                actual: record_shard,
            }));
        }
        if let Some(previous) = projection.through_log_sequence
            && sequence <= previous
        {
            return Err(Report::new(RecoveryError::NonIncreasingSequence {
                previous,
                proposed: sequence,
            }));
        }
        let digest = record
            .digest()
            .change_context(RecoveryError::InvalidRecord { sequence })?;
        match projection.seen.get(&record.event_id) {
            // A lost acknowledgement can leave duplicate records in the journal.
            Some(seen) if *seen == digest => {
                projection.through_log_sequence = Some(sequence);
                Ok(())
            }
            Some(_seen) => Err(Report::new(RecoveryError::ConflictingReuse {
                event_id: record.event_id,
                sequence,
            })),
            None => {
                projection.seen.insert(record.event_id, digest);
                projection
                    .partitions
                    .insert(record.partition.clone(), sequence);
                projection.through_log_sequence = Some(sequence);
                projection.domain.replay(&record.event);
                Ok(())
            }
        }
    }

    fn validate_recovered_prefix(
        previous: &Self::Projection,
        recovered: &Self::Projection,
    ) -> Result<(), Report<RecoveryError>> {
        if let Some(previous) = previous.through_log_sequence
            && recovered
                .through_log_sequence
                .is_none_or(|new| new < previous)
        {
            return Err(Report::new(RecoveryError::RegressedSequence {
                previous,
                recovered: recovered.through_log_sequence,
            }));
        }
        for (event_id, digest) in &previous.seen {
            if recovered.seen.get(event_id) != Some(digest) {
                return Err(Report::new(RecoveryError::LostEvent {
                    event_id: *event_id,
                }));
            }
        }
        Ok(())
    }

    fn live_work(_projection: &Self::Projection) -> Vec<Never> {
        Vec::new()
    }

    fn initial_state_keys(projection: &Self::Projection) -> Vec<PartitionKey> {
        projection.partitions.keys().cloned().collect()
    }
}

impl<S: SimpleDomain> QueryDomain for Hosted<S> {
    type Query = ReadQuery<S::Projection>;
    type QueryResult = ReadResult;

    fn answer(projection: &Self::Projection, query: Self::Query) -> Self::QueryResult {
        (query.0)(projection)
    }
}

impl<S: SimpleDomain> ControlDomain for Hosted<S> {
    type ControlOutcome = Never;
    type ControlRejection = Never;
    type ControlRequest = Never;
    type ControlSnapshot = Never;

    fn control_shard(_request: &Never) -> Shard {
        unreachable!("hosted domains have no control requests")
    }

    fn describe_foreign_control(_request: &Never) -> String {
        unreachable!("hosted domains have no control requests")
    }

    fn inspect_control(
        _projection: &Self::Projection,
        _request: &Never,
    ) -> Result<Never, Report<ShardCommandError>> {
        unreachable!("hosted domains have no control requests")
    }

    fn control_prior_outcome(_snapshot: &Never) -> Option<Never> {
        unreachable!("hosted domains have no control requests")
    }

    fn control_event_id(_request: &Never) -> EventId {
        unreachable!("hosted domains have no control requests")
    }

    fn build_control_record(
        _projection: &Self::Projection,
        _request: &Never,
        _preflight_rejection: Option<Never>,
    ) -> Result<Self::RecordCurrent, Self::FoldError> {
        unreachable!("hosted domains have no control requests")
    }

    fn control_outcome_after_append(
        _projection: &Self::Projection,
        _request: &Never,
    ) -> Result<Never, Report<RecoveryError>> {
        unreachable!("hosted domains have no control requests")
    }
}

impl<S: SimpleDomain> SnapshotDomain for Hosted<S> {
    type Snapshot = ProjectionSnapshot<S>;
    type SnapshotCapture = ProjectionSnapshotPayload<S>;
    type SnapshotContext = ();

    fn capture_snapshot(
        shard: Shard,
        projection: &Self::Projection,
    ) -> Option<ProjectionSnapshotPayload<S>> {
        let through_log_sequence = projection.through_log_sequence?;
        Some(ProjectionSnapshotPayload {
            shard,
            through_log_sequence,
            seen: projection.seen.clone(),
            partitions: projection.partitions.clone(),
            domain: projection.domain.clone(),
        })
    }

    fn snapshot_bounds(
        snapshot: &ProjectionSnapshot<S>,
    ) -> Result<(Shard, u64), Report<RecoveryError>> {
        let ProjectionSnapshot::V1(record) = snapshot;
        let shard = record.shard;
        Ok((shard, record.through_log_sequence))
    }

    fn snapshot_created_at(snapshot: &ProjectionSnapshot<S>) -> DateTime<Utc> {
        let ProjectionSnapshot::V1(record) = snapshot;
        record.created_at
    }

    #[expect(
        clippy::unused_async_trait_impl,
        reason = "snapshot validation runs when the trait future is polled"
    )]
    async fn load_snapshot_projection(
        _context: &(),
        shard: Shard,
        snapshot: &ProjectionSnapshot<S>,
    ) -> Result<Self::Projection, Report<RecoveryError>> {
        let ProjectionSnapshot::V1(record) = snapshot;
        let snapshot_shard = record.shard;
        if snapshot_shard != shard {
            return Err(Report::new(RecoveryError::SnapshotShardMismatch {
                expected: shard,
                actual: snapshot_shard,
            }));
        }
        Ok(KernelProjection {
            seen: record.seen.clone(),
            partitions: record.partitions.clone(),
            through_log_sequence: Some(record.through_log_sequence),
            domain: record.domain.clone(),
        })
    }
}

impl<S: SimpleDomain> ShardCommandHandle<Hosted<S>> {
    /// Runs a closure against the shard’s state inside the command loop. The closure must not
    /// block.
    ///
    /// # Errors
    ///
    /// Returns an error if the loop closes or the read result has an unexpected type.
    pub async fn read<R, F>(&self, read: F) -> Result<R, Report<ShardCommandError>>
    where
        R: Send + 'static,
        F: for<'a> FnOnce(&'a KernelProjection<S::Projection>) -> R + Send + 'static,
    {
        let result = self
            .query(ReadQuery(Box::new(move |projection| {
                Box::new(read(projection)) as Box<dyn Any + Send>
            })))
            .await?;
        result
            .downcast::<R>()
            .map(|value| *value)
            .map_err(|_value| {
                Report::new(ShardCommandError::UnexpectedQueryResult {
                    expected: core::any::type_name::<R>(),
                })
            })
    }
}

#[cfg(test)]
mod tests {
    use alloc::{collections::BTreeMap, rc::Rc, sync::Arc};
    use core::{
        future::poll_fn, marker::PhantomData, num::NonZeroUsize, task::Poll, time::Duration,
    };

    use chrono::{DateTime, Utc};
    use error_stack::Report;
    use serde::{Deserialize, Serialize};
    use serde_json::json;

    use super::{
        DomainEvent, EventRecord, EventRecordV1, Fold, FoldError, Hosted, InvalidPartitionKey,
        KernelProjection, MAX_PARTITION_KEY_BYTES, MAX_SNAPSHOT_BYTES, PartitionKey,
        ProjectionSnapshot, ProjectionSnapshotV1, RecoveryError, SimpleDomain, effect_id, register,
        shard_of,
    };
    use crate::{
        DurableError,
        port::{EventDomain as _, Prepared, SnapshotDomain as _},
        registry::{
            self, CompatError, DurableRecord as _, RecordDeclaration, RecordRegistry,
            VersionedRecord as _,
        },
        routing::Shard,
        shard_log::{
            AppendFailureKind, JournalStorage, OpenedShard, RecoveredShard, ShardAppendError,
            ShardCommandConfig, ShardCommandError, ShardCommandErrorKind, ShardCommandOutcome,
            ShardLogLocation, StartedShard,
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
        type Rejection = CounterRejection;
        type Validated = CounterChange;

        fn validate(
            &self,
            event: &CounterEvent,
        ) -> Result<Self::Validated, Report<Self::Rejection>> {
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
        format!(
            "domain-toy/control/v1/shards/{}/log",
            crate::routing::shard_path(shard)
        )
    }

    async fn start(
        location: ShardLogLocation<impl JournalStorage>,
    ) -> (crate::shard_log::ShardCommandHandle<Toy>, StartedShard<Toy>) {
        let opened = OpenedShard::open(location)
            .await
            .expect("shard should open");
        let recovered: RecoveredShard<Toy, _> =
            opened.recover().await.expect("shard should recover");
        let started = recovered.enable(ShardCommandConfig::default());
        (started.handle.clone(), started)
    }

    #[test]
    fn effect_id_wire_format() {
        let effect = json!({ "customer_id": "customer-1", "name": "Ada Lovelace" });
        let id = effect_id(&effect).expect("effect should serialize");
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
            record.event_id.to_string(),
            "06ccc9f5d9b454676b6d0fc90cdc732d917cf17c8bb3f1427be236ff896f2d10"
        );
        let encoded = encode(&EventRecord::V1(record.clone())).expect("record should encode");
        let expected = format!(
            r#"{{"version":"v1","data":{{"event_id":"{}","partition":"orders","event":{{"kind":"incremented","counter":"orders","amount":5}}}}}}"#,
            record.event_id
        );
        assert_eq!(
            String::from_utf8(encoded.clone()).expect("encoded record should be valid UTF-8"),
            expected
        );
        let decoded = EventRecord::<CounterEvent>::decode(&encoded)
            .expect("record should decode")
            .normalize()
            .expect("record should normalize");
        assert_eq!(decoded.event_id(), record.event_id());
        assert_eq!(decoded.partition(), record.partition());
        assert_eq!(decoded.event(), record.event());
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
        let encoded = serde_json::to_string(&EventRecord::V1(record))
            .expect("borrowed record should serialize");
        let EventRecord::V1(decoded) =
            serde_json::from_str::<EventRecord<BorrowedEvent<'_>>>(&encoded)
                .expect("record should decode an event borrowed from its input");
        assert_eq!(decoded.event().counter, counter);

        let mut changed: serde_json::Value =
            serde_json::from_str(&encoded).expect("record should be valid JSON");
        changed["data"]["event"]["amount"] = json!(6);
        let changed = serde_json::to_string(&changed).expect("changed record should serialize");
        let error = serde_json::from_str::<EventRecord<BorrowedEvent<'_>>>(&changed)
            .expect_err("changing an event should invalidate its stored ID");
        assert!(
            error.to_string().contains("event ID mismatch"),
            "borrowed event decoding should check the stored event ID: {error}"
        );
    }

    #[test]
    fn record_decode_envelope() {
        let name = CounterEvent::name();
        for (value, expected) in [
            (
                json!([]),
                CompatError::ExpectedObject {
                    name,
                    path: String::new(),
                },
            ),
            (json!({}), CompatError::MissingVersion { name }),
            (
                json!({"version": 1}),
                CompatError::InvalidVersionType { name },
            ),
            (
                json!({"version": "v2"}),
                CompatError::UnsupportedVersion {
                    name,
                    version: "v2".to_owned(),
                },
            ),
            (
                json!({"version": "v1", "extra": true}),
                CompatError::ExtraField {
                    name,
                    path: "extra".to_owned(),
                },
            ),
        ] {
            let bytes = serde_json::to_vec(&value).expect("fixture should encode");
            let error = EventRecord::<CounterEvent>::decode(&bytes)
                .expect_err("invalid record envelope should be rejected");
            assert_eq!(error.current_context(), &expected);
        }
    }

    #[test]
    fn record_decode_json() {
        let error = EventRecord::<CounterEvent>::decode(b"{")
            .expect_err("incomplete JSON should fail decoding");
        assert_eq!(
            error.current_context(),
            &CompatError::Decode {
                name: CounterEvent::name(),
            }
        );
        let source = error
            .downcast_ref::<serde_json::Error>()
            .expect("decode report should retain the JSON error");
        assert!(
            source.is_eof(),
            "incomplete JSON should report the end of input"
        );
    }

    fn toy_snapshot(shard: &str, padding: usize) -> ProjectionSnapshot<ToyDomain> {
        ProjectionSnapshot::V1(ProjectionSnapshotV1 {
            shard: shard.parse().expect("test shard should parse"),
            through_log_sequence: 0,
            created_at: DateTime::UNIX_EPOCH,
            seen: BTreeMap::new(),
            partitions: BTreeMap::new(),
            domain: Counters {
                totals: BTreeMap::from([(format!("counter{}", "x".repeat(padding)), 0)]),
            },
        })
    }

    #[test]
    fn snapshots_encode_and_decode_at_the_size_boundary() {
        let base = encode(&toy_snapshot("00f", 0))
            .expect("snapshot without padding should encode")
            .len();

        let encoded = encode(&toy_snapshot("00f", MAX_SNAPSHOT_BYTES - base))
            .expect("a snapshot of exactly the maximum should encode");
        assert_eq!(encoded.len(), MAX_SNAPSHOT_BYTES);
        ProjectionSnapshot::<ToyDomain>::decode(&encoded)
            .expect("maximum-size snapshot should decode");

        let error = encode(&toy_snapshot("00f", MAX_SNAPSHOT_BYTES - base + 1))
            .expect_err("an oversized snapshot should be refused at encode");
        assert_eq!(
            error.current_context(),
            &CompatError::TooLarge {
                name: super::DOMAIN_SNAPSHOT_DECLARATION.name,
                actual_bytes: MAX_SNAPSHOT_BYTES + 1,
                max_bytes: MAX_SNAPSHOT_BYTES,
            }
        );

        let mut padded = encoded;
        padded.push(b' ');
        assert!(
            ProjectionSnapshot::<ToyDomain>::decode(&padded).is_err(),
            "an oversized snapshot should be refused at decode"
        );
    }

    #[test]
    fn snapshot_shard_decode() {
        let mut fixture = json!({
            "version": "v1",
            "data": {
                "shard": "00f",
                "through_log_sequence": 0,
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
            (Shard::from_u8(15), 0)
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
        let location = ShardLogLocation::simulated(
            shard_of(record.partition()),
            journal.clone(),
            Arc::default(),
        );
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
                .snapshot_through_log_sequence
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
        let record =
            EventRecordV1::new(event).expect("historical record should have a valid identity");
        let shard = shard_of(record.partition());
        let mut projection = KernelProjection::<Counters>::default();
        Toy::replay(&mut projection, shard, 0, EventRecord::V1(record))
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
            let error =
                EventRecordV1::from_parts(event_id, partition.clone(), record.event().clone())
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
            let mut data = serde_json::to_value(&record).expect("record should serialize");
            data[field] = value;
            let error = serde_json::from_value::<EventRecordV1<CounterEvent>>(data.clone())
                .expect_err("invalid record should fail deserialization");
            assert!(
                error.to_string().contains(expected_error),
                "error should contain {expected_error:?}: {error}"
            );

            let bytes = serde_json::to_vec(&json!({"version": "v1", "data": data}))
                .expect("wire record should serialize");
            let journal = SimLogHandle::new(42, Vec::new());
            let SimAppendResult::Acked(sequence) = journal
                .acquire_writer()
                .append_record(SimKey::Events, bytes)
            else {
                panic!("corrupt record fixture should append");
            };
            let opened = OpenedShard::open(ShardLogLocation::simulated(
                shard_of(record.partition()),
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
        let actual = shard_of(record.partition());
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
        Toy::finalize(&mut projection, delta, 0).expect("finalize at sequence zero should succeed");
        assert_eq!(projection.domain().totals["orders"], 5);
        assert_eq!(projection.partition_sequence(&record.partition), Some(0));

        assert!(matches!(
            Toy::prepare(&projection, &record),
            Ok(Prepared::Noop)
        ));

        let other_digest = incremented("orders", 6)
            .digest()
            .expect("digest should compute");
        projection.seen.insert(record.event_id(), other_digest);
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
        let shard = shard_of(&record.partition);
        let mut projection = KernelProjection::<Counters>::default();

        Toy::replay(&mut projection, shard, 0, EventRecord::V1(record.clone()))
            .expect("first replay should apply");
        Toy::replay(&mut projection, shard, 1, EventRecord::V1(record.clone()))
            .expect("duplicate replay should be a no-op");
        assert_eq!(projection.domain().totals["orders"], 5);
        assert_eq!(projection.through_log_sequence(), Some(1));

        let error = Toy::replay(
            &mut projection,
            shard,
            1,
            EventRecord::V1(incremented("orders", 7)),
        )
        .expect_err("a non-advancing sequence should be rejected");
        assert_eq!(
            error.current_context(),
            &RecoveryError::NonIncreasingSequence {
                previous: 1,
                proposed: 1,
            }
        );

        let other_digest = incremented("orders", 7)
            .digest()
            .expect("digest should compute");
        projection.seen.insert(record.event_id, other_digest);
        let event_id = record.event_id();
        let error = Toy::replay(&mut projection, shard, 2, EventRecord::V1(record))
            .expect_err("an event ID stored with different content should be refused");
        assert_eq!(
            error.current_context(),
            &RecoveryError::ConflictingReuse {
                event_id,
                sequence: 2,
            }
        );
    }

    #[test]
    fn recovered_prefix_cannot_regress_or_lose_events() {
        let record = incremented("orders", 5);
        let shard = shard_of(&record.partition);
        let mut acknowledged = KernelProjection::<Counters>::default();
        Toy::replay(&mut acknowledged, shard, 0, EventRecord::V1(record))
            .expect("acknowledged record should replay");

        let empty = KernelProjection::<Counters>::default();
        let error = Toy::validate_recovered_prefix(&acknowledged, &empty)
            .expect_err("recovery should preserve the acknowledged prefix");
        assert_eq!(
            error.current_context(),
            &RecoveryError::RegressedSequence {
                previous: 0,
                recovered: None,
            }
        );
        Toy::validate_recovered_prefix(&acknowledged, &acknowledged.clone())
            .expect("identical state should preserve the acknowledged prefix");
        Toy::validate_recovered_prefix(&empty, &acknowledged)
            .expect("recovery should extend an empty prefix");

        let mut advanced = acknowledged.clone();
        let record = incremented("orders", 5);
        Toy::replay(&mut advanced, shard, 1, EventRecord::V1(record))
            .expect("duplicate replay should advance the sequence");
        let error = Toy::validate_recovered_prefix(&advanced, &acknowledged)
            .expect_err("a lower recovered sequence should be a regression");
        assert_eq!(
            error.current_context(),
            &RecoveryError::RegressedSequence {
                previous: 1,
                recovered: Some(0),
            }
        );
        Toy::validate_recovered_prefix(&acknowledged, &advanced)
            .expect("a later sequence should preserve the acknowledged prefix");

        let mut missing = advanced.clone();
        let event_id = incremented("orders", 5).event_id();
        missing.seen.remove(&event_id);
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
        let shard = shard_of(&record.partition);
        let location = ShardLogLocation::disposable_local(
            shard,
            &toy_log_path(shard),
            root.path(),
            Arc::default(),
        );

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
            .expect("loop should stop cleanly");
    }

    #[tokio::test]
    async fn shutdown_full_queue() {
        tokio::time::timeout(Duration::from_secs(5), async {
            for cancel_shutdown in [false, true] {
                let journal = SimLogHandle::new(42, Vec::new());
                let record = incremented("orders", 5);
                let location = ShardLogLocation::simulated(
                    shard_of(record.partition()),
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
                let error = blocked.await.expect_err(
                    "shutdown should release blocked admission before the queue advances",
                );
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
                    let result = proposal.await.expect("proposal task should join");
                    if cancel_shutdown && index == 1 {
                        let error = result.expect_err("losing the owner should stop accepted work");
                        assert_eq!(
                            error.current_context().kind(),
                            ShardCommandErrorKind::Fenced
                        );
                    } else {
                        assert!(matches!(
                            result.expect("accepted proposal should finish"),
                            ShardCommandOutcome::Applied { .. }
                        ));
                    }
                }
                if let Some(shutdown) = shutdown {
                    shutdown.await.expect("shutdown should close the writer");
                }
                let result = started.task.await.expect("loop task should join");
                if cancel_shutdown {
                    assert_eq!(
                        result.expect_err("owner drop should stop the loop").kind(),
                        ShardCommandErrorKind::Fenced
                    );
                    assert_eq!(
                        journal.durable_entries(SimKey::Events).len(),
                        1,
                        "owner drop should let the active append finish and reject queued writes"
                    );
                } else {
                    result.expect("loop should shut down cleanly");
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
                shard_of(record.partition()),
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
                shard_of(record.partition()),
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
            let queued =
                tokio::spawn(async move { handle.propose(incremented("orders", 7)).await });
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
                "queued callers should receive the event ID and classification that stopped the \
                 loop"
            );
            assert!(
                format!("{stopped:?}").contains("command was queued"),
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
                shard_of(record.partition()),
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
        let location = ShardLogLocation::simulated(
            shard_of(first.partition()),
            journal.clone(),
            Arc::default(),
        );
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
        let shard = shard_of(&first.partition);
        let second = incremented("orders", 7);
        let reset = EventRecordV1::new(CounterEvent::Reset {
            counter: "orders".to_owned(),
        })
        .expect("reset event should be valid");

        let after_reset = incremented("orders", 3);

        let location = ShardLogLocation::disposable_local(
            shard,
            &toy_log_path(shard),
            root.path(),
            Arc::default(),
        );
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
            .expect("loop should stop cleanly");

        let (handle, started) = start(location).await;
        let through = handle
            .read(KernelProjection::through_log_sequence)
            .await
            .expect("recovered sequence read should succeed")
            .expect("recovered projection should have a durable sequence");
        assert!(through < started.recovery.durable_end_exclusive);
        assert_eq!(started.state_changes.initial, vec![first.partition.clone()]);
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
            .expect("loop should stop cleanly");
    }

    #[tokio::test]
    async fn foreign_partition_is_rejected() {
        let root = tempfile::tempdir().expect("object store root tempdir should be created");
        let record = incremented("orders", 5);
        let shard = shard_of(&record.partition);
        let foreign = (0..1024_u32)
            .map(|attempt| incremented(&format!("other-{attempt}"), 1))
            .find(|candidate| shard_of(&candidate.partition) != shard)
            .expect("some key should route elsewhere");

        let location = ShardLogLocation::disposable_local(
            shard,
            &toy_log_path(shard),
            root.path(),
            Arc::default(),
        );
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
            .expect("loop should stop cleanly");
    }

    #[tokio::test]
    async fn snapshots_bound_recovery_and_roundtrip_state() {
        let root = tempfile::tempdir().expect("object store root tempdir should be created");
        let record = incremented("orders", 5);
        let shard = shard_of(&record.partition);
        let location = ShardLogLocation::disposable_local(
            shard,
            &toy_log_path(shard),
            root.path(),
            Arc::default(),
        );

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
            .expect("loop should stop cleanly");

        let opened = OpenedShard::open(location)
            .await
            .expect("shard should reopen");
        let recovered: RecoveredShard<Toy, _> = opened
            .recover_with_snapshots(&())
            .await
            .expect("recovery with snapshots should succeed");
        let restarted = recovered.enable(ShardCommandConfig::default());
        assert!(
            restarted.recovery.snapshot_through_log_sequence.is_some(),
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
            .expect("loop should stop cleanly");
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
        let location = ShardLogLocation::simulated(
            shard_of(&record.partition),
            journal.clone(),
            Arc::default(),
        );
        let recovered: RecoveredShard<Toy, _> = OpenedShard::open(location)
            .await
            .expect("shard should open")
            .recover_with_snapshots(&())
            .await
            .expect("shard should recover");
        let started =
            recovered.enable(ShardCommandConfig::default().require_full_lease_handshake());
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
            "snapshot append failure should identify the captured journal position"
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
            let shard = shard_of(&next.partition);
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
                .expect_err("uncertain event commit should still stop the shard");
            assert_eq!(
                error.current_context().kind(),
                ShardCommandErrorKind::CommitUnknown
            );
            assert_eq!(
                error
                    .downcast_ref::<ShardAppendError>()
                    .expect("recovery failure should retain the uncertain append")
                    .kind,
                AppendFailureKind::CommitUnknown
            );
            assert_eq!(
                error.current_context(),
                &ShardCommandError::LeaseRequired { event_id },
                "lease recovery should identify the uncertain event"
            );
            started
                .task
                .await
                .expect("task should join")
                .expect_err("uncertain event should be terminal");

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
                .expect("loop should stop cleanly");
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
        let shard = shard_of(&record.partition);
        let location = ShardLogLocation::disposable_local(
            shard,
            &toy_log_path(shard),
            root.path(),
            Arc::default(),
        );
        let (handle, started) = start(location).await;
        handle
            .propose(record)
            .await
            .expect("event should be applied");
        let mut payload = handle
            .capture_snapshot(1)
            .await
            .expect("capture should succeed")
            .expect("snapshot should be due");
        payload
            .domain
            .totals
            .insert("x".repeat(MAX_SNAPSHOT_BYTES), 0);
        let snapshot = payload.into_record(Utc::now());
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
            .expect("loop should stop cleanly");
    }

    #[test]
    fn dynamic_registration_is_idempotent_and_collision_safe() {
        let registry = RecordRegistry::default();
        register::<ToyDomain>(&registry).expect("first registration should succeed");
        register::<ToyDomain>(&registry).expect("repeat registration should be idempotent");
        let conflicting = RecordDeclaration {
            emitted_version: 2,
            supported_versions: &[1, 2],
            ..EventRecord::<CounterEvent>::declaration()
        };
        let error = registry
            .register(conflicting)
            .expect_err("conflicting declaration should be rejected");
        assert!(matches!(
            error.current_context(),
            registry::DeclarationError::ConflictingDeclaration { .. }
        ));
    }
}
