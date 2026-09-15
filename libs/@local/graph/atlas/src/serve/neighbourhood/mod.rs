//! Edge delivery around delivered nodes: incident edges and the capped induced edge set.
//!
//! A response delivers nodes and then the edges among them. [`Neighbourhood`] answers both edge
//! questions over a [`NeighbourhoodProvider`]: every visible edge incident to one node, and the
//! best-ranked edges induced by a delivered node set under a size cap. An induced edge ranks at
//! its less prominent endpoint, and [`EdgeSet::complete`] reports whether the cap excluded any.

use alloc::collections::BinaryHeap;
use core::cmp::Ordering;

use super::{
    scene::Scene,
    visibility::Visible,
    world::node_importance::{ImportanceProvider, NodePriority},
};
use crate::{
    bitset::CompressedBitSet,
    identity::{EdgeRowId, NodeRowId},
    postgres::id::ArchivedEntityId,
};

#[cfg(test)]
mod tests;

/// An admitted edge's visible row, endpoint node rows and stable identity.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct DeliveredEdge {
    /// The edge row, carrying the evidence that the mask admitted it.
    pub row: Visible<EdgeRowId>,
    /// The `[source, target]` node rows.
    pub endpoints: [NodeRowId; 2],
    /// The edge's entity key.
    pub identity: ArchivedEntityId,
}

impl DeliveredEdge {
    /// Returns the endpoint opposite `node`, or [`None`] when `node` is neither endpoint.
    pub(crate) fn partner_of(self, node: NodeRowId) -> Option<NodeRowId> {
        let [source, target] = self.endpoints;

        if source == node {
            Some(target)
        } else if target == node {
            Some(source)
        } else {
            None
        }
    }
}

/// A capped selection of delivered edges, and whether the cap excluded any.
#[derive(Debug)]
pub(crate) struct EdgeSet {
    /// Whether the cap kept every offered edge.
    pub complete: bool,
    /// The kept edges, in identity order.
    pub edges: Vec<DeliveredEdge>,
}

/// One edge under [`RankCap`] ordering: its priority and identity, then the edge itself.
#[derive(Debug)]
struct Candidate {
    /// The offer's priority, then the edge's identity as the tie-break.
    key: (NodePriority, ArchivedEntityId),
    /// The offered edge.
    edge: DeliveredEdge,
}

impl PartialEq for Candidate {
    /// Compares `key` alone, which keeps equality consistent with [`Ord`].
    ///
    /// Candidates with equal keys share the edge identity the key embeds.
    fn eq(&self, other: &Self) -> bool {
        self.key == other.key
    }
}

impl Eq for Candidate {}

impl PartialOrd for Candidate {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Candidate {
    fn cmp(&self, other: &Self) -> Ordering {
        self.key.cmp(&other.key)
    }
}

/// A bounded selection of the `capacity` best-ranked edges offered to it.
///
/// The heap's top is the worst kept edge, the one a better offer displaces.
#[derive(Debug)]
struct RankCap {
    /// The most edges the cap keeps.
    capacity: usize,
    /// The kept candidates, worst on top.
    kept: BinaryHeap<Candidate>,
    /// Whether an offer has arrived at a full cap.
    truncated: bool,
}

impl RankCap {
    /// Creates an empty cap retaining at most `capacity` edges.
    const fn new(capacity: usize) -> Self {
        Self {
            capacity,
            kept: BinaryHeap::new(),
            truncated: false,
        }
    }

    /// Offers `edge` at `priority`.
    ///
    /// The cap keeps it only while it has spare capacity or the edge outranks the current worst
    /// kept edge.
    fn offer(&mut self, priority: NodePriority, edge: DeliveredEdge) {
        let candidate = Candidate {
            key: (priority, edge.identity),
            edge,
        };
        if self.kept.len() < self.capacity {
            self.kept.push(candidate);
            return;
        }

        self.truncated = true;
        if let Some(mut worst) = self.kept.peek_mut()
            && candidate < *worst
        {
            *worst = candidate;
        }
    }

    /// Returns whether the cap can prune `priority` without comparing edge identities.
    ///
    /// Pruning begins only after an offer reaches an already full cap. A zero-capacity cap then
    /// excludes every priority. A nonempty cap excludes priorities worse than its worst kept
    /// edge's, leaving equal priorities for the identity comparison in [`offer`](Self::offer).
    /// Before truncation even a worse priority needs an offer to establish the incompleteness
    /// [`EdgeSet::complete`] reports.
    fn excludes(&self, priority: NodePriority) -> bool {
        // Only `offer` records a truncation, and `complete` reads it. A full cap that has turned
        // nothing away yet therefore still receives its next offer rather than excluding it here.
        self.truncated && self.kept.peek().is_none_or(|worst| priority > worst.key.0)
    }

    /// Converts the cap into its kept edges sorted by identity, and whether it truncated.
    fn into_set(self) -> EdgeSet {
        let mut edges: Vec<_> = self
            .kept
            .into_iter()
            .map(|candidate| candidate.edge)
            .collect();
        edges.sort_unstable_by_key(|edge| edge.identity);

        EdgeSet {
            complete: !self.truncated,
            edges,
        }
    }
}

/// The capability to answer edge lookups and per-node adjacency against a captured scene.
///
/// An adjacency can include a row that [`provide_edge`](Self::provide_edge) withholds. The edge
/// queries consider only delivered rows.
pub(crate) trait NeighbourhoodProvider {
    /// Returns the delivered edge at `row`, or [`None`] when it is absent, invisible or unplaced.
    fn provide_edge(&self, row: EdgeRowId) -> Option<DeliveredEdge>;
    /// Yields the edge rows whose target is `node`, each exactly once.
    ///
    /// # Implementation Note
    ///
    /// Implementations must yield every incoming edge row exactly once. For each yielded row that
    /// [`provide_edge`](Self::provide_edge) delivers, the target in [`DeliveredEdge::endpoints`]
    /// must be `node`.
    fn provide_incoming(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId>;
    /// Yields the edge rows whose source is `node`, each exactly once, a self-loop included.
    ///
    /// # Implementation Note
    ///
    /// Implementations must yield every outgoing edge row exactly once. For each yielded row that
    /// [`provide_edge`](Self::provide_edge) delivers, the source in [`DeliveredEdge::endpoints`]
    /// must be `node`.
    fn provide_outgoing(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId>;
}

impl NeighbourhoodProvider for Scene<'_> {
    fn provide_edge(&self, row: EdgeRowId) -> Option<DeliveredEdge> {
        let endpoints = self.world.topology.endpoints(self.epoch, row)?;
        let visible = self.mask.visible_edge(row, endpoints)?;

        let identity = self.world.topology.key_of(self.epoch, row)?;
        Some(DeliveredEdge {
            row: visible,
            endpoints,
            identity,
        })
    }

    fn provide_incoming(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId> {
        self.world.topology.incoming(self.epoch, node)
    }

    fn provide_outgoing(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId> {
        self.world.topology.outgoing(self.epoch, node)
    }
}

impl ImportanceProvider for Scene<'_> {
    fn provide_priority(&self, node: NodeRowId) -> Option<NodePriority> {
        self.world.layout.priority(self.epoch, node)
    }
}

/// Edge queries against one adjacency provider, most often a captured [`Scene`].
#[derive(Debug, Copy, Clone)]
pub(crate) struct Neighbourhood<P> {
    /// The scene or other provider the queries read edges from.
    pub provider: P,
}

impl<P: NeighbourhoodProvider> Neighbourhood<P> {
    /// Iterates every delivered edge incident to `node`, outgoing first.
    ///
    /// Each edge occurs once, a self-loop included: a self-loop occurs in the outgoing run, and
    /// the incoming run drops every edge whose source is `node`. An edge the provider withholds
    /// from [`provide_edge`](NeighbourhoodProvider::provide_edge) does not occur.
    pub(crate) fn incident(&self, node: NodeRowId) -> impl Iterator<Item = DeliveredEdge> + '_ {
        let outgoing = self
            .provider
            .provide_outgoing(node)
            .filter_map(|row| self.provider.provide_edge(row));

        // Self-loops already occur in the outgoing run.
        let incoming = self
            .provider
            .provide_incoming(node)
            .filter_map(|row| self.provider.provide_edge(row))
            .filter(move |edge| edge.endpoints[0] != node);

        outgoing.chain(incoming)
    }

    /// Offers every candidate edge between two nodes in `delivered` to `cap`.
    ///
    /// The scan skips a delivered source with no priority before reading its outgoing edges, an
    /// edge the provider withholds from [`provide_edge`](NeighbourhoodProvider::provide_edge), and
    /// an edge whose target is not delivered. Each remaining edge ranks at the less prominent of
    /// its two endpoints, the larger [`NodePriority`].
    ///
    /// # Panics
    ///
    /// Panics if the delivered target of a scanned edge has no priority.
    fn offer_induced(&self, delivered: &CompressedBitSet<NodeRowId>, cap: &mut RankCap)
    where
        P: ImportanceProvider,
    {
        for source in delivered.iter() {
            let Some(source_priority) = self.provider.provide_priority(source) else {
                continue;
            };
            // An edge ranks at its less prominent endpoint, and `source` is one of the two. Every
            // edge `source` offers therefore ranks at or below `source`, and excluding `source`
            // excludes them all.
            if cap.excludes(source_priority) {
                continue;
            }

            // Each edge occurs in exactly one source's outgoing run.
            for row in self.provider.provide_outgoing(source) {
                let Some(edge) = self.provider.provide_edge(row) else {
                    continue;
                };

                let [_, target] = edge.endpoints;
                if !delivered.contains(target) {
                    continue;
                }

                let target_priority = self
                    .provider
                    .provide_priority(target)
                    .expect("should have a priority for every placed endpoint");

                let priority = source_priority.max(target_priority);
                if !cap.excludes(priority) {
                    cap.offer(priority, edge);
                }
            }
        }
    }

    /// Selects the `capacity` best-ranked edges between nodes in `delivered`.
    ///
    /// Candidates are outgoing edges of a node in `delivered` that has a priority, provided that
    /// [`provide_edge`](NeighbourhoodProvider::provide_edge) delivers the edge and its target also
    /// belongs to `delivered`. A source without a priority contributes no candidates. Each
    /// candidate ranks at the less prominent of its endpoints, the larger [`NodePriority`], and the
    /// lower edge identity wins a tie. The set returns in identity order, with
    /// [`EdgeSet::complete`] false when the cap excluded an edge.
    ///
    /// # Panics
    ///
    /// Panics when the scan reaches an edge whose delivered target has no priority.
    pub(crate) fn induced(
        &self,
        delivered: &CompressedBitSet<NodeRowId>,
        capacity: usize,
    ) -> EdgeSet
    where
        P: ImportanceProvider,
    {
        let mut cap = RankCap::new(capacity);
        self.offer_induced(delivered, &mut cap);
        cap.into_set()
    }
}
