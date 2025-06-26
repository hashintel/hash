use core::ops::Index;

use super::{Tuple, Value};
use crate::{collection::SmallVec, heap::Heap, symbol::Symbol};

/// Errors that can occur when working with [`Struct`] fields.
#[derive(Debug, Clone, PartialEq, Eq, Hash, derive_more::Display)]
pub enum StructError<'heap> {
    /// The requested field was not found in the struct.
    #[display("Field `{_0}` not found")]
    FieldNotFound(Symbol<'heap>),
}

impl core::error::Error for StructError<'_> {}

/// A named tuple with field-based access to ordered values.
///
/// Structs provide named access to values, where the internal order of fields is not guaranteed.
///
/// # Examples
///
/// ```
/// use hashql_core::{
///     heap::Heap,
///     symbol::Symbol,
///     value::{Struct, Value},
/// };
///
/// let heap = Heap::new();
///
/// // Create a struct representing a person
/// let name_field = heap.intern_symbol("name");
/// let age_field = heap.intern_symbol("age");
/// let email_field = heap.intern_symbol("email");
///
/// let person = Struct::from_fields(
///     &heap,
///     [
///         (name_field, Value::from("Alice")),
///         (age_field, Value::from(30)),
///         (email_field, Value::from("alice@example.com")),
///     ],
/// );
///
/// // Access fields by name
/// assert_eq!(person.get(name_field, Ok(&Value::from("Alice")));
/// assert_eq!(person.get(age_field, Ok(&Value::from(30)));
///
/// // Using index syntax
/// assert_eq!(person[name_field], Value::from("Alice"));
/// ```
#[derive(Debug, Clone, PartialOrd, Ord, PartialEq, Eq, Hash)]
pub struct Struct<'heap> {
    /// Field names associated with the underlying tuple of values.
    fields: &'heap [Symbol<'heap>],
    values: Tuple<'heap>,
}

impl<'heap> Struct<'heap> {
    /// Creates a new [`Struct`] from an iterable collection of field-value pairs.
    ///
    /// The order of fields is not guaranteed.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     symbol::Symbol,
    ///     value::{Struct, Value},
    /// };
    ///
    /// let heap = Heap::new();
    ///
    /// let fields = [
    ///     (Symbol::from("id"), Value::from(42)),
    ///     (Symbol::from("name"), Value::from("Product")),
    ///     (Symbol::from("price"), Value::from(19.99)),
    /// ];
    ///
    /// let product = Struct::from_fields(&heap, fields);
    /// assert_eq!(product.get(Symbol::from("id")).unwrap(), &Value::from(42));
    /// ```
    pub fn from_fields(
        heap: &'heap Heap,
        fields: impl IntoIterator<Item = (Symbol<'heap>, Value<'heap>)>,
    ) -> Self {
        let fields = fields.into_iter();

        let (fields, values): (SmallVec<_>, SmallVec<_>) = fields.collect();

        let fields = heap.slice(&fields);
        let values = Tuple::from_values(values);

        Self { fields, values }
    }

    /// Returns a reference to the value associated with the given field name.
    ///
    /// # Errors
    ///
    /// Returns [`StructError::FieldNotFound`] if the field name is not present in the struct.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     symbol::Symbol,
    ///     value::{Struct, StructError, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// let name_field = Symbol::from("name");
    /// let age_field = Symbol::from("age");
    ///
    /// let person = Struct::from_fields(
    ///     &heap,
    ///     [
    ///         (name_field, Value::from("Bob")),
    ///         (age_field, Value::from(25)),
    ///     ],
    /// );
    ///
    /// // Successful field access
    /// assert_eq!(person.get(name_field), Ok(&Value::from("Bob")));
    ///
    /// // Field not found
    /// let unknown_field = Symbol::from("unknown");
    /// let error = person.get(unknown_field) {
    ///     Err(StructError::FieldNotFound(field)) => {
    ///         assert_eq!(field, unknown_field);
    ///     }
    ///     _ => panic!("Expected FieldNotFound error"),
    /// }
    /// ```
    pub fn get(&self, field: Symbol<'heap>) -> Result<&Value<'heap>, StructError<'heap>> {
        let Some(position) = self.fields.iter().position(|name| *name == field) else {
            return Err(StructError::FieldNotFound(field));
        };

        Ok(&self.values[position])
    }

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

#[expect(unsafe_code)]
#[inline]
fn co_sort<T: Ord, U>(lhs: &mut [T], rhs: &mut [U]) {
    let n = lhs.len();
    assert_eq!(n, rhs.len(), "lhs and rhs must have the same length");

    // permutation[i] == original index of the i-th smallest element
    let mut permutation: Vec<usize> = (0..n).collect();

    permutation.sort_unstable_by_key(|&idx| {
        // SAFETY: 0 ≤ idx < n by construction
        unsafe { lhs.get_unchecked(idx) }
    });

    assert_eq!(permutation.len(), n); // guides LLVM to remove bounds checks
    for index in 0..n {
        let mut position = permutation[index];
        while index != position {
            debug_assert!(position < n);
            debug_assert_ne!(index, position);

            // SAFETY: both indices < n and distinct
            unsafe {
                lhs.swap_unchecked(index, position);
                rhs.swap_unchecked(index, position);
                permutation.swap_unchecked(index, position);
            }
            position = permutation[index];
        }
    }
}
