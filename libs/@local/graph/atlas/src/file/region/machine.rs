//! The machine information every file header carries.
//!
//! Every format's header opens with the same prefix. The magic comes first, then the layout
//! version, then this information. The writer stamps [`Machine::current`]. A format whose regions
//! store the writer's native byte order compares the stamped [`Architecture`] against
//! [`Architecture::HOST`] at open, so a file carried across byte orders refuses at the header
//! instead of serving reinterpreted values. That check is what lets a record store its numbers
//! in native order and still be a mapped read on the machine that wrote it. A format whose
//! fields all pin a byte order stamps the same information and compares nothing, because its
//! bytes are exact on either host.
//!
//! The information is four bytes. One bit names the byte order today, and the rest read as zero
//! and stay reserved for further facts about the writing machine. A reader ignores bits it does
//! not speak, so stamping a new fact is a layout-version decision for the format that wants to
//! rely on it.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use core::fmt;

/// A writer byte order.
#[derive(Debug, Copy, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Architecture {
    /// Low-order byte first.
    LittleEndian,
    /// High-order byte first.
    BigEndian,
}

impl Architecture {
    /// This host's byte order.
    pub(crate) const HOST: Self = if cfg!(target_endian = "big") {
        Self::BigEndian
    } else {
        Self::LittleEndian
    };
}

impl fmt::Display for Architecture {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str(match self {
            Self::LittleEndian => "little-endian",
            Self::BigEndian => "big-endian",
        })
    }
}

/// The persisted description of the machine that wrote a file.
///
/// Bit 0 of the final byte records the writer's byte order. The remaining bits read as zero and
/// stay reserved, and every bit pattern parses, so an unknown bit never refuses a file by itself.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::Unaligned,
)]
#[repr(transparent)]
pub(crate) struct Machine([u8; 4]);

impl Machine {
    /// The word this host writes.
    #[must_use]
    pub(crate) const fn current() -> Self {
        let mut bytes = [0_u8; 4];
        bytes[3] |= Architecture::HOST as u8;

        Self(bytes)
    }

    /// Returns the byte order the file's writer stamped.
    #[must_use]
    pub(crate) const fn architecture(self) -> Architecture {
        let is_big = self.0[3] & 0b0000_0001;

        if is_big != 0 {
            Architecture::BigEndian
        } else {
            Architecture::LittleEndian
        }
    }
}
