//! Opaque wrapper type for the MIR interpreter.

use alloc::rc::Rc;
use core::{
    alloc::Allocator,
    cmp,
    fmt::{self, Display},
};

use hashql_core::symbol::Symbol;

use super::Value;

/// An opaque wrapper around a value.
///
/// Wraps a value with a named type tag, representing nominal types or
/// newtype wrappers. The name distinguishes different opaque types even
/// when their underlying values are structurally identical.
#[derive(Debug, Clone)]
pub struct Opaque<'heap, A: Allocator> {
    name: Symbol<'heap>,
    value: Rc<Value<'heap, A>, A>,
}

impl<'heap, A: Allocator> Opaque<'heap, A> {
    /// Creates a new opaque value with the given `name` and wrapped `value`.
    #[must_use]
    pub fn new(name: Symbol<'heap>, value: impl Into<Rc<Value<'heap, A>, A>>) -> Self {
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
    pub fn value(&self) -> &Value<'heap, A> {
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

impl<A: Allocator> PartialEq for Opaque<'_, A> {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        let Self { name, value } = self;
        *name == other.name && *value == other.value
    }
}

impl<A: Allocator> Eq for Opaque<'_, A> {}

impl<A: Allocator> PartialOrd for Opaque<'_, A> {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl<A: Allocator> Ord for Opaque<'_, A> {
    #[inline]
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        let Self { name, value } = self;

        name.cmp(&other.name).then_with(|| value.cmp(&other.value))
    }
}
