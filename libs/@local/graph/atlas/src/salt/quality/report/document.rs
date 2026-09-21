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
    /// Fraction of map neighbours past the reference-rank horizon, in `[0, 1]`.
    pub intrusion_rate: UnitFraction,
    /// Fraction of reference neighbours past the map-rank horizon, in `[0, 1]`.
    pub extrusion_rate: UnitFraction,
}

impl MetricRow {
    /// Reads one aggregate at the given neighbourhood size.
    ///
    /// `neighbourhood` labels the row and must match the aggregate's size. An empty aggregate
    /// produces recall, trustworthiness and continuity of one and rates of zero.
    /// [`QualityReport::controls`] includes such a row in its extrema without checking `queries`.
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
/// For positive finite radii, the reading is the unscaled median absolute deviation of ln(map
/// radius) − ln(representation radius). A constant radius ratio gives zero spread. MAD measures
/// dispersion around the median and can remain zero when some ratios differ. The median log ratio
/// retains the metrics' relative scale. Uniform multiplicative radius rescaling shifts it without
/// changing the spread in exact arithmetic.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct DensityRow {
    /// The neighbourhood size both radii come from.
    pub neighbourhood: NonZero<usize>,
    /// Anchors with positive radii contributing a log ratio.
    ///
    /// Finite radii give finite ratios, though positivity alone admits an overflowed infinite
    /// radius.
    pub anchors: usize,
    /// Anchors excluded for a zero radius.
    ///
    /// The computed k-th radius is zero in at least one space. Cosine-equivalent directions or
    /// floating-point rounding can produce a zero representation radius without equal embedding
    /// components.
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
    /// For probe-produced rows, never below plain recall over the same neighbourhood lists.
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
    /// For probe-produced rows, never below plain recall over the same neighbourhood lists.
    pub clump_recall: Option<UnitFraction>,
}

/// One subgroup's representation-baseline readings over the sampled universe.
///
/// Plain and collapsed recall show how a subgroup's representation loss changes when component
/// labels replace row identity, before projection. Matching the whole-probe baseline after collapse
/// is diagnostic evidence, not proof that the difference arose from near ties or that the component
/// is compact. These rows contain no placement judgment.
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
/// breach on clump ids and marks it resolved when collapsed subgroup degradation is at most the
/// configured factor times collapsed whole-probe degradation. The mark certifies neither component
/// compactness nor within-component placement. Flags and resolution never affect admission.
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
    /// The reading must be at least the threshold.
    Floor(f64),
    /// The reading must be at most the threshold.
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

/// One metric reading paired with its inclusive admission bound.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct Control {
    /// The metric the control checks.
    pub metric: QualityMetric,
    /// The reduced reading, absent when the control's presence check fails.
    pub reading: Option<f64>,
    /// The applied threshold and the side of it that admits.
    pub bound: Bound,
}

impl Control {
    /// Returns whether a reading is present and satisfies its inclusive bound.
    ///
    /// A NaN reading fails either bound.
    pub(crate) fn admits(&self) -> bool {
        self.reading
            .is_some_and(|reading| self.bound.admits(reading))
    }
}

/// One probe's rendered evidence and verdict inputs.
///
/// The report carries probe sizes and applied thresholds, permitting verdict recomputation without
/// the original configuration. These fields record results rather than prove their provenance.
/// Direct construction and deserialization do not check grid alignment, observation counts or
/// consistency between readings.
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
    /// Per-type representation-baseline readings over the sampled universe, report-only.
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
    /// Neighbourhood floors use the lowest primary-grid reading and the intrusion ceiling uses the
    /// highest. An empty primary grid yields absent readings. The density control is absent for an
    /// empty density list or any row with no spread, otherwise it uses the maximum spread. Triplet
    /// agreement is present only when its recorded triplet count is positive.
    /// [`passes`](Self::passes) is the conjunction of these controls.
    ///
    /// These reductions do not check metric-row query counts or alignment between metric and
    /// density steps. Density spreads must be finite: [`f64::max`] ignores a NaN operand,
    /// permitting a non-finite row to leave a finite maximum or the initial negative infinity. The
    /// controls report which readings exist, not whether those readings are sound.
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

        // every density step must supply a spread; an absent step invalidates the whole control
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

    /// Returns whether every reduced metric satisfies its admission bound.
    ///
    /// True exactly when every [control](Self::controls) has a present reading inside its inclusive
    /// bound. Subgroup flags and clump resolution never affect this verdict. The controls' presence
    /// checks do not validate the report as a whole.
    #[must_use]
    pub(crate) fn passes(&self) -> bool {
        self.controls().iter().all(Control::admits)
    }
}
