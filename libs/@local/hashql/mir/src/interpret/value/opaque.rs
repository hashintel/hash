//! Opaque wrapper type for the MIR interpreter.

use alloc::rc::Rc;
use core::{
    alloc::Allocator,
    cmp,
    fmt::{self, Display},
};

use hashql_core::symbol::Symbol;

use super::Value;

/// An opaque wrapper around a [`Value`].
///
/// Pairs a [`Symbol`] name with an inner value to represent nominal types
/// (newtypes, branded types). Two opaques with the same inner value but
/// different names are not equal.
///
/// # Examples
///
/// ```
/// use hashql_mir::interpret::value::{Opaque, Value};
/// # use hashql_core::heap::Heap;
/// # extern crate alloc;
/// # use alloc::rc::Rc;
///
/// let heap = Heap::new();
/// let name = heap.intern_symbol("UserId");
/// let inner = Rc::new(Value::Integer(42.into()));
///
/// let opaque = Opaque::new(name, inner);
/// assert_eq!(opaque.name().as_str(), "UserId");
/// assert_eq!(opaque.value(), &Value::Integer(42.into()));
/// ```
#[derive(Debug, Clone)]
pub struct Opaque<'heap, A: Allocator> {
    name: Symbol<'heap>,
    value: Rc<Value<'heap, A>, A>,
}

impl<'heap, A: Allocator> Opaque<'heap, A> {
    /// Creates a new opaque value with the given `name` and wrapped `value`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::interpret::value::{Opaque, Value};
    /// # use hashql_core::heap::Heap;
    /// # extern crate alloc;
    /// # use alloc::rc::Rc;
    ///
    /// let heap = Heap::new();
    /// let opaque = Opaque::new(
    ///     heap.intern_symbol("Meters"),
    ///     Rc::new(Value::Integer(100.into())),
    /// );
    /// assert_eq!(opaque.name().as_str(), "Meters");
    /// ```
    #[inline]
    #[must_use]
    pub fn new(name: Symbol<'heap>, value: impl Into<Rc<Value<'heap, A>, A>>) -> Self {
        Self {
            name,
            value: value.into(),
        }
    }

    /// Returns the type name of this opaque value.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::interpret::value::{Opaque, Value};
    /// # use hashql_core::heap::Heap;
    /// # extern crate alloc;
    /// # use alloc::rc::Rc;
    ///
    /// let heap = Heap::new();
    /// let opaque = Opaque::new(
    ///     heap.intern_symbol("UserId"),
    ///     Rc::new(Value::Integer(1.into())),
    /// );
    /// assert_eq!(opaque.name().as_str(), "UserId");
    /// ```
    #[inline]
    #[must_use]
    pub const fn name(&self) -> Symbol<'heap> {
        self.name
    }

    /// Returns a reference to the wrapped value.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::interpret::value::{Opaque, Value};
    /// # use hashql_core::heap::Heap;
    /// # extern crate alloc;
    /// # use alloc::rc::Rc;
    ///
    /// let heap = Heap::new();
    /// let opaque = Opaque::new(
    ///     heap.intern_symbol("Tag"),
    ///     Rc::new(Value::Integer(42.into())),
    /// );
    /// assert_eq!(opaque.value(), &Value::Integer(42.into()));
    /// ```
    #[inline]
    #[must_use]
    pub fn value(&self) -> &Value<'heap, A> {
        &self.value
    }

    /// Returns a mutable reference to the wrapped value.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::interpret::value::{Opaque, Value};
    /// # use hashql_core::heap::Heap;
    /// # extern crate alloc;
    /// # use alloc::rc::Rc;
    ///
    /// let heap = Heap::new();
    /// let name = heap.intern_symbol("Counter");
    /// let mut opaque = Opaque::new(name, Rc::new(Value::Integer(0.into())));
    ///
    /// *opaque.value_mut() = Value::Integer(42.into());
    /// assert_eq!(opaque.value(), &Value::Integer(42.into()));
    /// ```
    #[must_use]
    pub fn value_mut(&mut self) -> &mut Value<'heap, A>
    where
        A: Clone,
    {
        Rc::make_mut(&mut self.value)
    }

    /// Extracts the inner [`Value`], discarding the name.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::interpret::value::{Opaque, Value};
    /// # use hashql_core::heap::Heap;
    /// # extern crate alloc;
    /// # use alloc::rc::Rc;
    ///
    /// let heap = Heap::new();
    /// let name = heap.intern_symbol("UserId");
    /// let opaque = Opaque::new(name, Rc::new(Value::Integer(42.into())));
    ///
    /// let inner = opaque.into_value();
    /// assert_eq!(inner, Value::Integer(42.into()));
    /// ```
    pub fn into_value(self) -> Value<'heap, A>
    where
        A: Clone,
    {
        Rc::unwrap_or_clone(self.value)
    }

    /// Returns a displayable representation of this opaque type's name.
    ///
    /// The format is `Name(InnerType)` for most inner values, or
    /// `Name(field: Type, ...)` when the inner value is a struct or tuple
    /// (parentheses from the inner type are reused).
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::interpret::value::{Opaque, Value};
    /// # use hashql_core::heap::Heap;
    /// # extern crate alloc;
    /// # use alloc::rc::Rc;
    ///
    /// let heap = Heap::new();
    /// let name = heap.intern_symbol("UserId");
    /// let opaque = Opaque::new(name, Rc::new(Value::Integer(42.into())));
    /// assert_eq!(opaque.type_name().to_string(), "UserId(Integer)");
    /// ```
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
