use core::fmt::Display;

use crate::version::Version;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "proptest", derive(test_strategy::Arbitrary))]
pub struct ServiceId(u16);

impl ServiceId {
    #[must_use]
    pub const fn new(value: u16) -> Self {
        Self(value)
    }

    #[must_use]
    pub const fn value(self) -> u16 {
        self.0
    }

    #[must_use]
    pub const fn is_reserved(self) -> bool {
        // 0xFxxx are reserved for internal use
        self.0 & 0xF000 == 0xF000
    }
}

impl Display for ServiceId {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        let Self(value) = self;

        write!(fmt, "{value:#06X}")
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "proptest", derive(test_strategy::Arbitrary))]
pub struct ServiceDescriptor {
    pub id: ServiceId,
    pub version: Version,
}

impl Display for ServiceDescriptor {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        let &Self { id, version } = self;

        write!(fmt, "{id}@{version}",)
    }
}
