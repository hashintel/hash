use std::io::{self, Write};

use error_stack::{Report, ResultExt as _};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::value::RawValue;

use super::{DomainEvent, PartitionKey};
use crate::{
    ids::{EventId, JournalRecordDigest, content_digest_bytes},
    registry::{
        AlgorithmVersion, CompatError, DurabilityClass, DurableRecord, MigrationPolicy,
        RecordDeclaration, UntrimmedJournalRecord, VersionedRecord,
    },
};

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

pub(super) fn encode_json<T: Serialize>(
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

pub(super) fn decode_v1_envelope<'de, T: Deserialize<'de>>(
    bytes: &'de [u8],
    name: &'static str,
    max_bytes: usize,
) -> Result<T, Report<CompatError>> {
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Envelope<'a> {
        version: String,
        #[serde(borrow)]
        data: &'a RawValue,
    }

    if bytes.len() > max_bytes {
        return Err(Report::new(CompatError::TooLarge {
            name,
            actual_bytes: bytes.len(),
            max_bytes,
        }));
    }
    let envelope: Envelope =
        serde_json::from_slice(bytes).change_context(CompatError::Decode { name })?;
    if envelope.version != "v1" {
        return Err(Report::new(CompatError::UnsupportedVersion {
            name,
            version: envelope.version,
        }));
    }
    serde_json::from_str(envelope.data.get()).change_context(CompatError::Decode { name })
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
    /// Derives an event’s ID and builds its journal record.
    ///
    /// # Errors
    ///
    /// Returns an error if the event cannot be serialized to derive its ID.
    pub fn new(event: E) -> Result<Self, Report<CompatError>> {
        let partition = event.partition();
        let event_id = partition.derive_event_id(&event)?;
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

    pub(super) fn encode(&self, writer: impl Write) -> Result<(), Report<CompatError>> {
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

    pub(super) fn digest(&self) -> Result<JournalRecordDigest, Report<CompatError>> {
        #[derive(Serialize)]
        struct RecordIdentity<'a, E> {
            event_id: &'a EventId,
            partition: &'a PartitionKey,
            event: &'a E,
        }

        content_digest_bytes(
            "domain-record:v1",
            &RecordIdentity {
                event_id: &self.event_id,
                partition: &self.partition,
                event: &self.event,
            },
        )
        .map(JournalRecordDigest::from_bytes)
        .change_context(CompatError::Encode { name: E::name() })
    }
}

/// Wraps an application event with its partition and event ID.
///
/// Records are stored under [`DomainEvent::name`], which must be unique to the event type.
/// [`Self::decode_borrowed`] checks the stored ID and partition against the event.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "version", content = "data", rename_all = "snake_case")]
pub enum EventRecord<E> {
    V1(EventRecordV1<E>),
}

impl<E: DomainEvent + Serialize> EventRecord<E> {
    /// Decodes an event record whose event may borrow from `bytes`.
    ///
    /// # Errors
    ///
    /// Returns an error if the record exceeds the size limit, the wire data cannot be deserialized,
    /// or its stored ID or partition does not match the event.
    pub fn decode_borrowed<'de>(bytes: &'de [u8]) -> Result<Self, Report<CompatError>>
    where
        E: Deserialize<'de>,
    {
        let fields: EventRecordFields<E> =
            decode_v1_envelope(bytes, E::name(), MAX_EVENT_RECORD_BYTES)?;
        EventRecordV1::from_parts(fields.event_id, fields.partition, fields.event).map(Self::V1)
    }
}

impl RecordDeclaration {
    fn for_event<E: DomainEvent + 'static>() -> Self {
        Self {
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
}

impl<E: DomainEvent + Serialize + DeserializeOwned + 'static> DurableRecord for EventRecord<E> {
    const MIGRATION_POLICY: MigrationPolicy = MigrationPolicy::NeverRetireWhileUntrimmed;

    fn declaration() -> RecordDeclaration {
        RecordDeclaration::for_event::<E>()
    }

    fn encode<W: Write>(&self, writer: W) -> Result<(), Report<CompatError>> {
        match self {
            Self::V1(record) => record.encode(writer),
        }
    }

    fn decode(bytes: &[u8]) -> Result<Self, Report<CompatError>> {
        Self::decode_borrowed(bytes)
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
