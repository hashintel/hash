//! Dictionary collection for the MIR interpreter.

use core::{alloc::Allocator, cmp};

use super::Value;

/// An ordered dictionary mapping values to values.
///
/// Keys are ordered by [`Value`]'s [`Ord`] implementation.
///
/// # Examples
///
/// ```
/// # #![feature(allocator_api)]
/// # extern crate alloc;
/// use alloc::alloc::Global;
///
/// use hashql_mir::interpret::value::{Dict, Value};
///
/// let mut dict: Dict<'_, Global> = Dict::new();
/// dict.insert(Value::Integer(1.into()), Value::Integer(100.into()));
/// dict.insert(Value::Integer(2.into()), Value::Integer(200.into()));
///
/// assert_eq!(dict.len(), 2);
/// assert_eq!(
///     dict.get(&Value::Integer(1.into())),
///     Some(&Value::Integer(100.into())),
/// );
///
/// // Missing keys return None
/// assert_eq!(dict.get(&Value::Integer(99.into())), None);
/// ```
#[derive(Debug, Clone)]
pub struct Dict<'heap, A: Allocator> {
    inner: rpds::RedBlackTreeMap<Value<'heap, A>, Value<'heap, A>>,
}

impl<'heap, A: Allocator> Dict<'heap, A> {
    /// Creates a new empty dictionary.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(allocator_api)]
    /// # extern crate alloc;
    /// # use alloc::alloc::Global;
    /// use hashql_mir::interpret::value::Dict;
    ///
    /// let dict: Dict<'_, Global> = Dict::new();
    /// assert!(dict.is_empty());
    /// ```
    #[inline]
    #[must_use]
    pub fn new() -> Self {
        Self {
            inner: rpds::RedBlackTreeMap::new(),
        }
    }

    /// Returns the number of key-value pairs in the dictionary.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(allocator_api)]
    /// # extern crate alloc;
    /// # use alloc::alloc::Global;
    /// use hashql_mir::interpret::value::{Dict, Value};
    ///
    /// let mut dict: Dict<'_, Global> = Dict::new();
    /// assert_eq!(dict.len(), 0);
    ///
    /// dict.insert(Value::Integer(1.into()), Value::Unit);
    /// assert_eq!(dict.len(), 1);
    /// ```
    #[inline]
    #[must_use]
    pub fn len(&self) -> usize {
        self.inner.size()
    }

    /// Returns `true` if the dictionary contains no elements.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(allocator_api)]
    /// # extern crate alloc;
    /// # use alloc::alloc::Global;
    /// use hashql_mir::interpret::value::{Dict, Value};
    ///
    /// let mut dict: Dict<'_, Global> = Dict::new();
    /// assert!(dict.is_empty());
    ///
    /// dict.insert(Value::Integer(1.into()), Value::Unit);
    /// assert!(!dict.is_empty());
    /// ```
    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Inserts a key-value pair into the dictionary.
    ///
    /// If the key already exists, the value is replaced.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(allocator_api)]
    /// # extern crate alloc;
    /// # use alloc::alloc::Global;
    /// use hashql_mir::interpret::value::{Dict, Value};
    ///
    /// let mut dict: Dict<'_, Global> = Dict::new();
    /// dict.insert(Value::Integer(1.into()), Value::Integer(100.into()));
    /// dict.insert(Value::Integer(1.into()), Value::Integer(200.into()));
    ///
    /// assert_eq!(dict.len(), 1);
    /// assert_eq!(
    ///     dict.get(&Value::Integer(1.into())),
    ///     Some(&Value::Integer(200.into())),
    /// );
    /// ```
    pub fn insert(&mut self, key: Value<'heap, A>, value: Value<'heap, A>)
    where
        A: Clone,
    {
        self.inner.insert_mut(key, value);
    }

    /// Returns a reference to the value associated with the `key`.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(allocator_api)]
    /// # extern crate alloc;
    /// # use alloc::alloc::Global;
    /// use hashql_mir::interpret::value::{Dict, Value};
    ///
    /// let mut dict: Dict<'_, Global> = Dict::new();
    /// dict.insert(Value::Integer(1.into()), Value::Integer(100.into()));
    ///
    /// assert_eq!(
    ///     dict.get(&Value::Integer(1.into())),
    ///     Some(&Value::Integer(100.into()))
    /// );
    /// assert_eq!(dict.get(&Value::Integer(2.into())), None);
    /// ```
    #[must_use]
    pub fn get(&self, key: &Value<'heap, A>) -> Option<&Value<'heap, A>> {
        self.inner.get(key)
    }

    /// Returns a mutable reference to the value for `key`, inserting
    /// [`Value::Unit`] if absent.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(allocator_api)]
    /// # extern crate alloc;
    /// # use alloc::alloc::Global;
    /// use hashql_mir::interpret::value::{Dict, Value};
    ///
    /// let mut dict: Dict<'_, Global> = Dict::new();
    ///
    /// // Accessing a missing key inserts Unit, then returns a mutable reference
    /// let key = Value::Integer(1.into());
    /// *dict.get_mut(&key) = Value::Integer(42.into());
    ///
    /// assert_eq!(dict.get(&key), Some(&Value::Integer(42.into())));
    /// ```
    pub fn get_mut(&mut self, key: &Value<'heap, A>) -> &mut Value<'heap, A>
    where
        A: Clone,
    {
        if !self.inner.contains_key(key) {
            self.inner.insert_mut(key.clone(), Value::Unit);
        }

        self.inner.get_mut(key).unwrap_or_else(|| unreachable!())
    }

    /// Returns an iterator over key-value pairs.
    ///
    /// Pairs are yielded in key order.
    ///
    /// # Examples
    ///
    /// ```
    /// # #![feature(allocator_api)]
    /// # extern crate alloc;
    /// # use alloc::alloc::Global;
    /// use hashql_mir::interpret::value::{Dict, Value};
    ///
    /// let mut dict: Dict<'_, Global> = Dict::new();
    /// dict.insert(Value::Integer(2.into()), Value::Unit);
    /// dict.insert(Value::Integer(1.into()), Value::Unit);
    ///
    /// let keys: Vec<_> = dict.iter().map(|(k, _)| k.clone()).collect();
    /// // Keys are yielded in sorted order
    /// assert_eq!(
    ///     keys,
    ///     vec![Value::Integer(1.into()), Value::Integer(2.into())]
    /// );
    /// ```
    #[must_use]
    pub fn iter(
        &self,
    ) -> impl ExactSizeIterator<Item = (&Value<'heap, A>, &Value<'heap, A>)> + DoubleEndedIterator
    {
        self.inner.iter()
    }
}

impl<A: Allocator> PartialEq for Dict<'_, A> {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.inner == other.inner
    }
}

impl<A: Allocator> Eq for Dict<'_, A> {}

impl<A: Allocator> PartialOrd for Dict<'_, A> {
    #[inline]
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl<A: Allocator> Ord for Dict<'_, A> {
    #[inline]
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        self.inner.cmp(&other.inner)
    }
}

impl<A: Allocator> Default for Dict<'_, A> {
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}

impl<'this, 'heap, A: Allocator> IntoIterator for &'this Dict<'heap, A> {
    type Item = (&'this Value<'heap, A>, &'this Value<'heap, A>);

    type IntoIter = impl ExactSizeIterator<Item = (&'this Value<'heap, A>, &'this Value<'heap, A>)>
        + DoubleEndedIterator;

    fn into_iter(self) -> Self::IntoIter {
        self.inner.iter()
    }
}
