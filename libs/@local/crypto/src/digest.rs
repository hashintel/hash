//! Hash functions.

use core::fmt;

use aws_lc_rs::digest;

/// The length in bytes of a SHA-256 digest.
pub const SHA256_OUTPUT_LEN: usize = digest::SHA256_OUTPUT_LEN;

/// A SHA-256 hash that takes its input in pieces.
///
/// The digest depends only on the concatenated input, not on how it was split: `"ab"` then `"c"`
/// gives the same digest as `"a"` then `"bc"`. Prefix each variable-length piece with its length
/// if the pieces have to stay apart.
///
/// The hashing state lives on the heap and is zeroed on drop. Hashing can leave parts of the input
/// on the stack.
///
/// # Examples
///
/// ```
/// use hash_crypto::digest::{Sha256, Sha256Digest};
///
/// let mut hash = Sha256::new();
/// hash.update(b"ab");
/// hash.update(b"c");
///
/// assert_eq!(hash.finalize(), Sha256Digest::of(b"abc"));
/// ```
pub struct Sha256(digest::Context);

impl Sha256 {
    /// A hash over no input.
    #[must_use]
    pub fn new() -> Self {
        Self(digest::Context::new(&digest::SHA256))
    }

    /// Appends `data` to the input.
    pub fn update(&mut self, data: &[u8]) {
        self.0.update(data);
    }

    /// The digest of all input appended so far.
    #[must_use]
    pub fn finalize(self) -> Sha256Digest {
        Sha256Digest::copy_from(&self.0.finish())
    }
}

impl Default for Sha256 {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Debug for Sha256 {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Sha256").finish_non_exhaustive()
    }
}

/// The SHA-256 digest of some input.
///
/// `==` compares the bytes in the usual way. A value that has to be compared in constant time needs
/// a type that does so, such as [`HmacSha256Tag`](crate::hmac::HmacSha256Tag).
///
/// # Examples
///
/// ```
/// use hash_crypto::digest::Sha256Digest;
///
/// let digest = Sha256Digest::of(b"abc");
///
/// assert_eq!(digest.to_bytes()[..4], [0xBA, 0x78, 0x16, 0xBF]);
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Sha256Digest([u8; SHA256_OUTPUT_LEN]);

impl Sha256Digest {
    /// The digest of `data`.
    ///
    /// The hashing state is zeroed afterwards.
    #[must_use]
    pub fn of(data: &[u8]) -> Self {
        Self::copy_from(&digest::digest(&digest::SHA256, data))
    }

    fn copy_from(digest: &digest::Digest) -> Self {
        let mut bytes = [0; SHA256_OUTPUT_LEN];
        bytes.copy_from_slice(digest.as_ref());
        Self(bytes)
    }

    /// The bytes of the digest.
    #[must_use]
    pub const fn to_bytes(self) -> [u8; SHA256_OUTPUT_LEN] {
        self.0
    }
}

#[cfg(test)]
mod tests {
    use alloc::boxed::Box;
    use core::pin::Pin;

    use super::{Sha256, Sha256Digest};
    use crate::Secret;

    /// The one-block example of FIPS 180-2, appendix B.1.
    fn abc_digest() -> Pin<Box<Secret<[u8; 32]>>> {
        Secret::<[u8; 32]>::from_hex(String::from(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        ))
        .expect("the digest should be hexadecimal")
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn of_known_answer() {
        assert_eq!(
            Sha256Digest::of(b"abc").to_bytes().as_slice(),
            abc_digest().expose(),
            "the digest should match the test vector"
        );
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn update_pieces() {
        let mut hash = Sha256::new();
        hash.update(b"a");
        hash.update(b"");
        hash.update(b"bc");

        assert_eq!(
            hash.finalize().to_bytes().as_slice(),
            abc_digest().expose(),
            "the digest of the pieces should match the test vector of their concatenation"
        );
    }
}
