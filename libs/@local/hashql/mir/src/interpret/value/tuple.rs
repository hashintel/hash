//! Tuple aggregate for the MIR interpreter.

use alloc::rc::Rc;
use core::{
    alloc::Allocator,
    cmp,
    fmt::{self, Display},
    num::NonZero,
};

use hashql_core::id::Id as _;

use super::Value;
use crate::body::place::FieldIndex;

/// A positional tuple value.
///
/// Contains an ordered sequence of values accessed by [`FieldIndex`]. Unlike
/// unit (represented by [`Value::Unit`]), a tuple always contains at least
/// one element.
///
/// # Invariants
///
/// - Must be non-empty (empty tuples should use [`Value::Unit`])
///
/// # Examples
///
/// ```
/// use hashql_mir::interpret::value::{Tuple, Value};
/// # extern crate alloc;
/// # use alloc::rc::Rc;
///
/// let values: Rc<[Value]> = Rc::from(vec![Value::Integer(1.into()), Value::Integer(2.into())]);
/// let tuple = Tuple::new(values).expect("non-empty");
///
/// assert_eq!(tuple.len().get(), 2);
/// assert_eq!(tuple.values()[0], Value::Integer(1.into()));
/// ```
///
/// [`Value::Unit`]: super::Value::Unit
#[derive(Debug, Clone)]
pub struct Tuple<'heap, A: Allocator> {
    values: Rc<[Value<'heap, A>], A>,
}

impl<'heap, A: Allocator> Tuple<'heap, A> {
    /// Creates a new tuple without checking invariants.
    ///
    /// The caller must ensure that `values` is non-empty.
    #[inline]
    pub fn new_unchecked(values: Rc<[Value<'heap, A>], A>) -> Self {
        debug_assert!(!values.is_empty(), "tuple is non-empty by construction");

        Self { values }
    }

    /// Creates a new tuple from a slice of values.
    ///
    /// Returns [`None`] if `values` is empty.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::interpret::value::{Tuple, Value};
    /// # extern crate alloc;
    /// # use alloc::rc::Rc;
    ///
    /// let values: Rc<[Value]> = Rc::from(vec![Value::Unit, Value::Integer(1.into())]);
    /// assert!(Tuple::new(values).is_some());
    ///
    /// let empty: Rc<[Value]> = Rc::from(vec![]);
    /// assert!(Tuple::new(empty).is_none());
    /// ```
    #[must_use]
    pub fn new(values: impl Into<Rc<[Value<'heap, A>], A>>) -> Option<Self> {
        let values = values.into();

        (!values.is_empty()).then(|| Self::new_unchecked(values))
    }

    /// Returns the tuple's values as a slice.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::interpret::value::{Tuple, Value};
    /// # extern crate alloc;
    /// # use alloc::rc::Rc;
    ///
    /// let values: Rc<[Value]> = Rc::from(vec![Value::Integer(1.into()), Value::Unit]);
    /// let tuple = Tuple::new(values).unwrap();
    ///
    /// assert_eq!(tuple.values(), &[Value::Integer(1.into()), Value::Unit]);
    /// ```
    #[inline]
    #[must_use]
    pub fn values(&self) -> &[Value<'heap, A>] {
        &self.values
    }

    /// Returns the number of elements.
    ///
    /// Always at least 1 (empty tuples are represented by [`Value::Unit`]).
    ///
    /// [`Value::Unit`]: super::Value::Unit
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::interpret::value::{Tuple, Value};
    /// # extern crate alloc;
    /// # use alloc::rc::Rc;
    ///
    /// let values: Rc<[Value]> = Rc::from(vec![Value::Unit, Value::Unit, Value::Unit]);
    /// let tuple = Tuple::new(values).unwrap();
    /// assert_eq!(tuple.len().get(), 3);
    /// ```
    #[inline]
    #[must_use]
    pub fn len(&self) -> NonZero<usize> {
        NonZero::new(self.values.len())
            .unwrap_or_else(|| unreachable!("tuple is non-empty by construction"))
    }

    /// Returns a reference to the element at the given `index`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::{
    ///     body::place::FieldIndex,
    ///     interpret::value::{Tuple, Value},
    /// };
    /// # extern crate alloc;
    /// # use alloc::rc::Rc;
    ///
    /// let values: Rc<[Value]> = Rc::from(vec![Value::Integer(10.into()), Value::Integer(20.into())]);
    /// let tuple = Tuple::new(values).unwrap();
    ///
    /// assert_eq!(
    ///     tuple.get(FieldIndex::new(0)),
    ///     Some(&Value::Integer(10.into()))
    /// );
    /// assert_eq!(
    ///     tuple.get(FieldIndex::new(1)),
    ///     Some(&Value::Integer(20.into()))
    /// );
    /// assert_eq!(tuple.get(FieldIndex::new(2)), None);
    /// ```
    #[inline]
    #[must_use]
    pub fn get(&self, index: FieldIndex) -> Option<&Value<'heap, A>> {
        self.values.get(index.as_usize())
    }

    /// Returns a mutable reference to the element at the given `index`.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::{
    ///     body::place::FieldIndex,
    ///     interpret::value::{Tuple, Value},
    /// };
    /// # extern crate alloc;
    /// # use alloc::rc::Rc;
    ///
    /// let values: Rc<[Value]> = Rc::from(vec![Value::Integer(1.into()), Value::Integer(2.into())]);
    /// let mut tuple = Tuple::new(values).unwrap();
    ///
    /// *tuple.get_mut(FieldIndex::new(0)).unwrap() = Value::Integer(99.into());
    /// assert_eq!(
    ///     tuple.get(FieldIndex::new(0)),
    ///     Some(&Value::Integer(99.into()))
    /// );
    /// ```
    #[must_use]
    pub fn get_mut(&mut self, index: FieldIndex) -> Option<&mut Value<'heap, A>>
    where
        A: Clone,
    {
        let values = Rc::make_mut(&mut self.values);
        values.get_mut(index.as_usize())
    }

    /// Returns an iterator over the tuple's elements.
    ///
    /// # Examples
    ///
    /// ```
    /// use hashql_mir::interpret::value::{Tuple, Value};
    /// # extern crate alloc;
    /// # use alloc::rc::Rc;
    ///
    /// let values: Rc<[Value]> = Rc::from(vec![Value::Integer(1.into()), Value::Integer(2.into())]);
    /// let tuple = Tuple::new(values).unwrap();
    ///
    /// let sum: i128 = tuple
    ///     .iter()
    ///     .filter_map(|v| match v {
    ///         Value::Integer(i) => Some(i.as_int()),
    ///         _ => None,
    ///     })
    ///     .sum();
    /// assert_eq!(sum, 3);
    /// ```
    pub fn iter(&self) -> core::slice::Iter<'_, Value<'heap, A>> {
        self.values.iter()
    }

    /// Returns a displayable representation of this tuple's type.
    pub fn type_name(&self) -> impl Display {
        fmt::from_fn(|fmt| {
            fmt.write_str("(")?;
            for (index, value) in self.values.iter().enumerate() {
                if index > 0 {
                    fmt.write_str(", ")?;
                }

                Display::fmt(&value.type_name(), fmt)?;
            }

            fmt.write_str(")")
        })
    }
}

impl<'this, 'heap, A: Allocator> IntoIterator for &'this Tuple<'heap, A> {
    type IntoIter = core::slice::Iter<'this, Value<'heap, A>>;
    type Item = &'this Value<'heap, A>;

    fn into_iter(self) -> Self::IntoIter {
        self.values.iter()
    }
}

impl<A: Allocator> PartialEq for Tuple<'_, A> {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        let Self { values } = self;

        *values == other.values
    }
}

impl<A: Allocator> Eq for Tuple<'_, A> {}

impl<A: Allocator> PartialOrd for Tuple<'_, A> {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl<A: Allocator> Ord for Tuple<'_, A> {
    #[inline]
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        let Self { values } = self;

        values.cmp(&other.values)
    }
}
