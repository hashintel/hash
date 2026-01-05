//! Opaque wrapper type for the MIR interpreter.

use alloc::rc::Rc;

use hashql_core::symbol::Symbol;

use super::Value;

/// An opaque wrapper around a value.
///
/// Wraps a value with a named type tag, representing nominal types or
/// newtype wrappers. The name distinguishes different opaque types even
/// when their underlying values are structurally identical.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Opaque<'heap> {
    name: Symbol<'heap>,
    value: Rc<Value<'heap>>,
}

impl<'heap> Opaque<'heap> {
    /// Creates a new opaque value with the given `name` and wrapped `value`.
    #[must_use]
    pub fn new(name: Symbol<'heap>, value: impl Into<Rc<Value<'heap>>>) -> Self {
        Self {
            name,
            value: value.into(),
        }
    }

    /// Returns the type name of this opaque value.
    #[must_use]
    pub const fn name(&self) -> Symbol<'heap> {
        self.name
    }

    /// Returns a reference to the wrapped value.
    #[must_use]
    pub fn value(&self) -> &Value<'heap> {
        &self.value
    }
}
