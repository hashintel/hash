use core::fmt::Display;
use std::sync::Arc;

use text_size::TextRange;

#[derive(Debug, Clone, PartialEq, Eq, Default, thiserror::Error)]
pub enum LexingError {
    #[error("malformed JSON string: {0}")]
    String(Arc<hifijson::str::Error>),

    #[error("malformed JSON number: {0:?}")]
    Number(Arc<hifijson::num::Error>),

    #[error("unrecognized character")]
    #[default]
    UnrecognizedCharacter,
}

impl From<hifijson::str::Error> for LexingError {
    fn from(error: hifijson::str::Error) -> Self {
        Self::String(Arc::new(error))
    }
}

impl From<hifijson::num::Error> for LexingError {
    fn from(error: hifijson::num::Error) -> Self {
        Self::Number(Arc::new(error))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Location(TextRange);

impl Location {
    #[must_use]
    pub const fn new(range: TextRange) -> Self {
        Self(range)
    }

    #[must_use]
    pub const fn value(self) -> TextRange {
        self.0
    }
}

impl Display for Location {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(
            f,
            "at {} .. {}",
            u32::from(self.0.start()),
            u32::from(self.0.end())
        )
    }
}
