//! Relation-card validation and rendering errors.

use core::{error::Error, fmt};

/// A card could not be rendered under its canonical contract.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum CardError {
    InvalidBudgets { target: usize, hard: usize },
    TokenCount(TokenCountError),
    ForbiddenUrl,
    ForbiddenUuid,
    ForbiddenIdentifier { identifier: String },
}

impl From<TokenCountError> for CardError {
    #[inline]
    fn from(error: TokenCountError) -> Self {
        Self::TokenCount(error)
    }
}

impl fmt::Display for CardError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidBudgets { target, hard } => write!(
                formatter,
                "card token budgets must satisfy 0 < target <= hard, got {target} and {hard}"
            ),
            Self::TokenCount(error) => error.fmt(formatter),
            Self::ForbiddenUrl => formatter.write_str("relation card contains a forbidden URL"),
            Self::ForbiddenUuid => formatter.write_str("relation card contains a forbidden UUID"),
            Self::ForbiddenIdentifier { identifier } => write!(
                formatter,
                "relation card contains the forbidden source identifier {identifier}"
            ),
        }
    }
}

impl Error for CardError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::TokenCount(error) => Some(error),
            Self::InvalidBudgets { .. }
            | Self::ForbiddenUrl
            | Self::ForbiddenUuid
            | Self::ForbiddenIdentifier { .. } => None,
        }
    }
}

/// Text cannot be counted by the configured encoding.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum TokenCountError {
    ReservedToken { token: &'static str },
}

impl fmt::Display for TokenCountError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ReservedToken { token } => {
                write!(formatter, "relation card contains reserved token {token}")
            }
        }
    }
}

impl Error for TokenCountError {}
