use alloc::alloc::Global;
use core::{alloc::Allocator, marker::Destruct};

use hashql_diagnostics::source::{Source, SourceSpan, Sources};

use super::{Span, SpanId, SpanTable};

/// The sources of a compilation, each with the [`SpanTable`] of its spans.
///
/// A [`SpanTable`] holds the spans of one source. A compilation that reads more than one source
/// registers each of them with [`push`], which assigns the [`SourceId`] and returns the table that
/// records the spans of that source. [`absolute`] resolves a [`SpanId`] of any registered source.
///
/// # Example
///
/// ```
/// use hashql_core::span::{SourceTable, Span, SpanAncestors, TextRange};
/// use hashql_diagnostics::source::Source;
///
/// # struct Range(TextRange);
/// # impl Span for Range {
/// #     fn range(&self) -> TextRange { self.0 }
/// # }
/// let mut table = SourceTable::new();
///
/// let query = table.push(Source::new(r#"["input", "limit", "Integer"]"#).with_path("query"));
/// let declaration = query.insert(
///     Range(TextRange::new(10.into(), 17.into())),
///     SpanAncestors::empty(),
/// );
///
/// let limit = table.push(Source::new(r##"{"#literal": "3"}"##).with_path("inputs.limit"));
/// let value = limit.insert(
///     Range(TextRange::new(13.into(), 16.into())),
///     SpanAncestors::empty(),
/// );
///
/// let declaration = table
///     .absolute(declaration)
///     .expect("the span should resolve");
/// let value = table.absolute(value).expect("the span should resolve");
///
/// assert_ne!(declaration.source(), value.source());
/// assert_eq!(value.range(), TextRange::new(13.into(), 16.into()));
/// ```
///
/// [`absolute`]: Self::absolute
/// [`push`]: Self::push
/// [`SourceId`]: hashql_diagnostics::source::SourceId
#[derive(Debug)]
pub struct SourceTable<'source, S, A: Allocator = Global> {
    sources: Sources<'source>,
    spans: Vec<SpanTable<S>, A>,
}

impl<S> SourceTable<'_, S> {
    /// Creates a table without sources.
    #[must_use]
    pub const fn new() -> Self {
        Self::new_in(Global)
    }

    /// Creates a table without sources, with room for the span tables of `capacity` sources.
    #[must_use]
    pub const fn with_capacity(capacity: usize) -> Self {
        Self::with_capacity_in(capacity, Global)
    }
}

impl<'source, S, A: Allocator> SourceTable<'source, S, A> {
    /// The number of sources a table can hold.
    ///
    /// The largest source id that a [`SpanId`] encodes is the one of [`SpanId::SYNTHETIC`], and no
    /// source receives it.
    pub const MAX_LEN: usize = SpanId::MAX_SOURCE_ID as usize;

    /// Creates a table without sources, which allocates the list of its span tables in `alloc`.
    #[must_use]
    pub const fn new_in(alloc: A) -> Self {
        Self {
            sources: Sources::new(),
            spans: Vec::new_in(alloc),
        }
    }

    /// Creates a table without sources, with room in `alloc` for the span tables of `capacity`
    /// sources.
    #[must_use]
    pub const fn with_capacity_in(capacity: usize, alloc: A) -> Self
    where
        A: [const] Allocator + [const] Destruct,
    {
        Self {
            sources: Sources::new(),
            spans: Vec::with_capacity_in(capacity, alloc),
        }
    }

    /// Registers `source` and returns the table that records its spans.
    ///
    /// The sources receive their ids in the order they are registered. [`SpanTable::source`]
    /// returns the id of this one.
    ///
    /// # Panics
    ///
    /// Panics if the table already holds [`Self::MAX_LEN`] sources.
    pub fn push(&mut self, source: Source<'source>) -> &mut SpanTable<S> {
        let index = self.spans.len();
        assert!(
            index < Self::MAX_LEN,
            "a source table holds at most {} sources",
            Self::MAX_LEN
        );

        let id = self.sources.push(source);
        debug_assert_eq!(id.value() as usize, index);

        self.spans.push(SpanTable::new(id));
        &mut self.spans[index]
    }

    /// Returns the registered sources.
    pub const fn sources(&self) -> &Sources<'source> {
        &self.sources
    }

    /// Resolves `span` to its position in its source.
    ///
    /// A [`SpanId::SYNTHETIC`] span resolves in the first source, to an empty span at its start.
    ///
    /// Returns `None` if the source that `span` resolves in is not registered, or if the
    /// [`SpanTable`] of that source cannot resolve `span`, as [`SpanTable::absolute`] describes.
    #[must_use]
    pub fn absolute(&self, span: SpanId) -> Option<SourceSpan>
    where
        S: Span,
    {
        let source = if span == SpanId::SYNTHETIC {
            0
        } else {
            span.source_id().value() as usize
        };

        self.spans.get(source)?.absolute(span)
    }
}

impl<S> Default for SourceTable<'_, S> {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use hashql_diagnostics::source::Source;
    use text_size::TextRange;

    use super::SourceTable;
    use crate::span::{Span, SpanAncestors, SpanId};

    struct Range(TextRange);

    impl Span for Range {
        fn range(&self) -> TextRange {
            self.0
        }
    }

    #[test]
    fn absolute_in_table_of_source() {
        let mut table = SourceTable::new();

        // both spans have the same index in the table of their source
        let first = table.push(Source::new("first")).insert(
            Range(TextRange::new(0.into(), 4.into())),
            SpanAncestors::empty(),
        );
        let second = table.push(Source::new("the second")).insert(
            Range(TextRange::new(4.into(), 10.into())),
            SpanAncestors::empty(),
        );

        for (span, range) in [(first, 0..4), (second, 4..10)] {
            let absolute = table.absolute(span).expect("the span should resolve");

            assert_eq!(absolute.source(), span.source_id());
            assert_eq!(
                absolute.range(),
                TextRange::new(range.start.into(), range.end.into())
            );
        }
    }

    #[test]
    fn absolute_unregistered_source() {
        let mut table = SourceTable::new();
        let span = table.push(Source::new("first")).insert(
            Range(TextRange::new(0.into(), 4.into())),
            SpanAncestors::empty(),
        );

        assert!(SourceTable::<Range>::new().absolute(span).is_none());
    }

    #[test]
    fn absolute_synthetic() {
        let mut table = SourceTable::<Range>::new();
        assert!(table.absolute(SpanId::SYNTHETIC).is_none());

        let first = table.push(Source::new("first")).source();
        table.push(Source::new("the second"));

        let absolute = table
            .absolute(SpanId::SYNTHETIC)
            .expect("the span should resolve");

        assert_eq!(absolute.source(), first);
        assert!(absolute.range().is_empty());
    }

    #[test]
    fn push_at_limit() {
        let mut table = SourceTable::<Range>::new();

        let mut last = None;
        for _ in 0..SourceTable::<Range>::MAX_LEN {
            last = Some(table.push(Source::new("")).source());
        }
        let last = last.expect("the table should hold a source");

        assert_eq!(last.value() + 1, SpanId::SYNTHETIC.source_id().value());
    }

    #[test]
    #[should_panic(expected = "a source table holds at most 4095 sources")]
    fn push_over_limit() {
        let mut table = SourceTable::<Range>::new();
        for _ in 0..=SourceTable::<Range>::MAX_LEN {
            table.push(Source::new(""));
        }
    }
}
