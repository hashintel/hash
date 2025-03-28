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
use core::{fmt, fmt::Display};

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
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
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
    /// UNICODE_SYMBOL:
    ///     Symbol
    ///     | Punctuation
    ///
    /// SYMBOL:
    ///     (ASCII_SYMBOL
    ///     | UNICODE_SYMBOL)
    ///     & NOT(RESERVED_SYMBOL)
    ///
    /// IDENTIFIER_SYMBOL:
    ///     SYMBOL+
    ///     | '`' SYMBOL+ '`'
    /// ```
    ///
    /// > Note: `:` is reserved, and cannot be used as a symbol identifier.
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

    pub name: Symbol,
    pub kind: IdentKind,
}

impl Display for Ident {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.name.0, fmt)
    }
}
