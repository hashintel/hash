use error_stack::{Report, ResultExt as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};

use super::DomainEvent;
use crate::{
    ids::{EventId, content_digest_bytes},
    registry::CompatError,
    routing::Shard,
};

pub const MAX_PARTITION_KEY_BYTES: usize = 1024;

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

    pub(super) fn derive_event_id<E: DomainEvent + Serialize>(
        &self,
        event: &E,
    ) -> Result<EventId, Report<CompatError>> {
        #[derive(Serialize)]
        struct EventIdentity<'a, E> {
            partition: &'a PartitionKey,
            event: &'a E,
        }

        content_digest_bytes(
            "domain-event:v1",
            &EventIdentity {
                partition: self,
                event,
            },
        )
        .map(EventId::from_bytes)
        .change_context(CompatError::Encode { name: E::name() })
    }
}

impl TryFrom<String> for PartitionKey {
    type Error = InvalidPartitionKey;

    fn try_from(value: String) -> Result<Self, Self::Error> {
        Self::parse(value)
    }
}

impl AsRef<str> for PartitionKey {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl core::str::FromStr for PartitionKey {
    type Err = InvalidPartitionKey;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::parse(value)
    }
}

impl From<PartitionKey> for String {
    fn from(key: PartitionKey) -> Self {
        key.0
    }
}

/// Returns the routing-v1 shard for `key`.
///
/// Routing-v1 uses byte 7 of the SHA-256 digest to select the partition's journal.
#[must_use]
pub fn shard_of(key: &PartitionKey) -> Shard {
    let digest: [u8; 32] = Sha256::digest(key.as_ref().as_bytes()).into();
    let [_, _, _, _, _, _, _, shard, ..] = digest;
    Shard::from_u8(shard)
}
