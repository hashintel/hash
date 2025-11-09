//! Place and projection representation for HashQL MIR.
//!
//! Places represent storage locations in the MIR, including local variables and complex paths
//! through data structures. Projections allow accessing nested data within structured types.

use core::alloc::Allocator;

use hashql_core::{id, intern::Interned, symbol::Symbol, r#type::TypeId};

use super::local::{Local, LocalDecl, LocalVec};
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

/// A borrowed reference to a place at a specific projection depth.
///
/// [`PlaceRef`] represents an intermediate point in a place's projection chain,
/// consisting of a root local and a slice of projections up to (but not including)
/// a particular projection step.
///
/// # Relationship to Place
///
/// While [`Place`] owns its complete projection sequence via [`Interned`],
/// [`PlaceRef`] borrows a prefix of that sequence.
///
/// # Example Structure
///
/// For a place like `local_0.field_1.field_2`:
/// - At projection 0: `PlaceRef { local: local_0, projections: [] }`
/// - At projection 1: `PlaceRef { local: local_0, projections: [field_1] }`
pub struct PlaceRef<'proj, 'heap> {
    /// The root local variable that this place reference starts from.
    pub local: Local,

    /// The partial sequence of projections representing the path up to this point.
    ///
    /// This slice contains all projections applied before the current projection
    /// being examined during iteration.
    pub projections: &'proj [Projection<'heap>],
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
    /// Creates a new place that directly references a local variable without any projections.
    ///
    /// This is the simplest form of a place, representing direct access to a local variable
    /// without navigating through any structured data. The resulting place has an empty
    /// projection sequence.
    pub fn local(local: Local, interner: &Interner<'heap>) -> Self {
        Self {
            local,
            projections: interner.projections.intern_slice(&[]),
        }
    }

    /// Extends this place with an additional projection, creating a deeper navigation path.
    ///
    /// This method creates a new [`Place`] that extends the current projection chain by
    /// appending one more projection step.
    #[must_use]
    pub fn project(
        self,
        interner: &Interner<'heap>,
        r#type: TypeId,
        kind: ProjectionKind<'heap>,
    ) -> Self {
        let mut projections = self.projections.to_vec();
        projections.push(Projection { r#type, kind });

        Self {
            local: self.local,
            projections: interner.projections.intern_slice(&projections),
        }
    }

    /// Iterates over each projection step in this place's navigation path.
    ///
    /// Returns an iterator that yields pairs of ([`PlaceRef`], [`Projection`]), where
    /// each [`PlaceRef`] represents the place up to (but not including) the current
    /// projection, and the [`Projection`] is the next step being taken.
    ///
    /// This allows examining how a place is built up step-by-step from its root local
    /// through each successive projection.
    ///
    /// # Returns
    ///
    /// An iterator that:
    /// - Yields `(PlaceRef, Projection)` tuples for each projection step
    /// - Is double-ended (can iterate forwards or backwards)
    /// - Has an exact known length
    #[must_use]
    pub fn iter_projections(
        self,
    ) -> impl DoubleEndedIterator<Item = (PlaceRef<'heap, 'heap>, Projection<'heap>)> + ExactSizeIterator
    {
        Self::iter_projections_from_parts(self.local, self.projections.0)
    }

    /// Iterates over projection steps from decomposed place components.
    ///
    /// This is a lower-level variant of [`iter_projections`] that operates on the raw
    /// components of a place (local and projection slice) rather than a [`Place`] instance.
    /// This is useful when you have a [`PlaceRef`] and want to iterate over its projections
    /// without first constructing a full [`Place`].
    ///
    /// [`iter_projections`]: Place::iter_projections
    #[must_use]
    pub fn iter_projections_from_parts(
        local: Local,
        projections: &'heap [Projection<'heap>],
    ) -> impl DoubleEndedIterator<Item = (PlaceRef<'heap, 'heap>, Projection<'heap>)> + ExactSizeIterator
    {
        projections
            .iter()
            .enumerate()
            .map(move |(index, projection)| {
                let place = PlaceRef {
                    local,
                    projections: &projections[..index],
                };

                (place, *projection)
            })
    }

    /// Return the type of the place after applying all projections.
    pub fn type_id<A: Allocator>(&self, decl: &LocalVec<LocalDecl<'heap>, A>) -> TypeId {
        self.projections
            .last()
            .map_or_else(|| decl[self.local].r#type, |projection| projection.r#type)
    }
}

/// A single projection step that navigates into structured data, carrying its result type.
///
/// A [`Projection`] represents one step in navigating through structured data, combining
/// both the navigation operation ([`ProjectionKind`]) and the resulting type of that operation.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Projection<'heap> {
    /// The type of the value after applying this projection.
    ///
    /// This is the result type of the projection operation, not the type being projected from.
    pub r#type: TypeId,

    /// The kind of projection operation being performed.
    pub kind: ProjectionKind<'heap>,
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
/// [`Field`]: ProjectionKind::Field
/// [`FieldByName`]: ProjectionKind::FieldByName
/// [`Index`]: ProjectionKind::Index
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ProjectionKind<'heap> {
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
