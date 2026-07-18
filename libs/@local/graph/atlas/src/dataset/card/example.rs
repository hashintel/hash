use core::fmt::Display;

use super::phrase::Phrase;

pub(crate) struct Example<'text> {
    source: Phrase<'text>,
    target: Phrase<'text>,
}

impl<'text> Display for Example<'text> {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        let Self { source, target } = self;
        write!(fmt, "{} -> {}", source, target)
    }
}
