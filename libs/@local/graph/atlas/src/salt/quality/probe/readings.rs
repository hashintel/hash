//! The probe's output contract: reading grids and their axes.
//!
//! Everything here is a value the probe hands back: per-anchor aggregate grids, neighbourhood
//! radii, and the triplet readings with their shared pair sample. Consumers regroup these -
//! overall, per subgroup - by merging cells; nothing here re-ranks.

use core::{mem, num::NonZero};

use super::super::{
    clump::ClumpAggregate,
    metric::{NeighbourhoodAggregate, TripletAggregate},
};
use crate::dataset::NodeRowId;

/// The probe's space pairs, in one pinned reporting order.
///
/// The passes' positional plumbing - pair-indexed arrays - uses this order; the reading structs
/// name their pair fields instead, so the enum is the bridge between the two.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum SpacePair {
    /// The 2D map judged against the 512-component representation.
    MapRepresentation,
    /// The 2D map judged against the canonical space.
    MapCanonical,
    /// The representation judged against the canonical space: the representation baseline.
    RepresentationCanonical,
}

impl SpacePair {
    /// Pairs in the schema, sizing pair-indexed arrays.
    pub(crate) const COUNT: usize = mem::variant_count::<Self>();
}

/// Per-anchor aggregates for one space pair, anchor-major.
///
/// Every cell reads one anchor at one neighbourhood size; the neighbourhood axis follows the
/// options' reporting order. Roll-ups merge cells, so a consumer groups anchors - overall, by
/// subgroup - without touching orderings again. The cell type is the aggregate the grid holds: rank
/// aggregates for the space-pair grids, clump aggregates for the collapsed corpus grid.
#[derive(Debug, Clone)]
pub(crate) struct ReadingGrid<A = NeighbourhoodAggregate> {
    cells: Box<[A]>,
    neighbourhoods: usize,
}

impl<A> ReadingGrid<A> {
    /// Flattens per-anchor cell rows into a grid.
    pub(in crate::salt::quality) fn from_anchor_cells(
        rows: Vec<Vec<A>>,
        neighbourhoods: usize,
    ) -> Self {
        Self {
            cells: rows.into_iter().flatten().collect(),
            neighbourhoods,
        }
    }

    /// Returns the anchor count.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "the grid is rectangular by construction, so the division is exact"
    )]
    #[inline]
    #[must_use]
    pub(crate) const fn anchors(&self) -> usize {
        self.cells.len() / self.neighbourhoods
    }

    /// Returns the neighbourhood-size count.
    #[inline]
    #[must_use]
    pub(crate) const fn neighbourhoods(&self) -> usize {
        self.neighbourhoods
    }

    /// Borrows one anchor's reading at one neighbourhood size.
    ///
    /// # Panics
    ///
    /// Panics when `anchor` or `neighbourhood` lies outside the grid.
    #[inline]
    #[must_use]
    pub(crate) fn anchor(&self, anchor: usize, neighbourhood: usize) -> &A {
        assert!(
            neighbourhood < self.neighbourhoods,
            "the neighbourhood index must lie inside the grid",
        );
        &self.cells[anchor * self.neighbourhoods + neighbourhood]
    }
}

// `overall` repeats per cell type: a one-method merge trait would be
// indirection serving only these two eight-line bodies.
impl ReadingGrid<NeighbourhoodAggregate> {
    /// Merges every anchor's reading at one neighbourhood size.
    ///
    /// # Panics
    ///
    /// Panics when `neighbourhood` lies outside the grid.
    #[must_use]
    pub(crate) fn overall(&self, neighbourhood: usize) -> NeighbourhoodAggregate {
        let mut merged = self.anchor(0, neighbourhood).clone();
        for anchor in 1..self.anchors() {
            merged.merge(self.anchor(anchor, neighbourhood));
        }
        merged
    }
}

impl ReadingGrid<ClumpAggregate> {
    /// Merges every anchor's reading at one neighbourhood size.
    ///
    /// # Panics
    ///
    /// Panics when `neighbourhood` lies outside the grid.
    #[must_use]
    pub(crate) fn overall(&self, neighbourhood: usize) -> ClumpAggregate {
        let mut merged = *self.anchor(0, neighbourhood);
        for anchor in 1..self.anchors() {
            merged.merge(self.anchor(anchor, neighbourhood));
        }
        merged
    }
}

/// One anchor's neighbourhood radii at one neighbourhood size.
///
/// The radii live in their own metrics - euclidean map distance, cosine representation distance -
/// so a single ratio carries no meaning; the spread of log ratios across anchors does, because a
/// metric change shifts every log ratio by one constant.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct RadiusPair {
    /// Distance to the k-th nearest non-anchor row on the map.
    pub map: f32,
    /// Cosine distance to the k-th nearest non-anchor row in the representation.
    pub representation: f32,
}

/// Clump-granularity readings, collapsed onto clump ids.
///
/// The grids hold readings with both neighbourhoods collapsed onto clump ids, beside the grouping's
/// shape at the threshold it was built at - the evidence a collapsed reading is judged against.
#[derive(Debug)]
pub(crate) struct ClumpReadings {
    /// The distance threshold the grouping was built at.
    pub epsilon: f32,
    /// The clump count, singletons included.
    pub count: usize,
    /// Clumps holding at least two rows.
    pub groups: usize,
    /// Rows inside multi-row clumps.
    pub grouped_rows: usize,
    /// Collapsed corpus map-versus-representation readings.
    ///
    /// On the corpus grid's anchor and neighbourhood axes.
    pub map_representation: ReadingGrid<ClumpAggregate>,
    /// Collapsed representation-versus-canonical readings over the comparison rows.
    ///
    /// The representation baseline at clump granularity, on the sampled grids' anchor and
    /// neighbourhood axes.
    pub representation_canonical: ReadingGrid<ClumpAggregate>,
}

/// One probe's readings across the three space pairs.
///
/// The corpus grid ranks every non-anchor row, so its universe is `rows - anchors`; the sampled
/// grids share the comparison rows as their universe. Each grid records its own universe in its
/// aggregates, so a reading is never mistaken for a measurement at another scale.
#[derive(Debug)]
pub(crate) struct ProbeReadings {
    /// Sampled anchor rows, in sampling order: the grids' anchor axis.
    pub anchors: Box<[NodeRowId]>,
    /// Sampled comparison rows, in sampling order: the sampled grids' shared universe.
    pub comparisons: Box<[NodeRowId]>,
    /// The neighbourhood sizes every grid reads at, in options order.
    ///
    /// The grids' neighbourhood axis.
    pub neighbourhoods: Box<[NonZero<usize>]>,
    /// Map versus representation, ranking every non-anchor row against each sampled anchor: the
    /// comparison universe is the exact full corpus, while the aggregate remains an
    /// anchor-sampled statistic, not a corpus-population estimate.
    pub map_representation: ReadingGrid,
    /// The corpus reading collapsed onto clump ids.
    ///
    /// Present exactly when the probe received a clump grouping.
    pub clumps: Option<ClumpReadings>,
    /// Map versus representation over the comparison rows.
    ///
    /// For like-for-like comparison with the canonical readings.
    pub sampled_map_representation: ReadingGrid,
    /// Map versus canonical space over the comparison rows.
    pub sampled_map_canonical: ReadingGrid,
    /// Representation versus canonical space over the comparison rows.
    ///
    /// The representation baseline the map's canonical reading is judged against.
    pub sampled_representation_canonical: ReadingGrid,
    /// Corpus neighbourhood radii.
    ///
    /// Anchor-major with one entry per neighbourhood size, in the grids' axis order.
    pub radii: Box<[RadiusPair]>,
    /// The shared comparison-point pairs the triplet readings sample.
    ///
    /// As indices into the comparison rows.
    pub triplet_pairs: Box<[[u32; 2]]>,
    /// Per-anchor triplet agreement between map and representation, over the sampled distances.
    pub triplet_map_representation: Box<[TripletAggregate]>,
    /// Per-anchor triplet agreement between map and canonical space.
    pub triplet_map_canonical: Box<[TripletAggregate]>,
    /// Per-anchor triplet agreement between representation and canonical space.
    pub triplet_representation_canonical: Box<[TripletAggregate]>,
}
