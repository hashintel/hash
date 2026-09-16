//! One rendered `source -> target` example pair.

use core::{fmt, fmt::Display};

use super::phrase::Phrase;

/// One rendered example pair.
pub(crate) struct Example<'text> {
    /// The source endpoint.
    pub source: Phrase<'text>,
    /// The target endpoint.
    pub target: Phrase<'text>,
}

impl Display for Example<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self { source, target } = self;

        write!(fmt, "{source} -> {target}")
    }
}
