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
/// The aggregates a root tile publishes about the whole view rather than about its own cell. Every
/// one of them is a function of the generation's artifacts and the proof alone.
///
/// An operator proof's root delivers under the corpus schedule, whose count and depth the artifacts
/// answer. A scoped proof's root delivers under its own cascade, and the cascade answers its own
/// count and depth.
///
/// A hidden point adds nothing to the extent, and a scope's census carries no evidence of what its
/// mask removed.
///
/// The census type differs from [`ViewOccupancy`] on purpose. An occupancy counts occupied *cells*
/// per depth, the form the delivery-cut policy reads, because the ratified policy may not read row
/// counts. Row counts and coordinates make a census instead. Two views a policy must not
/// distinguish can therefore carry different censuses.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum ViewCensus {
    /// An operator proof's census, read from the artifacts.
    Corpus {
        /// The points the corpus schedule's root cut delivers.
        visible: u64,
        /// The generation's tight wire-frame extent, [`None`] when it holds no point.
        bounds: Option<Bounds2>,
        /// The deepest occupied bucket.
        min_resolution: u64,
    },
    /// A scoped proof's census, one masked pass over the base column.
    Scope {
        /// The tight wire-frame extent of the visible set, [`None`] when it is empty.
        bounds: Option<Bounds2>,
    },
}

impl ViewCensus {
    /// The census of a scoped view holding no visible point.
    #[cfg(test)] // The cache tests pair proofs with the empty view.
    pub(crate) const EMPTY: Self = Self::Scope { bounds: None };

    /// Returns the tight wire-frame extent of the visible set, [`None`] when it is empty.
    pub(crate) const fn bounds(self) -> Option<Bounds2> {
        match self {
            Self::Corpus { bounds, .. } | Self::Scope { bounds } => bounds,
        }
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

    /// Censuses the masked view in one pass over the base column, folding every admitted
    /// coordinate into the extent.
    fn masked_census(&self, positions: &IdSlice<BasePosition, Vec2>) -> ViewCensus {
        ViewCensus::Scope {
            bounds: Bounds2::from_points(
                positions
                    .iter_enumerated()
                    .filter(|&(position, _)| self.admits(position))
                    .map(|(_, &point)| point),
            ),
        }
    }

    /// Censuses the visible view over the whole corpus.
    ///
    /// `cut` is the root's cumulative schedule bucket, `positions` the base coordinate column, and
    /// `bounds` the generation's own extent, absent exactly when the generation holds no point.
    ///
    /// An operator proof admits every row, and the artifacts hold its census: the fencepost prefix
    /// is the visible count and the generation's extent is the visible extent.
    pub(crate) fn visible_census(
        &self,
        cut: Depth,
        positions: &IdSlice<BasePosition, Vec2>,
        bounds: Option<Bounds2>,
    ) -> ViewCensus {
        if self.proof.kind() == ProofKind::Corpus {
            return ViewCensus::Corpus {
                visible: u64::from(self.morton.fenceposts().segment(cut).end.as_u32()),
                bounds,
                min_resolution: self.deepest_occupied(),
            };
        }

        self.masked_census(positions)
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
