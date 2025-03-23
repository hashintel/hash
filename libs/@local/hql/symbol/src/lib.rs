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

use std::sync::Mutex;

use bumpalo::Bump;
use hql_span::SpanId;
use indexmap::IndexSet;

/// String interner
///
/// adapted from <https://github.com/rust-lang/rust/blob/master/compiler/rustc_span/src/symbol.rs#L2604>
#[derive(Debug)]
pub struct Interner {
    arena: Bump,
    strings: Mutex<IndexSet<&'static str, gxhash::GxBuildHasher>>,
}

impl Interner {
    #[must_use]
    pub fn new() -> Self {
        Self {
            arena: Bump::new(),
            strings: Mutex::new(IndexSet::with_hasher(gxhash::GxBuildHasher::default())),
        }
    }

    #[expect(clippy::cast_possible_truncation)]
    #[must_use]
    pub fn intern(&self, string: &str) -> Symbol {
        let mut strings = self.strings.lock().expect("mutex should not be poisened");
        if let Some(index) = strings.get_index_of(string) {
            drop(strings);
            return Symbol(index as u32);
        }

        let string: &str = self.arena.alloc_str(string);

        // SAFETY: we can extend the arena allocation to `'static` because we
        // only access these while the arena is still alive.
        #[expect(unsafe_code)]
        let string: &'static str = unsafe { &*core::ptr::from_ref::<str>(string) };

        let (index, is_new) = strings.insert_full(string);
        drop(strings);
        debug_assert!(is_new);

        Symbol(index as u32)
    }

    pub fn resolve(&self, symbol: Symbol) -> &str {
        // The shorten the lifetime here from &'static to &'self, therefore the whole thing we're
        // doing here is safe.
        // The returned string will only be valid as long as the arena is alive.
        self.strings
            .lock()
            .expect("mutex should not be poisened")
            .get_index(symbol.0 as usize)
            .expect("symbol should be valid")
    }
}

impl Default for Interner {
    fn default() -> Self {
        Self::new()
    }
}

/// Represents a symbol in HashQL.
///
/// This type is deliberately opaque to hide its internal representation,
/// allowing for future optimizations like string interning without changing
/// the public API. Symbols are designed to be efficient for long-lived objects
/// that are frequently referenced throughout the compilation process.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Symbol(u32);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Ident {
    pub span: SpanId,

    pub name: Symbol,
}
