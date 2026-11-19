//! Key derivation with HKDF-SHA-256.

use core::{error::Error, fmt, pin::Pin};

use aws_lc_rs::{error::Unspecified, hkdf};
use error_stack::Report;
use zeroize::Zeroize as _;

use crate::{Secret, SecretBuffer};

/// The most bytes HKDF-SHA-256 expands to (RFC 5869, section 2.3).
const MAX_OUTPUT_LEN: usize = 255 * 32;

/// A key from which HKDF-SHA-256 expands other keys, the pseudorandom key of RFC 5869.
///
/// The key holds a copy of the secret it was extracted from, on the heap and zeroed on drop. The
/// extraction runs again in every [`expand`](Self::expand).
///
/// # Examples
///
/// ```
/// use core::pin::pin;
///
/// use hash_crypto::{Secret, hkdf::HkdfSha256Key};
///
/// let server_secret = Secret::<[u8]>::from_hex("ab".repeat(32))?;
/// let key = HkdfSha256Key::extract(b"generation 7", &server_secret);
///
/// let mut cursor_key = pin!(Secret::<[u8; 32]>::zeroed());
/// key.expand(b"cursors", cursor_key.as_mut())?;
/// # Ok::<(), Box<dyn core::error::Error>>(())
/// ```
pub struct HkdfSha256Key(hkdf::Prk);

impl HkdfSha256Key {
    /// Extracts a key from `secret` and `salt` (RFC 5869, section 2.2).
    #[must_use]
    pub fn extract<T>(salt: &[u8], secret: &Secret<T>) -> Self
    where
        T: ?Sized + SecretBuffer<View = [u8]>,
    {
        Self(hkdf::Salt::new(hkdf::HKDF_SHA256, salt).extract(secret.expose()))
    }

    /// Fills `output` with the bytes expanded from this key and `info` (RFC 5869, section 2.3), or
    /// zeroes it on failure.
    ///
    /// # Errors
    ///
    /// Returns [`HkdfError`] if HKDF fails.
    pub fn expand<const N: usize>(
        &self,
        info: &[u8],
        output: Pin<&mut Secret<[u8; N]>>,
    ) -> Result<(), Report<HkdfError>> {
        const {
            assert!(
                N <= MAX_OUTPUT_LEN,
                "HKDF-SHA-256 should expand to at most 8160 bytes"
            );
        }

        let output = output.expose_mut();
        self.0
            .expand(&[info], OutputLen(N))
            .and_then(|okm| okm.fill(output))
            .map_err(|Unspecified| {
                output.zeroize();
                Report::new(HkdfError)
            })
    }
}

impl fmt::Debug for HkdfSha256Key {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("HkdfSha256Key").finish_non_exhaustive()
    }
}

/// The output length that [`hkdf::Prk::expand`] asks for.
struct OutputLen(usize);

impl hkdf::KeyType for OutputLen {
    fn len(&self) -> usize {
        self.0
    }
}

/// An error from expanding an [`HkdfSha256Key`].
#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display)]
#[display("the key could not be expanded")]
pub struct HkdfError;

impl Error for HkdfError {}

#[cfg(test)]
mod tests {
    use core::pin::pin;

    use super::HkdfSha256Key;
    use crate::Secret;

    /// The bytes of the hexadecimal `hex`.
    fn bytes(hex: &str) -> Vec<u8> {
        Secret::<[u8]>::from_hex(hex.to_owned())
            .expect("the bytes should be hexadecimal")
            .expose()
            .to_vec()
    }

    /// Checks one test case of RFC 5869, appendix A.
    fn assert_known_answer<const N: usize>(ikm: &str, salt: &str, info: &str, okm: &str) {
        let key = HkdfSha256Key::extract(
            &bytes(salt),
            &Secret::<[u8]>::from_hex(ikm.to_owned()).expect("the input should be hexadecimal"),
        );
        let mut output = pin!(Secret::<[u8; N]>::zeroed());

        key.expand(&bytes(info), output.as_mut())
            .expect("the key should expand");

        assert_eq!(
            output.expose(),
            bytes(okm).as_slice(),
            "the output should match the test vector"
        );
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn expand_basic() {
        // Test case 1.
        assert_known_answer::<42>(
            &"0b".repeat(22),
            "000102030405060708090a0b0c",
            "f0f1f2f3f4f5f6f7f8f9",
            "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
        );
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn expand_long() {
        // Test case 2.
        assert_known_answer::<82>(
            "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f\
             202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f\
             404142434445464748494a4b4c4d4e4f",
            "606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f\
             808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f\
             a0a1a2a3a4a5a6a7a8a9aaabacadaeaf",
            "b0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0c1c2c3c4c5c6c7c8c9cacbcccdcecf\
             d0d1d2d3d4d5d6d7d8d9dadbdcdddedfe0e1e2e3e4e5e6e7e8e9eaebecedeeef\
             f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff",
            "b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c\
             59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71\
             cc30c58179ec3e87c14c01d5c1f3434f1d87",
        );
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn expand_empty_salt_and_info() {
        // Test case 3.
        assert_known_answer::<42>(
            &"0b".repeat(22),
            "",
            "",
            "8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8",
        );
    }
}
