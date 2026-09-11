//! The LOD walk: schedule-driven point delivery over one generation's spatial columns.
//!
//! A tile's delivery reads the Morton column through the bucket schedule. Zoom `z` delivers the
//! buckets at or below its cut, each bucket contributing the code-column run of the tile's cell.
//! [`Walk`] carries the columns that walk needs - the quadtree, the Morton column, the row column,
//! the validated schedule - bound to one visibility proof, and the submodules deliver over it:
//!
//! - [`full`]: the full-visibility deliveries, borrowed-shape base-order ranges, with the view's
//!   arrivals spliced among them.
//! - [`census`]: point counts and occupancy, unmasked and masked.
//!
//! A scoped view's delivery reads its own cascade instead - [`ScopeSchedule`] - built over exactly
//! the rows its proof admits. The walk supplies that build's gather and the per-tile masked counts.
//!
//! Positions, counts, and run lengths live in the `u32` domain: the position type owns that width
//! at every fencepost accessor, so every segment and run the walk reads is already typed.
//!
//! [`ScopeSchedule`]: super::schedule::ScopeSchedule

mod census;
pub(super) mod full;
pub(super) mod subtract;

use core::ops::Range;

use hashql_core::id::{Id as _, IdSlice};

pub(crate) use self::census::ViewCensus;
use super::{
    Atlas,
    grid::Grid,
    schedule::{Splice, ViewRow},
    visibility::VisibilityProof,
};
use crate::{
    file::{
        morton::read::MortonFile,
        quad::{Node, read::QuadFile},
    },
    identity::{BasePosition, NodeRowId},
    morton::{Depth, MortonCell},
    salt::wire::tile::{DeliveredRows, DeliveredSet},
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
    row_ids: &'atlas IdSlice<BasePosition, NodeRowId>,
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
    fn admits(&self, position: BasePosition) -> bool {
        self.proof.contains(self.row_ids[position])
    }

    /// Returns bucket `depth`'s positions inside `cell`.
    fn run(&self, depth: Depth, cell: MortonCell) -> Range<BasePosition> {
        self.morton.run(depth, cell)
    }

    /// Returns the first position past the cumulative schedule at `cut`.
    fn segment_end(&self, cut: Depth) -> BasePosition {
        self.morton.fenceposts().segment(cut).end
    }

    /// Returns bucket `depth`'s point count.
    fn bucket_length(&self, depth: Depth) -> u32 {
        let segment = self.morton.fenceposts().segment(depth);
        segment.end.as_u32() - segment.start.as_u32()
    }
}

/// The delivered point set of one tile.
///
/// Borrowed-shape ranges when every row is visible, a gathered row list under a mask, and ranges
/// with spliced arrivals when an operator delivery interleaves a cohort, where a row is either a
/// base position or a cohort arrival.
#[derive(Debug)]
pub(super) enum DeliveredPoints {
    /// Contiguous base-position ranges in delivery order.
    Ranges(Vec<Range<BasePosition>>),
    /// Gathered view rows in delivery order, visibility already applied.
    Positions(Vec<ViewRow>),
    /// Contiguous base-position ranges with arrivals spliced among them.
    Spliced {
        /// The delivered base-position ranges, in delivery order.
        ranges: Vec<Range<BasePosition>>,
        /// The spliced arrivals, ascending by delivery index.
        splices: Vec<Splice>,
    },
}

impl DeliveredPoints {
    /// Views the set in the wire encoder's borrowed shape.
    pub(super) const fn as_wire(&self) -> DeliveredSet<'_> {
        match self {
            Self::Ranges(ranges) => DeliveredSet::Ranges(ranges),
            Self::Positions(list) => DeliveredSet::Positions(list),
            Self::Spliced { ranges, splices } => DeliveredSet::Spliced { ranges, splices },
        }
    }

    /// Counts the delivered points.
    pub(super) fn count(&self) -> usize {
        match self {
            Self::Ranges(ranges) => ranges
                .iter()
                .map(|range| range.end.as_usize() - range.start.as_usize())
                .sum(),
            Self::Positions(list) => list.len(),
            Self::Spliced { ranges, splices } => {
                let bases: usize = ranges
                    .iter()
                    .map(|range| range.end.as_usize() - range.start.as_usize())
                    .sum();

                bases + splices.len()
            }
        }
    }

    /// Iterates the delivered rows in delivery order, a range's positions as base rows.
    pub(super) fn iter(&self) -> DeliveredRows<'_> {
        self.as_wire().into_iter()
    }
}
