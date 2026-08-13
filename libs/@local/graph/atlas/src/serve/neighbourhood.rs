//! Edge sets over delivered or resolved rows.
//!
//! Serving delivers two edge-set shapes. [`Neighbourhood::incident`] answers a source's ego graph,
//! which is every edge at the source whose other endpoint is visible. [`Neighbourhood::induced`]
//! answers a delivered row set's induced subgraph, which is every edge whose endpoints both lie in
//! the set. Both walk the adjacency's outgoing runs, and both collect each qualifying edge exactly
//! once, because an edge occupies exactly one outgoing slot and a self-loop's one endpoint is both
//! its source and its target.
//!
//! An edge delivers only when the proof admits the edge's link row and both of its endpoints. Both
//! shapes reach their candidates through [`Neighbourhood::edge`], which answers [`None`] for an
//! edge the proof withholds, so every collected edge carries its delivery proof in the type and
//! neither walk states the rule a second time.

use hashql_core::id::{IdSlice, IdVec, bit_vec::DenseBitSet};

use super::{
    Atlas, WireRow,
    codec::RowCodec,
    hydrate::EdgeSlot,
    visibility::{VisibilityProof, VisibleEdge},
};
use crate::{
    dataset::postgres::id::ArchivedEntityId,
    identity::{BasePosition, EdgeRowId, ImportanceRank, NodeRowId},
    salt::{adjacency::AdjacencyArchive, fit::prepare::identity::IdentityTableArchive},
};

/// The wire columns' row ids for one qualifying edge during assembly.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct DeliveredEdge {
    /// The edge row id, proven deliverable under the proof that collected this value.
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

/// The delivered edges in column form, every column in lockstep.
///
/// One constructor writes every column in one pass over the delivered edge set, so the columns
/// cover the same edges by construction and delivery order is the input's own. The endpoint
/// columns speak wire row ids. The identity column is the wire's `EDGE_IDS`, and the internal
/// row column is the hydration key behind it.
#[derive(Debug)]
pub(crate) struct EdgeColumns {
    /// The `EDGE_SOURCES` column: node row ids in wire form, edge order.
    sources: IdVec<EdgeSlot, WireRow<NodeRowId>>,
    /// The `EDGE_TARGETS` column: node row ids in wire form, edge order.
    targets: IdVec<EdgeSlot, WireRow<NodeRowId>>,
    /// The `EDGE_IDS` column: link-entity identities, edge order.
    ids: IdVec<EdgeSlot, ArchivedEntityId>,
    /// The internal edge rows behind `ids`, edge order: the hydration key.
    rows: IdVec<EdgeSlot, EdgeRowId>,
}

impl EdgeColumns {
    /// Gathers the delivered edges into their column form.
    pub(super) fn of(
        codec: &RowCodec<NodeRowId>,
        edges: &[(DeliveredEdge, ArchivedEntityId)],
    ) -> Self {
        let mut columns = Self {
            sources: IdVec::with_capacity(edges.len()),
            targets: IdVec::with_capacity(edges.len()),
            ids: IdVec::with_capacity(edges.len()),
            rows: IdVec::with_capacity(edges.len()),
        };

        for &(edge, id) in edges {
            columns.sources.push(codec.encode(edge.source));
            columns.targets.push(codec.encode(edge.target));
            columns.ids.push(id);
            columns.rows.push(edge.row.get());
        }

        columns
    }

    /// Returns the delivered edge count.
    pub(crate) const fn count(&self) -> usize {
        self.ids.len()
    }

    /// Views the `EDGE_SOURCES` column, edge order.
    pub(crate) const fn sources(&self) -> &IdSlice<EdgeSlot, WireRow<NodeRowId>> {
        &self.sources
    }

    /// Views the `EDGE_TARGETS` column, edge order.
    pub(crate) const fn targets(&self) -> &IdSlice<EdgeSlot, WireRow<NodeRowId>> {
        &self.targets
    }

    /// Views the `EDGE_IDS` column, edge order.
    pub(crate) const fn ids(&self) -> &IdSlice<EdgeSlot, ArchivedEntityId> {
        &self.ids
    }

    /// Views the internal edge rows, edge order.
    pub(crate) const fn rows(&self) -> &IdSlice<EdgeSlot, EdgeRowId> {
        &self.rows
    }
}

#[cfg(test)]
impl EdgeColumns {
    /// Mints columns from one literal wire-form triple per edge: source, target, identity.
    ///
    /// The triple shape keeps the columns in lockstep at the call site, and the internal row
    /// column numbers the edges in order, because a pinned response never hydrates.
    pub(crate) fn pinned(edges: impl IntoIterator<Item = (u32, u32, ArchivedEntityId)>) -> Self {
        use hashql_core::id::Id as _;

        let mut columns = Self {
            sources: IdVec::new(),
            targets: IdVec::new(),
            ids: IdVec::new(),
            rows: IdVec::new(),
        };
        for (source, target, id) in edges {
            let row = u32::try_from(columns.rows.len()).expect("pinned fixtures are small");
            columns.sources.push(WireRow::pinned(source));
            columns.targets.push(WireRow::pinned(target));
            columns.ids.push(id);
            columns.rows.push(EdgeRowId::from_u32(row));
        }

        columns
    }
}

/// One generation's edge columns under one visibility proof.
///
/// The value borrows the opened generation, so construction is free per request and the edge-set
/// constructions take no column parameters.
#[derive(Debug, Copy, Clone)]
pub(super) struct Neighbourhood<'atlas> {
    adjacency: &'atlas AdjacencyArchive,
    endpoints: &'atlas IdSlice<EdgeRowId, [NodeRowId; 2]>,
    edge_ids: &'atlas IdentityTableArchive<ArchivedEntityId, EdgeRowId>,
    ranks: &'atlas IdSlice<BasePosition, ImportanceRank>,
    positions_of_row: &'atlas IdSlice<NodeRowId, BasePosition>,
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
    /// A self-loop occupies one slot in each direction's run. The walk skips its incoming
    /// appearance as the duplicate, so it collects every incident edge exactly once. An edge the
    /// proof withholds, for a hidden partner or for a hidden link row, drops before any selection,
    /// so a response's cardinality is a function of the masked view.
    ///
    /// # Panics
    ///
    /// This panics when `source` lies outside the adjacency's node domain, which resolution rules
    /// out.
    pub(super) fn incident(
        &self,
        node: NodeRowId,
    ) -> impl IntoIterator<Item = (DeliveredEdge, ArchivedEntityId)> {
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
                .filter(move |&edge| self.endpoints[edge][0] != node),
        );

        incident.filter_map(move |edge| {
            let delivered = self.edge(edge)?;
            Some((delivered, self.edge_identity(delivered.row)))
        })
    }

    /// Collects every edge whose endpoints both lie in `delivered`, paired with its link-entity
    /// identity, in no particular order.
    ///
    /// Caller requirement: `delivered` is already intersected with the visibility proof. The set
    /// membership test answers the induced-subgraph question - which rows this response draws edges
    /// between - and never stands in for the delivery rule, which the proof answers as the walk
    /// reads each candidate.
    pub(super) fn induced(
        &self,
        delivered: &DenseBitSet<NodeRowId>,
    ) -> Vec<(DeliveredEdge, ArchivedEntityId)> {
        let mut edges = Vec::new();

        for row in delivered {
            let outgoing = self
                .adjacency
                .outgoing(row)
                .expect("delivered rows lie inside the adjacency's node domain");

            for edge in outgoing.iter() {
                let [_, target] = self.endpoints[edge];

                if delivered.contains(target)
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
    /// Generation-frozen. The `EDGE_IDS` columns deliver exactly these identity bytes.
    ///
    /// # Panics
    ///
    /// This panics when the identity table contradicts the adjacency's edge domain, which open's
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

        let mut ranked: Vec<(ImportanceRank, (DeliveredEdge, ArchivedEntityId))> = edges
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
    #[expect(
        clippy::missing_const_for_fn,
        reason = "`Ord::max` needs `ImportanceRank: [const] Ord`, which the id macro does not emit"
    )]
    fn worse_rank(&self, edge: DeliveredEdge) -> ImportanceRank {
        self.rank_of_row(edge.source)
            .max(self.rank_of_row(edge.target))
    }

    /// Returns a node row's importance rank through the position permutation.
    const fn rank_of_row(&self, row: NodeRowId) -> ImportanceRank {
        let position = self.positions_of_row[row];
        self.ranks[position]
    }

    /// Reads edge `row`'s wire-column ids off the endpoint column, when the proof delivers it.
    ///
    /// [`None`] when the proof withholds the link row or either endpoint. The type admits no value
    /// for an edge no response may name, which is why both walks filter by constructing.
    fn edge(&self, row: EdgeRowId) -> Option<DeliveredEdge> {
        let [source, target] = self.endpoints[row];

        Some(DeliveredEdge {
            row: self.proof.verify_edge(row, source, target)?,
            source,
            target,
        })
    }
}
