//! The probe's reading grids and their axes.
//!
//! Everything here is a value the probe hands back: per-anchor aggregate grids, neighbourhood
//! radii, and the triplet readings with their shared pair sample. Consumers regroup these by
//! merging cells, whole-probe or by subgroup, and nothing here re-ranks.

use core::{mem, num::NonZero};

use hashql_core::id::{Id, IdArray, IdMatrix, IdSlice};

use super::super::{
    clump::ClumpAggregate,
    metric::{NeighbourhoodAggregate, TripletAggregate},
};
use crate::math::NonNegative;

hashql_core::id::newtype! {
    /// One position on the grids' neighbourhood axis, in the options' reporting order.
    ///
    /// The probe reads every metric at a ladder of neighbourhood sizes, and a step addresses one of
    /// them. The grids address cells by step, and the step's neighbourhood size lives in
    /// [`ProbeReadings::neighbourhoods`], so a step index and a neighbourhood size can never
    /// stand in for one another.
    #[id(const)]
    pub(crate) struct Step(u32)
}

hashql_core::id::newtype! {
    /// One position on the grids' anchor axis, in sampling order.
    ///
    /// An ordinal addresses a sampled anchor's readings; the anchor's row id lives at the same
    /// position of [`ProbeReadings::anchors`], so an ordinal and a corpus row can never stand in
    /// for one another.
    #[id(const)]
    pub(crate) struct AnchorOrdinal(u32)
}

/// The probe's space pairs, in one pinned reporting order.
///
/// The passes' positional plumbing - pair-indexed arrays - uses this order; the reading structs
/// name their pair fields instead, so the enum is the bridge between the two.
#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Id)]
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

pub(crate) type SpacePairArray<T> = IdArray<SpacePair, T, { SpacePair::COUNT }>;

/// Per-anchor aggregates for one space pair, anchor-major.
///
/// Every cell reads one anchor at one neighbourhood size; the neighbourhood axis follows the
/// options' reporting order. Roll-ups merge cells, so a consumer groups anchors - whole-probe or by
/// subgroup - without touching orderings again. The cell type is the aggregate the grid holds: rank
/// aggregates for the space-pair grids, clump aggregates for the collapsed corpus grid.
#[derive(Debug, Clone)]
pub(crate) struct ReadingGrid<A = NeighbourhoodAggregate> {
    cells: IdMatrix<AnchorOrdinal, Step, A>,
}

impl<A> ReadingGrid<A> {
    /// Gathers per-anchor cell rows into a grid.
    ///
    /// # Panics
    ///
    /// This panics when a row's cell count differs from `steps`; every anchor reads the same steps,
    /// so a ragged row is a wiring defect.
    pub(crate) fn from_anchor_cells(rows: Vec<Vec<A>>, steps: usize) -> Self {
        Self {
            cells: IdMatrix::from_rows(rows, steps),
        }
    }

    /// Returns the anchor count.
    #[inline]
    #[must_use]
    pub(crate) const fn anchors(&self) -> usize {
        self.cells.rows()
    }

    /// Returns the step count of the neighbourhood axis.
    #[inline]
    #[must_use]
    pub(crate) const fn steps(&self) -> usize {
        self.cells.columns()
    }

    /// Borrows one anchor's reading at one step.
    ///
    /// # Panics
    ///
    /// This panics when `anchor` or `step` lies outside the grid.
    #[inline]
    #[must_use]
    pub(crate) const fn anchor(&self, anchor: AnchorOrdinal, step: Step) -> &A {
        &self.cells[(anchor, step)]
    }
}

// Each cell type implements `overall` itself rather than sharing one
// merge trait.
impl ReadingGrid<NeighbourhoodAggregate> {
    /// Merges every anchor's reading at one step.
    ///
    /// # Panics
    ///
    /// This panics when `step` lies outside the grid or the grid holds no anchor.
    #[must_use]
    pub(crate) fn overall(&self, step: Step) -> NeighbourhoodAggregate {
        let mut column = self.cells.column(step);
        let mut merged = column
            .next()
            .expect("the grid holds at least one anchor")
            .clone();

        for cell in column {
            merged.merge(cell);
        }

        merged
    }
}

impl ReadingGrid<ClumpAggregate> {
    /// Merges every anchor's reading at one neighbourhood size.
    ///
    /// # Panics
    ///
    /// This panics when `step` lies outside the grid or the grid holds no anchor.
    #[must_use]
    pub(crate) fn overall(&self, step: Step) -> ClumpAggregate {
        let mut column = self.cells.column(step);
        let mut merged = *column.next().expect("the grid holds at least one anchor");
        for cell in column {
            merged.merge(cell);
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
    pub map: NonNegative,
    /// Cosine distance to the k-th nearest non-anchor row in the representation.
    pub representation: NonNegative,
}

/// Readings collapsed onto clump ids.
///
/// The grids hold readings with both neighbourhoods collapsed onto clump ids, beside the shape the
/// grouping took at its distance threshold - the evidence for judging a collapsed reading.
#[derive(Debug)]
pub(crate) struct ClumpReadings {
    /// The distance threshold that formed the grouping.
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
    /// The representation baseline collapsed onto clump ids, on the sampled grids' anchor and
    /// neighbourhood axes.
    pub representation_canonical: ReadingGrid<ClumpAggregate>,
}

/// One probe's readings across the three space pairs.
///
/// The corpus grid ranks every non-anchor row, so its universe is `rows - anchors`; the sampled
/// grids share the comparison rows as their universe. Each grid records its own universe in its
/// aggregates, so a reading is never mistaken for a measurement at another scale.
#[derive(Debug)]
pub(crate) struct ProbeReadings<N> {
    /// Sampled anchor rows, in sampling order: the grids' anchor axis.
    pub anchors: Box<[N]>,
    /// Sampled comparison rows, in sampling order: the sampled grids' shared universe.
    pub comparisons: Box<[N]>,
    /// The neighbourhood sizes every grid reads at, in options order.
    ///
    /// The size at each [`Step`] of the grids' neighbourhood axis.
    pub neighbourhoods: Box<IdSlice<Step, NonZero<usize>>>,
    /// Map versus representation, ranking every non-anchor row against each sampled anchor. The
    /// comparison universe is every row that is not itself an anchor - exact, and the whole corpus
    /// but for the anchors - while the aggregate remains an anchor-sampled statistic rather than a
    /// corpus-population estimate.
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
    /// The representation baseline for the map's canonical reading.
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
