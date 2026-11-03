//! Random bytes and secrets.

use alloc::boxed::Box;
use core::{
    error::Error,
    pin::{Pin, pin},
};

use aws_lc_rs::error::Unspecified;
use error_stack::Report;
use zeroize::Zeroize as _;

use crate::{Secret, SecretBuffer};

/// An error from the random number generator.
#[derive(Debug, Copy, Clone, PartialEq, Eq, derive_more::Display)]
#[display("the random number generator failed")]
pub struct RandomError;

impl Error for RandomError {}

/// Fills `bytes` with random bytes, or zeroes them on failure.
fn fill(bytes: &mut [u8]) -> Result<(), Report<RandomError>> {
    aws_lc_rs::rand::fill(bytes).map_err(|Unspecified| {
        bytes.zeroize();
        Report::new(RandomError)
    })
}

/// `N` random bytes for a value that is not secret, such as an ID.
///
/// For secret bytes, fill a [`Secret`] with [`Secret::fill_random`], so they are zeroed on drop.
///
/// # Errors
///
/// Returns [`RandomError`] if the random number generator fails.
///
/// # Examples
///
/// ```
/// use hash_crypto::random::random_bytes;
///
/// let token_id = random_bytes::<16>()?;
/// # Ok::<(), error_stack::Report<hash_crypto::random::RandomError>>(())
/// ```
pub fn random_bytes<const N: usize>() -> Result<[u8; N], Report<RandomError>> {
    let mut bytes = [0; N];
    fill(&mut bytes)?;
    Ok(bytes)
}

impl<T: ?Sized + SecretBuffer<View = [u8]>> Secret<T> {
    /// Fills the secret with random bytes, or zeroes it on failure.
    ///
    /// # Errors
    ///
    /// Returns [`RandomError`] if the random number generator fails.
    ///
    /// # Examples
    ///
    /// ```
    /// use core::pin::pin;
    ///
    /// use hash_crypto::Secret;
    ///
    /// let mut key = pin!(Secret::<[u8; 32]>::zeroed());
    /// key.as_mut().fill_random()?;
    /// # Ok::<(), error_stack::Report<hash_crypto::random::RandomError>>(())
    /// ```
    pub fn fill_random(self: Pin<&mut Self>) -> Result<(), Report<RandomError>> {
        fill(self.expose_mut())
    }
}

impl<const N: usize> Secret<[u8; N]> {
    /// A secret of `N` random alphanumeric ASCII characters.
    ///
    /// Each character is one of `0`–`9`, `A`–`Z` and `a`–`z`, and all are equally likely. Each
    /// character carries about 5.95 bits.
    ///
    /// # Errors
    ///
    /// Returns [`RandomError`] if the random number generator fails.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_crypto::Secret;
    ///
    /// let secret = Secret::<[u8; 43]>::random_alphanumeric()?;
    ///
    /// assert!(secret.expose().iter().all(u8::is_ascii_alphanumeric));
    /// # Ok::<(), error_stack::Report<hash_crypto::random::RandomError>>(())
    /// ```
    pub fn random_alphanumeric() -> Result<Pin<Box<Self>>, Report<RandomError>> {
        let mut secret = Box::pin(Self::zeroed());
        fill_alphanumeric(secret.as_mut().expose_mut(), fill)?;
        Ok(secret)
    }
}

/// The number of random bytes drawn at once for alphanumeric characters.
const POOL_LENGTH: usize = 64;

/// Fills `characters` with alphanumeric characters drawn from the random bytes `fill` writes.
///
/// A byte stands for the character whose index is its upper six bits. A byte whose upper six bits
/// are 62 or 63 stands for no character, so every character is equally likely. The pool is
/// refilled until `characters` is full.
fn fill_alphanumeric<E>(
    characters: &mut [u8],
    mut fill: impl FnMut(&mut [u8]) -> Result<(), E>,
) -> Result<(), E> {
    let mut pool = pin!(Secret::<[u8; POOL_LENGTH]>::zeroed());
    let mut filled = 0;
    while filled < characters.len() {
        fill(pool.as_mut().expose_mut())?;
        let drawn = pool
            .expose()
            .iter()
            .filter_map(|byte| alphanumeric(byte >> 2));
        for (slot, character) in characters.iter_mut().skip(filled).zip(drawn) {
            *slot = character;
            filled += 1;
        }
    }
    Ok(())
}

/// The alphanumeric character with the index `value`, or `None` for a value of 62 or more.
const fn alphanumeric(value: u8) -> Option<u8> {
    match value {
        0..=9 => Some(b'0' + value),
        10..=35 => Some(b'A' + (value - 10)),
        36..=61 => Some(b'a' + (value - 36)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use core::{convert::Infallible, pin::pin};

    use super::{POOL_LENGTH, fill_alphanumeric, random_bytes};
    use crate::Secret;

    #[test]
    fn fill_alphanumeric_all_values() {
        // The upper six bits of the byte at `index` are `index`, so the pool holds the values 0 to
        // 63 in order.
        let bytes: [u8; POOL_LENGTH] = core::array::from_fn(|index| {
            u8::try_from(index << 2).expect("every index should fit in a byte after the shift")
        });
        let mut characters = [0; 62];

        fill_alphanumeric(&mut characters, |pool| {
            pool.copy_from_slice(&bytes);
            Ok::<_, Infallible>(())
        })
        .expect("filling the pool should not fail");

        assert_eq!(
            &characters, b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
            "every value below 62 should stand for its own character"
        );
    }

    #[test]
    fn fill_alphanumeric_out_of_range() {
        // The upper six bits of 0xF8 and 0xFC are 62 and 63, which stand for no character. Those of
        // 0xF4, 0x03 and 0x28 are 61, 0 and 10, the characters `z`, `0` and `A`.
        let mut bytes = [0x28; POOL_LENGTH];
        bytes[..4].copy_from_slice(&[0xF8, 0xF4, 0xFC, 0x03]);
        let mut characters = [0; 8];

        fill_alphanumeric(&mut characters, |pool| {
            pool.copy_from_slice(&bytes);
            Ok::<_, Infallible>(())
        })
        .expect("filling the pool should not fail");

        assert_eq!(
            &characters, b"z0AAAAAA",
            "the characters should skip the bytes that stand for none"
        );
    }

    #[test]
    fn fill_alphanumeric_short_pool() {
        // The first pool holds only two characters: 0x03 is `0`, and 0xFC stands for none. The
        // second pool, all 0x28, completes the characters with `A`.
        let mut first = [0xFC; POOL_LENGTH];
        first[..2].fill(0x03);
        let mut pools = [first, [0x28; POOL_LENGTH]].into_iter();
        let mut characters = [0; 8];

        fill_alphanumeric(&mut characters, |pool| {
            pool.copy_from_slice(&pools.next().expect("the characters should need two pools"));
            Ok::<_, Infallible>(())
        })
        .expect("filling the pool should not fail");

        assert_eq!(
            &characters, b"00AAAAAA",
            "the characters should continue in the next pool"
        );
    }

    #[test]
    fn fill_alphanumeric_failing_fill() {
        assert_eq!(
            fill_alphanumeric(&mut [0; 8], |_| Err("the byte source failed")),
            Err("the byte source failed"),
            "the error of the byte source should end the draw"
        );
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn random_bytes_filled() {
        let bytes = random_bytes::<32>().expect("the random number generator should work");

        assert_ne!(bytes, [0; 32], "the bytes should be random");
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn fill_random_filled() {
        let mut secret = pin!(Secret::<[u8; 32]>::zeroed());

        secret
            .as_mut()
            .fill_random()
            .expect("the random number generator should work");

        assert_ne!(
            secret.expose(),
            [0; 32],
            "the secret should hold random bytes"
        );
    }

    #[test]
    #[cfg_attr(miri, ignore = "Miri cannot run AWS-LC's C code")]
    fn random_alphanumeric_filled() {
        let secret = Secret::<[u8; 32]>::random_alphanumeric()
            .expect("the random number generator should work");

        assert!(
            secret.expose().iter().all(u8::is_ascii_alphanumeric),
            "the characters should be alphanumeric"
        );
        // Bytes of zero stand for the character `0`.
        assert_ne!(
            secret.expose(),
            [b'0'; 32],
            "the characters should come from random bytes"
        );
    }
}
