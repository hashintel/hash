use text_size::TextRange;

use crate::source::SourceId;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Span {
    pub source: SourceId,
    pub range: TextRange,
}
