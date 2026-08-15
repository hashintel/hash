//! Edge sets over delivered or resolved rows.
//!
//! Serving delivers two edge-set shapes. [`Neighbourhood::incident`] answers a source's ego graph,
//! which is every edge at the source whose other endpoint is visible. [`Neighbourhood::induced`]
//! answers a delivered row set's induced subgraph, which is every edge whose endpoints both lie in
//! the set. Both walk the adjacency's outgoing runs, and both collect each qualifying edge exactly
//! once, because an edge occupies exactly one outgoing slot and a self-loop's one endpoint is both
//! its source and its target.
//!
//! An edge delivers only when the proof admits the edge's link row and both of its endpoints, and
//! when the ingress withdrawal snapshot withdraws none of the three. Both shapes reach their
//! candidates through [`Neighbourhood::edge`], which answers [`None`] for an edge the proof
//! withholds or the snapshot withdraws, so every collected edge carries its delivery proof in the
//! type and neither walk states either rule a second time.

use hashql_core::id::{IdSlice, IdVec, bit_vec::DenseBitSet};

use super::{
    Atlas, WireRow,
    codec::{RowCodec, Universe},
    delta::DeltaSnapshot,
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

/// One delta-edge endpoint, resolved into the domain that delivers it.
///
/// A fitted endpoint is a generation node row in the response's delivered set, and an arrival
/// endpoint a delivered placed arrival. The arrival keeps its identity in the vessel because
/// arrival ranking orders by identity bytes where fitted ranking reads the importance column.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum DeltaEndpoint {
    /// A delivered generation row.
    Fitted(NodeRowId),
    /// A delivered placed arrival, on its cohort slot.
    Arrival {
        /// The slot the endpoint column encodes.
        slot: NodeRowId,
        /// The arrival's identity, its place in the arrival rank order.
        identity: ArchivedEntityId,
    },
}

impl DeltaEndpoint {
    /// Returns the row id the endpoint column encodes.
    const fn row(self) -> NodeRowId {
        match self {
            Self::Fitted(row) => row,
            Self::Arrival { slot, .. } => slot,
        }
    }
}

/// One delta edge's resolved endpoints during assembly.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct DeltaEdge {
    /// The left attachment's delivered endpoint.
    pub source: DeltaEndpoint,
    /// The right attachment's delivered endpoint.
    pub target: DeltaEndpoint,
}

/// One qualifying edge during assembly, from either serving domain.
///
/// A fitted edge is a generation row that the structural walks collect with its delivery proof
/// in the vessel, and a delta edge a cohort-published post-fit link that the proof's identity
/// set admits, its endpoints resolved against the response's own delivered sets. The wire
/// columns hold both shapes in one delivery order.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ServedEdge {
    /// A generation edge row, proven deliverable.
    Fitted(DeliveredEdge),
    /// A cohort-published post-fit link between two delivered endpoints.
    Delta(DeltaEdge),
}

/// One endpoint's truncation rank, over the fitted-plus-delta union.
///
/// The derived order places every fitted rank before every arrival rank, because a placed
/// arrival ranks past every generation row, and it orders arrivals by identity bytes, the
/// arrival order's own law. Larger values are less prominent in both arms.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum EndpointRank {
    /// A generation row's importance rank.
    Fitted(ImportanceRank),
    /// A placed arrival's identity.
    Arrival(ArchivedEntityId),
}

/// The provenance behind one delivered edge: the hydration key.
///
/// A fitted edge hydrates its label from the generation payload its row addresses. Delta edges
/// hold no generation row, so their display hydrates from the live store by the identity the
/// `EDGE_IDS` column already carries.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum EdgeOrigin {
    /// A generation edge row.
    Fitted(EdgeRowId),
    /// A cohort-published delta link.
    Delta,
}

/// The delivered edges in column form, every column in lockstep.
///
/// One constructor writes every column in one pass over the delivered edge set, so the columns
/// cover the same edges by construction and delivery order is the input's own. The endpoint
/// columns speak wire row ids. The identity column is the wire's `EDGE_IDS`, and the origin
/// column is the hydration key behind it.
#[derive(Debug)]
pub(crate) struct EdgeColumns {
    /// The `EDGE_SOURCES` column: node row ids in wire form, edge order.
    sources: IdVec<EdgeSlot, WireRow<NodeRowId>>,
    /// The `EDGE_TARGETS` column: node row ids in wire form, edge order.
    targets: IdVec<EdgeSlot, WireRow<NodeRowId>>,
    /// The `EDGE_IDS` column: link-entity identities, edge order.
    ids: IdVec<EdgeSlot, ArchivedEntityId>,
    /// The provenance behind `ids`, edge order: the hydration key.
    origins: IdVec<EdgeSlot, EdgeOrigin>,
}

impl EdgeColumns {
    /// Gathers the delivered edges into their column form.
    ///
    /// `universe` is the caller's accepted row bound, read at every endpoint encode.
    ///
    /// Caller requirement: `universe` admits every endpoint row, so a view serving cohort slots
    /// passes its entry universe rather than the generation's fitted bound. A fitted row
    /// encodes to the same bytes under either bound.
    pub(super) fn of(
        codec: &RowCodec<NodeRowId>,
        universe: Universe,
        edges: &[(ServedEdge, ArchivedEntityId)],
    ) -> Self {
        let mut columns = Self {
            sources: IdVec::with_capacity(edges.len()),
            targets: IdVec::with_capacity(edges.len()),
            ids: IdVec::with_capacity(edges.len()),
            origins: IdVec::with_capacity(edges.len()),
        };

        for &(edge, id) in edges {
            match edge {
                ServedEdge::Fitted(edge) => {
                    columns.sources.push(codec.encode(edge.source, universe));
                    columns.targets.push(codec.encode(edge.target, universe));
                    columns.origins.push(EdgeOrigin::Fitted(edge.row.get()));
                }
                ServedEdge::Delta(edge) => {
                    columns
                        .sources
                        .push(codec.encode(edge.source.row(), universe));
                    columns
                        .targets
                        .push(codec.encode(edge.target.row(), universe));
                    columns.origins.push(EdgeOrigin::Delta);
                }
            }
            columns.ids.push(id);
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

    /// Views the per-edge provenance, edge order.
    pub(crate) const fn origins(&self) -> &IdSlice<EdgeSlot, EdgeOrigin> {
        &self.origins
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
            origins: IdVec::new(),
        };
        for (source, target, id) in edges {
            let row = u32::try_from(columns.origins.len()).expect("pinned fixtures are small");
            columns.sources.push(WireRow::pinned(source));
            columns.targets.push(WireRow::pinned(target));
            columns.ids.push(id);
            columns
                .origins
                .push(EdgeOrigin::Fitted(EdgeRowId::from_u32(row)));
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
    /// The request's ingress withdrawal snapshot, absent before the first publication.
    delta: Option<&'atlas DeltaSnapshot>,
}

impl<'atlas> Neighbourhood<'atlas> {
    /// Binds the generation's edge columns to `proof`, with `delta` as the request's ingress
    /// withdrawal capture.
    pub(super) fn of(
        atlas: &'atlas Atlas,
        proof: &'atlas VisibilityProof,
        delta: Option<&'atlas DeltaSnapshot>,
    ) -> Self {
        Self {
            adjacency: &atlas.adjacency,
            endpoints: atlas.endpoints.view(),
            edge_ids: &atlas.edge_ids,
            ranks: atlas.ranks.view(),
            positions_of_row: atlas.positions_of_row.view(),
            proof,
            delta,
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

    /// Keeps the `cap` edges the rank-ordered cap selects, over the fitted-plus-delta union.
    ///
    /// Ascending by worse-endpoint rank, ties by link-entity identity bytes.
    pub(super) fn truncate_by_rank(
        &self,
        edges: &mut Vec<(ServedEdge, ArchivedEntityId)>,
        cap: usize,
    ) {
        if cap == 0 {
            edges.clear();
            return;
        }

        let mut ranked: Vec<(EndpointRank, (ServedEdge, ArchivedEntityId))> = edges
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
    /// Its worse endpoint's rank, where larger values are less prominent in both domains.
    #[expect(
        clippy::missing_const_for_fn,
        reason = "`Ord::max` needs `EndpointRank: [const] Ord`, which the derive does not emit"
    )]
    fn worse_rank(&self, edge: ServedEdge) -> EndpointRank {
        match edge {
            ServedEdge::Fitted(edge) => EndpointRank::Fitted(
                self.rank_of_row(edge.source)
                    .max(self.rank_of_row(edge.target)),
            ),
            ServedEdge::Delta(edge) => self
                .endpoint_rank(edge.source)
                .max(self.endpoint_rank(edge.target)),
        }
    }

    /// Returns a delta-edge endpoint's rank in the union order.
    const fn endpoint_rank(&self, endpoint: DeltaEndpoint) -> EndpointRank {
        match endpoint {
            DeltaEndpoint::Fitted(row) => EndpointRank::Fitted(self.rank_of_row(row)),
            DeltaEndpoint::Arrival { identity, .. } => EndpointRank::Arrival(identity),
        }
    }

    /// Returns a node row's importance rank through the position permutation.
    const fn rank_of_row(&self, row: NodeRowId) -> ImportanceRank {
        let position = self.positions_of_row[row];
        self.ranks[position]
    }

    /// Reads edge `row`'s wire-column ids off the endpoint column, when the request delivers it.
    ///
    /// [`None`] when the proof withholds the link row or either endpoint, and when the ingress
    /// snapshot withdraws any of the three. A withdrawn link is a tombstone whose endpoints
    /// survive, and a withdrawn endpoint kills every edge at it on the next request. The type
    /// admits no value for an edge no response may name, which is why both walks filter by
    /// constructing.
    fn edge(&self, row: EdgeRowId) -> Option<DeliveredEdge> {
        let [source, target] = self.endpoints[row];

        if let Some(delta) = self.delta
            && (delta.withdraws_edge(row)
                || delta.withdraws_node(source)
                || delta.withdraws_node(target))
        {
            return None;
        }

        Some(DeliveredEdge {
            row: self.proof.verify_edge(row, source, target)?,
            source,
            target,
        })
    }
}
