//! Tuple aggregate for the MIR interpreter.

use alloc::rc::Rc;
use core::{
    fmt::{self, Display},
    num::NonZero,
    ops::Index,
};
use std::{
    alloc::{Allocator, Global},
    cmp,
};

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
#[derive(Debug, Clone)]
pub struct Tuple<'heap, A: Allocator = Global> {
    values: Rc<[Value<'heap>], A>,
}

impl<'heap, A: Allocator> Tuple<'heap, A> {
    pub fn new_unchecked(values: Rc<[Value<'heap>], A>) -> Self {
        debug_assert!(!values.is_empty(), "tuple is non-empty by construction");

        Self { values }
    }

    /// Creates a new tuple from a slice of values.
    ///
    /// Returns [`None`] if `values` is empty.
    #[must_use]
    pub fn new(values: impl Into<Rc<[Value<'heap>], A>>) -> Option<Self> {
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

impl<'heap, A: Allocator> PartialEq for Tuple<'heap, A> {
    fn eq(&self, other: &Self) -> bool {
        let Self { values } = self;

        *values == other.values
    }
}

impl<'heap, A: Allocator> Eq for Tuple<'heap, A> {}

impl<'heap, A: Allocator> PartialOrd for Tuple<'heap, A> {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl<'heap, A: Allocator> Ord for Tuple<'heap, A> {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        let Self { values } = self;

        values.cmp(&other.values)
    }
}
