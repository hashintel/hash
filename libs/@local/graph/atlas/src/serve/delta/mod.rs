//! The generation-local register folding the entity feed against the serving generation.
//!
//! A generation serves immutably from its fit-time snapshot while the store keeps moving underneath
//! it. The entity feed ([`EntityEvent`]) reports each change to an entity's published present, and
//! this module folds those events into one standing per entity. Publication resolves the fold
//! against the serving generation, so a deleted entity stops rendering and a new one can stage for
//! placement without waiting for a refit. A refit retires the register, because a fresh fit already
//! reflects everything the feed reported.
//!
//! An entity's *standing* is what its newest feed event implies for serving. Events that remove the
//! entity from the served corpus - a purge, a present ending without a successor, or an archived
//! edition becoming current - write [`Standing::Withdrawn`], and every other event writes
//! [`Standing::Live`] carrying the edition it observed. Because an unarchive is an ordinary update
//! whose edition is not archived, it replaces a tombstone with a live standing through the same
//! fold, with no special case.
//!
//! [`DeltaRegister`] holds the newest standing per identity, last-writer-wins on the event's
//! transaction time. The fold takes the maximum by version, breaking ties by standing rank and then
//! by edition between two live standings. The maximum makes the fold order-independent, so a
//! post-restart replay converges to the incremental register it replaces however equal-key events
//! interleave.
//!
//! An arrival's *classification* is the node-versus-link verdict ([`Classification`]) a batched
//! store lookup returns for it. The register holds the first verdict per identity for the
//! process's lifetime and never replaces it. Endpoint rows are immutable and an edition change
//! cannot flip the link category, so a re-read buys nothing. An arrival without a verdict serves
//! nothing and enters no pipeline, and the lookup retries at the next poll, so a failed read
//! degrades arrival freshness and nothing else while publication proceeds and the watermark
//! advances.
//!
//! An arrival's *placement* ([`ProjectedArrival`]) is the wire coordinate the staging arm
//! projects for it through the generation's own publish path. The register keeps the first
//! placement per identity and never replaces it: a later edition moves the coordinate nowhere.
//! The refit recalibrates placements exactly as it recalibrates fitted rows, whose coordinates
//! are also fit-time content and often editions old. A placement recorded while the identity
//! stands withdrawn serves nothing, and an unarchive republishes the recorded coordinate at its
//! next publication.
//!
//! An arrival's *slot* is the row id its first placement takes: the next id past the accepted
//! [`Universe`], assigned in placement order. The register never reassigns or reuses a slot,
//! withdrawal included, so a row a proof admitted cannot change meaning while that proof can
//! answer, and an unarchived identity serves from its own former slot. Slot order and
//! level-of-detail ranking order are distinct contracts, and neither derives from the other. The
//! wire permutation covers the whole `u32` range, so widening the accepted universe preserves
//! every existing wire id. A placement that would grow the universe past that range refuses as
//! [`UniverseExhausted`] and the arrival stays staged.
//!
//! A [`DeltaEpoch`] names one register's lifetime. Slot assignment is process-local and a
//! replay does not reproduce placement order, so a wire id minted under one register must not
//! resolve under another. Consumer initialization draws a fresh epoch, the token authority seals
//! it into every token it mints, and a token sealed under any other epoch receives the uniform
//! authorization refusal. A restart is therefore a new epoch by construction: old slot mappings
//! die with the process instead of quietly renaming entities.
//!
//! [`DeltaRegister::snapshot`] publishes the fold as an immutable [`DeltaSnapshot`], resolving each identity against the generation's [`IdentityTables`]:
//!
//! - Withdrawn and fitted: the identity enters the withdrawn set, and its node or edge row enters
//!   the matching row bitset - what admission subtraction reads per request and a scoped cache
//!   entry folds out of its masks at resolution.
//! - Withdrawn and unfitted: the identity enters the withdrawn set alone. No generation row exists
//!   to subtract, and a retained cohort can still hold the identity, so membership in the set never
//!   depends on generation fitness.
//! - Live and fitted: nothing resolves. The generation already publishes the entity, and the
//!   register entry exists to outrank older events and to clear a former tombstone.
//! - Live and unfitted: an arrival, resolved through its held classification. A node without a
//!   placement stages with its edition, a node with one publishes its recorded wire coordinate
//!   under its newest edition, and a complete link publishes with its endpoint identities. An
//!   arrival holding no verdict, and a link missing an endpoint, publish nowhere.
//!
//! # Determinism
//!
//! A request loads one snapshot through [`DeltaCell::load`] and reads that one at every admission
//! in its answer, so the delta-sensitive assembly stays a pure function of the generation, the
//! request, the visibility proof, and the snapshot. A cache promising current delta semantics
//! applies the snapshot after lookup rather than carrying [`DeltaSnapshot::revision`] in its key.
//!
//! # Freshness
//!
//! A snapshot reflects the feed up to [`DeltaSnapshot::watermark`] rather than the store's present.
//! The clock model and the safety lag a consumer subtracts live with the feed,
//! [`PostgresStore::entity_events_since`], together with the writers the feed cannot represent.
//! Erase and snapshot restore move the store in ways a watermark never revisits, so reconciliation
//! against the store - today, the refit - bounds how long a fold can stay wrong.
//!
//! [`PostgresStore::entity_events_since`]: hash_graph_postgres_store::store::PostgresStore::entity_events_since
#![expect(
    clippy::empty_enums,
    reason = "zerocopy's FromBytes derive expands to an empty enum for its validation machinery"
)]

use alloc::sync::Arc;
use core::{
    cmp::Ordering,
    fmt,
    ops::{BitOr, BitOrAssign},
};

use arc_swap::{ArcSwapOption, Guard};
use hash_graph_postgres_store::store::EntityEvent;
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use hashql_core::collections::{
    FastHashMap, FastHashMapEntry, FastHashSet, fast_hash_map, fast_hash_set,
};
use rand::TryCryptoRng;
use type_system::knowledge::entity::id::EntityEditionId;

use self::overlay::IdentityTableOverlay;
use super::codec::Universe;
use crate::{
    bitset::CompressedBitSet,
    dataset::auxiliary::{Label, Legend, OwnedLabel, OwnedLegend},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::Vec2,
    postgres::{
        Classification,
        id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
    },
};

pub(crate) mod consumer;
pub(crate) mod overlay;
mod placement;
pub(crate) mod staging;

pub(crate) use self::placement::{PlacementError, Placer};

#[cfg(test)]
mod tests;

/// Where an entity stands in the served corpus, per its newest feed event.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Standing {
    /// The entity's published present is current under the carried edition.
    Live {
        /// The edition current at the event, read in the same store snapshot that observed the
        /// change.
        edition: EntityEditionId,
    },
    /// The entity left the served corpus: purged, its present ended, or its current edition
    /// archived.
    Withdrawn,
}

impl Standing {
    /// Returns the tie rank at equal versions, where a withdrawal outranks a live standing.
    ///
    /// Equal-version conflicting standings are a writer-clock pathology, and the rank resolves the
    /// tie toward [`Standing::Withdrawn`], failing closed in the direction the register exists for.
    const fn rank(self) -> u8 {
        match self {
            Self::Live { .. } => 0,
            Self::Withdrawn => 1,
        }
    }
}

/// One feed event resolved into the standing it implies for serving.
///
/// Conversion is the one place feed vocabulary becomes register vocabulary. A purge and an ended
/// present withdraw the entity at the event's own time, and an update decides between a live
/// standing and a withdrawal by the archived flag its edition carries, resolved inside the feed
/// statement itself.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct DeltaEvent {
    /// The entity whose standing the event states.
    entity: ArchivedEntityId,
    /// When the change occurred, on the transaction-time axis.
    version: Timestamp<TransactionTime>,
    /// The standing the event leaves the entity in.
    standing: Standing,
}

impl From<&EntityEvent> for DeltaEvent {
    fn from(event: &EntityEvent) -> Self {
        match event {
            EntityEvent::Updated(update) => Self {
                entity: update.entity.into(),
                version: update.changed_at,
                standing: if update.archived {
                    Standing::Withdrawn
                } else {
                    Standing::Live {
                        edition: update.edition,
                    }
                },
            },
            EntityEvent::Ended(end) => Self {
                entity: end.entity.into(),
                version: end.ended_at,
                standing: Standing::Withdrawn,
            },
            EntityEvent::Deleted(deletion) => Self {
                entity: deletion.entity.into(),
                version: deletion.provenance.deleted_at_transaction_time,
                standing: Standing::Withdrawn,
            },
        }
    }
}

/// The newest applied event's version and standing, for one identity.
#[derive(Debug, Copy, Clone)]
struct AppliedEvent {
    /// The applied event's transaction time.
    version: Timestamp<TransactionTime>,
    /// The applied event's standing.
    standing: Standing,
}

impl AppliedEvent {
    /// Returns whether this event replaces `incumbent` under the fold.
    ///
    /// The comparison is the fold's total order: version, then standing rank, then edition between
    /// two live standings. An event never supersedes an equal one, which is what makes
    /// re-delivery idempotent.
    fn supersedes(&self, incumbent: &Self) -> bool {
        match self.version.cmp(&incumbent.version) {
            Ordering::Greater => true,
            Ordering::Less => false,
            Ordering::Equal => match (self.standing, incumbent.standing) {
                (Standing::Withdrawn, Standing::Live { .. }) => true,
                (Standing::Withdrawn | Standing::Live { .. }, Standing::Withdrawn) => false,
                (
                    Standing::Live { edition },
                    Standing::Live {
                        edition: incumbent_edition,
                    },
                ) => edition > incumbent_edition,
            },
        }
    }
}

/// One register lifetime's name, sealed into every authority token minted while it lives.
///
/// The value is random rather than derived, so two register lifetimes over one generation match
/// only by a collision of 128 fresh bits. Equality is the whole interface: the token authority
/// seals the epoch it holds and refuses any other at open.
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::ByteEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct DeltaEpoch([u8; 16]);

impl DeltaEpoch {
    /// Draws a fresh epoch.
    ///
    /// # Errors
    ///
    /// Returns the generator's error when the draw fails: entropy failure refuses initialization
    /// rather than starting a register lifetime under a predictable name.
    pub(crate) fn fresh<R: TryCryptoRng>(rng: &mut R) -> Result<Self, R::Error> {
        let mut bytes = [0_u8; 16];
        rng.try_fill_bytes(&mut bytes)?;
        Ok(Self(bytes))
    }
}

/// One publication of the register, in publication order.
///
/// The revision names a publication in the determinism contract: response bytes are identical for
/// an identical generation, request, visibility proof, and snapshot revision.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct DeltaRevision(u64);

impl DeltaRevision {
    /// The first publication's revision.
    pub(crate) const FIRST: Self = Self(0);

    /// Returns the revision following this one.
    #[must_use]
    pub(crate) const fn next(self) -> Self {
        Self(self.0 + 1)
    }
}

/// The serving generation's identity tables, as publication resolves against them.
///
/// The register keys by entity identity while subtraction runs in row space, so publication
/// resolves each identity into the generation's row domains. An identity the generation never
/// fitted resolves in neither domain. The node and edge domains are disjoint, the fit's own scope
/// law excluding link-typed entities from the node scope, so an identity resolves in at most one.
pub(crate) trait IdentityTables {
    /// Returns the node row carrying `id`, or [`None`] when the generation fitted none.
    fn node_row_of(&self, id: ArchivedEntityId) -> Option<NodeRowId>;

    /// Returns the edge row carrying `id`, or [`None`] when the generation fitted none.
    fn edge_row_of(&self, id: ArchivedEntityId) -> Option<EdgeRowId>;

    /// Returns the ontology row carrying `id`, or [`None`] when the generation tabulated none.
    fn ontology_row_of(&self, id: ArchivedOntologyTypeUuid) -> Option<OntologyRowId>;
}

/// One arrival's projection, recorded at its first success and awaiting its row.
///
/// The coordinate is in the wire frame, the domain every served response speaks. The edition is
/// the one whose stored embedding produced the coordinate, which a later edition never moves, so
/// the pair records exactly what the projection read. The display parts travel beside the
/// coordinate, read from the same edition's cached row, and share the coordinate's staleness
/// class: a later edition moves neither, and the refit repairs both. The representative type
/// stays a store uuid here, because the register resolves it into its ontology row at placement,
/// where the row fact is established.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ProjectedArrival {
    /// The edition whose embedding the projection read.
    pub edition: EntityEditionId,
    /// The projected coordinate, normalized into the wire frame.
    pub position: Vec2,
    /// The display label read beside the coordinate.
    pub label: OwnedLabel,
    /// The representative type read beside the coordinate.
    pub representative: ArchivedOntologyTypeUuid,
}

/// A placed arrival as publication serves it, carrying its row, coordinate, and legend.
///
/// The coordinate is the identity's first successful projection, which a later edition never
/// moves. The edition is the newest the feed observed, the key detail reads resolve through.
/// The row is the one the identity's first placement allocated, fixed for the register's
/// lifetime. The legend is the placement's capture, sharing the coordinate's staleness class.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct DeltaNode {
    /// The arrival's row id in the extended universe.
    pub id: NodeRowId,
    /// The arrival's newest feed edition.
    pub edition: EntityEditionId,
    /// The frozen coordinate, normalized into the wire frame.
    pub position: Vec2,
    /// The display payload captured at placement.
    pub legend: OwnedLegend,
}

impl DeltaNode {
    fn with_edition(self, edition: EntityEditionId) -> Self {
        Self { edition, ..self }
    }
}

/// One identity's captured legend, keyed to the edition the capture read.
///
/// The edition decides staleness. A register edition past the captured one lists the identity
/// for a fresh capture at the next poll, and the newest capture serves meanwhile, exactly as a
/// placement's coordinate serves until refit.
#[derive(Debug, Clone)]
struct EditionLegend {
    /// The edition the capture read.
    edition: EntityEditionId,
    /// The legend the read answered.
    legend: OwnedLegend,
}

/// A refusal to allocate a row past the domain its holder can carry.
///
/// For node rows the bound is the wire codec's `u32` row domain, enforced at the register's
/// allocation site. For every row domain the id type's own end bounds allocation last. The
/// refusal fails closed. The allocation records nothing and the arrival stays staged. Every
/// later first allocation refuses the same way until a refit retires the register.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct UniverseExhausted;

impl fmt::Display for UniverseExhausted {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("the accepted universe is at its row domain's bound")
    }
}

impl core::error::Error for UniverseExhausted {}

/// A live post-fit link, published with its endpoint identities.
///
/// The endpoints are entity identities rather than generation rows, because a link can attach
/// entities the generation never fitted. The edition is the link's newest feed edition, the key
/// its detail reads resolve through.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct DeltaEdge {
    /// The link's newest feed edition.
    pub edition: EntityEditionId,
    /// The left attachment's endpoint.
    pub source: ArchivedEntityId,
    /// The right attachment's endpoint.
    pub target: ArchivedEntityId,
}

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
    revision: DeltaRevision,
    /// The feed position the register had folded through at publication.
    watermark: Timestamp<TransactionTime>,
    /// Every withdrawn identity, fitted or not.
    withdrawn: FastHashSet<ArchivedEntityId>,
    /// The withdrawn identities' node rows in the serving generation.
    withdrawn_nodes: CompressedBitSet<NodeRowId>,
    /// The withdrawn identities' edge rows in the serving generation.
    withdrawn_edges: CompressedBitSet<EdgeRowId>,
    /// The node-classified arrivals awaiting placement, keyed to their newest feed edition.
    staged: FastHashMap<ArchivedEntityId, EntityEditionId>,
    /// The published nodes, carrying their recorded wire coordinates.
    nodes: FastHashMap<ArchivedEntityId, DeltaNode>,
    /// The link-classified arrivals with complete attachment pairs.
    edges: FastHashMap<ArchivedEntityId, DeltaEdge>,
    /// One captured legend per published link and per live fitted identity whose capture read
    /// has answered. A revised fitted identity with no capture stays absent here and answers
    /// from the fit-time payload.
    legends: FastHashMap<ArchivedEntityId, OwnedLegend>,
    /// Every allocated node row beside the accepted universe, as this publication froze them.
    node_rows: IdentityTableOverlay<ArchivedEntityId, NodeRowId>,
    /// The ontology rows allocated for types the generation never tabulated, as this
    /// publication froze them.
    ontology_rows: IdentityTableOverlay<ArchivedOntologyTypeUuid, OntologyRowId>,
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
}

/// The register's disposition of one delivered classification verdict or frozen placement.
///
/// Publication's resolution input changes on [`Disposition::Resolving`] alone, and
/// [`Disposition::changes_resolution`] reads exactly that. Dispositions join through `|` into
/// the strongest one delivered, with [`Disposition::AlreadyHeld`] as the neutral element.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Disposition {
    /// Newly held for a live arrival, so publication's resolution input changed.
    Resolving,
    /// Newly held for an identity not standing live, so resolution stays unchanged until the
    /// feed reports the identity live.
    Dormant,
    /// A holding for the identity already stood, so the delivery recorded nothing.
    AlreadyHeld,
}

impl Disposition {
    /// Returns whether this disposition changed publication's resolution input.
    #[must_use]
    pub(crate) const fn changes_resolution(self) -> bool {
        matches!(self, Self::Resolving)
    }
}

impl BitOr for Disposition {
    type Output = Self;

    /// Joins two dispositions into the stronger one, by resolution strength.
    ///
    /// [`Disposition::Resolving`] absorbs, [`Disposition::AlreadyHeld`] is the neutral element,
    /// and [`Disposition::Dormant`] sits between, so a fold over a batch answers whether any
    /// delivery resolved while still recording that a new holding exists. The joined value's
    /// consumed meaning is [`Disposition::changes_resolution`] alone; the Dormant-over-held
    /// preference keeps the new-holding fact in the value, which no consumer reads yet.
    fn bitor(self, rhs: Self) -> Self {
        match (self, rhs) {
            (Self::Resolving, _) | (_, Self::Resolving) => Self::Resolving,
            (Self::Dormant, _) | (_, Self::Dormant) => Self::Dormant,
            (Self::AlreadyHeld, Self::AlreadyHeld) => Self::AlreadyHeld,
        }
    }
}

impl BitOrAssign for Disposition {
    fn bitor_assign(&mut self, rhs: Self) {
        *self = *self | rhs;
    }
}

/// The mutable fold of the feed since the generation's fit-time snapshot.
///
/// One [`AppliedEvent`] per identity, last-writer-wins on the event's transaction time. The map
/// grows with the distinct identities the feed has reported, and a refit retires it along with
/// the generation whose delta it states.
#[derive(Debug)]
pub(crate) struct DeltaRegister {
    /// The newest applied event per identity.
    applied: FastHashMap<ArchivedEntityId, AppliedEvent>,
    /// The held classification verdict per identity, insert-only.
    classifications: FastHashMap<ArchivedEntityId, Classification>,
    /// The published node payload per placed identity, insert-only.
    placements: FastHashMap<ArchivedEntityId, DeltaNode>,
    /// The captured legend per identity, replaced when a newer edition's capture lands.
    legends: FastHashMap<ArchivedEntityId, EditionLegend>,
    /// Every allocated node row beside the accepted universe the allocations grew.
    node_rows: IdentityTableOverlay<ArchivedEntityId, NodeRowId>,
    /// The ontology rows allocated for types the generation never tabulated.
    ontology_rows: IdentityTableOverlay<ArchivedOntologyTypeUuid, OntologyRowId>,
}

impl DeltaRegister {
    /// Builds an empty register over a generation whose row universes are `nodes` and `ontology`.
    ///
    /// Row allocation starts at each bound, so the first placement takes the first node row past
    /// the generation's fitted rows, and the first unknown type takes the first ontology row past
    /// the generation's tabulated types.
    pub(crate) fn new(nodes: Universe<NodeRowId>, ontology: Universe<OntologyRowId>) -> Self {
        Self {
            applied: fast_hash_map(),
            classifications: fast_hash_map(),
            placements: fast_hash_map(),
            legends: fast_hash_map(),
            node_rows: IdentityTableOverlay::new(nodes),
            ontology_rows: IdentityTableOverlay::new(ontology),
        }
    }

    /// Applies one event, returning whether publication's resolution input changed.
    ///
    /// The fold is last-writer-wins per identity. An event that supersedes the held register under
    /// the total order replaces it. Every other event changes nothing, because the register already
    /// reflects a later state of the same entity, and re-delivery of an already-applied event is
    /// idempotent.
    ///
    /// The return value is the publication decision's input: `true` when an identity arrives, a
    /// standing flips, or a live standing's edition moves, and `false` when only the version moved.
    /// The signal over-approximates, because a new live identity the generation fitted resolves to
    /// nothing, so a poll acting on it publishes a snapshot equivalent to the held one. A poll
    /// whose applications all return `false` can skip publishing.
    pub(crate) fn apply(
        &mut self,
        DeltaEvent {
            entity,
            version,
            standing,
        }: DeltaEvent,
    ) -> bool {
        let challenger = AppliedEvent { version, standing };

        match self.applied.entry(entity) {
            FastHashMapEntry::Vacant(slot) => {
                slot.insert(challenger);
                true
            }
            FastHashMapEntry::Occupied(mut slot) => {
                let incumbent = *slot.get();
                if !challenger.supersedes(&incumbent) {
                    return false;
                }

                slot.insert(challenger);
                incumbent.standing != standing
            }
        }
    }

    /// Iterates the live arrivals holding no classification verdict.
    ///
    /// An arrival is a live identity the generation never fitted. A withdrawn identity never
    /// lists, because it serves nothing whatever its category, and the feed's own withdrawal is
    /// what resolves an arrival whose present ended between its event and a lookup. A fitted
    /// identity never lists, because the generation's tables already decide its category.
    pub(crate) fn unclassified(
        &self,
        tables: &impl IdentityTables,
    ) -> impl Iterator<Item = ArchivedEntityId> {
        self.applied
            .iter()
            .filter(|&(entity, applied)| {
                matches!(applied.standing, Standing::Live { .. })
                    && !self.classifications.contains_key(entity)
                    && tables.node_row_of(*entity).is_none()
                    && tables.edge_row_of(*entity).is_none()
            })
            .map(|(&entity, _)| entity)
    }

    /// Holds one classification verdict, returning the register's disposition of it.
    ///
    /// The first verdict per identity holds for the process's lifetime, and a later verdict for
    /// the same identity changes nothing, so re-delivery of a verdict is idempotent and comes
    /// back [`Disposition::AlreadyHeld`]. A newly held verdict is [`Disposition::Resolving`]
    /// exactly when the identity stands live, because only a live arrival resolves through its
    /// classification at publication, and [`Disposition::Dormant`] otherwise.
    pub(crate) fn classify(
        &mut self,
        entity: ArchivedEntityId,
        verdict: Classification,
    ) -> Disposition {
        match self.classifications.entry(entity) {
            FastHashMapEntry::Vacant(slot) => {
                slot.insert(verdict);
                if matches!(
                    self.applied.get(&entity),
                    Some(AppliedEvent {
                        standing: Standing::Live { .. },
                        ..
                    })
                ) {
                    Disposition::Resolving
                } else {
                    Disposition::Dormant
                }
            }
            FastHashMapEntry::Occupied(_) => Disposition::AlreadyHeld,
        }
    }

    /// Lists the identities whose current edition no captured legend matches, each with the
    /// edition to read.
    ///
    /// An identity lists when its legend capture is stale or absent and serving consults it or
    /// will. Fitted identities list, since a post-fit edition revises the baked legend, and so
    /// does a link-classified arrival with a complete attachment pair, since publication
    /// withholds an uncaptured link. A fitted node's capture has no serving reader yet - the
    /// edges trailer asks only for links - and exists for the tile and locate label overlay that
    /// will read request-time legends through the register, so narrowing the listing to links
    /// would leave that overlay nothing to read. Node-classified arrivals never list, because
    /// staging reads their displays before placement, and neither does a withdrawn identity,
    /// which serves nothing.
    pub(crate) fn pending_captures(
        &self,
        tables: &impl IdentityTables,
    ) -> impl Iterator<Item = (ArchivedEntityId, EntityEditionId)> {
        self.applied.iter().filter_map(move |(&entity, applied)| {
            let Standing::Live { edition } = applied.standing else {
                return None;
            };
            if let Some(captured) = self.legends.get(&entity)
                && captured.edition == edition
            {
                return None;
            }

            let fitted =
                tables.node_row_of(entity).is_some() || tables.edge_row_of(entity).is_some();
            let serving_link = matches!(
                self.classifications.get(&entity),
                Some(Classification::Edge {
                    source: Some(_),
                    target: Some(_),
                })
            );

            (fitted || serving_link).then_some((entity, edition))
        })
    }

    /// Holds one captured legend, keyed to the edition its read answered.
    ///
    /// The newest capture replaces the held one, because a capture for an edition the register
    /// has moved past lists the identity again at the next poll, and the held legend serves
    /// meanwhile. The representative type resolves into its ontology row here: the generation's
    /// table answers a tabulated type, and the register's own extension answers or allocates for
    /// one the generation never saw.
    ///
    /// # Errors
    ///
    /// Returns [`UniverseExhausted`] when the ontology row domain has no next row to allocate.
    /// The capture records nothing and the identity lists again at the next poll.
    pub(crate) fn capture_display(
        &mut self,
        entity: ArchivedEntityId,
        edition: EntityEditionId,
        label: &Label,
        representative: ArchivedOntologyTypeUuid,
        tables: &impl IdentityTables,
    ) -> Result<(), UniverseExhausted> {
        let representative = tables
            .ontology_row_of(representative)
            .or_else(|| self.ontology_rows.resolve(representative))
            .ok_or(UniverseExhausted)?;

        self.legends.insert(
            entity,
            EditionLegend {
                edition,
                legend: OwnedLegend::new(representative, label),
            },
        );
        Ok(())
    }

    /// Holds one placement, returning the register's disposition of it.
    ///
    /// The first placement per identity takes the next row past the accepted universe and holds
    /// for the process's lifetime. A later placement for the same identity changes nothing,
    /// because the coordinate and the row never move, so re-delivery of a placement is
    /// idempotent and comes back [`Disposition::AlreadyHeld`]. A placement for an identity
    /// standing withdrawn records all the same, so an unarchive republishes the recorded
    /// coordinate on its former row. A newly held placement is [`Disposition::Resolving`]
    /// exactly when the identity stands live, because only a live arrival resolves through its
    /// placement at publication, and [`Disposition::Dormant`] otherwise.
    ///
    /// The arrival's representative type resolves into its ontology row here, exactly as
    /// [`Self::capture_display`] resolves one, so the published node's legend speaks the row
    /// domain every fitted legend speaks.
    ///
    /// # Errors
    ///
    /// Returns [`UniverseExhausted`] when one more node row would grow the accepted universe past
    /// the wire codec's `u32` row domain, or when the ontology row domain has no next row to
    /// allocate. The placement records nothing and the arrival stays staged.
    pub(crate) fn place(
        &mut self,
        entity: ArchivedEntityId,
        &ProjectedArrival {
            edition,
            position,
            ref label,
            representative: representative_type_uuid,
        }: &ProjectedArrival,
        tables: &impl IdentityTables,
    ) -> Result<Disposition, UniverseExhausted> {
        if self.placements.contains_key(&entity) {
            return Ok(Disposition::AlreadyHeld);
        }

        // The codec permutes node rows over u32, so a row past that domain could never encode.
        // The refusal sits before any allocation, which keeps a refused placement free of side
        // effects in the node domain.
        if self.node_rows.universe().size() > u32::MAX as usize {
            return Err(UniverseExhausted);
        }

        let representative = tables
            .ontology_row_of(representative_type_uuid)
            .or_else(|| self.ontology_rows.resolve(representative_type_uuid))
            .ok_or(UniverseExhausted)?;
        let id = self.node_rows.resolve(entity).ok_or(UniverseExhausted)?;

        self.placements.insert(
            entity,
            DeltaNode {
                id,
                edition,
                position,
                legend: OwnedLegend::new(representative, label),
            },
        );

        Ok(
            if matches!(
                self.applied.get(&entity),
                Some(AppliedEvent {
                    standing: Standing::Live { .. },
                    ..
                })
            ) {
                Disposition::Resolving
            } else {
                Disposition::Dormant
            },
        )
    }

    /// Estimates the fold's resident bytes.
    ///
    /// A weighted estimate for replay telemetry rather than an allocator-faithful ceiling: the
    /// event, classification, placement, and legend maps' heap allocations, the captured legends'
    /// bytes on both holders, and the row-domain extensions.
    #[must_use]
    pub(crate) fn resident_estimate(&self) -> usize {
        let placement_legends: usize = self
            .placements
            .values()
            .map(|node| node.legend.heap_bytes())
            .sum::<u64>()
            .saturating_cast();
        let captured_legends: usize = self
            .legends
            .values()
            .map(|captured| captured.legend.heap_bytes())
            .sum::<u64>()
            .saturating_cast();

        self.applied.allocation_size()
            + self.classifications.allocation_size()
            + self.placements.allocation_size()
            + self.legends.allocation_size()
            + self.node_rows.resident_estimate()
            + self.ontology_rows.resident_estimate()
            + placement_legends
            + captured_legends
    }

    /// Publishes the fold as an immutable snapshot resolved against `tables`.
    ///
    /// `revision` and `watermark` are the publisher's: the revision names this publication in
    /// publication order, and the watermark is the feed position the publisher had folded through
    /// when it published.
    ///
    /// # Panics
    ///
    /// This panics when `tables` resolves an identity to a row above the row bitsets' representable
    /// domain, which is an implementor bug rather than feed data.
    #[must_use]
    pub(crate) fn snapshot(
        &self,
        tables: &impl IdentityTables,
        revision: DeltaRevision,
        watermark: Timestamp<TransactionTime>,
    ) -> DeltaSnapshot {
        let mut withdrawn = fast_hash_set();
        let mut withdrawn_nodes = CompressedBitSet::new();
        let mut withdrawn_edges = CompressedBitSet::new();
        let mut staged = fast_hash_map();
        let mut nodes = fast_hash_map();
        let mut edges = fast_hash_map();
        let mut legends = fast_hash_map();

        for (&entity, applied) in &self.applied {
            match applied.standing {
                Standing::Withdrawn => {
                    withdrawn.insert(entity);

                    if let Some(row) = tables.node_row_of(entity) {
                        withdrawn_nodes.insert(row);
                    } else if let Some(row) = tables.edge_row_of(entity) {
                        withdrawn_edges.insert(row);
                    } else {
                        // An unfitted withdrawal has no generation row to subtract, and the
                        // identity set above already carries it.
                    }
                }
                Standing::Live { edition } => {
                    if tables.node_row_of(entity).is_some() || tables.edge_row_of(entity).is_some()
                    {
                        // A fitted identity with a post-fit edition revises its baked legend:
                        // the captured legend publishes, and holders read it map-first. A
                        // revision the read has not yet answered keeps answering from what
                        // the holder already reads - the previous capture, or the fit-time
                        // payload when the register never captured one - until its capture
                        // read lands.
                        if let Some(captured) = self.legends.get(&entity) {
                            legends.insert(entity, captured.legend.clone());
                        }
                    } else {
                        match self.classifications.get(&entity) {
                            Some(Classification::Node) => {
                                if let Some(node) = self.placements.get(&entity) {
                                    nodes.insert(entity, node.clone().with_edition(edition));
                                } else {
                                    staged.insert(entity, edition);
                                }
                            }
                            Some(&Classification::Edge {
                                source: Some(source),
                                target: Some(target),
                            }) => {
                                // Publication withholds an uncaptured link, so every published
                                // link's detail answers from the snapshot rather than a
                                // request-time read. A link normally publishes in its first
                                // poll: `poll` classifies and then captures in one call, and
                                // the capture reads the classification recorded a step
                                // earlier. A one-poll wait happens only when the capture's
                                // edition-display read fails, and the link publishes on the
                                // poll after the read recovers.
                                if let Some(captured) = self.legends.get(&entity) {
                                    edges.insert(
                                        entity,
                                        DeltaEdge {
                                            edition,
                                            source,
                                            target,
                                        },
                                    );
                                    legends.insert(entity, captured.legend.clone());
                                }
                            }
                            Some(Classification::Edge { .. }) | None => {
                                // An unclassified arrival and a link with an incomplete
                                // attachment pair publish nowhere: nothing serves until a
                                // verdict supplies the data to serve it.
                            }
                        }
                    }
                }
            }
        }

        DeltaSnapshot {
            revision,
            watermark,
            withdrawn,
            withdrawn_nodes,
            withdrawn_edges,
            staged,
            nodes,
            edges,
            legends,
            node_rows: self.node_rows.clone(),
            ontology_rows: self.ontology_rows.clone(),
        }
    }
}

/// The published snapshot, as requests load it.
///
/// One cell serves one generation. A publication swaps the held snapshot whole, and a load clones
/// the [`Arc`], so a request reads one snapshot across its whole answer however many publications
/// land while it runs. A cell holding [`None`] means no poll has completed, and a request subtracts
/// nothing and pays nothing.
#[derive(Debug, Default)]
pub(crate) struct DeltaCell {
    /// The current publication.
    snapshot: ArcSwapOption<DeltaSnapshot>,
}

impl DeltaCell {
    /// Returns the current publication, or [`None`] before the first.
    pub(crate) fn load(&self) -> Guard<Option<Arc<DeltaSnapshot>>> {
        self.snapshot.load()
    }

    /// Returns an owned handle on the current publication, or [`None`] before the first.
    ///
    /// The owned handle pins one publication for as long as the caller holds it, the shape a
    /// whole request reads through. A read that ends before its next await point takes
    /// [`Self::load`] instead, whose guard is cheaper than the reference-count round trip.
    pub(crate) fn load_full(&self) -> Option<Arc<DeltaSnapshot>> {
        self.snapshot.load_full()
    }

    /// Publishes `snapshot`, replacing the held publication.
    pub(crate) fn publish(&self, snapshot: DeltaSnapshot) {
        self.snapshot.store(Some(Arc::new(snapshot)));
    }
}
