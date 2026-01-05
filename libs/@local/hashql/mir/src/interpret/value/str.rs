//! String representation for the MIR interpreter.

use alloc::rc::Rc;

use hashql_core::{symbol::Symbol, value::String};

/// Internal storage for string values.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum StrInner<'heap> {
    Owned(Rc<str>),
    Borrowed(Symbol<'heap>),
}

/// A string value.
///
/// Supports both owned strings (via [`Rc<str>`]) and borrowed interned
/// symbols. This dual representation allows efficient handling of both
/// dynamically created strings and compile-time literals.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Str<'heap> {
    inner: StrInner<'heap>,
}

impl Str<'_> {
    /// Returns this string as a string slice.
    #[must_use]
    pub fn as_str(&self) -> &str {
        match &self.inner {
            StrInner::Owned(value) => value,
            StrInner::Borrowed(value) => value.as_str(),
        }
    }
}

impl<'heap> From<String<'heap>> for Str<'heap> {
    fn from(value: String<'heap>) -> Self {
        Self {
            inner: StrInner::Borrowed(value.as_symbol()),
        }
    }
}
