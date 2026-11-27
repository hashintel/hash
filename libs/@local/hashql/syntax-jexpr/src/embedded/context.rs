use core::{alloc::Allocator, fmt, ops::Range};

use hashql_core::{
    heap::Heap,
    span::{SpanAncestors, SpanId, SpanTable, TextRange, TextSize},
};
use winnow::{LocatingSlice, Stateful};

use crate::{ParserOptions, lexer::RawOffsets, span::Span};

pub(crate) struct Context<'heap, 'spans, A: Allocator> {
    pub heap: &'heap Heap,
    pub spans: &'spans mut SpanTable<Span>,
    pub parent: SpanId,
    pub offsets: RawOffsets<A>,
    pub depth: u16,
    pub max_depth: u16,
    pub options: ParserOptions,
}

impl<A: Allocator> Context<'_, '_, A> {
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

impl<A: Allocator> fmt::Debug for Context<'_, '_, A> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Context")
            .field("heap", &self.heap)
            .field("spans", &self.spans)
            .field("parent", &self.parent)
            .field("offsets", &self.offsets)
            .field("depth", &self.depth)
            .field("max_depth", &self.max_depth)
            .field("options", &self.options)
            .finish()
    }
}

pub(crate) type Input<'heap, 'span, 'source, A> =
    Stateful<LocatingSlice<&'source str>, Context<'heap, 'span, A>>;
