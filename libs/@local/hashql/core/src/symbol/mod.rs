//! Symbol representation and manipulation for HashQL.
//!
//! This module defines dedicated types for representing symbols in HashQL's compilation process.
//! Symbols are string-like values that appear in source code, such as identifiers, keywords,
//! and literals. They are deliberately kept separate from the syntax tree as they are used through
//! the different stages of compilation.
//!
//! The module provides:
//!
//! - [`Symbol`]: An opaque wrapper around string data that enables efficient storage and comparison
//! - [`Ident`]: A named identifier with source location and categorization
//! - [`IdentKind`]: Classification of different identifier types in HashQL
//!
//! ## Design Philosophy
//!
//! The [`Symbol`] type is designed as an opaque wrapper around its internal string storage.
//! This encapsulation enables future optimizations such as string interning (either through
//! the `string_interner` crate or a custom implementation) without requiring API changes.

use core::{
    borrow::Borrow,
    cmp::Ordering,
    fmt::{self, Display, Formatter},
    hash::{Hash, Hasher},
    ptr,
};

use ecow::EcoString;

use crate::span::SpanId;

/// A string-like value used throughout the HashQL compiler.
///
/// Symbols represent string data that appears in source code and persists throughout
/// compilation, they are read-only and immutable.
///
/// This type is deliberately opaque to hide its internal representation,
/// allowing for future optimizations like string interning without changing
/// the public API. Symbols are designed to be efficient for long-lived objects
/// that are frequently compared, hashed, and referenced during compilation.
///
/// # Examples
///
/// ```
/// # use hashql_core::symbol::Symbol;
/// let variable_name = Symbol::new("counter");
/// let function_name = Symbol::new("calculate_total");
///
/// assert_eq!(variable_name.as_str(), "counter");
/// assert_ne!(variable_name, function_name);
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Symbol(EcoString);

impl Symbol {
    /// Creates a new symbol from a string-like value.
    ///
    /// Converts the input to an internal representation optimized for the compiler's
    /// symbol handling. The input is copied, so the original string doesn't need to
    /// be kept alive.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::symbol::Symbol;
    /// let from_str = Symbol::new("variable");
    /// let from_string = Symbol::new(String::from("function"));
    /// ```
    #[must_use]
    pub fn new(name: impl AsRef<str>) -> Self {
        Self(EcoString::from(name.as_ref()))
    }

    /// Creates a new symbol from a static string literal.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::symbol::Symbol;
    /// let keyword = Symbol::new_static("function");
    /// assert_eq!(keyword.as_str(), "function");
    /// ```
    #[must_use]
    pub const fn new_static(name: &'static str) -> Self {
        Self(EcoString::inline(name))
    }

    /// Creates a new symbol from an iterator of characters.
    ///
    /// This method builds a symbol by collecting characters from the provided iterator,
    /// which is useful when constructing symbols dynamically or character-by-character.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::symbol::Symbol;
    /// let chars = ['s', 'y', 'm', 'b', 'o', 'l'];
    /// let symbol = Symbol::from_chars(chars);
    /// assert_eq!(symbol.as_str(), "symbol");
    ///
    /// // Can also be used with iterators that produce characters
    /// let filtered = "A-B-C".chars().filter(|&c| c != '-');
    /// let symbol = Symbol::from_chars(filtered);
    /// assert_eq!(symbol.as_str(), "ABC");
    /// ```
    pub fn from_chars(iter: impl IntoIterator<Item = char>) -> Self {
        Self(EcoString::from_iter(iter))
    }

    /// Returns the symbol's content as a string slice.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::symbol::Symbol;
    /// let symbol = Symbol::new("identifier");
    /// assert_eq!(symbol.as_str(), "identifier");
    /// ```
    #[must_use]
    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }

    /// Returns the symbol's content as a byte slice.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::symbol::Symbol;
    /// let symbol = Symbol::new("test");
    /// assert_eq!(symbol.as_bytes(), b"test");
    /// ```
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        self.0.as_bytes()
    }

    /// Appends a single character to this symbol, modifying it in place.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::symbol::Symbol;
    /// let mut symbol = Symbol::new("abc");
    /// symbol.push('d');
    /// assert_eq!(symbol.as_str(), "abcd");
    /// ```
    pub fn push(&mut self, char: char) {
        self.0.push(char);
    }

    /// Appends a string-like value to this symbol, modifying it in place.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::symbol::Symbol;
    /// let mut symbol = Symbol::new("prefix_");
    /// symbol.push_str("suffix");
    /// assert_eq!(symbol.as_str(), "prefix_suffix");
    /// ```
    pub fn push_str(&mut self, string: impl AsRef<str>) {
        self.0.push_str(string.as_ref());
    }
}

// Sound because Symbol is a newtype wrapper around EcoString
impl Borrow<str> for Symbol {
    fn borrow(&self) -> &str {
        self.as_str()
    }
}

impl AsRef<str> for Symbol {
    fn as_ref(&self) -> &str {
        self.as_str()
    }
}

impl Display for Symbol {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.0, fmt)
    }
}

#[expect(clippy::renamed_function_params)]
impl fmt::Write for Symbol {
    #[inline]
    fn write_str(&mut self, string: &str) -> fmt::Result {
        EcoString::write_str(&mut self.0, string)
    }

    #[inline]
    fn write_char(&mut self, char: char) -> fmt::Result {
        EcoString::write_char(&mut self.0, char)
    }
}

/// A string-like value used throughout the HashQL compiler.
///
/// Symbols represent string data that appears in source code and persists throughout
/// compilation, they are read-only and immutable.
///
/// This type is deliberately opaque to hide its internal representation,
/// allowing for future optimizations like string interning without changing
/// the public API. Symbols are designed to be efficient for long-lived objects
/// that are frequently compared, hashed, and referenced during compilation.
///
/// The caller must ensure that the string is unique and interned. The types correctness requires
/// relies on these *but it does not enforce it*.
///
/// This type is the next generation of symbols, and scheduled to replace the current
/// implementation.
#[derive(Debug, Copy, Clone)]
pub struct InternedSymbol<'heap>(&'heap str);

impl<'heap> InternedSymbol<'heap> {
    /// Creates a new interned symbol from a string slice.
    ///
    /// The caller must ensure that the string is unique and interned.
    pub(crate) const fn new_unchecked(string: &'heap str) -> Self {
        Self(string)
    }

    #[must_use]
    pub const fn as_str(&self) -> &str {
        self.0
    }
}

impl PartialEq for InternedSymbol<'_> {
    fn eq(&self, other: &Self) -> bool {
        // Pointer equality implies string equality (due to the unique contents assumption)
        ptr::eq(self.0, other.0)
    }
}

impl Eq for InternedSymbol<'_> {}

impl PartialOrd for InternedSymbol<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for InternedSymbol<'_> {
    fn cmp(&self, other: &Self) -> Ordering {
        // Pointer equality implies string equality (due to the unique contents assumption), but if
        // not the same the contents must be compared.
        if self == other {
            Ordering::Equal
        } else {
            self.0.cmp(other.0)
        }
    }
}

impl Hash for InternedSymbol<'_> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        // Pointer hashing is sufficient (due to the unique contents assumption)
        ptr::hash(self.0, state);
    }
}

impl Borrow<str> for InternedSymbol<'_> {
    fn borrow(&self) -> &str {
        self.0
    }
}

impl AsRef<str> for InternedSymbol<'_> {
    fn as_ref(&self) -> &str {
        self.0
    }
}

/// The classification of an identifier in HashQL.
///
/// HashQL supports different categories of identifiers, each with distinct
/// syntactic rules and semantic meanings in the language.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum IdentKind {
    /// A lexical identifier following standard programming language naming rules.
    ///
    /// # Syntax
    ///
    /// Lexical identifiers in HashQL follow Rust's identifier parsing rules:
    /// - Begin with either an `XID_Start` Unicode character or an underscore (`_`)
    /// - Continue with zero or more `XID_Continue` Unicode characters
    /// - Cannot be a single underscore character (`_`)
    /// - Uppercase identifiers are used for types, while lowercase identifiers are used for values,
    ///   identifiers starting with an underscore (`_`) are considered lowercase.
    ///
    /// In formal notation:
    /// ```text
    /// IDENTIFIER_LEXICAL:
    ///     XID_Start XID_Continue*
    ///     | '_' XID_Continue+
    /// ```
    ///
    /// > Note: Zero-width characters are not allowed.
    ///
    /// > Note: All identifiers are normalized using Unicode Normalization Form C (NFC).
    ///
    /// # Examples
    ///
    /// ```text
    /// counter
    /// _identifier
    /// Москва        // Non-ASCII identifiers are supported
    /// 東京           // As are other scripts
    /// ```
    Lexical,

    /// A symbolic identifier consisting of operator-like characters.
    ///
    /// # Syntax
    ///
    /// Symbol identifiers can consist of ASCII operators or Unicode symbols/punctuation:
    ///
    /// ```text
    /// ASCII_SYMBOL:
    ///       '!' | '#' | '$' | '%' | '&'
    ///     | '*' | '+' | '.' | '/' | '<'
    ///     | '=' | '>' | '?' | '@' | '\'
    ///     | '^' | '|' | '-' | '~'
    ///
    /// RESERVED_SYMBOL:
    ///     ':'
    ///
    /// ; Excludes any symbols that are in the ASCII range
    /// UNICODE_SYMBOL:
    ///     Symbol
    ///     | Punctuation
    ///
    /// SYMBOL:
    ///     ASCII_SYMBOL
    ///     | UNICODE_SYMBOL
    ///
    /// IDENTIFIER_SYMBOL:
    ///     SYMBOL+
    ///     | '`' SYMBOL+ '`'
    /// ```
    ///
    /// > Note: `:` is reserved, and cannot be used as a symbol identifier.
    ///
    /// > Note: All identifiers are normalized using Unicode Normalization Form C (NFC).
    ///
    /// # Examples
    ///
    /// ```text
    /// <
    /// +
    /// ->
    /// ≥
    /// →
    /// `*`
    /// ```
    Symbol,

    /// An identifier representing a URL for external resource references.
    ///
    /// # Syntax
    ///
    /// Base URL identifiers must be valid `http` or `https` URLs that end with a forward slash
    /// (`/`), and must be enclosed within backticks:
    ///
    /// ```text
    /// IDENTIFIER_BASE_URL:
    ///     '`' HTTP_URL_STRING_ENDING_WITH_SLASH '`'
    /// ```
    ///
    /// > Note: All identifiers are normalized using Unicode Normalization Form C (NFC).
    ///
    /// # Examples
    ///
    /// ```text
    /// `https://blockprotocol.org/@blockprotocol/types/property-type/address/`
    /// `https://example.com/resources/schema/`
    /// `http://localhost:8080/api/v1/`
    /// ```
    BaseUrl,
}

/// A named identifier in HashQL with source location information.
///
/// An `Ident` combines a [`Symbol`] (the textual content of the identifier)
/// with a [`SpanId`] (its location in the source code) and a [`IdentKind`]
/// (its syntactic classification). Identifiers are used throughout the compiler
/// to represent variables, functions, types, and other named entities.
///
/// # Examples
///
/// In HashQL source code:
///
/// ```text
/// let counter = 0;
///     ^^^^^^^
/// ```
///
/// This identifier would be represented as an `Ident` with:
/// - name: `Symbol("counter")`
/// - kind: `IdentKind::Lexical`
/// - span: `5..12`
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Ident {
    pub span: SpanId,

    pub value: Symbol,
    pub kind: IdentKind,
}

impl AsRef<str> for Ident {
    fn as_ref(&self) -> &str {
        self.value.as_str()
    }
}

impl Display for Ident {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.value.0, fmt)
    }
}
