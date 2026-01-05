//! List collection for the MIR interpreter.

use core::iter::FusedIterator;

use imbl::shared_ptr::RcK;

use super::Value;
use crate::body::constant::Int;

/// An ordered list of values.
///
/// Backed by an immutable persistent vector, enabling efficient structural
/// sharing when values are cloned or modified.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct List<'heap> {
    inner: imbl::GenericVector<Value<'heap>, RcK>,
}

impl<'heap> List<'heap> {
    pub fn new() -> Self {
        Self {
            inner: imbl::GenericVector::new(),
        }
    }

    /// Returns the number of elements in the list.
    #[must_use]
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// Returns `true` if the list contains no elements.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Appends a value to the end of the list.
    pub fn push_back(&mut self, value: Value<'heap>) {
        self.inner.push_back(value);
    }

    /// Returns a reference to the element at the given `index`.
    #[must_use]
    pub fn get(&self, index: Int) -> Option<&Value<'heap>> {
        let index = index.as_usize()?;

        self.inner.get(index)
    }

    pub fn iter(
        &self,
    ) -> impl ExactSizeIterator<Item = &Value<'heap>> + DoubleEndedIterator + FusedIterator {
        self.inner.iter()
    }
}

impl Default for List<'_> {
    fn default() -> Self {
        Self {
            inner: imbl::GenericVector::new(),
        }
    }
}

impl<'heap> FromIterator<Value<'heap>> for List<'heap> {
    fn from_iter<T: IntoIterator<Item = Value<'heap>>>(iter: T) -> Self {
        Self {
            inner: iter.into_iter().collect(),
        }
    }
}

impl<'this, 'heap> IntoIterator for &'this List<'heap> {
    type Item = &'this Value<'heap>;

    type IntoIter =
        impl ExactSizeIterator<Item = &'this Value<'heap>> + DoubleEndedIterator + FusedIterator;

    fn into_iter(self) -> Self::IntoIter {
        self.inner.iter()
    }
}
