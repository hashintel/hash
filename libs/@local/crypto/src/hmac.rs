//! Message authentication with HMAC-SHA-256.

use alloc::boxed::Box;
use core::{
    fmt,
    hash::{Hash, Hasher},
    marker::PhantomData,
    pin::pin,
};

use aws_lc_rs::{constant_time, hmac};
use error_stack::Report;

use crate::{Secret, random::RandomError};

const TAG_LEN: usize = 32;

/// A purpose for which messages are authenticated with HMAC-SHA-256.
///
/// [`HmacSha256Key`] and [`HmacSha256Tag`] take the purpose as a type parameter, so a tag of one
/// purpose does not compile where another is expected. Only the compiler checks the purpose, so
/// give every purpose its own key.
///
/// # Examples
///
/// ```
/// use hash_crypto::hmac::HmacPurpose;
///
/// struct Cursors;
///
/// impl HmacPurpose for Cursors {
///     type Message = [u8];
///
///     fn message(cursor: &[u8]) -> impl AsRef<[u8]> {
///         cursor
///     }
/// }
/// ```
pub trait HmacPurpose {
    /// The message a tag authenticates, such as a cursor or a credential.
    type Message: ?Sized;

    /// The bytes of `message` that HMAC authenticates.
    ///
    /// Different messages have to give different bytes, or they get the same tag. Changing the
    /// encoding changes every tag.
    fn message(message: &Self::Message) -> impl AsRef<[u8]>;
}

/// An HMAC-SHA-256 key for the messages of the purpose `P`.
///
/// The key state lives on the heap and is zeroed on drop. Building the key can leave a copy of
/// its state on the stack.
///
/// # Examples
///
/// ```
/// use hash_crypto::hmac::{HmacPurpose, HmacSha256Key};
///
/// struct Cursors;
///
/// impl HmacPurpose for Cursors {
///     type Message = [u8];
///
///     fn message(cursor: &[u8]) -> impl AsRef<[u8]> {
///         cursor
///     }
/// }
///
/// let key = HmacSha256Key::<Cursors>::random()?;
/// let tag = key.sign(b"page 2");
///
/// assert!(key.sign(b"page 2") == tag);
/// assert!(key.sign(b"page 3") != tag);
/// # Ok::<(), error_stack::Report<hash_crypto::random::RandomError>>(())
/// ```
pub struct HmacSha256Key<P> {
    // `hmac::Key` holds the HMAC state inline, and a move leaves an uncleared copy behind.
    key: Box<hmac::Key>,
    purpose: PhantomData<fn() -> P>,
}

impl<P: HmacPurpose> HmacSha256Key<P> {
    fn from_secret(key: &Secret<[u8; 32]>) -> Self {
        Self {
            key: Box::new(hmac::Key::new(hmac::HMAC_SHA256, key.expose())),
            purpose: PhantomData,
        }
    }

    /// A key of 32 random bytes.
    ///
    /// # Errors
    ///
    /// Returns [`RandomError`] if the random number generator fails.
    pub fn random() -> Result<Self, Report<RandomError>> {
        let mut key = pin!(Secret::<[u8; 32]>::zeroed());
        key.as_mut().fill_random()?;
        Ok(Self::from_secret(&key))
    }

    /// The tag of `message`.
    #[must_use]
    pub fn sign(&self, message: &P::Message) -> HmacSha256Tag<P> {
        let mut tag = [0; TAG_LEN];
        tag.copy_from_slice(hmac::sign(&self.key, P::message(message).as_ref()).as_ref());
        HmacSha256Tag {
            tag,
            purpose: PhantomData,
        }
    }
}

impl<P> fmt::Debug for HmacSha256Key<P> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("HmacSha256Key").finish_non_exhaustive()
    }
}

/// The HMAC-SHA-256 tag of a message of the purpose `P`.
///
/// Without the key, a tag can neither be computed nor traced back to its message. `==` takes
/// time that does not depend on the bytes, so a received tag can be checked against a computed
/// one. `Debug` leaves out the bytes, because a tag can serve as a credential.
pub struct HmacSha256Tag<P> {
    tag: [u8; TAG_LEN],
    purpose: PhantomData<fn() -> P>,
}

impl<P> Clone for HmacSha256Tag<P> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<P> Copy for HmacSha256Tag<P> {}

impl<P> PartialEq for HmacSha256Tag<P> {
    fn eq(&self, other: &Self) -> bool {
        constant_time::verify_slices_are_equal(&self.tag, &other.tag).is_ok()
    }
}

impl<P> Eq for HmacSha256Tag<P> {}

impl<P> Hash for HmacSha256Tag<P> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.tag.hash(state);
    }
}

impl<P> fmt::Debug for HmacSha256Tag<P> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("HmacSha256Tag").finish_non_exhaustive()
    }
}

#[cfg(test)]
mod tests {
    use core::pin::pin;

    use super::{HmacPurpose, HmacSha256Key};
    use crate::Secret;

    struct Test;

    impl HmacPurpose for Test {
        type Message = [u8];

        fn message(message: &[u8]) -> impl AsRef<[u8]> {
            message
        }
    }

    /// The key with the bytes 0 to 31.
    fn fixed_key() -> HmacSha256Key<Test> {
        let mut key = pin!(Secret::<[u8; 32]>::zeroed());
        for (byte, value) in key.as_mut().expose_mut().iter_mut().zip(0..) {
            *byte = value;
        }
        HmacSha256Key::from_secret(&key)
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn sign_known_answer() {
        // Computed independently with Python's `hmac` module.
        let expected = Secret::<[u8; 32]>::from_hex(String::from(
            "6297b77508a1a30ea4dfadd8f847c31b49aba45de10a79daf721d3f7ec112a24",
        ))
        .expect("the tag should be hexadecimal");

        let tag = fixed_key().sign(b"message");

        assert_eq!(
            tag.tag.as_slice(),
            expected.expose(),
            "the tag should match the one computed independently"
        );
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn eq_same_message() {
        let key = fixed_key();

        assert_eq!(
            key.sign(b"message"),
            key.sign(b"message"),
            "the tags of one message should be equal"
        );
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn eq_other_message() {
        let key = fixed_key();

        assert_ne!(
            key.sign(b"message"),
            key.sign(b"other message"),
            "the tags of two messages should differ"
        );
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn random_distinct() {
        let first =
            HmacSha256Key::<Test>::random().expect("the random number generator should work");
        let second =
            HmacSha256Key::<Test>::random().expect("the random number generator should work");

        assert_ne!(
            first.sign(b"message"),
            second.sign(b"message"),
            "two random keys should give different tags"
        );
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn debug_redacts_tag() {
        assert_eq!(
            format!("{:?}", fixed_key().sign(b"message")),
            "HmacSha256Tag { .. }",
            "the debug output should leave out the tag"
        );
    }
}
