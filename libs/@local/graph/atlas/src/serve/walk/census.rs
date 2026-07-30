//! Point counts and occupancy over the walkable columns.
//!
//! Every masked count is computed over the visible view alone: a hidden point contributes to no
//! population, no extent, and no resolution, so a scope's numbers carry no evidence of what the
//! mask removed.

use hashql_core::id::{Id as _, bit_vec::DenseBitSet};

use super::Walk;
use crate::{
    identity::NodeRowId,
    math::{Bounds2, Vec2},
    morton::{Depth, MortonCell, MortonKey},
    serve::density::ViewOccupancy,
};

impl Walk<'_> {
    /// Counts the points of `cell` across every occupied bucket.
    ///
    /// The subtree count of a cell without a quad node.
    pub(crate) fn population(&self, cell: MortonCell) -> u64 {
        let lengths = self.morton.fenceposts().lengths();

        let mut population = 0;
        for depth in Depth::all() {
            if lengths[depth.get() as usize] == 0 {
                continue;
            }

            let run = self.run(depth, cell);
            population += u64::from(run.end - run.start);
        }

        population
    }

    /// Counts the visible points of `cell` across every occupied bucket.
    ///
    /// [`population`](Self::population) over the masked view.
    pub(crate) fn visible_population(&self, cell: MortonCell) -> u64 {
        let lengths = self.morton.fenceposts().lengths();

        let mut population = 0;
        for depth in Depth::all() {
            if lengths[depth.get() as usize] == 0 {
                continue;
            }

            population += self
                .run(depth, cell)
                .filter(|&position| self.admits(position))
                .count() as u64;
        }

        population
    }

    /// Inserts the rows of one tile's cumulative delivered set.
    ///
    /// A tile's delivered set is mode-independent - its cumulative delta set equals its total
    /// set - so the gather is one run scan per bucket of the cumulative schedule, deduplicated by
    /// the set itself.
    pub(crate) fn delivered_rows_into(
        &self,
        z: u8,
        cell: MortonCell,
        set: &mut DenseBitSet<NodeRowId>,
    ) {
        for depth in self.grid.cut_buckets(z) {
            for position in self.run(depth, cell) {
                set.insert(NodeRowId::from_u32(self.row_ids[position as usize]));
            }
        }
    }

    /// Returns the deepest occupied bucket, zero when no point exists.
    pub(crate) fn deepest_occupied(&self) -> u64 {
        self.morton
            .fenceposts()
            .lengths()
            .iter()
            .rposition(|&length| length > 0)
            .map_or(0, |bucket| bucket as u64)
    }

    /// Counts the visible points of the cumulative schedule at `cut`.
    pub(crate) fn visible_at(&self, cut: Depth) -> u64 {
        (0..self.segment_end(cut))
            .filter(|&position| self.admits(position))
            .count() as u64
    }

    /// Returns the tight wire-frame extent of the visible set, [`None`] when it is empty.
    pub(crate) fn visible_extent(&self, positions: &[Vec2]) -> Option<Bounds2> {
        Bounds2::from_points(
            positions
                .iter()
                .enumerate()
                .filter(|&(position, _)| {
                    self.admits(u32::try_from(position).expect("base positions fit u32"))
                })
                .map(|(_, &point)| point),
        )
    }

    /// Aggregates the visible view's Morton occupancy.
    ///
    /// One pass over the code column gathers the visible rows' keys, which [`ViewOccupancy::of`]
    /// folds into the occupied-cell counts a delivery-cut policy reads. A hidden row contributes no
    /// key, so it occupies no cell at any depth: the aggregate is a statement about the view and
    /// nothing else.
    ///
    /// The gather owns its keys, since the fold sorts them; the proof's own visible count sizes the
    /// buffer exactly.
    pub(crate) fn visible_occupancy(&self) -> ViewOccupancy {
        let count = self.morton.count();
        let visible = usize::try_from(self.proof.visible_below(count))
            .expect("a visible row count fits usize");

        let mut keys: Vec<MortonKey> = Vec::with_capacity(visible);
        for position in 0..super::narrow(count) {
            if self.admits(position) {
                keys.push(self.morton.code(u64::from(position)));
            }
        }

        ViewOccupancy::of(&mut keys)
    }

    /// Returns the deepest bucket holding a visible point, zero when none does.
    pub(crate) fn visible_deepest(&self) -> u64 {
        Depth::all()
            .rev()
            .find(|&bucket| {
                self.morton
                    .fenceposts()
                    .segment(bucket)
                    .any(|position| self.admits(super::narrow(position)))
            })
            .map_or(0, |bucket| u64::from(bucket.get()))
    }
}
