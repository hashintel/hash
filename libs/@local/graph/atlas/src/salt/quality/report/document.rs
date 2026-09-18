//! The quality report's rendered rows, applied thresholds, and verdict controls.

use core::{fmt, mem::variant_count, num::NonZero};

use super::super::{
    QualityMetric,
    metric::{NeighbourhoodAggregate, TripletAggregate},
};
use crate::{
    identity::OntologyRowId,
    math::{DFinite, NonNegative, UnitFraction},
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
    pub median_log_ratio: Option<DFinite>,
    /// The median absolute deviation around the median, unscaled.
    ///
    /// Absent without contributing anchors.
    pub spread: Option<DFinite>,
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
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Bound {
    /// The reading must be at least the threshold.
    Floor(DFinite),
    /// The reading must be at most the threshold.
    Ceiling(DFinite),
}

impl Bound {
    /// Returns whether `reading` lies inside the bound.
    const fn admits(self, reading: DFinite) -> bool {
        match self {
            Self::Floor(floor) => reading >= floor,
            Self::Ceiling(ceiling) => reading <= ceiling,
        }
    }
}

/// The reason a population cannot supply a measurement.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize)]
pub(crate) enum InconclusiveReason {
    /// Too few distinct rows exist for the metric's domain.
    InsufficientData,
}

/// A metric's measured verdict or population-insufficient outcome.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize)]
pub(crate) enum MetricEval {
    /// A finite reading satisfies its bound.
    Pass { reading: DFinite },
    /// A reading violates its bound, or where required evidence is missing.
    Fail { reading: Option<DFinite> },
    /// The population cannot define the measurement.
    Inconclusive { reason: InconclusiveReason },
}

#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize)]
pub(crate) enum MetricReading {
    Inconclusive(InconclusiveReason),
    Value(DFinite),
    Missing,
}

const impl From<Option<DFinite>> for MetricReading {
    fn from(value: Option<DFinite>) -> Self {
        match value {
            Some(value) => Self::Value(value),
            None => Self::Missing,
        }
    }
}

/// One metric's outcome paired with its inclusive admission bound.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize)]
pub(crate) struct Control {
    /// The metric the control checks.
    pub metric: QualityMetric,
    /// The applied threshold and the side of it that admits.
    pub bound: Bound,
    /// The measured verdict or reason evaluation is unavailable.
    pub eval: MetricEval,
}

impl Control {
    /// Assesses evidence while keeping population insufficiency separate from missing readings.
    const fn new(metric: QualityMetric, reading: MetricReading, bound: Bound) -> Self {
        let eval = match reading {
            MetricReading::Value(reading) if bound.admits(reading) => MetricEval::Pass { reading },
            MetricReading::Value(reading) => MetricEval::Fail {
                reading: Some(reading),
            },
            MetricReading::Inconclusive(reason) => MetricEval::Inconclusive { reason },
            MetricReading::Missing => MetricEval::Fail { reading: None },
        };

        Self {
            metric,
            bound,
            eval,
        }
    }

    /// Returns the reduced observation, absent for missing or insufficient evidence.
    pub(crate) const fn reading(&self) -> Option<DFinite> {
        match self.eval {
            MetricEval::Pass { reading } => Some(reading),
            MetricEval::Fail { reading } => reading,
            MetricEval::Inconclusive { .. } => None,
        }
    }

    /// Returns whether this control permits admission, including population insufficiency.
    pub(crate) const fn admits(&self) -> bool {
        !matches!(self.eval, MetricEval::Fail { .. })
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
    /// Requested pair draws. Zero disables triplets and refuses admission.
    pub triplet_pairs_requested: usize,
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

impl fmt::Display for QualityReport {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(fmt, "passes      {}", self.passes())?;
        writeln!(fmt, "admits      {}", self.admits())?;
        writeln!(
            fmt,
            "samples     {} anchors, {} comparisons",
            self.anchors, self.comparisons
        )?;

        for control in self.controls() {
            write!(fmt, "{}: ", control.metric.label())?;
            match control.eval {
                MetricEval::Pass { reading } => writeln!(fmt, "passed ({reading:.4})")?,
                MetricEval::Fail {
                    reading: Some(reading),
                } => writeln!(fmt, "failed ({reading:.4})")?,
                MetricEval::Fail { reading: None } => {
                    writeln!(fmt, "failed (missing or non-finite evidence)")?;
                }
                MetricEval::Inconclusive { .. } => {
                    writeln!(fmt, "not evaluated: insufficient data")?;
                }
            }
        }

        Ok(())
    }
}

impl QualityReport {
    /// Returns the battery's controls, each carrying the reading its verdict turns on.
    ///
    /// Neighbourhood floors use the lowest primary-grid reading and the intrusion ceiling uses the
    /// highest. An empty primary grid yields absent readings. The density control is absent for an
    /// empty density list or any row with no spread, otherwise it uses the maximum spread. Triplet
    /// agreement is present only when its recorded triplet count is positive.
    ///
    /// Populations below three cannot define the rank or triplet metrics. Density requires two
    /// rows. These unavailable metrics permit admission. Missing evidence above those population
    /// floors refuses admission, as do zero requested triplet draws and non-finite density spreads.
    #[must_use]
    pub(crate) fn controls(&self) -> [Control; variant_count::<QualityMetric>()] {
        let population = self.anchors.saturating_add(self.corpus_universe);

        let lowest = |read: fn(&MetricRow) -> UnitFraction, min_population: usize| {
            if population < min_population {
                return MetricReading::Inconclusive(InconclusiveReason::InsufficientData);
            }

            match self
                .map_representation
                .iter()
                .map(read)
                .reduce(UnitFraction::min)
            {
                Some(value) => MetricReading::Value(value.into()),
                None => MetricReading::Missing,
            }
        };

        let highest = |read: fn(&MetricRow) -> UnitFraction, min_population: usize| {
            if population < min_population {
                return MetricReading::Inconclusive(InconclusiveReason::InsufficientData);
            }

            match self
                .map_representation
                .iter()
                .map(read)
                .reduce(UnitFraction::max)
            {
                Some(value) => MetricReading::Value(value.into()),
                None => MetricReading::Missing,
            }
        };

        let spread = self
            .density
            .iter()
            .try_fold(None::<DFinite>, |highest, row| {
                let spread = row.spread?;
                let highest = highest.unwrap_or(DFinite::MAX);

                Some(Some(highest.max(spread)))
            })
            .flatten();

        let triplets = &self.triplet_map_representation;

        [
            Control::new(
                QualityMetric::Recall,
                lowest(|row| row.recall, 3),
                Bound::Floor(self.minimum_recall.into()),
            ),
            Control::new(
                QualityMetric::Trustworthiness,
                lowest(|row| row.trustworthiness, 3),
                Bound::Floor(self.minimum_trustworthiness.into()),
            ),
            Control::new(
                QualityMetric::Continuity,
                lowest(|row| row.continuity, 3),
                Bound::Floor(self.minimum_continuity.into()),
            ),
            Control::new(
                QualityMetric::IntrusionRate,
                highest(|row| row.intrusion_rate, 3),
                Bound::Ceiling(self.maximum_intrusion_rate.into()),
            ),
            Control::new(
                QualityMetric::DensitySpread,
                if population < 2 {
                    MetricReading::Inconclusive(InconclusiveReason::InsufficientData)
                } else {
                    MetricReading::from(spread)
                },
                Bound::Ceiling(self.maximum_density_spread.widen().into()),
            ),
            Control::new(
                QualityMetric::TripletAgreement,
                if population < 3 && self.triplet_pairs_requested > 0 {
                    MetricReading::Inconclusive(InconclusiveReason::InsufficientData)
                } else {
                    MetricReading::from(
                        (triplets.triplets > 0).then_some(triplets.agreement.into()),
                    )
                },
                Bound::Floor(self.minimum_triplet_agreement.into()),
            ),
        ]
    }

    /// Returns whether every reduced metric satisfies its admission bound.
    ///
    /// Population-insufficient metrics leave this false. Use [`admits`](Self::admits) for
    /// permission to activate. Subgroup flags and clump resolution never affect either decision.
    #[must_use]
    pub(crate) fn passes(&self) -> bool {
        self.controls()
            .iter()
            .all(|control| matches!(control.eval, MetricEval::Pass { .. }))
    }

    /// Returns whether the measured controls admit, allowing population-insufficient metrics.
    #[must_use]
    pub(crate) fn admits(&self) -> bool {
        self.controls().iter().all(Control::admits)
    }
}
