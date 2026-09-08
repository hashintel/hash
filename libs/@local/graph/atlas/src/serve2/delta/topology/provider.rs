//! Topology queries over an ordinary or revisioned base.
//!
//! [`VersionedTopologyProvider`] preserves the base's historical visibility when deltas compose.

use super::TopologyDelta;
use crate::{
    identity::{EdgeRowId, NodeRowId},
    serve2::{codec::Universe, delta::DeltaRevision, world::topology::TopologyProvider},
};

/// Endpoint and adjacency lookup at a retained revision.
///
/// The row domains include withdrawn and unbound rows. Historical lookups apply the provider's
/// retention policy, including its fallback after eviction.
pub(crate) trait VersionedTopologyProvider: TopologyProvider {
    fn provide_node_universe(&self) -> Universe<NodeRowId>;
    fn provide_edge_universe(&self) -> Universe<EdgeRowId>;
    fn provide_endpoints_at(
        &self,
        edge: EdgeRowId,
        revision: DeltaRevision,
    ) -> Option<[NodeRowId; 2]>;
    fn provide_incoming_at(
        &self,
        node: NodeRowId,
        revision: DeltaRevision,
    ) -> impl Iterator<Item = EdgeRowId>;
    fn provide_outgoing_at(
        &self,
        node: NodeRowId,
        revision: DeltaRevision,
    ) -> impl Iterator<Item = EdgeRowId>;
}

impl<T: VersionedTopologyProvider + ?Sized> VersionedTopologyProvider for &T {
    fn provide_node_universe(&self) -> Universe<NodeRowId> {
        T::provide_node_universe(self)
    }

    fn provide_edge_universe(&self) -> Universe<EdgeRowId> {
        T::provide_edge_universe(self)
    }

    fn provide_endpoints_at(
        &self,
        edge: EdgeRowId,
        revision: DeltaRevision,
    ) -> Option<[NodeRowId; 2]> {
        T::provide_endpoints_at(self, edge, revision)
    }

    fn provide_incoming_at(
        &self,
        node: NodeRowId,
        revision: DeltaRevision,
    ) -> impl Iterator<Item = EdgeRowId> {
        T::provide_incoming_at(self, node, revision)
    }

    fn provide_outgoing_at(
        &self,
        node: NodeRowId,
        revision: DeltaRevision,
    ) -> impl Iterator<Item = EdgeRowId> {
        T::provide_outgoing_at(self, node, revision)
    }
}

/// An ordinary topology with revision-independent queries.
#[repr(transparent)]
pub(crate) struct NaiveTopologyProvider<T: ?Sized>(T);

impl<T: ?Sized> NaiveTopologyProvider<T> {
    pub(crate) const fn new(value: T) -> Self
    where
        T: Sized,
    {
        Self(value)
    }

    pub(crate) const fn from_ref(value: &T) -> &Self {
        let ptr = &raw const *value;
        // SAFETY: `Self` is transparent over `T` and adds no validity requirements. The cast
        // preserves pointer metadata and the shared borrow's lifetime.
        unsafe { &*(ptr as *const Self) }
    }
}

impl<T: TopologyProvider + ?Sized> TopologyProvider for NaiveTopologyProvider<T> {
    fn provide_node_count(&self) -> usize {
        self.0.provide_node_count()
    }

    fn provide_edge_count(&self) -> usize {
        self.0.provide_edge_count()
    }

    fn provide_endpoints(&self, edge: EdgeRowId) -> Option<[NodeRowId; 2]> {
        self.0.provide_endpoints(edge)
    }

    fn provide_incoming(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId> {
        self.0.provide_incoming(node)
    }

    fn provide_outgoing(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId> {
        self.0.provide_outgoing(node)
    }
}

impl<T: TopologyProvider + ?Sized> VersionedTopologyProvider for NaiveTopologyProvider<T> {
    fn provide_node_universe(&self) -> Universe<NodeRowId> {
        Universe::from_length(self.provide_node_count())
    }

    fn provide_edge_universe(&self) -> Universe<EdgeRowId> {
        Universe::from_length(self.provide_edge_count())
    }

    fn provide_endpoints_at(&self, edge: EdgeRowId, _: DeltaRevision) -> Option<[NodeRowId; 2]> {
        self.provide_endpoints(edge)
    }

    fn provide_incoming_at(
        &self,
        node: NodeRowId,
        _: DeltaRevision,
    ) -> impl Iterator<Item = EdgeRowId> {
        self.provide_incoming(node)
    }

    fn provide_outgoing_at(
        &self,
        node: NodeRowId,
        _: DeltaRevision,
    ) -> impl Iterator<Item = EdgeRowId> {
        self.provide_outgoing(node)
    }
}

/// A topology with additional endpoint bindings and visibility decisions.
///
/// Inherited edges retain the base provider's endpoints and revision-dependent visibility. A local
/// live decision removes a local withdrawal without overriding a withdrawal in the base.
pub(crate) struct DeltaTopologyProvider<'delta, B: ?Sized> {
    data: &'delta TopologyDelta,
    base: &'delta B,
}

impl<'delta, B: ?Sized> DeltaTopologyProvider<'delta, B> {
    pub(crate) const fn from_parts(data: &'delta TopologyDelta, base: &'delta B) -> Self {
        Self { data, base }
    }
}

impl<'delta, B: VersionedTopologyProvider + ?Sized> DeltaTopologyProvider<'delta, B> {
    fn lookup_incoming(
        &self,
        node: NodeRowId,
        revision: Option<DeltaRevision>,
    ) -> impl Iterator<Item = EdgeRowId> + use<'delta, B> {
        let &Self { data, base } = self;

        let current = revision.is_none().then(|| base.provide_incoming(node));
        let historical = revision
            .into_iter()
            .flat_map(move |revision| base.provide_incoming_at(node, revision));

        current
            .into_iter()
            .flatten()
            .chain(historical)
            .chain(
                data.adjacency
                    .incoming
                    .get(base.provide_node_universe(), node),
            )
            .filter(move |&edge| data.endpoint.get(&base, edge, revision).is_some())
    }

    fn lookup_outgoing(
        &self,
        node: NodeRowId,
        revision: Option<DeltaRevision>,
    ) -> impl Iterator<Item = EdgeRowId> + use<'delta, B> {
        let &Self { data, base } = self;

        let current = revision.is_none().then(|| base.provide_outgoing(node));
        let historical = revision
            .into_iter()
            .flat_map(move |revision| base.provide_outgoing_at(node, revision));

        current
            .into_iter()
            .flatten()
            .chain(historical)
            .chain(
                data.adjacency
                    .outgoing
                    .get(base.provide_node_universe(), node),
            )
            .filter(move |&edge| data.endpoint.get(&base, edge, revision).is_some())
    }

    /// Returns incoming edges with a borrow of the stored data rather than this provider.
    pub(crate) fn into_incoming_at(
        self,
        node: NodeRowId,
        revision: DeltaRevision,
    ) -> impl Iterator<Item = EdgeRowId> + use<'delta, B> {
        self.lookup_incoming(node, Some(revision))
    }

    /// Returns outgoing edges with a borrow of the stored data rather than this provider.
    pub(crate) fn into_outgoing_at(
        self,
        node: NodeRowId,
        revision: DeltaRevision,
    ) -> impl Iterator<Item = EdgeRowId> + use<'delta, B> {
        self.lookup_outgoing(node, Some(revision))
    }
}

impl<B: VersionedTopologyProvider + ?Sized> TopologyProvider for DeltaTopologyProvider<'_, B> {
    fn provide_node_count(&self) -> usize {
        // An edge can reference the highest allocated node in only one direction.
        self.base.provide_node_count()
            + self
                .data
                .adjacency
                .incoming
                .extension
                .len()
                .max(self.data.adjacency.outgoing.extension.len())
    }

    fn provide_edge_count(&self) -> usize {
        self.base.provide_edge_count() + self.data.endpoint.endpoints.len()
    }

    fn provide_endpoints(&self, edge: EdgeRowId) -> Option<[NodeRowId; 2]> {
        self.data.endpoint.get(self.base, edge, None)
    }

    fn provide_incoming(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId> {
        self.lookup_incoming(node, None)
    }

    fn provide_outgoing(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId> {
        self.lookup_outgoing(node, None)
    }
}

impl<B: VersionedTopologyProvider + ?Sized> VersionedTopologyProvider
    for DeltaTopologyProvider<'_, B>
{
    fn provide_node_universe(&self) -> Universe<NodeRowId> {
        Universe::from_length(self.provide_node_count())
    }

    fn provide_edge_universe(&self) -> Universe<EdgeRowId> {
        Universe::from_length(self.provide_edge_count())
    }

    fn provide_endpoints_at(
        &self,
        edge: EdgeRowId,
        revision: DeltaRevision,
    ) -> Option<[NodeRowId; 2]> {
        self.data.endpoint.get(&self.base, edge, Some(revision))
    }

    fn provide_incoming_at(
        &self,
        node: NodeRowId,
        revision: DeltaRevision,
    ) -> impl Iterator<Item = EdgeRowId> {
        self.lookup_incoming(node, Some(revision))
    }

    fn provide_outgoing_at(
        &self,
        node: NodeRowId,
        revision: DeltaRevision,
    ) -> impl Iterator<Item = EdgeRowId> {
        self.lookup_outgoing(node, Some(revision))
    }
}
