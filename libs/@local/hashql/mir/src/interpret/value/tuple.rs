//! Tuple aggregate for the MIR interpreter.

use alloc::rc::Rc;
use core::{num::NonZero, ops::Index};

use hashql_core::id::Id as _;

use super::Value;
use crate::body::place::FieldIndex;

/// A positional tuple value.
///
/// Contains an ordered sequence of values accessed by index. Unlike unit
/// (represented by [`Value::Unit`]), a tuple always contains at least one
/// element.
///
/// # Invariants
///
/// - Must be non-empty (empty tuples should use [`Value::Unit`])
///
/// [`Value::Unit`]: super::Value::Unit
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Tuple<'heap> {
    values: Rc<[Value<'heap>]>,
}

impl<'heap> Tuple<'heap> {
    pub fn new_unchecked(values: Rc<[Value<'heap>]>) -> Self {
        debug_assert!(!values.is_empty(), "tuple is non-empty by construction");

        Self { values }
    }

    /// Creates a new tuple from a slice of values.
    ///
    /// Returns [`None`] if `values` is empty.
    #[must_use]
    pub fn new(values: impl Into<Rc<[Value<'heap>]>>) -> Option<Self> {
        let values = values.into();

        (!values.is_empty()).then_some(Self::new_unchecked(values))
    }

    /// Returns the tuple's values.
    #[must_use]
    pub fn values(&self) -> &[Value<'heap>] {
        &self.values
    }

    /// Returns the number of elements.
    #[must_use]
    pub fn len(&self) -> NonZero<usize> {
        NonZero::new(self.values.len()).expect("tuple is non-empty by construction")
    }

    /// Returns a reference to the element at the given `index`.
    #[must_use]
    pub fn get(&self, index: FieldIndex) -> Option<&Value<'heap>> {
        self.values.get(index.as_usize())
    }

    pub fn iter(&self) -> core::slice::Iter<'_, Value<'heap>> {
        self.values.iter()
    }
}

impl<'heap> Index<FieldIndex> for Tuple<'heap> {
    type Output = Value<'heap>;

    fn index(&self, index: FieldIndex) -> &Self::Output {
        &self.values[index.as_usize()]
    }
}

impl<'this, 'heap> IntoIterator for &'this Tuple<'heap> {
    type IntoIter = core::slice::Iter<'this, Value<'heap>>;
    type Item = &'this Value<'heap>;

    fn into_iter(self) -> Self::IntoIter {
        self.values.iter()
    }
}
