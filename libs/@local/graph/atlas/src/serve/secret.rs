use core::ops::Deref;

use crate::integrity::SecretHexBytes;

/// A serving deployment's 32-byte secret.
///
/// Authorization sealing and row-id obfuscation derive keys from this value under distinct domain
/// separators. A fixed secret preserves row mappings for equal generation identities and labels.
/// Authorization also salts each authority's derivation with fresh randomness.
///
/// Supply unpredictable key material: the type accepts every 32-byte value and checks no entropy.
/// Configuration uses the canonical lowercase hexadecimal form provided by [`SecretHexBytes`].
/// [`core::fmt::Debug`] redacts the value, and each owned buffer zeroizes on drop. This zeroization
/// does not cover copies obtained through byte access.
#[derive(Debug, Clone, PartialEq, Eq)]
#[repr(transparent)]
pub(crate) struct ServeSecret(SecretHexBytes<32>);

impl ServeSecret {
    /// The secret's width in bytes.
    const LENGTH: usize = size_of::<Self>();
}

impl Deref for ServeSecret {
    type Target = SecretHexBytes<{ Self::LENGTH }>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl From<SecretHexBytes<{ Self::LENGTH }>> for ServeSecret {
    fn from(bytes: SecretHexBytes<{ Self::LENGTH }>) -> Self {
        Self(bytes)
    }
}
