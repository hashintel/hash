//! Relation-index construction errors.

use core::{error::Error, fmt};

use type_system::knowledge::entity::id::EntityId;

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
    DuplicateLinkEntity {
        link_entity: EntityId,
    },
    MissingGeometryEndpoint {
        entity: EntityId,
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
    InvalidForcePruningThreshold {
        value: f64,
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
            Self::DuplicateLinkEntity { link_entity } => {
                write!(
                    formatter,
                    "relation link entity {link_entity} occurs more than once"
                )
            }
            Self::MissingGeometryEndpoint { entity } => write!(
                formatter,
                "security-admitted relation endpoint {entity} has no generation row"
            ),
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
            Self::InvalidForcePruningThreshold { value } => write!(
                formatter,
                "attraction-force pruning threshold must be finite and non-negative, got {value}"
            ),
        }
    }
}

impl Error for RelationIndexError {}
