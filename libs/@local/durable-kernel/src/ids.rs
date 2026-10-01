//! Validates SHA-256 IDs and hashes serialized record contents.
//!
//! [`EventId`] identifies an event. [`JournalRecordDigest`] detects conflicting record contents.
//! Use [`EffectId::for_effect`] to compute an [`EffectId`] for external operations.

use core::{ascii::Char, fmt, marker::PhantomData, str::FromStr};

use serde::{Serialize, de};
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

/// Returns the value of a lowercase hexadecimal digit.
const fn hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        _ => None,
    }
}

/// The lowercase hexadecimal digits, indexed by value.
const HEX_DIGITS: [Char; 16] = match b"0123456789abcdef".as_ascii() {
    Some(digits) => *digits,
    None => panic!("hexadecimal digits should be ASCII"),
};

/// Encodes `bytes` as 64 lowercase hexadecimal characters.
#[expect(
    clippy::indexing_slicing,
    reason = "a byte's high and low nibbles are both below 16"
)]
fn encode_hex(bytes: &[u8; 32]) -> [Char; SHA256_HEX_BYTES] {
    let mut encoded = [Char::Digit0; SHA256_HEX_BYTES];
    let (pairs, _) = encoded.as_chunks_mut::<2>();
    for (pair, byte) in pairs.iter_mut().zip(bytes) {
        *pair = [
            HEX_DIGITS[usize::from(byte >> 4)],
            HEX_DIGITS[usize::from(byte & 0x0F)],
        ];
    }
    encoded
}

/// Parses a digest ID from a string without allocating.
struct DigestVisitor<T>(PhantomData<fn() -> T>);

impl<T: FromStr<Err = InvalidId>> de::Visitor<'_> for DigestVisitor<T> {
    type Value = T;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("64 lowercase hexadecimal characters")
    }

    fn visit_str<E: de::Error>(self, value: &str) -> Result<T, E> {
        value.parse().map_err(E::custom)
    }
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
                let invalid = || InvalidId { kind: $kind };
                if value.len() != SHA256_HEX_BYTES {
                    return Err(invalid());
                }

                let (pairs, _) = value.as_bytes().as_chunks::<2>();
                let mut bytes = [0; 32];
                for (byte, &[high, low]) in bytes.iter_mut().zip(pairs) {
                    *byte = (hex_digit(high).ok_or_else(invalid)? << 4)
                        | hex_digit(low).ok_or_else(invalid)?;
                }
                Ok(Self(bytes))
            }
        }

        impl ::core::fmt::Display for $name {
            fn fmt(&self, formatter: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                formatter.write_str(encode_hex(&self.0).as_str())
            }
        }

        impl ::serde::Serialize for $name {
            fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: ::serde::Serializer,
            {
                serializer.serialize_str(encode_hex(&self.0).as_str())
            }
        }

        impl<'de> ::serde::Deserialize<'de> for $name {
            fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
            where
                D: ::serde::Deserializer<'de>,
            {
                deserializer.deserialize_str(DigestVisitor(::core::marker::PhantomData))
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
pub(crate) fn content_digest_bytes<T: Serialize>(
    domain: &str,
    value: &T,
) -> Result<[u8; 32], serde_json::Error> {
    let mut digest = Sha256::new();
    digest.update(domain.as_bytes());
    digest.update([0]);
    digest.update(serde_json::to_vec(value)?);
    Ok(digest.finalize().into())
}

impl EffectId {
    /// Computes an idempotency key from an effect’s serialized contents.
    ///
    /// # Errors
    ///
    /// Returns an error if the effect cannot be serialized as JSON.
    pub fn for_effect<T: Serialize>(effect: &T) -> Result<Self, serde_json::Error> {
        content_digest_bytes("domain-effect:v1", effect).map(Self::from_bytes)
    }
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
        for invalid in [
            text.to_uppercase(),
            "0".repeat(63),
            "g".repeat(64),
            "\u{e9}".repeat(32),
        ] {
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
