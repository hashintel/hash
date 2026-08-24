//! The immutable publication requests read, and the cohort view over it.
//!
//! [`DeltaSnapshot`] is one publication of the register's fold, resolved against the serving
//! generation and swapped whole into the cell, so a reader never sees a half-applied poll.
//! [`PlacementCohort`] wraps the snapshot a scope resolution read, and a request's assembly
//! paths answer from that one publication however the cell moves meanwhile.

use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use hashql_core::collections::{FastHashMap, FastHashSet};
use type_system::knowledge::entity::id::EntityEditionId;

use super::{DeltaEdge, DeltaNode, DeltaRevision, overlay::IdentityTableOverlay};
use crate::{
    bitset::CompressedBitSet,
    dataset::auxiliary::{Icon, Legend, OwnedIcon, OwnedLegend},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    serve::codec::Universe,
};

/// An immutable publication of the register, resolved against the serving generation.
///
/// The withdrawn identities live here in two forms. The identity set answers for every withdrawn
/// identity whether or not the generation fitted it, because a retained cohort can hold identities
/// no generation bitset can name. The row bitsets are the fitted withdrawals resolved into the
/// generation's row domains at publication, so an admission path tests membership per admitted row
/// rather than consulting a map per candidate. The staged identities are the node-classified
/// arrivals, keyed to the edition the feed last observed, and the links are the link-classified
/// arrivals with complete attachment pairs. An unclassified arrival joins neither, so it serves
/// nothing until a verdict arrives. The published nodes carry their recorded wire coordinates
/// and rows, ready to serve wherever the caller's cohort admits them.
#[derive(Debug, PartialEq)]
pub(crate) struct DeltaSnapshot {
    /// This publication's position in publication order.
    pub revision: DeltaRevision,
    /// The feed position the register had folded through at publication.
    pub watermark: Timestamp<TransactionTime>,
    /// Every withdrawn identity, fitted or not.
    pub withdrawn: FastHashSet<ArchivedEntityId>,
    /// The withdrawn identities' node rows in the serving generation.
    pub withdrawn_nodes: CompressedBitSet<NodeRowId>,
    /// The withdrawn identities' edge rows in the serving generation.
    pub withdrawn_edges: CompressedBitSet<EdgeRowId>,
    /// The node-classified arrivals awaiting placement, keyed to their newest feed edition.
    pub staged: FastHashMap<ArchivedEntityId, EntityEditionId>,
    /// The published nodes, carrying their recorded wire coordinates.
    pub nodes: FastHashMap<ArchivedEntityId, DeltaNode>,
    /// The link-classified arrivals with complete attachment pairs, published row-typed once
    /// both endpoints hold rows.
    pub edges: FastHashMap<ArchivedEntityId, DeltaEdge>,
    /// One captured legend per published link and per live fitted identity whose capture read
    /// has answered. A revised fitted identity with no capture stays absent here and answers
    /// from the fit-time payload.
    pub legends: FastHashMap<ArchivedEntityId, OwnedLegend>,
    /// Every allocated node row beside the accepted universe, as of this publication.
    pub node_rows: IdentityTableOverlay<ArchivedEntityId, NodeRowId>,
    /// Every allocated edge row beside the accepted edge universe, as of this publication.
    pub edge_rows: IdentityTableOverlay<ArchivedEntityId, EdgeRowId>,
    /// The ontology rows allocated for types the generation never tabulated, as of this
    /// publication.
    pub ontology_rows: IdentityTableOverlay<ArchivedOntologyTypeUuid, OntologyRowId>,
    /// The icons recorded at the allocated ontology rows, one per row the extension holds.
    ///
    /// A tabulated type's icon resolves through the generation's baked closure artifact, so
    /// this map carries exactly the rows past the baked bound, written once at allocation and
    /// repaired by refit.
    pub ontology_icons: FastHashMap<OntologyRowId, OwnedIcon>,
}

impl DeltaSnapshot {
    /// Returns this publication's position in publication order.
    #[must_use]
    pub(crate) const fn revision(&self) -> DeltaRevision {
        self.revision
    }

    /// Returns the feed position the register had folded through at publication.
    #[must_use]
    pub(crate) const fn watermark(&self) -> Timestamp<TransactionTime> {
        self.watermark
    }

    /// Returns the accepted row universe at publication.
    ///
    /// The bound covers every allocated row whatever its holder's standing, so a wire id a
    /// retained proof admitted keeps decoding to the same row. A request takes this one value at
    /// every encode and decode in its answer.
    #[must_use]
    pub(crate) const fn universe(&self) -> Universe<NodeRowId> {
        self.node_rows.universe()
    }

    /// Returns the accepted edge row universe at publication, under the same one-value law as
    /// [`Self::universe`].
    #[must_use]
    pub(crate) const fn edge_universe(&self) -> Universe<EdgeRowId> {
        self.edge_rows.universe()
    }

    /// Returns whether the snapshot withdraws the entity `id` names, fitted or not.
    #[must_use]
    pub(crate) fn withdraws(&self, id: ArchivedEntityId) -> bool {
        self.withdrawn.contains(&id)
    }

    /// Returns the captured current legend of the entity `id` names.
    ///
    /// Map first, artifact second: a holder consults this before the generation's baked legend,
    /// so a revised fitted identity answers with its most recently captured legend - the current
    /// edition's once its capture read answers - and a fitted identity with no capture answers
    /// from the fit-time payload. Every published link answers here, because publication
    /// withholds a link until its legend captures.
    #[must_use]
    pub(crate) fn legend_of(&self, id: ArchivedEntityId) -> Option<&Legend> {
        self.legends.get(&id).map(AsRef::as_ref)
    }

    /// Returns whether the snapshot withdraws any identity at all, fitted or not.
    ///
    /// An empty set lets an arrival-bearing admission walk skip whole, the identity-domain
    /// counterpart of [`Self::withdraws_any_node`].
    #[must_use]
    pub(crate) fn withdraws_any(&self) -> bool {
        !self.withdrawn.is_empty()
    }

    /// Returns whether the snapshot captured any display at all, link or fitted.
    ///
    /// An empty capture map answers no overlay read, so a detail pass consults this once
    /// instead of paying a per-row identity lookup that can never hit.
    #[must_use]
    pub(crate) fn captures_any(&self) -> bool {
        !self.legends.is_empty()
    }

    /// Returns whether the snapshot withdraws any fitted node at all.
    ///
    /// An empty projection lets the admission walk skip whole, so a snapshot subtracting no
    /// node rows costs a tile request nothing beyond this question.
    #[must_use]
    pub(crate) fn withdraws_any_node(&self) -> bool {
        !self.withdrawn_nodes.is_empty()
    }

    /// Returns whether the snapshot withdraws the node in `row`.
    #[must_use]
    pub(crate) fn withdraws_node(&self, row: NodeRowId) -> bool {
        self.withdrawn_nodes.contains(row)
    }

    /// Returns whether the snapshot withdraws the edge in `row`.
    #[must_use]
    pub(crate) fn withdraws_edge(&self, row: EdgeRowId) -> bool {
        self.withdrawn_edges.contains(row)
    }

    /// Iterates the withdrawn node rows, the fitted withdrawals in the node domain.
    ///
    /// The edges route subtracts these from its bounding set, which is what tiles rendered, so
    /// the two routes keep answering from one delivered world.
    pub(crate) fn withdrawn_node_rows(&self) -> impl Iterator<Item = NodeRowId> + '_ {
        self.withdrawn_nodes.iter()
    }

    /// Iterates the withdrawn edge rows, the fitted withdrawals in the edge domain.
    ///
    /// An entry fold subtracts these from a scoped proof's edge mask at resolution, exactly as
    /// [`Self::withdrawn_node_rows`] feeds the node mask, so the folded proof and the admission
    /// checks answer from one withdrawn set.
    pub(crate) fn withdrawn_edge_rows(&self) -> impl Iterator<Item = EdgeRowId> + '_ {
        self.withdrawn_edges.iter()
    }

    /// Returns the staged edition of the arrival `id` names, or [`None`] for an identity with no
    /// staged arrival.
    #[must_use]
    pub(crate) fn staged(&self, id: ArchivedEntityId) -> Option<EntityEditionId> {
        self.staged.get(&id).copied()
    }

    /// Returns every staged arrival, keyed to its newest feed edition.
    #[must_use]
    pub(crate) const fn staged_arrivals(&self) -> &FastHashMap<ArchivedEntityId, EntityEditionId> {
        &self.staged
    }

    /// Returns the published edge `id` names, or [`None`] for an identity with no published edge.
    #[must_use]
    pub(crate) fn edge(&self, id: ArchivedEntityId) -> Option<DeltaEdge> {
        self.edges.get(&id).copied()
    }

    /// Returns the published node `id` names, or [`None`] for an identity with no published node.
    #[must_use]
    pub(crate) fn node(&self, id: ArchivedEntityId) -> Option<&DeltaNode> {
        self.nodes.get(&id)
    }

    /// Returns the published node holding `row`, or [`None`] for a row this publication does not
    /// serve.
    ///
    /// [`Self::node`] reversed: wire-domain ingress decodes to an allocated row and resolves the
    /// identity serving it here. The extension answers every allocated row, and the node map
    /// filters it to the published holders, so a dormant holder's row resolves to [`None`].
    #[must_use]
    pub(crate) fn node_at(&self, row: NodeRowId) -> Option<(ArchivedEntityId, &DeltaNode)> {
        let identity = self.node_rows.id_of(row)?;
        let node = self.nodes.get(&identity)?;

        Some((identity, node))
    }

    /// Returns every published node, carrying its recorded wire coordinate.
    #[must_use]
    pub(crate) const fn nodes(&self) -> &FastHashMap<ArchivedEntityId, DeltaNode> {
        &self.nodes
    }

    /// Returns every published edge, carrying its endpoint identities.
    #[must_use]
    pub(crate) const fn edges(&self) -> &FastHashMap<ArchivedEntityId, DeltaEdge> {
        &self.edges
    }

    /// Returns the identity of the allocated ontology row `row`, or [`None`] below the baked
    /// bound, whose rows the generation's own table answers.
    #[must_use]
    pub(crate) fn ontology_id_of(&self, row: OntologyRowId) -> Option<ArchivedOntologyTypeUuid> {
        self.ontology_rows.id_of(row)
    }

    /// Returns the icon recorded at the allocated ontology row `row`, or [`None`] below the
    /// baked bound, whose icons the generation's closure artifact resolves.
    ///
    /// Every allocated row answers, because allocation records an icon beside the row it
    /// allocates - the empty icon when the type's chain declares none.
    #[must_use]
    pub(crate) fn allocated_icon_of(&self, row: OntologyRowId) -> Option<&Icon> {
        self.ontology_icons.get(&row).map(|icon| &**icon)
    }
}

/// The arrivals snapshot one scope resolution read, as a request borrows it.
///
/// A scope resolution reads exactly one snapshot and resolves its proof against that snapshot's
/// placed set, and the cache entry binds the snapshot for its lifetime - the entry's placement
/// cohort. Every arrival-sensitive read takes slots, placement payload, and the accepted row
/// universe from this value, so a publication landing mid-window moves nothing a held entry
/// serves. The request's ingress capture stays the admission-time withdrawal authority: the
/// current withdrawn identity set filters what a retained cohort serves. The entry's masks
/// already fold this snapshot's own withdrawals, so the capture's admission work is the
/// residue that published after the entry resolved.
///
/// An empty cohort is the resolution that read no publication - a serve that starts no consumer,
/// or a scope resolved before the first poll completes. No arrival serves through it, and the
/// universe stays the generation's own.
#[derive(Debug, Copy, Clone)]
pub(crate) struct PlacementCohort<'scope> {
    /// The snapshot the resolution read, absent when it read none.
    snapshot: Option<&'scope DeltaSnapshot>,
}

impl<'scope> PlacementCohort<'scope> {
    /// The cohort of a resolution that read no publication.
    pub(crate) const EMPTY: Self = Self { snapshot: None };

    /// Borrows `snapshot` as one resolution's cohort.
    pub(crate) const fn of(snapshot: Option<&'scope DeltaSnapshot>) -> Self {
        Self { snapshot }
    }

    /// Returns the captured current legend of the entity `id` names, [`None`] for a cohort
    /// that read no publication.
    ///
    /// The read is [`DeltaSnapshot::legend_of`]'s, out of the one snapshot the entry's whole
    /// resolution bound. A published link answers here, and a fitted identity answers with its
    /// captured legend once its capture read has answered. A fitted identity holding no capture
    /// answers [`None`], and the holder serves the generation's baked legend.
    pub(crate) fn legend_of(self, id: ArchivedEntityId) -> Option<&'scope Legend> {
        self.snapshot?.legend_of(id)
    }

    /// Returns whether this cohort captured any display at all.
    ///
    /// A cohort that read no publication answers `false`. Detail passes hoist this ahead of
    /// their per-row overlay reads: a captureless cohort answers [`None`] from
    /// [`Self::legend_of`] for every identity, so a pass checks once per response instead of
    /// once per delivered row.
    #[must_use]
    #[expect(
        clippy::missing_const_for_fn,
        reason = "false positive: the delegate reads a hash map's emptiness, which is not const"
    )]
    pub(crate) fn captures_any(self) -> bool {
        self.snapshot.is_some_and(DeltaSnapshot::captures_any)
    }

    /// Returns the published node `id` names in this cohort, [`None`] for every other identity.
    ///
    /// An identity placed after the cohort's snapshot published answers [`None`], so a caller
    /// meets it at its next resolution rather than mid-window.
    #[must_use]
    pub(crate) fn node(self, id: ArchivedEntityId) -> Option<&'scope DeltaNode> {
        self.snapshot?.node(id)
    }

    /// Returns the published node holding `row` in this cohort, [`None`] for every other row.
    ///
    /// The wire-ingress counterpart of [`Self::node`]: a decoded row at or past the generation's
    /// fitted bound names an allocated row, and this answers the identity serving it.
    #[must_use]
    pub(crate) fn node_at(self, row: NodeRowId) -> Option<(ArchivedEntityId, &'scope DeltaNode)> {
        self.snapshot?.node_at(row)
    }

    /// Iterates the cohort's published nodes, empty for the empty cohort.
    ///
    /// Iteration order is the map's own. A consumer whose output must be deterministic orders
    /// the nodes itself, by identity.
    pub(crate) fn nodes(self) -> impl Iterator<Item = (ArchivedEntityId, &'scope DeltaNode)> {
        self.snapshot
            .into_iter()
            .flat_map(|snapshot| snapshot.nodes().iter().map(|(&id, node)| (id, node)))
    }

    /// Returns the published edge `id` names in this cohort, [`None`] for every other identity.
    ///
    /// An edge published after the cohort's snapshot answers [`None`], so a caller meets it at
    /// its next resolution rather than mid-window.
    #[must_use]
    pub(crate) fn edge(self, id: ArchivedEntityId) -> Option<DeltaEdge> {
        self.snapshot?.edge(id)
    }

    /// Iterates the cohort's published edges, empty for the empty cohort.
    ///
    /// Iteration order is the map's own. A consumer whose output must be deterministic orders
    /// the edges itself, by identity.
    pub(crate) fn edges(self) -> impl Iterator<Item = (ArchivedEntityId, DeltaEdge)> {
        self.snapshot
            .into_iter()
            .flat_map(|snapshot| snapshot.edges().iter().map(|(&id, &edge)| (id, edge)))
    }

    /// Returns the identity of the allocated ontology row `row`, [`None`] below the baked bound
    /// or for a cohort that read no publication.
    ///
    /// Rows below the bound answer from the generation's own table, so a caller resolving a
    /// representative row consults the table first and this second.
    #[must_use]
    pub(crate) fn ontology_id_of(self, row: OntologyRowId) -> Option<ArchivedOntologyTypeUuid> {
        self.snapshot?.ontology_id_of(row)
    }

    /// Returns the icon recorded at the allocated ontology row `row`, [`None`] below the baked
    /// bound or for a cohort that read no publication.
    ///
    /// The tile trailer resolves an arrival legend's representative here when its row lies
    /// past the generation's tabulated types, whose icons the baked closure artifact resolves
    /// instead.
    #[must_use]
    pub(crate) fn allocated_icon_of(self, row: OntologyRowId) -> Option<&'scope Icon> {
        self.snapshot?.allocated_icon_of(row)
    }

    /// Returns the accepted row universe reads under this cohort take, `base` for an empty one.
    ///
    /// The bound is the snapshot's own. Every slot the cohort can name lies inside it, and a
    /// slot allocated after the snapshot published refuses at decode.
    #[must_use]
    pub(crate) const fn universe(self, base: Universe<NodeRowId>) -> Universe<NodeRowId> {
        match self.snapshot {
            Some(snapshot) => snapshot.universe(),
            None => base,
        }
    }

    /// Returns the accepted edge row universe reads under this cohort take, `base` for an
    /// empty one, under the same one-value law as [`Self::universe`].
    #[must_use]
    pub(crate) const fn edge_universe(self, base: Universe<EdgeRowId>) -> Universe<EdgeRowId> {
        match self.snapshot {
            Some(snapshot) => snapshot.edge_universe(),
            None => base,
        }
    }
}
