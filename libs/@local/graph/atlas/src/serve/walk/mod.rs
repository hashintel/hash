//! The LOD walk: schedule-driven point delivery over one generation's spatial columns.
//!
//! A tile's delivery reads the Morton column through the bucket schedule: zoom `z` delivers the
//! buckets at or below its cut, each bucket contributing the code-column run of the tile's cell.
//! [`Walk`] carries the columns that walk needs - the quadtree, the Morton column, the row column,
//! the validated schedule - bound to one visibility proof, and the submodules deliver over it:
//!
//! - [`full`]: the full-visibility deliveries, borrowed-shape base-order ranges.
//! - [`census`]: point counts and occupancy, unmasked and masked.
//!
//! A scoped view's delivery reads its own cascade instead - [`ScopeSchedule`] - built over
//! exactly the rows its proof admits; the walk supplies that build's gather and the per-tile
//! masked counts.
//!
//! Positions, counts, and run lengths live in the `u32` domain: the open pass validated the point
//! count against it, so the walk's conversions from the columns' `u64` storage are total.
//!
//! [`ScopeSchedule`]: super::schedule::ScopeSchedule

mod census;
mod full;

use core::ops::Range;

pub use self::census::ViewCensus;
pub(super) use self::full::occupied_children;
use super::{Atlas, grid::Grid, visibility::VisibilityProof};
use crate::{
    file::{
        morton::read::MortonFile,
        quad::{Node, read::QuadFile},
    },
    identity::{BasePosition, NodeRowId},
    morton::{Depth, MortonCell},
    salt::wire::tile::DeliveredSet,
};

/// One generation's walkable columns under one visibility proof.
///
/// The value borrows the opened generation, so construction is free per request and the walk
/// methods take no column parameters.
#[derive(Debug, Copy, Clone)]
pub(super) struct Walk<'atlas> {
    grid: Grid,
    morton: &'atlas MortonFile,
    quad: &'atlas QuadFile,
    row_ids: &'atlas [NodeRowId],
    proof: &'atlas VisibilityProof,
}

impl<'atlas> Walk<'atlas> {
    /// Binds the generation's spatial columns to `proof`.
    pub(super) fn of(atlas: &'atlas Atlas, proof: &'atlas VisibilityProof) -> Self {
        Self {
            grid: atlas.grid,
            morton: &atlas.morton,
            quad: &atlas.quad,
            row_ids: atlas.rows.view(),
            proof,
        }
    }

    /// Returns the quad node owning `cell`.
    ///
    /// [`None`] when the schedule delivers nothing new at or below it.
    pub(super) fn node_of(&self, cell: MortonCell) -> Option<&'atlas Node> {
        let index = self.quad.locate(cell)?;
        Some(&self.quad.nodes()[index as usize])
    }

    /// Returns whether the proof admits the row at base position `position`.
    fn admits(&self, position: u32) -> bool {
        self.proof.contains(self.row_ids[position as usize])
    }

    /// Returns bucket `depth`'s positions inside `cell`, in the validated `u32` position domain.
    fn run(&self, depth: Depth, cell: MortonCell) -> Range<u32> {
        narrow_run(self.morton.run(depth, cell))
    }

    /// Returns the position count of the cumulative schedule at `cut`.
    fn segment_end(&self, cut: Depth) -> u32 {
        narrow(self.morton.fenceposts().segment(cut).end)
    }

    /// Returns bucket `depth`'s point count.
    fn bucket_length(&self, depth: Depth) -> u32 {
        narrow(self.morton.fenceposts().lengths()[depth.get() as usize])
    }
}

/// Narrows a position run into the validated `u32` position domain.
fn narrow_run(run: Range<u64>) -> Range<u32> {
    narrow(run.start)..narrow(run.end)
}

/// Narrows a position, count, or run length into the validated `u32` position domain.
fn narrow(value: u64) -> u32 {
    u32::try_from(value).expect("open validated the point count against the u32 domain")
}

/// The delivered point set of one tile.
///
/// Borrowed-shape ranges when every row is visible, a gathered ascending position list under a
/// mask.
#[derive(Debug)]
pub(super) enum DeliveredPoints {
    /// Contiguous base-position ranges in delivery order.
    Ranges(Vec<Range<BasePosition>>),
    /// Gathered base positions, ascending, visibility already applied.
    Positions(Vec<BasePosition>),
}

impl DeliveredPoints {
    /// Views the set in the wire encoder's borrowed shape.
    pub(super) const fn as_wire(&self) -> DeliveredSet<'_> {
        match self {
            Self::Ranges(ranges) => DeliveredSet::Ranges(ranges),
            Self::Positions(list) => DeliveredSet::Positions(list),
        }
    }

    /// Counts the delivered points.
    pub(super) fn count(&self) -> usize {
        match self {
            Self::Ranges(ranges) => ranges.iter().map(Range::len).sum(),
            Self::Positions(list) => list.len(),
        }
    }

    /// Iterates the delivered base positions in delivery order.
    pub(super) fn iter(&self) -> PositionIter<'_> {
        match self {
            Self::Ranges(ranges) => PositionIter {
                ranges: ranges.iter(),
                current: 0..0,
                list: [].iter(),
            },
            Self::Positions(list) => PositionIter {
                ranges: [].iter(),
                current: 0..0,
                list: list.iter(),
            },
        }
    }
}

/// An iterator over a delivered set's base positions, in delivery order.
#[derive(Debug)]
pub(super) struct PositionIter<'set> {
    /// The remaining ranges of a range-shaped set.
    ranges: core::slice::Iter<'set, Range<u32>>,
    /// The positions remaining in the current range.
    current: Range<u32>,
    /// The remaining positions of a list-shaped set.
    list: core::slice::Iter<'set, u32>,
}

impl Iterator for PositionIter<'_> {
    type Item = u32;

    fn next(&mut self) -> Option<u32> {
        loop {
            if let Some(position) = self.current.next() {
                return Some(position);
            }

            match self.ranges.next() {
                Some(range) => self.current = range.clone(),
                None => return self.list.next().copied(),
            }
        }
    }
}
