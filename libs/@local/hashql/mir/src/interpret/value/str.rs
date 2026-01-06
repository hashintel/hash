//! String representation for the MIR interpreter.

use alloc::rc::Rc;

use hashql_core::{symbol::Symbol, value::String};

/// Internal storage for string values.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum StrInner<'heap> {
    Owned(Rc<str>),
    Interned(Symbol<'heap>),
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

impl<'heap> Str<'heap> {
    /// Returns this string as a string slice.
    #[must_use]
    pub fn as_str(&self) -> &str {
        match &self.inner {
            StrInner::Owned(value) => value,
            StrInner::Interned(value) => value.as_str(),
        }
    }

    pub const fn as_ref(&self) -> StrRef<'_, 'heap> {
        match &self.inner {
            StrInner::Owned(value) => StrRef {
                inner: StrRefInner::Borrowed(value),
            },
            &StrInner::Interned(value) => StrRef {
                inner: StrRefInner::Interned(value),
            },
        }
    }
}

impl<'heap> From<String<'heap>> for Str<'heap> {
    fn from(value: String<'heap>) -> Self {
        Self {
            inner: StrInner::Interned(value.as_symbol()),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum StrRefInner<'value, 'heap> {
    Borrowed(&'value Rc<str>),
    Interned(Symbol<'heap>),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct StrRef<'value, 'heap> {
    inner: StrRefInner<'value, 'heap>,
}

impl<'heap> StrRef<'_, 'heap> {
    /// Returns this string as a string slice.
    #[must_use]
    pub fn as_str(&self) -> &str {
        match &self.inner {
            StrRefInner::Borrowed(value) => value,
            StrRefInner::Interned(value) => value.as_str(),
        }
    }

    pub fn into_owned(self) -> Str<'heap> {
        match self.inner {
            StrRefInner::Borrowed(value) => Str {
                inner: StrInner::Owned(Rc::clone(value)),
            },
            StrRefInner::Interned(value) => Str {
                inner: StrInner::Interned(value),
            },
        }
    }
}
