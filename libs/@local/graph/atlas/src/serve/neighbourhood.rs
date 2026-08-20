//! Edge sets over delivered or resolved rows.
//!
//! Serving delivers two edge-set shapes. The ego graph is every edge at a source whose other
//! endpoint is visible: [`Neighbourhood::incident`] walks its fitted half and
//! [`Neighbourhood::incident_links`] folds the entry cohort's post-fit half. [`EdgeSet`] answers
//! the edges response's delivered set, which folds the delivered rows' induced fitted edges and
//! the entry cohort's admitted post-fit links into one capped, identity-ordered selection. The
//! fitted gathers walk the adjacency's outgoing runs and collect each qualifying edge exactly
//! once, because an edge occupies exactly one outgoing slot and a self-loop's one endpoint is
//! both its source and its target.
//!
//! An edge delivers only when the proof admits the edge's link row and both of its endpoints, and
//! when the ingress withdrawal snapshot withdraws none of the three. Both shapes reach their
//! fitted candidates through [`Neighbourhood::edge`], which answers [`None`] for an edge the proof
//! withholds or the snapshot withdraws, so every collected edge carries its delivery proof in the
//! type and neither walk states either rule a second time. A delta link has no generation row, and
//! it qualifies through the proof's identity set, the capture's retention, and delivery of both
//! endpoints.

use alloc::collections::BinaryHeap;
use core::cmp::Ordering;

use hashql_core::{
    collections::fast_hash_map,
    id::{IdSlice, IdVec, bit_vec::DenseBitSet},
};

use super::{
    Atlas, WireRow,
    codec::{RowCodec, Universe},
    delta::DeltaSnapshot,
    hydrate::EdgeSlot,
    schedule::ArrivalIndex,
    view::View,
    visibility::{VisibilityProof, VisibleEdge},
};
use crate::{
    identity::{BasePosition, EdgeRowId, ImportanceRank, NodeRowId},
    postgres::id::ArchivedEntityId,
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
    pub(super) const fn row(self) -> NodeRowId {
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

impl ServedEdge {
    /// Returns the node row the `EDGE_SOURCES` column encodes.
    const fn source_row(self) -> NodeRowId {
        match self {
            Self::Fitted(edge) => edge.source,
            Self::Delta(edge) => edge.source.row(),
        }
    }

    /// Returns the node row the `EDGE_TARGETS` column encodes.
    const fn target_row(self) -> NodeRowId {
        match self {
            Self::Fitted(edge) => edge.target,
            Self::Delta(edge) => edge.target.row(),
        }
    }

    /// Returns the hydration key behind the edge.
    const fn origin(self) -> EdgeOrigin {
        match self {
            Self::Fitted(edge) => EdgeOrigin::Fitted(edge.row.get()),
            Self::Delta(_) => EdgeOrigin::Delta,
        }
    }

    /// Views a delivered edge's endpoints in the vocabulary both serving domains share.
    pub(crate) const fn endpoints(self) -> [DeltaEndpoint; 2] {
        match self {
            Self::Fitted(edge) => [
                DeltaEndpoint::Fitted(edge.source),
                DeltaEndpoint::Fitted(edge.target),
            ],
            Self::Delta(edge) => [edge.source, edge.target],
        }
    }

    /// Returns the endpoint opposite the source, in the vocabulary both serving domains share.
    ///
    /// A self-loop's partner is the source itself, in either domain.
    pub(crate) fn opposite_endpoint(self, source: NodeRowId) -> DeltaEndpoint {
        match self {
            Self::Fitted(edge) => DeltaEndpoint::Fitted(edge.partner_of(source)),
            Self::Delta(edge) => {
                if edge.source.row() == source {
                    edge.target
                } else {
                    edge.source
                }
            }
        }
    }
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
/// Both origins resolve their display in process, captured display first. A fitted edge falls
/// back to the generation payload its row addresses while a delta edge holds no generation row
/// and always answers from its captured display keyed by the identity the `EDGE_IDS` column
/// already carries.
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
        universe: Universe<NodeRowId>,
        edges: &[(ServedEdge, ArchivedEntityId)],
    ) -> Self {
        let mut columns = Self {
            sources: IdVec::with_capacity(edges.len()),
            targets: IdVec::with_capacity(edges.len()),
            ids: IdVec::with_capacity(edges.len()),
            origins: IdVec::with_capacity(edges.len()),
        };

        for &(edge, id) in edges {
            columns
                .sources
                .push(codec.encode(edge.source_row(), universe));
            columns
                .targets
                .push(codec.encode(edge.target_row(), universe));
            columns.origins.push(edge.origin());
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
    node_ids: &'atlas IdentityTableArchive<ArchivedEntityId, NodeRowId>,
    ranks: &'atlas IdSlice<BasePosition, ImportanceRank>,
    positions_of_row: &'atlas IdSlice<NodeRowId, BasePosition>,
    node_universe: Universe<NodeRowId>,
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
            node_ids: &atlas.node_ids,
            ranks: atlas.ranks.view(),
            positions_of_row: atlas.positions_of_row.view(),
            node_universe: atlas.node_universe,
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

    /// Collects the cohort links incident to `source` that the request delivers, paired with
    /// their link-entity identities, in no particular order.
    ///
    /// The ego graph's post-fit half, under the same partner rule as the fitted walk: the other
    /// endpoint must be visible, never delivered-in-tiles. A link qualifies when the proof's
    /// identity set admits it and the ingress capture does not withdraw it, with each endpoint
    /// filtered under the same capture. Fitted endpoints serve while the proof admits their
    /// rows, and an arrival endpoint while the view's arrival table holds its identity, which
    /// carries the proof's slot admission and the cohort's retention together.
    pub(super) fn incident_links(
        &self,
        view: &View<'_>,
        source: NodeRowId,
    ) -> Vec<(DeltaEdge, ArchivedEntityId)> {
        let cohort = view.cohort();
        let ingress = self.delta;

        let endpoint = |row: NodeRowId| {
            if self.node_universe.contains(row) {
                (self.proof.contains(row)
                    && !ingress.is_some_and(|delta| delta.withdraws_node(row)))
                .then_some(DeltaEndpoint::Fitted(row))
            } else {
                let (identity, _) = cohort.node_at(row)?;
                if ingress.is_some_and(|delta| delta.withdraws(identity)) {
                    return None;
                }

                let arrivals = view.arrivals();
                let index = arrivals.partition_point(|entry| entry.identity < identity);
                (arrivals.get(index)?.identity == identity).then_some(DeltaEndpoint::Arrival {
                    slot: row,
                    identity,
                })
            }
        };

        cohort
            .edges()
            .filter(|&(_, link)| link.source == source || link.target == source)
            .filter_map(|(identity, link)| {
                if !self.proof.admits_delta_link(identity)
                    || ingress.is_some_and(|delta| delta.withdraws(identity))
                {
                    return None;
                }
                let (source, target) = (endpoint(link.source)?, endpoint(link.target)?);

                Some((DeltaEdge { source, target }, identity))
            })
            .collect()
    }

    /// Offers every induced fitted edge over `delivered` to the cap.
    ///
    /// The walk reads each delivered row's outgoing run and offers each edge whose other endpoint
    /// is delivered and whose delivery [`Neighbourhood::edge`] proves. The set membership test
    /// answers the induced-subgraph question - which rows this response draws edges between - and
    /// never stands in for the delivery rule, which the proof answers as the walk reads each
    /// candidate.
    ///
    /// Caller requirement: `delivered` is already intersected with the visibility proof.
    fn offer_induced(&self, delivered: &DenseBitSet<NodeRowId>, cap: &mut RankCap) {
        for row in delivered {
            let row_rank = self.rank_of_row(row);
            // One delivered endpoint suffices for exclusion: every edge at this row keys at or
            // past the row's own rank. The skip waits for a recorded truncation, per the cap's
            // caller requirement.
            if cap.truncated && cap.excludes(EndpointRank::Fitted(row_rank)) {
                continue;
            }

            let outgoing = self
                .adjacency
                .outgoing(row)
                .expect("delivered rows lie inside the adjacency's node domain");

            for edge in outgoing.iter() {
                let [_, target] = self.endpoints[edge];
                if !delivered.contains(target) {
                    continue;
                }

                let worse = EndpointRank::Fitted(row_rank.max(self.rank_of_row(target)));
                if cap.truncated && cap.excludes(worse) {
                    continue;
                }
                let Some(delivered_edge) = self.edge(edge) else {
                    continue;
                };

                cap.offer(
                    (worse, self.edge_identity(delivered_edge.row)),
                    ServedEdge::Fitted(delivered_edge),
                );
            }
        }
    }

    /// Offers every admitted cohort link between delivered endpoints to the cap.
    ///
    /// A delta link serves when the proof's identity set admits it, the ingress capture does not
    /// withdraw it, and the response's delivered sets hold both endpoints. Publication hands the
    /// endpoints as rows. A row inside the fitted universe qualifies through the delivered rows
    /// after subtraction, and an allocated row qualifies through the delivered arrivals whose
    /// identities the capture keeps. Endpoint withdrawal therefore kills an edge through
    /// the same delivered-set rule that kills fitted edges, one domain over. An endpoint the
    /// view cannot deliver refuses the edge whole, so a link attaching an undelivered entity
    /// serves nothing.
    fn offer_delta_links(&self, view: &View<'_>, bounds: &DeliveredBounds, cap: &mut RankCap) {
        let cohort = view.cohort();
        let ingress = self.delta;

        let arrivals = (!cap.truncated).then(|| {
            let table = view.arrivals();
            let mut map = fast_hash_map();
            for index in &bounds.arrivals {
                let row = &table[index];
                if ingress.is_some_and(|delta| delta.withdraws(row.identity)) {
                    continue;
                }
                let Some(node) = cohort.node(row.identity) else {
                    continue;
                };

                map.insert(node.id, row.identity);
            }

            map
        });

        let endpoint = |row: NodeRowId| {
            if self.node_universe.contains(row) {
                bounds
                    .rows
                    .contains(row)
                    .then_some(DeltaEndpoint::Fitted(row))
            } else {
                arrivals
                    .as_ref()
                    .and_then(|map| map.get(&row))
                    .map(|&identity| DeltaEndpoint::Arrival {
                        slot: row,
                        identity,
                    })
            }
        };

        for (identity, link) in cohort.edges() {
            if !self.proof.admits_delta_link(identity) {
                continue;
            }
            if ingress.is_some_and(|delta| delta.withdraws(identity)) {
                continue;
            }
            let (Some(source), Some(target)) = (endpoint(link.source), endpoint(link.target))
            else {
                continue;
            };

            cap.offer(
                (
                    self.endpoint_rank(source).max(self.endpoint_rank(target)),
                    identity,
                ),
                ServedEdge::Delta(DeltaEdge { source, target }),
            );
        }
    }

    /// Returns an edge row's link-entity identity.
    ///
    /// Generation-baked. The `EDGE_IDS` columns deliver exactly these identity bytes.
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

/// The listed tiles' delivered sets, one per serving domain.
///
/// The rows are the fitted deliveries, as the tile route renders them. The arrivals are the
/// delivered placed arrivals as view arrival-table indices, the identity-domain half a delta
/// edge's endpoints resolve against.
#[derive(Debug)]
pub(super) struct DeliveredBounds {
    /// The delivered fitted rows.
    pub rows: DenseBitSet<NodeRowId>,
    /// The delivered placed arrivals, as arrival-table indices.
    pub arrivals: DenseBitSet<ArrivalIndex>,
}

/// The edges response's delivered edge set: the fitted-plus-delta union, selected and ordered.
///
/// One constructor folds both serving domains. The delivered rows' induced fitted edges and the
/// entry cohort's admitted post-fit links each qualify through their own domain's delivery rule,
/// compete at one rank-ordered cap, and leave in ascending link-entity identity order, so the
/// fitted-delta distinction keeps one home and every later consumer takes the folded set whole.
#[derive(Debug)]
pub(super) struct EdgeSet {
    /// Whether every qualifying edge is in the set.
    complete: bool,
    /// The selected edges, ascending link-entity identity bytes.
    edges: Vec<(ServedEdge, ArchivedEntityId)>,
}

impl EdgeSet {
    /// Folds both serving domains' qualifying edges into one selected, identity-ordered set.
    ///
    /// `bounds` arrives as the tile route read it, and the delivery rules apply here: the
    /// delivered rows intersect the proof and drop the ingress capture's withdrawn rows, so the
    /// fitted bounding set is exactly what the tiles rendered. The fitted domain then offers
    /// every adjacency edge between delivered rows that the proof delivers, and the delta domain
    /// offers every cohort link the proof's identity set admits, the capture retains, and the
    /// delivered sets resolve at both endpoints.
    ///
    /// Every offer competes under one rank-ordered cap on its worse endpoint's rank, ties on
    /// identity bytes - an edge is only as prominent as its less-prominent endpoint. The kept
    /// set equals the full union sorted by that key and truncated to `cap`, and
    /// [`EdgeSet::complete`] reports whether the cap truncated a qualifying edge.
    pub(super) fn of(
        atlas: &Atlas,
        view: &View<'_>,
        mut bounds: DeliveredBounds,
        cap: usize,
    ) -> Self {
        let neighbourhood = Neighbourhood::of(atlas, view.proof(), view.delta());

        // Both branches of the union already gather visible rows alone - a scope cascade holds
        // only what its proof admitted, and the corpus walk answers only an operator view. The
        // intersection is what discharges the fitted walk's caller requirement rather than a
        // second derivation of it, and it is the guard if either branch ever widens.
        neighbourhood.proof.intersect(&mut bounds.rows);

        // The bounding set is what tiles rendered, and tiles subtract at admission, so the
        // withdrawn rows leave here too. `Neighbourhood::edge` states the edge rule itself.
        if let Some(delta) = neighbourhood.delta {
            for row in delta.withdrawn_node_rows() {
                bounds.rows.remove(row);
            }
        }

        let mut cap = RankCap::new(cap);
        neighbourhood.offer_induced(&bounds.rows, &mut cap);
        neighbourhood.offer_delta_links(view, &bounds, &mut cap);
        cap.into_set()
    }

    /// Whether every qualifying edge is in the set.
    pub(super) const fn complete(&self) -> bool {
        self.complete
    }

    /// Views the selected edges, ascending link-entity identity bytes.
    pub(super) const fn edges(&self) -> &[(ServedEdge, ArchivedEntityId)] {
        &self.edges
    }
}

/// The rank-ordered cap holding the `cap` best candidates offered so far, with every truncation
/// recorded.
///
/// A candidate falls on arrival when its key loses to the kept worst, and a kept candidate
/// falls by eviction when a better arrival fills the selection. Either way the truncation is
/// recorded, because a response that silently skipped a qualifying edge must never report
/// itself complete.
#[derive(Debug)]
struct RankCap {
    /// The number of candidates the selection keeps.
    cap: usize,
    /// The kept candidates in a max-heap on the key, whose root is the eviction candidate.
    kept: BinaryHeap<Candidate>,
    /// Whether any qualifying candidate fell, on arrival or by eviction.
    truncated: bool,
}

impl RankCap {
    /// An empty selection admitting `cap` candidates.
    const fn new(cap: usize) -> Self {
        Self {
            cap,
            kept: BinaryHeap::new(),
            truncated: false,
        }
    }

    /// Offers one qualifying candidate, recording the truncation when the selection is full.
    ///
    /// A full selection truncates either way: the offer falls when its key loses to the kept
    /// worst, and the kept worst falls by eviction when the offer wins. A zero cap truncates
    /// every offer. Equal keys cannot arrive, because distinct link identities make the key a
    /// total order.
    fn offer(&mut self, key: (EndpointRank, ArchivedEntityId), edge: ServedEdge) {
        if self.kept.len() < self.cap {
            self.kept.push(Candidate { key, edge });
            return;
        }

        self.truncated = true;
        if let Some(mut worst) = self.kept.peek_mut()
            && key < worst.key
        {
            *worst = Candidate { key, edge };
        }
    }

    /// Whether `rank` alone already loses the selection, before the candidate is priced.
    ///
    /// True when the selection is full and `rank` strictly loses to the kept worst's rank. A
    /// rank equal to the worst's never suffices, because the identity tie-break can still admit
    /// the candidate.
    ///
    /// Caller requirement: skip a candidate on this answer only after a truncation is recorded,
    /// because completeness counts qualifying candidates alone and a skipped candidate is never
    /// checked for qualification.
    fn excludes(&self, rank: EndpointRank) -> bool {
        self.kept.len() == self.cap && self.kept.peek().is_none_or(|worst| rank > worst.key.0)
    }

    /// Closes the selection into the delivered set, sorted into delivery order.
    fn into_set(self) -> EdgeSet {
        let mut edges: Vec<(ServedEdge, ArchivedEntityId)> = self
            .kept
            .into_iter()
            .map(|candidate| (candidate.edge, candidate.key.1))
            .collect();
        // Truncation ties and the delivery sort both compare identity bytes, so nothing the
        // response exposes orders by internal id.
        edges.sort_unstable_by_key(|&(_, id)| id);

        EdgeSet {
            complete: !self.truncated,
            edges,
        }
    }
}

/// One offered candidate, carrying its selection key and the edge it delivers.
#[derive(Debug)]
struct Candidate {
    /// The worse endpoint's rank, with ties on link-entity identity bytes.
    key: (EndpointRank, ArchivedEntityId),
    /// The edge the key selects.
    edge: ServedEdge,
}

// The comparisons read the key alone, so the heap's order ignores the carried edge, and the
// distinct link identities inside the key make the order total.
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

#[cfg(test)]
mod tests {
    use hashql_core::id::Id as _;

    use super::{DeltaEdge, DeltaEndpoint, EndpointRank, RankCap, ServedEdge};
    use crate::{
        identity::{ImportanceRank, NodeRowId},
        postgres::id::{ArchivedEntityId, ArchivedEntityUuid, ArchivedWebId},
    };

    /// The identity-table key `seed` spells.
    fn identity(seed: u8) -> ArchivedEntityId {
        ArchivedEntityId {
            web_id: ArchivedWebId::from_bytes([seed; 16]),
            entity_uuid: ArchivedEntityUuid::from_bytes([seed; 16]),
        }
    }

    /// A candidate edge whose fate the selection key alone decides.
    fn edge() -> ServedEdge {
        ServedEdge::Delta(DeltaEdge {
            source: DeltaEndpoint::Fitted(NodeRowId::from_u32(0)),
            target: DeltaEndpoint::Fitted(NodeRowId::from_u32(1)),
        })
    }

    /// A full selection never excludes on rank equality, and the identity tie-break the
    /// strictness protects can then evict the kept worst.
    #[test]
    fn a_rank_tie_never_excludes_before_the_identity_prices_it() {
        let tied = EndpointRank::Fitted(ImportanceRank::from_u32(7));
        let better = EndpointRank::Fitted(ImportanceRank::from_u32(3));
        let worse = EndpointRank::Fitted(ImportanceRank::from_u32(8));

        let mut cap = RankCap::new(1);
        cap.offer((tied, identity(9)), edge());

        assert!(
            !cap.excludes(tied),
            "an equal rank prices the identity tie-break",
        );
        assert!(!cap.excludes(better));
        assert!(cap.excludes(worse));

        cap.offer((tied, identity(1)), edge());
        let set = cap.into_set();
        assert_eq!(
            set.edges().iter().map(|&(_, id)| id).collect::<Vec<_>>(),
            vec![identity(1)],
            "the equal-ranked better identity evicts the kept worst",
        );
        assert!(!set.complete(), "the eviction records the truncation");
    }
}
