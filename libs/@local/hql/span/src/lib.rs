use std::collections::HashMap;

use text_size::TextRange;

/// The ID of a source file.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct FileId(u32);

/// Represents a span of text within a source file.
///
/// This struct serves as a reference to a specific range of text within a source file.
/// The range is 8 bytes in size, allowing it to be stored in a single word and easily
/// passed around. Each `Span` instance is considered unique, even if spans overlap
/// exactly, as they refer to the same range of text data.
///
/// The reason why a `Span` is not just some opaque data, like a JSON Pointer, is that it may refer
/// to some invalid data, or to something relative in an item, something that one cannot easily
/// point to via a JSON Pointer, while not useful it is more seen suplementary, as an additional
/// JSON Pointer, just like any other metadata for other frontends.
///
/// ## Unique Identification
///
/// Each span is uniquely identified, making it safe to assume that spans are unique.
/// This avoids the possibility of associating multiple pieces of information with the
/// same span under the same id.
///
/// Byte indices are unique in validated data (like a JSON string) and in malformed data as well.
/// While some spans might carry additional metadata, like JSON pointers, others might not.
///
/// ## Span Hierarchy
///
/// The span identifier is unique to both its start and end points, allowing for nested spans,
/// for example:
/// * Parent span: 7..17
/// * Child span: 9..11
///
/// ## Inspirations
///
/// This design is inspired by:
/// - [rust-analyzer](https://github.com/rust-lang/rust-analyzer/blob/aa00ddcf654a35ba0eafe17247cf189958d33182/crates/span/src/lib.rs)
/// - [rust](https://doc.rust-lang.org/stable/nightly-rustc/rustc_span/struct.Span.html)
///
/// ## Comparison
///
/// ### rust-analyzer
///
/// In rust-analyzer, a `Span` is typically represented as a `TextRange` which is 8 bytes in size.
/// During later stages like High Intermediate Representation (HIR) analysis, it is replaced with a
/// more complex `Span` struct which is at least 16 bytes large.
/// Unlike rust-analyzer, this implementation keeps spans as absolute values rather than relative to
/// a parent.
///
/// ### rustc
///
/// In rustc, a `Span` is split into a `Span` and `SpanData`. The `Span` is 8 bytes and stores more
/// complex information, while a `SpanData` struct provides additional context. The encoding varies
/// depending on the present values, making this approach complex but efficient by often avoiding
/// lookups.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Span(TextRange);

/// Represents additional metadata associated with a `Span`.
///
/// `SpanData` can store information about the text range, an optional parent span,
/// and other optional extra data.
///
/// This data is at least 20 bytes in size.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct SpanData<E> {
    span: Span,
    parent: Option<Span>,
    extra: Option<E>,
}

impl<E> SpanData<E> {
    #[must_use]
    pub const fn new(span: Span) -> Self {
        Self {
            span,
            parent: None,
            extra: None,
        }
    }

    #[must_use]
    pub const fn with_parent(mut self, parent: Span) -> Self {
        self.parent = Some(parent);
        self
    }

    pub fn set_parent(&mut self, parent: Span) -> &mut Self {
        self.parent = Some(parent);
        self
    }

    #[must_use]
    pub fn with_extra(mut self, extra: E) -> Self {
        self.extra = Some(extra);
        self
    }

    pub fn set_extra(&mut self, extra: E) -> &mut Self {
        self.extra = Some(extra);
        self
    }
}

/// A collection of spans within a single source file.
///
/// This struct is used to store information about multiple spans within a single source file.
pub struct SpanArena<E> {
    file: FileId,
    items: HashMap<Span, SpanData<E>>,
}

impl<E> SpanArena<E> {
    #[must_use]
    pub fn new(file: FileId) -> Self {
        Self {
            file,
            items: HashMap::new(),
        }
    }

    #[must_use]
    pub const fn file(&self) -> FileId {
        self.file
    }

    pub fn insert(&mut self, span: SpanData<E>) {
        self.items.insert(span.span, span);
    }

    #[must_use]
    pub fn get(&self, span: Span) -> Option<&SpanData<E>> {
        self.items.get(&span)
    }

    pub fn get_mut(&mut self, span: Span) -> Option<&mut SpanData<E>> {
        self.items.get_mut(&span)
    }
}
