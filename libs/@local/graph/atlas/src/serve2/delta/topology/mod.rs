//! Edge topology with revision-dependent visibility and fixed endpoint pairs.
//!
//! Retaining an edge's first endpoint pair keeps its adjacency stable once bound. [`TopologyDelta`]
//! records visibility separately, allowing withdrawal and revival without losing the pair.

use hashql_core::{collections::FastHashMap, id::IdVec};

use super::{
    DeltaRevision,
    history::{EntryKind, History, Versioned},
    id::DeltaRowId,
};
use crate::{
    identity::{EdgeRowId, NodeRowId},
    serve2::codec::Universe,
};

#[cfg(test)]
mod tests;

pub(crate) mod provider;

use self::provider::{DeltaTopologyProvider, VersionedTopologyProvider};

/// Sorted, unique added-edge rows for each incident node.
#[derive(Debug, Default)]
struct AdjacencyRows {
    extension: IdVec<DeltaRowId<NodeRowId>, Vec<EdgeRowId>>,
    patches: FastHashMap<NodeRowId, Vec<EdgeRowId>>,
}

impl AdjacencyRows {
    fn insert(&mut self, origin: Universe<NodeRowId>, node: NodeRowId, edge: EdgeRowId) {
        let edges = if let Some(delta) = DeltaRowId::derive(origin, node) {
            self.extension.fill_until(delta, Vec::new)
        } else {
            self.patches.entry(node).or_default()
        };

        if let Err(index) = edges.binary_search(&edge) {
            edges.insert(index, edge);
        }
    }

    fn get(&self, origin: Universe<NodeRowId>, node: NodeRowId) -> impl Iterator<Item = EdgeRowId> {
        let edges = DeltaRowId::derive(origin, node).map_or_else(
            || self.patches.get(&node),
            |delta| self.extension.get(delta),
        );

        edges.into_flat_iter().copied()
    }
}

impl Clone for AdjacencyRows {
    fn clone(&self) -> Self {
        Self {
            extension: self.extension.clone(),
            patches: self.patches.clone(),
        }
    }

    fn clone_from(&mut self, source: &Self) {
        let Self { extension, patches } = self;
        extension.clone_from(&source.extension);
        patches.clone_from(&source.patches);
    }
}

#[derive(Debug, Default)]
pub(crate) struct AdjacencyDelta {
    incoming: AdjacencyRows,
    outgoing: AdjacencyRows,
}

impl Clone for AdjacencyDelta {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            incoming: self.incoming.clone(),
            outgoing: self.outgoing.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        let Self { incoming, outgoing } = self;
        incoming.clone_from(&source.incoming);
        outgoing.clone_from(&source.outgoing);
    }
}

#[derive(Debug, Default)]
pub(crate) struct EndpointDelta {
    endpoints: IdVec<DeltaRowId<EdgeRowId>, Option<Versioned<[NodeRowId; 2]>>>,
    history: FastHashMap<EdgeRowId, History>,
}

impl EndpointDelta {
    fn get(
        &self,
        base: &(impl VersionedTopologyProvider + ?Sized),
        edge: EdgeRowId,
        revision: Option<DeltaRevision>,
    ) -> Option<[NodeRowId; 2]> {
        let origin = base.provide_edge_universe();
        if let Some(delta) = DeltaRowId::derive(origin, edge) {
            let entry = self.endpoints.get(delta)?.as_ref()?;
            return entry.is_live(revision).then(|| *entry.data());
        }

        let decision = self.history.get(&edge).and_then(|history| {
            revision.map_or_else(|| Some(history.now()), |revision| history.at(revision))
        });

        match decision {
            Some(EntryKind::Withdrawn) => None,
            Some(EntryKind::Live) | None => revision.map_or_else(
                || base.provide_endpoints(edge),
                |revision| base.provide_endpoints_at(edge, revision),
            ),
        }
    }
}

impl Clone for EndpointDelta {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            endpoints: self.endpoints.clone(),
            history: self.history.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        let Self { endpoints, history } = self;
        endpoints.clone_from(&source.endpoints);
        history.clone_from(&source.history);
    }
}

/// Revision-dependent edge visibility with fixed endpoint pairs.
///
/// Added edges retain their first endpoint pair and remain absent before that pair's birth
/// revision. Evicted visibility decisions fall back to the origin for inherited edges and to live
/// for additions.
#[derive(Debug, Default)]
pub(crate) struct TopologyDelta {
    adjacency: AdjacencyDelta,
    endpoint: EndpointDelta,
}

impl TopologyDelta {
    /// Reserves an allocated node row, including nodes without incident edges.
    pub(crate) fn reserve_node(&mut self, base: &impl VersionedTopologyProvider, node: NodeRowId) {
        if let Some(delta) = DeltaRowId::derive(base.provide_node_universe(), node) {
            self.adjacency
                .incoming
                .extension
                .fill_until(delta, Vec::new);

            self.adjacency
                .outgoing
                .extension
                .fill_until(delta, Vec::new);
        }
    }

    /// Reserves an allocated edge row before its endpoint pair is available.
    pub(crate) fn reserve_edge(&mut self, base: &impl VersionedTopologyProvider, edge: EdgeRowId) {
        if let Some(delta) = DeltaRowId::derive(base.provide_edge_universe(), edge) {
            self.endpoint.endpoints.fill_until(delta, || None);
        }
    }

    /// Activates an edge, retaining its first endpoint pair.
    ///
    /// Returns whether the local visibility decision changes or an endpoint pair is first bound. An
    /// inherited edge keeps its base provider's endpoints.
    ///
    /// # Panics
    ///
    /// Panics if `revision` precedes the edge's latest recorded decision.
    pub(crate) fn insert(
        &mut self,
        base: &impl VersionedTopologyProvider,
        edge: EdgeRowId,
        endpoints: [NodeRowId; 2],
        revision: DeltaRevision,
    ) -> bool {
        let origin = base.provide_edge_universe();
        let Some(delta) = DeltaRowId::derive(origin, edge) else {
            return self
                .endpoint
                .history
                .get_mut(&edge)
                .is_some_and(|history| history.push(EntryKind::Live, revision));
        };

        if let Some(entry) = self.endpoint.endpoints.lookup_mut(delta) {
            return entry.push(EntryKind::Live, revision);
        }

        self.endpoint
            .endpoints
            .insert(delta, Versioned::new(endpoints, revision));

        let [source, target] = endpoints;
        let nodes = base.provide_node_universe();
        self.adjacency.outgoing.insert(nodes, source, edge);
        self.adjacency.incoming.insert(nodes, target, edge);

        true
    }

    /// Withdraws a bound edge without discarding its endpoint pair.
    ///
    /// # Panics
    ///
    /// Panics if `revision` precedes the edge's latest recorded decision.
    pub(crate) fn withdraw(
        &mut self,
        base: &impl VersionedTopologyProvider,
        edge: EdgeRowId,
        revision: DeltaRevision,
    ) -> bool {
        let origin = base.provide_edge_universe();
        if let Some(delta) = DeltaRowId::derive(origin, edge) {
            let Some(Some(entry)) = self.endpoint.endpoints.get_mut(delta) else {
                return false;
            };

            return entry.push(EntryKind::Withdrawn, revision);
        }

        let mut changed = false;
        let history = self.endpoint.history.entry(edge).or_insert_with(|| {
            changed = true;
            History::new(EntryKind::Withdrawn, revision)
        });

        history.push(EntryKind::Withdrawn, revision) | changed
    }

    pub(crate) const fn provider<'delta, B>(
        &'delta self,
        base: &'delta B,
    ) -> DeltaTopologyProvider<'delta, B> {
        DeltaTopologyProvider::from_parts(self, base)
    }
}

impl Clone for TopologyDelta {
    #[inline]
    fn clone(&self) -> Self {
        Self {
            adjacency: self.adjacency.clone(),
            endpoint: self.endpoint.clone(),
        }
    }

    #[inline]
    fn clone_from(&mut self, source: &Self) {
        let Self {
            adjacency,
            endpoint,
        } = self;

        adjacency.clone_from(&source.adjacency);
        endpoint.clone_from(&source.endpoint);
    }
}
