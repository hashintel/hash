#[derive(
    Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize,
)]
pub(crate) struct PayloadSize(u64);

impl PayloadSize {
    pub(crate) const fn new(value: u64) -> Self {
        Self(value)
    }

    #[must_use]
    pub const fn len(value: &[u8]) -> Self {
        Self(value.len() as u64)
    }

    #[must_use]
    #[allow(clippy::cast_possible_truncation)]
    pub const fn into_usize(self) -> usize {
        self.0 as usize
    }
}

impl PayloadSize {
    pub(crate) const fn exceeds(self, limit: u64) -> bool {
        self.0 > limit
    }
}

impl From<u64> for PayloadSize {
    fn from(value: u64) -> Self {
        Self(value)
    }
}

impl From<PayloadSize> for u64 {
    fn from(value: PayloadSize) -> Self {
        value.0
    }
}

impl From<PayloadSize> for usize {
    fn from(value: PayloadSize) -> Self {
        value.0 as usize
    }
}
