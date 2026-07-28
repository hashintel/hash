use core::{convert::Infallible, fmt, ops::Deref, str::FromStr};

use zerocopy::IntoBytes as _;
use zeroize::Zeroize as _;

use super::{ParseHexError, hex::HexBytes};

/// A variable-length secret string.
///
/// Key-material hygiene by construction: the bytes zero on drop, and no path encodes them back
/// out - [`fmt::Debug`] prints the length alone, [`fmt::Display`] a fixed placeholder, and the
/// type has no `Serialize` - so a held secret cannot leak through logging or document dumps.
/// Consuming the secret with [`expose`](Self::expose) is the one way to reach the held value.
#[derive(Clone)]
pub struct SecretString(String);

impl SecretString {
    /// Consumes the secret, handing the held value to its final consumer.
    #[must_use]
    pub(crate) fn expose(mut self) -> String {
        core::mem::take(&mut self.0)
    }
}

impl fmt::Debug for SecretString {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("SecretString")
            .field("len", &self.0.len())
            .finish_non_exhaustive()
    }
}

impl fmt::Display for SecretString {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("[redacted]")
    }
}

impl Drop for SecretString {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

impl FromStr for SecretString {
    type Err = Infallible;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Ok(Self(value.to_owned()))
    }
}

/// An `N`-byte secret configured in the canonical hexadecimal encoding.
///
/// Key-material hygiene by construction: the bytes zero on drop, this type's own renderings
/// redact - [`fmt::Debug`] prints the width alone and [`fmt::Display`] a fixed placeholder - and
/// the type has no `Serialize`, so logging or serializing the value discloses nothing.
///
/// The redaction covers this value, not everything reachable through it: [`HexBytes`] renders
/// every byte, so rendering the dereferenced inner value writes the key in full. Code that holds
/// a secret renders the secret, never its target.
///
/// Parsing and deserialization accept exactly the canonical lowercase form.
#[derive(
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::ByteHash,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub struct SecretHexBytes<const N: usize>(HexBytes<N>);

impl<const N: usize> SecretHexBytes<N> {
    /// Wraps raw secret bytes.
    pub(crate) const fn new(bytes: [u8; N]) -> Self {
        Self(HexBytes::new(bytes))
    }
}

impl<const N: usize> Deref for SecretHexBytes<N> {
    type Target = HexBytes<N>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl<const N: usize> fmt::Debug for SecretHexBytes<N> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("SecretHexBytes")
            .field("len", &N)
            .finish_non_exhaustive()
    }
}

impl<const N: usize> fmt::Display for SecretHexBytes<N> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("[redacted]")
    }
}

impl<const N: usize> Drop for SecretHexBytes<N> {
    fn drop(&mut self) {
        let bytes = self.0.as_mut_bytes();
        bytes.zeroize();
    }
}

impl<const N: usize> FromStr for SecretHexBytes<N> {
    type Err = ParseHexError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let bytes = HexBytes::<N>::from_str(value)?;
        Ok(Self(bytes))
    }
}

impl<'de, const N: usize> serde::Deserialize<'de> for SecretHexBytes<N> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        HexBytes::deserialize(deserializer).map(Self)
    }
}

#[cfg(test)]
mod tests {
    use core::str::FromStr as _;

    use super::{SecretHexBytes, SecretString};

    /// A key whose adjacent bytes differ, so a partial leak cannot hide inside a repeated run.
    const HEX: &str = "6ad599a5c17e1fc4d7e2988bd4f3e0367f3c4a35d6dae135f9a1e0efc775ce55";

    /// Asserts that no eight-byte window of `material` survives into `rendered`.
    ///
    /// Windows rather than the whole value: a truncated or partially encoded rendering discloses
    /// held material just as a complete one does.
    #[track_caller]
    fn assert_redacted(rendered: &str, material: &str) {
        for (start, window) in material.as_bytes().windows(8).enumerate() {
            assert!(
                !rendered
                    .as_bytes()
                    .windows(8)
                    .any(|candidate| candidate == window),
                "the rendering carries held material at position {start}: {rendered}"
            );
        }
    }

    /// Neither rendering of a held key encodes its bytes.
    ///
    /// The width and the placeholder are what a log line or a document dump may carry; the bytes
    /// reach a rendering only through the deref to the hexadecimal form, which is a deliberate
    /// exposure rather than an accident of formatting.
    #[test]
    fn hex_secrets_redact_both_renderings() {
        let secret =
            SecretHexBytes::<32>::from_str(HEX).expect("the literal is the canonical form");

        assert_redacted(&format!("{secret:?}"), HEX);
        assert_redacted(&format!("{secret}"), HEX);
    }

    /// Neither rendering of a held string encodes its characters.
    #[test]
    fn string_secrets_redact_both_renderings() {
        const VALUE: &str = "postgres://atlas:hunter2@10.0.0.7:5432/graph";

        let secret = SecretString::from_str(VALUE).expect("the conversion cannot fail");

        assert_redacted(&format!("{secret:?}"), VALUE);
        assert_redacted(&format!("{secret}"), VALUE);
    }
}
