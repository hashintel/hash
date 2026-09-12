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

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct DeliveredEdge {
    pub row: Visible<EdgeRowId>,
    pub endpoints: [NodeRowId; 2],
    pub identity: ArchivedEntityId,
}

impl DeliveredEdge {
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

#[derive(Debug)]
pub(crate) struct EdgeSet {
    pub complete: bool,
    pub edges: Vec<DeliveredEdge>,
}

#[derive(Debug)]
struct Candidate {
    key: (NodePriority, ArchivedEntityId),
    edge: DeliveredEdge,
}

impl PartialEq for Candidate {
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

#[derive(Debug)]
struct RankCap {
    capacity: usize,
    kept: BinaryHeap<Candidate>,
    truncated: bool,
}

impl RankCap {
    const fn new(capacity: usize) -> Self {
        Self {
            capacity,
            kept: BinaryHeap::new(),
            truncated: false,
        }
    }

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

    fn excludes(&self, priority: NodePriority) -> bool {
        // A full heap can still contain every qualifying edge.
        self.truncated && self.kept.peek().is_none_or(|worst| priority > worst.key.0)
    }

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

pub(crate) trait NeighbourhoodProvider {
    fn provide_edge(&self, row: EdgeRowId) -> Option<DeliveredEdge>;
    fn provide_incoming(&self, node: NodeRowId) -> impl Iterator<Item = EdgeRowId>;
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

#[derive(Debug, Copy, Clone)]
pub(crate) struct Neighbourhood<P> {
    pub provider: P,
}

impl<P: NeighbourhoodProvider> Neighbourhood<P> {
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

    fn offer_induced(&self, delivered: &CompressedBitSet<NodeRowId>, cap: &mut RankCap)
    where
        P: ImportanceProvider,
    {
        for source in delivered.iter() {
            let Some(source_priority) = self.provider.provide_priority(source) else {
                continue;
            };
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
