//! SHA-256 identities for immutable SALT inputs and artifacts.
//!
//! Hash values use canonical lowercase hexadecimal in manifests. Composite
//! hashes frame every component with its byte length so different input
//! boundaries cannot produce the same preimage by concatenation alone.

use core::{error::Error, fmt, str::FromStr};
use std::io::{self, Read};

use serde::{Deserialize, Deserializer, Serialize, Serializer, de::Visitor};
use sha2::{Digest as _, Sha256};

const SHA256_BYTES: usize = 32;
const SHA256_HEX_BYTES: usize = SHA256_BYTES * 2;
const READ_BUFFER_BYTES: usize = 8 * 1024;

/// A canonical SHA-256 content identity.
///
/// JSON serialization is a 64-character lowercase hexadecimal string.
/// Deserialization rejects uppercase and noncanonical lengths.
#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct ContentHash([u8; SHA256_BYTES]);

impl ContentHash {
    /// Computes the SHA-256 identity of `bytes`.
    #[must_use]
    pub(crate) fn digest(bytes: &[u8]) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        Self(hasher.finalize().into())
    }

    /// Creates an identity from its raw SHA-256 bytes.
    #[must_use]
    #[inline]
    pub(crate) const fn from_bytes(bytes: [u8; SHA256_BYTES]) -> Self {
        Self(bytes)
    }

    /// Borrows the raw SHA-256 bytes.
    #[must_use]
    #[inline]
    pub(crate) const fn as_bytes(&self) -> &[u8; SHA256_BYTES] {
        &self.0
    }
}

impl fmt::Debug for ContentHash {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("ContentHash(\"")?;
        fmt::Display::fmt(self, formatter)?;
        formatter.write_str("\")")
    }
}

impl fmt::Display for ContentHash {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        for byte in self.0 {
            write!(formatter, "{byte:02x}")?;
        }
        Ok(())
    }
}

impl FromStr for ContentHash {
    type Err = ContentHashParseError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let bytes = value.as_bytes();
        if bytes.len() != SHA256_HEX_BYTES {
            return Err(ContentHashParseError::Length {
                actual: bytes.len(),
            });
        }

        let mut digest = [0_u8; SHA256_BYTES];
        for (index, pair) in bytes.chunks_exact(2).enumerate() {
            let high = decode_hex(pair[0], index * 2)?;
            let low = decode_hex(pair[1], index * 2 + 1)?;
            digest[index] = (high << 4) | low;
        }
        Ok(Self(digest))
    }
}

impl Serialize for ContentHash {
    #[inline]
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.collect_str(self)
    }
}

impl<'de> Deserialize<'de> for ContentHash {
    #[inline]
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_str(ContentHashVisitor)
    }
}

struct ContentHashVisitor;

impl Visitor<'_> for ContentHashVisitor {
    type Value = ContentHash;

    #[inline]
    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a 64-character lowercase SHA-256 hexadecimal string")
    }

    #[inline]
    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: serde::de::Error,
    {
        ContentHash::from_str(value).map_err(E::custom)
    }
}

/// A noncanonical SHA-256 hexadecimal identity.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ContentHashParseError {
    /// The input does not contain exactly 64 bytes.
    Length { actual: usize },
    /// The input contains a byte outside lowercase hexadecimal.
    Character { index: usize, byte: u8 },
}

impl fmt::Display for ContentHashParseError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Length { actual } => write!(
                formatter,
                "SHA-256 identity contains {actual} bytes; expected {SHA256_HEX_BYTES}"
            ),
            Self::Character { index, byte } => {
                if byte.is_ascii_graphic() {
                    write!(
                        formatter,
                        "SHA-256 identity contains non-lowercase-hex byte '{}' at offset {index}",
                        char::from(*byte)
                    )
                } else {
                    write!(
                        formatter,
                        "SHA-256 identity contains byte 0x{byte:02x} at offset {index}"
                    )
                }
            }
        }
    }
}

impl Error for ContentHashParseError {}

const fn decode_hex(byte: u8, index: usize) -> Result<u8, ContentHashParseError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        _ => Err(ContentHashParseError::Character { index, byte }),
    }
}

/// Incrementally computes a domain-separated composite content identity.
///
/// [`ContentHasher::update`] frames each component as its little-endian `u64`
/// length followed by its bytes. Callers therefore do not need separators and
/// cannot accidentally alias `["ab", "c"]` with `["a", "bc"]`.
#[derive(Debug, Clone)]
pub(crate) struct ContentHasher(Sha256);

impl ContentHasher {
    /// Starts a hash in the supplied versioned domain.
    #[must_use]
    pub(crate) fn new(domain: &[u8]) -> Self {
        let mut this = Self(Sha256::new());
        this.update(domain);
        this
    }

    /// Adds one length-delimited component.
    pub(crate) fn update(&mut self, bytes: &[u8]) {
        let length = u64::try_from(bytes.len())
            .expect("should fit a slice length into the persisted u64 frame");
        self.0.update(length.to_le_bytes());
        self.0.update(bytes);
    }

    /// Finishes the composite identity.
    #[must_use]
    #[inline]
    pub(crate) fn finish(self) -> ContentHash {
        ContentHash::from_bytes(self.0.finalize().into())
    }
}

/// Computes a SHA-256 identity while streaming from `reader`.
///
/// This function uses an 8 KiB stack buffer and does not allocate.
///
/// # Errors
///
/// This returns an error when `reader` cannot be read to completion.
pub(crate) fn hash_reader(mut reader: impl Read) -> io::Result<ContentHash> {
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; READ_BUFFER_BYTES];

    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(read) => hasher.update(&buffer[..read]),
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(error) => return Err(error),
        }
    }

    Ok(ContentHash::from_bytes(hasher.finalize().into()))
}

#[cfg(test)]
mod tests;
