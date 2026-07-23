//! Canonical lowercase hexadecimal text encoding for fixed-width values.

use alloc::borrow::Cow;
use core::{array, error::Error, fmt, str::FromStr};

/// A string that is not canonical lowercase hexadecimal of the expected width.
#[derive(Debug)]
pub enum ParseHexError {
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
        /// The offending byte.
        byte: u8,
    },
}

impl fmt::Display for ParseHexError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Length { expected, actual } => write!(
                fmt,
                "hexadecimal value contains {actual} characters; expected {expected}"
            ),
            Self::Character { index, byte } => {
                if byte.is_ascii_graphic() {
                    write!(
                        fmt,
                        "hexadecimal value contains non-lowercase-hex character '{}' at offset \
                         {index}",
                        char::from(*byte)
                    )
                } else {
                    write!(
                        fmt,
                        "hexadecimal value contains byte 0x{byte:02x} at offset {index}"
                    )
                }
            }
        }
    }
}

impl Error for ParseHexError {}

const fn decode_nibble(byte: u8, index: usize) -> Result<u8, ParseHexError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        _ => Err(ParseHexError::Character { index, byte }),
    }
}

/// A fixed-width byte string with a canonical lowercase hexadecimal text form.
///
/// Every fixed-width integrity value (digests, signatures, public keys) is a newtype over this: the
/// text, JSON, and [`fmt::Debug`] forms are `2 · N` lowercase hexadecimal characters, and parsing
/// is the strict inverse. A string that parses is the unique encoding of its value, so text
/// round-trips are byte-identical.
#[derive(
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::ByteHash,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct HexBytes<const N: usize>([u8; N]);

impl<const N: usize> HexBytes<N> {
    /// Creates a value from its raw bytes.
    #[must_use]
    #[inline]
    pub(crate) const fn new(bytes: [u8; N]) -> Self {
        Self(bytes)
    }

    /// Returns the raw bytes.
    #[must_use]
    #[inline]
    pub(crate) const fn into_inner(self) -> [u8; N] {
        self.0
    }
}

impl<const N: usize> fmt::Debug for HexBytes<N> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(fmt, "\"{self}\"")
    }
}

impl<const N: usize> fmt::Display for HexBytes<N> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        for byte in self.0 {
            write!(fmt, "{byte:02x}")?;
        }
        Ok(())
    }
}

impl<const N: usize> FromStr for HexBytes<N> {
    type Err = ParseHexError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let bytes = value.as_bytes();
        if bytes.len() != N * 2 {
            return Err(ParseHexError::Length {
                expected: N * 2,
                actual: bytes.len(),
            });
        }

        let (pairs, _) = bytes.as_chunks::<2>();

        let decoded = array::try_from_fn(|index| {
            let [high_char, low_char] = pairs[index];

            let high = decode_nibble(high_char, index * 2)?;
            let low = decode_nibble(low_char, index * 2 + 1)?;
            Ok((high << 4) | low)
        })?;

        Ok(Self(decoded))
    }
}

impl<const N: usize> serde::Serialize for HexBytes<N> {
    #[inline]
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.collect_str(self)
    }
}

impl<'de, const N: usize> serde::Deserialize<'de> for HexBytes<N> {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct HexVisitor<const N: usize>;

        impl<const N: usize> serde::de::Visitor<'_> for HexVisitor<N> {
            type Value = HexBytes<N>;

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

        deserializer.deserialize_str(HexVisitor)
    }
}

impl<const N: usize> schemars::JsonSchema for HexBytes<N> {
    fn schema_name() -> Cow<'static, str> {
        Cow::Borrowed("HexBytes")
    }

    fn json_schema(_: &mut schemars::SchemaGenerator) -> schemars::Schema {
        schemars::json_schema!({
            "type": "string",
            "pattern": format!("^[0-9a-f]{{{}}}$", N * 2)
        })
    }
}

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use super::{HexBytes, ParseHexError};

    #[test]
    fn round_trip() {
        let value: HexBytes<4> = "00ff10ab"
            .parse()
            .expect("should parse canonical lowercase hexadecimal");
        assert_eq!(value.into_inner(), [0x00, 0xFF, 0x10, 0xAB]);
        assert_eq!(value.to_string(), "00ff10ab");
        assert_eq!(format!("{value:?}"), "\"00ff10ab\"");
    }

    #[test]
    fn rejects_noncanonical_input() {
        assert_matches!(
            "00FF".parse::<HexBytes<2>>(),
            Err(ParseHexError::Character {
                index: 2,
                byte: b'F'
            })
        );

        assert_matches!(
            "00ff10".parse::<HexBytes<2>>(),
            Err(ParseHexError::Length {
                expected: 4,
                actual: 6
            })
        );
    }
}
