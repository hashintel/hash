//! Hash functions.

use aws_lc_rs::digest;

/// The SHA-256 digest of `data`.
///
/// The hashing state is zeroed afterwards.
///
/// # Examples
///
/// ```
/// use hash_secret::digest::sha256;
///
/// let digest = sha256(b"abc");
///
/// assert_eq!(digest[..4], [0xBA, 0x78, 0x16, 0xBF]);
/// ```
#[must_use]
pub fn sha256(data: &[u8]) -> [u8; 32] {
    let mut output = [0; 32];
    output.copy_from_slice(digest::digest(&digest::SHA256, data).as_ref());
    output
}

#[cfg(test)]
mod tests {
    use super::sha256;
    use crate::Secret;

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn sha256_known_answer() {
        // The one-block example of FIPS 180-2, appendix B.1.
        let expected = Secret::<[u8; 32]>::from_hex(String::from(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        ))
        .expect("the digest should be hexadecimal");

        assert_eq!(
            sha256(b"abc").as_slice(),
            expected.expose(),
            "the digest should match the test vector"
        );
    }
}
