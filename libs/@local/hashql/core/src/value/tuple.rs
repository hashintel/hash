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

/// A fixed-size collection of ordered values accessed by position.
///
/// Tuples store values where each element's position has semantic meaning.
/// Elements are accessed by index and tuples cannot be modified after creation.
///
/// # Examples
///
/// ```
/// use hashql_core::value::{Tuple, Value};
///
/// // A 3D point represented as a tuple
/// let point = Tuple::from_values([Value::from(1.23), Value::from(4.56), Value::from(7.89)]);
///
/// // Access elements by index
/// assert_eq!(point[0], Value::from(1.23));
/// assert_eq!(point[1], Value::from(4.56));
/// assert_eq!(point.len(), 3);
/// ```
#[derive(Debug, Clone, PartialOrd, Ord, PartialEq, Eq, Hash)]
pub struct Tuple<'heap> {
    values: Rc<[Value<'heap>]>,
}

impl<'heap> Tuple<'heap> {
    /// Creates a new [`Tuple`] from an iterable collection of values.
    ///
    /// The values are stored in the order provided by the iterator.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::value::{Tuple, Value};
    ///
    /// let values = vec![
    ///     Value::from("red"),
    ///     Value::from("green"),
    ///     Value::from("blue"),
    /// ];
    ///
    /// let color_tuple = Tuple::from_values(values);
    /// assert_eq!(color_tuple.len(), 3);
    /// assert_eq!(color_tuple[0], Value::from("red"));
    /// ```
    pub fn from_values(values: impl IntoIterator<Item = Value<'heap>>) -> Self {
        Self {
            values: values.into_iter().collect(),
        }
    }

    /// Returns a reference to the value at the index specified by the symbol.
    ///
    /// The symbol must represent a valid non-negative integer that is within
    /// the bounds of the tuple. This method provides named access to tuple elements
    /// by parsing the symbol as an index.
    ///
    /// # Errors
    ///
    /// Returns [`TupleError::InvalidInteger`] if the symbol cannot be parsed as a valid integer.
    /// Returns [`TupleError::OutOfBounds`] if the parsed index is out of bounds.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_core::{
    ///     symbol::Symbol,
    ///     value::{Tuple, TupleError, Value},
    /// };
    ///
    /// let tuple = Tuple::from_values([Value::from("first"), Value::from("second")]);
    ///
    /// // Valid index access
    /// let index_0 = Symbol::from("0");
    /// assert_eq!(tuple.get(index_0).unwrap(), &Value::from("first"));
    ///
    /// // Invalid integer
    /// let invalid = Symbol::from("not_a_number");
    /// assert!(matches!(
    ///     tuple.get(invalid),
    ///     Err(TupleError::InvalidInteger(_, _))
    /// ));
    ///
    /// // Out of bounds
    /// let out_of_bounds = Symbol::from("10");
    /// assert!(matches!(
    ///     tuple.get(out_of_bounds),
    ///     Err(TupleError::OutOfBounds(_, _))
    /// ));
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
    /// use hashql_core::value::{Tuple, Value};
    ///
    /// let empty_tuple = Tuple::from_values([]);
    /// assert_eq!(empty_tuple.len(), 0);
    ///
    /// let tuple = Tuple::from_values([Value::from("a"), Value::from("b"), Value::from("c")]);
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
    /// use hashql_core::value::{Tuple, Value};
    ///
    /// let empty_tuple = Tuple::from_values([]);
    /// assert!(empty_tuple.is_empty());
    ///
    /// let tuple = Tuple::from_values([Value::from("element")]);
    /// assert!(!tuple.is_empty());
    /// ```
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

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
