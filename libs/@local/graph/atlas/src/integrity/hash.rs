//! SHA-256 content identities.

use core::{fmt, str::FromStr};

use sha2::{Digest as _, digest::typenum::Unsigned as _};

use super::{
    hex::{HexBytes, ParseHexError},
    writer::Update,
};

const DIGEST_BYTES: usize = <sha2::Sha256 as sha2::digest::OutputSizeUser>::OutputSize::USIZE;

/// A SHA-256 content identity.
///
/// A digest names exactly one byte sequence: artifacts with equal digests hold identical bytes, up
/// to SHA-256 collision resistance. Manifests store digests to pin artifact contents, and readers
/// recompute and compare them to detect substitution or corruption.
///
/// The text and JSON form is 64 characters of canonical lowercase hexadecimal. Parsing rejects
/// uppercase digits and noncanonical lengths, so a digest that round-trips through text is
/// byte-identical.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    serde::Serialize,
    serde::Deserialize,
    zerocopy::ByteHash,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    schemars::JsonSchema,
)]
#[serde(transparent)]
#[schemars(transparent)]
#[repr(transparent)]
pub struct Sha256Digest(HexBytes<DIGEST_BYTES>);

impl Sha256Digest {
    /// The digest width, bytes.
    pub const BYTES: usize = DIGEST_BYTES;

    /// Adopts `bytes` as a digest without computing anything.
    ///
    /// The caller asserts that `bytes` came out of a SHA-256 computation over the content this
    /// value names. This constructor cannot verify that. Use this to restore digests from storage
    /// formats that persist raw bytes rather than hexadecimal text.
    #[must_use]
    #[inline]
    pub const fn from_bytes_unchecked(bytes: [u8; DIGEST_BYTES]) -> Self {
        Self(HexBytes::new(bytes))
    }

    /// Returns the raw SHA-256 bytes.
    #[must_use]
    #[inline]
    pub const fn to_bytes(self) -> [u8; DIGEST_BYTES] {
        self.0.into_inner()
    }

    pub fn of(value: impl AsRef<[u8]>) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(value.as_ref());
        hasher.finalize()
    }
}

impl fmt::Display for Sha256Digest {
    #[inline]
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl FromStr for Sha256Digest {
    type Err = ParseHexError;

    #[inline]
    fn from_str(value: &str) -> Result<Self, Self::Err> {
        value.parse().map(Self)
    }
}

/// A streaming SHA-256 hasher.
///
/// The hasher absorbs bytes incrementally through [`Update::update`] (or any stream via
/// [`Writer`](super::Writer)) and finishes into a [`Sha256Digest`] with [`Sha256::finalize`]. The
/// concatenated byte stream alone determines the digest, never the chunk boundaries the caller
/// used.
///
/// Note that byte concatenation is ambiguous across component boundaries: `["ab", "c"]` and `["a",
/// "bc"]` produce the same digest. When a digest covers multiple variable-length components, frame
/// each component with its length before hashing.
///
/// # Examples
///
/// ```ignore
/// use crate::integrity::{Sha256, Update as _};
///
/// let mut hasher = Sha256::new();
/// hasher.update(b"abc");
///
/// assert_eq!(
///     hasher.finalize().to_string(),
///     "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
/// );
/// ```
#[derive(Debug, Default)]
pub(crate) struct Sha256(sha2::Sha256);

impl Sha256 {
    /// Creates a hasher over the empty byte sequence.
    #[must_use]
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// Finishes the digest over all bytes absorbed so far.
    #[must_use]
    pub(crate) fn finalize(self) -> Sha256Digest {
        Sha256Digest(HexBytes::new(self.0.finalize().into()))
    }
}

impl Update for Sha256 {
    #[inline]
    fn update(&mut self, bytes: &[u8]) {
        self.0.update(bytes);
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use super::{Sha256, Sha256Digest};
    use crate::integrity::{Update as _, hex::ParseHexError};

    const ABC_DIGEST: &str = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    const EMPTY_DIGEST: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    #[test]
    fn known_vectors() {
        let mut hasher = Sha256::new();
        hasher.update(b"abc");
        assert_eq!(hasher.finalize().to_string(), ABC_DIGEST);

        assert_eq!(Sha256::new().finalize().to_string(), EMPTY_DIGEST);
    }

    #[test]
    fn text_round_trip() {
        let digest: Sha256Digest = ABC_DIGEST
            .parse()
            .expect("should parse canonical lowercase hexadecimal");
        assert_eq!(digest.to_string(), ABC_DIGEST);

        assert_matches!(
            ABC_DIGEST.to_uppercase().parse::<Sha256Digest>(),
            Err(ParseHexError::Character { .. })
        );
        assert_matches!(
            "ba7816".parse::<Sha256Digest>(),
            Err(ParseHexError::Length { .. })
        );
    }

    #[test]
    fn serde_round_trip() {
        let digest: Sha256Digest = ABC_DIGEST
            .parse()
            .expect("should parse canonical lowercase hexadecimal");

        let encoded =
            serde_json::to_string(&digest).expect("should serialize a digest to a JSON string");
        assert_eq!(encoded, format!("\"{ABC_DIGEST}\""));

        let decoded: Sha256Digest =
            serde_json::from_str(&encoded).expect("should deserialize the canonical JSON string");
        assert_eq!(decoded, digest);
    }
}
