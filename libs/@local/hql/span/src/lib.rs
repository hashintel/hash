extern crate alloc;

pub mod data;
pub mod file;
#[cfg(feature = "json")]
pub mod json;
pub mod storage;

pub use text_size::{TextRange, TextSize};

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

impl Span {
    #[must_use]
    pub const fn new(start: TextSize, end: TextSize) -> Self {
        Self(TextRange::new(start, end))
    }

    #[must_use]
    pub const fn start(self) -> TextSize {
        self.0.start()
    }

    #[must_use]
    pub const fn end(self) -> TextSize {
        self.0.end()
    }

    #[must_use]
    pub const fn range(self) -> TextRange {
        self.0
    }
}

impl From<TextRange> for Span {
    fn from(range: TextRange) -> Self {
        Self(range)
    }
}
