//! Struct aggregate for the MIR interpreter.

use alloc::rc::Rc;
use core::{
    fmt::{self, Display},
    ops::Index,
};
use std::{
    alloc::{Allocator, Global},
    cmp,
};

use hashql_core::{id::Id as _, intern::Interned, symbol::Symbol};

use super::Value;
use crate::body::place::FieldIndex;

/// A named-field struct value.
///
/// Contains field names (interned symbols) and their corresponding values.
/// Field order is preserved and significant for comparison.
///
/// # Invariants
///
/// - `fields.len() == values.len()`
/// - Field names should be unique (not enforced at construction)
#[derive(Debug, Clone)]
pub struct Struct<'heap, A: Allocator = Global> {
    fields: Interned<'heap, [Symbol<'heap>]>,
    values: Rc<[Value<'heap>], A>,
}

impl<'heap, A: Allocator> Struct<'heap, A> {
    pub fn new_unchecked(
        fields: Interned<'heap, [Symbol<'heap>]>,
        values: Rc<[Value<'heap>], A>,
    ) -> Self {
        debug_assert_eq!(fields.len(), values.len());

        Self { fields, values }
    }

    /// Creates a new struct from field names and values.
    ///
    /// Returns [`None`] if `fields` and `values` have different lengths.
    #[must_use]
    pub fn new(
        fields: Interned<'heap, [Symbol<'heap>]>,
        values: impl Into<Rc<[Value<'heap>], A>>,
    ) -> Option<Self> {
        let values = values.into();

        (fields.len() == values.len()).then(|| Self::new_unchecked(fields, values))
    }

    /// Returns the field names.
    #[must_use]
    pub const fn fields(&self) -> &Interned<'heap, [Symbol<'heap>]> {
        &self.fields
    }

    /// Returns the field values.
    #[must_use]
    pub fn values(&self) -> &[Value<'heap>] {
        &self.values
    }

    /// Returns the number of fields.
    #[must_use]
    pub fn len(&self) -> usize {
        self.fields.len()
    }

    /// Returns `true` if the struct has no fields.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.fields.is_empty()
    }

    /// Returns the value for the given `field` name.
    #[must_use]
    pub fn get_by_name(&self, field: Symbol<'heap>) -> Option<&Value<'heap>> {
        self.fields
            .iter()
            .position(|&symbol| symbol == field)
            .map(|index| &self.values[index])
    }

    #[must_use]
    pub fn get_by_index(&self, index: FieldIndex) -> Option<&Value<'heap>> {
        self.values.get(index.as_usize())
    }

    pub fn iter(&self) -> StructIter<'_, 'heap> {
        StructIter {
            fields: self.fields.iter().copied(),
            values: self.values.iter(),
        }
    }

    pub fn type_name(&self) -> impl Display {
        fmt::from_fn(|fmt| {
            fmt.write_str("(")?;

            for (index, (key, value)) in self.fields.iter().zip(self.values.iter()).enumerate() {
                if index > 0 {
                    fmt.write_str(", ")?;
                }

                write!(fmt, "{}: {}", key, value.type_name())?;
            }

            fmt.write_str(")")?;

            Ok(())
        })
    }
}

impl<'heap> Index<Symbol<'heap>> for Struct<'heap> {
    type Output = Value<'heap>;

    fn index(&self, index: Symbol<'heap>) -> &Self::Output {
        self.get_by_name(index).expect("struct field not found")
    }
}

impl<'heap> Index<FieldIndex> for Struct<'heap> {
    type Output = Value<'heap>;

    fn index(&self, index: FieldIndex) -> &Self::Output {
        &self.values[index.as_usize()]
    }
}

impl<'this, 'heap> IntoIterator for &'this Struct<'heap> {
    type IntoIter = StructIter<'this, 'heap>;
    type Item = (Symbol<'heap>, &'this Value<'heap>);

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl<A: Allocator> PartialEq for Struct<'_, A> {
    fn eq(&self, other: &Self) -> bool {
        let Self { fields, values } = self;

        *fields == other.fields && *values == other.values
    }
}

impl<A: Allocator> Eq for Struct<'_, A> {}

impl<A: Allocator> PartialOrd for Struct<'_, A> {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl<A: Allocator> Ord for Struct<'_, A> {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        let Self { fields, values } = self;

        fields
            .cmp(&other.fields)
            .then_with(|| values.cmp(&other.values))
    }
}

/// Iterator over (field name, value) pairs of a [`Struct`].
pub struct StructIter<'this, 'heap> {
    fields: core::iter::Copied<core::slice::Iter<'this, Symbol<'heap>>>,
    values: core::slice::Iter<'this, Value<'heap>>,
}

impl<'this, 'heap> Iterator for StructIter<'this, 'heap> {
    type Item = (Symbol<'heap>, &'this Value<'heap>);

    fn next(&mut self) -> Option<Self::Item> {
        Some((self.fields.next()?, self.values.next()?))
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.fields.size_hint()
    }
}

impl DoubleEndedIterator for StructIter<'_, '_> {
    fn next_back(&mut self) -> Option<Self::Item> {
        Some((self.fields.next_back()?, self.values.next_back()?))
    }
}

impl ExactSizeIterator for StructIter<'_, '_> {}
