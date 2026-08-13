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
//! `(bucket, key, rank)` order therefore serves every admissible `k`. Buckets above the cut read as
//! slot ranges, and only the catch-all tail re-sorts into Morton order, once per offset, on first
//! read.

use alloc::{collections::BinaryHeap, sync::Arc};
use core::{
    cmp::{Ordering, Reverse},
    ops::Range,
};
use std::sync::OnceLock;

use hashql_core::id::{Id as _, IdArray, IdSlice};

use super::grid::Grid;
use crate::{
    identity::{BasePosition, ImportanceRank},
    morton::{Depth, MortonCell, MortonKey},
    salt::lod::cascade,
    serve::{Atlas, VisibilityProof, density::CutOffset, visibility::ProofKind},
};

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
/// An operator proof serves the generation's own corpus schedule; a scoped proof serves the
/// cascade built over exactly its visible rows. The constructor derives the variant from the
/// proof, so production has one build site and the pairing law in one place.
///
/// Caller requirement: as with the census, a schedule travels with the proof it derives from.
/// Assembly refuses a proof paired with the other variant's schedule.
#[derive(Debug, Clone)]
pub(crate) enum ViewSchedule {
    /// The generation's corpus schedule, where every zoom keeps its recorded cut.
    Corpus,
    /// The view's own cascade, shared by every request of its scope.
    Scope(Arc<ScopeSchedule>),
}

impl ViewSchedule {
    /// Derives the schedule variant `proof` serves under.
    ///
    /// An operator proof reads the corpus artifacts; any scoped proof - saturated or empty
    /// included - serves a cascade, because the serving contract follows the scope declaration
    /// rather than the visible cardinality. A scope whose node mask admits the whole corpus
    /// reads the generation's shared saturated cascade instead of building one. A cascade is a
    /// function of the visible node rows alone, so every saturated scope builds identical
    /// buckets and the sharing changes which allocation answers, never which contract.
    #[must_use]
    pub(crate) fn of(atlas: &Atlas, proof: &VisibilityProof) -> Self {
        match proof.kind() {
            ProofKind::Corpus => Self::Corpus,
            ProofKind::Scope if proof.nodes_saturated_below(atlas.morton.count()) => {
                Self::Scope(Arc::clone(atlas.saturated_scope_schedule()))
            }
            ProofKind::Scope => Self::Scope(Arc::new(ScopeSchedule::of(atlas, proof))),
        }
    }
}

/// One visible row of the cascade's input.
///
/// The base position addresses the generation's columns; the key and rank are the row's pinned
/// generation-layout values. These three are the whole vocabulary the schedule reads.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ScopeRow {
    /// The row's slot in the generation's base order.
    pub position: BasePosition,
    /// The row's Morton key, quantized from the delivered coordinate column.
    pub key: MortonKey,
    /// The row's corpus importance rank. Its order restricted to the view ranks the view.
    pub rank: ImportanceRank,
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
pub struct ScheduleWidthError {
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

/// The scope cascade of one visible view, computed once and read at any admissible cut offset.
///
/// Construction assigns every visible row the shallowest grid depth at which it is its cell's
/// first representative in rank order - the same first-occupant law behind the corpus schedule -
/// and orders the slots bucket-major, ascending by key inside a bucket, rank breaking exact-key
/// ties. [`Self::cut`] binds a resolved offset over the result. The value is immutable after
/// construction and per-offset catch-all tails materialize behind [`OnceLock`]s, so one schedule
/// serves every request of its scope concurrently.
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
    slots: Box<IdSlice<ScopeSlot, SlottedRow>>,
    /// Each fencepost's slot: bucket `b` spans its opening post's slot to its closing post's.
    posts: IdArray<BucketPost, ScopeSlot, { Self::BUCKETS + 1 }>,
    /// The natural buckets ascending by position: the row-to-bucket lookup, binary-searched.
    by_position: Box<[PositionBucket]>,
    /// Per-cut catch-all tails, keyed by the catch-all's opening post, built on first read.
    tails: IdArray<BucketPost, OnceLock<Box<[ScopeRow]>>, { Self::BUCKETS }>,
}

impl ScopeSchedule {
    /// The natural bucket domain: depths `0..=32` of the complete Morton key.
    const BUCKETS: usize = Depth::MAX.get() as usize + 1;

    /// Builds the cascade over the visible view `proof` admits on `atlas`.
    ///
    /// One pass over the base columns gathers each admitted row's position, pinned key, and pinned
    /// rank. [`Self::over`] assigns the buckets.
    pub(crate) fn of(atlas: &Atlas, proof: &VisibilityProof) -> Self {
        let row_ids = atlas.rows.view();
        let ranks = atlas.ranks.view();

        let visible = usize::try_from(proof.visible_below(atlas.morton.count()))
            .expect("a visible row count fits usize");
        let mut rows = Vec::with_capacity(visible);
        for (position, &row) in row_ids.iter_enumerated() {
            if proof.contains(row) {
                rows.push(ScopeRow {
                    position,
                    key: atlas.morton.code(position),
                    rank: ranks[position],
                });
            }
        }

        // The base order is bucket-major and ascends by (key, rank) inside a bucket, so the
        // position-ordered gather is one ascending run per corpus bucket. Merging the runs hands
        // `over` its (key, rank) order without a comparison sort over the view.
        let runs = atlas.morton.fenceposts().segments().map(|segment| {
            let start = rows.partition_point(|row| row.position < segment.start);
            let end = start + rows[start..].partition_point(|row| row.position < segment.end);
            start..end
        });

        Self::over(merge_key_order(&rows, &runs))
    }

    /// Builds the cascade over exactly the given rows.
    ///
    /// [`cascade::separation_buckets`] assigns each row its natural bucket - the assignment
    /// [`cascade::buckets`], the function behind the corpus schedule at fit time, computes at
    /// [`Depth::MAX`] - in one pass over the rows' `(key, rank)` order. Rows co-located at the
    /// complete key width never claim a cell and take the deepest bucket, exactly as the corpus
    /// catch-all takes them. An empty view builds an empty schedule, which delivers nothing and
    /// occupies no cell at any depth.
    pub(crate) fn over(mut rows: Vec<ScopeRow>) -> Self {
        // A merged gather arrives already ordered, and the sort degenerates to one verification
        // pass. The ranks are distinct because the corpus rank column is a permutation and the
        // view restricts it.
        rows.sort_unstable_by_key(|row| (row.key, row.rank));
        let buckets = cascade::separation_buckets(&rows, |row| row.key, |row| row.rank);

        // Slot order: bucket-major, ascending key within a bucket, rank breaking exact-key
        // ties. One sorted column is the whole schedule.
        let mut slots: Vec<SlottedRow> = rows
            .into_iter()
            .zip(&*buckets)
            .map(|(row, &bucket)| SlottedRow { bucket, row })
            .collect();
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

        let mut by_position: Vec<PositionBucket> = slots
            .iter()
            .map(|slot| PositionBucket {
                position: slot.row.position,
                bucket: slot.bucket,
            })
            .collect();
        by_position.sort_unstable_by_key(|entry| entry.position);

        Self {
            slots: IdSlice::from_boxed_slice(slots.into_boxed_slice()),
            posts,
            by_position: by_position.into_boxed_slice(),
            tails: IdArray::from_fn(|_| OnceLock::new()),
        }
    }

    /// Binds one resolved cut offset over the cascade.
    ///
    /// The bound cut serves `grid`'s zooms at `d(z) = z + span + k`, with the deepest bucket
    /// `max_tile_depth + span + k` as the catch-all.
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
    pub(super) fn cut(
        &self,
        grid: Grid,
        k: CutOffset,
    ) -> Result<ScheduleCut<'_>, ScheduleWidthError> {
        let width_error = ScheduleWidthError {
            max_tile_depth: grid.max_tile_depth(),
            span: grid.span_log2(),
            k,
        };
        let deepest = grid
            .max_tile_depth()
            .checked_add(grid.span_log2())
            .and_then(|schedule| schedule.checked_add(k.get()))
            .and_then(Depth::new)
            .ok_or(width_error)?;

        Ok(ScheduleCut {
            schedule: self,
            span: grid.span_log2(),
            k,
            deepest,
        })
    }

    /// Returns one natural bucket's slots.
    fn bucket_slots(&self, bucket: Depth) -> &[SlottedRow] {
        let range = Range {
            start: self.posts[BucketPost::opening(bucket)],
            end: self.posts[BucketPost::closing(bucket)],
        };

        &self.slots[range]
    }

    /// Returns the catch-all tail at `deepest`, building it on first read.
    ///
    /// The tail is every row whose natural bucket lies at or beyond the cut, re-sorted from
    /// bucket-major order into `(key, rank)` order - the order law every shallower bucket
    /// already satisfies.
    fn tail(&self, deepest: Depth) -> &[ScopeRow] {
        let opening = BucketPost::opening(deepest);
        self.tails[opening].get_or_init(|| {
            let start = self.posts[opening];
            let mut tail: Vec<ScopeRow> = self.slots[start..].iter().map(|slot| slot.row).collect();
            tail.sort_unstable_by_key(|row| (row.key, row.rank));

            tail.into_boxed_slice()
        })
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

/// One scope schedule read at one resolved cut offset.
///
/// The delivery vocabulary of a restricted response: zoom `z` cuts at `d(z) = z + span + k`, the
/// deepest bucket is the catch-all, and every query answers from the cascade's buckets alone.
#[expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]
#[derive(Debug, Copy, Clone)]
pub(crate) struct ScheduleCut<'schedule> {
    schedule: &'schedule ScopeSchedule,
    /// The generation's span exponent.
    span: u8,
    /// The resolved cut offset.
    k: CutOffset,
    /// The deepest scope bucket: `max_tile_depth + span + k`, the catch-all.
    deepest: Depth,
}

impl ScheduleCut<'_> {
    /// Returns the delivery cut of zoom `z`: buckets at or below it form the zoom's cumulative
    /// schedule.
    ///
    /// # Panics
    ///
    /// This panics beyond the served grid. A zoom above the generation's deepest tile is a caller
    /// defect rather than request data, because request validation rejects it first.
    pub(crate) fn cut_of(&self, z: u8) -> Depth {
        let cut = z + self.span + self.k.get();
        assert!(
            cut <= self.deepest.get(),
            "the schedule serves zooms 0..=max_tile_depth",
        );
        Depth::new(cut).expect("binding validated the deepest cut against the key width")
    }

    /// Returns the resolved offset this cut binds.
    pub(crate) const fn offset(&self) -> CutOffset {
        self.k
    }

    /// Returns the deepest scope bucket: the catch-all.
    pub(crate) const fn deepest(&self) -> Depth {
        self.deepest
    }

    /// Feeds one bucket's delivered positions inside `cell` to `deliver`, ascending by
    /// `(key, rank)`, and returns the run length.
    ///
    /// Buckets above the catch-all read from the slot column; the catch-all reads from its
    /// tail. A bucket past the catch-all holds nothing by construction.
    fn run(&self, bucket: Depth, cell: MortonCell, deliver: &mut impl FnMut(BasePosition)) -> u32 {
        match bucket.cmp(&self.deepest) {
            Ordering::Less => {
                let slots = self.schedule.bucket_slots(bucket);
                let bounds = ScopeSchedule::cell_bounds(slots, |slot| slot.row.key, cell);
                let count = bounds.len();
                for slot in &slots[bounds] {
                    deliver(slot.row.position);
                }
                u32::try_from(count).expect("run lengths lie within the u32 universe")
            }
            Ordering::Equal => {
                let tail = self.schedule.tail(self.deepest);
                let bounds = ScopeSchedule::cell_bounds(tail, |row| row.key, cell);
                let count = bounds.len();
                for row in &tail[bounds] {
                    deliver(row.position);
                }
                u32::try_from(count).expect("run lengths lie within the u32 universe")
            }
            Ordering::Greater => 0,
        }
    }

    /// Counts one bucket's rows inside `cell` without delivering them.
    fn run_count(&self, bucket: Depth, cell: MortonCell) -> usize {
        match bucket.cmp(&self.deepest) {
            Ordering::Less => {
                let slots = self.schedule.bucket_slots(bucket);
                ScopeSchedule::cell_bounds(slots, |slot| slot.row.key, cell).len()
            }
            Ordering::Equal => {
                let tail = self.schedule.tail(self.deepest);
                ScopeSchedule::cell_bounds(tail, |row| row.key, cell).len()
            }
            Ordering::Greater => 0,
        }
    }

    /// Returns whether `cell` holds a view row in any bucket of `buckets`.
    fn occupied(&self, buckets: Range<u8>, cell: MortonCell) -> bool {
        buckets
            .filter_map(Depth::new)
            .any(|bucket| self.run_count(bucket, cell) > 0)
    }

    /// Counts the view's rows delivered by the root's cumulative schedule.
    ///
    /// The root's visible count covers rows whose scope bucket lies at or below `d(0)`.
    pub(crate) fn root_delivered(&self) -> u64 {
        let cut = self.cut_of(0);
        if cut >= self.deepest {
            self.schedule.slots.len() as u64
        } else {
            u64::from(self.schedule.posts[BucketPost::closing(cut)].as_u32())
        }
    }

    /// Returns the deepest occupied scope bucket, zero for an empty view.
    pub(crate) fn min_resolution(&self) -> u64 {
        let deepest_natural = Depth::all().rev().find(|&bucket| {
            self.schedule.posts[BucketPost::closing(bucket)]
                > self.schedule.posts[BucketPost::opening(bucket)]
        });

        deepest_natural.map_or(0, |bucket| u64::from(bucket.min(self.deepest).get()))
    }

    /// Reads the occupied-child bitmask of `cell` at zoom `z`.
    ///
    /// Bit `i` is one exactly when Morton child `i` holds a view row the cumulative schedule
    /// through `d(z)` has yet to deliver - a row whose scope bucket exceeds the cut. The deepest
    /// zoom's cut is the catch-all, below which nothing exists, so its bitmask is zero.
    pub(crate) fn children(&self, z: u8, cell: MortonCell) -> u8 {
        let cut = self.cut_of(z);
        if cut >= self.deepest {
            return 0;
        }

        let Some(children) = cell.children() else {
            return 0;
        };

        let mut bits = 0_u8;
        for (index, child) in children.into_iter().enumerate() {
            let occupied = self.occupied((cut.get() + 1)..(self.deepest.get() + 1), child);
            bits |= u8::from(occupied) << index;
        }

        bits
    }

    /// Returns the first zoom whose cumulative schedule delivers `position`, [`None`] when the
    /// position is not in the view.
    ///
    /// [`Self::cut_of`] inverted. Bucket `b` first enters at zoom `b - span - k`, clamped to the
    /// root for the buckets the root itself spans. The catch-all inverts to the deepest served
    /// zoom, because binding proved `deepest = max_tile_depth + span + k`. Every row of the view
    /// therefore has a delivering zoom on the served grid.
    ///
    /// The scope counterpart of [`Grid::first_zoom`], which answers the same question for an
    /// operator view off the corpus fenceposts.
    pub(crate) fn first_zoom(&self, position: BasePosition) -> Option<u8> {
        let bucket = self.bucket_of(position)?;

        // Binding validated `max_tile_depth + span + k` into the key width, so the subtrahend is
        // itself a depth and the difference is a served zoom.
        Some(bucket.get().saturating_sub(self.span + self.k.get()))
    }

    /// Returns a position's scope bucket, [`None`] when the position is not in the view.
    ///
    /// The natural bucket clamped into the catch-all.
    pub(crate) fn bucket_of(&self, position: BasePosition) -> Option<Depth> {
        let index = self
            .schedule
            .by_position
            .binary_search_by_key(&position, |entry| entry.position)
            .ok()?;

        Some(self.schedule.by_position[index].bucket.min(self.deepest))
    }

    /// Assembles zoom `z`'s delta delivery inside `cell`.
    ///
    /// The root delivers its whole cumulative schedule, buckets `0..=d(0)`; every deeper zoom
    /// delivers exactly its own cut bucket `d(z)`, one run. Runs keep their positional slot when
    /// empty, so accumulation down an ancestry reproduces the total response as a set.
    pub(crate) fn delta(&self, z: u8, cell: MortonCell) -> ScopeDelivery {
        let cut = self.cut_of(z);
        let first = if z == 0 { Depth::MIN } else { cut };

        self.gather(first, cut, cell)
    }

    /// Assembles zoom `z`'s total delivery inside `cell`: buckets `0..=d(z)`.
    pub(crate) fn total(&self, z: u8, cell: MortonCell) -> ScopeDelivery {
        self.gather(Depth::MIN, self.cut_of(z), cell)
    }

    /// Gathers the contiguous bucket interval `first..=last` inside `cell`.
    fn gather(&self, first: Depth, last: Depth, cell: MortonCell) -> ScopeDelivery {
        let mut positions = Vec::new();
        let mut runs = Vec::with_capacity(usize::from(last.get() - first.get()) + 1);

        for bucket in (first.get()..=last.get()).filter_map(Depth::new) {
            let count = self.run(bucket, cell, &mut |position| {
                positions.push(position);
            });
            runs.push(count);
        }

        ScopeDelivery {
            positions,
            first_bucket: first.get(),
            runs,
        }
    }
}

/// Merges the gather's per-bucket runs into one `(key, rank)`-ascending column.
///
/// Each run must ascend by `(key, rank)` on its own, which the base order guarantees inside one
/// corpus bucket. The heap holds one head per unexhausted run, so the merge costs
/// `O(rows · log(runs))`.
fn merge_key_order(rows: &[ScopeRow], runs: &[Range<usize>]) -> Vec<ScopeRow> {
    let mut next: Vec<_> = runs.iter().map(|run| run.start).collect();
    let mut heap: BinaryHeap<_> = BinaryHeap::with_capacity(runs.len());

    for (index, run) in runs.iter().enumerate() {
        if next[index] < run.end {
            let row = rows[next[index]];
            heap.push(Reverse((row.key, row.rank, index)));
        }
    }

    let mut merged = Vec::with_capacity(rows.len());
    while let Some(Reverse((_, _, index))) = heap.pop() {
        merged.push(rows[next[index]]);
        next[index] += 1;

        if next[index] < runs[index].end {
            let row = rows[next[index]];
            heap.push(Reverse((row.key, row.rank, index)));
        }
    }

    merged
}

/// The gathered positions and the wire head's run vocabulary of one scope delivery.
#[derive(Debug)]
pub(crate) struct ScopeDelivery {
    /// The delivered base positions, bucket-major, ascending by `(key, rank)` within a bucket.
    pub positions: Vec<BasePosition>,
    /// The first bucket the runs describe.
    pub first_bucket: u8,
    /// Per-bucket delivered counts, bucket-major from `first_bucket`.
    pub runs: Vec<u32>,
}
