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

/// A named tuple with field-based access to values.
///
/// Fields can be accessed by name. The internal order of fields is not guaranteed.
///
/// # Examples
///
/// ```
/// use hashql_core::{
///     heap::Heap,
///     literal::{IntegerLiteral, LiteralKind, StringLiteral},
///     symbol::Symbol,
///     value::{Struct, Value},
/// };
///
/// let heap = Heap::new();
/// # let string = |value: &'static str| Value::Primitive(LiteralKind::String(StringLiteral { value: heap.intern_symbol(value) }));
/// # let integer = |value: &'static str| Value::Primitive(LiteralKind::Integer(IntegerLiteral { value: heap.intern_symbol(value) }));
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
    /// Panics if there are duplicate fields.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     literal::{FloatLiteral, IntegerLiteral, LiteralKind, StringLiteral},
    ///     symbol::Symbol,
    ///     value::{Struct, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(LiteralKind::String(StringLiteral { value: heap.intern_symbol(value) }));
    /// # let integer = |value: &'static str| Value::Primitive(LiteralKind::Integer(IntegerLiteral { value: heap.intern_symbol(value) }));
    /// # let float = |value: &'static str| Value::Primitive(LiteralKind::Float(FloatLiteral { value: heap.intern_symbol(value) }));
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

        let (mut fields, mut values): (SmallVec<_>, SmallVec<_>) = fields.collect();

        co_sort(&mut fields, &mut values);

        // This is an assert, as previous stages in the compilation should have ensured that there
        // are no duplicate fields.
        assert!(
            !fields.array_windows().any(|[left, right]| left == right),
            "Structs cannot contain any duplicate fields"
        );

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
    ///     literal::{IntegerLiteral, LiteralKind, StringLiteral},
    ///     symbol::Symbol,
    ///     value::{Struct, StructError, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(LiteralKind::String(StringLiteral { value: heap.intern_symbol(value) }));
    /// # let integer = |value: &'static str| Value::Primitive(LiteralKind::Integer(IntegerLiteral { value: heap.intern_symbol(value) }));
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
    ///     literal::{IntegerLiteral, LiteralKind, StringLiteral},
    ///     value::{Struct, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(LiteralKind::String(StringLiteral { value: heap.intern_symbol(value) }));
    /// # let integer = |value: &'static str| Value::Primitive(LiteralKind::Integer(IntegerLiteral { value: heap.intern_symbol(value) }));
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
    ///     literal::{LiteralKind, StringLiteral},
    ///     value::{Struct, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(LiteralKind::String(StringLiteral { value: heap.intern_symbol(value) }));
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
    ///     literal::{IntegerLiteral, LiteralKind, StringLiteral},
    ///     symbol::Symbol,
    ///     value::{Struct, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(LiteralKind::String(StringLiteral { value: heap.intern_symbol(value) }));
    /// # let integer = |value: &'static str| Value::Primitive(LiteralKind::Integer(IntegerLiteral { value: heap.intern_symbol(value) }));
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

/// Sorts two slices in tandem based on the ordering of the first slice.
///
/// This function performs a coordinated sort where elements in both slices are rearranged
/// such that the first slice (`lhs`) becomes sorted, while maintaining the correspondence
/// between elements at the same indices in both slices.
///
/// The algorithm is inspired by the [`co_sort`](https://docs.rs/co_sort/latest/co_sort/) crate
/// and uses an in-place permutation approach to minimize memory allocations.
///
/// # Arguments
///
/// * `lhs` - The slice to sort by. Must implement [`Ord`] for comparison.
/// * `rhs` - The slice to be permuted alongside `lhs`. Can be any type.
///
/// Both slices must have the same length.
///
/// # Panics
///
/// Panics if the slices have different lengths.
///
/// # Examples
///
/// ```rust,ignore
/// // Example usage within the module
/// let mut keys = [3, 1, 4, 1, 5];
/// let mut values = ['c', 'a', 'd', 'b', 'e'];
///
/// co_sort(&mut keys, &mut values);
///
/// assert_eq!(keys, [1, 1, 3, 4, 5]);
/// assert_eq!(values, ['a', 'b', 'c', 'd', 'e']);
/// ```
#[expect(unsafe_code)]
#[inline]
fn co_sort<T: Ord, U>(lhs: &mut [T], rhs: &mut [U]) {
    let n = lhs.len();
    assert_eq!(n, rhs.len(), "lhs and rhs must have the same length");

    // permutation[i] == original index of the i-th smallest element
    let mut permutation: Vec<usize> = (0..n).collect();
    permutation.sort_unstable_by_key(|&index| {
        // SAFETY: 0 ≤ index < n by construction
        unsafe { lhs.get_unchecked(index) }
    });

    assert_eq!(permutation.len(), n); // guides LLVM to remove bounds checks

    let mut position;
    for index in 0..n {
        position = permutation[index];

        while position < index {
            // SAFETY: 0 ≤ position < n by construction
            position = unsafe { *permutation.get_unchecked(position) };
        }

        // SAFETY: both indices < n
        unsafe {
            lhs.swap_unchecked(index, position);
            rhs.swap_unchecked(index, position);
        }
    }
}

#[cfg(test)]
mod tests {
    use proptest::{collection::size_range, prop_assert, prop_assert_eq, test_runner::Config};
    use test_strategy::proptest;

    use crate::value::r#struct::co_sort;

    #[proptest(
        if cfg!(miri) {
            Config { failure_persistence: None, cases: 40, ..Config::default() }
        } else {
            Config::default()
        }
    )]
    fn co_sort_sorted_and_permuted(#[any(size_range(0..64).lift())] mut input: Vec<(u16, i32)>) {
        let mut lhs: Vec<_> = input.iter().map(|&(lhs, _)| lhs).collect();
        let mut rhs: Vec<_> = input.iter().map(|&(_, rhs)| rhs).collect();

        co_sort(&mut lhs, &mut rhs);

        // lhs is non-decreasing
        prop_assert!(lhs.array_windows().all(|[left, right]| left <= right));

        // The lhs-rhs pairs are unchanged
        let mut after: Vec<_> = lhs.into_iter().zip(rhs.into_iter()).collect();

        input.sort_unstable();
        after.sort_unstable();

        prop_assert_eq!(input, after);
    }

    #[test]
    #[should_panic(expected = "must have the same length")]
    fn co_sort_length_mismatch() {
        let mut lhs = [1, 2, 3];
        let mut rhs = [42_i8; 2];
        co_sort(&mut lhs, &mut rhs);
    }

    #[test]
    fn co_sort_empty() {
        let mut lhs: [u8; 0] = [];
        let mut rhs: [(); 0] = [];
        co_sort(&mut lhs, &mut rhs);
    }
}
