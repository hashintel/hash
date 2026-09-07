use core::{fmt, fmt::Display};

use super::phrase::Phrase;

/// One rendered example pair.
pub(crate) struct Example<'text> {
    pub source: Phrase<'text>,
    pub target: Phrase<'text>,
}

impl Display for Example<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self { source, target } = self;

        write!(fmt, "{source} -> {target}")
    }
}
