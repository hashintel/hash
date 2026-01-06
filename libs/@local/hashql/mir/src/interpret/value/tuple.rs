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
pub struct Tuple<'heap, A: Allocator> {
    values: Rc<[Value<'heap, A>], A>,
}

impl<'heap, A: Allocator> Tuple<'heap, A> {
    pub fn new_unchecked(values: Rc<[Value<'heap, A>], A>) -> Self {
        debug_assert!(!values.is_empty(), "tuple is non-empty by construction");

        Self { values }
    }

    /// Creates a new tuple from a slice of values.
    ///
    /// Returns [`None`] if `values` is empty.
    #[must_use]
    pub fn new(values: impl Into<Rc<[Value<'heap, A>], A>>) -> Option<Self> {
        let values = values.into();

        (!values.is_empty()).then_some(Self::new_unchecked(values))
    }

    /// Returns the tuple's values.
    #[must_use]
    pub fn values(&self) -> &[Value<'heap, A>] {
        &self.values
    }

    /// Returns the number of elements.
    #[must_use]
    pub fn len(&self) -> NonZero<usize> {
        NonZero::new(self.values.len()).expect("tuple is non-empty by construction")
    }

    /// Returns a reference to the element at the given `index`.
    #[must_use]
    pub fn get(&self, index: FieldIndex) -> Option<&Value<'heap, A>> {
        self.values.get(index.as_usize())
    }

    pub fn iter(&self) -> core::slice::Iter<'_, Value<'heap, A>> {
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
