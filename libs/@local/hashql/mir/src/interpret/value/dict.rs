//! Dictionary collection for the MIR interpreter.

use core::iter::FusedIterator;

use imbl::shared_ptr::RcK;

use super::Value;

/// An ordered dictionary mapping values to values.
///
/// Backed by an immutable persistent ordered map, enabling efficient structural
/// sharing when values are cloned or modified. Keys are ordered using their
/// [`Ord`] implementation.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Dict<'heap> {
    inner: imbl::GenericOrdMap<Value<'heap>, Value<'heap>, RcK>,
}

impl<'heap> Dict<'heap> {
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
    pub fn insert(&mut self, key: Value<'heap>, value: Value<'heap>) -> Option<Value<'heap>> {
        self.inner.insert(key, value)
    }

    /// Returns a reference to the value associated with the `key`.
    #[must_use]
    pub fn get(&self, key: &Value<'heap>) -> Option<&Value<'heap>> {
        self.inner.get(key)
    }

    pub fn iter(
        &self,
    ) -> impl ExactSizeIterator<Item = (&Value<'heap>, &Value<'heap>)>
    + DoubleEndedIterator
    + FusedIterator {
        self.inner.iter()
    }
}

impl Default for Dict<'_> {
    fn default() -> Self {
        Self {
            inner: imbl::GenericOrdMap::new(),
        }
    }
}

impl<'heap> FromIterator<(Value<'heap>, Value<'heap>)> for Dict<'heap> {
    fn from_iter<T: IntoIterator<Item = (Value<'heap>, Value<'heap>)>>(iter: T) -> Self {
        Self {
            inner: iter.into_iter().collect(),
        }
    }
}

impl<'this, 'heap> IntoIterator for &'this Dict<'heap> {
    type Item = (&'this Value<'heap>, &'this Value<'heap>);

    type IntoIter = impl ExactSizeIterator<Item = (&'this Value<'heap>, &'this Value<'heap>)>
        + DoubleEndedIterator
        + FusedIterator;

    fn into_iter(self) -> Self::IntoIter {
        self.inner.iter()
    }
}
