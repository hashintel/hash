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
    /// ```ignore
    /// let secret =
    ///     WireSecret::from_hex("6ad599a5c17e1fc4d7e2988bd4f3e0367f3c4a35d6dae135f9a1e0efc775ce55")?;
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

#[cfg(test)]
mod tests {
    use super::WireSecret;

    /// The wire secret's diagnostic rendering carries no key material.
    ///
    /// Scope is the outer rendering alone: [`WireSecret`]'s [`fmt::Debug`] formats no field, so the
    /// held secret's own redaction is not observable here and its defining module pins it. What
    /// this does catch is the plausible regression - a rendering that reaches the bytes through the
    /// held value's deref, whose hexadecimal form encodes them in full.
    ///
    /// [`fmt::Debug`]: core::fmt::Debug
    #[test]
    fn wire_secrets_redact_their_key() {
        /// A key whose every byte differs from its neighbours, so a partial leak cannot hide in a
        /// repeated run.
        const HEX: &str = "6ad599a5c17e1fc4d7e2988bd4f3e0367f3c4a35d6dae135f9a1e0efc775ce55";

        let secret = WireSecret::from_hex(HEX).expect("the literal is 64 lowercase hex digits");
        let rendered = format!("{secret:?}");

        // Any window of the configured form, not the whole string: a rendering that truncates the
        // key or encodes only part of it leaks as surely as a complete one.
        for (start, window) in HEX.as_bytes().windows(8).enumerate() {
            assert!(
                !rendered
                    .as_bytes()
                    .windows(8)
                    .any(|candidate| candidate == window),
                "the rendering carries key material at position {start}: {rendered}"
            );
        }

        // Redaction that hid the type would trade one diagnostic failure for another.
        assert!(
            rendered.contains("WireSecret"),
            "the rendering still names the type: {rendered}"
        );
    }
}
