//! Place and projection representation for HashQL MIR.
//!
//! Places represent storage locations in the MIR, including local variables and complex paths
//! through data structures. Projections allow accessing nested data within structured types.

use hashql_core::{id, intern::Interned, symbol::Symbol};

use super::local::Local;
use crate::intern::Interner;

id::newtype!(
    /// A positional index for accessing fields in closed structured types.
    ///
    /// Field indices are used for positional field access when the complete structure
    /// of a type is known at compile time. This enables efficient access by position
    /// rather than by name lookup.
    ///
    /// # Usage Context
    ///
    /// Used with [`Projection::Field`] for:
    /// - Tuple elements (e.g., `tuple.0`, `tuple.1`)
    /// - Closed struct fields with known layout
    /// - Any structured type where field positions are stable and complete
    pub struct FieldIndex(usize is 0..=usize::MAX)
);

pub struct PlaceRef<'heap> {
    pub local: Local,
    pub projections: &'heap [Projection<'heap>],
}

/// A storage location that can be read from or written to in the MIR.
///
/// A [`Place`] represents a path to a storage location, starting from a [`Local`] variable and
/// potentially following a series of projections to access nested data within structured types.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Place<'heap> {
    /// The root local variable that this place starts from.
    ///
    /// All places must start with a [`Local`] variable as their base. This
    /// represents the fundamental storage location before any projections
    /// are applied.
    pub local: Local,

    /// The sequence of projections applied to navigate within the data.
    ///
    /// Each [`Projection`] in this sequence specifies a step in navigating from the root local to
    /// the final storage location. An empty sequence means the place refers directly to the
    /// local variable.
    pub projections: Interned<'heap, [Projection<'heap>]>,
}

impl<'heap> Place<'heap> {
    pub fn local(local: Local, interner: &Interner<'heap>) -> Self {
        Self {
            local,
            projections: interner.projections.intern_slice(&[]),
        }
    }

    #[must_use]
    pub fn project(self, interner: &Interner<'heap>, projection: Projection<'heap>) -> Self {
        let mut projections = self.projections.to_vec();
        projections.push(projection);

        Self {
            local: self.local,
            projections: interner.projections.intern_slice(&projections),
        }
    }

    #[must_use]
    pub fn iter_projections(
        self,
    ) -> impl DoubleEndedIterator<Item = (PlaceRef<'heap>, Projection<'heap>)> + ExactSizeIterator
    {
        self.projections
            .0
            .iter()
            .enumerate()
            .map(move |(index, projection)| {
                let place = PlaceRef {
                    local: self.local,
                    projections: &self.projections.0[..index],
                };

                (place, *projection)
            })
    }
}

/// A projection operation that navigates within structured data.
///
/// Projections allow places to reference nested data within structured types.
/// HashQL's structural type system supports both closed types (where the complete
/// structure is known) and open types (where only a subset of fields may be known).
/// Each projection represents a single step in navigating from one level of nesting
/// to another.
///
/// # Access Methods
///
/// - **Positional Access**: [`Field`] uses indices for closed/complete types
/// - **Name-based Access**: [`FieldByName`] uses symbols for structural/partial types
/// - **Dynamic Access**: [`Index`] uses computed values for collections
///
/// [`Field`]: Projection::Field
/// [`FieldByName`]: Projection::FieldByName
/// [`Index`]: Projection::Index
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Projection<'heap> {
    /// Access a field by positional index in a closed/complete type.
    ///
    /// This projection provides efficient positional access when the complete
    /// structure is known at compile time. The [`FieldIndex`] directly maps
    /// to the field's position in the type layout.
    ///
    /// # When to Use
    ///
    /// - Tuple field access: `tuple.0`, `tuple.1`, etc.
    /// - Closed struct fields with stable positions
    /// - Any type where the complete field layout is known and fixed
    Field(FieldIndex),

    /// Access a field by symbolic name in a structural type.
    ///
    /// This projection enables name-based field access for HashQL's structural
    /// type system, where only a subset of fields may be known at compile time.
    /// The field is guaranteed to exist but its position may not be stable.
    ///
    /// # When to Use
    ///
    /// - Structural type field access: `obj.field_name`
    /// - Open struct types where complete structure is unknown
    /// - Duck typing scenarios where only certain fields are required
    /// - Gradual typing where field presence is verified but position is unknown
    FieldByName(Symbol<'heap>),

    /// Access an element at a computed index within an indexable type.
    ///
    /// This projection navigates to an element within a list or dictionary. The
    /// [`Local`] contains the index value that determines which element to access.
    Index(Local),
}
