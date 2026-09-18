//! Validates shard IDs in the fixed range `0..256`.
//!
//! [`Shard`] checks numeric IDs and [`shard_path`] formats them for storage paths. Application
//! domains route partition keys through [`crate::domain::shard_of`].

pub const SHARD_COUNT: core::num::NonZeroU16 =
    core::num::NonZeroU16::new(256).expect("shard count should be nonzero");

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Shard(u8);

impl Shard {
    #[must_use]
    pub const fn get(self) -> u8 {
        self.0
    }

    /// Every `u8` is a valid shard because the routing range is exactly `0..256`.
    #[must_use]
    pub const fn from_u8(value: u8) -> Self {
        Self(value)
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
#[display("shard {value} is outside routing-v1 range 0..{SHARD_COUNT}")]
pub struct InvalidShard {
    pub value: u16,
}

/// Fixed-width path segment for one shard, shared by every key layout.
#[must_use]
pub fn shard_path(shard: Shard) -> String {
    format!("{:03x}", shard.get())
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
        let value = u16::from_str_radix(value, 16).map_err(|_invalid| InvalidShardText)?;
        Self::try_from(value).map_err(|_invalid| InvalidShardText)
    }
}
impl serde::Serialize for Shard {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&shard_path(*self))
    }
}
impl<'de> serde::Deserialize<'de> for Shard {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = <String as serde::Deserialize>::deserialize(deserializer)?;
        value.parse().map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::{InvalidShard, Shard, shard_path};

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
    fn shard_range_is_closed_and_path_is_fixed_width() {
        assert_eq!(
            Shard::try_from(0)
                .expect("minimum shard should be valid")
                .get(),
            0
        );
        assert_eq!(
            Shard::try_from(255)
                .expect("maximum shard should be valid")
                .get(),
            255
        );
        assert_eq!(Shard::try_from(256), Err(InvalidShard { value: 256 }));
        assert_eq!(
            shard_path(Shard::try_from(0).expect("minimum shard should be valid")),
            "000"
        );
        assert_eq!(
            shard_path(Shard::try_from(255).expect("maximum shard should be valid")),
            "0ff"
        );
    }
}
