use alloc::rc::Rc;
use core::{num::ParseIntError, ops::Index};

use super::Value;
use crate::symbol::Symbol;

/// Errors that can occur when working with [`Tuple`] field access.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display)]
pub enum TupleError<'heap> {
    /// The provided symbol could not be parsed as a valid integer index.
    #[display("`{_0}` is not a valid integer: {_1}")]
    InvalidInteger(Symbol<'heap>, ParseIntError),
    /// The provided index is out of bounds for the tuple.
    #[display("`{_0}` is out of bounds, the tuple has {_1} elements")]
    OutOfBounds(Symbol<'heap>, usize),
}

impl core::error::Error for TupleError<'_> {}

/// A fixed-size collection of values accessed by position.
///
/// Tuples store values where each element's position has semantic meaning.
/// Elements are accessed by index and tuples cannot be modified after creation.
///
/// # Examples
///
/// ```
/// use hashql_core::{
///     heap::Heap,
///     value::{Float, Primitive, Tuple, Value},
/// };
///
/// let heap = Heap::new();
/// # let float = |value: &'static str| Value::Primitive(Primitive::Float(Float::new_unchecked(heap.intern_symbol(value))));
///
/// // A 3D point represented as a tuple
/// let point = Tuple::from_values([float("1.23"), float("4.56"), float("7.89")]);
///
/// // Access elements by index
/// assert_eq!(point[0], float("1.23"));
/// assert_eq!(point[1], float("4.56"));
/// assert_eq!(point.len(), 3);
/// ```
#[derive(Debug, Clone, PartialOrd, Ord, PartialEq, Eq, Hash)]
pub struct Tuple<'heap> {
    values: Rc<[Value<'heap>]>,
}

impl<'heap> Tuple<'heap> {
    /// Creates a new [`Tuple`] from values.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Primitive, String, Tuple, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    ///
    /// let values = [
    ///     string("red"),
    ///     string("green"),
    ///     string("blue"),
    /// ];
    ///
    /// let color_tuple = Tuple::from_values(values);
    /// assert_eq!(color_tuple.len(), 3);
    /// assert_eq!(color_tuple[0], string("red"));
    /// ```
    pub fn from_values(values: impl IntoIterator<Item = Value<'heap>>) -> Self {
        Self {
            values: values.into_iter().collect(),
        }
    }

    /// Returns the value at the given index.
    ///
    /// The symbol must represent a valid non-negative integer that is within
    /// the bounds of the tuple.
    ///
    /// # Errors
    ///
    /// Returns an error if the symbol is not a valid integer or is out of bounds.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(assert_matches)]
    /// # use core::assert_matches;
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Primitive, String, Tuple, TupleError, Value},
    ///     symbol::Symbol,
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    ///
    /// let tuple = Tuple::from_values([string("first"), string("second")]);
    ///
    /// // Valid index access
    /// let index_0 = heap.intern_symbol("0");
    /// assert_eq!(tuple.get(index_0).unwrap(), &string("first"));
    ///
    /// // Invalid integer
    /// let invalid = heap.intern_symbol("not_a_number");
    /// assert_matches!(
    ///     tuple.get(invalid),
    ///     Err(TupleError::InvalidInteger(_, _))
    /// );
    ///
    /// // Out of bounds
    /// let out_of_bounds = heap.intern_symbol("10");
    /// assert_matches!(
    ///     tuple.get(out_of_bounds),
    ///     Err(TupleError::OutOfBounds(_, _))
    /// );
    /// ```
    pub fn get(&self, field: Symbol<'heap>) -> Result<&Value<'heap>, TupleError<'heap>> {
        let index = field
            .as_str()
            .parse::<usize>()
            .map_err(|error| TupleError::InvalidInteger(field, error))?;

        self.values
            .get(index)
            .ok_or_else(|| TupleError::OutOfBounds(field, self.values.len()))
    }

    /// Returns the number of elements in the tuple.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Primitive, String, Tuple, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    ///
    /// let empty_tuple = Tuple::from_values([]);
    /// assert_eq!(empty_tuple.len(), 0);
    ///
    /// let tuple = Tuple::from_values([string("a"), string("b"), string("c")]);
    /// assert_eq!(tuple.len(), 3);
    /// ```
    #[must_use]
    pub fn len(&self) -> usize {
        self.values.len()
    }

    /// Returns `true` if the tuple contains no elements.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Primitive, String, Tuple, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    ///
    /// let empty_tuple = Tuple::from_values([]);
    /// assert!(empty_tuple.is_empty());
    ///
    /// let tuple = Tuple::from_values([string("element")]);
    /// assert!(!tuple.is_empty());
    /// ```
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    /// Returns an iterator over the values.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     heap::Heap,
    ///     value::{Primitive, String, Tuple, Value},
    /// };
    ///
    /// let heap = Heap::new();
    /// # let string = |value: &'static str| Value::Primitive(Primitive::String(String::new(heap.intern_symbol(value))));
    ///
    /// let tuple = Tuple::from_values([string("first"), string("second"), string("third")]);
    ///
    /// for (index, value) in tuple.iter().enumerate() {
    ///     println!("Element {}: {:?}", index, value);
    /// }
    ///
    /// assert_eq!(
    ///     tuple.iter().collect::<Vec<_>>(),
    ///     [
    ///         &string("first"),
    ///         &string("second"),
    ///         &string("third")
    ///     ]
    /// );
    /// ```
    pub fn iter(&self) -> impl Iterator<Item = &Value<'heap>> {
        self.values.iter()
    }
}

impl<'heap> Index<usize> for Tuple<'heap> {
    type Output = Value<'heap>;

    fn index(&self, index: usize) -> &Self::Output {
        &self.values[index]
    }
}
