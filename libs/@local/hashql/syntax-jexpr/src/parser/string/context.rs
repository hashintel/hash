use core::ops::Range;

use hashql_ast::heap::Heap;
use hashql_core::span::{SpanId, TextRange, TextSize, storage::SpanStorage};
use winnow::{LocatingSlice, Stateful};

use crate::span::Span;

#[derive(Debug, Copy, Clone)]
pub(crate) struct Context<'heap, 'span> {
    pub heap: &'heap Heap,
    pub spans: &'span SpanStorage<Span>,
    pub parent: SpanId,
}

impl Context<'_, '_> {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "The lexer ensures that we never have more than 4GiB of text"
    )]
    pub(crate) fn span(&self, range: Range<usize>) -> SpanId {
        // `+ 1` here to offset the opening quote
        self.spans.insert(Span {
            range: TextRange::new(
                TextSize::from((range.start + 1) as u32),
                TextSize::from((range.end + 1) as u32),
            ),
            pointer: None,
            parent_id: Some(self.parent),
        })
    }
}

pub(crate) type Input<'heap, 'span, 'source> =
    Stateful<LocatingSlice<&'source str>, Context<'heap, 'span>>;
