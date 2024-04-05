use crate::version::Version;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "proptest", derive(test_strategy::Arbitrary))]
pub struct ServiceVersion(Version);

impl ServiceVersion {
    #[must_use]
    pub const fn new(major: u8, minor: u8) -> Self {
        Self(Version { major, minor })
    }

    #[must_use]
    pub const fn value(self) -> Version {
        self.0
    }

    #[must_use]
    pub const fn major(self) -> u8 {
        self.0.major
    }

    #[must_use]
    pub const fn minor(self) -> u8 {
        self.0.minor
    }
}

impl From<Version> for ServiceVersion {
    fn from(version: Version) -> Self {
        Self(version)
    }
}
