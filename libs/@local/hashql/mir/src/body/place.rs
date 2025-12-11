//! Place and projection representation for HashQL MIR.
//!
//! Places represent storage locations in the MIR, including local variables and complex paths
//! through data structures. Projections allow accessing nested data within structured types.

use core::{alloc::Allocator, fmt};

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

/// Context for reading from a [`Place`].
///
/// Describes how a place is being read during MIR execution. This distinction is important
/// for dataflow analysis, as reading a base local through a projection differs semantically
/// from loading the entire value.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PlaceReadContext {
    /// The place's value is being loaded directly.
    ///
    /// This represents a full read of the value at the place, such as using a variable
    /// as an operand: `let y = x;` reads `x` with `Load` context.
    Load,

    /// The place is being read as the base of a projection.
    ///
    /// When accessing `x.field`, the local `x` is read with `Projection` context,
    /// indicating that only part of the value is being accessed. This is relevant
    /// for analyses that track partial vs. full uses of values.
    Projection,
}

/// Context for writing to a [`Place`].
///
/// Describes how a place is being written during MIR execution. The distinction between
/// full assignment and partial writes through projections is critical for dataflow analysis,
/// particularly for determining when a value is fully defined vs. partially modified.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PlaceWriteContext {
    /// The place is being fully assigned a new value.
    ///
    /// This represents a complete definition of the place, such as the left-hand side
    /// of an assignment statement: `x = value;` writes to `x` with `Assign` context.
    Assign,

    /// The place is being written through as the base of a projection.
    ///
    /// When assigning to `x.field = value`, the local `x` is accessed with `Projection`
    /// context. This indicates a partial write: the local `x` must already be initialized,
    /// and only part of its value is being modified.
    Projection,

    /// The place is receiving a value as a basic block parameter.
    ///
    /// When control flow enters a basic block with parameters, those parameters are
    /// assigned values from the predecessor's target arguments. Semantically equivalent
    /// to [`Assign`](Self::Assign) for dataflow purposes, but distinguished to allow
    /// tracking of inter-block value flow.
    BlockParam,
}

/// Context for liveness markers on a [`Place`].
///
/// Liveness markers indicate when storage for a local variable becomes active or inactive.
/// These are not uses or definitions in the dataflow sense, but rather metadata about
/// the storage lifetime that enables memory optimization and borrow checking.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PlaceLivenessContext {
    /// Storage for the place becomes live.
    ///
    /// Corresponds to [`StatementKind::StorageLive`]. After this point, the storage
    /// is allocated and the place can be written to. The value is not yet initialized.
    ///
    /// [`StatementKind::StorageLive`]: crate::body::statement::StatementKind::StorageLive
    Begin,

    /// Storage for the place becomes dead.
    ///
    /// Corresponds to [`StatementKind::StorageDead`]. After this point, the storage
    /// may be deallocated or reused. Any subsequent access to this place before another
    /// `Begin` is undefined behavior.
    ///
    /// [`StatementKind::StorageDead`]: crate::body::statement::StatementKind::StorageDead
    End,
}

/// The context in which a [`Place`] is accessed during MIR traversal.
///
/// [`PlaceContext`] categorizes every place access into one of three categories:
/// reading, writing, or liveness tracking. This information is essential for
/// dataflow analysis, optimization passes, and correctness checking.
///
/// # Dataflow Analysis
///
/// Use [`into_def_use`](Self::into_def_use) to convert a context into its dataflow
/// classification for def-use analysis. Liveness contexts return `None` as they
/// don't participate in value flow.
///
/// # Example
///
/// ```text
/// In the statement: x.field = y
/// - `x` is accessed with Write(Projection) - partial write through projection
/// - `y` is accessed with Read(Load) - full value read
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PlaceContext {
    /// The place is being read from.
    Read(PlaceReadContext),

    /// The place is being written to.
    Write(PlaceWriteContext),

    /// The place's storage liveness is being marked.
    Liveness(PlaceLivenessContext),
}

impl PlaceContext {
    #[must_use]
    pub const fn is_use(self) -> bool {
        matches!(self, Self::Read(_) | Self::Write(_))
    }

    #[must_use]
    pub const fn is_write(self) -> bool {
        matches!(self, Self::Write(_))
    }

    #[must_use]
    pub const fn is_read(self) -> bool {
        matches!(self, Self::Read(_))
    }

    /// Converts this context to its def-use classification for dataflow analysis.
    ///
    /// Returns `None` for liveness markers, which don't participate in value flow.
    #[must_use]
    pub const fn into_def_use(self) -> Option<DefUse> {
        match self {
            Self::Read(_) => Some(DefUse::Use),
            Self::Write(PlaceWriteContext::Projection) => Some(DefUse::PartialDef),
            Self::Write(PlaceWriteContext::Assign | PlaceWriteContext::BlockParam) => {
                Some(DefUse::Def)
            }
            Self::Liveness(_) => None,
        }
    }
}

/// Classification of place accesses for def-use analysis.
///
/// This enum represents the three fundamental categories of place access in dataflow analysis:
/// definitions (writes that fully initialize), uses (reads), and partial writes (modifications
/// to part of an already-initialized value).
///
/// Obtained via [`PlaceContext::into_def_use`]. Liveness markers don't participate in
/// def-use analysis and return `None`.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum DefUse {
    /// A full definition of the place.
    ///
    /// The place is being assigned a complete new value, making any previous value irrelevant.
    /// This corresponds to [`PlaceWriteContext::Assign`] and [`PlaceWriteContext::BlockParam`].
    Def,

    /// A partial modification of the place.
    ///
    /// Part of the place's value is being written through a projection (e.g., `x.field = v`).
    /// The place must already be initialized, and only a portion is being modified.
    /// This corresponds to [`PlaceWriteContext::Projection`].
    PartialDef,

    /// A use of the place's value.
    ///
    /// The place's current value is being read. This corresponds to all [`PlaceReadContext`]
    /// variants, as both direct loads and projection-based reads consume the value.
    Use,
}

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
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct PlaceRef<'proj, 'heap> {
    /// The root local variable that this place reference starts from.
    pub local: Local,

    /// The partial sequence of projections representing the path up to this point.
    ///
    /// This slice contains all projections applied before the current projection
    /// being examined during iteration.
    pub projections: &'proj [Projection<'heap>],
}

impl<'proj, 'heap> PlaceRef<'proj, 'heap> {
    pub fn intern(&self, interner: &Interner<'heap>) -> Place<'heap> {
        Place {
            local: self.local,
            projections: interner.projections.intern_slice(self.projections),
        }
    }
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

impl fmt::Display for ProjectionKind<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProjectionKind::Field(index) => write!(fmt, ".{index}"),
            ProjectionKind::FieldByName(name) => write!(fmt, ".{name}"),
            ProjectionKind::Index(index) => write!(fmt, "[%{index}]"),
        }
    }
}
