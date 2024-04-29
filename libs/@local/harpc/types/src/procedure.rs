#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "proptest", derive(test_strategy::Arbitrary))]
pub struct ProcedureId(u16);

impl ProcedureId {
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
