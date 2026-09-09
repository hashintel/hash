//! SHA-256 event and record IDs, with validation and content hashing.

use core::fmt;

use serde::Serialize;
use sha2::{Digest as _, Sha256};

pub const SHA256_HEX_BYTES: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidId {
    kind: &'static str,
    reason: &'static str,
}

impl InvalidId {
    #[must_use]
    pub const fn new(kind: &'static str, reason: &'static str) -> Self {
        Self { kind, reason }
    }
}

impl fmt::Display for InvalidId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{} {}", self.kind, self.reason)
    }
}

impl core::error::Error for InvalidId {}

/// Defines a SHA-256 ID type that accepts exactly 64 lowercase hexadecimal characters.
#[macro_export]
macro_rules! digest_id {
    ($name:ident, $label:literal) => {
        #[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
        pub struct $name(String);

        impl $name {
            /// # Errors
            ///
            /// Returns an error unless the value contains exactly 64 lowercase hexadecimal
            /// characters.
            pub fn parse(value: impl Into<String>) -> Result<Self, $crate::ids::InvalidId> {
                let value = value.into();
                if value.len() != $crate::ids::SHA256_HEX_BYTES
                    || !value
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
                {
                    return Err($crate::ids::InvalidId::new(
                        $label,
                        "must be exactly 64 lowercase hexadecimal SHA-256 characters",
                    ));
                }
                Ok(Self(value))
            }

            pub fn from_digest(digest: String) -> Self {
                debug_assert_eq!(digest.len(), $crate::ids::SHA256_HEX_BYTES);
                Self(digest)
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl ::core::fmt::Display for $name {
            fn fmt(&self, formatter: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
                formatter.write_str(self.as_str())
            }
        }

        impl ::serde::Serialize for $name {
            fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: ::serde::Serializer,
            {
                serializer.serialize_str(self.as_str())
            }
        }

        impl<'de> ::serde::Deserialize<'de> for $name {
            fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
            where
                D: ::serde::Deserializer<'de>,
            {
                let value = String::deserialize(deserializer)?;
                Self::parse(value).map_err(::serde::de::Error::custom)
            }
        }
    };
}

digest_id!(EventId, "event ID");
digest_id!(JournalRecordDigest, "journal-record digest");

/// Hashes the domain label, a zero byte, and the serialized JSON, in that order.
///
/// Field order and JSON formatting affect the digest. Keep them stable for identities stored in
/// existing records.
///
/// # Errors
///
/// Returns an error if the value cannot be serialized as JSON.
pub fn canonical_digest<T: Serialize>(
    domain: &str,
    projection: &T,
) -> Result<String, serde_json::Error> {
    let mut digest = Sha256::new();
    digest.update(domain.as_bytes());
    digest.update([0]);
    digest.update(serde_json::to_vec(projection)?);
    Ok(hex::encode(digest.finalize()))
}
