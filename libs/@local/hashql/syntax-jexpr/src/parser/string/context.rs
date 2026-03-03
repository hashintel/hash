use core::ops::Range;

use hashql_core::{
    heap::Heap,
    span::{SpanAncestors, SpanId, SpanTable, TextRange, TextSize},
};
use winnow::{LocatingSlice, Stateful};

use crate::span::Span;

#[expect(
    clippy::cast_possible_truncation,
    reason = "The lexer ensures that we never have more than 4GiB of text"
)]
fn range_to_text(range: Range<usize>) -> TextRange {
    TextRange::new(
        TextSize::from((range.start + 1) as u32),
        TextSize::from((range.end + 1) as u32),
    )
}

#[derive(Debug)]
pub(crate) struct Context<'heap, 'spans> {
    pub heap: &'heap Heap,
    pub spans: &'spans mut SpanTable<Span>,
    pub parent: SpanId,
}

impl Context<'_, '_> {
    pub(crate) fn span(&mut self, range: Range<usize>) -> SpanId {
        // `+ 1` here to offset the opening quote
        self.spans.insert(
            Span {
                range: range_to_text(range),
                pointer: None,
            },
            SpanAncestors::union(&[self.parent]),
        )
    }

    pub(crate) fn cover(&mut self, span: SpanId, range: Range<usize>) {
        self.spans.update(span, |span, _| {
            span.range = span.range.cover(range_to_text(range.clone()));
        });
    }
}

pub(crate) type Input<'heap, 'span, 'source> =
    Stateful<LocatingSlice<&'source str>, Context<'heap, 'span>>;
