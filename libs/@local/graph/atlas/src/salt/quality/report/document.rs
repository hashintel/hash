//! The quality report's rendered rows, applied thresholds, and verdict controls.

use core::{mem::variant_count, num::NonZero};

use super::super::{
    QualityMetric,
    metric::{NeighbourhoodAggregate, TripletAggregate},
};
use crate::{
    identity::OntologyRowId,
    math::{NonNegative, UnitFraction},
};

/// One aggregate's readings at one neighbourhood size.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct MetricRow {
    /// The neighbourhood size the row reads at.
    pub neighbourhood: NonZero<usize>,
    /// Queries the row aggregates over.
    pub queries: usize,
    /// Mean fraction of shared neighbourhoods, in `[0, 1]`.
    pub recall: UnitFraction,
    /// Trustworthiness, in `[0, 1]`.
    pub trustworthiness: UnitFraction,
    /// Continuity, in `[0, 1]`.
    pub continuity: UnitFraction,
    /// Fraction of false neighbours past the horizon, in `[0, 1]`.
    pub intrusion_rate: UnitFraction,
    /// Fraction of banished neighbours past the horizon, in `[0, 1]`.
    pub extrusion_rate: UnitFraction,
}

impl MetricRow {
    /// Reads one aggregate at the given neighbourhood size.
    ///
    /// Every row a probe produces observes at least one query, from three independent reasons:
    /// `ProbeOptions::anchors` is a `NonZero`, the sampled pass observes every rung cell once per
    /// anchor, and a subgroup row merges at least the anchor that created its membership. A row
    /// read from an empty aggregate publishes each reading's own optimum instead - recall one, the
    /// rates zero - and [`controls`](QualityReport::controls) folds those into its extremum as
    /// observed evidence, where the triplet control keys on its observed count and refuses. A new
    /// row source either keeps that invariant or gives the controls `queries` to key on.
    pub(super) fn read(neighbourhood: NonZero<usize>, aggregate: &NeighbourhoodAggregate) -> Self {
        Self {
            neighbourhood,
            queries: aggregate.queries(),
            recall: aggregate.recall(),
            trustworthiness: aggregate.trustworthiness(),
            continuity: aggregate.continuity(),
            intrusion_rate: aggregate.intrusion_rate(),
            extrusion_rate: aggregate.extrusion_rate(),
        }
    }
}

/// One neighbourhood size's density-distortion reading.
///
/// The reading is the spread of `ln(map radius / representation radius)` over the anchors: zero
/// when the map rescales every neighbourhood alike, growing as regions compress or dilate unevenly.
/// The median log ratio is the global scale offset - it carries the two metrics' unit difference
/// and is comparable only across probes of the same spaces.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct DensityRow {
    /// The neighbourhood size both radii come from.
    pub neighbourhood: NonZero<usize>,
    /// Anchors contributing a finite log ratio.
    pub anchors: usize,
    /// Anchors excluded for a zero radius.
    ///
    /// At least `neighbourhood` rows coincide with the anchor in one of the spaces.
    pub degenerate: usize,
    /// The median log radius ratio, absent without contributing anchors.
    pub median_log_ratio: Option<f64>,
    /// The median absolute deviation around the median, unscaled.
    ///
    /// Absent without contributing anchors.
    pub spread: Option<f64>,
}

/// One space pair's triplet-agreement reading.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct TripletRow {
    /// Observed triplets across all anchors.
    pub triplets: u64,
    /// Triplets whose distance order both spaces share.
    pub preserved: u64,
    /// The preserved fraction, one when the probe observed no triplet.
    pub agreement: UnitFraction,
}

impl TripletRow {
    /// Merges every anchor's aggregate into one row.
    pub(super) fn read(anchors: &[TripletAggregate]) -> Self {
        let mut merged = TripletAggregate::default();
        for aggregate in anchors {
            merged.merge(aggregate);
        }

        Self {
            triplets: merged.triplets(),
            preserved: merged.preserved(),
            agreement: merged.agreement(),
        }
    }
}

/// One neighbourhood size's recall reading collapsed onto clump ids.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ClumpRow {
    /// The neighbourhood size the row reads at.
    pub neighbourhood: NonZero<usize>,
    /// Queries the row aggregates over.
    pub queries: usize,
    /// Mean matched fraction of the collapsed neighbourhoods, in `[0, 1]`.
    ///
    /// Never below the plain recall at the same size.
    pub recall: UnitFraction,
}

/// The clump-collapsed evidence block.
///
/// The grouping's shape - counts at the distance threshold that formed it - accompanies the
/// collapsed readings, because a threshold grouping half the corpus reads differently from one
/// grouping a few percent.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ClumpReport {
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
    /// One row per neighbourhood size in reporting order.
    pub map_representation: Vec<ClumpRow>,
    /// Collapsed representation-versus-canonical readings over the comparison rows.
    ///
    /// One row per neighbourhood size in reporting order: the representation baseline collapsed
    /// onto clump ids.
    pub representation_canonical: Vec<ClumpRow>,
}

/// One subgroup's readings on the primary grid.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SubgroupReport {
    /// The subgroup's type, as its ontology row.
    pub ontology_row: OntologyRowId,
    /// Anchors carrying the type.
    pub anchors: usize,
    /// Corpus map-versus-representation readings.
    ///
    /// One row per neighbourhood size in reporting order.
    pub rows: Vec<MetricRow>,
}

/// One representation-baseline reading at one neighbourhood size.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct BaselineRow {
    /// The neighbourhood size the row reads at.
    pub neighbourhood: NonZero<usize>,
    /// Queries the row aggregates over.
    pub queries: usize,
    /// Recall of exact canonical neighbourhoods in the representation, in `[0, 1]`.
    pub recall: UnitFraction,
    /// The same reading collapsed onto clump ids, when clump readings exist.
    ///
    /// Never below the plain recall.
    pub clump_recall: Option<UnitFraction>,
}

/// One subgroup's representation-baseline readings over the sampled universe.
///
/// The stratification separates representation loss from near-tie reshuffling under the triage
/// rule. When a subgroup's plain baseline recall trails the whole-probe reading and its collapsed
/// recall restores to it, the breach lies only on component labels in the representation itself,
/// before any projection. That reading triages the breach and certifies nothing about placement.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct BaselineSubgroupReport {
    /// The subgroup's type, as its ontology row.
    pub ontology_row: OntologyRowId,
    /// Anchors carrying the type.
    pub anchors: usize,
    /// Representation-versus-canonical readings.
    ///
    /// One row per neighbourhood size in reporting order.
    pub rows: Vec<BaselineRow>,
}

/// One breach of the subgroup degradation rule.
///
/// A flag carries its own triage evidence. When clump readings exist, the report re-evaluates the
/// breach on clump ids and marks a breach the collapse restores as resolved, meaning
/// component-label recall no longer breaches. The mark is triage evidence and certifies neither
/// component compactness nor within-component placement, and it never affects admission.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SubgroupFlag {
    /// The flagged subgroup's type, as its ontology row.
    pub ontology_row: OntologyRowId,
    /// The neighbourhood size of the breach.
    pub neighbourhood: NonZero<usize>,
    /// Anchors carrying the type.
    pub anchors: usize,
    /// The subgroup's degradation: one minus its recall.
    pub degradation: UnitFraction,
    /// The whole-probe degradation the factor multiplied.
    pub overall_degradation: UnitFraction,
    /// The subgroup's clump-collapsed degradation, when clump readings exist.
    pub clump_degradation: Option<UnitFraction>,
    /// The whole-probe clump-collapsed degradation the re-evaluation compared against.
    pub clump_overall_degradation: Option<UnitFraction>,
    /// Whether the clump-collapsed re-evaluation satisfies the degradation rule.
    ///
    /// Always false without clump readings.
    pub clump_resolved: bool,
}

/// The side of a control's threshold that admits.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum Bound {
    /// The reading must reach the threshold.
    Floor(f64),
    /// The reading must stay under the threshold.
    Ceiling(f64),
}

impl Bound {
    /// Returns whether `reading` lies inside the bound.
    const fn admits(self, reading: f64) -> bool {
        match self {
            Self::Floor(floor) => reading >= floor,
            Self::Ceiling(ceiling) => reading <= ceiling,
        }
    }
}

/// One control of the battery, reading one metric against the threshold that admits it.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct Control {
    /// The metric the control gates.
    pub metric: QualityMetric,
    /// The reading the verdict turns on, absent exactly when the evidence is.
    pub reading: Option<f64>,
    /// The applied threshold and the side of it that admits.
    pub bound: Bound,
}

impl Control {
    /// Returns whether the control admits: evidence present, and inside its bound.
    pub(crate) fn admits(&self) -> bool {
        self.reading
            .is_some_and(|reading| self.bound.admits(reading))
    }
}

/// One probe's rendered evidence and verdict inputs.
///
/// The report carries the probe sizes and the applied thresholds, so a serialized report justifies
/// its own verdict without the configuration that produced it.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct QualityReport {
    /// Sampled anchor count.
    pub anchors: usize,
    /// The corpus grid's universe: every non-anchor row.
    pub corpus_universe: usize,
    /// The comparison row count every sampled grid ranks over.
    pub comparisons: usize,
    /// Corpus map-versus-representation readings, per neighbourhood size.
    ///
    /// The primary surface the verdict binds to.
    pub map_representation: Vec<MetricRow>,
    /// The corpus reading collapsed onto clump ids and the grouping's shape.
    ///
    /// When the probe carried a clump grouping.
    pub clumps: Option<ClumpReport>,
    /// Sampled map-versus-representation readings.
    pub sampled_map_representation: Vec<MetricRow>,
    /// Sampled map-versus-canonical readings.
    pub sampled_map_canonical: Vec<MetricRow>,
    /// Sampled representation-versus-canonical readings: the representation baseline.
    pub sampled_representation_canonical: Vec<MetricRow>,
    /// Density-distortion readings, per neighbourhood size.
    pub density: Vec<DensityRow>,
    /// Map-versus-representation triplet agreement: the verdict-bearing pair.
    pub triplet_map_representation: TripletRow,
    /// Map-versus-canonical triplet agreement.
    pub triplet_map_canonical: TripletRow,
    /// Representation-versus-canonical triplet agreement.
    pub triplet_representation_canonical: TripletRow,
    /// Per-subgroup primary readings, ascending by ontology row.
    pub subgroups: Vec<SubgroupReport>,
    /// Per-subgroup representation-baseline readings, ascending by ontology row.
    ///
    /// The audit stratification, report-only.
    pub baseline_subgroups: Vec<BaselineSubgroupReport>,
    /// Degradation-rule breaches, in subgroup then neighbourhood order.
    pub flags: Vec<SubgroupFlag>,
    /// The applied recall floor.
    pub minimum_recall: UnitFraction,
    /// The applied trustworthiness floor.
    pub minimum_trustworthiness: UnitFraction,
    /// The applied continuity floor.
    pub minimum_continuity: UnitFraction,
    /// The applied intrusion ceiling.
    pub maximum_intrusion_rate: UnitFraction,
    /// The applied density-spread ceiling.
    pub maximum_density_spread: NonNegative,
    /// The applied triplet-agreement floor.
    pub minimum_triplet_agreement: UnitFraction,
    /// The applied degradation factor.
    pub subgroup_degradation_factor: f64,
    /// The applied subgroup anchor floor.
    pub minimum_subgroup_anchors: usize,
}

impl QualityReport {
    /// Returns the battery's controls, each carrying the reading its verdict turns on.
    ///
    /// Each control is a conjunction over the neighbourhood rungs, so the reading that decides it
    /// is the extremum across them - the lowest rung against a floor and the highest against a
    /// ceiling. An absent reading is absent evidence - an empty grid, a rung whose spread is
    /// absent, triplet sampling switched off - and a control refuses that rather than passing
    /// vacuously.
    ///
    /// [`passes`](Self::passes) is this list's conjunction and an observer reports these same
    /// numbers, so the verdict and the observation read one reduction instead of two.
    #[must_use]
    pub(crate) fn controls(&self) -> [Control; variant_count::<QualityMetric>()] {
        let lowest = |read: fn(&MetricRow) -> UnitFraction| {
            self.map_representation
                .iter()
                .map(read)
                .reduce(UnitFraction::min)
        };
        let highest = |read: fn(&MetricRow) -> UnitFraction| {
            self.map_representation
                .iter()
                .map(read)
                .reduce(UnitFraction::max)
        };

        // A rung with no spread reading gives the ceiling nothing to check, so the control loses
        // its evidence whole rather than reading the rungs that do have one.
        let spread = self
            .density
            .iter()
            .try_fold(None::<f64>, |highest, row| {
                let spread = row.spread?;
                let highest = highest.unwrap_or(f64::NEG_INFINITY);

                Some(Some(highest.max(spread)))
            })
            .flatten();

        let triplets = &self.triplet_map_representation;

        [
            Control {
                metric: QualityMetric::Recall,
                reading: lowest(|row| row.recall).map(UnitFraction::get),
                bound: Bound::Floor(self.minimum_recall.get()),
            },
            Control {
                metric: QualityMetric::Trustworthiness,
                reading: lowest(|row| row.trustworthiness).map(UnitFraction::get),
                bound: Bound::Floor(self.minimum_trustworthiness.get()),
            },
            Control {
                metric: QualityMetric::Continuity,
                reading: lowest(|row| row.continuity).map(UnitFraction::get),
                bound: Bound::Floor(self.minimum_continuity.get()),
            },
            Control {
                metric: QualityMetric::IntrusionRate,
                reading: highest(|row| row.intrusion_rate).map(UnitFraction::get),
                bound: Bound::Ceiling(self.maximum_intrusion_rate.get()),
            },
            Control {
                metric: QualityMetric::DensitySpread,
                reading: spread,
                bound: Bound::Ceiling(f64::from(self.maximum_density_spread)),
            },
            Control {
                metric: QualityMetric::TripletAgreement,
                reading: (triplets.triplets > 0).then_some(triplets.agreement.get()),
                bound: Bound::Floor(self.minimum_triplet_agreement.get()),
            },
        ]
    }

    /// Returns whether the full battery admits the generation.
    ///
    /// True exactly when every [control](Self::controls) holds: each reading present and inside its
    /// bound. The controls are concrete validated values that stay maximally permissive by default.
    /// The verdict therefore turns on evidence and readings, never on configuration shape. Subgroup
    /// flags and their clump-resolution triage are report-only fields: they inform the human
    /// reading the report and never affect admission.
    #[must_use]
    pub(crate) fn passes(&self) -> bool {
        self.controls().iter().all(Control::admits)
    }
}
