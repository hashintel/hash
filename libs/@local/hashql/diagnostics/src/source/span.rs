use core::fmt::Display;

use text_size::TextRange;

use super::SourceId;

/// A trait for types that represent spans within source code for diagnostic purposes.
///
/// [`DiagnosticSpan`] provides a common interface for different span representations
/// used throughout the diagnostic system. Spans identify specific locations or ranges
/// within source files and can be resolved to absolute positions for rendering.
///
/// The trait supports hierarchical spans where a span may have ancestors that provide
/// additional context or offset information.
///
/// # Examples
///
/// ```
/// use core::fmt;
///
/// use hashql_diagnostics::source::{DiagnosticSpan, SourceId, SourceSpan};
/// use text_size::TextRange;
///
/// #[derive(Debug)]
/// struct SimpleSpan {
///     source_id: SourceId,
///     range: TextRange,
/// }
///
/// impl fmt::Display for SimpleSpan {
///     fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
///         write!(f, "{}:{:?}", self.source_id, self.range)
///     }
/// }
///
/// impl<R> DiagnosticSpan<R> for SimpleSpan {
///     fn source(&self) -> SourceId {
///         self.source_id
///     }
///
///     fn absolute(&self, _resolver: &mut R) -> Option<SourceSpan> {
///         Some(SourceSpan::from_parts(self.source_id, self.range))
///     }
/// }
/// ```
pub trait DiagnosticSpan<R>: Display {
    /// Returns the source file identifier for this span.
    ///
    /// The returned [`SourceId`] identifies which source file this span
    /// references within a [`Sources`] collection.
    ///
    /// [`Sources`]: super::Sources
    fn source(&self) -> SourceId;

    /// Returns the absolute location of this span within its source file.
    ///
    /// The returned [`SourceSpan`] represents the resolved location of this
    /// span within the source file identified by [`source()`].
    ///
    /// [`source()`]: DiagnosticSpan::source
    fn absolute(&self, resolver: &mut R) -> Option<SourceSpan>;

    /// Returns `true` if this span is synthetic.
    ///
    /// A synthetic span is one that was created programmatically, rather than being derived from a
    /// source file.
    ///
    /// Synthetic spans are attached to the closest source file, if no file can be found, an error
    /// will be rendered instead.
    fn is_synthetic(&self) -> bool;
}

/// An absolute span representing a resolved location within a source file.
///
/// [`SourceSpan`] represents a span that has been fully resolved to an absolute
/// position within a specific source file. Unlike diagnostic spans that may need
/// resolution, source spans contain concrete location information that can be
/// directly used for rendering and display.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::source::{SourceId, SourceSpan};
/// use text_size::TextRange;
///
/// let source_id = SourceId::new_unchecked(0);
/// let range = TextRange::new(10.into(), 15.into());
/// let span = SourceSpan::from_parts(source_id, range);
///
/// assert_eq!(span.source(), source_id);
/// assert_eq!(span.range(), range);
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct SourceSpan {
    source: SourceId,
    range: TextRange,
}

impl SourceSpan {
    /// Resolves a diagnostic span to an absolute source span.
    ///
    /// This method takes a diagnostic span and resolves it to an absolute position
    /// within its source file by combining the span's own range with the ranges
    /// of all its ancestors. This process handles hierarchical spans where the
    /// final position depends on multiple nested contexts.
    ///
    /// Returns `None` if the span or any of its ancestors cannot be resolved.
    ///
    /// # Examples
    ///
    /// ```
    /// # use core::fmt;
    /// # use text_size::TextRange;
    /// # use hashql_diagnostics::source::{DiagnosticSpan, SourceId, SourceSpan};
    /// # #[derive(Debug)]
    /// # struct SimpleSpan { source_id: SourceId, range: TextRange }
    /// # impl fmt::Display for SimpleSpan {
    /// #     fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    /// #         write!(f, "{}:{:?}", self.source_id, self.range)
    /// #     }
    /// # }
    /// # impl<R> DiagnosticSpan<R> for SimpleSpan {
    /// #     fn source(&self) -> SourceId { self.source_id }
    /// #     fn absolute(&self, _: &mut R) -> Option<SourceSpan> { Some(SourceSpan::from_parts(self.source_id, self.range)) }
    /// #     fn is_synthetic(&self) -> bool { false }
    /// # }
    /// # struct DummyResolver;
    ///
    /// let source_id = SourceId::new_unchecked(0);
    /// let diagnostic_span = SimpleSpan {
    ///     source_id,
    ///     range: TextRange::new(10.into(), 20.into()),
    /// };
    ///
    /// let mut resolver = DummyResolver;
    /// if let Some(absolute_span) = SourceSpan::resolve(&diagnostic_span, &mut resolver) {
    ///     assert_eq!(absolute_span.source(), source_id);
    /// }
    /// ```
    pub fn resolve<S, R>(span: &S, resolver: &mut R) -> Option<Self>
    where
        S: DiagnosticSpan<R>,
    {
        span.absolute(resolver)
    }

    /// Creates a new source span from a source ID and text range.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::source::{SourceId, SourceSpan};
    /// use text_size::TextRange;
    ///
    /// let source_id = SourceId::new_unchecked(1);
    /// let range = TextRange::new(5.into(), 10.into());
    /// let span = SourceSpan::from_parts(source_id, range);
    /// ```
    #[must_use]
    pub const fn from_parts(source: SourceId, range: TextRange) -> Self {
        Self { source, range }
    }

    /// Returns the source file identifier for this span.
    #[must_use]
    pub const fn source(&self) -> SourceId {
        self.source
    }

    /// Returns the text range within the source file.
    #[must_use]
    pub const fn range(&self) -> TextRange {
        self.range
    }
}
