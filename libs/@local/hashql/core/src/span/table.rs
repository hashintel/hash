use core::ops::Range;

use hashql_diagnostics::source::{SourceId, SourceSpan};

use super::{Span, SpanAncestors, SpanCombinator, SpanId};

#[derive(Debug)]
struct SpanEntry<S> {
    span: S,
    combinator: SpanCombinator,
    ancestors: Range<usize>, // index into the adjacent `ancestors` vector
}

#[derive(Debug)]
pub struct SpanTable<S> {
    source_id: SourceId,
    spans: Vec<SpanEntry<S>>,
    ancestors: Vec<SpanId>,
}

impl<S> SpanTable<S> {
    #[must_use]
    pub fn new(source: SourceId) -> Self {
        Self {
            source_id: source,
            spans: Vec::new(),
            ancestors: Vec::new(),
        }
    }
}

impl<S> SpanTable<S> {
    #[expect(
        clippy::cast_possible_truncation,
        reason = "The arena is not expected to be larger than u32::MAX + debug assertions"
    )]
    pub fn insert(&mut self, span: S, ancestors: SpanAncestors) -> SpanId {
        const MAX_LEN: usize = u32::MAX as usize;

        let ancestors_index = self.ancestors.len();
        self.ancestors.extend_from_slice(ancestors.spans);

        let index = self.spans.len();
        self.spans.push(SpanEntry {
            span,
            combinator: ancestors.combinator,
            ancestors: ancestors_index..(ancestors_index + ancestors.spans.len()),
        });

        // The `as` here is safe, because if we're at `u32::MAX` elements, the next push would
        // overflow.
        debug_assert!(index <= MAX_LEN, "Arena is full");

        SpanId::new(index as u32)
    }

    pub fn modify(&mut self, span: SpanId, func: impl FnOnce(&mut S, SpanAncestorsMut)) -> bool {
        if span.source_id() != self.source_id {
            return false;
        }

        let index = span.id() as usize;

        let Some(element) = self.spans.get_mut(index) else {
            return false;
        };

        func(
            &mut element.span,
            SpanAncestorsMut {
                ancestors: &mut self.ancestors[element.ancestors.clone()],
                combinator: &mut element.combinator,
            },
        );
        true
    }

    fn get_entry(&self, span: SpanId) -> Option<&SpanEntry> {
        if span.source_id() != self.source_id {
            return None;
        }

        let index = span.id() as usize;

        self.spans.get(index)
    }

    #[must_use]
    pub fn get(&self, span: SpanId) -> Option<&S> {
        self.get_entry(span).map(|entry| &entry.span)
    }

    pub(crate) fn absolute(&self, span: SpanId) -> Option<SourceSpan>
    where
        S: Span,
    {
        let mut entry = self.get_entry(span)?.range();

        loop {}
    }
}
