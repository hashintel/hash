use alloc::rc::Rc;

use super::Value;
use crate::symbol::Symbol;

/// A nominal type that wraps a value with a type name.
///
/// Opaque values create distinct types from the same underlying representation.
/// Two opaque values are equal only if both their names and wrapped values are equal.
///
/// # Examples
///
/// ```
/// use hashql_core::{
///     heap::Heap,
///     value::{Integer, Primitive, String},
///     symbol::Symbol,
///     value::{Opaque, Value},
/// };
///
/// let heap = Heap::new();
/// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
/// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
///
/// let user_id = Opaque::new(heap.intern_symbol("UserId"), string("user_12345"));
/// let score = Opaque::new(heap.intern_symbol("Score"), integer("95"));
///
/// assert_eq!(user_id.name(), heap.intern_symbol("UserId"));
/// assert_eq!(user_id.value(), &string("user_12345"));
/// ```
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Opaque<'heap> {
    name: Symbol<'heap>,
    value: Rc<Value<'heap>>,
}

impl<'heap> Opaque<'heap> {
    /// Creates a new nominal type with the given name and value.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Opaque, Primitive, String, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    ///
    /// let email = Opaque::new(heap.intern_symbol("Email"), string("alice@example.com"));
    /// # let _email = email;
    /// ```
    pub fn new(name: Symbol<'heap>, value: impl Into<Rc<Value<'heap>>>) -> Self {
        Self {
            name,
            value: value.into(),
        }
    }

    /// Returns the type name of this nominal type.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Opaque, Primitive, String, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    ///
    /// let username = Opaque::new(heap.intern_symbol("Username"), string("alice"));
    /// assert_eq!(username.name(), heap.intern_symbol("Username"));
    /// ```
    #[must_use]
    pub const fn name(&self) -> Symbol<'heap> {
        self.name
    }

    /// Returns the wrapped value.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Integer, Opaque, Primitive, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
    ///
    /// let temperature = Opaque::new(heap.intern_symbol("Temperature"), integer("72"));
    /// assert_eq!(temperature.value(), &integer("72"));
    /// ```
    #[must_use]
    pub fn value(&self) -> &Value<'heap> {
        &self.value
    }
}
