//! Struct aggregate for the MIR interpreter.

use alloc::rc::Rc;
use core::ops::Index;

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
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Struct<'heap> {
    fields: Interned<'heap, [Symbol<'heap>]>,
    values: Rc<[Value<'heap>]>,
}

impl<'heap> Struct<'heap> {
    pub fn new_unchecked(
        fields: Interned<'heap, [Symbol<'heap>]>,
        values: Rc<[Value<'heap>]>,
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
        values: Rc<[Value<'heap>]>,
    ) -> Option<Self> {
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

impl<'a, 'heap> IntoIterator for &'a Struct<'heap> {
    type IntoIter = StructIter<'a, 'heap>;
    type Item = (Symbol<'heap>, &'a Value<'heap>);

    fn into_iter(self) -> Self::IntoIter {
        StructIter {
            fields: self.fields.iter(),
            values: self.values.iter(),
        }
    }
}

/// Iterator over (field name, value) pairs of a [`Struct`].
pub struct StructIter<'a, 'heap> {
    fields: core::slice::Iter<'a, Symbol<'heap>>,
    values: core::slice::Iter<'a, Value<'heap>>,
}

impl<'a, 'heap> Iterator for StructIter<'a, 'heap> {
    type Item = (Symbol<'heap>, &'a Value<'heap>);

    fn next(&mut self) -> Option<Self::Item> {
        Some((*self.fields.next()?, self.values.next()?))
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        self.fields.size_hint()
    }
}

impl ExactSizeIterator for StructIter<'_, '_> {}
