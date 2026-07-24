//! Point counts and occupancy over the walkable columns.
//!
//! Every masked count is computed over the visible view alone: a hidden point contributes to no
//! population, no extent, and no resolution, so a scope's numbers carry no evidence of what the
//! mask removed.

use super::Walk;
use crate::{
    bitset::BitSet,
    math::{Bounds2, Vec2},
    morton::{Depth, MortonCell},
};

impl Walk<'_> {
    /// Counts the points of `cell` across every occupied bucket.
    ///
    /// The subtree count of a cell without a quad node.
    pub(in crate::serve) fn population(&self, cell: MortonCell) -> u64 {
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
    pub(in crate::serve) fn visible_population(&self, cell: MortonCell) -> u64 {
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
    pub(in crate::serve) fn delivered_rows_into(&self, z: u8, cell: MortonCell, set: &mut BitSet) {
        for depth in self.grid.cut_buckets(z) {
            for position in self.run(depth, cell) {
                set.insert(self.row_ids[position as usize] as usize);
            }
        }
    }

    /// Returns the deepest occupied bucket, zero when no point exists.
    pub(in crate::serve) fn deepest_occupied(&self) -> u64 {
        self.morton
            .fenceposts()
            .lengths()
            .iter()
            .rposition(|&length| length > 0)
            .map_or(0, |bucket| bucket as u64)
    }

    /// Counts the visible points of the cumulative schedule at `cut`.
    pub(in crate::serve) fn visible_at(&self, cut: Depth) -> u64 {
        (0..self.segment_end(cut))
            .filter(|&position| self.admits(position))
            .count() as u64
    }

    /// Returns the tight wire-frame extent of the visible set, [`None`] when it is empty.
    pub(in crate::serve) fn visible_extent(&self, positions: &[Vec2]) -> Option<Bounds2> {
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

    /// Returns the deepest bucket holding a visible point, zero when none does.
    pub(in crate::serve) fn visible_deepest(&self) -> u64 {
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
