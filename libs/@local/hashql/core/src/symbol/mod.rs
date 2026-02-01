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
//! - [`SymbolTable`]: A mapping from identifiers to symbols optimized for different access patterns
//! - [`Ident`]: A named identifier with source location and categorization
//! - [`IdentKind`]: Classification of different identifier types in HashQL
//!
//! ## Design Philosophy
//!
//! The [`Symbol`] type is designed as an opaque wrapper around its internal string storage.
//! This encapsulation enables future optimizations such as string interning (either through
//! the `string_interner` crate or a custom implementation) without requiring API changes.

mod lookup;
mod repr;
pub mod sym;
mod table;

use core::{
    cmp::Ordering,
    fmt::{self, Display, Formatter},
    hash::{Hash, Hasher},
    marker::PhantomData,
};

pub use self::lookup::SymbolLookup;
use self::repr::{ConstantSymbol, Repr};
pub(crate) use self::table::SymbolTable;
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
/// The caller must ensure that the string is unique and interned. The types correctness requires
/// relies on these *but it does not enforce it*.
#[derive(Debug, Copy, Clone)]
pub struct Symbol<'heap> {
    repr: Repr,
    _marker: PhantomData<&'heap ()>,
}

#[expect(unsafe_code)]
impl<'heap> Symbol<'heap> {
    #[inline]
    const fn new_constant_unchecked(index: usize) -> Self {
        Symbol {
            repr: Repr::constant(ConstantSymbol::new_unchecked(index)),
            _marker: PhantomData,
        }
    }

    #[inline]
    pub(crate) const unsafe fn from_repr(repr: Repr) -> Self {
        Symbol {
            repr,
            _marker: PhantomData,
        }
    }

    #[inline]
    const fn into_repr(self) -> Repr {
        self.repr
    }

    #[must_use]
    #[inline]
    pub fn as_str(&self) -> &str {
        // SAFETY: Symbol carries a `'heap` lifetime, that is tied to the allocation of the string.
        unsafe { self.repr.as_str() }
    }

    /// Returns the string representation of the symbol.
    ///
    /// Unlike [`Self::as_str`], this method provides access for the lifetime of the interner
    /// instead of the symbol itself, somewhat circumventing the protections given to the symbol
    /// itself. Any unwrapped type should be considered no longer unique and interned.
    #[must_use]
    #[inline]
    pub fn unwrap(self) -> &'heap str {
        // SAFETY: Symbol carries a `'heap` lifetime, that is tied to the allocation of the string.
        unsafe { self.repr.as_str() }
    }

    #[must_use]
    #[inline]
    pub fn as_bytes(&self) -> &[u8] {
        // SAFETY: Symbol carries a `'heap` lifetime, that is tied to the allocation of the string.
        unsafe { self.repr.as_bytes() }
    }

    #[must_use]
    #[inline]
    pub fn demangle(self) -> &'heap str {
        let value = self.unwrap();

        value.rsplit_once(':').map_or(value, |(name, _)| name)
    }
}

impl AsRef<Self> for Symbol<'_> {
    #[inline]
    fn as_ref(&self) -> &Self {
        self
    }
}

impl PartialEq for Symbol<'_> {
    fn eq(&self, other: &Self) -> bool {
        // Pointer equality implies string equality (due to the unique contents assumption)
        self.repr == other.repr
    }
}

impl Eq for Symbol<'_> {}

impl PartialOrd for Symbol<'_> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Symbol<'_> {
    fn cmp(&self, other: &Self) -> Ordering {
        // Pointer equality implies string equality (due to the unique contents assumption), but if
        // not the same the contents must be compared.
        if self == other {
            Ordering::Equal
        } else {
            self.as_str().cmp(other.as_str())
        }
    }
}

impl Hash for Symbol<'_> {
    fn hash<H: Hasher>(&self, state: &mut H) {
        // Pointer hashing is sufficient (due to the unique contents assumption)
        Hash::hash(&self.repr, state);
    }
}

impl Display for Symbol<'_> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        Display::fmt(self.as_str(), fmt)
    }
}

/// The classification of an identifier in HashQL.
///
/// HashQL supports different categories of identifiers, each with distinct
/// syntactic rules and semantic meanings in the language.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
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
    ///     | '^' | '|' | '-' | '~' | '['
    ///     | ']'
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
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Ident<'heap> {
    pub span: SpanId,

    pub value: Symbol<'heap>,
    pub kind: IdentKind,
}

impl<'heap> Ident<'heap> {
    #[must_use]
    pub const fn synthetic(value: Symbol<'heap>) -> Self {
        Self {
            span: SpanId::SYNTHETIC,
            value,
            kind: IdentKind::Lexical,
        }
    }
}

impl AsRef<str> for Ident<'_> {
    fn as_ref(&self) -> &str {
        self.value.as_str()
    }
}

impl Display for Ident<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.value.as_str(), fmt)
    }
}
