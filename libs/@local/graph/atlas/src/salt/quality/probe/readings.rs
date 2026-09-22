//! The probe's reading grids and their axes.
//!
//! Per-anchor aggregates permit whole-probe and subgroup reductions without re-ranking. The grids
//! share typed anchor and neighbourhood axes. Radius pairs and sampled triplet verdicts retain the
//! measurements needed by the density and agreement reports.

use core::{mem, num::NonZero};

use hashql_core::id::{Id, IdArray, IdMatrix, IdSlice};
use smallvec::SmallVec;

use super::super::{
    clump::ClumpAggregate,
    metric::{NeighbourhoodAggregate, TripletAggregate},
};
use crate::{identity::OntologyRowId, math::NonNegative};

hashql_core::id::newtype! {
    /// A position on the grids' neighbourhood axis.
    ///
    /// The size at this position is in [`ProbeReadings::neighbourhoods`], in options order. A step indexes that list rather than specifying a neighbourhood size.
    #[id(const)]
    pub(crate) struct Step(u32)
}

hashql_core::id::newtype! {
    /// A position on the grids' anchor axis.
    ///
    /// The anchor's corpus row is at this position in [`ProbeReadings::anchors`], in sampling order.
    #[id(const)]
    pub(crate) struct AnchorOrdinal(u32)
}

/// Space-pair indices in reporting order.
///
/// Each pair identifies a judged space and its reference. [`ProbeReadings`] exposes the
/// corresponding grids as named fields.
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

/// One value per space pair, indexed in the pinned reporting order.
pub(crate) type SpacePairArray<T> = IdArray<SpacePair, T, { SpacePair::COUNT }>;

/// Per-anchor aggregates for one space pair, anchor-major.
///
/// Every cell reads one anchor at one neighbourhood size, with sizes in options order. Rank grids
/// describe space pairs and clump grids describe collapsed recall. Merging at a step combines
/// anchors without revisiting orderings. Construction checks rectangular shape alone. Aggregates in
/// a column must share the shape required by their merge operation, with supported combined totals.
#[derive(Debug, Clone)]
pub(crate) struct ReadingGrid<A = NeighbourhoodAggregate> {
    cells: IdMatrix<AnchorOrdinal, Step, A>,
}

impl<A> ReadingGrid<A> {
    /// Gathers per-anchor cell rows into a grid when a neighbourhood axis exists.
    ///
    /// Returns [`None`] when `steps` is zero. Each present grid has at least one neighbourhood
    /// column.
    ///
    /// # Panics
    ///
    /// Panics when a row's cell count differs from `steps`.
    pub(crate) fn from_anchor_cells(rows: Vec<Vec<A>>, steps: usize) -> Option<Self> {
        if steps == 0 {
            assert!(
                rows.iter().all(Vec::is_empty),
                "should have no cells without neighbourhoods"
            );

            return None;
        }

        Some(Self {
            cells: IdMatrix::from_rows(rows, steps),
        })
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

impl ReadingGrid<NeighbourhoodAggregate> {
    /// Merges every anchor's reading at one step.
    ///
    /// # Panics
    ///
    /// Panics when `step` lies outside the grid, the grid holds no anchor, or the column's
    /// aggregates disagree about universe, neighbourhood size or horizon.
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

    /// Merges the named anchors' readings at one step.
    ///
    /// A repeated anchor contributes again. Use [`overall`](Self::overall) for every anchor once.
    ///
    /// # Panics
    ///
    /// Panics when `anchors` is empty, an index lies outside the grid, or the selected aggregates
    /// disagree about universe, neighbourhood size or horizon.
    #[must_use]
    pub(crate) fn merged(&self, anchors: &[AnchorOrdinal], step: Step) -> NeighbourhoodAggregate {
        let (&first, rest) = anchors
            .split_first()
            .expect("a subset merge names at least one anchor");

        let mut merged = self.anchor(first, step).clone();

        for &anchor in rest {
            merged.merge(self.anchor(anchor, step));
        }

        merged
    }
}

impl ReadingGrid<ClumpAggregate> {
    /// Merges every anchor's reading at one neighbourhood size.
    ///
    /// # Panics
    ///
    /// Panics when `step` lies outside the grid, the grid holds no anchor, or the column's
    /// aggregates disagree about neighbourhood size.
    #[must_use]
    pub(crate) fn overall(&self, step: Step) -> ClumpAggregate {
        let mut column = self.cells.column(step);

        let mut merged = *column.next().expect("the grid holds at least one anchor");
        for cell in column {
            merged.merge(cell);
        }

        merged
    }

    /// Merges the named anchors' readings at one neighbourhood size.
    ///
    /// A repeated anchor contributes again. Use [`overall`](Self::overall) for every anchor once.
    ///
    /// # Panics
    ///
    /// Panics when `anchors` is empty, an index lies outside the grid, or the selected aggregates
    /// disagree about neighbourhood size.
    #[must_use]
    pub(crate) fn merged(&self, anchors: &[AnchorOrdinal], step: Step) -> ClumpAggregate {
        let (&first, rest) = anchors
            .split_first()
            .expect("a subset merge names at least one anchor");

        let mut merged = *self.anchor(first, step);
        for &anchor in rest {
            merged.merge(self.anchor(anchor, step));
        }

        merged
    }
}

/// One anchor's neighbourhood radii at one neighbourhood size.
///
/// Map radii use Euclidean distance and representation radii use cosine distance. A log radius
/// ratio includes the scales of both metrics. Uniform multiplicative rescaling of either radius
/// shifts every finite log ratio by one constant, preserving their median absolute deviation in
/// exact arithmetic. Arbitrary metric changes need not preserve the spread.
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
    pub map_representation: Option<ReadingGrid<ClumpAggregate>>,
    /// Collapsed representation-versus-canonical readings over the comparison rows.
    ///
    /// The representation baseline collapsed onto clump ids, on the sampled grids' anchor and
    /// neighbourhood axes.
    pub representation_canonical: Option<ReadingGrid<ClumpAggregate>>,
}

/// One probe's readings across the three space pairs.
///
/// The corpus grid ranks every non-anchor row, with universe `rows - anchors`. The sampled grids
/// share the comparison rows as their universe. Each grid records its own universe in its
/// aggregates.
///
/// Values produced by [`probe`](super::probe) have aligned axes. The neighbourhood axis is empty
/// when the population cannot support rank metrics, and every corresponding grid is [`None`].
/// Density has its own neighbourhood axis, which can remain nonempty with two rows. Direct
/// construction must preserve the grids' neighbourhood axis and the radius pairs' density axis,
/// with all measurements in anchor order. The same obligation covers each aggregate's shape and
/// arithmetic capacity, and the fields store what a caller supplies without a mutual-consistency
/// check.
#[derive(Debug)]
pub(crate) struct ProbeReadings<N> {
    /// Sampled anchor rows, in sampling order: the grids' anchor axis.
    pub anchors: Box<[N]>,
    /// Sampled comparison rows, in sampling order: the sampled grids' shared universe.
    pub comparisons: Box<[N]>,
    /// Non-anchor rows in the corpus, including when rank metrics are unavailable.
    pub corpus_universe: usize,
    /// Radius sizes in reporting order, defined with at least one non-anchor row.
    pub density_neighbourhoods: Box<[NonZero<usize>]>,
    /// Requested pair draws, distinguishing zero requested draws from population insufficiency.
    pub triplet_pairs_requested: usize,
    /// The neighbourhood sizes every grid reads at, in options order.
    ///
    /// The size at each [`Step`] of the grids' neighbourhood axis.
    pub neighbourhoods: Box<IdSlice<Step, NonZero<usize>>>,
    /// Map versus representation over every non-anchor row.
    ///
    /// Rankings cover the full non-anchor universe, while aggregate readings retain
    /// anchor-sampling uncertainty.
    pub map_representation: Option<ReadingGrid>,
    /// The corpus reading collapsed onto clump ids.
    ///
    /// Present exactly when the probe received a clump grouping.
    pub clumps: Option<ClumpReadings>,
    /// Map versus representation over the comparison rows.
    ///
    /// For like-for-like comparison with the canonical readings.
    pub sampled_map_representation: Option<ReadingGrid>,
    /// Map versus canonical space over the comparison rows.
    pub sampled_map_canonical: Option<ReadingGrid>,
    /// Representation versus canonical space over the comparison rows.
    ///
    /// The representation baseline for the map's canonical reading.
    pub sampled_representation_canonical: Option<ReadingGrid>,
    /// Corpus neighbourhood radii.
    ///
    /// Anchor-major with one entry per size in
    /// [`density_neighbourhoods`](Self::density_neighbourhoods).
    pub radii: Box<[RadiusPair]>,
    /// The shared comparison-point pairs the triplet readings sample.
    ///
    /// As indices into the comparison rows.
    #[cfg_attr(
        not(test),
        expect(dead_code, reason = "the probe replay in this module's tests reads it")
    )]
    pub triplet_pairs: Box<[[u32; 2]]>,
    /// Per-anchor triplet agreement between map and representation, over the sampled distances.
    pub triplet_map_representation: Box<[TripletAggregate]>,
    /// Per-anchor triplet agreement between map and canonical space.
    pub triplet_map_canonical: Box<[TripletAggregate]>,
    /// Per-anchor triplet agreement between representation and canonical space.
    pub triplet_representation_canonical: Box<[TripletAggregate]>,
}

impl<N> ProbeReadings<N> {
    /// Pairs the readings with each anchor's direct types.
    ///
    /// # Panics
    ///
    /// Panics when `anchor_types` and the readings disagree about the anchor count.
    #[must_use]
    pub(crate) fn with_anchor_types<'probe>(
        &'probe self,
        anchor_types: &'probe [SmallVec<OntologyRowId, 2>],
    ) -> TypedReadings<'probe, N> {
        assert_eq!(
            anchor_types.len(),
            self.anchors.len(),
            "the anchor types and the readings should describe the same anchors",
        );
        TypedReadings {
            readings: self,
            anchor_types,
        }
    }
}

/// One probe's readings beside each anchor's direct types.
///
/// `anchor_types` is parallel to the readings' anchors. Each entry lists one anchor's direct types,
/// and an empty entry leaves its anchor in the whole-probe readings only. Construction checks the
/// anchor count, not type membership or uniqueness. Repeated type entries count the anchor
/// repeatedly in that subgroup.
#[derive(Debug)]
pub(crate) struct TypedReadings<'probe, N> {
    /// The probe's readings.
    readings: &'probe ProbeReadings<N>,
    /// Each anchor's direct types, parallel to the readings' anchors.
    anchor_types: &'probe [SmallVec<OntologyRowId, 2>],
}

impl<'probe, N> TypedReadings<'probe, N> {
    /// Borrows the probe's readings.
    #[inline]
    #[must_use]
    pub(crate) const fn readings(&self) -> &'probe ProbeReadings<N> {
        self.readings
    }

    /// Borrows each anchor's direct types.
    #[inline]
    #[must_use]
    pub(crate) const fn anchor_types(&self) -> &'probe [SmallVec<OntologyRowId, 2>] {
        self.anchor_types
    }
}

// copying shared references needs no N: Copy bound
impl<N> Copy for TypedReadings<'_, N> {}

impl<N> Clone for TypedReadings<'_, N> {
    fn clone(&self) -> Self {
        *self
    }
}

#[cfg(test)]
mod tests {
    use rand::SeedableRng as _;
    use rand_xoshiro::Xoshiro256PlusPlus;

    use super::ReadingGrid;
    use crate::salt::quality::{
        probe::{ProbeOptions, probe},
        tests::{ProbeFixture, irregular_angles},
    };

    #[test]
    fn from_anchor_cells_dimensions() {
        let grid = ReadingGrid::from_anchor_cells(vec![vec![0_u8; 2]; 5], 2)
            .expect("should construct a grid with neighbourhood columns");
        assert_eq!(grid.cells.rows(), 5);
        assert_eq!(grid.cells.columns(), 2);
    }

    #[tokio::test]
    async fn probe_grid_dimensions() {
        let fixture = ProbeFixture::on_circle(&irregular_angles(48));
        let options = ProbeOptions {
            anchors: 5.try_into().expect("nonzero"),
            comparisons: 12.try_into().expect("nonzero"),
            neighbourhoods: vec![
                2.try_into().expect("nonzero"),
                4.try_into().expect("nonzero"),
            ]
            .into(),
            ..ProbeOptions::default()
        };

        let readings = probe(
            &fixture.dataset(),
            fixture.corpus(),
            &options,
            Xoshiro256PlusPlus::seed_from_u64(7),
        )
        .await
        .expect("the corpus hosts the probe design");

        for grid in [
            &readings.map_representation,
            &readings.sampled_map_representation,
            &readings.sampled_map_canonical,
            &readings.sampled_representation_canonical,
        ] {
            let grid = grid.as_ref().expect("should contain rank readings");
            assert_eq!(grid.cells.rows(), 5);
            assert_eq!(grid.cells.columns(), 2);
        }
    }
}
