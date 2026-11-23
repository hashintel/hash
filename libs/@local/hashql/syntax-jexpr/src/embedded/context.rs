use core::ops::Range;

use hashql_core::{
    heap::Heap,
    span::{SpanAncestors, SpanId, SpanTable, TextRange, TextSize},
};
use winnow::{LocatingSlice, Stateful};

use crate::{lexer::RawOffsets, span::Span};

#[derive(Debug)]
pub(crate) struct Context<'heap, 'spans> {
    pub heap: &'heap Heap,
    pub spans: &'spans mut SpanTable<Span>,
    pub parent: SpanId,
    /// Maps offsets in the parsed string, which is decoded, to its source.
    pub offsets: RawOffsets,
    /// Number of types and index expressions open around the current position.
    pub depth: u16,
}

impl Context<'_, '_> {
    /// Range of `range` in the source, relative to the opening quote of the string.
    fn text_range(&self, range: Range<usize>) -> TextRange {
        TextRange::new(
            TextSize::from(self.offsets.raw(range.start)),
            TextSize::from(self.offsets.raw(range.end)),
        )
    }

    pub(crate) fn span(&mut self, range: Range<usize>) -> SpanId {
        self.spans.insert(
            Span::new(self.text_range(range)),
            SpanAncestors::union(&[self.parent]),
        )
    }

    pub(crate) fn cover(&mut self, span: SpanId, range: Range<usize>) {
        let range = self.text_range(range);

        self.spans.update(span, |span, _| {
            span.range = span.range.cover(range);
        });
    }
}

pub(crate) type Input<'heap, 'span, 'source> =
    Stateful<LocatingSlice<&'source str>, Context<'heap, 'span>>;
