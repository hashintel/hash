//! Defines one-byte shard IDs for routing-v1.
//!
//! Each namespace has 256 shard addresses, and a process can own any subset.
//! [`crate::domain::shard_of`] assigns a shard to each partition key.

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Shard(u8);

impl Shard {
    #[must_use]
    pub const fn get(self) -> u8 {
        self.0
    }

    #[must_use]
    pub const fn from_u8(value: u8) -> Self {
        Self(value)
    }

    /// Returns the three-digit hexadecimal shard path segment.
    #[must_use]
    pub fn path_segment(self) -> String {
        format!("{:03x}", self.get())
    }
}

impl TryFrom<u16> for Shard {
    type Error = InvalidShard;

    fn try_from(value: u16) -> Result<Self, Self::Error> {
        match u8::try_from(value) {
            Ok(value) => Ok(Self(value)),
            Err(_out_of_range) => Err(InvalidShard { value }),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("shard {value} does not fit in a routing-v1 one-byte ID")]
pub struct InvalidShard {
    pub value: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
#[display("shard must be three lowercase hexadecimal digits in 000..0ff")]
pub struct InvalidShardText;

impl core::str::FromStr for Shard {
    type Err = InvalidShardText;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        if value.len() != 3
            || !value
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(InvalidShardText);
        }
        let index = u16::from_str_radix(value, 16).unwrap_or_else(|_err| {
            unreachable!("three lowercase hexadecimal digits should parse as a u16")
        });
        Self::try_from(index).map_err(|_out_of_range| InvalidShardText)
    }
}
impl serde::Serialize for Shard {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.path_segment())
    }
}
impl<'de> serde::Deserialize<'de> for Shard {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let text = <String as serde::Deserialize>::deserialize(deserializer)?;
        text.parse().map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::{InvalidShard, Shard};

    #[test]
    fn shard_wire_roundtrip() {
        for value in 0..=255 {
            let shard = Shard::try_from(value).expect("shard should fit");
            let encoded = serde_json::to_string(&shard).expect("shard should serialize");
            assert_eq!(encoded, format!("\"{value:03x}\""));
            assert_eq!(
                serde_json::from_str::<Shard>(&encoded).expect("shard should deserialize"),
                shard
            );
        }
        for invalid in ["00F", "100", "0f", "0000", "xyz"] {
            serde_json::from_str::<Shard>(&format!("\"{invalid}\""))
                .expect_err("invalid shard text should be rejected");
        }
    }

    #[test]
    fn shard_out_of_range() {
        assert_eq!(Shard::try_from(256), Err(InvalidShard { value: 256 }));
    }
}
