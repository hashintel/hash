//! Point counts and occupancy over the walkable columns.
//!
//! Every masked count covers the visible view alone. A hidden point adds nothing to population,
//! extent, or resolution, so a scope's numbers carry no evidence of what the mask removed.

use hashql_core::id::{Id as _, IdSlice, bit_vec::DenseBitSet};

use super::Walk;
use crate::{
    identity::{BasePosition, NodeRowId},
    math::{Bounds2, Vec2},
    morton::{Depth, MortonCell, MortonKey},
    serve::{density::ViewOccupancy, visibility::ProofKind},
};

/// The corpus-wide census of one visible view.
///
/// The aggregates a root tile publishes about the whole view rather than about its own cell - how
/// many points the root's schedule delivers, where the visible set lies, and how deep it goes.
/// Every one of them is a function of the generation's artifacts and the proof alone rather than of
/// the request, so a scope resolves its census once and every root-tile request under it reads that
/// census.
///
/// A hidden point contributes to none of the three, so a scope's census carries no evidence of what
/// its mask removed.
///
/// The census type differs from [`ViewOccupancy`] on purpose. An occupancy counts occupied *cells*
/// per depth, the form the delivery-cut policy reads, because the ratified policy may not read row
/// counts. Row counts and coordinates make a census instead. Two views a policy must not
/// distinguish can therefore carry different censuses.
///
/// The extent carries wire coordinates, so the value is [`PartialEq`] and not [`Eq`]: two censuses
/// compare equal when their counts and their extents agree.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ViewCensus {
    /// The visible points of the root's cumulative schedule.
    visible: u64,
    /// The tight wire-frame extent of the visible set, [`None`] when it is empty.
    bounds: Option<Bounds2>,
    /// The deepest bucket holding a visible point.
    min_resolution: u64,
}

impl ViewCensus {
    /// The census of a view holding no visible point.
    ///
    /// [`Walk::visible_census`] answers this for a proof admitting nothing, with zero delivered
    /// points, an absent extent, and a depth of zero.
    #[cfg(test)] // The cache tests pair proofs with the empty view.
    pub(crate) const EMPTY: Self = Self {
        visible: 0,
        bounds: None,
        min_resolution: 0,
    };

    /// Returns the visible points of the root's cumulative schedule.
    pub(crate) const fn visible(self) -> u64 {
        self.visible
    }

    /// Returns the tight wire-frame extent of the visible set, [`None`] when it is empty.
    pub(crate) const fn bounds(self) -> Option<Bounds2> {
        self.bounds
    }

    /// Returns the deepest bucket holding a visible point.
    pub(crate) const fn min_resolution(self) -> u64 {
        self.min_resolution
    }
}

impl Walk<'_> {
    /// Inserts the rows of one tile's cumulative delivered set.
    ///
    /// A tile's delivered set is mode-independent, because its cumulative delta set equals its
    /// total set, so the gather is one run scan per bucket of the cumulative schedule, deduplicated
    /// by the set itself.
    pub(crate) fn delivered_rows_into(
        &self,
        z: u8,
        cell: MortonCell,
        set: &mut DenseBitSet<NodeRowId>,
    ) {
        for depth in self.grid.cut_buckets(z) {
            for position in self.run(depth, cell) {
                set.insert(self.row_ids[position]);
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

    /// Censuses the masked view in one pass over the base column.
    ///
    /// Per admitted position the pass accumulates:
    ///
    /// - the count below the cumulative schedule's prefix,
    /// - the coordinate's fold into the extent, and
    /// - the last admitted position, whose bucket is the deepest visible one because the base order
    ///   is bucket-major.
    fn masked_census(&self, cut: Depth, positions: &IdSlice<BasePosition, Vec2>) -> ViewCensus {
        let prefix = self.segment_end(cut);
        let mut visible = 0_u64;
        let mut last_admitted = None;

        let bounds = Bounds2::from_points(
            positions
                .iter_enumerated()
                .filter(|&(position, _)| self.admits(position))
                .inspect(|&(position, _)| {
                    if position < prefix {
                        visible += 1;
                    }
                    last_admitted = Some(position);
                })
                .map(|(_, &point)| point),
        );

        ViewCensus {
            visible,
            bounds,
            min_resolution: last_admitted.map_or(0, |position| {
                u64::from(self.morton.bucket_of(position).get())
            }),
        }
    }

    /// Censuses the visible view over the whole corpus.
    ///
    /// The corpus-wide aggregates the root tile publishes, gathered in one masked pass over the
    /// base column because they share their cost: computing them apart would filter the same column
    /// by the same mask once per aggregate for one view. `cut` is the root's cumulative schedule
    /// bucket, `positions` the base coordinate column, and `bounds` the generation's own extent.
    ///
    /// An unmasked proof answers from the artifacts alone, where the fencepost prefix is the
    /// visible count and the generation's own extent is the visible extent, so authority over the
    /// corpus costs no walk. This is the sole place the two regimes part, and a census reads the
    /// same way whichever proof produced it.
    ///
    /// `bounds` is the generation's extent, absent exactly when the generation holds no point, and
    /// a masked view's extent is absent whenever the view is empty.
    pub(crate) fn visible_census(
        &self,
        cut: Depth,
        positions: &IdSlice<BasePosition, Vec2>,
        bounds: Option<Bounds2>,
    ) -> ViewCensus {
        if self.proof.kind() == ProofKind::Corpus {
            return ViewCensus {
                visible: u64::from(self.morton.fenceposts().segment(cut).end.as_u32()),
                bounds,
                min_resolution: self.deepest_occupied(),
            };
        }

        self.masked_census(cut, positions)
    }

    /// Aggregates the visible view's Morton occupancy.
    ///
    /// One pass over the code column gathers the visible rows' keys, which [`ViewOccupancy::of`]
    /// folds into the occupied-cell counts a delivery-cut policy reads. A hidden row contributes no
    /// key, so it occupies no cell at any depth: the aggregate is a statement about the view and
    /// nothing else.
    ///
    /// The gather owns its keys, since the fold sorts them. The proof's own visible count sizes the
    /// buffer exactly.
    pub(crate) fn visible_occupancy(&self) -> ViewOccupancy {
        let count = self.morton.count();
        let visible = usize::try_from(self.proof.visible_below(count))
            .expect("a visible row count fits usize");

        let mut keys: Vec<MortonKey> = Vec::with_capacity(visible);
        for position in BasePosition::MIN..self.morton.fenceposts().bound() {
            if self.admits(position) {
                keys.push(self.morton.code(position));
            }
        }

        ViewOccupancy::of(&mut keys)
    }
}
