//! Source code span tracking and management system.
//!
//! This module provides a compact and efficient system for tracking locations within source code.
//! It is designed around two core concepts: [`SpanId`] for lightweight span identification and
//! [`SpanTable`] for storing and resolving actual span data.
//!
//! # Architecture Overview
//!
//! The span system uses an indirection-based approach where [`SpanId`] serves as a compact
//! identifier that references span data stored in a [`SpanTable`].
//!
//! # Key Components
//!
//! - **[`SpanId`]**: A compact 4-byte identifier for spans
//! - **[`SpanTable`]**: Storage and resolution for span data
//! - **[`Span`]**: Trait for types that can represent text ranges
//! - **[`Spanned<T>`]**: Wrapper that associates values with their source spans
//! - **[`SpanAncestors`]**: Represents hierarchical relationships between spans
//!
//! # Span Hierarchy and Resolution
//!
//! Spans can have ancestor relationships, which allows for hierarchical source tracking. This is
//! used in various phases to layer additional information onto a span.
//!
//! ```rust
//! use hashql_core::span::{SpanAncestors, SpanTable, TextRange};
//! use hashql_diagnostics::source::SourceId;
//!
//! # struct MySpan { range: TextRange }
//! # impl hashql_core::span::Span for MySpan {
//! #     fn range(&self) -> TextRange { self.range }
//! # }
//! let source_id = SourceId::new_unchecked(0);
//! let mut table = SpanTable::new(source_id);
//!
//! // Create a root span
//! let root_span = MySpan {
//!     range: TextRange::new(0.into(), 100.into()),
//! };
//! let root_id = table.insert(root_span, SpanAncestors::empty());
//!
//! // Create a child span with the root as ancestor
//! let child_span = MySpan {
//!     range: TextRange::new(10.into(), 20.into()),
//! };
//! let child_id = table.insert(child_span, SpanAncestors::union(&[root_id]));
//! ```
//!
//! # Comparison with Other Span Systems
//!
//! ## rust-analyzer
//!
//! rust-analyzer uses direct [`TextRange`] representations during parsing, later
//! converting to more complex span types. Our system uses indirection from the start,
//! trading some lookup overhead for significantly better memory efficiency.
//!
//! ## rustc
//!
//! rustc uses an 8-byte span that attempts to inline span data for 99.9%+ of cases,
//! falling back to interned storage for complex spans. Our approach uses consistent
//! indirection, making it simpler but potentially less cache-efficient for simple cases.
//!
//! Our design prioritizes:
//! - **Simplicity**: Consistent indirection model
//! - **Compactness**: 4-byte identifiers vs rustc's 8-byte spans
//! - **Flexibility**: Easy ancestor chain manipulation and resolution modes
//!
//! # Examples
//!
//! ## Basic Span Creation and Lookup
//!
//! ```rust
//! use hashql_core::span::{SpanAncestors, SpanTable, TextRange};
//! use hashql_diagnostics::source::SourceId;
//!
//! # struct SimpleSpan { range: TextRange }
//! # impl hashql_core::span::Span for SimpleSpan {
//! #     fn range(&self) -> TextRange { self.range }
//! # }
//! let source_id = SourceId::new_unchecked(1);
//! let mut table = SpanTable::new(source_id);
//!
//! let span = SimpleSpan {
//!     range: TextRange::new(0.into(), 42.into()),
//! };
//! let span_id = table.insert(span, SpanAncestors::empty());
//!
//! // Later lookup
//! let retrieved_span = table.get(span_id).expect("span exists");
//! assert_eq!(retrieved_span.range(), TextRange::new(0.into(), 42.into()));
//! ```
//!
//! ## Hierarchical Spans with Union Resolution
//!
//! ```rust
//! use hashql_core::span::{SpanAncestors, SpanResolutionMode, SpanTable, TextRange};
//! use hashql_diagnostics::source::SourceId;
//!
//! # struct MySpan { range: TextRange }
//! # impl hashql_core::span::Span for MySpan {
//! #     fn range(&self) -> TextRange { self.range }
//! # }
//! let source_id = SourceId::new_unchecked(2);
//! let mut table = SpanTable::new(source_id);
//!
//! // Create base spans
//! let span_a = MySpan {
//!     range: TextRange::new(10.into(), 20.into()),
//! };
//! let span_b = MySpan {
//!     range: TextRange::new(30.into(), 40.into()),
//! };
//! let span_a_id = table.insert(span_a, SpanAncestors::empty());
//! let span_b_id = table.insert(span_b, SpanAncestors::empty());
//!
//! // Create a span that unions both ancestors
//! let child_span = MySpan {
//!     range: TextRange::new(5.into(), 15.into()),
//! };
//! let ancestors = SpanAncestors::union(&[span_a_id, span_b_id]);
//! let child_id = table.insert(child_span, ancestors);
//!
//! // The absolute range will be the union of all ancestors plus the child's offset
//! let absolute = table.absolute(child_id).expect("span resolution succeeds");
//! // Result covers the union of spans A and B, plus child's relative range
//! ```
//!
//! ## Synthetic Spans for Generated Code
//!
//! ```rust
//! use hashql_core::span::SpanId;
//!
//! // Use SYNTHETIC for compiler-generated constructs
//! let synthetic_span = SpanId::SYNTHETIC;
//! assert_eq!(synthetic_span.to_string(), "4294967295"); // u32::MAX
//!
//! // Diagnostic renderers can handle synthetic spans specially
//! // (e.g., omit location, show as "generated", etc.)
//! ```

mod table;

use core::{
    fmt::{self, Display},
    ops::Deref,
};

use hashql_diagnostics::source::{DiagnosticSpan, SourceId, SourceSpan};
pub use text_size::{TextRange, TextSize};

pub use self::table::SpanTable;

/// Represents a unique identifier for a span in some source.
///
/// [`SpanId`] serves as a compact, opaque identifier that references span data stored in a
/// [`SpanTable`].
///
/// The span itself might represent various forms of source locations:
/// - Byte offsets in text files
/// - Line/column positions
/// - JSON Pointers for structured data
/// - Synthetic locations for compiler-generated code
///
/// # Memory Layout and Encoding
///
/// [`SpanId`] uses a 4-byte layout to maximize information density:
///
/// ```text
/// 0                   1                   2                   3
/// 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// |                     ID                    |       Source      |
/// +-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
/// ```
///
/// The last 12 bits are used to encode the source file index, whereas the first 20 bits are used to
/// encode the span offset within the source file.
///
/// This encoding provides us with:
/// - 2^12 = 4096 source files
/// - 2^20 = 1.048.576 spans per source file
///
/// This tradeoff was chosen to maximize information density while maintaining a reasonable number
/// of source files and spans per file. Given that each identifier is ~3 bytes long it would mean
/// that the maximum number of spans would be 3MiB. In reality that number would be much larger due
/// to e.g. whitespace and comments.
///
/// We encode the source id inside the span id to ensure that we cannot wrongly index a
/// [`SpanTable`] with a [`SourceId`] or have ancestors that span across multiple source files.
///
/// ## Compactness Benefits
///
/// At only 4 bytes, [`SpanId`] can be embedded efficiently in:
/// - Node structures
/// - Token representations
/// - Type information
/// - Error and diagnostic contexts
/// - Any frequently-allocated data structure
///
/// This compactness is crucial for compiler performance, as spans are pervasive
/// throughout the compilation process.
///
/// # Usage Patterns
///
/// [`SpanId`] is designed as a reference type - the actual span information must be
/// retrieved from the corresponding [`SpanTable`]. This separation enables:
///
/// - **Shared ownership**: Multiple nodes can reference the same span
/// - **Lazy resolution**: Span details are only looked up when needed
/// - **Batch operations**: Multiple spans can be resolved efficiently together
/// - **Memory deduplication**: Identical spans can be stored once and referenced multiple times
///
/// ## Examples
///
/// Basic usage with span table lookup:
///
/// ```rust
/// use hashql_core::span::{SpanAncestors, SpanId, SpanTable, TextRange};
/// use hashql_diagnostics::source::SourceId;
///
/// # struct MySpan { range: TextRange }
/// # impl hashql_core::span::Span for MySpan {
/// #     fn range(&self) -> TextRange { self.range }
/// # }
/// let source_id = SourceId::new_unchecked(0);
/// let mut table = SpanTable::new(source_id);
///
/// // Create and insert a span
/// let span_data = MySpan {
///     range: TextRange::new(10.into(), 20.into()),
/// };
/// let span_id = table.insert(span_data, SpanAncestors::empty());
///
/// // Later retrieval
/// let retrieved = table.get(span_id).expect("span exists in table");
/// assert_eq!(retrieved.range(), TextRange::new(10.into(), 20.into()));
/// ```
///
/// Using synthetic spans for generated code:
///
/// ```rust
/// use hashql_core::span::SpanId;
///
/// let synthetic = SpanId::SYNTHETIC;
///
/// // Synthetic spans have special meaning for diagnostic renderers
/// // They might be displayed as "<generated>" or omitted from output
/// println!("Synthetic span ID: {}", synthetic);
/// ```
///
/// Extracting source ID and span index components:
///
/// ```rust
/// use hashql_core::span::{SpanAncestors, SpanId, SpanTable};
/// use hashql_diagnostics::source::SourceId;
///
/// # struct MySpan { range: hashql_core::span::TextRange }
/// # impl hashql_core::span::Span for MySpan {
/// #     fn range(&self) -> hashql_core::span::TextRange {
/// #         hashql_core::span::TextRange::new(0.into(), 10.into())
/// #     }
/// # }
/// let source_id = SourceId::new_unchecked(5);
/// let mut table = SpanTable::new(source_id);
///
/// let span_data = MySpan {
///     range: hashql_core::span::TextRange::new(0.into(), 10.into()),
/// };
/// let span_id = table.insert(span_data, SpanAncestors::empty());
///
/// // Extract components
/// assert_eq!(span_id.source_id(), source_id);
/// assert_eq!(span_id.id(), 0); // First span inserted has index 0
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
pub struct SpanId(u32);

impl SpanId {
    pub(crate) const MAX_ID: u32 = 1 << Self::SOURCE_OFFSET;
    pub(crate) const MAX_SOURCE_ID: u32 = 1 << (u32::BITS - Self::SOURCE_OFFSET);
    const SOURCE_MASK: u32 = (1 << Self::SOURCE_OFFSET) - 1;
    const SOURCE_OFFSET: u32 = 20;
    /// A special span ID for compiler-generated nodes that don't correspond to actual source code.
    ///
    /// [`SYNTHETIC`] represents spans that were synthetically created during compilation rather
    /// than representing a location in the original source text. These spans should only be used in
    /// transitional periods, and should not be preserved across different compilation phases.
    ///
    /// ## Implementation Details
    ///
    /// [`SYNTHETIC`] uses the maximum possible [`SpanId`] value (`u32::MAX`), ensuring it will
    /// never conflict with legitimate span indices. This also makes synthetic spans easily
    /// identifiable in debugging output.
    ///
    /// The encoding means synthetic spans technically belong to source ID 4095 with the maximum
    /// possible span index (`u32::MAX`), but these values are meaningless since synthetic spans
    /// don't reference real table entries.
    pub const SYNTHETIC: Self = Self(u32::MAX);

    pub(crate) const fn new(source: SourceId, id: u32) -> Self {
        Self((source.value() << Self::SOURCE_OFFSET) | (id & Self::SOURCE_MASK))
    }

    pub(crate) const fn source_id(self) -> SourceId {
        SourceId::new_unchecked(self.0 >> Self::SOURCE_OFFSET)
    }

    pub(crate) const fn id(self) -> u32 {
        self.0 & Self::SOURCE_MASK
    }
}

impl Display for SpanId {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.0, fmt)
    }
}

/// Determines how multiple ancestor spans should be combined during span resolution.
///
/// When a span has multiple ancestors (parent spans), [`SpanResolutionMode`] controls
/// how their ranges are combined to determine the effective context for the child span.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum SpanResolutionMode {
    /// Combines ancestor spans by taking their union (encompassing range).
    ///
    /// This mode produces a range that covers all ancestor spans completely.
    /// It's the most inclusive approach and is useful when you want to capture
    /// the full context that influences a span.
    ///
    /// # Use Cases
    ///
    /// - **Macro expansions**: Where generated code should reference the entire macro context
    /// - **Error reporting**: When showing all relevant source locations for an issue
    /// - **IDE features**: When highlighting all code that contributes to a particular construct
    ///
    /// # Example
    ///
    /// If ancestors cover ranges `[5, 10]` and `[15, 20]`, union resolution
    /// produces `[5, 20]`, encompassing both ranges and the gap between them.
    Union,

    /// Combines ancestor spans by taking their intersection (overlapping range).
    ///
    /// This mode produces a range that represents only the portion where all
    /// ancestor spans overlap. If there's no overlap, resolution may fail.
    ///
    /// # Use Cases
    ///
    /// - **Precise error locations**: When you need the exact area affected by multiple conditions
    /// - **Constraint resolution**: Where only the common area is semantically valid
    /// - **Optimization contexts**: When transformations only apply to shared regions
    ///
    /// # Example
    ///
    /// If ancestors cover ranges `[5, 15]` and `[10, 20]`, intersection resolution
    /// produces `[10, 15]`, representing only the overlapping portion.
    Intersection,
}

/// Represents a collection of ancestor spans with their resolution mode.
///
/// [`SpanAncestors`] defines the hierarchical relationship between spans, specifying
/// which spans serve as parents and how they should be combined during resolution.
///
/// # Hierarchy and Resolution
///
/// Ancestors are resolved recursively - each ancestor may itself have ancestors,
/// creating a tree structure. The [`SpanResolutionMode`] determines how multiple
/// ancestors at the same level are combined.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct SpanAncestors<'spans> {
    spans: &'spans [SpanId],
    mode: SpanResolutionMode,
}

impl<'spans> SpanAncestors<'spans> {
    /// A constant representing empty ancestors for root spans.
    pub const EMPTY: Self = Self::empty();

    /// Creates an empty ancestor set for root spans.
    ///
    /// Empty ancestors indicate that a span is a root span with no parent
    /// context. This is typical for:
    ///
    /// - Top-level source file content
    /// - Primary macro invocation sites
    /// - Built-in or synthetic spans that don't derive from user code
    #[must_use]
    pub const fn empty() -> Self {
        Self {
            spans: &[],
            mode: SpanResolutionMode::Union,
        }
    }

    /// Creates ancestors that will be resolved using union mode.
    ///
    /// Union resolution combines all ancestor spans by taking their encompassing
    /// range. This is the most inclusive approach and is useful when you want
    /// to capture all relevant context for a span.
    #[must_use]
    pub const fn union(spans: &'spans [SpanId]) -> Self {
        Self {
            spans,
            mode: SpanResolutionMode::Union,
        }
    }

    /// Creates ancestors that will be resolved using intersection mode.
    ///
    /// Intersection resolution combines ancestor spans by taking only their
    /// overlapping range. This is useful when only the common area between
    /// ancestors is semantically meaningful.
    ///
    /// # Resolution Behavior
    ///
    /// If the ancestor spans don't overlap, resolution will fail (return `None`).
    /// This makes intersection mode stricter but more precise than union mode.
    #[must_use]
    pub const fn intersection(ancestors: &'spans [SpanId]) -> Self {
        Self {
            spans: ancestors,
            mode: SpanResolutionMode::Intersection,
        }
    }
}

/// Mutable view of span ancestors, used for modifying ancestor relationships.
///
/// [`SpanAncestorsMut`] provides mutable access to both the ancestor span list
/// and the resolution mode. This type is typically used within [`SpanTable::modify`]
/// operations to update span relationships after initial creation.
pub struct SpanAncestorsMut<'spans> {
    /// Mutable reference to the ancestor span list.
    pub spans: &'spans mut [SpanId],
    /// Mutable reference to the resolution mode.
    pub mode: &'spans mut SpanResolutionMode,
}

/// Trait for types that can represent text ranges within source code.
///
/// The [`Span`] trait abstracts over different span representations, allowing
/// the span system to work with various underlying span types. Implementors
/// must provide a way to extract a [`TextRange`] that represents the span's
/// location within its parent context.
///
/// # Design Philosophy
///
/// This trait focuses on the essential information needed for span resolution:
/// the relative range within a parent span. Additional metadata (like source
/// file paths, line/column information, or JSON pointers) can be stored in
/// the implementing type but isn't required by the core span system.
///
/// # Relative vs Absolute Ranges
///
/// The [`range`](Span::range) method returns a **relative** range within the
/// span's immediate parent. For absolute source positions, use
/// [`SpanTable::absolute`] which handles the full ancestor chain resolution.
///
/// ## Implementation Guidelines
///
/// - **Consistency**: The range should be stable for the lifetime of the span
/// - **Relativity**: Ranges are relative to the parent span, not absolute file positions
pub trait Span {
    /// Returns the relative range of this span within its parent span.
    ///
    /// This range represents the span's location relative to its immediate
    /// parent context. For spans without parents (root spans), this is
    /// the absolute range within the source file.
    ///
    /// # Coordinate System
    ///
    /// The returned [`TextRange`] uses byte offsets from the beginning of
    /// the parent span.
    fn range(&self) -> TextRange;
}

impl<S> DiagnosticSpan<&SpanTable<S>> for SpanId
where
    S: Span,
{
    fn source(&self) -> SourceId {
        self.source_id()
    }

    fn absolute(&self, resolver: &mut &SpanTable<S>) -> Option<SourceSpan> {
        resolver.absolute(*self)
    }
}

/// A wrapper that associates a value with its source span.
///
/// [`Spanned<T>`] is a convenience type that pairs any value with a [`SpanId`],
/// creating a span-aware version of the original type.
///
/// # Dereferencing Behavior
///
/// [`Spanned<T>`] implements [`Deref`] to automatically access the wrapped value,
/// making it largely transparent in normal usage. While `Deref` is generally
/// avoided in Rust libraries, it's appropriate here since we're only adding
/// metadata without changing the fundamental nature of the wrapped type.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Spanned<T> {
    /// The span identifier indicating where this value originated in source code.
    pub span: SpanId,
    /// The wrapped value.
    pub value: T,
}

impl<T> Deref for Spanned<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.value
    }
}
