use core::fmt::{self, Display, Formatter};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "proptest", derive(test_strategy::Arbitrary))]
pub struct Version {
    pub major: u8,
    pub minor: u8,
}

impl Display for Version {
    fn fmt(&self, f: &mut Formatter<'_>) -> fmt::Result {
        let Self { major, minor } = self;

        write!(f, "v{major}.{minor}")
    }
}
