//! Relation-index construction errors.

use core::{error::Error, fmt};

use crate::salt::identity::{ArtifactOrdinal, GenerationRowId};

/// Invalid relation policy, endpoint, coefficient, or degree state.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum RelationIndexError {
    EmptyGeneration,
    PolicyOrder {
        position: usize,
        ordinal: ArtifactOrdinal,
    },
    UnknownPolicy {
        ordinal: ArtifactOrdinal,
    },
    RowOutOfBounds {
        row: GenerationRowId,
        rows: usize,
    },
    DegreeOverflow {
        relation: ArtifactOrdinal,
        row: GenerationRowId,
    },
    InvalidProtectionOrdering,
    InvalidAttractionCoefficient {
        coincident: f64,
        proximal: f64,
    },
}

impl fmt::Display for RelationIndexError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyGeneration => {
                formatter.write_str("relation indexes require at least one generation row")
            }
            Self::PolicyOrder { position, ordinal } => write!(
                formatter,
                "relation policy position {position} stores ordinal {ordinal}"
            ),
            Self::UnknownPolicy { ordinal } => {
                write!(
                    formatter,
                    "relation policy ordinal {ordinal} is unavailable"
                )
            }
            Self::RowOutOfBounds { row, rows } => {
                write!(
                    formatter,
                    "relation endpoint row {row} is outside {rows} rows"
                )
            }
            Self::DegreeOverflow { relation, row } => write!(
                formatter,
                "relation degree for type {relation} and row {row} exceeds u32"
            ),
            Self::InvalidProtectionOrdering => formatter.write_str(
                "protection settings require ordinary floor <= hard floor and hard threshold <= \
                 ordinary threshold",
            ),
            Self::InvalidAttractionCoefficient {
                coincident,
                proximal,
            } => write!(
                formatter,
                "attraction coefficients must be finite with coincident >= 0 and proximal = 1; \
                 got {coincident} and {proximal}"
            ),
        }
    }
}

impl Error for RelationIndexError {}
