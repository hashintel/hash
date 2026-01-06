//! Opaque wrapper type for the MIR interpreter.

use alloc::rc::Rc;
use core::fmt::{self, Display};

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

    pub fn type_name(&self) -> impl Display {
        fmt::from_fn(|fmt| {
            // check if the inner type is a struct or tuple, in which case we elide the `()`
            // surrounding the type to remove some noise.
            let has_parens = !matches!(self.value.as_ref(), Value::Struct(_) | Value::Tuple(_));

            fmt.write_str(self.name.as_str())?;
            if has_parens {
                fmt.write_str("(")?;
            }

            let type_name = self.value.type_name();
            Display::fmt(&type_name, fmt)?;

            if has_parens {
                fmt.write_str(")")?;
            }

            Ok(())
        })
    }
}
