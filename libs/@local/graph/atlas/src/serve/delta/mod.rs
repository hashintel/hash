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
//! An arrival's *classification* is the node-versus-link verdict
//! ([`Classification`](crate::postgres::Classification)) a batched
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
//! [`Universe`](crate::serve::codec::Universe), assigned in placement order. The register never
//! reassigns or reuses a slot,
//! withdrawal included, so a row a proof admitted cannot change meaning while that proof can
//! answer, and an unarchived identity serves from its own former slot. Slot order and
//! level-of-detail ranking order are distinct contracts, and neither derives from the other. The
//! wire permutation covers the whole `u32` range, so widening the accepted universe preserves
//! every existing wire id. A placement that would grow the universe past that range refuses as
//! [`UniverseExhausted`](self::register::UniverseExhausted) and the arrival stays staged.
//!
//! A complete link's *edge row* is the id its first classification takes: the next row past the
//! accepted edge universe, assigned at the verdict's hold under the same never-reassign law.
//! The wire therefore speaks rows in the edge domain exactly as in the node domain. A hold that
//! would grow the edge universe past the codec's range refuses the whole verdict as
//! [`UniverseExhausted`](self::register::UniverseExhausted), and the identity stays unclassified
//! for the next poll to retry.
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

use arc_swap::{ArcSwapOption, Guard};
use hash_graph_postgres_store::store::EntityEvent;
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use rand::TryCryptoRng;
use type_system::knowledge::entity::id::EntityEditionId;

use crate::{
    dataset::auxiliary::{OwnedIcon, OwnedLabel, OwnedLegend},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::Vec2,
    postgres::id::{ArchivedEntityId, ArchivedOntologyTypeUuid},
};

pub(crate) mod consumer;
pub(crate) mod overlay;
mod placement;
mod register;
mod snapshot;
pub(crate) mod staging;

#[expect(
    unused_imports,
    reason = "published for the replay report's CLI adapter, which binds Placer::project's \
              outcomes; its registration consumes them"
)]
pub(crate) use self::placement::{NonFiniteProjection, Projection};
pub(crate) use self::{
    placement::{PlacementError, Placer},
    register::{DeltaRegister, Disposition},
    snapshot::{DeltaSnapshot, PlacementCohort},
};

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
    /// The representative type's nearest declared icon, read beside the coordinate.
    ///
    /// It rides to the register so an allocation for a type the generation never tabulated
    /// records the icon beside the row it allocates.
    pub icon: OwnedIcon,
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
    /// The projected coordinate, normalized into the wire frame.
    pub position: Vec2,
    /// The display payload captured at placement.
    pub legend: OwnedLegend,
}

impl DeltaNode {
    fn with_edition(self, edition: EntityEditionId) -> Self {
        Self { edition, ..self }
    }
}

/// A live post-fit link as publication serves it, carrying its allocated edge row and its
/// row-typed endpoints.
///
/// The row is the one the link's classification allocated, fixed for the register's lifetime,
/// so the wire speaks one edge-row domain across fitted and delta links. The endpoints are node
/// rows in the accepted universe - a fitted endpoint's generation row, or the slot an arrival's
/// placement took - resolved at publication, so a link publishes once both endpoints hold
/// rows. The edition is the link's newest feed edition, the key its detail reads resolve
/// through.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct DeltaEdge {
    /// The link's edge row in the extended universe.
    pub id: EdgeRowId,
    /// The link's newest feed edition.
    pub edition: EntityEditionId,
    /// The left attachment's endpoint row.
    pub source: NodeRowId,
    /// The right attachment's endpoint row.
    pub target: NodeRowId,
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
