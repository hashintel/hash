//! Symbol handling for HashQL
//!
//! This module defines a dedicated type for representing symbols in HashQL. Symbols are
//! values, such as literals, identifiers, and keywords, that are used throughout the compilation
//! process and are deliberately kept separate from the CST to optimize their lifecycle and memory
//! usage.
//!
//! The `Symbol` type is purposely designed as an opaque wrapper to enable future optimizations
//! such as string interning (either through the `string_interner` crate or a custom implementation)
//! without requiring changes to the API.
//!
//! Unlike in Rust where symbols are in `rustc_span`, we've chosen to separate this module from
//! `hashql-span` to better represent the distinct lifecycle of symbols as long-lived objects that
//! persist across various stages of compilation.

use core::{fmt, fmt::Display};

use ecow::EcoString;
use hql_span::SpanId;

/// Represents a symbol in HashQL.
///
/// This type is deliberately opaque to hide its internal representation,
/// allowing for future optimizations like string interning without changing
/// the public API. Symbols are designed to be efficient for long-lived objects
/// that are frequently referenced throughout the compilation process.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Symbol(EcoString);

impl Symbol {
    pub fn new(name: impl AsRef<str>) -> Self {
        Self(EcoString::from(name.as_ref()))
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }

    #[expect(clippy::missing_const_for_fn, reason = "false positive")]
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        self.0.as_bytes()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Ident {
    pub span: SpanId,

    pub name: Symbol,
}

impl Display for Ident {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&self.name.0, fmt)
    }
}
