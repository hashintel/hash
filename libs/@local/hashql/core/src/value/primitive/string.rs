use crate::symbol::Symbol;

/// A literal representation of a string value.
///
/// Represents a string of characters exactly as it appears in the source code,
/// with all escaping and quoting already processed. String literals in HashQL
/// are used for text data and are stored as symbols for efficient memory usage
/// and comparison.
///
/// # Examples
///
/// Basic strings:
/// ```text
/// "Hello, world!"
/// "Line 1\nLine 2"  // With escape sequences
/// ""                // Empty string
/// ```
///
/// Unicode content:
/// ```text
/// "こんにちは"       // Non-ASCII characters are fully supported
/// "😊 🚀 🌍"        // Emoji and other Unicode characters
/// ```
#[derive(Debug, Copy, Clone, PartialOrd, Ord, PartialEq, Eq, Hash)]
pub struct String<'heap> {
    pub value: Symbol<'heap>,
}

impl String<'_> {
    /// Returns the string value as a string slice.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, literal::StringLiteral};
    ///
    /// let heap = Heap::new();
    /// let literal = StringLiteral {
    ///     value: heap.intern_symbol("Hello, world!"),
    /// };
    ///
    /// assert_eq!(literal.as_str(), "Hello, world!");
    /// ```
    #[must_use]
    pub const fn as_str(&self) -> &str {
        self.value.as_str()
    }

    /// Returns the string value as a byte slice.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{heap::Heap, literal::StringLiteral};
    ///
    /// let heap = Heap::new();
    /// let literal = StringLiteral {
    ///     value: heap.intern_symbol("Hello"),
    /// };
    ///
    /// assert_eq!(literal.as_bytes(), b"Hello");
    /// ```
    #[must_use]
    pub const fn as_bytes(&self) -> &[u8] {
        self.value.as_bytes()
    }
}
