use core::{convert::Infallible, error::Error, fmt, marker::PhantomData, str::FromStr};

use clap::builder::TypedValueParser;
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
pub(crate) struct SecretString(String);

impl SecretString {
    /// Consumes the secret, handing the held value onward in a wrapper that zeroizes on drop.
    ///
    /// Custody transfers rather than lapsing: the returned guard owns the same allocation and
    /// zeroizes it when dropped. Nothing copies in the transfer. A consumer whose API takes a bare
    /// owned [`String`] takes [`into_unguarded`](Self::into_unguarded) instead, because moving the
    /// value out of the guard would otherwise force a copy the guard cannot follow.
    #[must_use]
    pub(crate) fn expose(mut self) -> Zeroizing<String> {
        Zeroizing::new(core::mem::take(&mut self.0))
    }

    /// Consumes the secret, moving the held value out of zeroizing custody.
    ///
    /// The returned [`String`] is the same allocation with no guard left on it: whoever consumes it
    /// determines its end of life, and nothing zeroizes it.
    #[must_use]
    pub(crate) fn into_unguarded(mut self) -> String {
        core::mem::take(&mut self.0)
    }
}

impl PartialEq for SecretString {
    fn eq(&self, other: &Self) -> bool {
        subtle::ConstantTimeEq::ct_eq(self.0.as_bytes(), other.0.as_bytes()).into()
    }
}

impl Eq for SecretString {}

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

/// A refused secret encoding, by position and never by byte.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ParseSecretHexError {
    /// The input contains a number of characters other than the encoded width.
    Length {
        /// The number of characters the encoded value occupies.
        expected: usize,
        /// The number of characters the input actually contains.
        actual: usize,
    },
    /// The input contains a character outside `0-9` and `a-f`.
    Character {
        /// The offset of the offending character within the input.
        index: usize,
    },
}

impl From<ParseHexError> for ParseSecretHexError {
    fn from(error: ParseHexError) -> Self {
        match error {
            ParseHexError::Length { expected, actual } => Self::Length { expected, actual },
            ParseHexError::Character { index, .. } => Self::Character { index },
        }
    }
}

impl fmt::Display for ParseSecretHexError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Length { expected, actual } => write!(
                fmt,
                "the secret contains {actual} characters and its encoding takes {expected}"
            ),
            Self::Character { index } => write!(
                fmt,
                "the secret contains a character outside 0-9 and a-f at offset {index}"
            ),
        }
    }
}

impl Error for ParseSecretHexError {}

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
#[derive(Clone, zerocopy::ByteHash, zerocopy::Immutable, zerocopy::KnownLayout)]
#[repr(transparent)]
pub(crate) struct SecretHexBytes<const N: usize>(HexBytes<N>);

impl<const N: usize> SecretHexBytes<N> {
    /// Wraps raw secret bytes.
    #[cfg(test)] // required by `WireSecret`
    pub(crate) const fn new(bytes: [u8; N]) -> Self {
        Self(HexBytes::new(bytes))
    }

    pub(crate) const fn zeroed() -> Self {
        Self(HexBytes::new([0_u8; N]))
    }

    /// Returns a reference to the secret bytes.
    pub(crate) const fn as_bytes(&self) -> &[u8] {
        self.0.as_ref()
    }

    /// Decodes the canonical lowercase hexadecimal encoding of the secret.
    ///
    /// # Errors
    ///
    /// [`ParseSecretHexError`] for an input other than exactly `2 · N` lowercase hexadecimal
    /// characters.
    pub(crate) fn from_encoded_bytes(bytes: &[u8]) -> Result<Self, ParseSecretHexError> {
        HexBytes::from_encoded_bytes(bytes)
            .map(Self)
            .map_err(ParseSecretHexError::from)
    }
}

const impl<const N: usize> AsRef<[u8]> for SecretHexBytes<N> {
    fn as_ref(&self) -> &[u8] {
        self.0.as_ref()
    }
}

const impl<const N: usize> AsMut<[u8]> for SecretHexBytes<N> {
    fn as_mut(&mut self) -> &mut [u8] {
        self.0.as_mut()
    }
}

impl<const N: usize> PartialEq for SecretHexBytes<N> {
    fn eq(&self, other: &Self) -> bool {
        subtle::ConstantTimeEq::ct_eq(self.0.as_ref(), other.0.as_ref()).into()
    }
}

impl<const N: usize> Eq for SecretHexBytes<N> {}

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
    type Err = ParseSecretHexError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::from_encoded_bytes(value.as_bytes())
    }
}

impl<'de, const N: usize> serde::Deserialize<'de> for SecretHexBytes<N> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct SecretHexVisitor<const N: usize>;

        impl<const N: usize> serde::de::Visitor<'_> for SecretHexVisitor<N> {
            type Value = SecretHexBytes<N>;

            fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(fmt, "{} lowercase hexadecimal characters", N * 2)
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                value.parse().map_err(E::custom)
            }
        }

        deserializer.deserialize_str(SecretHexVisitor)
    }
}

/// A command-line value parser for a secret, refusing without echoing the value.
///
/// clap's adapter for a parse function echoes the rejected text in its error. This one renders a
/// [`ParseSecretHexError`] and names the argument alone.
#[derive(Debug)]
pub(crate) struct SecretHexBytesValueParser<T, const N: usize> {
    _marker: PhantomData<fn() -> (T, SecretHexBytes<N>)>,
}

impl<T, const N: usize> SecretHexBytesValueParser<T, N> {
    /// Creates the parser.
    pub(crate) fn new() -> Self {
        Self {
            _marker: PhantomData,
        }
    }
}

impl<T, const N: usize> TypedValueParser for SecretHexBytesValueParser<T, N>
where
    T: From<SecretHexBytes<N>> + Send + Sync + Clone + 'static,
{
    type Value = T;

    fn parse_ref(
        &self,
        cmd: &clap::Command,
        arg: Option<&clap::Arg>,
        value: &std::ffi::OsStr,
    ) -> Result<Self::Value, clap::Error> {
        SecretHexBytes::from_encoded_bytes(value.as_encoded_bytes())
            .map(T::from)
            .map_err(|error| {
                let argument = arg.map_or_else(|| "...".to_owned(), ToString::to_string);
                clap::Error::raw(
                    clap::error::ErrorKind::ValueValidation,
                    format!("invalid value for '{argument}': {error}"),
                )
                .with_cmd(cmd)
            })
    }
}

impl<T, const N: usize> Copy for SecretHexBytesValueParser<T, N> {}

impl<T, const N: usize> Clone for SecretHexBytesValueParser<T, N> {
    fn clone(&self) -> Self {
        *self
    }
}

#[cfg(test)]
mod tests {
    use core::str::FromStr as _;

    use super::{ParseSecretHexError, SecretHexBytes, SecretString};

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
    fn hex_secret_renderings() {
        let secret =
            SecretHexBytes::<32>::from_str(HEX).expect("the literal is the canonical form");

        assert_redacted(&format!("{secret:?}"), HEX);
        assert_redacted(&format!("{secret}"), HEX);
    }

    /// Neither rendering of a held string encodes its characters.
    #[test]
    fn string_secret_renderings() {
        const VALUE: &str = "postgres://atlas:hunter2@10.0.0.7:5432/graph";

        let secret = SecretString::from_str(VALUE).expect("the conversion cannot fail");

        assert_redacted(&format!("{secret:?}"), VALUE);
        assert_redacted(&format!("{secret}"), VALUE);
    }

    /// A refused secret's error names the offset and none of the input's characters.
    #[test]
    fn hex_secret_refusal_uppercase() {
        let uppercase = HEX.to_ascii_uppercase();

        let error = SecretHexBytes::<32>::from_str(&uppercase).expect_err("uppercase hex refuses");
        let rendered = error.to_string();

        assert_eq!(error, ParseSecretHexError::Character { index: 1 });
        for character in uppercase.chars() {
            assert!(
                !rendered.contains(&format!("'{character}'")),
                "a character of the input reached the error: {rendered}"
            );
        }
    }
}
