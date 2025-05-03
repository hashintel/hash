use hashql_core::symbol::InternedSymbol;

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
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct StringLiteral<'heap> {
    pub value: InternedSymbol<'heap>,
}

impl StringLiteral<'_> {
    /// Returns the string value as a string slice.
    #[must_use]
    pub const fn as_str(&self) -> &str {
        self.value.as_str()
    }
}
