use core::sync::atomic::{AtomicU8, Ordering};

use crate::Style;

#[derive(Debug, Copy, Clone, Default)]
#[non_exhaustive]
pub enum Delimiter {
    #[default]
    Colon,
    Semicolon,
}

impl Delimiter {
    const fn from_u8(value: u8) -> Self {
        match value {
            0 => Self::Colon,
            1 => Self::Semicolon,
            // should never happen, delegate to the default
            _ => Self::Colon,
        }
    }

    const fn into_u8(self) -> u8 {
        match self {
            Self::Colon => 0,
            Self::Semicolon => 1,
        }
    }

    fn load() -> Self {
        Self::from_u8(DELIMITER.load(Ordering::Relaxed))
    }

    fn store(self) {
        DELIMITER.store(self.into_u8(), Ordering::Relaxed);
    }
}

static DELIMITER: AtomicU8 = AtomicU8::new(Delimiter::Colon.into_u8());

// TODO: rename
#[derive(Debug, Copy, Clone, Default)]
#[non_exhaustive]
pub enum Compliance {
    #[default]
    Iso,
    XTerm,
}

impl Compliance {
    const fn from_u8(value: u8) -> Self {
        match value {
            0 => Self::Iso,
            1 => Self::XTerm,
            // should never happen, delegate to the default
            _ => Self::Iso,
        }
    }

    const fn into_u8(self) -> u8 {
        match self {
            Self::Iso => 0,
            Self::XTerm => 1,
        }
    }

    fn load() -> Self {
        Self::from_u8(COMPLIANCE.load(Ordering::Relaxed))
    }

    fn store(self) {
        COMPLIANCE.store(self.into_u8(), Ordering::Relaxed);
    }
}

static COMPLIANCE: AtomicU8 = AtomicU8::new(Compliance::Iso.into_u8());

impl Style {
    pub fn set_delimiter(delimiter: Delimiter) {
        delimiter.store();
    }

    pub fn set_compliance(compliance: Compliance) {
        compliance.store();
    }
}
