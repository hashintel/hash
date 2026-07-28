//! The quality report: rendered probe evidence and its release verdict.
//!
//! [`assess`] turns one probe's readings into a flat, serializable record: every grid's overall
//! metrics per neighbourhood size, per-subgroup readings on the primary grid, the subgroup flags
//! the degradation rule raises, and the thresholds that were applied. The report is a rendering of
//! [`ProbeReadings`] - regrouping or re-assessment starts from the readings, never from the report.
//!
//! The primary fidelity surface is the corpus-exact map-versus-representation grid: each sampled
//! anchor is ranked against the full corpus, so the comparison universe carries no subsampling -
//! but the anchors themselves are sampled, so aggregate means retain anchor-sampling uncertainty.
//! The thresholds bind there and gate the observed probe statistic, not a population guarantee or
//! lower confidence bound. The sampled grids provide context - the canonical triangle whose
//! representation baseline the map's canonical reading is judged against - and stay report-only.
//!
//! Subgroups are entity types: an anchor contributes to one subgroup per direct type, so
//! multi-typed anchors count in each of their groups. A subgroup flags at a neighbourhood size when
//! its degradation - one minus recall - exceeds the configured factor times the overall
//! degradation - twice, by the normative default. Flags are raised per neighbourhood size,
//! so the size trend - recall rising with the neighbourhood suggests near-tie reshuffling rather
//! than genuine placement loss, evidence rather than a classifier - is visible in the flags and in
//! every subgroup's rows. Subgroups
//! below the configured anchor floor never flag - a handful of anchors cannot support a degradation
//! ratio - but their rows are still reported.
//!
//! Density distortion reads the spread of log neighbourhood-radius ratios over the anchors, a
//! unit-free reading of uneven compression; the triplet rows read distance-order preservation over
//! the probe's shared pair sample for all three space pairs. Both are rendered from the readings
//! like every other row.
//!
//! When the probe carries a clump grouping, the report adds the corpus reading collapsed onto clump
//! ids and re-evaluates every flag at that granularity. A flag whose collapsed degradation
//! satisfies the same factor rule is recorded as clump-resolved: the breach vanishes when recall
//! is measured on component labels - a triage diagnostic and nothing stronger, since ε
//! single-linkage components can chain to arbitrary diameter, so resolution certifies neither
//! component compactness nor within-component placement. Subgroup flags and their resolution are
//! report-only either way: they steer the human reading the report and never affect admission.
//!
//! The thresholds default to maximally permissive values - floors at zero, ceilings at their
//! domain edge - so the default verdict gates evidence presence rather than fidelity: an
//! invented floor would rest release verdicts on fiction. Deployments impose measured bounds
//! through the run's validated thresholds document.

use alloc::collections::BTreeMap;
use core::fmt;

use smallvec::SmallVec;

use super::{
    clump::ClumpAggregate,
    metric::{NeighbourhoodAggregate, TripletAggregate},
    probe::{ProbeReadings, ReadingGrid},
};
use crate::{
    identity::OntologyRowId,
    math::{NonNegative, UnitFraction, narrow_f32},
};

// The degradation factor is normative: no important subgroup may
// suffer more than twice the overall degradation. The
// anchor floor bounds single-anchor leverage on a subgroup reading to
// one eighth; it is a sampling-noise floor, not a statement about
// which subgroups matter.
const DEFAULT_DEGRADATION_FACTOR: f64 = 2.0;
const DEFAULT_MINIMUM_SUBGROUP_ANCHORS: usize = 8;

/// The maximally permissive density-spread ceiling.
///
/// The spread of `ln` radius ratios over f32 radii is bounded by a few hundred, so the f32
/// maximum is unbounded in practice while the type keeps the ceiling finite and non-negative by
/// construction.
const PERMISSIVE_DENSITY_SPREAD: NonNegative =
    NonNegative::new(f32::MAX).expect("the f32 maximum is finite and non-negative");

/// A quality-thresholds override document.
///
/// The optional-file shape of the six absolute controls: a present field overrides its source
/// default after domain validation, an absent field keeps it, and an unknown field refuses the
/// whole document.
#[derive(Debug, Copy, Clone, Default, serde::Deserialize)]
#[serde(default, deny_unknown_fields)]
pub(crate) struct ThresholdOverrides {
    /// Overriding recall floor, in `[0, 1]`.
    pub minimum_recall: Option<f64>,
    /// Overriding trustworthiness floor, in `[0, 1]`.
    pub minimum_trustworthiness: Option<f64>,
    /// Overriding continuity floor, in `[0, 1]`.
    pub minimum_continuity: Option<f64>,
    /// Overriding intrusion-rate ceiling, in `[0, 1]`.
    pub maximum_intrusion_rate: Option<f64>,
    /// Overriding density-spread ceiling, finite and non-negative.
    pub maximum_density_spread: Option<f64>,
    /// Overriding triplet-agreement floor, in `[0, 1]`.
    pub minimum_triplet_agreement: Option<f64>,
}

/// An override value outside its control's domain.
#[derive(Debug)]
pub struct ThresholdDomainError {
    /// The refused field.
    pub field: &'static str,
    /// The refused value.
    pub value: f64,
    /// The domain the field demands.
    pub domain: &'static str,
}

impl fmt::Display for ThresholdDomainError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            fmt,
            "the {} override {} lies outside {}",
            self.field, self.value, self.domain,
        )
    }
}

impl core::error::Error for ThresholdDomainError {}

/// The thresholds of one assessment.
///
/// Every control is a concrete validated value - floors and ceilings apply to the corpus
/// map-versus-representation grid at every neighbourhood size, and there is no unpinned state:
/// [`QualityReport::passes`] compares all six controls and demands their evidence.
///
/// The defaults are maximally permissive: every control sits at the edge of its domain, so the
/// default verdict gates evidence presence rather than fidelity. Deployments impose measured
/// bounds through an override document that replaces individual defaults after domain
/// validation ([`ThresholdOverrides`]).
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct QualityThresholds {
    /// Minimum recall floor. Defaults to the permissive zero.
    pub minimum_recall: UnitFraction = UnitFraction::ZERO,
    /// Minimum trustworthiness floor. Defaults to the permissive zero.
    pub minimum_trustworthiness: UnitFraction = UnitFraction::ZERO,
    /// Minimum continuity floor. Defaults to the permissive zero.
    pub minimum_continuity: UnitFraction = UnitFraction::ZERO,
    /// Maximum intrusion-rate ceiling. Defaults to the permissive one.
    pub maximum_intrusion_rate: UnitFraction = UnitFraction::ONE,
    /// Maximum density-distortion spread.
    ///
    /// Defaults to the permissive f32 maximum. The ceiling fails when the reading is absent - a
    /// demand for evidence that was never produced is a configuration contradiction, surfaced at
    /// the verdict.
    pub maximum_density_spread: NonNegative = PERMISSIVE_DENSITY_SPREAD,
    /// Minimum map-versus-representation triplet agreement floor.
    ///
    /// Defaults to the permissive zero; it fails when the triplet readings are disabled.
    pub minimum_triplet_agreement: UnitFraction = UnitFraction::ZERO,
    /// A subgroup flags when its degradation exceeds this factor times the overall degradation.
    ///
    /// Defaults to 2, the normative subgroup rule: no important subgroup may suffer more than
    /// twice the overall degradation.
    pub subgroup_degradation_factor: f64 = DEFAULT_DEGRADATION_FACTOR,
    /// Subgroups with fewer anchors never flag. Defaults to 8.
    pub minimum_subgroup_anchors: usize = DEFAULT_MINIMUM_SUBGROUP_ANCHORS,
}

impl QualityThresholds {
    /// Applies an override document over these thresholds.
    ///
    /// A present field replaces its default after domain validation; an absent field keeps it.
    ///
    /// # Errors
    ///
    /// Returns the first override whose value lies outside its control's domain.
    pub(crate) fn with_overrides(
        mut self,
        overrides: &ThresholdOverrides,
    ) -> Result<Self, ThresholdDomainError> {
        fn fraction(
            field: &'static str,
            value: Option<f64>,
            into: &mut UnitFraction,
        ) -> Result<(), ThresholdDomainError> {
            if let Some(value) = value {
                *into = UnitFraction::new(value).ok_or(ThresholdDomainError {
                    field,
                    value,
                    domain: "the closed unit interval",
                })?;
            }
            Ok(())
        }

        fraction(
            "minimum_recall",
            overrides.minimum_recall,
            &mut self.minimum_recall,
        )?;
        fraction(
            "minimum_trustworthiness",
            overrides.minimum_trustworthiness,
            &mut self.minimum_trustworthiness,
        )?;
        fraction(
            "minimum_continuity",
            overrides.minimum_continuity,
            &mut self.minimum_continuity,
        )?;
        fraction(
            "maximum_intrusion_rate",
            overrides.maximum_intrusion_rate,
            &mut self.maximum_intrusion_rate,
        )?;
        fraction(
            "minimum_triplet_agreement",
            overrides.minimum_triplet_agreement,
            &mut self.minimum_triplet_agreement,
        )?;
        if let Some(value) = overrides.maximum_density_spread {
            // The f64 domain check precedes narrowing: a negative
            // underflow narrows to -0.0 and a value just above the f32
            // maximum rounds down onto it - both must refuse as
            // written, not as rounded.
            let admitted = (value.is_finite() && value >= 0.0 && value <= f64::from(f32::MAX))
                .then(|| narrow_f32(value))
                .flatten()
                .and_then(NonNegative::new);
            self.maximum_density_spread = admitted.ok_or(ThresholdDomainError {
                field: "maximum_density_spread",
                value,
                domain: "the finite non-negative f32 range",
            })?;
        }
        Ok(self)
    }
}

const impl Default for QualityThresholds {
    fn default() -> Self {
        Self { .. }
    }
}

/// One aggregate's readings at one neighbourhood size.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct MetricRow {
    /// The neighbourhood size the row reads at.
    pub neighbourhood: usize,
    /// Queries the row aggregates over.
    pub queries: usize,
    /// Mean fraction of shared neighbourhoods, in `[0, 1]`.
    pub recall: f64,
    /// Trustworthiness, in `[0, 1]`.
    pub trustworthiness: f64,
    /// Continuity, in `[0, 1]`.
    pub continuity: f64,
    /// Fraction of false neighbours past the horizon, in `[0, 1]`.
    pub intrusion_rate: f64,
    /// Fraction of banished neighbours past the horizon, in `[0, 1]`.
    pub extrusion_rate: f64,
}

impl MetricRow {
    /// Reads one aggregate at the given neighbourhood size.
    fn read(neighbourhood: usize, aggregate: &NeighbourhoodAggregate) -> Self {
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
    /// The neighbourhood size the radii were read at.
    pub neighbourhood: usize,
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
    /// The preserved fraction, in `[0, 1]`; 1 when nothing was observed.
    pub agreement: f64,
}

impl TripletRow {
    /// Merges every anchor's aggregate into one row.
    fn read(anchors: &[TripletAggregate]) -> Self {
        let mut merged = TripletAggregate::default();
        for aggregate in anchors {
            merged.merge(aggregate);
        }

        Self {
            triplets: merged.triplets(),
            preserved: merged.preserved(),
            agreement: merged.agreement().get(),
        }
    }
}

/// One neighbourhood size's clump-granularity recall reading.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ClumpRow {
    /// The neighbourhood size the row reads at.
    pub neighbourhood: usize,
    /// Queries the row aggregates over.
    pub queries: usize,
    /// Mean matched fraction of the collapsed neighbourhoods, in `[0, 1]`.
    ///
    /// Never below the plain recall at the same size.
    pub recall: f64,
}

/// The clump-granularity evidence block.
///
/// The grouping's shape - counts at the threshold it was built at - travels with the collapsed
/// readings, so the block justifies its own granularity: a threshold grouping half the corpus reads
/// very differently from one grouping a few percent.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ClumpReport {
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
    /// One row per neighbourhood size in reporting order.
    pub map_representation: Vec<ClumpRow>,
    /// Collapsed representation-versus-canonical readings over the comparison rows.
    ///
    /// One row per neighbourhood size in reporting order: the representation baseline at clump
    /// granularity.
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
    pub neighbourhood: usize,
    /// Queries the row aggregates over.
    pub queries: usize,
    /// Recall of exact canonical neighbourhoods in the representation, in `[0, 1]`.
    pub recall: f64,
    /// The same reading collapsed onto clump ids, when clump readings exist.
    ///
    /// Never below the plain recall.
    pub clump_recall: Option<f64>,
}

/// One subgroup's representation-baseline readings over the sampled universe.
///
/// The stratification separates representation loss from near-tie reshuffling per the
/// triage rule: a subgroup whose plain baseline recall trails the overall reading but whose
/// collapsed recall restores to it breaches only on component labels in the representation
/// itself, before any projection - a triage signal, not a placement certification.
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
/// A flag carries its own triage evidence: when clump readings exist, the breach is re-evaluated
/// at clump granularity, and a breach the collapse restores is marked resolved: component-label
/// recall no longer breaches. The mark is triage evidence - not a certification of component
/// compactness or within-component placement - and it never affects admission.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SubgroupFlag {
    /// The flagged subgroup's type, as its ontology row.
    pub ontology_row: OntologyRowId,
    /// The neighbourhood size the breach was read at.
    pub neighbourhood: usize,
    /// Anchors carrying the type.
    pub anchors: usize,
    /// The subgroup's degradation: one minus its recall.
    pub degradation: f64,
    /// The overall degradation the factor multiplied.
    pub overall_degradation: f64,
    /// The subgroup's degradation at clump granularity, when clump readings exist.
    pub clump_degradation: Option<f64>,
    /// The overall clump-granularity degradation the re-evaluation compared against.
    pub clump_overall_degradation: Option<f64>,
    /// Whether the clump-granularity re-evaluation satisfies the degradation rule.
    ///
    /// Always false without clump readings.
    pub clump_resolved: bool,
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
    /// The sampled grids' universe: the comparison row count.
    pub comparisons: usize,
    /// Corpus map-versus-representation readings, per neighbourhood size.
    ///
    /// The primary surface: the verdict binds here.
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
    pub minimum_recall: f64,
    /// The applied trustworthiness floor.
    pub minimum_trustworthiness: f64,
    /// The applied continuity floor.
    pub minimum_continuity: f64,
    /// The applied intrusion ceiling.
    pub maximum_intrusion_rate: f64,
    /// The applied density-spread ceiling.
    pub maximum_density_spread: f64,
    /// The applied triplet-agreement floor.
    pub minimum_triplet_agreement: f64,
    /// The applied degradation factor.
    pub subgroup_degradation_factor: f64,
    /// The applied subgroup anchor floor.
    pub minimum_subgroup_anchors: usize,
}

impl QualityReport {
    /// Returns whether the full battery admits the generation.
    ///
    /// True exactly when every reading lies inside its control's bound and every control's
    /// evidence is present. The controls are concrete validated values - maximally permissive by
    /// default - so the verdict turns on evidence and readings, never on configuration shape.
    /// Subgroup flags and their clump-resolution triage
    /// are report-only fields: they inform the human reading the report and never affect
    /// admission.
    #[must_use]
    pub(crate) fn passes(&self) -> bool {
        // Thresholds on absent readings fail: a control demands the
        // evidence it is compared against. An empty grid, an
        // all-degenerate density rung, and disabled triplet sampling
        // all refuse - none vacuously passes.
        let thresholds_hold = !self.map_representation.is_empty()
            && self.map_representation.iter().all(|row| {
                row.recall >= self.minimum_recall
                    && row.trustworthiness >= self.minimum_trustworthiness
                    && row.continuity >= self.minimum_continuity
                    && row.intrusion_rate <= self.maximum_intrusion_rate
            });
        let density_holds = !self.density.is_empty()
            && self.density.iter().all(|row| {
                row.spread
                    .is_some_and(|spread| spread <= self.maximum_density_spread)
            });
        let triplets_hold = self.triplet_map_representation.triplets > 0
            && self.triplet_map_representation.agreement >= self.minimum_triplet_agreement;

        thresholds_hold && density_holds && triplets_hold
    }
}

/// Renders one probe's readings into a report under the thresholds.
///
/// `anchor_types` lists each anchor's direct types, parallel to the readings' anchors; an empty
/// list leaves an anchor in the overall readings only. Subgroup readings merge the per-anchor
/// cells, so the report costs no ranking work.
///
/// # Panics
///
/// Panics when `anchor_types` and the readings disagree about the anchor count; both describe one
/// probe, so a mismatch is a wiring defect.
#[must_use]
pub(crate) fn assess(
    readings: &ProbeReadings,
    anchor_types: &[SmallVec<OntologyRowId, 2>],
    thresholds: &QualityThresholds,
) -> QualityReport {
    assert_eq!(
        anchor_types.len(),
        readings.anchors.len(),
        "the anchor types and the readings should describe the same anchors",
    );

    let rungs: Vec<usize> = readings
        .neighbourhoods
        .iter()
        .map(|neighbourhood| neighbourhood.get())
        .collect();
    let overall_rows = |grid: &ReadingGrid| -> Vec<MetricRow> {
        rungs
            .iter()
            .enumerate()
            .map(|(rung, &neighbourhood)| MetricRow::read(neighbourhood, &grid.overall(rung)))
            .collect()
    };
    let map_representation = overall_rows(&readings.map_representation);
    let clump_overall: Option<Vec<ClumpAggregate>> = readings.clumps.as_ref().map(|clumps| {
        (0..rungs.len())
            .map(|rung| clumps.map_representation.overall(rung))
            .collect()
    });

    // Membership by ontology row; the map iterates ascending, so
    // subgroups and flags order deterministically.
    let mut members: BTreeMap<OntologyRowId, Vec<usize>> = BTreeMap::new();
    for (anchor, types) in anchor_types.iter().enumerate() {
        for &ontology in types {
            members.entry(ontology).or_default().push(anchor);
        }
    }

    let (subgroups, flags) = subgroup_reports(
        readings,
        &map_representation,
        clump_overall.as_deref(),
        &members,
        thresholds,
    );
    let baseline_subgroups = baseline_subgroup_reports(readings, &rungs, &members);

    QualityReport {
        anchors: readings.anchors.len(),
        corpus_universe: readings.map_representation.overall(0).universe(),
        comparisons: readings.comparisons.len(),
        map_representation,
        clumps: readings.clumps.as_ref().map(|clumps| {
            let rendered = |grid: &ReadingGrid<ClumpAggregate>| -> Vec<ClumpRow> {
                rungs
                    .iter()
                    .enumerate()
                    .map(|(rung, &neighbourhood)| {
                        let aggregate = grid.overall(rung);
                        ClumpRow {
                            neighbourhood,
                            queries: aggregate.queries(),
                            recall: aggregate.recall(),
                        }
                    })
                    .collect()
            };
            ClumpReport {
                epsilon: clumps.epsilon,
                count: clumps.count,
                groups: clumps.groups,
                grouped_rows: clumps.grouped_rows,
                map_representation: rendered(&clumps.map_representation),
                representation_canonical: rendered(&clumps.representation_canonical),
            }
        }),
        sampled_map_representation: overall_rows(&readings.sampled_map_representation),
        sampled_map_canonical: overall_rows(&readings.sampled_map_canonical),
        sampled_representation_canonical: overall_rows(&readings.sampled_representation_canonical),
        density: density_rows(readings, &rungs),
        triplet_map_representation: TripletRow::read(&readings.triplet_map_representation),
        triplet_map_canonical: TripletRow::read(&readings.triplet_map_canonical),
        triplet_representation_canonical: TripletRow::read(
            &readings.triplet_representation_canonical,
        ),
        subgroups,
        baseline_subgroups,
        flags,
        minimum_recall: thresholds.minimum_recall.get(),
        minimum_trustworthiness: thresholds.minimum_trustworthiness.get(),
        minimum_continuity: thresholds.minimum_continuity.get(),
        maximum_intrusion_rate: thresholds.maximum_intrusion_rate.get(),
        maximum_density_spread: f64::from(thresholds.maximum_density_spread.get()),
        minimum_triplet_agreement: thresholds.minimum_triplet_agreement.get(),
        subgroup_degradation_factor: thresholds.subgroup_degradation_factor,
        minimum_subgroup_anchors: thresholds.minimum_subgroup_anchors,
    }
}

/// Merges subgroup memberships into per-type rows and degradation flags.
///
/// Every breach is re-evaluated at clump granularity when clump readings exist: the same factor
/// rule over the collapsed recalls decides the flag's resolution.
fn subgroup_reports(
    readings: &ProbeReadings,
    overall: &[MetricRow],
    clump_overall: Option<&[ClumpAggregate]>,
    members: &BTreeMap<OntologyRowId, Vec<usize>>,
    thresholds: &QualityThresholds,
) -> (Vec<SubgroupReport>, Vec<SubgroupFlag>) {
    let mut subgroups = Vec::with_capacity(members.len());
    let mut flags = Vec::new();
    for (&ontology_row, anchors) in members {
        let (&first, rest) = anchors
            .split_first()
            .expect("every membership list holds the anchor that created it");
        let rows: Vec<MetricRow> = overall
            .iter()
            .enumerate()
            .map(|(rung, overall_row)| {
                let mut merged = readings.map_representation.anchor(first, rung).clone();
                for &anchor in rest {
                    merged.merge(readings.map_representation.anchor(anchor, rung));
                }
                MetricRow::read(overall_row.neighbourhood, &merged)
            })
            .collect();

        if anchors.len() >= thresholds.minimum_subgroup_anchors {
            for (rung, (subgroup_row, overall_row)) in rows.iter().zip(overall).enumerate() {
                let degradation = 1.0 - subgroup_row.recall;
                let overall_degradation = 1.0 - overall_row.recall;
                if degradation <= thresholds.subgroup_degradation_factor * overall_degradation {
                    continue;
                }

                // The triage re-evaluation: the same rule at clump
                // granularity, subgroup against overall.
                let collapsed = readings.clumps.as_ref().map(|clumps| {
                    let mut merged = *clumps.map_representation.anchor(first, rung);
                    for &anchor in rest {
                        merged.merge(clumps.map_representation.anchor(anchor, rung));
                    }
                    let overall = &clump_overall
                        .expect("clump readings produce overall clump aggregates")[rung];
                    (1.0 - merged.recall(), 1.0 - overall.recall())
                });

                flags.push(SubgroupFlag {
                    ontology_row,
                    neighbourhood: subgroup_row.neighbourhood,
                    anchors: anchors.len(),
                    degradation,
                    overall_degradation,
                    clump_degradation: collapsed.map(|(subgroup, _)| subgroup),
                    clump_overall_degradation: collapsed.map(|(_, overall)| overall),
                    clump_resolved: collapsed.is_some_and(|(subgroup, overall)| {
                        subgroup <= thresholds.subgroup_degradation_factor * overall
                    }),
                });
            }
        }

        subgroups.push(SubgroupReport {
            ontology_row,
            anchors: anchors.len(),
            rows,
        });
    }

    (subgroups, flags)
}

/// Merges subgroup memberships into per-type representation-baseline rows.
///
/// Every row merges the sampled representation-versus-canonical cells of the subgroup's anchors,
/// plain and - when clump readings exist - collapsed, so the audit stratification and its triage
/// evidence travel together.
fn baseline_subgroup_reports(
    readings: &ProbeReadings,
    rungs: &[usize],
    members: &BTreeMap<OntologyRowId, Vec<usize>>,
) -> Vec<BaselineSubgroupReport> {
    members
        .iter()
        .map(|(&ontology_row, anchors)| {
            let (&first, rest) = anchors
                .split_first()
                .expect("every membership list holds the anchor that created it");
            let rows = rungs
                .iter()
                .enumerate()
                .map(|(rung, &neighbourhood)| {
                    let mut merged = readings
                        .sampled_representation_canonical
                        .anchor(first, rung)
                        .clone();
                    for &anchor in rest {
                        merged.merge(
                            readings
                                .sampled_representation_canonical
                                .anchor(anchor, rung),
                        );
                    }

                    let collapsed = readings.clumps.as_ref().map(|clumps| {
                        let mut merged = *clumps.representation_canonical.anchor(first, rung);
                        for &anchor in rest {
                            merged.merge(clumps.representation_canonical.anchor(anchor, rung));
                        }
                        merged.recall()
                    });

                    BaselineRow {
                        neighbourhood,
                        queries: merged.queries(),
                        recall: merged.recall(),
                        clump_recall: collapsed,
                    }
                })
                .collect();

            BaselineSubgroupReport {
                ontology_row,
                anchors: anchors.len(),
                rows,
            }
        })
        .collect()
}

/// Reads each neighbourhood size's density distortion from the radii.
fn density_rows(readings: &ProbeReadings, rungs: &[usize]) -> Vec<DensityRow> {
    rungs
        .iter()
        .enumerate()
        .map(|(rung, &neighbourhood)| {
            let mut ratios: Vec<f64> = readings
                .radii
                .iter()
                .skip(rung)
                .step_by(rungs.len().max(1))
                .filter(|radii| radii.map > 0.0 && radii.representation > 0.0)
                .map(|radii| f64::from(radii.map).ln() - f64::from(radii.representation).ln())
                .collect();
            let anchors = ratios.len();
            let degenerate = readings.anchors.len() - anchors;

            let median_log_ratio = median(&mut ratios);
            let spread = median_log_ratio.and_then(|median_value| {
                for ratio in &mut ratios {
                    *ratio = (*ratio - median_value).abs();
                }
                median(&mut ratios)
            });

            DensityRow {
                neighbourhood,
                anchors,
                degenerate,
                median_log_ratio,
                spread,
            }
        })
        .collect()
}

// Median and MAD stay private here: shared statistics vocabulary
// graduates on its second consumer, never speculatively.
/// Returns the median, averaging the middle pair over even lengths; [`None`] on empty input.
///
/// Sorts `values` in place.
#[expect(
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "the middle index is the floor of half the length by definition"
)]
fn median(values: &mut [f64]) -> Option<f64> {
    if values.is_empty() {
        return None;
    }

    values.sort_unstable_by(f64::total_cmp);
    let middle = values.len() / 2;
    if values.len() % 2 == 1 {
        return Some(values[middle]);
    }

    Some(f64::midpoint(values[middle - 1], values[middle]))
}
