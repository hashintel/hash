use core::fmt::{self, Display, Formatter};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "proptest", derive(test_strategy::Arbitrary))]
pub struct Version {
    pub major: u8,
    pub minor: u8,
}

impl Version {
    #[must_use]
    pub const fn into_requirement(self) -> Requirement {
        Requirement::new(self)
    }
}

impl Display for Version {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        let Self { major, minor } = self;

        write!(fmt, "v{major}.{minor}")
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Requirement(Version);

impl Requirement {
    #[must_use]
    pub const fn new(version: Version) -> Self {
        Self(version)
    }

    #[must_use]
    pub const fn compatible(self, version: Version) -> bool {
        self.0.major == version.major && self.0.minor <= version.minor
    }
}
