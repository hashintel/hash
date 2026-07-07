//! List collection for the MIR interpreter.

use core::{alloc::Allocator, cmp};

use super::{Int, Value};

/// An ordered list of values.
///
/// Supports negative indexing: `-1` is the last element, `-2` is
/// second-to-last, and so on (see [`get`](Self::get)).
///
/// # Examples
///
/// ```
/// # #![feature(allocator_api)]
/// # extern crate alloc;
/// use alloc::alloc::Global;
///
/// use hashql_mir::interpret::value::{Int, List, Value};
///
/// let mut list: List<'_, Global> = List::new();
/// list.push_back(Value::Integer(10.into()));
/// list.push_back(Value::Integer(20.into()));
/// list.push_back(Value::Integer(30.into()));
///
/// // Forward indexing
/// assert_eq!(list.get(Int::from(0_i32)), Some(&Value::Integer(10.into())));
///
/// // Negative indexing counts from the end
/// assert_eq!(
///     list.get(Int::from(-1_i32)),
///     Some(&Value::Integer(30.into()))
/// );
/// assert_eq!(
///     list.get(Int::from(-3_i32)),
///     Some(&Value::Integer(10.into()))
/// );
///
/// // Out of bounds
/// assert_eq!(list.get(Int::from(3_i32)), None);
/// assert_eq!(list.get(Int::from(-4_i32)), None);
/// ```
#[derive(Debug, Clone)]
pub struct List<'heap, A: Allocator> {
    inner: rpds::Vector<Value<'heap, A>>,
}

impl<'heap, A: Allocator> List<'heap, A> {
    /// Creates a new empty list.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(allocator_api)]
    /// # extern crate alloc;
    /// # use alloc::alloc::Global;
    /// use hashql_mir::interpret::value::List;
    ///
    /// let list: List<'_, Global> = List::new();
    /// assert!(list.is_empty());
    /// ```
    #[inline]
    #[must_use]
    pub fn new() -> Self {
        Self {
            inner: rpds::Vector::new(),
        }
    }

    /// Returns the number of elements in the list.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(allocator_api)]
    /// # extern crate alloc;
    /// # use alloc::alloc::Global;
    /// use hashql_mir::interpret::value::{List, Value};
    ///
    /// let mut list: List<'_, Global> = List::new();
    /// assert_eq!(list.len(), 0);
    ///
    /// list.push_back(Value::Integer(1.into()));
    /// assert_eq!(list.len(), 1);
    /// ```
    #[inline]
    #[must_use]
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// Returns `true` if the list contains no elements.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(allocator_api)]
    /// # extern crate alloc;
    /// # use alloc::alloc::Global;
    /// use hashql_mir::interpret::value::{List, Value};
    ///
    /// let mut list: List<'_, Global> = List::new();
    /// assert!(list.is_empty());
    ///
    /// list.push_back(Value::Unit);
    /// assert!(!list.is_empty());
    /// ```
    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Appends a value to the end of the list.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(allocator_api)]
    /// # extern crate alloc;
    /// # use alloc::alloc::Global;
    /// use hashql_mir::interpret::value::{Int, List, Value};
    ///
    /// let mut list: List<'_, Global> = List::new();
    /// list.push_back(Value::Integer(10.into()));
    /// list.push_back(Value::Integer(20.into()));
    ///
    /// assert_eq!(list.get(Int::from(0_i32)), Some(&Value::Integer(10.into())));
    /// assert_eq!(list.get(Int::from(1_i32)), Some(&Value::Integer(20.into())));
    /// ```
    pub fn push_back(&mut self, value: Value<'heap, A>)
    where
        A: Clone,
    {
        self.inner.push_back_mut(value);
    }

    /// Returns a reference to the element at the given `index`.
    ///
    /// Supports negative indexing: `-1` is the last element, `-2` is
    /// second-to-last, etc.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(allocator_api)]
    /// # extern crate alloc;
    /// # use alloc::alloc::Global;
    /// use hashql_mir::interpret::value::{Int, List, Value};
    ///
    /// let mut list: List<'_, Global> = List::new();
    /// list.push_back(Value::Integer(10.into()));
    /// list.push_back(Value::Integer(20.into()));
    ///
    /// assert_eq!(list.get(Int::from(0_i32)), Some(&Value::Integer(10.into())));
    /// assert_eq!(
    ///     list.get(Int::from(-1_i32)),
    ///     Some(&Value::Integer(20.into()))
    /// );
    /// assert_eq!(list.get(Int::from(2_i32)), None);
    /// ```
    #[must_use]
    pub fn get(&self, index: Int) -> Option<&Value<'heap, A>> {
        let index = isize::try_from(index.as_int()).ok()?;

        if index.is_negative() {
            let abs = index.unsigned_abs();
            if abs <= self.len() {
                self.inner.get(self.len() - abs)
            } else {
                None
            }
        } else {
            self.inner.get(index.cast_unsigned())
        }
    }

    /// Returns a mutable reference to the element at the given `index`.
    ///
    /// Supports negative indexing: `-1` is the last element, `-2` is second-to-last, etc.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(allocator_api)]
    /// # extern crate alloc;
    /// # use alloc::alloc::Global;
    /// use hashql_mir::interpret::value::{Int, List, Value};
    ///
    /// let mut list: List<'_, Global> = List::new();
    /// list.push_back(Value::Integer(1.into()));
    /// list.push_back(Value::Integer(2.into()));
    ///
    /// // Mutate the last element via negative index
    /// *list.get_mut(Int::from(-1_i32)).unwrap() = Value::Integer(99.into());
    /// assert_eq!(list.get(Int::from(1_i32)), Some(&Value::Integer(99.into())));
    /// ```
    pub fn get_mut(&mut self, index: Int) -> Option<&mut Value<'heap, A>>
    where
        A: Clone,
    {
        let index = isize::try_from(index.as_int()).ok()?;

        if index.is_negative() {
            let abs = index.unsigned_abs();
            if abs <= self.len() {
                self.inner.get_mut(self.len() - abs)
            } else {
                None
            }
        } else {
            self.inner.get_mut(index.cast_unsigned())
        }
    }

    /// Returns an iterator over the list's elements.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(allocator_api)]
    /// # extern crate alloc;
    /// # use alloc::alloc::Global;
    /// use hashql_mir::interpret::value::{List, Value};
    ///
    /// let mut list: List<'_, Global> = List::new();
    /// list.push_back(Value::Integer(1.into()));
    /// list.push_back(Value::Integer(2.into()));
    ///
    /// let values: Vec<_> = list.iter().collect();
    /// assert_eq!(values.len(), 2);
    /// ```
    #[must_use]
    pub fn iter(&self) -> impl ExactSizeIterator<Item = &Value<'heap, A>> + DoubleEndedIterator {
        self.inner.iter()
    }
}

impl<A: Allocator> PartialEq for List<'_, A> {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.inner == other.inner
    }
}

impl<A: Allocator> Eq for List<'_, A> {}

impl<A: Allocator> PartialOrd for List<'_, A> {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl<A: Allocator> Ord for List<'_, A> {
    #[inline]
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        self.inner.cmp(&other.inner)
    }
}

impl<A: Allocator> Default for List<'_, A> {
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}

impl<'this, 'heap, A: Allocator> IntoIterator for &'this List<'heap, A> {
    type Item = &'this Value<'heap, A>;

    type IntoIter = impl ExactSizeIterator<Item = &'this Value<'heap, A>> + DoubleEndedIterator;

    fn into_iter(self) -> Self::IntoIter {
        self.inner.iter()
    }
}
