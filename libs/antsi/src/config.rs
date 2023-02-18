//! # Configuration
//!
//! There are two predominant "industry" standards when it comes to parameters, parameters are used
//! where one needs to specify more than a single instruction, this is predominately used for
//! advanced colors, like [`crate::IndexedColor`], or [`crate::RgbColor`].
//!
//! The two differences across implementations are:
//! * [`Delimiter`]
//! * [`Compliance`]
//!
//! For more information please look at the respective documentation. `antsi` uses
//! [`Delimiter::Colon`] and [`Compliance::Iso`] as default in all documentation.
use core::sync::atomic::{AtomicU8, Ordering};

use crate::Style;

/// The delimiter used for parameters
///
/// [`ISO 8613-6`] specifies `:` (`3/10`) as a separator for parameters, but the first
/// implementation in xterm used `;` (`3/11`), for a reasoning as to why please take a look at the
/// detailed explanation in the [xterm repository].
///
/// Modern terminal emulators like [`wezterm`], [`alacritty`], [`mintty`] or [`kitty`]
/// support both, with an explicit preference for the separator specified in [`ISO 8613-6`].
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

/// Parameter compliance
///
/// [`ISO 8613-6`] specifies additional fields to the ones commonly used for `Rgb` (and others),
/// this includes:
/// * `color space identifier` (parameter 2)
/// * `tolerance value` (parameter 7)
/// * `color space of tolerance value` (parameter 8)
///
/// [`ISO 8613-6`] has left these parameters (except for their existence) completely unspecified.
/// Terminal emulators that support the extended format ignore any value that is present there or
/// only accept no value. [`Compliance::Iso`] will output a SGR code that has these values present,
/// but empty (adding addition `:` or `;` depending on [`Delimiter`]), while [`Compliance::XTerm`]
/// will ignore those fields.
///
/// [`ISO 8613-6`] also specifies that optional fields at the end (like `tolerance value` and `color
/// space of tolerance value`) do not need to be included in the parameter string if they are empty.
/// Therefore `ESC[38:2::255:0:0m` is the same as `ESC[38:2::255:0:0::m`, to increase compatability
/// with existing terminal emulators `antsi` chooses the first variant.
///
/// ## Example
///
/// [`Compliance::Iso`]: `Foreground::new(Rgb::new(255, 0, 0))` -> `ESC[38:2::255:0:0m`
/// [`Compliance::Xterm`]: `Foreground::new(Rgb::new(255, 0, 0))` -> `ESC[38:2:255:0:0m`
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
