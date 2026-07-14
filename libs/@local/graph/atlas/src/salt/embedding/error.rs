//! Relation-card embedding errors.

use core::{error::Error, fmt};

/// A card embedding cache or provider failed, or returned invalid data.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum CardEmbeddingError {
    CacheRead,
    CacheWrite,
    Generation,
    UnexpectedCount {
        expected: usize,
        actual: usize,
    },
    InvalidDimensions {
        card_index: usize,
        expected: usize,
        actual: usize,
    },
    NonFinite {
        card_index: usize,
        component: usize,
    },
}

impl fmt::Display for CardEmbeddingError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::CacheRead => formatter.write_str("relation-card embedding cache read failed"),
            Self::CacheWrite => formatter.write_str("relation-card embedding cache write failed"),
            Self::Generation => formatter.write_str("relation-card embedding generation failed"),
            Self::UnexpectedCount { expected, actual } => write!(
                formatter,
                "embedding provider returned {actual} rows; expected {expected}"
            ),
            Self::InvalidDimensions {
                card_index,
                expected,
                actual,
            } => write!(
                formatter,
                "card {card_index} embedding contains {actual} components; expected {expected}"
            ),
            Self::NonFinite {
                card_index,
                component,
            } => write!(
                formatter,
                "card {card_index} embedding component {component} is not finite"
            ),
        }
    }
}

impl Error for CardEmbeddingError {}
