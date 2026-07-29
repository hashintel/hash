//! The adjacency neighbourhood: edge sets over delivered or resolved rows.
//!
//! Serving delivers two edge-set shapes. [`Neighbourhood::incident`] answers a source's ego graph:
//! every edge at the source whose other endpoint is visible. [`Neighbourhood::induced`] answers a
//! delivered row set's induced subgraph: every edge whose endpoints both lie in the set. Both
//! walk the adjacency's outgoing runs, and both collect each qualifying edge exactly once - an
//! edge occupies exactly one outgoing slot, and a self-loop's one endpoint is both its source and
//! its target.
//!
//! An edge delivers only when the proof holds its own link row and both of its endpoints. Both
//! shapes reach their candidates through [`Neighbourhood::edge`], which answers [`None`] for an
//! edge the proof withholds, so every collected edge carries its delivery proof in the type and
//! neither walk states the rule a second time.

use hashql_core::id::Id as _;

use super::{
    Atlas,
    visibility::{VisibilityProof, VisibleEdge},
};
use crate::{
    bitset::BitSet,
    dataset::ArchivedEntityId,
    identity::{EdgeRowId, NodeRowId},
    salt::{adjacency::AdjacencyArchive, fit::prepare::identity::IdentityTableArchive},
};

/// One qualifying edge during assembly: the wire columns' row ids.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(super) struct DeliveredEdge {
    /// The edge row id, proven deliverable under the proof this value was collected against.
    pub row: VisibleEdge,
    /// The source node row id.
    pub source: NodeRowId,
    /// The target node row id.
    pub target: NodeRowId,
}

impl DeliveredEdge {
    /// Returns the endpoint opposite `row`.
    ///
    /// A self-loop's partner is `row` itself.
    pub(super) fn partner_of(self, row: NodeRowId) -> NodeRowId {
        if self.source == row {
            self.target
        } else {
            self.source
        }
    }
}

/// One generation's edge columns under one visibility proof.
///
/// The value borrows the opened generation, so construction is free per request and the edge-set
/// constructions take no column parameters.
#[derive(Debug, Copy, Clone)]
pub(super) struct Neighbourhood<'atlas> {
    adjacency: &'atlas AdjacencyArchive,
    endpoints: &'atlas [[NodeRowId; 2]],
    edge_ids: &'atlas IdentityTableArchive<ArchivedEntityId, EdgeRowId>,
    ranks: &'atlas [u32],
    positions_of_row: &'atlas [u32],
    proof: &'atlas VisibilityProof,
}

impl<'atlas> Neighbourhood<'atlas> {
    /// Binds the generation's edge columns to `proof`.
    pub(super) fn of(atlas: &'atlas Atlas, proof: &'atlas VisibilityProof) -> Self {
        Self {
            adjacency: &atlas.adjacency,
            endpoints: atlas.endpoints.view(),
            edge_ids: &atlas.edge_ids,
            ranks: atlas.ranks.view(),
            positions_of_row: atlas.positions_of_row.view(),
            proof,
        }
    }

    /// Collects the source's incident edges the proof delivers, paired with their link-entity
    /// identities, in no particular order.
    ///
    /// A self-loop occupies one slot in each direction's run; its incoming appearance is the
    /// duplicate and is skipped, so every incident edge is collected exactly once. An edge the
    /// proof withholds, for a hidden partner or for a hidden link row, drops before any selection:
    /// a response's cardinality is a function of the masked view.
    ///
    /// # Panics
    ///
    /// Panics when `source` lies outside the adjacency's node domain, which resolution rules out.
    pub(super) fn incident(&self, node: NodeRowId) -> Vec<(DeliveredEdge, ArchivedEntityId)> {
        let outgoing = self
            .adjacency
            .outgoing(node)
            .expect("resolved sources lie inside the adjacency's node domain");
        let incoming = self
            .adjacency
            .incoming(node)
            .expect("resolved sources lie inside the adjacency's node domain");

        let incident = outgoing.iter().chain(
            incoming
                .iter()
                .filter(|edge| self.endpoints[edge.as_usize()][0] != node),
        );

        let mut edges = Vec::new();
        for edge in incident {
            let Some(delivered) = self.edge(edge) else {
                continue;
            };

            edges.push((delivered, self.edge_identity(delivered.row)));
        }

        edges
    }

    /// Collects every edge whose endpoints both lie in `delivered`, paired with its link-entity
    /// identity, in no particular order.
    ///
    /// Caller requirement: `delivered` is already intersected with the visibility proof. The set
    /// membership test answers the induced-subgraph question - which rows this response draws
    /// edges between - and never stands in for the delivery rule, which the proof answers as each
    /// candidate is read.
    pub(super) fn induced(&self, delivered: &BitSet) -> Vec<(DeliveredEdge, ArchivedEntityId)> {
        let mut edges = Vec::new();

        for row in delivered.iter() {
            let outgoing = self
                .adjacency
                .outgoing(NodeRowId::from_usize(row))
                .expect("delivered rows lie inside the adjacency's node domain");

            for edge in outgoing.iter() {
                let [_, target] = self.endpoints[edge.as_usize()];

                if delivered.contains(target.as_usize())
                    && let Some(delivered_edge) = self.edge(edge)
                {
                    edges.push((delivered_edge, self.edge_identity(delivered_edge.row)));
                }
            }
        }

        edges
    }

    /// Returns an edge row's link-entity identity.
    ///
    /// Generation-frozen; the `EDGE_IDS` columns deliver exactly these identity bytes.
    ///
    /// # Panics
    ///
    /// Panics when the identity table contradicts the adjacency's edge domain, which open's
    /// cross-artifact validation rules out.
    pub(super) fn edge_identity(&self, row: VisibleEdge) -> ArchivedEntityId {
        self.edge_ids
            .id(row.get())
            .expect("open validated the identity rows against the adjacency's edges")
    }

    /// Keeps the `cap` edges the rank-ordered cap selects.
    ///
    /// Ascending by worse-endpoint rank, ties by link-entity identity bytes.
    pub(super) fn truncate_by_rank(
        &self,
        edges: &mut Vec<(DeliveredEdge, ArchivedEntityId)>,
        cap: usize,
    ) {
        if cap == 0 {
            edges.clear();
            return;
        }

        let mut ranked: Vec<(u32, (DeliveredEdge, ArchivedEntityId))> = edges
            .drain(..)
            .map(|entry| (self.worse_rank(entry.0), entry))
            .collect();

        // Partitioning at `cap - 1` places the cap smallest keys - a
        // total order, since link identities are distinct - in the
        // head.
        ranked.select_nth_unstable_by_key(cap - 1, |&(rank, (_, id))| (rank, id));
        ranked.truncate(cap);
        edges.extend(ranked.into_iter().map(|(_, entry)| entry));
    }

    /// Returns an edge's truncation rank.
    ///
    /// Its worse endpoint's importance rank, where larger values are less prominent.
    const fn worse_rank(&self, edge: DeliveredEdge) -> u32 {
        self.rank_of_row(edge.source)
            .max(self.rank_of_row(edge.target))
    }

    /// Returns a node row's importance rank through the position permutation.
    const fn rank_of_row(&self, row: NodeRowId) -> u32 {
        let position = self.positions_of_row[row.as_usize()];
        self.ranks[position as usize]
    }

    /// Reads edge `row`'s wire-column ids off the endpoint column, when the proof delivers it.
    ///
    /// [`None`] when the link row is hidden or either endpoint is: the value cannot be built for an
    /// edge no response may name, which is why both walks filter by constructing.
    fn edge(&self, row: EdgeRowId) -> Option<DeliveredEdge> {
        let [source, target] = self.endpoints[row.as_usize()];

        Some(DeliveredEdge {
            row: self.proof.verify_edge(row, source, target)?,
            source,
            target,
        })
    }
}
