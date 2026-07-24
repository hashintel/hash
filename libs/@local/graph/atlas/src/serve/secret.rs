//! The wire secret.
//!
//! The server-held key material every wire-facing derivation keys from: the row-id codec's
//! per-generation permutation draws its round keys from this value. [`WireSecret`] is the
//! configuration boundary - a value of the type is always a full-width key, so a weak or
//! malformed secret is rejected where configuration is parsed, never discovered where keys are
//! derived.
//!
//! The format is exact: 32 bytes, configured as 64 lowercase hexadecimal characters - the
//! crate's canonical hexadecimal form. Rejecting every other shape keeps the key space honest -
//! a memorable passphrase is refused rather than silently accepted as low-entropy key material.
//! Generate one with `openssl rand -hex 32`.

use core::{error::Error, fmt};

use zerocopy::IntoBytes as _;

use crate::integrity::{ParseHexError, SecretHexBytes};

/// A wire secret the configured form does not encode.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum WireSecretError {
    /// The text is not exactly 64 characters.
    Length {
        /// The carried character count.
        characters: usize,
    },
    /// A character is not a lowercase hexadecimal digit.
    Digit {
        /// The offending character's byte position.
        position: usize,
    },
}

impl fmt::Display for WireSecretError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Length { characters } => write!(
                fmt,
                "the wire secret must be exactly 64 hexadecimal characters (32 bytes); the \
                 configured value has {characters}"
            ),
            Self::Digit { position } => write!(
                fmt,
                "the wire secret must be lowercase hexadecimal; the character at position \
                 {position} is not a lowercase hexadecimal digit"
            ),
        }
    }
}

impl Error for WireSecretError {}

/// The server secret behind the wire row-id codec.
///
/// A 256-bit key, held for the lifetime of an opened generation. The value zeroes its bytes on
/// drop, and formatting one for diagnostics is safe by construction: the [`fmt::Debug`] form is
/// fully redacted.
///
/// [`WireSecret::from_hex`] decodes the configured form - exactly 64 lowercase hexadecimal
/// characters - and [`WireSecret::new`] takes the raw bytes directly.
#[derive(Clone)]
pub struct WireSecret(SecretHexBytes<{ Self::BYTES }>);

impl WireSecret {
    /// The key width, bytes.
    pub const BYTES: usize = 32;

    /// Wraps raw key bytes.
    #[must_use]
    pub const fn new(bytes: [u8; Self::BYTES]) -> Self {
        Self(SecretHexBytes::new(bytes))
    }

    /// Decodes the configured form: exactly 64 lowercase hexadecimal characters.
    ///
    /// # Errors
    ///
    /// Returns [`WireSecretError::Length`] when `text` is not exactly 64 characters and
    /// [`WireSecretError::Digit`] when a character is not a lowercase hexadecimal digit.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::serve::WireSecret;
    ///
    /// let secret =
    ///     WireSecret::from_hex("6ad599a5c17e1fc4d7e2988bd4f3e0367f3c4a35d6dae135f9a1e0efc775ce55")?;
    /// # Ok::<(), hash_graph_atlas::serve::WireSecretError>(())
    /// ```
    pub fn from_hex(text: &str) -> Result<Self, WireSecretError> {
        let bytes = text.parse().map_err(|error| match error {
            ParseHexError::Length { actual, .. } => WireSecretError::Length { characters: actual },
            ParseHexError::Character { index, .. } => WireSecretError::Digit { position: index },
        })?;

        Ok(Self(bytes))
    }

    /// Views the key bytes.
    pub(crate) fn as_bytes(&self) -> &[u8] {
        self.0.as_bytes()
    }
}

impl fmt::Debug for WireSecret {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_tuple("WireSecret").finish_non_exhaustive()
    }
}
