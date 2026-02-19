//! Symbol representation and manipulation for HashQL.
//!
//! This module defines dedicated types for representing symbols in HashQL's compilation process.
//! Symbols are string-like values that appear in source code, such as identifiers, keywords,
//! and literals. They are deliberately kept separate from the syntax tree as they are used through
//! the different stages of compilation.
//!
//! The module provides:
//!
//! - [`Symbol`]: An interned string reference used throughout the compiler
//! - [`ConstantSymbol`]: A wrapper for predefined symbols, enabling pattern matching
//! - [`SymbolLookup`]: A mapping from identifiers to symbols optimized for different access
//!   patterns
//! - [`Ident`]: A named identifier with source location and categorization
//! - [`IdentKind`]: Classification of different identifier types in HashQL
//!
//! # Pattern Matching on Predefined Symbols
//!
//! Use [`Symbol::as_constant()`] to match against predefined symbols from the [`sym`] module:
//!
//! ```
//! # use hashql_core::symbol::{Symbol, sym};
//! fn classify(symbol: Symbol<'_>) -> &'static str {
//!     match symbol.as_constant() {
//!         Some(sym::r#let::CONST) => "let keyword",
//!         Some(sym::r#if::CONST) => "if keyword",
//!         Some(sym::Integer::CONST) => "Integer type",
//!         _ => "other",
//!     }
//! }
//! ```

mod lookup;
mod repr;
pub mod sym;
mod table;

use core::{
    cmp::Ordering,
    fmt::{self, Debug, Display, Formatter},
    hash::Hash,
    marker::PhantomData,
};

pub use self::lookup::SymbolLookup;
use self::repr::{ConstantRepr, Repr};
pub(crate) use self::table::SymbolTable;
use crate::span::SpanId;

/// A predefined symbol that can be used in pattern matching.
///
/// This is a structural wrapper around a constant symbol index, designed to
/// enable exhaustive pattern matching on predefined symbols. Unlike [`Symbol`],
/// which uses a tagged pointer that cannot appear in const patterns, `ConstantSymbol`
/// is a simple newtype over an index that derives [`PartialEq`] and [`Eq`] structurally.
///
/// # Usage
///
/// Obtained via [`Symbol::as_constant()`], then matched against `sym::NAME::CONST`:
///
/// ```
/// # use hashql_core::symbol::{Symbol, ConstantSymbol, sym};
/// fn handle_keyword(sym: Symbol<'_>) {
///     if let Some(c) = sym.as_constant() {
///         match c {
///             sym::r#let::CONST => println!("let keyword"),
///             sym::r#fn::CONST => println!("fn keyword"),
///             _ => {}
///         }
///     }
/// }
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ConstantSymbol {
    repr: ConstantRepr,
}

impl ConstantSymbol {
    /// Creates a `ConstantSymbol` from a raw index without bounds checking.
    ///
    /// This is used by the [`sym`] macro to generate constant symbol definitions.
    /// The index must be valid for the static `SYMBOLS` table.
    #[inline]
    const fn new_unchecked(index: usize) -> Self {
        Self {
            repr: ConstantRepr::new_unchecked(index),
        }
    }

    #[inline]
    const fn from_repr(repr: ConstantRepr) -> Self {
        Self { repr }
    }
}

/// An interned string reference used throughout the HashQL compiler.
///
/// Symbols represent string data that appears in source code and persists throughout
/// compilation. They are read-only, immutable, and designed for efficient comparison
/// and hashing.
///
/// # Pattern Matching
///
/// Use [`as_constant()`](Self::as_constant) to extract a [`ConstantSymbol`] for pattern
/// matching against predefined symbols from the [`sym`] module.
// We can rely on the derives for PartialEq, Eq, and Hash, as `_marker` is ignored, and the
// internal representation makes a pointer comparison.
#[derive(Copy, Clone, PartialEq, Eq, Hash)]
pub struct Symbol<'heap> {
    repr: Repr,
    _marker: PhantomData<&'heap ()>,
}

#[expect(unsafe_code)]
impl<'heap> Symbol<'heap> {
    #[inline]
    const fn from_constant(constant: ConstantSymbol) -> Self {
        Self {
            repr: Repr::constant(constant.repr),
            _marker: PhantomData,
        }
    }

    /// Creates a [`Symbol`] from a raw [`Repr`].
    ///
    /// # Safety
    ///
    /// The caller must ensure:
    ///
    /// - For runtime symbols: the [`Repr`] must point to a valid allocation that remains live for
    ///   the `'heap` lifetime.
    /// - For constant symbols: the [`Repr`] must encode a valid index into the static symbol table.
    /// - The symbol must be properly interned (unique string content maps to unique [`Repr`]).
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

    /// Returns the constant symbol representation if this is a predefined symbol.
    ///
    /// Use this to pattern match against predefined symbols from the [`sym`] module:
    ///
    /// ```
    /// # use hashql_core::symbol::{Symbol, sym};
    /// fn is_keyword(sym: Symbol<'_>) -> bool {
    ///     matches!(
    ///         sym.as_constant(),
    ///         Some(sym::r#let::CONST | sym::r#if::CONST | sym::r#fn::CONST)
    ///     )
    /// }
    /// ```
    ///
    /// Returns [`None`] for runtime (heap-allocated) symbols.
    pub fn as_constant(self) -> Option<ConstantSymbol> {
        self.repr
            .try_as_constant_symbol()
            .map(ConstantSymbol::from_repr)
    }

    /// Returns the string content of this symbol.
    ///
    /// The returned reference is valid for the lifetime of this symbol. For access with the
    /// full `'heap` lifetime, use [`unwrap()`](Self::unwrap) instead.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::symbol::sym;
    /// assert_eq!(sym::Integer.as_str(), "Integer");
    /// assert_eq!(sym::r#let.as_str(), "let");
    /// ```
    ///
    /// ```
    /// # use hashql_core::heap::Heap;
    /// let heap = Heap::new();
    /// let symbol = heap.intern_symbol("hello");
    /// assert_eq!(symbol.as_str(), "hello");
    /// ```
    #[must_use]
    #[inline]
    pub fn as_str(&self) -> &str {
        // SAFETY: Symbol carries a `'heap` lifetime, that is tied to the allocation of the string.
        unsafe { self.repr.as_str() }
    }

    /// Returns the string content with the full heap lifetime.
    ///
    /// Unlike [`as_str()`](Self::as_str), this method returns a reference with the `'heap`
    /// lifetime rather than the symbol's own lifetime. This is useful when the string needs
    /// to outlive the symbol itself.
    ///
    /// Note that the returned string should be treated as no longer subject to the interning
    /// guarantee—it's just a plain `&str`.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::symbol::sym;
    /// let s: &'static str = sym::Integer.unwrap();
    /// assert_eq!(s, "Integer");
    /// ```
    #[must_use]
    #[inline]
    pub fn unwrap(self) -> &'heap str {
        // SAFETY: Symbol carries a `'heap` lifetime, that is tied to the allocation of the string.
        unsafe { self.repr.as_str() }
    }

    /// Returns the raw bytes of this symbol's string content.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::symbol::sym;
    /// assert_eq!(sym::Integer.as_bytes(), b"Integer");
    /// ```
    #[must_use]
    #[inline]
    pub fn as_bytes(&self) -> &[u8] {
        // SAFETY: Symbol carries a `'heap` lifetime, that is tied to the allocation of the string.
        unsafe { self.repr.as_bytes() }
    }

    /// Returns the demangled name, stripping any suffix after the last `:`.
    ///
    /// This is used for symbols with mangled names (e.g., `"foo:123"` → `"foo"`).
    /// If there is no `:`, returns the full symbol content.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::heap::Heap;
    /// let heap = Heap::new();
    ///
    /// let mangled = heap.intern_symbol("variable:42");
    /// assert_eq!(mangled.demangle(), "variable");
    ///
    /// let plain = heap.intern_symbol("plain_name");
    /// assert_eq!(plain.demangle(), "plain_name");
    ///
    /// let multiple = heap.intern_symbol("a:b:c");
    /// assert_eq!(multiple.demangle(), "a:b");
    /// ```
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

impl Debug for Symbol<'_> {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> fmt::Result {
        fmt.debug_tuple("Symbol").field(&self.as_str()).finish()
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
    /// Creates a synthetic identifier with no source location.
    ///
    /// Synthetic identifiers are used for compiler-generated names that don't
    /// correspond to any location in source code.
    ///
    /// # Examples
    ///
    /// ```
    /// # use hashql_core::symbol::{Ident, IdentKind, sym};
    /// # use hashql_core::span::SpanId;
    /// let ident = Ident::synthetic(sym::foo);
    ///
    /// assert_eq!(ident.span, SpanId::SYNTHETIC);
    /// assert_eq!(ident.value, sym::foo);
    /// assert_eq!(ident.kind, IdentKind::Lexical);
    /// assert_eq!(ident.as_ref(), "foo");
    /// ```
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

const _: () = {
    assert!(size_of::<Symbol>() == size_of::<usize>());
    assert!(size_of::<Option<Symbol>>() == size_of::<usize>());
};

#[cfg(test)]
mod tests {
    #![expect(clippy::min_ident_chars, clippy::many_single_char_names)]
    use core::{cmp::Ordering, hash::BuildHasher as _};
    use std::hash::RandomState;

    use super::sym;
    use crate::heap::Heap;

    #[test]
    fn symbol_equality() {
        let heap = Heap::new();
        let a = heap.intern_symbol("foo");
        let b = heap.intern_symbol("bar");
        let c = heap.intern_symbol("bar");
        let d = sym::Integer;
        let e = sym::String;
        let f = sym::String;

        assert_ne!(a, b);
        assert_eq!(b, c);
        assert_ne!(c, d);
        assert_ne!(d, e);
        assert_eq!(e, f);
    }

    #[test]
    fn symbol_ordering() {
        let heap = Heap::new();
        let a = heap.intern_symbol("aaa");
        let b = sym::bar;
        let c = heap.intern_symbol("ccc");

        assert_eq!(a.cmp(&b), Ordering::Less);
        assert_eq!(b.cmp(&c), Ordering::Less);
        assert_eq!(c.cmp(&a), Ordering::Greater);
        assert_eq!(b.cmp(&b), Ordering::Equal);
    }

    #[test]
    fn symbol_consistent_hashing() {
        let heap = Heap::new();
        let a = heap.intern_symbol("test");

        let hasher = RandomState::new();

        assert_eq!(hasher.hash_one(a), hasher.hash_one(a.repr));
    }

    #[test]
    fn interned_predefined_returns_constant() {
        let heap = Heap::new();
        let interned = heap.intern_symbol("let");

        assert_eq!(interned.as_constant(), Some(sym::r#let::CONST));
    }

    #[test]
    fn runtime_symbol_returns_no_constant() {
        let heap = Heap::new();
        let runtime = heap.intern_symbol("not_a_keyword");

        assert!(runtime.as_constant().is_none());
    }
}
