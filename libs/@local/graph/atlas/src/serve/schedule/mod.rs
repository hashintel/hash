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

use alloc::sync::Arc;
use core::ops::Range;
use std::sync::OnceLock;

use hashql_core::id::{Id as _, IdArray, IdSlice};

pub(crate) use self::cut::ScheduleCut;
use super::grid::Grid;
use crate::{
    identity::{BasePosition, ImportanceRank},
    morton::{Depth, MortonCell, MortonKey},
    salt::lod::cascade,
    serve::{Atlas, VisibilityProof, density::CutOffset, visibility::ProofKind},
};

mod cut;

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
/// An operator proof serves the generation's own corpus schedule, and a scoped proof serves the
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
    /// An operator proof reads the corpus artifacts. Any scoped proof - saturated or empty
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
    /// The row's rank within the view: dense, ascending in corpus rank order.
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
    /// The gather traverses the generation's reverse rank column - the rank column's inverse by
    /// the fit pipeline's construction, spot-checked at open - in rank order and keeps the
    /// positions whose rows `proof` admits. The view's
    /// rows therefore arrive rank-ascending, and each row's local rank is its arrival ordinal:
    /// dense and pairwise distinct by construction. [`Self::over`] assigns the buckets.
    pub(crate) fn of(atlas: &Atlas, proof: &VisibilityProof) -> Self {
        let row_ids = atlas.rows.view();

        let visible = usize::try_from(proof.visible_below(atlas.morton.count()))
            .expect("a visible row count fits usize");
        let mut rows = Vec::with_capacity(visible);
        for &position in atlas.positions_of_rank.view() {
            if proof.contains(row_ids[position]) {
                rows.push(ScopeRow {
                    position,
                    key: atlas.morton.code(position),
                    rank: ImportanceRank::from_usize(rows.len()),
                });
            }
        }

        Self::over(rows)
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
    /// Caller requirement: the rows' ranks are pairwise distinct. [`Self::of`] guarantees that by
    /// enumeration, and a fixture caller owes the same property.
    pub(crate) fn over(mut rows: Vec<ScopeRow>) -> Self {
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
        ScheduleCut::bind(self, grid, k)
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
