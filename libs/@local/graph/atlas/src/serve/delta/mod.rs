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
//! An arrival's *placement* ([`FrozenPlacement`]) is the wire coordinate the staging arm projects
//! for it through the generation's own publish path. The register keeps the first placement per
//! identity and never replaces it. The coordinate freezes at first successful placement, and a
//! later edition moves it nowhere. The refit recalibrates placements exactly as it recalibrates
//! fitted rows, whose coordinates are also fit-time content and often editions old. A placement
//! recorded while the identity stands withdrawn serves nothing, and an unarchive republishes the
//! frozen coordinate at its next publication.
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
//!   placement stages with its edition, a placed node publishes its frozen wire coordinate under
//!   its newest edition, and a complete link publishes with its endpoint identities. An arrival
//!   holding no verdict, and a link missing an endpoint, publish nowhere.
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
use hashql_core::{
    collections::{FastHashMap, FastHashMapEntry, FastHashSet, fast_hash_map, fast_hash_set},
    id::Id as _,
};
use rand::TryCryptoRng;
use type_system::knowledge::entity::id::EntityEditionId;

use super::codec::Universe;
use crate::{
    bitset::CompressedBitSet,
    identity::{EdgeRowId, NodeRowId},
    math::Vec2,
    postgres::{Classification, EditionDisplay, id::ArchivedEntityId},
};

pub(crate) mod consumer;
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
struct Register {
    /// The applied event's transaction time.
    version: Timestamp<TransactionTime>,
    /// The applied event's standing.
    standing: Standing,
}

impl Register {
    /// Returns whether this register replaces `held` under the fold.
    ///
    /// The comparison is the fold's total order: version, then standing rank, then edition between
    /// two live standings. A register never supersedes an equal one, which is what makes
    /// re-delivery idempotent.
    fn supersedes(&self, held: &Self) -> bool {
        match self.version.cmp(&held.version) {
            Ordering::Greater => true,
            Ordering::Less => false,
            Ordering::Equal => match (self.standing, held.standing) {
                (Standing::Withdrawn, Standing::Live { .. }) => true,
                (Standing::Withdrawn | Standing::Live { .. }, Standing::Withdrawn) => false,
                (
                    Standing::Live { edition },
                    Standing::Live {
                        edition: held_edition,
                    },
                ) => edition > held_edition,
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
}

/// One arrival's frozen placement, recorded at its first successful projection.
///
/// The coordinate is in the wire frame, the domain every served response speaks. The edition is
/// the one whose stored embedding produced the coordinate, which a later edition never moves, so
/// the pair records exactly what the projection read. The display payload travels beside the
/// coordinate, captured from the same edition's cached row, and shares the coordinate's
/// staleness class: a later edition moves neither, and the refit repairs both.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct FrozenPlacement {
    /// The edition whose embedding the projection read.
    pub edition: EntityEditionId,
    /// The projected coordinate, normalized into the wire frame.
    pub wire: Vec2,
    /// The display payload captured beside the coordinate.
    pub display: EditionDisplay,
}

/// A placed arrival, published for serving.
///
/// The coordinate is the identity's frozen placement. The edition is the newest the feed
/// observed, the key detail reads resolve through, exactly as the staged projection carries it.
/// The slot is the row id the identity's first placement took, fixed for the register's
/// lifetime. The display payload is the placement's capture, frozen with the coordinate.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct PlacedArrival {
    /// The arrival's newest feed edition.
    pub edition: EntityEditionId,
    /// The frozen coordinate, normalized into the wire frame.
    pub wire: Vec2,
    /// The arrival's row id in the extended universe.
    pub slot: NodeRowId,
    /// The display payload captured at placement.
    pub display: EditionDisplay,
}

/// One identity's frozen placement and the slot its first placement took.
#[derive(Debug, Clone)]
struct HeldPlacement {
    /// The row id the first placement allocated, never reassigned.
    slot: NodeRowId,
    /// The frozen projection.
    frozen: FrozenPlacement,
}

/// A refusal to allocate the slot that would grow the accepted universe past the wire's `u32`
/// row domain.
///
/// The refusal fails closed. The placement records nothing, the arrival stays staged, and every
/// later first placement refuses the same way until a refit retires the register.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct UniverseExhausted;

impl fmt::Display for UniverseExhausted {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("the accepted universe is at the wire's u32 row domain")
    }
}

impl core::error::Error for UniverseExhausted {}

/// A live post-fit link, published with its endpoint identities.
///
/// The endpoints are entity identities rather than generation rows, because a link can attach
/// entities the generation never fitted. The edition is the link's newest feed edition, the key
/// its detail reads resolve through.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct DeltaLink {
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
/// nothing until a verdict arrives. The placed identities carry their frozen wire coordinates and
/// slots, ready to serve wherever the caller's cohort admits them.
#[derive(Debug, PartialEq)]
pub(crate) struct DeltaSnapshot {
    /// This publication's position in publication order.
    revision: DeltaRevision,
    /// The feed position the register had folded through at publication.
    watermark: Timestamp<TransactionTime>,
    /// The accepted row universe at publication: fitted rows and every allocated slot.
    universe: Universe,
    /// Every withdrawn identity, fitted or not.
    withdrawn: FastHashSet<ArchivedEntityId>,
    /// The withdrawn identities' node rows in the serving generation.
    nodes: CompressedBitSet<NodeRowId>,
    /// The withdrawn identities' edge rows in the serving generation.
    edges: CompressedBitSet<EdgeRowId>,
    /// The node-classified arrivals awaiting placement, keyed to their newest feed edition.
    staged: FastHashMap<ArchivedEntityId, EntityEditionId>,
    /// The placed arrivals, carrying their frozen wire coordinates.
    placed: FastHashMap<ArchivedEntityId, PlacedArrival>,
    /// The placed arrivals' identities by slot: the wire-ingress reverse index.
    slots: FastHashMap<NodeRowId, ArchivedEntityId>,
    /// The link-classified arrivals with complete attachment pairs.
    links: FastHashMap<ArchivedEntityId, DeltaLink>,
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
    /// The bound covers every allocated slot whatever its holder's standing, so a wire id a
    /// retained proof admitted keeps decoding to the same row. A request takes this one value at
    /// every encode and decode in its answer.
    #[must_use]
    pub(crate) const fn universe(&self) -> Universe {
        self.universe
    }

    /// Returns whether the snapshot withdraws the entity `id` names, fitted or not.
    #[must_use]
    pub(crate) fn withdraws(&self, id: ArchivedEntityId) -> bool {
        self.withdrawn.contains(&id)
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
        !self.nodes.is_empty()
    }

    /// Returns whether the snapshot withdraws the node in `row`.
    #[must_use]
    pub(crate) fn withdraws_node(&self, row: NodeRowId) -> bool {
        self.nodes.contains(row)
    }

    /// Returns whether the snapshot withdraws the edge in `row`.
    #[must_use]
    pub(crate) fn withdraws_edge(&self, row: EdgeRowId) -> bool {
        self.edges.contains(row)
    }

    /// Iterates the withdrawn node rows, the fitted withdrawals in the node domain.
    ///
    /// The edges route subtracts these from its bounding set, which is what tiles rendered, so
    /// the two routes keep answering from one delivered world.
    pub(crate) fn withdrawn_node_rows(&self) -> impl Iterator<Item = NodeRowId> + '_ {
        self.nodes.iter()
    }

    /// Iterates the withdrawn edge rows, the fitted withdrawals in the edge domain.
    ///
    /// An entry fold subtracts these from a scoped proof's edge mask at resolution, exactly as
    /// [`Self::withdrawn_node_rows`] feeds the node mask, so the folded proof and the admission
    /// checks answer from one withdrawn set.
    pub(crate) fn withdrawn_edge_rows(&self) -> impl Iterator<Item = EdgeRowId> + '_ {
        self.edges.iter()
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

    /// Returns the published link `id` names, or [`None`] for an identity with no published link.
    #[must_use]
    pub(crate) fn link(&self, id: ArchivedEntityId) -> Option<DeltaLink> {
        self.links.get(&id).copied()
    }

    /// Returns the placed arrival `id` names, or [`None`] for an identity with no placed arrival.
    #[must_use]
    pub(crate) fn placed(&self, id: ArchivedEntityId) -> Option<PlacedArrival> {
        self.placed.get(&id).cloned()
    }

    /// Returns the placed arrival holding `slot`, or [`None`] for a slot this publication does
    /// not serve.
    ///
    /// [`Self::placed`] reversed: wire-domain ingress decodes to a slot and resolves the identity
    /// serving it here. Publication writes the slot index and the placed map together, so a held
    /// slot always resolves its arrival.
    #[must_use]
    pub(crate) fn placed_at(&self, slot: NodeRowId) -> Option<(ArchivedEntityId, &PlacedArrival)> {
        let &identity = self.slots.get(&slot)?;
        let arrival = self.placed.get(&identity)?;

        Some((identity, arrival))
    }

    /// Returns every placed arrival, carrying its frozen wire coordinate.
    #[must_use]
    pub(crate) const fn placed_arrivals(&self) -> &FastHashMap<ArchivedEntityId, PlacedArrival> {
        &self.placed
    }

    /// Returns every published link, carrying its endpoint identities.
    #[must_use]
    pub(crate) const fn links(&self) -> &FastHashMap<ArchivedEntityId, DeltaLink> {
        &self.links
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

    /// Returns the placed arrival `id` names in this cohort, [`None`] for every other identity.
    ///
    /// An identity placed after the cohort's snapshot published answers [`None`], so a caller
    /// meets it at its next resolution rather than mid-window.
    #[must_use]
    pub(crate) fn placed(self, id: ArchivedEntityId) -> Option<PlacedArrival> {
        self.snapshot?.placed(id)
    }

    /// Returns the placed arrival holding `slot` in this cohort, [`None`] for every other slot.
    ///
    /// The wire-ingress counterpart of [`Self::placed`]: a decoded row at or past the
    /// generation's fitted bound names a cohort slot, and this answers the identity serving it.
    #[must_use]
    pub(crate) fn placed_at(
        self,
        slot: NodeRowId,
    ) -> Option<(ArchivedEntityId, &'scope PlacedArrival)> {
        self.snapshot?.placed_at(slot)
    }

    /// Iterates the cohort's placed arrivals, empty for the empty cohort.
    ///
    /// Iteration order is the map's own. A consumer whose output must be deterministic orders
    /// the arrivals itself, by identity.
    pub(crate) fn placed_arrivals(
        self,
    ) -> impl Iterator<Item = (ArchivedEntityId, &'scope PlacedArrival)> {
        self.snapshot.into_iter().flat_map(|snapshot| {
            snapshot
                .placed_arrivals()
                .iter()
                .map(|(&id, arrival)| (id, arrival))
        })
    }

    /// Returns the published link `id` names in this cohort, [`None`] for every other identity.
    ///
    /// A link published after the cohort's snapshot answers [`None`], so a caller meets it at
    /// its next resolution rather than mid-window.
    #[must_use]
    pub(crate) fn link(self, id: ArchivedEntityId) -> Option<DeltaLink> {
        self.snapshot?.link(id)
    }

    /// Iterates the cohort's published links, empty for the empty cohort.
    ///
    /// Iteration order is the map's own. A consumer whose output must be deterministic orders
    /// the links itself, by identity.
    pub(crate) fn links(self) -> impl Iterator<Item = (ArchivedEntityId, DeltaLink)> {
        self.snapshot
            .into_iter()
            .flat_map(|snapshot| snapshot.links().iter().map(|(&id, &link)| (id, link)))
    }

    /// Returns the accepted row universe reads under this cohort take, `base` for an empty one.
    ///
    /// The bound is the snapshot's own. Every slot the cohort can name lies inside it, and a
    /// slot allocated after the snapshot published refuses at decode.
    #[must_use]
    pub(crate) const fn universe(self, base: Universe) -> Universe {
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
    /// delivery resolved while still recording that a new holding exists.
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
/// One [`Register`] per identity, last-writer-wins on the event's transaction time. The map grows
/// with the distinct identities the feed has reported, and a refit retires it along with the
/// generation whose delta it states.
#[derive(Debug)]
pub(crate) struct DeltaRegister {
    /// The newest applied event per identity.
    registers: FastHashMap<ArchivedEntityId, Register>,
    /// The held classification verdict per identity, insert-only.
    classifications: FastHashMap<ArchivedEntityId, Classification>,
    /// The frozen placement and its slot per identity, insert-only.
    placements: FastHashMap<ArchivedEntityId, HeldPlacement>,
    /// The accepted row universe, covering the generation's fitted rows and every allocated slot.
    ///
    /// The next slot is the current bound, so an allocation grows the bound by one and the value
    /// stays exact without a second counter.
    universe: Universe,
}

impl DeltaRegister {
    /// Builds an empty register over a generation whose accepted universe is `universe`.
    ///
    /// Slot allocation starts at the bound, so the first placement takes the first row id past
    /// the generation's fitted rows.
    pub(crate) fn new(universe: Universe) -> Self {
        Self {
            registers: fast_hash_map(),
            classifications: fast_hash_map(),
            placements: fast_hash_map(),
            universe,
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
        let challenger = Register { version, standing };

        match self.registers.entry(entity) {
            FastHashMapEntry::Vacant(slot) => {
                slot.insert(challenger);
                true
            }
            FastHashMapEntry::Occupied(mut slot) => {
                let held = *slot.get();
                if !challenger.supersedes(&held) {
                    return false;
                }

                slot.insert(challenger);
                held.standing != standing
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
        self.registers
            .iter()
            .filter(|&(entity, register)| {
                matches!(register.standing, Standing::Live { .. })
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
                    self.registers.get(&entity),
                    Some(Register {
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

    /// Holds one frozen placement, returning the register's disposition of it.
    ///
    /// The first placement per identity takes the next slot past the accepted universe and holds
    /// for the process's lifetime. A later placement for the same identity changes nothing,
    /// because the coordinate froze and the slot never moves, so re-delivery of a placement is
    /// idempotent and comes back [`Disposition::AlreadyHeld`]. A placement for an identity
    /// standing withdrawn records all the same, so an unarchive republishes the frozen
    /// coordinate on its former slot. A newly held placement is [`Disposition::Resolving`]
    /// exactly when the identity stands live, because only a live arrival resolves through its
    /// placement at publication, and [`Disposition::Dormant`] otherwise.
    ///
    /// # Errors
    ///
    /// Returns [`UniverseExhausted`] when one more slot would grow the accepted universe past the
    /// wire's `u32` row domain. The placement records nothing and the arrival stays staged.
    pub(crate) fn place(
        &mut self,
        entity: ArchivedEntityId,
        placement: FrozenPlacement,
    ) -> Result<Disposition, UniverseExhausted> {
        match self.placements.entry(entity) {
            FastHashMapEntry::Vacant(entry) => {
                let slot = self.universe.rows();
                let grown = slot.checked_add(1).ok_or(UniverseExhausted)?;

                self.universe = Universe::new(grown);
                entry.insert(HeldPlacement {
                    slot: NodeRowId::from_u32(slot),
                    frozen: placement,
                });

                Ok(
                    if matches!(
                        self.registers.get(&entity),
                        Some(Register {
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
            FastHashMapEntry::Occupied(_) => Ok(Disposition::AlreadyHeld),
        }
    }

    /// Estimates the fold's resident bytes.
    ///
    /// A weighted estimate for replay telemetry rather than an allocator-faithful ceiling: the
    /// register, classification, and placement maps' heap allocations, plus the captured display
    /// labels' text.
    #[must_use]
    pub(crate) fn resident_estimate(&self) -> usize {
        let displays: usize = self
            .placements
            .values()
            .map(|held| held.frozen.display.heap_bytes())
            .sum();

        self.registers.allocation_size()
            + self.classifications.allocation_size()
            + self.placements.allocation_size()
            + displays
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
        let mut nodes = CompressedBitSet::new();
        let mut edges = CompressedBitSet::new();
        let mut staged = fast_hash_map();
        let mut placed = fast_hash_map();
        let mut slots = fast_hash_map();
        let mut links = fast_hash_map();

        for (&entity, register) in &self.registers {
            match register.standing {
                Standing::Withdrawn => {
                    withdrawn.insert(entity);

                    if let Some(row) = tables.node_row_of(entity) {
                        nodes.insert(row);
                    } else if let Some(row) = tables.edge_row_of(entity) {
                        edges.insert(row);
                    } else {
                        // An unfitted withdrawal has no generation row to subtract, and the
                        // identity set above already carries it.
                    }
                }
                Standing::Live { edition } => {
                    if tables.node_row_of(entity).is_none() && tables.edge_row_of(entity).is_none()
                    {
                        match self.classifications.get(&entity) {
                            Some(Classification::Node) => {
                                if let Some(held) = self.placements.get(&entity) {
                                    placed.insert(
                                        entity,
                                        PlacedArrival {
                                            edition,
                                            wire: held.frozen.wire,
                                            slot: held.slot,
                                            display: held.frozen.display.clone(),
                                        },
                                    );
                                    slots.insert(held.slot, entity);
                                } else {
                                    staged.insert(entity, edition);
                                }
                            }
                            Some(&Classification::Link {
                                source: Some(source),
                                target: Some(target),
                            }) => {
                                links.insert(
                                    entity,
                                    DeltaLink {
                                        edition,
                                        source,
                                        target,
                                    },
                                );
                            }
                            Some(Classification::Link { .. }) | None => {
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
            universe: self.universe,
            withdrawn,
            nodes,
            edges,
            staged,
            placed,
            slots,
            links,
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
