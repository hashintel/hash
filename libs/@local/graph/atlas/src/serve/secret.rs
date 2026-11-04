use core::pin::Pin;

use hash_crypto::Secret;

/// A serving deployment's 32-byte secret.
///
/// Authorization sealing and row-id obfuscation derive keys from this value under distinct domain
/// separators. A fixed secret preserves row mappings for equal generation identities and labels.
/// Authorization also salts each authority's derivation with fresh randomness.
///
/// Supply unpredictable key material: the type accepts every 32-byte value and checks no entropy.
/// [`core::fmt::Debug`] redacts the value, and each owned buffer zeroes on drop.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ServeSecret(Pin<Box<Secret<[u8; 32]>>>);

impl ServeSecret {
    /// The secret that keys are derived from.
    #[expect(
        clippy::missing_const_for_fn,
        reason = "dereferencing a `Pin<Box<_>>` is not const"
    )]
    pub(crate) fn as_secret(&self) -> &Secret<[u8; 32]> {
        &self.0
    }
}

impl From<Pin<Box<Secret<[u8; 32]>>>> for ServeSecret {
    fn from(secret: Pin<Box<Secret<[u8; 32]>>>) -> Self {
        Self(secret)
    }
}
