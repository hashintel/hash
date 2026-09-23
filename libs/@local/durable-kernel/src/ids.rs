//! Validates SHA-256 IDs and hashes serialized record contents.
//!
//! [`EventId`] identifies an event. [`JournalRecordDigest`] detects conflicting record contents.
//! Use [`crate::domain::effect_id`] to compute an [`EffectId`] for external operations,
//! or [`content_digest`] to hash other serialized values with a domain label.

use core::str::FromStr;

use serde::Serialize;
use sha2::{Digest as _, Sha256};

pub const SHA256_HEX_BYTES: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display)]
pub enum IdKind {
    #[display("event ID")]
    Event,
    #[display("effect ID")]
    Effect,
    #[display("journal-record digest")]
    JournalRecordDigest,
}

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("{kind} must be exactly 64 lowercase hexadecimal SHA-256 characters")]
pub struct InvalidId {
    pub kind: IdKind,
}

macro_rules! digest_id {
    ($name:ident, $kind:expr) => {
        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
        pub struct $name([u8; 32]);

        impl $name {
            /// # Errors
            ///
            /// Returns an error unless the value contains exactly 64 lowercase hexadecimal
            /// characters.
            pub fn parse(value: impl AsRef<str>) -> Result<Self, InvalidId> {
                Self::from_str(value.as_ref())
            }

            pub const fn from_bytes(bytes: [u8; 32]) -> Self {
                Self(bytes)
            }

            pub const fn as_bytes(&self) -> &[u8; 32] {
                &self.0
            }
        }

        impl FromStr for $name {
            type Err = InvalidId;

            fn from_str(value: &str) -> Result<Self, Self::Err> {
                if value.len() != SHA256_HEX_BYTES
                    || !value
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
                {
                    return Err(InvalidId { kind: $kind });
                }
                let mut bytes = [0; 32];
                hex::decode_to_slice(value, &mut bytes).unwrap_or_else(|_err| {
                    unreachable!("64 lowercase hexadecimal characters should decode to 32 bytes")
                });
                Ok(Self(bytes))
            }
        }

        impl ::core::fmt::Display for $name {
            fn fmt(&self, formatter: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                for byte in self.0 {
                    write!(formatter, "{byte:02x}")?;
                }
                Ok(())
            }
        }

        impl ::serde::Serialize for $name {
            fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: ::serde::Serializer,
            {
                serializer.collect_str(self)
            }
        }

        impl<'de> ::serde::Deserialize<'de> for $name {
            fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
            where
                D: ::serde::Deserializer<'de>,
            {
                let text = String::deserialize(deserializer)?;
                Self::parse(text).map_err(::serde::de::Error::custom)
            }
        }
    };
}

digest_id!(EventId, IdKind::Event);
digest_id!(EffectId, IdKind::Effect);
digest_id!(JournalRecordDigest, IdKind::JournalRecordDigest);

/// Hashes the domain label, a zero byte, and the serialized JSON, in that order.
///
/// Field order and JSON formatting affect the digest. Keep them stable for digests stored in
/// existing records.
///
/// # Errors
///
/// Returns an error if the value cannot be serialized as JSON.
pub fn content_digest<T: Serialize>(
    domain: &str,
    projection: &T,
) -> Result<String, serde_json::Error> {
    Ok(hex::encode(content_digest_bytes(domain, projection)?))
}

pub(crate) fn content_digest_bytes<T: Serialize>(
    domain: &str,
    projection: &T,
) -> Result<[u8; 32], serde_json::Error> {
    let mut digest = Sha256::new();
    digest.update(domain.as_bytes());
    digest.update([0]);
    digest.update(serde_json::to_vec(projection)?);
    Ok(digest.finalize().into())
}

#[cfg(test)]
mod tests {
    use super::{EventId, IdKind, InvalidId};

    #[test]
    fn digest_hex_roundtrip() {
        let text = "0123456789abcdef".repeat(4);
        let id: EventId = text.parse().expect("lowercase digest should parse");
        assert_eq!(id.to_string(), text);
        let encoded = serde_json::to_string(&id).expect("digest should serialize");
        assert_eq!(encoded, format!("\"{text}\""));
        assert_eq!(
            serde_json::from_str::<EventId>(&encoded).expect("digest should deserialize"),
            id
        );
        for invalid in [text.to_uppercase(), "0".repeat(63), "g".repeat(64)] {
            assert_eq!(
                EventId::parse(&invalid),
                Err(InvalidId {
                    kind: IdKind::Event
                }),
                "{invalid:?} should be rejected as a noncanonical digest"
            );
        }
    }
}
