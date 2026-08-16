//! Delivery buckets built over exactly the visible view.
//!
//! A restricted response delivers from a schedule of its own, a first-occupant cascade over the
//! visible rows alone, under the corpus rank restricted to them, read at the view's resolved cut
//! offset `k`. Every schedule-derived output - delivered rows, per-bucket runs, the child bitmask,
//! the root's visible count and resolution - is a function of the visible rows, their pinned keys
//! and ranks, and public policy. A hidden row contributes to none of them, so a scope's responses
//! carry no evidence of what its mask removed.
//!
//! [`ScopeSchedule::of`] builds the cascade once per scope, and [`ScopeSchedule::cut`] binds one
//! resolved offset and answers the delivery queries. Construction computes the cascade at the
//! natural depth, and every offset shares it, because depths at or above `d` decide the
//! first-occupant scan at depth `d`. A deeper catch-all therefore never changes which row claims a
//! shallower cell, and a row's bucket at deepest cut `D` is `min(natural, D)`. One slot column in
//! `(bucket, key, rank)` order therefore serves every admissible `k`. Buckets above the cut read
//! as slot ranges, and the catch-all reads the buckets at or beyond the cut as per-bucket
//! segments, restoring `(key, rank)` order across exactly the rows a cell delivers.
//!
//! A view reading a shared fitted schedule - the corpus artifacts, or the saturated memo - takes
//! its admitted arrivals as an [`ArrivalOverlay`] beside it instead, a second bucket column under
//! the same law, merged into every delivery query at read time.

use alloc::sync::Arc;
use core::{cmp::Ordering, ops::Range};

use hashql_core::{
    heap::CollectIn as _,
    id::{Id as _, IdArray, IdSlice},
};

use self::cut::ScheduleCut;
use super::grid::Grid;
use crate::{
    allocator::{MemoryUsage, MemoryUsageAllocator},
    identity::{BasePosition, ImportanceRank, NodeRowId},
    math::Vec2,
    morton::{Depth, MortonCell, MortonKey},
    postgres::{EditionDisplay, id::ArchivedEntityId},
    salt::lod::{cascade, stage::WIRE_FRAME},
    serve::{
        Atlas, VisibilityProof, WireRow,
        codec::Universe,
        delta::{PlacedArrival, PlacementCohort},
        density::CutOffset,
        visibility::ProofKind,
    },
};

pub(crate) mod cut;
#[cfg(test)]
pub(crate) mod tests;

hashql_core::id::newtype! {
    /// A reference to a visible row by its slot in one scope schedule's natural order.
    ///
    /// Slots are dense and zero-based over one view's visible rows. The order is bucket-major at
    /// the natural depth, ascending by `(key, rank)` inside a bucket. A slot is valid only against
    /// the schedule that assigned it, because two views, or one view under two proofs, share no
    /// slot vocabulary.
    pub struct ScopeSlot(u32)
}

hashql_core::id::newtype! {
    /// A reference to one cohort arrival by its slot in a schedule's arrival table.
    ///
    /// Indices are dense and zero-based over one schedule's arrivals, ascending by identity. An
    /// index is valid only against the schedule that assigned it, exactly as a [`ScopeSlot`] is.
    pub struct ArrivalIndex(u32)
}

/// One row of a visible view, in the domain that publishes it.
///
/// A schedule orders rows from two domains under one `(key, rank)` law: fitted rows address the
/// generation's columns by base position, while placed arrivals address the schedule's own
/// arrival table. Every delivery consumer matches on the domain, because a base row resolves its
/// payloads from the columns and an arrival from its captured placement.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ViewRow {
    /// A generation row, addressed by its slot in the base order.
    Base(BasePosition),
    /// A cohort arrival, addressed into the schedule's arrival table.
    Arrival(ArrivalIndex),
}

/// One cohort arrival of a schedule, resolved whole at construction.
///
/// Everything an arrival-bearing response reads. The identity keys the ingress withdrawal
/// filter, and the frozen coordinate feeds the `POSITIONS` column. Its wire id feeds the
/// `ROW_IDS` column, pre-encoded under the entry universe, which admits every cohort slot by
/// construction, and the display payload feeds the detail trailer.
#[derive(Debug, Clone)]
pub(crate) struct ArrivalRow {
    /// The arrival's identity, the ingress withdrawal filter's key.
    pub identity: ArchivedEntityId,
    /// The frozen wire coordinate.
    pub point: Vec2,
    /// The arrival's wire id, encoded under the entry universe at construction.
    pub wire: WireRow<NodeRowId>,
    /// The display payload captured at placement.
    pub display: EditionDisplay,
}

impl ArrivalRow {
    /// Resolves one placed arrival into its delivery row and quantized key.
    ///
    /// The key quantizes the frozen coordinate on the wire frame - every published placement
    /// lies inside it, because an out-of-frame projection never places - and the wire id
    /// encodes under `universe`, the entry's own, which admits every cohort slot by
    /// construction.
    fn of(
        atlas: &Atlas,
        universe: Universe,
        identity: ArchivedEntityId,
        arrival: &PlacedArrival,
    ) -> (MortonKey, Self) {
        let [x, y] = WIRE_FRAME.quantize(arrival.wire);

        (
            MortonKey::new(x, y),
            Self {
                identity,
                point: arrival.wire,
                wire: atlas.node_codec.encode(arrival.slot, universe),
                display: arrival.display.clone(),
            },
        )
    }
}

/// One arrival interleaved into a range-shaped delivery.
///
/// The operator fast paths deliver contiguous base-position ranges, and a splice names where one
/// arrival sits among them: `at` is the arrival's index in the final merged order, counting rows
/// of both kinds. A consumer walks the ranges and emits the named arrival whenever its output
/// index reaches a splice, so the interleave costs one comparison per row and no gather.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct Splice {
    /// The arrival's index in the final delivered order.
    pub at: u32,
    /// The spliced arrival, addressed into the view's arrival table.
    pub arrival: ArrivalIndex,
}

/// Returns the cohort arrivals `proof` admits, ascending by identity.
///
/// The filter is slot membership, the same admission the mask builder widened the proof for. An
/// operator proof admits every slot, so a corpus view takes the whole cohort. The identity sort
/// fixes arrival order whatever order the cohort's map iterates.
fn admitted_arrivals<'scope>(
    proof: &VisibilityProof,
    cohort: PlacementCohort<'scope>,
) -> Vec<(ArchivedEntityId, &'scope PlacedArrival)> {
    let mut placed: Vec<_> = cohort
        .placed_arrivals()
        .filter(|&(_, arrival)| proof.contains(arrival.slot))
        .collect();
    placed.sort_unstable_by_key(|&(identity, _)| identity);

    placed
}

hashql_core::id::newtype! {
    /// A fencepost of the slot column: the boundary preceding one natural bucket.
    ///
    /// Bucket `b` spans the slots between its opening post and its closing post - the opening
    /// post of bucket `b + 1`. The final post trails the deepest bucket and marks the column's
    /// length. The fencepost column stores each post's slot, so a post is an index into
    /// [`ScopeSchedule::posts`] and its value there is a [`ScopeSlot`].
    struct BucketPost(u32)
}

impl BucketPost {
    /// The post opening `bucket`: its slot is the first at `bucket`'s depth or deeper.
    fn opening(bucket: Depth) -> Self {
        Self::from_u32(u32::from(bucket.get()))
    }

    /// The post closing `bucket`: the opening post of the next-deeper bucket.
    fn closing(bucket: Depth) -> Self {
        Self::from_u32(u32::from(bucket.get()) + 1)
    }
}

/// The delivery schedule one view's responses read.
///
/// An operator proof serves the generation's own corpus schedule, and a scoped proof serves the
/// cascade built over exactly its visible rows. The constructor derives the variant from the
/// proof, so production has one build site and the pairing law in one place.
///
/// Both variants carry the view's arrival overlay beside the fitted schedule, because the fitted
/// side - the corpus artifacts, or the saturated memo - belongs to the generation while the
/// admitted arrivals are the entry's own. A scope that builds its own cascade folds its arrivals
/// into it instead, and its overlay is empty by construction: exactly one of the two holds the
/// view's arrivals.
///
/// Caller requirement: as with the census, a schedule travels with the proof it derives from.
/// Assembly refuses a proof paired with the other variant's schedule.
#[derive(Debug)]
pub(crate) enum ViewSchedule {
    /// The generation's corpus schedule, where every zoom keeps its recorded cut, with the
    /// view's arrival overlay beside it.
    Corpus(ArrivalOverlay),
    /// The view's own cascade, shared by every request of its scope, with the view's arrival
    /// overlay beside it.
    Scope(Arc<ScopeSchedule>, ArrivalOverlay),
}

impl ViewSchedule {
    /// Derives the schedule variant `proof` serves under.
    ///
    /// An operator proof reads the corpus artifacts. Any scoped proof - saturated or empty
    /// included - serves a cascade, because the serving contract follows the scope declaration
    /// rather than the visible cardinality. A scope whose node mask admits the whole corpus
    /// reads the generation's shared saturated cascade instead of building one. A cascade is a
    /// function of the visible node rows alone, so every saturated scope builds identical
    /// buckets and the sharing changes which allocation answers, never which contract. The
    /// sharing test is exact, so a mask even one row short of the corpus - a scope whose cohort
    /// withdrew a single fitted row included - builds and retains its own full-corpus-sized
    /// cascade instead. After the first fitted withdrawal every corpus-admitting scope resolves
    /// onto that arm for the life of the generation, a cost on resolution latency and entry
    /// weight rather than on served bytes.
    ///
    /// The variants that read a shared fitted schedule - the corpus artifacts and the saturated
    /// memo - take their admitted arrivals as an overlay, whose buckets are exact there because
    /// the visible fitted rows are the whole corpus in both. A scope that builds its own cascade
    /// folds its arrivals into the build and takes the empty overlay.
    #[must_use]
    pub(crate) fn of(atlas: &Atlas, proof: &VisibilityProof, cohort: PlacementCohort<'_>) -> Self {
        match proof.kind() {
            ProofKind::Corpus => Self::Corpus(ArrivalOverlay::of(atlas, proof, cohort)),
            ProofKind::Scope if proof.nodes_saturated_below(atlas.morton.count()) => Self::Scope(
                Arc::clone(atlas.saturated_scope_schedule()),
                ArrivalOverlay::of(atlas, proof, cohort),
            ),
            ProofKind::Scope => Self::Scope(
                Arc::new(ScopeSchedule::of(atlas, proof, cohort)),
                ArrivalOverlay::empty(),
            ),
        }
    }
}

/// One visible row of the cascade's input.
///
/// The vessel addresses the row in its own domain, and the key and rank are the row's pinned
/// layout values: quantized coordinate and corpus rank for a fitted row, quantized frozen
/// placement and a rank past every fitted rank for an arrival. These three are the whole
/// vocabulary the schedule reads.
#[derive(Debug, Copy, Clone)]
struct ScopeRow {
    /// The row, in the domain that publishes it.
    vessel: ViewRow,
    /// The row's Morton key, quantized from the delivered coordinate column.
    key: MortonKey,
    /// The row's rank within the view: dense, ascending in corpus rank order, arrivals after
    /// every fitted row in identity order.
    rank: ImportanceRank,
}

/// A visible row with its natural cascade bucket.
#[derive(Debug, Copy, Clone)]
struct SlottedRow {
    /// The row's first-occupant bucket at the natural depth.
    bucket: Depth,
    /// The row itself.
    row: ScopeRow,
}

/// One entry of the position lookup: a visible row's natural bucket, keyed by position.
#[derive(Debug, Copy, Clone)]
struct PositionBucket {
    /// The row's slot in the generation's base order.
    position: BasePosition,
    /// The row's first-occupant bucket at the natural depth.
    bucket: Depth,
}

/// A resolved cut past the key width.
///
/// The deepest scope bucket is `max_tile_depth + span + k` and a complete Morton key resolves 32
/// subdivisions, so an offset that lands beyond them has no grid to deliver on. The binding refuses
/// that offset whole, and nothing clamps it or substitutes another schedule.
#[expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ScheduleWidthError {
    /// The generation's deepest served tile zoom.
    pub max_tile_depth: u8,
    /// The generation's span exponent.
    pub span: u8,
    /// The refused offset.
    pub k: CutOffset,
}

impl core::fmt::Display for ScheduleWidthError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(
            fmt,
            "delivery-cut offset {} puts the deepest scope bucket {} + {} + {} past the {} \
             subdivisions a Morton key resolves",
            self.k.get(),
            self.max_tile_depth,
            self.span,
            self.k.get(),
            Depth::MAX.get(),
        )
    }
}

impl core::error::Error for ScheduleWidthError {}

/// Returns the deepest grid `key` shares with any corpus row, [`None`] for an empty corpus.
///
/// The code column sorts within each bucket segment, and a sorted-order neighbour attains the
/// deepest shared grid over a sorted key set, so each segment answers with one binary search and
/// its two neighbouring keys.
fn deepest_corpus_shared(atlas: &Atlas, key: MortonKey) -> Option<Depth> {
    let codes = atlas.morton.codes();

    let mut deepest: Option<Depth> = None;
    for segment in atlas.morton.fenceposts().segments() {
        let slice = &codes[segment];
        let at = slice.partition_point(|code| code.get() < key.to_bits());

        for neighbour in [at.checked_sub(1), (at < slice.len()).then_some(at)]
            .into_iter()
            .flatten()
        {
            let shared = key.shared_depth(MortonKey::from_bits(slice[neighbour].get()));
            deepest = Some(deepest.map_or(shared, |held| held.max(shared)));
        }
    }

    deepest
}

/// The scope cascade of one visible view, computed once and read at any admissible cut offset.
///
/// Construction assigns every visible row the shallowest grid depth at which it is its cell's
/// first representative in rank order - the same first-occupant law behind the corpus schedule -
/// and orders the slots bucket-major, ascending by key inside a bucket, rank breaking exact-key
/// ties. [`Self::cut`] binds a resolved offset over the result. The value is immutable after
/// construction and holds no per-offset state, so one schedule serves every request of its scope
/// concurrently.
///
/// A schedule resolves once per scope beside the proof it builds from, and the requests under that
/// scope share it.
///
/// Caller requirement: a schedule travels with the proof it builds over. Delivery reads it as the
/// view's own cascade without re-deriving it, so a schedule paired with a foreign proof serves the
/// wrong view's rows.
#[derive(Debug)]
pub(crate) struct ScopeSchedule {
    /// Every visible row in natural order.
    slots: Box<IdSlice<ScopeSlot, SlottedRow>, MemoryUsageAllocator>,
    /// Each fencepost's slot: bucket `b` spans its opening post's slot to its closing post's.
    posts: IdArray<BucketPost, ScopeSlot, { Self::BUCKETS + 1 }>,
    /// The natural buckets ascending by position: the row-to-bucket lookup, binary-searched.
    ///
    /// The lookup covers the base domain alone, because its callers resolve identity-domain
    /// ingress against the generation's columns.
    by_position: Box<[PositionBucket], MemoryUsageAllocator>,
    /// The cohort arrivals the schedule's [`ViewRow::Arrival`] vessels address, ascending by
    /// identity.
    arrivals: Box<IdSlice<ArrivalIndex, ArrivalRow>, MemoryUsageAllocator>,
    /// Each arrival's bucket under the slot column's own assignment: the arrival-to-bucket
    /// lookup, the arrival counterpart of the position lookup.
    arrival_buckets: Box<IdSlice<ArrivalIndex, Depth>, MemoryUsageAllocator>,
    memory_usage: MemoryUsage,
}

impl ScopeSchedule {
    /// The natural bucket domain: depths `0..=32` of the complete Morton key.
    const BUCKETS: usize = Depth::MAX.get() as usize + 1;

    /// Builds the cascade over the visible view `proof` admits on `atlas`.
    ///
    /// The gather traverses the generation's reverse rank column - the rank column's inverse by
    /// the fit pipeline's construction, spot-checked at open - in rank order and keeps the
    /// positions whose rows `proof` admits. The view's
    /// rows therefore arrive rank-ascending, and each row's local rank is its arrival ordinal:
    /// dense and pairwise distinct by construction. [`Self::over`] assigns the buckets.
    ///
    /// The cohort's placed arrivals the proof admits join the same pass. Each takes the key its
    /// frozen coordinate quantizes to on the wire frame - every published placement lies inside
    /// it, because an out-of-frame projection never places - and a rank past every fitted row's,
    /// ascending in identity order, so every generation row outranks every arrival and arrival
    /// order is stable whatever order the cohort's map iterates. The wire id pre-encodes under
    /// the entry universe, which admits every cohort slot by construction.
    pub(crate) fn of(atlas: &Atlas, proof: &VisibilityProof, cohort: PlacementCohort<'_>) -> Self {
        let alloc = MemoryUsageAllocator::global();

        let row_ids = atlas.rows.view();

        let visible = usize::try_from(proof.visible_below(atlas.morton.count()))
            .expect("a visible row count fits usize");
        let mut rows = Vec::with_capacity(visible);
        for &position in atlas.positions_of_rank.view() {
            if proof.contains(row_ids[position]) {
                rows.push(ScopeRow {
                    vessel: ViewRow::Base(position),
                    key: atlas.morton.code(position),
                    rank: ImportanceRank::from_usize(rows.len()),
                });
            }
        }

        let universe = cohort.universe(atlas.universe());
        let mut arrivals = Vec::new_in(alloc);
        for (identity, arrival) in admitted_arrivals(proof, cohort) {
            let (key, row) = ArrivalRow::of(atlas, universe, identity, arrival);
            rows.push(ScopeRow {
                vessel: ViewRow::Arrival(ArrivalIndex::from_usize(arrivals.len())),
                key,
                rank: ImportanceRank::from_usize(rows.len()),
            });
            arrivals.push(row);
        }

        Self::over(rows, arrivals.into_boxed_slice())
    }

    /// Builds the empty schedule: nothing delivers, and no cell holds a row at any depth.
    pub(crate) fn empty() -> Self {
        Self::over(Vec::new(), Box::new_in([], MemoryUsageAllocator::global()))
    }

    /// Returns the schedule's retained heap in bytes: its own allocator's live count.
    ///
    /// Every retained column allocates through one counting allocator, and nothing accrues
    /// after construction - the catch-all reads straight off the column, so no offset ever
    /// materializes per-offset state. The count covers the columns' requested layouts alone.
    /// The heap an arrival's captured display payload owns stays outside it.
    pub(crate) fn heap_bytes(&self) -> u64 {
        self.memory_usage.get() as u64
    }

    /// Builds the cascade over exactly the given rows.
    ///
    /// [`cascade::separation_buckets`] assigns each row its natural bucket - the assignment
    /// [`cascade::buckets`], the function behind the corpus schedule at fit time, computes at
    /// [`Depth::MAX`] - in one pass over the rows' `(key, rank)` order. Rows co-located at the
    /// complete key width never claim a cell and take the deepest bucket, exactly as the corpus
    /// catch-all takes them. An empty view builds an empty schedule, which delivers nothing and
    /// occupies no cell at any depth.
    ///
    /// Caller requirement: the rows' ranks are pairwise distinct, and every [`ViewRow::Arrival`]
    /// vessel addresses `arrivals`. [`Self::of`] guarantees both by enumeration, and a fixture
    /// caller owes the same properties.
    fn over(mut rows: Vec<ScopeRow>, arrivals: Box<[ArrivalRow], MemoryUsageAllocator>) -> Self {
        let alloc = Box::allocator(&arrivals).clone();
        let memory_usage = alloc.memory_usage();

        rows.sort_unstable_by_key(|row| (row.key, row.rank));
        let buckets = cascade::separation_buckets(&rows, |row| row.key, |row| row.rank);

        // Slot order: bucket-major, ascending key within a bucket, rank breaking exact-key
        // ties. One sorted column is the whole schedule.
        let mut slots: Vec<_, _> = rows
            .into_iter()
            .zip(&*buckets)
            .map(|(row, &bucket)| SlottedRow { bucket, row })
            .collect_in(alloc.clone());
        slots.sort_unstable_by_key(|slot| (slot.bucket, slot.row.key, slot.row.rank));

        // Counting sort's tally, then the running total: a post's slot is the number of rows
        // in the buckets it closes off, so post 0 opens bucket 0 at slot 0 and the final post
        // carries the column's length.
        let mut counts = IdArray::<BucketPost, u32, { Self::BUCKETS + 1 }>::from_elem(0);
        for slot in &slots {
            counts[BucketPost::closing(slot.bucket)] += 1;
        }

        let mut placed = 0_u32;
        let posts = counts.map(|count| {
            placed += count;
            ScopeSlot::from_u32(placed)
        });

        let mut by_position = Vec::new_in(alloc.clone());
        let mut arrival_buckets = alloc::vec::from_elem_in(Depth::MIN, arrivals.len(), alloc);
        for slot in &slots {
            match slot.row.vessel {
                ViewRow::Base(position) => by_position.push(PositionBucket {
                    position,
                    bucket: slot.bucket,
                }),
                ViewRow::Arrival(index) => arrival_buckets[index.as_usize()] = slot.bucket,
            }
        }
        by_position.sort_unstable_by_key(|entry| entry.position);

        Self {
            slots: IdSlice::from_boxed_slice(slots.into_boxed_slice()),
            posts,
            by_position: by_position.into_boxed_slice(),
            arrivals: IdSlice::from_boxed_slice(arrivals),
            arrival_buckets: IdSlice::from_boxed_slice(arrival_buckets.into_boxed_slice()),
            memory_usage,
        }
    }

    /// Binds one resolved cut offset over the cascade and the view's arrival overlay.
    ///
    /// The bound cut serves `grid`'s zooms at `d(z) = z + span + k`, with the deepest bucket
    /// `max_tile_depth + span + k` as the catch-all, and merges `overlay` into every delivery
    /// query. A schedule that folded its arrivals binds the empty overlay.
    ///
    /// # Errors
    ///
    /// Returns [`ScheduleWidthError`] when that deepest bucket lies past the key width. Binding
    /// refuses the offset rather than clamping it, because a sealed offset resolves against this
    /// same generation's schedule, so an out-of-domain value is a defect to surface.
    #[expect(
        clippy::min_ident_chars,
        reason = "`k` is the delivery-cut offset's name throughout the density contract"
    )]
    pub(super) fn cut<'schedule>(
        &'schedule self,
        overlay: &'schedule ArrivalOverlay,
        grid: Grid,
        k: CutOffset,
    ) -> Result<ScheduleCut<'schedule>, ScheduleWidthError> {
        ScheduleCut::bind(self, overlay, grid, k)
    }

    /// Views the cohort arrivals the schedule's [`ViewRow::Arrival`] vessels address.
    pub(crate) const fn arrivals(&self) -> &IdSlice<ArrivalIndex, ArrivalRow> {
        &self.arrivals
    }

    /// Returns an arrival's bucket under the slot column's own assignment.
    fn arrival_bucket(&self, index: ArrivalIndex) -> Depth {
        self.arrival_buckets[index]
    }

    /// Returns one natural bucket's slots.
    fn bucket_slots(&self, bucket: Depth) -> &[SlottedRow] {
        let range = Range {
            start: self.posts[BucketPost::opening(bucket)],
            end: self.posts[BucketPost::closing(bucket)],
        };

        &self.slots[range]
    }

    /// Returns the bounds of `cell`'s keys within one key-sorted slice.
    fn cell_bounds<T>(
        items: &[T],
        key: impl Fn(&T) -> MortonKey,
        cell: MortonCell,
    ) -> Range<usize> {
        let min = cell.min_key();
        let max = cell.max_key();
        let start = items.partition_point(|item| key(item) < min);
        let end = start + items[start..].partition_point(|item| key(item) <= max);

        start..end
    }
}

/// An admitted arrival with its natural bucket and quantized key.
#[derive(Debug, Copy, Clone)]
struct OverlaySlot {
    /// The arrival's natural bucket against the corpus and its earlier cohort peers.
    bucket: Depth,
    /// The arrival's Morton key, quantized from the frozen coordinate.
    key: MortonKey,
    /// The arrival addressed, ascending in identity order across the overlay.
    arrival: ArrivalIndex,
}

/// The admitted arrivals of a view whose fitted schedule is corpus-wide.
///
/// The corpus artifacts and the saturated memo both order exactly the whole fitted corpus, and
/// both outlive any one entry, so the entry's own arrivals ride beside them rather than inside.
/// Each
/// arrival takes its natural first-occupant bucket under the same separation law the cascades
/// use: one past the deepest grid it shares with any better-ranked row, where every fitted row
/// outranks every arrival and earlier cohort identities outrank later ones. That assignment is
/// exact precisely because the visible fitted rows are the whole corpus, so the nearest
/// better-ranked key is a corpus-column search rather than a per-scope gather.
///
/// The slots sort in `(bucket, key, rank)` order, the cascades' own delivery order, and every
/// schedule-derived output - runs, gathers, the child bitmask, the root's counts - reads the
/// overlay as a second bucket column merged at query time. The consumers clamp buckets into
/// their own catch-all, so one overlay serves the corpus contract and any saturated cut offset.
#[derive(Debug)]
pub(crate) struct ArrivalOverlay {
    /// The overlay entries in `(bucket, key, rank)` order, buckets at their natural depth.
    slots: Box<[OverlaySlot], MemoryUsageAllocator>,
    /// The arrival table the slots and the delivered vessels address, ascending by identity.
    arrivals: Box<IdSlice<ArrivalIndex, ArrivalRow>, MemoryUsageAllocator>,
    /// Each arrival's natural bucket in table order: the arrival-to-bucket lookup, before any
    /// catch-all clamp.
    buckets: Box<IdSlice<ArrivalIndex, Depth>, MemoryUsageAllocator>,
    memory_usage: MemoryUsage,
}

impl ArrivalOverlay {
    /// Builds the overlay of no arrivals, which every query reads as absent.
    pub(crate) fn empty() -> Self {
        let alloc = MemoryUsageAllocator::global();
        let memory_usage = alloc.memory_usage();

        Self {
            slots: Box::new_in([], alloc.clone()),
            arrivals: IdSlice::from_boxed_slice(Box::new_in([], alloc.clone())),
            buckets: IdSlice::from_boxed_slice(Box::new_in([], alloc)),
            memory_usage,
        }
    }

    /// Builds the overlay of the arrivals `proof` admits from `cohort` on `atlas`.
    ///
    /// Each admitted arrival takes its natural bucket by the separation law: one past the
    /// deepest grid it shares with any corpus row or any earlier cohort arrival, saturating at
    /// [`Depth::MAX`] for a full-key co-location. A cascade assigns exactly the same bucket. The
    /// corpus side of that search binary-searches each bucket segment of the code column, whose
    /// keys ascend within a segment, and a sorted-order neighbour attains the deepest shared
    /// grid over a sorted key set.
    ///
    /// Caller requirement: the visible fitted rows are the whole corpus - an operator proof, or
    /// a scope with a saturated node mask. A narrower scope's arrival buckets depend on its own
    /// visible keys, and its cascade build folds the arrivals instead.
    pub(crate) fn of(atlas: &Atlas, proof: &VisibilityProof, cohort: PlacementCohort<'_>) -> Self {
        let universe = cohort.universe(atlas.universe());
        let admitted = admitted_arrivals(proof, cohort);

        let alloc = MemoryUsageAllocator::global();
        let memory_usage = alloc.memory_usage();

        let mut slots = Vec::with_capacity_in(admitted.len(), alloc.clone());
        let mut arrivals = Vec::with_capacity_in(admitted.len(), alloc.clone());
        let mut buckets = Vec::with_capacity_in(admitted.len(), alloc);

        let mut earlier: Vec<MortonKey> = Vec::with_capacity(admitted.len());
        for (identity, arrival) in admitted {
            let (key, row) = ArrivalRow::of(atlas, universe, identity, arrival);

            let mut shared = deepest_corpus_shared(atlas, key);
            let at = earlier.partition_point(|&held| held < key);
            for neighbour in [at.checked_sub(1), (at < earlier.len()).then_some(at)]
                .into_iter()
                .flatten()
            {
                let depth = key.shared_depth(earlier[neighbour]);
                shared = Some(shared.map_or(depth, |held| held.max(depth)));
            }
            earlier.insert(at, key);

            let bucket = shared.map_or(Depth::MIN, |depth| depth.saturating_add(1));
            slots.push(OverlaySlot {
                bucket,
                key,
                arrival: ArrivalIndex::from_usize(arrivals.len()),
            });
            arrivals.push(row);
            buckets.push(bucket);
        }

        slots.sort_unstable_by_key(|slot| (slot.bucket, slot.key, slot.arrival));

        Self {
            slots: slots.into_boxed_slice(),
            arrivals: IdSlice::from_boxed_slice(arrivals.into_boxed_slice()),
            buckets: IdSlice::from_boxed_slice(buckets.into_boxed_slice()),
            memory_usage,
        }
    }

    /// Returns whether the overlay holds no arrival.
    pub(crate) const fn is_empty(&self) -> bool {
        self.slots.is_empty()
    }

    /// Views the arrival table the overlay's delivered vessels address.
    pub(crate) const fn arrivals(&self) -> &IdSlice<ArrivalIndex, ArrivalRow> {
        &self.arrivals
    }

    /// Returns an arrival's natural bucket, before any catch-all clamp.
    ///
    /// A consumer clamps the answer into its own catch-all, exactly as the delivery queries
    /// clamp the slots.
    pub(crate) fn bucket_of(&self, index: ArrivalIndex) -> Depth {
        self.buckets[index]
    }

    /// Returns the overlay's retained heap in bytes: its own allocator's live count.
    ///
    /// The slots, the arrival table, and the bucket lookup allocate through one counting
    /// allocator. The count covers their requested layouts alone. The heap an arrival's
    /// captured display payload owns stays outside it.
    pub(crate) fn heap_bytes(&self) -> u64 {
        self.memory_usage.get() as u64
    }

    /// Returns the slot range of natural bucket `bucket`.
    fn bucket_range(&self, bucket: Depth) -> Range<usize> {
        let start = self.slots.partition_point(|slot| slot.bucket < bucket);
        let end = start + self.slots[start..].partition_point(|slot| slot.bucket == bucket);

        start..end
    }

    /// Returns bucket `bucket`'s delivered arrivals inside `cell` under the catch-all `deepest`,
    /// ascending by `(key, rank)`.
    ///
    /// Buckets above the catch-all read their own entries. The catch-all gathers every entry at
    /// or beyond it, restoring `(key, rank)` order across them, exactly as a cascade's deepest
    /// bucket takes its co-located rows. A bucket past the catch-all holds nothing.
    pub(super) fn run(
        &self,
        bucket: Depth,
        cell: MortonCell,
        deepest: Depth,
    ) -> Vec<(MortonKey, ArrivalIndex)> {
        match bucket.cmp(&deepest) {
            Ordering::Less => {
                let slots = &self.slots[self.bucket_range(bucket)];
                let bounds = ScopeSchedule::cell_bounds(slots, |slot| slot.key, cell);

                slots[bounds]
                    .iter()
                    .map(|slot| (slot.key, slot.arrival))
                    .collect()
            }
            Ordering::Equal => {
                let tail = self.slots.partition_point(|slot| slot.bucket < deepest);
                let slots = &self.slots[tail..];
                let mut gathered: Vec<(MortonKey, ArrivalIndex)> = slots
                    .iter()
                    .filter(|slot| cell.contains(slot.key))
                    .map(|slot| (slot.key, slot.arrival))
                    .collect();
                gathered.sort_unstable();

                gathered
            }
            Ordering::Greater => Vec::new(),
        }
    }

    /// Counts bucket `bucket`'s arrivals inside `cell` under the catch-all `deepest`.
    fn run_count(&self, bucket: Depth, cell: MortonCell, deepest: Depth) -> usize {
        match bucket.cmp(&deepest) {
            Ordering::Less => {
                let slots = &self.slots[self.bucket_range(bucket)];
                ScopeSchedule::cell_bounds(slots, |slot| slot.key, cell).len()
            }
            Ordering::Equal => {
                let tail = self.slots.partition_point(|slot| slot.bucket < deepest);
                self.slots[tail..]
                    .iter()
                    .filter(|slot| cell.contains(slot.key))
                    .count()
            }
            Ordering::Greater => 0,
        }
    }

    /// Counts the arrivals the cumulative schedule through `cut` delivers under `deepest`.
    pub(super) fn delivered_through(&self, cut: Depth, deepest: Depth) -> u64 {
        if cut >= deepest {
            self.slots.len() as u64
        } else {
            self.slots.partition_point(|slot| slot.bucket <= cut) as u64
        }
    }

    /// Returns the deepest occupied overlay bucket under the catch-all `deepest`, [`None`] for
    /// an empty overlay.
    pub(super) fn min_resolution(&self, deepest: Depth) -> Option<Depth> {
        self.slots.last().map(|slot| slot.bucket.min(deepest))
    }

    /// Returns whether `cell` holds an arrival the cumulative schedule through `cut` has yet to
    /// deliver.
    ///
    /// Every natural bucket past `cut` qualifies, because the catch-all clamp keeps a deep
    /// entry inside the served bucket domain. The caller's own early return covers a cut at the
    /// catch-all, below which nothing exists.
    pub(super) fn occupied_past(&self, cut: Depth, cell: MortonCell) -> bool {
        let tail = self.slots.partition_point(|slot| slot.bucket <= cut);
        self.slots[tail..]
            .iter()
            .any(|slot| cell.contains(slot.key))
    }
}
