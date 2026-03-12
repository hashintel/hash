//! Traversal path resolution, storage mapping, and transfer cost estimation.
//!
//! Maps property access projections on graph vertices to their backend storage locations.
//! Each vertex type has its own path enum ([`EntityPath`] for entities) that resolves
//! dot-notation field accesses to specific columns, JSONB paths, or embedding stores.
//!
//! Each path carries its origin backend (which execution targets serve it natively) and an
//! estimated transfer size used by the cost analysis to charge a transfer premium on targets
//! that are not the natural origin for a path.
//!
//! [`TraversalPathBitSet`] and [`TraversalPath`] wrap the per-vertex-type path types so that
//! the execution pipeline can handle different vertex types uniformly.

mod access;
mod entity;

mod analysis;
#[cfg(test)]
mod tests;
mod r#type;

pub(crate) use analysis::{TraversalAnalysisVisitor, TraversalResult};
use hashql_core::{
    id::IdArray,
    symbol::Symbol,
    r#type::{TypeId, environment::Environment},
};

pub use self::entity::{EntityPath, EntityPathBitSet};
pub(crate) use self::{access::Access, entity::TransferCostConfig, r#type::traverse_struct};
use super::{VertexType, target::TargetBitSet};
use crate::pass::analysis::{
    dataflow::lattice::{HasBottom, HasTop, JoinSemiLattice},
    size_estimation::InformationRange,
};

/// Lattice structure for traversal path bitsets.
///
/// Carries the [`VertexType`] so that [`bottom`](HasBottom::bottom) and [`top`](HasTop::top)
/// construct the correct variant of [`TraversalPathBitSet`].
#[derive(Debug, Copy, Clone)]
pub struct TraversalLattice {
    vertex: VertexType,
}

impl TraversalLattice {
    /// Creates a lattice for the given vertex type.
    #[must_use]
    pub const fn new(vertex: VertexType) -> Self {
        Self { vertex }
    }

    /// Returns the vertex type this lattice operates over.
    #[must_use]
    pub const fn vertex(self) -> VertexType {
        self.vertex
    }
}

/// Set of resolved traversal paths for a single vertex type.
///
/// Each variant wraps the bitset for a specific vertex type. A [`GraphReadFilter`] body operates
/// over exactly one vertex type, so all traversal locals within a body share the same variant.
///
/// An all-bits-set bitset indicates full vertex access is required (the path could not be
/// resolved to a specific field).
///
/// [`GraphReadFilter`]: crate::body::Source::GraphReadFilter
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum TraversalPathBitSet {
    /// Paths into the entity schema.
    Entity(EntityPathBitSet),
}

#[expect(
    clippy::unnecessary_wraps,
    reason = "currently only entities are supported, this will change in the future"
)]
impl TraversalPathBitSet {
    /// Creates an empty bitset for the given vertex type.
    #[must_use]
    pub const fn empty(vertex: VertexType) -> Self {
        match vertex {
            VertexType::Entity => Self::Entity(EntityPathBitSet::new_empty()),
        }
    }

    /// Returns the inner [`EntityPathBitSet`] if this is the [`Entity`](Self::Entity) variant.
    #[inline]
    #[must_use]
    pub const fn as_entity(&self) -> Option<&EntityPathBitSet> {
        match self {
            Self::Entity(bitset) => Some(bitset),
        }
    }

    /// Returns a mutable reference to the inner [`EntityPathBitSet`] if this is the
    /// [`Entity`](Self::Entity) variant.
    #[inline]
    #[must_use]
    pub const fn as_entity_mut(&mut self) -> Option<&mut EntityPathBitSet> {
        match self {
            Self::Entity(bitset) => Some(bitset),
        }
    }

    /// Returns `true` if no paths are set.
    #[inline]
    #[must_use]
    pub const fn is_empty(self) -> bool {
        match self {
            Self::Entity(bitset) => bitset.is_empty(),
        }
    }

    /// Returns the number of paths set.
    #[inline]
    #[must_use]
    pub fn len(self) -> usize {
        match self {
            Self::Entity(bitset) => bitset.len(),
        }
    }

    /// Inserts a resolved path with composite swallowing.
    ///
    /// If an ancestor composite is already present in the set, the insertion is a no-op.
    /// If the path is a composite, any children already in the set are removed.
    pub fn insert(&mut self, path: TraversalPath) {
        match (self, path) {
            (Self::Entity(bitset), TraversalPath::Entity(path)) => bitset.insert(path),
        }
    }

    /// Returns `true` if `path` is present in the bitset.
    #[must_use]
    pub const fn contains(self, path: TraversalPath) -> bool {
        match (self, path) {
            (Self::Entity(bitset), TraversalPath::Entity(path)) => bitset.contains(path),
        }
    }

    /// Inserts all possible paths into the set.
    #[inline]
    pub const fn insert_all(&mut self) {
        match self {
            Self::Entity(bitset) => bitset.insert_all(),
        }
    }

    /// Iterates over the paths in this bitset.
    #[must_use]
    #[inline]
    pub fn iter(&self) -> impl ExactSizeIterator<Item = TraversalPath> {
        self.into_iter()
    }

    #[must_use]
    #[inline]
    pub const fn vertex(self) -> VertexType {
        match self {
            Self::Entity(_) => VertexType::Entity,
        }
    }
}

impl IntoIterator for &TraversalPathBitSet {
    type Item = TraversalPath;

    type IntoIter = impl ExactSizeIterator<Item = TraversalPath>;

    fn into_iter(self) -> Self::IntoIter {
        match self {
            TraversalPathBitSet::Entity(bitset) => bitset.into_iter().map(TraversalPath::Entity),
        }
    }
}

impl HasBottom<TraversalPathBitSet> for TraversalLattice {
    fn bottom(&self) -> TraversalPathBitSet {
        match self.vertex {
            VertexType::Entity => TraversalPathBitSet::Entity(self.bottom()),
        }
    }

    fn is_bottom(&self, value: &TraversalPathBitSet) -> bool {
        match value {
            TraversalPathBitSet::Entity(bitset) => self.is_bottom(bitset),
        }
    }
}

impl HasTop<TraversalPathBitSet> for TraversalLattice {
    fn top(&self) -> TraversalPathBitSet {
        match self.vertex {
            VertexType::Entity => TraversalPathBitSet::Entity(self.top()),
        }
    }

    fn is_top(&self, value: &TraversalPathBitSet) -> bool {
        match value {
            TraversalPathBitSet::Entity(bitset) => self.is_top(bitset),
        }
    }
}

impl JoinSemiLattice<TraversalPathBitSet> for TraversalLattice {
    fn join(&self, lhs: &mut TraversalPathBitSet, rhs: &TraversalPathBitSet) -> bool {
        match (lhs, rhs) {
            (TraversalPathBitSet::Entity(lhs), TraversalPathBitSet::Entity(rhs)) => {
                self.join(lhs, rhs)
            }
        }
    }

    fn join_owned(
        &self,
        lhs: TraversalPathBitSet,
        rhs: &TraversalPathBitSet,
    ) -> TraversalPathBitSet {
        match (lhs, rhs) {
            (TraversalPathBitSet::Entity(lhs), TraversalPathBitSet::Entity(rhs)) => {
                TraversalPathBitSet::Entity(self.join_owned(lhs, rhs))
            }
        }
    }
}

/// A single resolved traversal path for a specific vertex type.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum TraversalPath {
    /// A path into the entity schema.
    Entity(EntityPath),
}

impl TraversalPath {
    /// Returns a unique symbol identifying this path variant.
    ///
    /// Used as column aliases in SQL generation so the interpreter can locate
    /// result columns by name.
    #[inline]
    #[must_use]
    pub const fn as_symbol(self) -> Symbol<'static> {
        match self {
            Self::Entity(path) => path.as_symbol(),
        }
    }

    /// Resolves this path to its [`TypeId`] within the given vertex type.
    ///
    /// Navigates the vertex type structure to find the type corresponding to this
    /// storage location. See [`EntityPath::resolve_type`] for details on the resolution
    /// process.
    #[inline]
    #[must_use]
    pub fn resolve_type(self, env: &Environment<'_>, r#type: TypeId) -> TypeId {
        match self {
            Self::Entity(path) => path.resolve_type(env, r#type),
        }
    }

    /// Returns the set of execution targets that natively serve this path.
    #[inline]
    #[must_use]
    pub const fn origin(self) -> TargetBitSet {
        match self {
            Self::Entity(path) => path.origin(),
        }
    }

    /// Returns the estimated transfer size for this path.
    #[inline]
    pub(crate) fn estimate_size(self, config: &TransferCostConfig) -> InformationRange {
        match self {
            Self::Entity(path) => path.estimate_size(config),
        }
    }
}

/// Traversal path bitsets for all vertex types.
///
/// Maps each [`VertexType`] to its [`TraversalPathBitSet`], providing a unified view of path
/// accesses across all vertex types in a query. Where [`TraversalPathBitSet`] tracks paths for a
/// single vertex type, the bitmap tracks paths for all of them.
///
/// Lattice operations are pointwise via [`TraversalMapLattice`]: bottom is all-empty, top has
/// every slot at its [`TraversalPathBitSet`] top, and join unions each slot independently.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TraversalPathBitMap(
    IdArray<VertexType, TraversalPathBitSet, { VertexType::VARIANT_COUNT }>,
);

impl TraversalPathBitMap {
    const BOTTOM: Self = Self(IdArray::from_raw([TraversalPathBitSet::empty(
        VertexType::Entity,
    )]));
    const TOP: Self = {
        let mut entity = TraversalPathBitSet::empty(VertexType::Entity);
        entity.insert_all();

        Self(IdArray::from_raw([entity]))
    };

    /// Joins a [`TraversalPathBitSet`] into the slot for its vertex type.
    pub fn insert(&mut self, bitset: TraversalPathBitSet) {
        let vertex = bitset.vertex();
        let lattice = TraversalLattice::new(vertex);
        lattice.join(&mut self.0[vertex], &bitset);
    }
}

impl From<TraversalPathBitSet> for TraversalPathBitMap {
    fn from(value: TraversalPathBitSet) -> Self {
        let mut this = TraversalMapLattice.bottom();
        this[value.vertex()] = value;
        this
    }
}

impl core::ops::Index<VertexType> for TraversalPathBitMap {
    type Output = TraversalPathBitSet;

    #[inline]
    fn index(&self, index: VertexType) -> &Self::Output {
        &self.0[index]
    }
}

impl core::ops::IndexMut<VertexType> for TraversalPathBitMap {
    #[inline]
    fn index_mut(&mut self, index: VertexType) -> &mut Self::Output {
        &mut self.0[index]
    }
}

/// Pointwise lattice over [`TraversalPathBitMap`].
///
/// Delegates each [`VertexType`] slot to its [`TraversalLattice`], so bottom is all-empty,
/// top has every slot at its [`TraversalPathBitSet`] top, and join unions each slot
/// independently.
#[derive(Debug, Copy, Clone)]
pub struct TraversalMapLattice;

impl HasBottom<TraversalPathBitMap> for TraversalMapLattice {
    fn bottom(&self) -> TraversalPathBitMap {
        TraversalPathBitMap::BOTTOM
    }

    fn is_bottom(&self, value: &TraversalPathBitMap) -> bool {
        *value == self.bottom()
    }
}

impl HasTop<TraversalPathBitMap> for TraversalMapLattice {
    fn top(&self) -> TraversalPathBitMap {
        TraversalPathBitMap::TOP
    }

    fn is_top(&self, value: &TraversalPathBitMap) -> bool {
        *value == self.top()
    }
}

impl JoinSemiLattice<TraversalPathBitMap> for TraversalMapLattice {
    fn join(&self, lhs: &mut TraversalPathBitMap, rhs: &TraversalPathBitMap) -> bool {
        let mut changed = false;

        for (vertex, rhs_bitset) in rhs.0.iter_enumerated() {
            let lattice = TraversalLattice::new(vertex);
            changed |= lattice.join(&mut lhs.0[vertex], rhs_bitset);
        }

        changed
    }
}
