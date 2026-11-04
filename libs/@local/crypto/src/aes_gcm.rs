//! Encryption of secrets with AES-256-GCM.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use core::{
    error::Error,
    fmt,
    marker::PhantomData,
    pin::{Pin, pin},
};

use aws_lc_rs::{
    aead::{AES_256_GCM, Aad, NONCE_LEN, Nonce, RandomizedNonceKey},
    error::Unspecified,
};
use error_stack::Report;
use zerocopy::{FromBytes, Immutable, IntoBytes};
use zeroize::Zeroize;

use crate::{Secret, SecretBuffer};

const TAG_LEN: usize = 16;

/// The most bytes AES-GCM encrypts under one nonce (SP 800-38D, section 5.2.1.1).
const MAX_PLAINTEXT_LEN: u64 = (1 << 36) - 32;

/// A purpose for which values are sealed with AES-256-GCM.
///
/// [`Aes256GcmKey`] and [`Sealed`] take the purpose as a type parameter, so a value of one purpose
/// does not compile where another is expected. Only the compiler checks the purpose, so give every
/// purpose its own key bytes.
///
/// # Examples
///
/// ```
/// use hash_crypto::aes_gcm::AeadPurpose;
///
/// struct Notes;
///
/// struct Row {
///     web_id: [u8; 16],
///     entity_id: [u8; 16],
/// }
///
/// impl AeadPurpose for Notes {
///     type AssociatedData = Row;
///
///     fn associated_data(row: &Row) -> impl AsRef<[u8]> {
///         // Both IDs have a fixed length, so they need no separator.
///         [row.web_id, row.entity_id].concat()
///     }
/// }
/// ```
pub trait AeadPurpose {
    /// The data a sealed value is bound to, such as the row it is stored in.
    type AssociatedData: ?Sized;

    /// The bytes of `data` that AES-GCM authenticates.
    ///
    /// Different data has to give different bytes, or a value sealed with one opens with the
    /// other. Changing the encoding makes every stored value fail to open.
    fn associated_data(data: &Self::AssociatedData) -> impl AsRef<[u8]>;
}

/// An AES-256-GCM key for the values of the purpose `P`.
///
/// Every value gets a random 96-bit nonce, so the same key bytes may seal at most `2^32` values
/// across all processes (SP 800-38D, section 8.3).
///
/// The key schedule and every copy of a plaintext are zeroed on drop, except for what the cipher
/// keeps on the stack while it seals or opens.
///
/// # Examples
///
/// ```
/// use core::pin::pin;
///
/// use hash_crypto::{
///     Secret,
///     aes_gcm::{AeadPurpose, Aes256GcmKey},
/// };
///
/// struct Example;
///
/// impl AeadPurpose for Example {
///     type AssociatedData = str;
///
///     fn associated_data(row: &str) -> impl AsRef<[u8]> {
///         row
///     }
/// }
///
/// let key =
///     Aes256GcmKey::<Example>::from_secret(&*Secret::<[u8; 32]>::from_hex("ab".repeat(32))?);
/// let plaintext = Secret::<[u8; 4]>::from_hex(String::from("deadbeef"))?;
///
/// let sealed = key.seal(&plaintext, "row 1")?;
///
/// let mut opened = pin!(Secret::<[u8; 4]>::zeroed());
/// key.open(&sealed, "row 1", opened.as_mut())?;
/// assert_eq!(*opened, *plaintext);
/// assert!(key.open(&sealed, "row 2", opened.as_mut()).is_err());
/// # Ok::<(), Box<dyn core::error::Error>>(())
/// ```
pub struct Aes256GcmKey<P> {
    key: RandomizedNonceKey,
    purpose: PhantomData<fn() -> P>,
}

impl<P: AeadPurpose> Aes256GcmKey<P> {
    /// The key with the bytes of `key`.
    ///
    /// # Panics
    ///
    /// Panics if the memory for the key schedule cannot be allocated.
    #[must_use]
    pub fn from_secret(key: &Secret<[u8; 32]>) -> Self {
        Self {
            key: RandomizedNonceKey::new(&AES_256_GCM, key.expose())
                .expect("should allocate the key schedule for a 32-byte key"),
            purpose: PhantomData,
        }
    }

    /// Seals `plaintext` bound to `associated_data`.
    ///
    /// # Errors
    ///
    /// Returns [`SealError`] if the cipher fails, such as when the random number generator fails.
    pub fn seal<const N: usize>(
        &self,
        plaintext: &Secret<[u8; N]>,
        associated_data: &P::AssociatedData,
    ) -> Result<Sealed<P, N>, Report<SealError>> {
        const {
            assert!(
                N as u64 <= MAX_PLAINTEXT_LEN,
                "AES-GCM should encrypt at most 2^36 - 32 bytes"
            );
        }

        let mut buffer = pin!(Secret::<[u8; N]>::zeroed());
        buffer
            .as_mut()
            .expose_mut()
            .copy_from_slice(plaintext.expose());
        let (nonce, tag) = self
            .key
            .seal_in_place_separate_tag(
                Aad::from(P::associated_data(associated_data)),
                buffer.as_mut().expose_mut(),
            )
            .map_err(|Unspecified| Report::new(SealError))?;

        let mut sealed = Sealed {
            nonce: *nonce.as_ref(),
            ciphertext: [0; N],
            tag: [0; TAG_LEN],
            purpose: PhantomData,
        };
        sealed.ciphertext.copy_from_slice(buffer.expose());
        sealed.tag.copy_from_slice(tag.as_ref());
        Ok(sealed)
    }

    /// Opens `sealed` into `plaintext`, which is zeroed on failure.
    ///
    /// # Errors
    ///
    /// Returns [`OpenError`] if `sealed` was not sealed with this key and `associated_data`, or
    /// was changed since.
    pub fn open<const N: usize>(
        &self,
        sealed: &Sealed<P, N>,
        associated_data: &P::AssociatedData,
        plaintext: Pin<&mut Secret<[u8; N]>>,
    ) -> Result<(), Report<OpenError>> {
        const {
            assert!(
                N as u64 <= MAX_PLAINTEXT_LEN,
                "AES-GCM should decrypt at most 2^36 - 32 bytes"
            );
        }

        let mut buffer = pin!(Secret::<CiphertextWithTag<N>>::new_zeroed());
        let (ciphertext, tag) = buffer.as_mut().expose_mut().split_at_mut(N);
        ciphertext.copy_from_slice(&sealed.ciphertext);
        tag.copy_from_slice(&sealed.tag);

        let Ok(opened) = self.key.open_in_place(
            Nonce::assume_unique_for_key(sealed.nonce),
            Aad::from(P::associated_data(associated_data)),
            buffer.as_mut().expose_mut(),
        ) else {
            plaintext.expose_mut().zeroize();
            return Err(Report::new(OpenError));
        };

        plaintext.expose_mut().copy_from_slice(opened);
        Ok(())
    }
}

impl<P> fmt::Debug for Aes256GcmKey<P> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Aes256GcmKey").finish_non_exhaustive()
    }
}

/// The ciphertext of a sealed value followed by its tag, as `open_in_place` expects them.
#[derive(Clone, FromBytes, IntoBytes, Immutable)]
#[repr(C)]
struct CiphertextWithTag<const N: usize> {
    ciphertext: [u8; N],
    tag: [u8; TAG_LEN],
}

impl<const N: usize> AsRef<[u8]> for CiphertextWithTag<N> {
    fn as_ref(&self) -> &[u8] {
        self.as_bytes()
    }
}

impl<const N: usize> AsMut<[u8]> for CiphertextWithTag<N> {
    fn as_mut(&mut self) -> &mut [u8] {
        self.as_mut_bytes()
    }
}

impl<const N: usize> Zeroize for CiphertextWithTag<N> {
    fn zeroize(&mut self) {
        self.as_mut_bytes().zeroize();
    }
}

impl<const N: usize> SecretBuffer for CiphertextWithTag<N> {
    type View = [u8];
}

/// A value of `N` bytes sealed with AES-256-GCM for the purpose `P`.
///
/// Its bytes are the nonce (12 bytes), the ciphertext (`N` bytes) and the tag (16 bytes), in this
/// fixed order. They are not secret: without the key they reveal only the length, and any change
/// makes [`Aes256GcmKey::open`] fail.
///
/// The bytes do not record the purpose, so a value read with [`FromBytes`] has the purpose its
/// reader names.
///
/// # Examples
///
/// ```
/// use core::pin::pin;
///
/// use hash_crypto::{
///     Secret,
///     aes_gcm::{AeadPurpose, Aes256GcmKey, Sealed},
/// };
/// use zerocopy::{FromBytes as _, IntoBytes as _};
///
/// struct Example;
///
/// impl AeadPurpose for Example {
///     type AssociatedData = ();
///
///     fn associated_data((): &()) -> impl AsRef<[u8]> {
///         []
///     }
/// }
///
/// let key =
///     Aes256GcmKey::<Example>::from_secret(&*Secret::<[u8; 32]>::from_hex("ab".repeat(32))?);
/// let sealed = key.seal(&*Secret::<[u8; 32]>::from_hex("cd".repeat(32))?, &())?;
///
/// // An array of the right length converts in both directions at compile time.
/// let column: [u8; 60] = zerocopy::transmute!(sealed);
/// let sealed: Sealed<Example, 32> = zerocopy::transmute!(column);
///
/// // Bytes of unknown length are checked when reading.
/// let row = sealed.as_bytes().to_vec();
/// let sealed =
///     Sealed::<Example, 32>::read_from_bytes(&row).expect("the row should hold 60 bytes");
/// assert!(
///     key.open(&sealed, &(), pin!(Secret::<[u8; 32]>::zeroed()))
///         .is_ok()
/// );
/// # Ok::<(), Box<dyn core::error::Error>>(())
/// ```
#[derive(FromBytes, IntoBytes, Immutable)]
#[repr(C)]
pub struct Sealed<P, const N: usize> {
    nonce: [u8; NONCE_LEN],
    ciphertext: [u8; N],
    tag: [u8; TAG_LEN],
    purpose: PhantomData<fn() -> P>,
}

impl<P, const N: usize> Clone for Sealed<P, N> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<P, const N: usize> Copy for Sealed<P, N> {}

impl<P, const N: usize> fmt::Debug for Sealed<P, N> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("Sealed")
            .field("nonce", &self.nonce)
            .field("ciphertext", &self.ciphertext)
            .field("tag", &self.tag)
            .finish()
    }
}

/// An error from sealing a value.
#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display)]
#[display("the value could not be sealed")]
pub struct SealError;

impl Error for SealError {}

/// An error from opening a [`Sealed`] value.
#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display)]
#[display("the sealed value does not match the key and the associated data")]
pub struct OpenError;

impl Error for OpenError {}

#[cfg(test)]
mod tests {
    use core::pin::pin;

    use zerocopy::FromBytes as _;

    use super::{AeadPurpose, Aes256GcmKey, Sealed};
    use crate::Secret;

    struct Test;

    impl AeadPurpose for Test {
        type AssociatedData = [u8];

        fn associated_data(data: &[u8]) -> impl AsRef<[u8]> {
            data
        }
    }

    fn key(hex: &str) -> Aes256GcmKey<Test> {
        Aes256GcmKey::from_secret(
            &Secret::<[u8; 32]>::from_hex(hex.to_owned()).expect("the key should be hexadecimal"),
        )
    }

    fn bytes(hex: &str) -> Vec<u8> {
        Secret::<[u8]>::from_hex(hex.to_owned())
            .expect("the bytes should be hexadecimal")
            .expose()
            .to_vec()
    }

    // Test case 16 from McGrew and Viega, "The Galois/Counter Mode of Operation (GCM)".
    const KEY: &str = "feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308";
    const NONCE: &str = "cafebabefacedbaddecaf888";
    const PLAINTEXT: &str = "d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39";
    const ASSOCIATED_DATA: &str = "feedfacedeadbeeffeedfacedeadbeefabaddad2";
    const CIPHERTEXT: &str = "522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662";
    const TAG: &str = "76fc6ece0f4e1768cddf8853bb2d551b";

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn open_known_answer() {
        let sealed =
            Sealed::<Test, 60>::read_from_bytes(&bytes(&[NONCE, CIPHERTEXT, TAG].concat()))
                .expect("the test vector should have the length of a sealed value");

        let mut plaintext = pin!(Secret::<[u8; 60]>::zeroed());
        key(KEY)
            .open(&sealed, &bytes(ASSOCIATED_DATA), plaintext.as_mut())
            .expect("the test vector should open");

        assert_eq!(
            plaintext.expose(),
            bytes(PLAINTEXT),
            "the plaintext should match the test vector"
        );
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn open_other_associated_data() {
        let sealed =
            Sealed::<Test, 60>::read_from_bytes(&bytes(&[NONCE, CIPHERTEXT, TAG].concat()))
                .expect("the test vector should have the length of a sealed value");

        let mut plaintext = pin!(Secret::<[u8; 60]>::zeroed());
        plaintext.as_mut().expose_mut().fill(0xA5);
        assert!(
            key(KEY)
                .open(&sealed, b"other", plaintext.as_mut())
                .is_err(),
            "the value should not open with other associated data"
        );

        assert_eq!(
            plaintext.expose(),
            [0; 60].as_slice(),
            "a value that does not open should zero the plaintext"
        );
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn seal_round_trip() {
        let key = key(KEY);
        let plaintext = Secret::<[u8; 60]>::from_hex(PLAINTEXT.to_owned())
            .expect("the plaintext should be hexadecimal");

        let sealed = key
            .seal(&plaintext, b"row")
            .expect("the plaintext should seal");
        let mut opened = pin!(Secret::<[u8; 60]>::zeroed());
        key.open(&sealed, b"row", opened.as_mut())
            .expect("the sealed value should open");

        assert_eq!(
            *opened, *plaintext,
            "the opened value should be the plaintext"
        );
    }
}
