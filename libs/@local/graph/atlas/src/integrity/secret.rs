use core::{fmt, ops::Deref, str::FromStr};

use zerocopy::IntoBytes as _;
use zeroize::Zeroize as _;

use super::{ParseHexError, hex::HexBytes};

/// An `N`-byte secret configured in the canonical hexadecimal encoding.
///
/// Key-material hygiene by construction: the bytes zero on drop, and no path encodes them back
/// out - [`fmt::Debug`] prints the width alone, [`fmt::Display`] a fixed placeholder, and the
/// type has no `Serialize` - so a held secret cannot leak through logging or document dumps.
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
