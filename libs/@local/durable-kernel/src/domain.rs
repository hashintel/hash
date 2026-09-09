//! This module defines the user-facing domain layer.
//!
//! The types in this module map onto the internal [`Domain`] port in
//! [`crate::port`] through one blanket implementation. A domain author writes
//! an event type, a fold, and an effect executor. The kernel takes care of
//! deduplication, sequencing, prefix validation, snapshots, and recovery in
//! [`KernelProjection`].
//! The loop that folds events and executes effects is [`crate::runtime`].
//!
//! There is no separate signal channel. A caller publishes through `submit`,
//! which validates the event and either writes it durably to the journal or
//! rejects it.

use alloc::collections::BTreeMap;
use core::{any::Any, fmt, marker::PhantomData};

use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::json;
use sha2::{Digest as _, Sha256};

use crate::{
    ids::{EventId, JournalRecordDigest, canonical_digest},
    port::{Domain, Prepared},
    registry::{
        self, AlgorithmVersion, CompatError, DeclarationError, DurabilityClass, DurableRecord,
        MigrationPolicy, RecordDeclaration, UntrimmedJournalRecord, VersionedRecord,
        reject_unknown_fields,
    },
    routing::{SHARD_COUNT, Shard},
    shard_log::{ShardCommandError, ShardCommandErrorKind, ShardCommandHandle},
};

pub const MAX_PARTITION_KEY_BYTES: usize = 1024;
const MAX_EVENT_RECORD_BYTES: usize = 1024 * 1024;

/// Serialization must be deterministic because a nondeterministic encoding would make retries look
/// like new events.
///
/// Two byte-identical events are one event, and the second is deduplicated. An action that can
/// happen twice, such as two equal payments or two equal increments, must carry a distinguishing
/// field such as a request ID.
///
/// Payload evolution is the consumer's concern because journal history never
/// retires. A type whose shape changes must keep decoding every stored
/// shape, for example a versioned serde enum like the kernel's own
/// envelope.
pub trait DomainEvent: Serialize + DeserializeOwned + Clone + Send + Sync + 'static {
    /// Frozen wire name. Renaming it orphans stored history.
    fn name() -> &'static str;

    /// The aggregate this event belongs to. Shard routing, per-key
    /// state-changes, and startup key discovery all derive from it.
    fn partition(&self) -> PartitionKey;
}

/// Maintains the domain state for all partitions on one shard.
///
/// `validate` performs command-time checking. It may reject a proposed event and
/// is never consulted again once the event is durable. `apply` performs the
/// event-time fold. Recorded events are facts, so it is infallible and is
/// the only thing replay runs. A validation bug therefore cannot affect
/// replay of history that was already accepted.
///
/// The serde bounds exist for snapshots because the kernel periodically
/// embeds the fold state in a snapshot record. Recovery can then replay a
/// suffix instead of the whole journal. Serialization must be deterministic,
/// like event serialization.
pub trait Fold<E>: Default + Clone + Send + Sync + Serialize + DeserializeOwned + 'static {
    /// # Errors
    ///
    /// Returns a rejection when the event violates the domain’s validation rules.
    fn validate(&self, event: &E) -> Result<(), Rejection>;
    fn apply(&mut self, event: &E);
}

/// A domain consists of its event vocabulary and its folded state. The effect
/// executor attaches at [`Kernel::start`](crate::runtime::Kernel::start).
pub trait SimpleDomain: Send + Sync + 'static {
    type Event: DomainEvent;
    type Projection: Fold<Self::Event>;
}

/// At-least-once effect execution against external systems.
///
/// `plan` is a pure function of the fold state. The events returned by
/// `execute` are the effect's durable completion. Once they are folded,
/// `plan` must stop emitting that effect. Pass [`effect_id`] to the external
/// system as an idempotency key. That system must remember the key and return
/// the earlier result when an execution repeats. The kernel can repeat an
/// effect after a crash between the external write and its completion event.
pub trait Executor<S: SimpleDomain>: Send + Sync + 'static {
    type Effect: Serialize + Clone + Send + Sync + 'static;

    fn plan(&self, projection: &S::Projection) -> Vec<Self::Effect>;

    fn execute(
        &self,
        effect: &Self::Effect,
    ) -> impl core::future::Future<Output = Result<Vec<S::Event>, Retry>> + Send;
}

/// Delays another attempt at this effect while the driver processes other work.
/// The delay is held in memory, so a restart can retry the effect immediately.
#[derive(Debug, Clone)]
pub struct Retry {
    pub reason: String,
    pub after: Option<core::time::Duration>,
}

/// Computes the content-derived identity used to identify an external side effect.
///
/// # Errors
///
/// Returns an error when the effect cannot be serialized as JSON.
pub fn effect_id<T: Serialize>(effect: &T) -> Result<String, serde_json::Error> {
    canonical_digest("domain-effect:v1", effect)
}

/// Explains why `validate` refused a proposed event. The text reaches the submitter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rejection(String);

impl Rejection {
    /// # Errors
    ///
    /// Returns an error when the event cannot be serialized to derive its identity.
    pub fn new(reason: impl Into<String>) -> Self {
        Self(reason.into())
    }
}

impl fmt::Display for Rejection {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(try_from = "String", into = "String")]
pub struct PartitionKey(String);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InvalidPartitionKey {
    Empty,
    TooLong { actual_bytes: usize },
    UnsafeCharacter,
}

impl fmt::Display for InvalidPartitionKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => formatter.write_str("partition key must not be empty"),
            Self::TooLong { actual_bytes } => write!(
                formatter,
                "partition key is {actual_bytes} bytes; maximum is {MAX_PARTITION_KEY_BYTES}"
            ),
            Self::UnsafeCharacter => formatter
                .write_str("partition key must not contain whitespace or control characters"),
        }
    }
}

impl core::error::Error for InvalidPartitionKey {}

impl PartitionKey {
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

impl fmt::Display for PartitionKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

/// Routes a partition to a stable shard by interpreting eight digest bytes as a big-endian integer
/// and reducing it by the shard count.
///
/// The result does not depend on the process that computes it.
///
/// # Panics
///
/// Panics if the shard count is zero or a shard index cannot be represented.
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
        u16::try_from(
            routing_value
                .checked_rem(u64::from(SHARD_COUNT))
                .expect("shard count should be nonzero"),
        )
        .expect("shard index should fit in u16"),
    )
    .expect("a value reduced modulo the shard count should be a valid shard")
}

/// The kernel-owned wire envelope for one hosted domain's journal. Each event
/// vocabulary is stored under its own `DomainEvent::name`, disjoint from
/// every other.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "version", content = "data", rename_all = "snake_case")]
pub enum EventRecord<E> {
    V1(EventRecordV1<E>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EventRecordV1<E> {
    pub event_id: EventId,
    pub partition: PartitionKey,
    pub event: E,
}

fn record_malformed<E: DomainEvent>(message: impl Into<String>) -> CompatError {
    CompatError::Malformed {
        name: E::name(),
        message: message.into(),
    }
}

fn derive_event_id<E: DomainEvent>(
    partition: &PartitionKey,
    event: &E,
) -> Result<EventId, CompatError> {
    let event = serde_json::to_value(event)
        .map_err(|error| record_malformed::<E>(format!("serialize event for identity: {error}")))?;
    canonical_digest(
        "domain-event:v1",
        &json!({ "partition": partition, "event": event }),
    )
    .map(EventId::from_digest)
    .map_err(|error| record_malformed::<E>(error.to_string()))
}

impl<E: DomainEvent> EventRecordV1<E> {
    /// Builds the record with its derived identity. This is the only
    /// constructor because identities are always computed. Callers cannot supply them.
    ///
    /// # Errors
    ///
    /// Returns an error when the event cannot be serialized or its record exceeds the size limit.
    pub fn new(event: E) -> Result<Self, CompatError> {
        let partition = event.partition();
        let event_id = derive_event_id(&partition, &event)?;
        Ok(Self {
            event_id,
            partition,
            event,
        })
    }

    fn verify(&self) -> Result<(), CompatError> {
        if self.event.partition() != self.partition {
            return Err(CompatError::Conflict {
                name: E::name(),
                message: format!(
                    "envelope partition {} disagrees with the event's partition",
                    self.partition
                ),
            });
        }
        let expected = derive_event_id(&self.partition, &self.event)?;
        if self.event_id != expected {
            return Err(CompatError::Conflict {
                name: E::name(),
                message: format!(
                    "event ID mismatch: expected {expected}, found {}",
                    self.event_id
                ),
            });
        }
        Ok(())
    }

    fn digest(&self) -> Result<JournalRecordDigest, CompatError> {
        let event = serde_json::to_value(&self.event).map_err(|error| {
            record_malformed::<E>(format!("serialize event for digest: {error}"))
        })?;
        canonical_digest(
            "domain-record:v1",
            &json!({
                "event_id": self.event_id,
                "partition": self.partition,
                "event": event,
            }),
        )
        .map(JournalRecordDigest::from_digest)
        .map_err(|error| record_malformed::<E>(error.to_string()))
    }
}

/// Builds the registry declaration for one hosted event vocabulary at
/// runtime because its name comes from [`DomainEvent::name`].
fn event_declaration<E: DomainEvent>() -> RecordDeclaration {
    RecordDeclaration {
        name: E::name(),
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

impl<E: DomainEvent> DurableRecord for EventRecord<E> {
    const MIGRATION_POLICY: MigrationPolicy = MigrationPolicy::NeverRetireWhileUntrimmed;

    fn declaration() -> &'static RecordDeclaration {
        registry::intern_declaration(event_declaration::<E>())
            .unwrap_or_else(|error| panic!("hosted event name should be usable: {error}"))
    }

    fn encode(&self) -> Result<Vec<u8>, CompatError> {
        let Self::V1(record) = self;
        record.verify()?;
        serde_json::to_vec(self).map_err(|error| record_malformed::<E>(error.to_string()))
    }

    fn decode(bytes: &[u8]) -> Result<Self, CompatError> {
        if bytes.len() > MAX_EVENT_RECORD_BYTES {
            return Err(record_malformed::<E>(format!(
                "record is {} bytes; maximum is {MAX_EVENT_RECORD_BYTES}",
                bytes.len()
            )));
        }
        let value: serde_json::Value = serde_json::from_slice(bytes)
            .map_err(|error| record_malformed::<E>(error.to_string()))?;
        reject_unknown_fields(E::name(), "", &value, &["version", "data"])?;
        let version = value
            .get("version")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| record_malformed::<E>("version must be a string"))?;
        if version != "v1" {
            return Err(CompatError::UnsupportedVersion {
                name: E::name(),
                version: version.to_owned(),
            });
        }
        let record: Self = serde_json::from_value(value)
            .map_err(|error| record_malformed::<E>(error.to_string()))?;
        let Self::V1(inner) = &record;
        inner.verify()?;
        Ok(record)
    }
}

impl<E: DomainEvent> VersionedRecord for EventRecord<E> {
    type Current = EventRecordV1<E>;

    fn normalize(self) -> Result<Self::Current, CompatError> {
        let Self::V1(record) = self;
        record.verify()?;
        Ok(record)
    }
}

impl<E: DomainEvent> UntrimmedJournalRecord for EventRecord<E> {}

/// Kernel bookkeeping wrapped around the user's fold state.
///
/// It includes duplicate detection, the durable sequence, and per-partition progress. Everything
/// here exists so the domain author never implements duplicate detection, sequencing, or prefix
/// validation.
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

/// A fold rejection surfaced to the proposer.
/// `Display` output becomes the candidate-rejection message.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FoldError {
    Rejected {
        event_id: EventId,
        rejection: Rejection,
    },
    ForeignShard {
        event_id: EventId,
        partition: PartitionKey,
    },
    ConflictingReuse {
        event_id: EventId,
    },
    Invalid {
        message: String,
    },
}

impl fmt::Display for FoldError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Rejected {
                event_id,
                rejection,
            } => write!(formatter, "event {event_id} was rejected: {rejection}"),
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
            Self::Invalid { message } => formatter.write_str(message),
        }
    }
}

impl core::error::Error for FoldError {}

/// A read-only closure executed against the projection inside the loop. It is
/// built by [`ShardCommandHandle::read`].
pub struct ReadQuery<P>(BoxedRead<P>);

type BoxedRead<P> = Box<dyn for<'a> FnOnce(&'a KernelProjection<P>) -> Box<dyn Any + Send> + Send>;

pub type ReadResult = Box<dyn Any + Send>;

/// Structurally absent capability for a domain without signals or runtime work.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Never {}

/// One shared registry declaration for every hosted domain's snapshots.
///
/// The codec shape is identical and each domain owns its own shard log, so the name never collides
/// across domains.
static DOMAIN_SNAPSHOT_DECLARATION: RecordDeclaration = RecordDeclaration {
    name: "domain_projection_snapshot",
    owning_module: "kernel::domain",
    emitted_version: 1,
    supported_versions: &[1],
    algorithm_versions: &[],
    durability: DurabilityClass::ImmutableJournal,
    migration: MigrationPolicy::NeverRetireWhileUntrimmed,
};

const MAX_SNAPSHOT_BYTES: usize = 15 * 1024 * 1024;

/// Committed snapshot record.
///
/// The projection is embedded inline in the log and is bounded by `MAX_SNAPSHOT_BYTES`. A
/// projection over that limit skips snapshotting and recovery replays the full journal instead.
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
    pub shard: String,
    pub through_log_sequence: u64,
    pub created_at: String,
    pub seen: BTreeMap<EventId, JournalRecordDigest>,
    pub partitions: BTreeMap<PartitionKey, u64>,
    pub domain: S::Projection,
}

/// A projection captured inside the loop and stamped into a committable record
/// by the driver. The clock stays outside the loop.
pub struct ProjectionSnapshotPayload<S: SimpleDomain> {
    shard: Shard,
    through_log_sequence: u64,
    seen: BTreeMap<EventId, JournalRecordDigest>,
    partitions: BTreeMap<PartitionKey, u64>,
    domain: S::Projection,
}

impl<S: SimpleDomain> ProjectionSnapshotPayload<S> {
    pub fn into_record(self, created_at: String) -> ProjectionSnapshot<S> {
        ProjectionSnapshot::V1(ProjectionSnapshotV1 {
            shard: crate::routing::shard_path(self.shard),
            through_log_sequence: self.through_log_sequence,
            created_at,
            seen: self.seen,
            partitions: self.partitions,
            domain: self.domain,
        })
    }
}

fn parse_snapshot_shard(value: &str) -> Result<Shard, String> {
    if value.len() != 3 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("snapshot shard must be three hexadecimal characters".to_owned());
    }
    let parsed =
        u16::from_str_radix(value, 16).map_err(|error| format!("parse snapshot shard: {error}"))?;
    let shard = Shard::try_from(parsed).map_err(|error| error.to_string())?;
    if crate::routing::shard_path(shard) != value {
        return Err(format!("snapshot shard {value:?} is not canonical"));
    }
    Ok(shard)
}

fn snapshot_malformed(message: impl Into<String>) -> CompatError {
    CompatError::Malformed {
        name: DOMAIN_SNAPSHOT_DECLARATION.name,
        message: message.into(),
    }
}

impl<S: SimpleDomain> DurableRecord for ProjectionSnapshot<S> {
    const MIGRATION_POLICY: MigrationPolicy = MigrationPolicy::NeverRetireWhileUntrimmed;

    fn declaration() -> &'static RecordDeclaration {
        &DOMAIN_SNAPSHOT_DECLARATION
    }

    fn encode(&self) -> Result<Vec<u8>, CompatError> {
        let bytes =
            serde_json::to_vec(self).map_err(|error| snapshot_malformed(error.to_string()))?;
        if bytes.len() > MAX_SNAPSHOT_BYTES {
            return Err(snapshot_malformed(format!(
                "snapshot is {} bytes; maximum is {MAX_SNAPSHOT_BYTES}",
                bytes.len()
            )));
        }
        Ok(bytes)
    }

    fn decode(bytes: &[u8]) -> Result<Self, CompatError> {
        if bytes.len() > MAX_SNAPSHOT_BYTES {
            return Err(snapshot_malformed(format!(
                "snapshot is {} bytes; maximum is {MAX_SNAPSHOT_BYTES}",
                bytes.len()
            )));
        }
        let value: serde_json::Value =
            serde_json::from_slice(bytes).map_err(|error| snapshot_malformed(error.to_string()))?;
        reject_unknown_fields(
            DOMAIN_SNAPSHOT_DECLARATION.name,
            "",
            &value,
            &["version", "data"],
        )?;
        let version = value
            .get("version")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| snapshot_malformed("version must be a string"))?;
        if version != "v1" {
            return Err(CompatError::UnsupportedVersion {
                name: DOMAIN_SNAPSHOT_DECLARATION.name,
                version: version.to_owned(),
            });
        }
        // A projection payload that fails to decode is treated as corruption.
        // Recovery falls back to older snapshots and then to full replay.
        let record: Self =
            serde_json::from_value(value).map_err(|error| snapshot_malformed(error.to_string()))?;
        Ok(record)
    }
}

/// The blanket adapter presents one hosted domain to the kernel loop as a full
/// [`Domain`]. Users never see this type or the port behind it.
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

/// Registers the domain's event and snapshot wire names. This must run
/// before the first append. `Kernel::register` calls this.
///
/// # Errors
///
/// Returns an error when record names conflict or a declaration is invalid.
pub fn register<S: SimpleDomain>() -> Result<(), DeclarationError> {
    registry::intern_declaration(event_declaration::<S::Event>())?;
    registry::intern_declaration(DOMAIN_SNAPSHOT_DECLARATION)?;
    Ok(())
}

impl<S: SimpleDomain> Domain for Hosted<S> {
    type ControlOutcome = Never;
    type ControlRejection = Never;
    type ControlRequest = Never;
    type ControlSnapshot = Never;
    type Delta = EventRecordV1<S::Event>;
    type FoldError = FoldError;
    type Projection = KernelProjection<S::Projection>;
    type Query = ReadQuery<S::Projection>;
    type QueryResult = ReadResult;
    type Record = EventRecord<S::Event>;
    type RecordCurrent = EventRecordV1<S::Event>;
    type Snapshot = ProjectionSnapshot<S>;
    type SnapshotCapture = ProjectionSnapshotPayload<S>;
    type SnapshotContext = ();
    type StateKey = PartitionKey;
    type WorkIntent = Never;

    fn record_shard(record: &Self::RecordCurrent) -> Shard {
        shard_of(&record.partition)
    }

    fn reject_foreign_shard(record: &Self::RecordCurrent) -> FoldError {
        FoldError::ForeignShard {
            event_id: record.event_id.clone(),
            partition: record.partition.clone(),
        }
    }

    fn record_event_id(record: &Self::RecordCurrent) -> EventId {
        record.event_id.clone()
    }

    fn record_state_key(record: &Self::RecordCurrent) -> PartitionKey {
        record.partition.clone()
    }

    fn wire(record: Self::RecordCurrent) -> Self::Record {
        EventRecord::V1(record)
    }

    fn prepare(
        projection: &Self::Projection,
        record: &Self::RecordCurrent,
    ) -> Result<Prepared<Self::Delta>, FoldError> {
        record.verify().map_err(|error| FoldError::Invalid {
            message: error.to_string(),
        })?;
        let digest = record.digest().map_err(|error| FoldError::Invalid {
            message: error.to_string(),
        })?;
        if let Some(seen) = projection.seen.get(&record.event_id) {
            return if *seen == digest {
                Ok(Prepared::Noop)
            } else {
                Err(FoldError::ConflictingReuse {
                    event_id: record.event_id.clone(),
                })
            };
        }
        projection
            .domain
            .validate(&record.event)
            .map_err(|rejection| FoldError::Rejected {
                event_id: record.event_id.clone(),
                rejection,
            })?;
        Ok(Prepared::Mutation(record.clone()))
    }

    fn finalize(
        projection: &mut Self::Projection,
        delta: Self::Delta,
        shard_sequence: u64,
    ) -> Result<(), FoldError> {
        if projection
            .through_log_sequence
            .is_some_and(|through| shard_sequence <= through)
        {
            return Err(FoldError::Invalid {
                message: format!(
                    "shard sequence {shard_sequence} does not advance {:?}",
                    projection.through_log_sequence
                ),
            });
        }
        let digest = delta.digest().map_err(|error| FoldError::Invalid {
            message: error.to_string(),
        })?;
        projection.seen.insert(delta.event_id.clone(), digest);
        projection
            .partitions
            .insert(delta.partition.clone(), shard_sequence);
        projection.through_log_sequence = Some(shard_sequence);
        projection.domain.apply(&delta.event);
        Ok(())
    }

    fn state_sequence(projection: &Self::Projection, key: &PartitionKey) -> Option<u64> {
        projection.partitions.get(key).copied()
    }

    fn answer(projection: &Self::Projection, query: Self::Query) -> Self::QueryResult {
        (query.0)(projection)
    }

    fn control_shard(_request: &Never) -> Shard {
        unreachable!("hosted domains have no control requests")
    }

    fn describe_foreign_control(_request: &Never) -> String {
        unreachable!("hosted domains have no control requests")
    }

    fn inspect_control(
        _projection: &Self::Projection,
        _request: &Never,
    ) -> Result<Never, ShardCommandError> {
        unreachable!("hosted domains have no control requests")
    }

    fn control_prior_outcome(_snapshot: &Never) -> Option<Never> {
        unreachable!("hosted domains have no control requests")
    }

    fn control_event_id(_request: &Never) -> EventId {
        unreachable!("hosted domains have no control requests")
    }

    fn promote_control(
        _projection: &Self::Projection,
        _request: &Never,
        _preflight_rejection: Option<Never>,
    ) -> Result<Self::RecordCurrent, FoldError> {
        unreachable!("hosted domains have no control requests")
    }

    fn control_outcome_after_append(
        _projection: &Self::Projection,
        _request: &Never,
    ) -> Result<Never, String> {
        unreachable!("hosted domains have no control requests")
    }

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

    fn snapshot_bounds(snapshot: &ProjectionSnapshot<S>) -> Result<(Shard, u64), String> {
        let ProjectionSnapshot::V1(record) = snapshot;
        let shard = parse_snapshot_shard(&record.shard)?;
        Ok((shard, record.through_log_sequence))
    }

    fn snapshot_created_at(snapshot: &ProjectionSnapshot<S>) -> String {
        let ProjectionSnapshot::V1(record) = snapshot;
        record.created_at.clone()
    }

    #[expect(
        clippy::unused_async_trait_impl,
        reason = "snapshot validation runs when the trait future is polled"
    )]
    async fn load_snapshot_projection(
        _context: &(),
        shard: Shard,
        snapshot: &ProjectionSnapshot<S>,
    ) -> Result<Self::Projection, String> {
        let ProjectionSnapshot::V1(record) = snapshot;
        let snapshot_shard = parse_snapshot_shard(&record.shard)?;
        if snapshot_shard != shard {
            return Err(format!(
                "snapshot for shard {} was offered to shard {}",
                record.shard,
                crate::routing::shard_path(shard)
            ));
        }
        Ok(KernelProjection {
            seen: record.seen.clone(),
            partitions: record.partitions.clone(),
            through_log_sequence: Some(record.through_log_sequence),
            domain: record.domain.clone(),
        })
    }

    fn through_sequence(projection: &Self::Projection) -> Option<u64> {
        projection.through_log_sequence
    }

    fn replay(
        projection: &mut Self::Projection,
        shard: Shard,
        sequence: u64,
        record: Self::Record,
    ) -> Result<(), String> {
        let record = record
            .normalize()
            .map_err(|error| format!("validate domain record at sequence {sequence}: {error}"))?;
        if shard_of(&record.partition) != shard {
            return Err(format!(
                "domain record at sequence {sequence} routes to a different shard"
            ));
        }
        if projection
            .through_log_sequence
            .is_some_and(|through| sequence <= through)
        {
            return Err(format!(
                "domain record sequence {sequence} does not advance {:?}",
                projection.through_log_sequence
            ));
        }
        let digest = record
            .digest()
            .map_err(|error| format!("digest domain record at sequence {sequence}: {error}"))?;
        match projection.seen.get(&record.event_id) {
            // A lost acknowledgement retry may durably append the same record twice. The
            // second copy advances the sequence and folds nothing.
            Some(seen) if *seen == digest => {
                projection.through_log_sequence = Some(sequence);
                Ok(())
            }
            Some(_seen) => Err(format!(
                "event ID {} was reused with different content at sequence {sequence}",
                record.event_id
            )),
            None => {
                projection.seen.insert(record.event_id.clone(), digest);
                projection
                    .partitions
                    .insert(record.partition.clone(), sequence);
                projection.through_log_sequence = Some(sequence);
                // Recorded events are facts. Replay never validates them again, so a
                // validation change cannot poison accepted history.
                projection.domain.apply(&record.event);
                Ok(())
            }
        }
    }

    fn validate_recovered_prefix(
        previous: &Self::Projection,
        recovered: &Self::Projection,
    ) -> Result<(), String> {
        if previous
            .through_log_sequence
            .is_some_and(|old| recovered.through_log_sequence.is_none_or(|new| new < old))
        {
            return Err(format!(
                "durable prefix regressed from {:?} to {:?}",
                previous.through_log_sequence, recovered.through_log_sequence
            ));
        }
        for (event_id, digest) in &previous.seen {
            if recovered.seen.get(event_id) != Some(digest) {
                return Err(format!(
                    "durable prefix lost or changed acknowledged event {event_id}"
                ));
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

impl<S: SimpleDomain> ShardCommandHandle<Hosted<S>> {
    /// Runs a read-only closure against the projection inside the serialized
    /// loop and returns its result. The projection never escapes, and the
    /// closure must not block.
    ///
    /// # Errors
    ///
    /// Returns an error when the command loop is closed or the read result has an unexpected type.
    pub async fn read<R, F>(&self, read: F) -> Result<R, ShardCommandError>
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
            .map_err(|_value| ShardCommandError {
                kind: ShardCommandErrorKind::Recovery,
                message: "read closure returned an unexpected type".to_owned(),
            })
    }
}

#[cfg(test)]
#[expect(clippy::unwrap_used, reason = "tests unwrap fixture results")]
mod tests {
    use alloc::collections::BTreeMap;

    use super::*;
    use crate::shard_log::{
        OpenedShard, RecoveredShard, ShardCommandConfig, ShardCommandOutcome, ShardLogLocation,
        StartedShard,
    };

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

    #[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
    struct Counters {
        totals: BTreeMap<String, u64>,
    }

    impl Fold<CounterEvent> for Counters {
        /// # Errors
        ///
        /// Returns a rejection when the event violates the domain’s validation rules.
        fn validate(&self, event: &CounterEvent) -> Result<(), Rejection> {
            match event {
                CounterEvent::Incremented { amount: 0, .. } => {
                    Err(Rejection::new("increment must be nonzero"))
                }
                CounterEvent::Incremented { counter, amount } => {
                    let current = self.totals.get(counter).copied().unwrap_or(0);
                    if current.checked_add(*amount).is_none() {
                        Err(Rejection::new("counter overflow"))
                    } else {
                        Ok(())
                    }
                }
                CounterEvent::Reset { .. } => Ok(()),
            }
        }

        fn apply(&mut self, event: &CounterEvent) {
            match event {
                CounterEvent::Incremented { counter, amount } => {
                    let total = self.totals.entry(counter.clone()).or_default();
                    *total = total.saturating_add(*amount);
                }
                CounterEvent::Reset { counter } => {
                    self.totals.remove(counter);
                }
            }
        }
    }

    struct ToyDomain;

    impl SimpleDomain for ToyDomain {
        type Event = CounterEvent;
        type Projection = Counters;
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
        location: ShardLogLocation,
    ) -> (crate::shard_log::ShardCommandHandle<Toy>, StartedShard<Toy>) {
        let opened = OpenedShard::open(location)
            .await
            .expect("shard should open");
        let recovered: RecoveredShard<Toy> = opened.recover().await.expect("shard should recover");
        let started = recovered.enable(ShardCommandConfig::default());
        (started.handle.clone(), started)
    }

    #[test]
    fn wire_shape_is_frozen() {
        let record = incremented("orders", 5);
        let encoded = EventRecord::V1(record.clone())
            .encode()
            .expect("record should encode");
        let expected = format!(
            r#"{{"version":"v1","data":{{"event_id":"{}","partition":"orders","event":{{"kind":"incremented","counter":"orders","amount":5}}}}}}"#,
            record.event_id
        );
        assert_eq!(
            String::from_utf8(encoded.clone()).expect("encoded record should be valid UTF-8"),
            expected
        );
        let decoded = EventRecord::<CounterEvent>::decode(&encoded).expect("record should decode");
        assert_eq!(
            decoded
                .normalize()
                .expect("record should normalize")
                .event_id,
            record.event_id
        );
    }

    #[test]
    fn partition_keys_parse_at_the_length_boundary() {
        assert!(
            PartitionKey::parse("x".repeat(MAX_PARTITION_KEY_BYTES)).is_ok(),
            "a key of exactly {MAX_PARTITION_KEY_BYTES} bytes should parse"
        );
        assert!(matches!(
            PartitionKey::parse("x".repeat(MAX_PARTITION_KEY_BYTES + 1)),
            Err(InvalidPartitionKey::TooLong { .. })
        ));
    }

    #[test]
    fn event_records_decode_at_the_size_boundary() {
        // The limit is wire contract. A test written against the constant
        // would follow a drifted value, so this pins the literal.
        assert_eq!(MAX_EVENT_RECORD_BYTES, 0x0010_0000);
        let encoded = EventRecord::V1(incremented("orders", 5))
            .encode()
            .expect("record should encode");
        // serde_json accepts trailing whitespace, so padding with spaces
        // changes the record's length and nothing else.
        let mut at_limit = encoded.clone();
        at_limit.resize(MAX_EVENT_RECORD_BYTES, b' ');
        assert!(
            EventRecord::<CounterEvent>::decode(&at_limit).is_ok(),
            "a record of exactly {MAX_EVENT_RECORD_BYTES} bytes should decode"
        );
        let mut over_limit = encoded;
        over_limit.resize(MAX_EVENT_RECORD_BYTES + 1, b' ');
        let error = EventRecord::<CounterEvent>::decode(&over_limit)
            .expect_err("an oversized record should be refused");
        assert!(format!("{error:?}").contains("maximum"));
    }

    fn toy_snapshot(shard: &str, created_at: String) -> ProjectionSnapshot<ToyDomain> {
        ProjectionSnapshot::V1(ProjectionSnapshotV1 {
            shard: shard.to_owned(),
            through_log_sequence: 0,
            created_at,
            seen: BTreeMap::new(),
            partitions: BTreeMap::new(),
            domain: Counters::default(),
        })
    }

    #[test]
    fn snapshots_encode_and_decode_at_the_size_boundary() {
        assert_eq!(MAX_SNAPSHOT_BYTES, 0x00F0_0000);
        let base = toy_snapshot("00f", String::new())
            .encode()
            .expect("empty snapshot should encode")
            .len();

        let encoded = toy_snapshot("00f", "x".repeat(MAX_SNAPSHOT_BYTES - base))
            .encode()
            .expect("a snapshot of exactly the maximum should encode");
        assert_eq!(encoded.len(), MAX_SNAPSHOT_BYTES);
        ProjectionSnapshot::<ToyDomain>::decode(&encoded).unwrap();

        let error = toy_snapshot("00f", "x".repeat(MAX_SNAPSHOT_BYTES - base + 1))
            .encode()
            .expect_err("an oversized snapshot should be refused at encode");
        assert!(format!("{error:?}").contains("maximum"));

        let mut padded = encoded;
        padded.push(b' ');
        assert!(
            ProjectionSnapshot::<ToyDomain>::decode(&padded).is_err(),
            "an oversized snapshot should be refused at decode"
        );
    }

    #[test]
    fn snapshot_shard_strings_are_validated() {
        Toy::snapshot_bounds(&toy_snapshot("00f", String::new())).unwrap();
        for invalid in ["0f", "00f1", "xyz", ""] {
            assert!(
                Toy::snapshot_bounds(&toy_snapshot(invalid, String::new())).is_err(),
                "shard {invalid:?} should be refused"
            );
        }
    }

    #[test]
    fn identities_are_computed_and_forgeries_are_refused() {
        let record = incremented("orders", 5);
        let mut forged = incremented("orders", 6);
        forged.event_id = record.event_id.clone();
        assert!(forged.verify().is_err());
        EventRecord::V1(forged).encode().unwrap_err();

        let mut moved = record;
        moved.partition = PartitionKey::parse("payments").expect("key should be valid");
        assert!(moved.verify().is_err());
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

        let mut forged = incremented("orders", 6);
        forged.event_id = record.event_id;
        assert!(
            Toy::prepare(&projection, &forged).is_err(),
            "forged identity should fail verification before the reuse check"
        );

        let rejected = incremented("orders", 0);
        let error = Toy::prepare(&projection, &rejected).expect_err("validation should reject");
        assert!(error.to_string().contains("increment must be nonzero"));
    }

    #[test]
    fn replay_tolerates_double_append_and_refuses_conflicts() {
        let record = incremented("orders", 5);
        let shard = shard_of(&record.partition);
        let mut projection = KernelProjection::<Counters>::default();

        Toy::replay(&mut projection, shard, 0, EventRecord::V1(record.clone()))
            .expect("first replay should apply");
        // A retry after a lost acknowledgement can append the same record twice.
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
        assert!(error.contains("does not advance"));

        // `normalize` blocks identity forgeries, so the reuse arm can fire
        // only when a stored digest no longer matches the record's bytes.
        // Rewriting the stored digest stands in for that condition.
        let other_digest = incremented("orders", 7)
            .digest()
            .expect("digest should compute");
        projection
            .seen
            .insert(record.event_id.clone(), other_digest);
        let error = Toy::replay(&mut projection, shard, 2, EventRecord::V1(record))
            .expect_err("an event ID stored with different content should be refused");
        assert!(error.contains("reused with different content"));
    }

    #[test]
    fn recovered_prefix_cannot_regress_or_lose_events() {
        let record = incremented("orders", 5);
        let shard = shard_of(&record.partition);
        let mut acknowledged = KernelProjection::<Counters>::default();
        Toy::replay(&mut acknowledged, shard, 0, EventRecord::V1(record))
            .expect("acknowledged record should replay");

        let empty = KernelProjection::<Counters>::default();
        assert!(Toy::validate_recovered_prefix(&acknowledged, &empty).is_err());
        Toy::validate_recovered_prefix(&acknowledged, &acknowledged.clone()).unwrap();
        Toy::validate_recovered_prefix(&empty, &acknowledged).unwrap();

        // A duplicate replay advances the sequence without new events, so
        // `advanced` and `acknowledged` differ only in through_log_sequence.
        let mut advanced = acknowledged.clone();
        let record = incremented("orders", 5);
        Toy::replay(&mut advanced, shard, 1, EventRecord::V1(record))
            .expect("duplicate replay should advance the sequence");
        let error = Toy::validate_recovered_prefix(&advanced, &acknowledged)
            .expect_err("a lower recovered sequence should be a regression");
        assert!(error.contains("regressed"));
        Toy::validate_recovered_prefix(&acknowledged, &advanced).unwrap();
    }

    #[tokio::test]
    async fn propose_read_dedupe_and_reject_through_the_real_loop() {
        register::<ToyDomain>().expect("toy name should register");
        let root = tempfile::tempdir().expect("object store root tempdir should be created");
        let record = incremented("orders", 5);
        let shard = shard_of(&record.partition);
        let location = ShardLogLocation::disposable_local(shard, &toy_log_path(shard), root.path());

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
            .expect_err("validation should reject the record");
        assert!(rejection.message.contains("increment must be nonzero"));

        handle.shutdown().await.expect("shutdown should succeed");
        started
            .task
            .await
            .expect("loop task should join")
            .expect("loop should stop cleanly");
    }

    #[tokio::test]
    async fn crash_replay_rebuilds_state_and_still_dedupes() {
        register::<ToyDomain>().expect("toy name should register");
        let root = tempfile::tempdir().expect("object store root tempdir should be created");
        // Both counters must route to the same shard for a test with one shard.
        let first = incremented("orders", 5);
        let shard = shard_of(&first.partition);
        let second = incremented("orders", 7);
        let reset = EventRecordV1::new(CounterEvent::Reset {
            counter: "orders".to_owned(),
        })
        .expect("reset event should be valid");

        let after_reset = incremented("orders", 3);

        let location = ShardLogLocation::disposable_local(shard, &toy_log_path(shard), root.path());
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
        handle.shutdown().await.expect("shutdown should succeed");
        started
            .task
            .await
            .expect("loop task should join")
            .expect("loop should stop cleanly");

        let (handle, started) = start(location).await;
        // Log sequences are not dense per record. Only their ordering is
        // contractual. The recovered fold must sit below the durable end.
        let through = handle
            .read(KernelProjection::through_log_sequence)
            .await
            .expect("recovered sequence read should succeed")
            .expect("recovered projection should have a durable sequence");
        assert!(through < started.recovery.durable_end_exclusive);
        assert!(started.recovery.live_work.is_empty());
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
            "identity is content-derived, so an event durable before the crash should be a \
             duplicate after it and fold nothing"
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
        handle.shutdown().await.expect("shutdown should succeed");
        started
            .task
            .await
            .expect("loop task should join")
            .expect("loop should stop cleanly");
    }

    #[tokio::test]
    async fn foreign_partition_is_rejected() {
        register::<ToyDomain>().expect("toy name should register");
        let root = tempfile::tempdir().expect("object store root tempdir should be created");
        let record = incremented("orders", 5);
        let shard = shard_of(&record.partition);
        let foreign = (0..1024_u32)
            .map(|attempt| incremented(&format!("other-{attempt}"), 1))
            .find(|candidate| shard_of(&candidate.partition) != shard)
            .expect("some key should route elsewhere");

        let location = ShardLogLocation::disposable_local(shard, &toy_log_path(shard), root.path());
        let (handle, started) = start(location).await;
        let error = handle
            .propose(foreign)
            .await
            .expect_err("foreign partition should be refused");
        assert!(error.message.contains("routes to a different shard"));
        handle.shutdown().await.expect("shutdown should succeed");
        started
            .task
            .await
            .expect("loop task should join")
            .expect("loop should stop cleanly");
    }

    #[tokio::test]
    async fn snapshots_bound_recovery_and_roundtrip_state() {
        register::<ToyDomain>().expect("toy name should register");
        let root = tempfile::tempdir().expect("object store root tempdir should be created");
        let record = incremented("orders", 5);
        let shard = shard_of(&record.partition);
        let location = ShardLogLocation::disposable_local(shard, &toy_log_path(shard), root.path());

        let (handle, started) = start(location.clone()).await;
        for event in [record.clone(), incremented("orders", 7)] {
            handle.propose(event).await.expect("propose should succeed");
        }
        let payload = handle
            .capture_snapshot(1)
            .await
            .expect("snapshot capture should succeed")
            .expect("a span of two events should be snapshot-worthy");
        let snapshot = payload.into_record(chrono::Utc::now().to_rfc3339());
        handle
            .commit_snapshot(snapshot)
            .await
            .expect("snapshot commit should succeed");
        handle
            .propose(incremented("orders", 3))
            .await
            .expect("post-snapshot event should be accepted");
        handle.shutdown().await.expect("shutdown should succeed");
        started
            .task
            .await
            .expect("loop task should join")
            .expect("loop should stop cleanly");

        let opened = OpenedShard::open(location)
            .await
            .expect("shard should reopen");
        let recovered: RecoveredShard<Toy> = opened
            .recover_with_snapshots(&())
            .await
            .expect("recovery with snapshots should succeed");
        let restarted = recovered.enable(ShardCommandConfig::default());
        assert!(
            restarted.recovery.snapshot_through_log_sequence.is_some(),
            "recovery must adopt the committed snapshot"
        );
        let totals = restarted
            .handle
            .read(|projection| projection.domain().totals.clone())
            .await
            .expect("read after snapshot recovery should succeed");
        assert_eq!(totals["orders"], 15);
        restarted
            .handle
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
        PartitionKey::parse("orders").unwrap();
        PartitionKey::parse("").unwrap_err();
        PartitionKey::parse("has space").unwrap_err();
        PartitionKey::parse("control\u{7}").unwrap_err();
        PartitionKey::parse("x".repeat(MAX_PARTITION_KEY_BYTES + 1)).unwrap_err();
    }

    #[test]
    fn dynamic_registration_is_idempotent_and_collision_safe() {
        register::<ToyDomain>().expect("first registration should succeed");
        register::<ToyDomain>().expect("repeat registration should be idempotent");
        let conflicting = RecordDeclaration {
            emitted_version: 2,
            supported_versions: &[1, 2],
            ..*EventRecord::<CounterEvent>::declaration()
        };
        registry::intern_declaration(conflicting).unwrap_err();
    }
}
