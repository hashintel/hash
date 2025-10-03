mod span;
use alloc::borrow::Cow;
use core::fmt;

pub use self::span::{DiagnosticSpan, SourceSpan};

/// A unique identifier for a source file in the diagnostic system.
///
/// [`SourceId`] is used to reference source files within diagnostics and spans
/// without storing the full file path or content. It provides a lightweight way
/// to identify and retrieve source files from a [`Sources`] collection.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::source::{Source, SourceId, Sources};
///
/// let mut sources = Sources::new();
/// let source = Source::new("fn main() {}").with_path("main.rs");
/// let id: SourceId = sources.push(source);
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct SourceId(u32);

impl SourceId {
    /// Creates a new `SourceId` from a raw identifier without validation.
    ///
    /// The caller must ensure that the provided `id` corresponds to a valid source in the
    /// associated [`Sources`] collection. Using an invalid ID will result in failed lookups
    /// when retrieving the source.
    #[must_use]
    pub const fn new_unchecked(id: u32) -> Self {
        Self(id)
    }

    /// Returns the raw value of the `SourceId`.
    ///
    /// This method provides direct access to the underlying integer value of the `SourceId`.
    #[must_use]
    pub const fn value(self) -> u32 {
        self.0
    }
}

impl fmt::Display for SourceId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, f)
    }
}

/// A source file containing code and an optional file path.
///
/// [`Source`] represents a single source file in the diagnostic system, containing
/// the file's textual content and an optional path for identification. Sources are
/// typically added to a [`Sources`] collection and referenced by [`SourceId`] in
/// diagnostic spans and labels.
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::source::Source;
///
/// // Create a source with just content
/// let inline_source = Source::new("let x = 42;");
///
/// // Create a source with a file path
/// let file_source = Source::new("fn main() {}").with_path("src/main.rs");
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Source<'source> {
    /// Optional file path for this source.
    ///
    /// When present, this path is displayed in diagnostic output to help users
    /// identify the source file. It can be a relative or absolute path.
    pub path: Option<Cow<'source, str>>,

    /// The textual content of the source file.
    ///
    /// Contains the actual source code that diagnostics will reference through
    /// spans and that will be displayed in diagnostic output.
    pub content: Cow<'source, str>,
}

impl<'source> Source<'source> {
    /// Creates a new source with the given content and no file path.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::source::Source;
    ///
    /// let source = Source::new("fn hello() { println!(\"Hello!\"); }");
    /// assert!(source.path.is_none());
    /// ```
    pub fn new(content: impl Into<Cow<'source, str>>) -> Self {
        Self {
            path: None,
            content: content.into(),
        }
    }

    /// Sets the file path for this source.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::source::Source;
    ///
    /// let source = Source::new("mod tests;").with_path("src/lib.rs");
    ///
    /// assert_eq!(source.path.as_deref(), Some("src/lib.rs"));
    /// ```
    #[must_use]
    pub fn with_path(self, path: impl Into<Cow<'source, str>>) -> Self {
        Self {
            path: Some(path.into()),
            content: self.content,
        }
    }
}

#[derive(Debug)]
#[cfg_attr(
    not(feature = "render"),
    expect(dead_code, reason = "used during rendering")
)]
pub(crate) struct ResolvedSource<'source> {
    pub path: Option<Cow<'source, str>>,
    pub content: Cow<'source, str>,
}

/// A collection of source files used by the diagnostic system.
///
/// [`Sources`] maintains a repository of source files that can be referenced
/// by diagnostics through [`SourceId`].
///
/// # Examples
///
/// ```
/// use hashql_diagnostics::source::{Source, Sources};
///
/// let mut sources = Sources::new();
///
/// // Add source files and get their IDs
/// let main_id = sources.push(Source::new("fn main() {}").with_path("main.rs"));
/// let lib_id = sources.push(Source::new("pub fn helper() {}").with_path("lib.rs"));
/// ```
#[derive(Debug)]
pub struct Sources<'source> {
    sources: Vec<ResolvedSource<'source>>,
}

impl<'source> Sources<'source> {
    /// Creates a new empty source collection.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::source::Sources;
    ///
    /// let sources = Sources::new();
    /// ```
    #[must_use]
    pub const fn new() -> Self {
        Self {
            sources: Vec::new(),
        }
    }

    /// Adds a source to the collection and returns its unique identifier.
    ///
    /// The returned [`SourceId`] can be used to reference this source in
    /// diagnostic spans and labels.
    ///
    /// # Panics
    ///
    /// Panics if the number of sources exceeds `u32::MAX`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_diagnostics::source::{Source, Sources};
    ///
    /// let mut sources = Sources::new();
    /// let id = sources.push(Source::new("fn main() {}").with_path("main.rs"));
    /// ```
    #[expect(clippy::cast_possible_truncation)]
    pub fn push(&mut self, source: Source<'source>) -> SourceId {
        assert!(self.sources.len() < u32::MAX as usize);

        let id = SourceId(self.sources.len() as u32);

        self.sources.push(ResolvedSource {
            path: source.path,
            content: source.content,
        });

        id
    }

    #[cfg(feature = "render")]
    pub(crate) fn get(&self, id: SourceId) -> Option<&ResolvedSource<'source>> {
        self.sources.get(id.0 as usize)
    }
}

impl const Default for Sources<'_> {
    fn default() -> Self {
        Self::new()
    }
}
