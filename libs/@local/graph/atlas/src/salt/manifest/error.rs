use core::{error::Error, fmt};

/// Invalid required manifest field or canonical serialization failure.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum ManifestError {
    MissingText {
        field: &'static str,
    },
    InvalidFinite {
        field: &'static str,
        value: f64,
    },
    InvalidFraction {
        field: &'static str,
        value: f64,
    },
    InvalidInvariant {
        field: &'static str,
        expected: &'static str,
    },
    LandmarkCapacity {
        actual: usize,
        maximum: usize,
    },
    VariantCount {
        declared: usize,
        entries: usize,
        maximum: usize,
    },
    MissingCanonicalVariant,
    DuplicateVariant,
    DuplicateSeed,
    Serialization,
}

impl fmt::Display for ManifestError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingText { field } => {
                write!(
                    formatter,
                    "required manifest field `{field}` is empty or unpinned"
                )
            }
            Self::InvalidFinite { field, value } => {
                write!(
                    formatter,
                    "manifest field `{field}` must be finite, got {value}"
                )
            }
            Self::InvalidFraction { field, value } => write!(
                formatter,
                "manifest field `{field}` must be a finite fraction in [0, 1], got {value}"
            ),
            Self::InvalidInvariant { field, expected } => {
                write!(formatter, "manifest field `{field}` must be {expected}")
            }
            Self::LandmarkCapacity { actual, maximum } => write!(
                formatter,
                "actual landmark count {actual} exceeds configured maximum {maximum}"
            ),
            Self::VariantCount {
                declared,
                entries,
                maximum,
            } => write!(
                formatter,
                "manifest declares {declared} variants, contains {entries}, and permits at most \
                 {maximum}"
            ),
            Self::MissingCanonicalVariant => {
                formatter.write_str("canonical variant has no matching entry")
            }
            Self::DuplicateVariant => formatter.write_str("variant identifiers are not unique"),
            Self::DuplicateSeed => formatter.write_str("reproducibility seed names are not unique"),
            Self::Serialization => {
                formatter.write_str("manifest could not be serialized canonically")
            }
        }
    }
}

impl Error for ManifestError {}
