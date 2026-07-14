//! Classifier artifact and inference errors.

use core::{error::Error, fmt};

use crate::salt::{
    policy::PosteriorError,
    storage::mmap::{ArtifactFormat, SectionId, SectionTypeError},
};

/// An invalid classifier artifact or prediction.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ClassifierError {
    Format {
        expected: ArtifactFormat,
        actual: ArtifactFormat,
    },
    SectionCount {
        expected: u32,
        actual: u32,
    },
    MissingSection {
        section: SectionId,
    },
    SectionType(SectionTypeError),
    Shape {
        section: SectionId,
        expected: [u64; 3],
        actual: [u64; 3],
    },
    ClassOrder,
    Posterior(PosteriorError),
    NonFinite {
        section: SectionId,
        index: usize,
    },
    NonPositive {
        section: SectionId,
        index: usize,
    },
    Negative {
        section: SectionId,
        index: usize,
    },
    Unsorted {
        section: SectionId,
        index: usize,
    },
    NonFiniteOutput,
}

impl From<SectionTypeError> for ClassifierError {
    #[inline]
    fn from(error: SectionTypeError) -> Self {
        Self::SectionType(error)
    }
}

impl fmt::Display for ClassifierError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Format { expected, actual } => write!(
                formatter,
                "classifier format is kind {} version {}; expected kind {} version {}",
                actual.kind.as_u16(),
                actual.version.as_u16(),
                expected.kind.as_u16(),
                expected.version.as_u16()
            ),
            Self::SectionCount { expected, actual } => write!(
                formatter,
                "classifier contains {actual} sections; expected {expected}"
            ),
            Self::MissingSection { section } => {
                write!(
                    formatter,
                    "classifier section {} is missing",
                    section.as_u16()
                )
            }
            Self::SectionType(error) => error.fmt(formatter),
            Self::Shape {
                section,
                expected,
                actual,
            } => write!(
                formatter,
                "classifier section {} has shape {actual:?}; expected {expected:?}",
                section.as_u16()
            ),
            Self::ClassOrder => {
                formatter.write_str("classifier class order must be coincident, proximal, overlay")
            }
            Self::Posterior(error) => write!(formatter, "classifier posterior is invalid: {error}"),
            Self::NonFinite { section, index } => write!(
                formatter,
                "classifier section {} contains a non-finite value at index {index}",
                section.as_u16()
            ),
            Self::NonPositive { section, index } => write!(
                formatter,
                "classifier section {} contains a non-positive value at index {index}",
                section.as_u16()
            ),
            Self::Negative { section, index } => write!(
                formatter,
                "classifier section {} contains a negative value at index {index}",
                section.as_u16()
            ),
            Self::Unsorted { section, index } => write!(
                formatter,
                "classifier section {} is descending at index {index}",
                section.as_u16()
            ),
            Self::NonFiniteOutput => {
                formatter.write_str("classifier inference produced a non-finite value")
            }
        }
    }
}

impl Error for ClassifierError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::SectionType(error) => Some(error),
            Self::Posterior(error) => Some(error),
            Self::Format { .. }
            | Self::SectionCount { .. }
            | Self::MissingSection { .. }
            | Self::Shape { .. }
            | Self::ClassOrder
            | Self::NonFinite { .. }
            | Self::NonPositive { .. }
            | Self::Negative { .. }
            | Self::Unsorted { .. }
            | Self::NonFiniteOutput => None,
        }
    }
}
