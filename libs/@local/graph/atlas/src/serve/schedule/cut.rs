//! One scope schedule bound to one resolved cut offset.
//!
//! [`ScheduleCut`] is the delivery vocabulary of a restricted response: zoom `z` cuts at
//! `d(z) = z + span + k`, with the deepest bucket as the catch-all. Every delivery query - runs,
//! child bitmasks, first zooms, the root's counts - answers from the cascade's buckets alone.
//! Binding lives here too, because the cut owns the refusal of an offset past the key width.

use core::{cmp::Ordering, ops::Range};

use hashql_core::id::Id as _;

use super::{BucketPost, ScheduleWidthError, ScopeRow, ScopeSchedule};
use crate::{
    identity::BasePosition,
    morton::{Depth, MortonCell},
    serve::{density::CutOffset, grid::Grid},
};

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

impl<'schedule> ScheduleCut<'schedule> {
    /// Binds one resolved cut offset over `schedule`.
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
    pub(super) fn bind(
        schedule: &'schedule ScopeSchedule,
        grid: Grid,
        k: CutOffset,
    ) -> Result<Self, ScheduleWidthError> {
        let width_error = ScheduleWidthError {
            max_tile_depth: grid.max_tile_depth(),
            span: grid.span_log2(),
            k,
        };
        let deepest = grid
            .max_tile_depth()
            .checked_add(grid.span_log2())
            .and_then(|depth| depth.checked_add(k.get()))
            .and_then(Depth::new)
            .ok_or(width_error)?;

        Ok(Self {
            schedule,
            span: grid.span_log2(),
            k,
            deepest,
        })
    }
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
    /// Buckets above the catch-all read one slot range each. The catch-all gathers its cell's
    /// rows from every bucket at or beyond the cut - each already `(key, rank)`-sorted inside
    /// the column - and restores that order across them for exactly the delivered rows. A
    /// bucket past the catch-all holds nothing by construction.
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
                let mut rows: Vec<ScopeRow> = Vec::new();
                for bucket in (self.deepest.get()..=Depth::MAX.get()).filter_map(Depth::new) {
                    let slots = self.schedule.bucket_slots(bucket);
                    let bounds = ScopeSchedule::cell_bounds(slots, |slot| slot.row.key, cell);
                    rows.extend(slots[bounds].iter().map(|slot| slot.row));
                }

                rows.sort_unstable_by_key(|row| (row.key, row.rank));
                let count = rows.len();
                for row in rows {
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
            Ordering::Equal => (self.deepest.get()..=Depth::MAX.get())
                .filter_map(Depth::new)
                .map(|bucket| {
                    let slots = self.schedule.bucket_slots(bucket);
                    ScopeSchedule::cell_bounds(slots, |slot| slot.row.key, cell).len()
                })
                .sum(),
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
    /// The root delivers its whole cumulative schedule, buckets `0..=d(0)`. Every deeper zoom
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
