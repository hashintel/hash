//! Layout queries over an ordinary or revisioned base.
//!
//! [`VersionedLayoutProvider`] preserves the base's historical visibility when deltas compose.

use super::LayoutDelta;
use crate::{
    identity::NodeRowId,
    math::Vec2,
    serve2::{codec::Universe, delta::DeltaRevision, world::layout::LayoutProvider},
};

/// Position lookup at a retained revision, over the allocated row domain.
///
/// The domain includes withdrawn and unplaced rows. Historical lookups apply the provider's
/// retention policy, including its fallback after eviction.
pub(crate) trait VersionedLayoutProvider: LayoutProvider {
    fn provide_node_universe(&self) -> Universe<NodeRowId>;
    fn provide_position_at(&self, node: NodeRowId, revision: DeltaRevision) -> Option<Vec2>;
}

impl<T: VersionedLayoutProvider + ?Sized> VersionedLayoutProvider for &T {
    fn provide_node_universe(&self) -> Universe<NodeRowId> {
        T::provide_node_universe(self)
    }

    fn provide_position_at(&self, node: NodeRowId, revision: DeltaRevision) -> Option<Vec2> {
        T::provide_position_at(self, node, revision)
    }
}

/// An ordinary layout whose coordinates are the same at every revision.
pub(crate) struct NaiveLayoutProvider<T>(T);

impl<T> NaiveLayoutProvider<T> {
    pub(crate) const fn new(value: T) -> Self {
        Self(value)
    }
}

impl<T: LayoutProvider> LayoutProvider for NaiveLayoutProvider<T> {
    fn provide_node_count(&self) -> usize {
        self.0.provide_node_count()
    }

    fn provide_position(&self, node: NodeRowId) -> Option<Vec2> {
        self.0.provide_position(node)
    }
}

impl<T: LayoutProvider> VersionedLayoutProvider for NaiveLayoutProvider<T> {
    fn provide_node_universe(&self) -> Universe<NodeRowId> {
        Universe::from_length(self.provide_node_count())
    }

    fn provide_position_at(&self, node: NodeRowId, _: DeltaRevision) -> Option<Vec2> {
        self.provide_position(node)
    }
}

/// A layout with an additional layer of placements and visibility decisions.
///
/// Inherited nodes retain the base provider's coordinates and revision-dependent visibility.
/// A local live decision removes a local withdrawal without overriding a withdrawal in the base.
pub(crate) struct DeltaLayoutProvider<'delta, B> {
    data: &'delta LayoutDelta,
    base: B,
}

impl<'delta, B> DeltaLayoutProvider<'delta, B> {
    pub(crate) const fn from_parts(data: &'delta LayoutDelta, base: B) -> Self {
        Self { data, base }
    }
}

impl<B: VersionedLayoutProvider> LayoutProvider for DeltaLayoutProvider<'_, B> {
    fn provide_node_count(&self) -> usize {
        self.base.provide_node_count() + self.data.positions.len()
    }

    fn provide_position(&self, node: NodeRowId) -> Option<Vec2> {
        self.data.get(&self.base, node, None)
    }
}

impl<B: VersionedLayoutProvider> VersionedLayoutProvider for DeltaLayoutProvider<'_, B> {
    fn provide_node_universe(&self) -> Universe<NodeRowId> {
        Universe::from_length(self.provide_node_count())
    }

    fn provide_position_at(&self, node: NodeRowId, revision: DeltaRevision) -> Option<Vec2> {
        self.data.get(&self.base, node, Some(revision))
    }
}
