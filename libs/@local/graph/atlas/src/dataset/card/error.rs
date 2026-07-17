//! Relation-card rendering and linting errors.

use core::{error::Error, fmt};

/// Card text contains a datasource identifier or database key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum IdentifierLeakError {
    /// The text embeds a URL scheme.
    Url,

    /// The text embeds a UUID.
    Uuid,

    /// The text embeds a caller-supplied source identifier.
    SourceIdentifier { identifier: String },
}

impl fmt::Display for IdentifierLeakError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Url => formatter.write_str("relation card contains a forbidden URL"),
            Self::Uuid => formatter.write_str("relation card contains a forbidden UUID"),
            Self::SourceIdentifier { identifier } => write!(
                formatter,
                "relation card contains the forbidden source identifier {identifier}"
            ),
        }
    }
}

impl Error for IdentifierLeakError {}

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

/// A card could not be rendered under its canonical contract.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum CardError {
    TokenCount(TokenCountError),
    IdentifierLeak(IdentifierLeakError),
}

impl From<TokenCountError> for CardError {
    #[inline]
    fn from(error: TokenCountError) -> Self {
        Self::TokenCount(error)
    }
}

impl From<IdentifierLeakError> for CardError {
    #[inline]
    fn from(error: IdentifierLeakError) -> Self {
        Self::IdentifierLeak(error)
    }
}

impl fmt::Display for CardError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TokenCount(error) => error.fmt(formatter),
            Self::IdentifierLeak(error) => error.fmt(formatter),
        }
    }
}

impl Error for CardError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::TokenCount(error) => Some(error),
            Self::IdentifierLeak(error) => Some(error),
        }
    }
}
