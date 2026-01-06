//! Dictionary collection for the MIR interpreter.

use core::{alloc::Allocator, cmp, iter::FusedIterator};

use imbl::shared_ptr::RcK;

use super::Value;

/// An ordered dictionary mapping values to values.
///
/// Backed by an immutable persistent ordered map, enabling efficient structural
/// sharing when values are cloned or modified. Keys are ordered using their
/// [`Ord`] implementation.
#[derive(Debug, Clone)]
pub struct Dict<'heap, A: Allocator> {
    inner: imbl::GenericOrdMap<Value<'heap, A>, Value<'heap, A>, RcK>,
}

impl<'heap, A: Allocator> Dict<'heap, A> {
    pub fn new() -> Self {
        Self {
            inner: imbl::GenericOrdMap::new(),
        }
    }

    /// Returns the number of key-value pairs in the dictionary.
    #[must_use]
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// Returns `true` if the dictionary contains no elements.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Inserts a key-value pair into the dictionary.
    ///
    /// If the key already exists, its value is replaced and the old value
    /// is returned.
    pub fn insert(
        &mut self,
        key: Value<'heap, A>,
        value: Value<'heap, A>,
    ) -> Option<Value<'heap, A>>
    where
        A: Clone,
    {
        self.inner.insert(key, value)
    }

    /// Returns a reference to the value associated with the `key`.
    #[must_use]
    pub fn get(&self, key: &Value<'heap, A>) -> Option<&Value<'heap, A>> {
        self.inner.get(key)
    }

    pub fn get_mut(&mut self, key: Value<'heap, A>) -> &mut Value<'heap, A>
    where
        A: Clone,
    {
        self.inner.entry(key).or_insert(Value::Unit)
    }

    pub fn iter(
        &self,
    ) -> impl ExactSizeIterator<Item = (&Value<'heap, A>, &Value<'heap, A>)>
    + DoubleEndedIterator
    + FusedIterator {
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
    fn default() -> Self {
        Self {
            inner: imbl::GenericOrdMap::new(),
        }
    }
}

impl<'this, 'heap, A: Allocator> IntoIterator for &'this Dict<'heap, A> {
    type Item = (&'this Value<'heap, A>, &'this Value<'heap, A>);

    type IntoIter = impl ExactSizeIterator<Item = (&'this Value<'heap, A>, &'this Value<'heap, A>)>
        + DoubleEndedIterator
        + FusedIterator;

    fn into_iter(self) -> Self::IntoIter {
        self.inner.iter()
    }
}
