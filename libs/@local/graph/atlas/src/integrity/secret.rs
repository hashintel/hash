use core::{convert::Infallible, fmt, ops::Deref, str::FromStr};

use zerocopy::IntoBytes as _;
use zeroize::{Zeroize as _, Zeroizing};

use super::{ParseHexError, hex::HexBytes};

/// A variable-length secret string.
///
/// The bytes zero on drop, and no path encodes them back out. [`fmt::Debug`] prints the length
/// alone, [`fmt::Display`] prints a fixed placeholder, and the type has no `Serialize`, so logging
/// or dumping a held secret discloses nothing. [`expose`](Self::expose) hands the buffer onward
/// under a guard that zeroizes it in turn, and [`into_unguarded`](Self::into_unguarded) is the one
/// exit that ends zeroizing custody.
///
/// The zeroing covers buffers this type and its guard own, never copies made from them. A consumer
/// that copies the exposed value into its own storage owns that copy's end of life. The value also
/// arrives from the command line or environment, whose copies precede the type.
#[derive(Clone)]
pub struct SecretString(String);

impl SecretString {
    /// Consumes the secret, handing the held value onward in a wrapper that zeroizes on drop.
    ///
    /// Custody transfers rather than lapsing: the returned guard owns the same allocation and
    /// zeroizes it when dropped. Nothing copies in the transfer. A consumer whose API takes a bare
    /// owned [`String`]
    /// takes [`into_unguarded`](Self::into_unguarded) instead, because moving the value out of the
    /// guard would otherwise force a copy the guard cannot follow.
    #[must_use]
    pub(crate) fn expose(mut self) -> Zeroizing<String> {
        Zeroizing::new(core::mem::take(&mut self.0))
    }

    /// Consumes the secret, moving the held value out of zeroizing custody.
    ///
    /// The returned [`String`] is the same allocation with no guard left on it: whoever consumes
    /// it determines its end of life, and nothing zeroizes it.
    #[must_use]
    pub(crate) fn into_unguarded(mut self) -> String {
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
/// The bytes zero on drop, and this type's own renderings redact: [`fmt::Debug`] prints the width
/// alone and [`fmt::Display`] prints a fixed placeholder. The type has no `Serialize`, so logging
/// or serializing the value discloses nothing.
///
/// The redaction covers this value, not everything reachable through it: [`HexBytes`] renders every
/// byte, so rendering the dereferenced inner value writes the key in full. Code that holds a secret
/// renders the secret, never its target.
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
    /// Windows rather than the whole value: a rendering that truncates or encodes only part of the
    /// material discloses it as much as a complete one does.
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
    /// This test checks both renderings against every eight-byte window of the canonical form, so a
    /// partial disclosure fails the same way a whole one does. The dereferenced inner value is
    /// outside this witness: [`HexBytes`] renders every byte, and a rendering taken through the
    /// deref is what the type documentation covers.
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
