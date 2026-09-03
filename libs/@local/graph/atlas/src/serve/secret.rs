//! The wire secret.
//!
//! Every wire-facing derivation keys from this server-held key material. The row-id codec's
//! per-generation permutation draws its round keys from the value, and [`WireSecret`] is the
//! configuration boundary. A value of the type is always a full-width key, so configuration parsing
//! rejects a weak or malformed secret before any key derivation reaches it.
//!
//! The format is exact. A secret is 32 bytes, configured as 64 lowercase hexadecimal characters in
//! the crate's canonical hexadecimal form. Rejecting every other shape keeps the key space honest,
//! because a memorable passphrase fails to parse rather than passing as low-entropy key material.
//! Generate one with `openssl rand -hex 32`.
//!
//! The module is crate-internal. Its examples carry `ignore` and spell each call as an in-crate
//! caller writes it.

use core::fmt;

use crate::integrity::SecretHexBytes;

/// The server secret behind the wire row-id codec.
///
/// A 256-bit key, held for the lifetime of an opened generation. The value zeroes its bytes on
/// drop, and formatting one for diagnostics is safe by construction: the [`fmt::Debug`] form is
/// fully redacted.
///
/// [`WireSecret::from_hex`] decodes the configured form - exactly 64 lowercase hexadecimal
/// characters.
#[derive(Clone)]
pub(crate) struct WireSecret(SecretHexBytes<{ Self::BYTES }>);

impl WireSecret {
    /// The key width, bytes.
    pub(crate) const BYTES: usize = 32;

    /// Wraps raw key bytes.
    #[must_use]
    #[cfg(test)] // The serve tests pin fixture secrets.
    pub(crate) const fn new(bytes: [u8; Self::BYTES]) -> Self {
        Self(SecretHexBytes::new(bytes))
    }

    /// Views the key bytes.
    pub(crate) const fn as_bytes(&self) -> &[u8] {
        self.0.as_bytes()
    }

    /// Views the key as the typed value key derivations take.
    pub(crate) const fn hex_bytes(&self) -> &SecretHexBytes<{ Self::BYTES }> {
        &self.0
    }
}

impl fmt::Debug for WireSecret {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_tuple("WireSecret").finish_non_exhaustive()
    }
}

impl From<SecretHexBytes<{ Self::BYTES }>> for WireSecret {
    fn from(bytes: SecretHexBytes<{ Self::BYTES }>) -> Self {
        Self(bytes)
    }
}
