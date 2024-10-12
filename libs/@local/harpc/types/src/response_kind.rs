use core::num::NonZero;

use crate::error_code::ErrorCode;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[cfg_attr(feature = "proptest", derive(test_strategy::Arbitrary))]
pub enum ResponseKind {
    Ok,
    Err(ErrorCode),
}

impl ResponseKind {
    #[must_use]
    pub const fn is_ok(self) -> bool {
        matches!(self, Self::Ok)
    }

    #[must_use]
    pub const fn is_err(self) -> bool {
        matches!(self, Self::Err(_))
    }
}

impl From<u16> for ResponseKind {
    fn from(value: u16) -> Self {
        NonZero::new(value).map_or(Self::Ok, |value| Self::Err(ErrorCode::new(value)))
    }
}

impl AsRef<Self> for ResponseKind {
    fn as_ref(&self) -> &Self {
        self
    }
}

impl From<!> for ResponseKind {
    fn from(never: !) -> Self {
        never
    }
}

impl From<ResponseKind> for u16 {
    fn from(kind: ResponseKind) -> Self {
        match kind {
            ResponseKind::Ok => 0,
            ResponseKind::Err(code) => code.value().get(),
        }
    }
}
