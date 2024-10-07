#![feature(never_type)]
extern crate alloc;

pub mod entry;
pub mod storage;
pub mod tree;

pub use text_size::{TextRange, TextSize};

/// Represents a unique identifier for a span in some source.
///
/// This span might either be a byte offset, a line/column pair, or some other form of identifier,
/// such as a JSON Pointer.
///
/// This struct serves as an opaque unique identifier that can be used to reference a specific
/// span, which needs to be looked up in the storage system.
///
/// ## Compactness
///
/// `SpanId` is designed to be as small as possible. It is only 4 bytes in size, allowing it
/// to be stored compactly and passed efficiently.
///
/// ## Usage
///
/// Since `SpanId` is just an identifier, the actual span information must be retrieved
/// from the storage system [`SpanStorage`]. This differs from more complex systems
/// where the span information might be directly embedded within the span identifier itself.
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
/// In rust-analyzer, spans are directly represented as `TextRange` during syntax parsing.
/// In later stages, they are replaced with a more complex `Span` struct. Our `SpanId` is
/// more compact, and the actual span data is looked up in storage.
///
/// ### rustc
///
/// rustc splits span information between `Span` and `SpanData`, where `Span` is more complex
/// but also contains more intricate encoding. Our `SpanId` is simpler and references data
/// stored elsewhere.
/// The size of the `rustc` type is 8 bytes, but instead of storing the data in a separate
/// storage, it tries to agressively inline the information. Doing so allows the inlining of a vast
/// majority of spans (99.9%+), making it more efficient to look up the span information.
/// Implementating a similar approach is left up to a future iteration of the library.
///
/// [`SpanStorage`]: self::storage::SpanStorage
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct SpanId(u32);

impl SpanId {
    pub(crate) const fn new(id: u32) -> Self {
        Self(id)
    }

    pub(crate) const fn value(self) -> u32 {
        self.0
    }
}

/// Represents a full span in a file.
///
/// A span is a range of text within a file, along with a reference to the file itself, every span
/// is relative to the parent span, if no parent is provided, the span is considered to be absolute.
///
/// Any span may have additional metadata attached, such as a JSON Pointer, for any JSON based
/// frontends, this data is always optional, as some spans, for example for malformed code, may not
/// have any additional data.
pub trait Span {
    /// Optional parent span, if any.
    fn parent_id(&self) -> Option<SpanId>;
}
