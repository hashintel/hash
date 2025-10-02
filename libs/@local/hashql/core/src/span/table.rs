use core::ops::Range;

use hashql_diagnostics::source::{SourceId, SourceSpan};

use super::{Span, SpanAncestors, SpanAncestorsMut, SpanId, SpanResolutionMode};

#[derive(Debug)]
struct SpanEntry<S> {
    span: S,
    mode: SpanResolutionMode,
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
    pub const fn new(source: SourceId) -> Self {
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
            mode: ancestors.mode,
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
                spans: &mut self.ancestors[element.ancestors.clone()],
                mode: &mut element.mode,
            },
        );
        true
    }

    fn get_entry(&self, span: SpanId) -> Option<&SpanEntry<S>> {
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

    fn absolute_impl(&self, span: SpanId, depth: usize) -> Option<SourceSpan>
    where
        S: Span,
    {
        assert!(
            depth <= 32,
            "Cannot resolve excessively deep span of {depth}, likely due to a circular dependency"
        );

        let entry = self.get_entry(span)?;
        let ancestors = &self.ancestors[entry.ancestors.clone()];

        let (base, rest) = match ancestors {
            [] => return Some(SourceSpan::from_parts(span.source_id(), entry.span.range())),
            [base, rest @ ..] => (*base, rest),
        };

        let mut base = self.absolute_impl(base, depth + 1)?.range();
        for &ancestor in rest {
            let ancestor = self.absolute_impl(ancestor, depth + 1)?.range();

            base = match entry.mode {
                SpanResolutionMode::Intersection => base.intersect(ancestor)?,
                SpanResolutionMode::Union => base.cover(ancestor),
            };
        }

        let range = entry.span.range() + base.start();
        Some(SourceSpan::from_parts(span.source_id(), range))
    }

    pub(crate) fn absolute(&self, span: SpanId) -> Option<SourceSpan>
    where
        S: Span,
    {
        self.absolute_impl(span, 0)
    }
}
