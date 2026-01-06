//! String representation for the MIR interpreter.

use alloc::{alloc::Global, rc::Rc};
use core::{alloc::Allocator, cmp};

use hashql_core::{symbol::Symbol, value::String};

/// Internal storage for string values.
#[derive(Debug, Clone)]
enum StrInner<'heap, A: Allocator> {
    Owned(Rc<str, A>),
    Interned(Symbol<'heap>),
}

impl<A: Allocator> StrInner<'_, A> {
    fn as_str(&self) -> &str {
        match self {
            StrInner::Owned(value) => value,
            StrInner::Interned(value) => value.as_str(),
        }
    }
}

impl<A: Allocator> PartialEq for StrInner<'_, A> {
    fn eq(&self, other: &Self) -> bool {
        self.as_str() == other.as_str()
    }
}

impl<A: Allocator> Eq for StrInner<'_, A> {}

impl<A: Allocator> PartialOrd for StrInner<'_, A> {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl<A: Allocator> Ord for StrInner<'_, A> {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        self.as_str().cmp(other.as_str())
    }
}

/// A string value.
///
/// Supports both owned strings (via [`Rc<str>`]) and borrowed interned
/// symbols. This dual representation allows efficient handling of both
/// dynamically created strings and compile-time literals.
#[derive(Debug, Clone)]
pub struct Str<'heap, A: Allocator = Global> {
    inner: StrInner<'heap, A>,
}

impl Str<'_> {
    /// Returns this string as a string slice.
    #[must_use]
    pub fn as_str(&self) -> &str {
        match &self.inner {
            StrInner::Owned(value) => value,
            StrInner::Interned(value) => value.as_str(),
        }
    }
}

impl<A: Allocator> PartialEq for Str<'_, A> {
    fn eq(&self, other: &Self) -> bool {
        let Self { inner } = self;
        *inner == other.inner
    }
}

impl<A: Allocator> Eq for Str<'_, A> {}

impl<A: Allocator> PartialOrd for Str<'_, A> {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl<A: Allocator> Ord for Str<'_, A> {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        let Self { inner } = self;

        inner.cmp(&other.inner)
    }
}

impl<'heap> From<String<'heap>> for Str<'heap> {
    fn from(value: String<'heap>) -> Self {
        Self {
            inner: StrInner::Interned(value.as_symbol()),
        }
    }
}
