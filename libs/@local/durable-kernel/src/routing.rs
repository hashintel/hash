//! Shard IDs in the fixed range `0..256`. Domains choose how to map their keys to these IDs.

use core::fmt;

pub const SHARD_COUNT: u16 = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Shard(u8);

impl Shard {
    #[must_use]
    pub const fn get(self) -> u8 {
        self.0
    }
}

impl Shard {
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct InvalidShard {
    pub value: u16,
}

impl fmt::Display for InvalidShard {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "shard {} is outside routing-v1 range 0..{}",
            self.value, SHARD_COUNT
        )
    }
}

impl core::error::Error for InvalidShard {}

/// Fixed-width path segment for one shard, shared by every key layout.
#[must_use]
pub fn shard_path(shard: Shard) -> String {
    format!("{:03x}", shard.get())
}

#[cfg(test)]
mod tests {
    use super::*;

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
