//! Artifact mapping and validation errors.

use core::{error::Error, fmt};
use std::io;

use camino::Utf8PathBuf;

use super::{ArtifactFormat, ScalarType, SectionId};
use crate::salt::hash::ContentHash;

/// A section requested with the wrong scalar type.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct SectionTypeError {
    pub section: SectionId,
    pub expected: ScalarType,
    pub actual: ScalarType,
}

impl fmt::Display for SectionTypeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "section {} stores {:?}, requested {:?}",
            self.section.as_u16(),
            self.actual,
            self.expected
        )
    }
}

impl Error for SectionTypeError {}

/// A failure to map or validate an artifact.
#[derive(Debug)]
pub(crate) enum ArtifactMapError {
    Io(io::Error),
    Format(ArtifactFormatError),
}

impl fmt::Display for ArtifactMapError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "could not map artifact: {error}"),
            Self::Format(error) => error.fmt(formatter),
        }
    }
}

impl Error for ArtifactMapError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Format(error) => Some(error),
        }
    }
}

/// A failure to encode or atomically publish an immutable artifact.
#[derive(Debug)]
pub(crate) enum ArtifactWriteError {
    Io(io::Error),
    Persist(tempfile::PersistError),
    EmptySections,
    TooManySections { count: usize, maximum: u32 },
    InvalidSection { index: usize, error: SectionError },
    ExistingArtifactMismatch { path: Utf8PathBuf },
    Map(ArtifactMapError),
}

impl fmt::Display for ArtifactWriteError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "could not write artifact: {error}"),
            Self::Persist(error) => write!(formatter, "could not publish artifact: {error}"),
            Self::EmptySections => formatter.write_str("artifact requires at least one section"),
            Self::TooManySections { count, maximum } => {
                write!(
                    formatter,
                    "artifact has {count} sections; maximum is {maximum}"
                )
            }
            Self::InvalidSection { index, error } => {
                write!(
                    formatter,
                    "artifact output section {index} is invalid: {error}"
                )
            }
            Self::ExistingArtifactMismatch { path } => write!(
                formatter,
                "immutable artifact at {path} differs from the attempted publication"
            ),
            Self::Map(error) => error.fmt(formatter),
        }
    }
}

impl Error for ArtifactWriteError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Persist(error) => Some(error),
            Self::Map(error) => Some(error),
            Self::EmptySections
            | Self::TooManySections { .. }
            | Self::InvalidSection { .. }
            | Self::ExistingArtifactMismatch { .. } => None,
        }
    }
}

impl From<io::Error> for ArtifactWriteError {
    #[inline]
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

/// An invalid artifact encoding.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ArtifactFormatError {
    UnsupportedHostEndianness,
    Header(HeaderError),
    Section { index: u32, error: SectionError },
}

impl From<HeaderError> for ArtifactFormatError {
    #[inline]
    fn from(error: HeaderError) -> Self {
        Self::Header(error)
    }
}

impl fmt::Display for ArtifactFormatError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedHostEndianness => {
                formatter.write_str("little-endian artifacts require a little-endian host")
            }
            Self::Header(error) => write!(formatter, "invalid artifact header: {error}"),
            Self::Section { index, error } => {
                write!(formatter, "invalid artifact section {index}: {error}")
            }
        }
    }
}

impl Error for ArtifactFormatError {}

/// An invalid fixed header or section table boundary.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum HeaderError {
    TooShort {
        actual: usize,
    },
    InvalidLayout,
    Magic,
    Format {
        expected: ArtifactFormat,
        actual: ArtifactFormat,
    },
    ByteOrder {
        actual: u32,
    },
    HeaderBytes {
        actual: u32,
    },
    SectionCount {
        actual: u32,
        maximum: u32,
    },
    TotalBytes {
        declared: u64,
        actual: u64,
    },
    SectionTableOverflow,
    SectionTableTruncated,
    PayloadHash {
        expected: ContentHash,
        actual: ContentHash,
    },
    NonZeroPadding {
        offset: usize,
    },
    TrailingBytes {
        section_end: u64,
        total: u64,
    },
}

impl fmt::Display for HeaderError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TooShort { actual } => {
                write!(
                    formatter,
                    "header contains {actual} bytes; expected at least 64"
                )
            }
            Self::InvalidLayout => {
                formatter.write_str("fixed header does not match its 64-byte layout")
            }
            Self::Magic => formatter.write_str("magic bytes do not identify a SALT artifact"),
            Self::Format { expected, actual } => write!(
                formatter,
                "format is kind {} version {}; expected kind {} version {}",
                actual.kind.as_u16(),
                actual.version.as_u16(),
                expected.kind.as_u16(),
                expected.version.as_u16()
            ),
            Self::ByteOrder { actual } => {
                write!(formatter, "byte-order marker is 0x{actual:08x}")
            }
            Self::HeaderBytes { actual } => {
                write!(
                    formatter,
                    "fixed header declares {actual} bytes; expected 64"
                )
            }
            Self::SectionCount { actual, maximum } => {
                write!(formatter, "section count {actual} is outside 1..={maximum}")
            }
            Self::TotalBytes { declared, actual } => write!(
                formatter,
                "artifact declares {declared} bytes but mapping contains {actual}"
            ),
            Self::SectionTableOverflow => {
                formatter.write_str("section table size exceeds the address space")
            }
            Self::SectionTableTruncated => {
                formatter.write_str("section table extends beyond the artifact")
            }
            Self::PayloadHash { expected, actual } => {
                write!(formatter, "payload hash is {actual}; expected {expected}")
            }
            Self::NonZeroPadding { offset } => {
                write!(formatter, "header padding byte {offset} is nonzero")
            }
            Self::TrailingBytes { section_end, total } => write!(
                formatter,
                "last section ends at byte {section_end}, before artifact length {total}"
            ),
        }
    }
}

/// An invalid section descriptor or section range.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum SectionError {
    InvalidLayout,
    ZeroId,
    IdOrder { previous: u16, actual: u16 },
    UnknownScalar { actual: u8 },
    Rank { actual: u8 },
    Shape { axis: u8, value: u64 },
    Alignment { actual: u32 },
    Offset { minimum: u64, actual: u64 },
    PointerAlignment { alignment: u32 },
    LengthOverflow,
    Length { expected: u64, actual: u64 },
    Range { end: u64, total: u64 },
    NonZeroPadding { offset: usize },
}

impl fmt::Display for SectionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidLayout => {
                formatter.write_str("descriptor does not match its 48-byte layout")
            }
            Self::ZeroId => formatter.write_str("section identifier zero is reserved"),
            Self::IdOrder { previous, actual } => write!(
                formatter,
                "section identifier {actual} does not follow {previous}"
            ),
            Self::UnknownScalar { actual } => {
                write!(formatter, "scalar type {actual} is not supported")
            }
            Self::Rank { actual } => write!(formatter, "rank {actual} is outside 1..=3"),
            Self::Shape { axis, value } => {
                write!(formatter, "shape axis {axis} has invalid dimension {value}")
            }
            Self::Alignment { actual } => {
                write!(
                    formatter,
                    "alignment {actual} is not a supported power of two"
                )
            }
            Self::Offset { minimum, actual } => write!(
                formatter,
                "offset {actual} is unaligned or precedes byte {minimum}"
            ),
            Self::PointerAlignment { alignment } => write!(
                formatter,
                "mapped section address is not aligned to {alignment} bytes"
            ),
            Self::LengthOverflow => {
                formatter.write_str("section shape or range overflows its integer encoding")
            }
            Self::Length { expected, actual } => write!(
                formatter,
                "section contains {actual} bytes; shape and scalar require {expected}"
            ),
            Self::Range { end, total } => {
                write!(
                    formatter,
                    "section ends at byte {end}, beyond artifact length {total}"
                )
            }
            Self::NonZeroPadding { offset } => {
                write!(formatter, "section padding byte {offset} is nonzero")
            }
        }
    }
}
