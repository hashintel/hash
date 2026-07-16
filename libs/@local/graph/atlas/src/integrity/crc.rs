//! CRC-64/NVME corruption checks.

use crc_fast::{CrcAlgorithm, Digest};

use super::writer::Update;

/// A CRC-64/NVME checksum value.
///
/// Equality is the integrity check: a frame is intact exactly when the
/// checksum recomputed from its bytes equals the stored one. See [`Crc64`]
/// for what a match does and does not guarantee.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::ByteHash,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub struct Checksum(u64);

/// A streaming CRC-64/NVME checksum.
///
/// The checksum is a cheap 64-bit integrity check for framing artifacts on
/// disk: a reader that recomputes it over a frame and compares against the
/// stored value detects torn writes, bit rot, and truncated payloads before
/// interpreting the bytes. Checksumming uses carryless-multiplication SIMD
/// kernels when the CPU provides them, so it is cheap enough to cover every
/// page of a memory-mapped artifact.
///
/// A CRC only defends against accidental corruption. Any party who can
/// choose the bytes can also choose the checksum, so use a
/// [`Sha256Digest`](super::Sha256Digest) when the value must name content
/// and a [`Signature`](super::Signature) when the producer must be
/// authenticated.
///
/// Bytes are absorbed through [`Update::update`](super::Update::update) (or
/// any stream via [`Writer`](super::Writer)), and the [`Checksum`] of the
/// empty byte sequence is zero. The parameters follow the CRC-64/NVME
/// specification, so values agree with every other conforming
/// implementation.
///
/// # Examples
///
/// A writer records the checksum of a frame; a reader recomputes it and
/// accepts the frame only on equality:
///
/// ```rust
/// use hash_graph_atlas::integrity::{Crc64, Update as _};
///
/// let mut writing = Crc64::new();
/// writing.update(b"frame payload");
/// let stored = writing.finalize();
/// hecksum = Crc64::new();
/// checksum.update(b"123456789");
/// assert_eq!(checksum.finalize(), 0xAE8B_1486_0A79_9888);
/// ```
#[derive(Debug)]
pub struct Crc64(Digest);

impl Crc64 {
    /// Creates a checksum over the empty byte sequence.
    #[must_use]
    pub fn new() -> Self {
        Self(Digest::new(CrcAlgorithm::Crc64Nvme))
    }

    /// Returns the checksum of all bytes absorbed so far.
    ///
    /// The state stays usable: absorbing more bytes afterwards continues the
    /// same stream, so intermediate checksums of a growing prefix are cheap.
    #[must_use]
    #[inline]
    pub fn finalize(&self) -> Checksum {
        Checksum(self.0.finalize())
    }

    /// Appends the stream checksummed by `suffix` to this stream.
    ///
    /// After combining, this checksum covers its own bytes followed by the
    /// bytes absorbed by `suffix`, without touching either byte stream
    /// again. This turns checksumming into a parallel reduction: checksum
    /// disjoint segments concurrently, then fold the results in segment
    /// order.
    ///
    /// # Examples
    ///
    /// ```rust
    /// use hash_graph_atlas::integrity::Crc64;
    ///
    /// let mut whole = Crc64::new();
    /// whole.update(b"123456789");
    ///
    /// let mut left = Crc64::new();
    /// left.update(b"1234");
    /// let mut right = Crc64::new();
    /// right.update(b"56789");
    /// left.combine(&right);
    ///
    /// assert_eq!(left.finalize(), whole.finalize());
    /// ```
    #[inline]
    pub fn combine(&mut self, suffix: &Self) {
        self.0.combine(&suffix.0);
    }
}

impl Update for Crc64 {
    #[inline]
    fn update(&mut self, bytes: &[u8]) {
        self.0.update(bytes);
    }
}

impl Default for Crc64 {
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::{Checksum, Crc64};
    use crate::integrity::Update as _;

    const CHECK_VALUE: Checksum = Checksum(0xAE8B_1486_0A79_9888);

    #[test]
    fn known_vectors() {
        let mut checksum = Crc64::new();
        checksum.update(b"123456789");
        assert_eq!(checksum.finalize(), CHECK_VALUE);

        assert_eq!(Crc64::new().finalize(), Checksum(0));
    }

    #[test]
    fn combine_matches_sequential() {
        let mut left = Crc64::new();
        left.update(b"1234");
        let mut right = Crc64::new();
        right.update(b"56789");
        left.combine(&right);

        assert_eq!(left.finalize(), CHECK_VALUE);
    }

    #[test]
    fn finalize_keeps_streaming() {
        let mut checksum = Crc64::new();
        checksum.update(b"1234");
        let _prefix = checksum.finalize();
        checksum.update(b"56789");
        assert_eq!(checksum.finalize(), CHECK_VALUE);
    }
}
