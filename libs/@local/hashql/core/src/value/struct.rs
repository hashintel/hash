use core::ops::Index;

use super::{Tuple, Value};
use crate::{collections::SmallVec, heap::Heap, symbol::Symbol};

/// Errors that can occur when working with [`Struct`] fields.
#[derive(Debug, Clone, PartialEq, Eq, Hash, derive_more::Display)]
pub enum StructError<'heap> {
    /// The requested field was not found in the struct.
    #[display("Field `{_0}` not found")]
    FieldNotFound(Symbol<'heap>),
}

impl core::error::Error for StructError<'_> {}

/// A named tuple with field-based access to values.
///
/// Fields can be accessed by name. The internal order of fields is not guaranteed.
///
/// # Examples
///
/// ```
/// use hashql_core::{
///     heap::Heap,
///     value::{Integer, Primitive, String, Struct, Value},
///     symbol::Symbol,
/// };
///
/// let heap = Heap::new();
/// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
/// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
///
/// // Create a struct representing a person
/// let name_field = heap.intern_symbol("name");
/// let age_field = heap.intern_symbol("age");
/// let email_field = heap.intern_symbol("email");
///
/// let person = Struct::from_fields(
///     &heap,
///     [
///         (
///             name_field,
///             string("Alice"),
///         ),
///         (
///             age_field,
///             integer("30"),
///         ),
///         (
///             email_field,
///             string("alice@example.com"),
///         ),
///     ],
/// );
///
/// // Access fields by name
/// assert_eq!(
///     person.get(name_field).unwrap(),
///     &string("Alice")
/// );
/// assert_eq!(
///     person.get(age_field).unwrap(),
///     &integer("30")
/// );
///
/// // Using index syntax
/// assert_eq!(
///     person[name_field],
///     string("Alice")
/// );
/// ```
#[derive(Debug, Clone, PartialOrd, Ord, PartialEq, Eq, Hash)]
pub struct Struct<'heap> {
    /// Field names associated with the underlying tuple of values.
    fields: &'heap [Symbol<'heap>],
    values: Tuple<'heap>,
}

impl<'heap> Struct<'heap> {
    /// Creates a new [`Struct`] from field-value pairs.
    ///
    /// # Panics
    ///
    /// Panics if there are duplicate fields if debug assertions are enabled.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Float, Integer, Primitive, String, Struct, Value},
    ///     symbol::Symbol,
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    /// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
    /// # let float = |value: &'static str| Value::Primitive(Primitive::Float(Float::new_unchecked(heap.intern_symbol(value))));
    ///
    /// let fields = [
    ///     (heap.intern_symbol("id"), integer("42")),
    ///     (heap.intern_symbol("name"), string("Product")),
    ///     (heap.intern_symbol("price"), float("19.99")),
    /// ];
    ///
    /// let product = Struct::from_fields(&heap, fields);
    /// assert_eq!(product.get(heap.intern_symbol("id")).unwrap(), &integer("42"));
    /// ```
    pub fn from_fields(
        heap: &'heap Heap,
        fields: impl IntoIterator<Item = (Symbol<'heap>, Value<'heap>)>,
    ) -> Self {
        let fields = fields.into_iter();

        let (fields, values): (SmallVec<_>, SmallVec<_>) = fields.collect();

        // This is an assert, as previous stages in the compilation should have ensured that there
        // are no duplicate fields.
        if cfg!(debug_assertions) {
            let mut seen = crate::collections::fast_hash_set_with_capacity(fields.len());
            for field in &fields {
                assert!(seen.insert(*field), "Duplicate field: {field}");
            }
        }

        let fields = heap.slice(&fields);
        let values = Tuple::from_values(values);

        Self { fields, values }
    }

    /// Returns the value for the given field.
    ///
    /// # Errors
    ///
    /// Returns [`StructError::FieldNotFound`] if the field doesn't exist.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(assert_matches)]
    /// # use core::assert_matches::assert_matches;
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Integer, Primitive, String, Struct, StructError, Value},
    ///     symbol::Symbol,
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    /// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
    ///
    /// let name_field = heap.intern_symbol("name");
    /// let age_field = heap.intern_symbol("age");
    ///
    /// let person = Struct::from_fields(
    ///     &heap,
    ///     [
    ///         (name_field, string("Bob")),
    ///         (age_field, integer("25")),
    ///     ],
    /// );
    ///
    /// // Successful field access
    /// assert_eq!(person.get(name_field), Ok(&string("Bob")));
    ///
    /// // Field not found
    /// let unknown_field = heap.intern_symbol("unknown");
    /// assert_matches!(
    ///     person.get(unknown_field),
    ///     Err(StructError::FieldNotFound(field)) if field == unknown_field
    /// );
    /// ```
    pub fn get(&self, field: Symbol<'heap>) -> Result<&Value<'heap>, StructError<'heap>> {
        let Some(position) = self.fields.iter().position(|name| *name == field) else {
            return Err(StructError::FieldNotFound(field));
        };

        Ok(&self.values[position])
    }

    /// Returns the number of fields in the struct.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Integer, Primitive, String, Struct, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    /// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
    ///
    /// let empty_struct = Struct::from_fields(&heap, []);
    /// assert_eq!(empty_struct.len(), 0);
    ///
    /// let person = Struct::from_fields(
    ///     &heap,
    ///     [
    ///         (heap.intern_symbol("name"), string("Alice")),
    ///         (heap.intern_symbol("age"), integer("30")),
    ///         (heap.intern_symbol("city"), string("Boston")),
    ///     ],
    /// );
    /// assert_eq!(person.len(), 3);
    /// ```
    #[must_use]
    pub const fn len(&self) -> usize {
        self.fields.len()
    }

    /// Returns `true` if the struct contains no fields.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Primitive, String, Struct, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    ///
    /// let empty_struct = Struct::from_fields(&heap, []);
    /// assert!(empty_struct.is_empty());
    ///
    /// let person = Struct::from_fields(
    ///     &heap,
    ///     [(heap.intern_symbol("name"), string("Alice"))],
    /// );
    /// assert!(!person.is_empty());
    /// ```
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.fields.is_empty()
    }

    /// Returns an iterator over the field-value pairs.
    ///
    /// The order is unspecified but stable.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Integer, Primitive, String, Struct, Value},
    ///     symbol::Symbol,
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    /// # let integer = |value: &'static str| Value::Primitive(Primitive::Integer(Integer::new_unchecked(heap.intern_symbol(value))));
    ///
    /// let person = Struct::from_fields(
    ///     &heap,
    ///     [
    ///         (heap.intern_symbol("name"), string("Alice")),
    ///         (heap.intern_symbol("age"), integer("30")),
    ///         (heap.intern_symbol("city"), string("Boston")),
    ///     ],
    /// );
    ///
    /// // Iterate over all field-value pairs
    /// for (field, value) in person.iter() {
    ///     println!("{}: {:?}", field, value);
    /// }
    ///
    /// // Collect into a vector
    /// let pairs: Vec<_> = person.iter().collect();
    /// assert_eq!(pairs.len(), 3);
    /// ```
    pub fn iter(&self) -> impl Iterator<Item = (Symbol<'heap>, &Value<'heap>)> {
        self.fields.iter().copied().zip(self.values.iter())
    }
}

impl<'heap> Index<Symbol<'heap>> for Struct<'heap> {
    type Output = Value<'heap>;

    fn index(&self, index: Symbol<'heap>) -> &Self::Output {
        self.get(index).expect("struct field not found")
    }
}
