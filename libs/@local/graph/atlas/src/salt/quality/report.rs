//! The quality report: rendered probe evidence and release gates.
//!
//! [`assess`] turns one probe's readings into a flat, serializable
//! record: every grid's overall metrics per neighbourhood size,
//! per-subgroup readings on the primary grid, the subgroup flags the
//! degradation rule raises, and the thresholds that were applied. The
//! report is a rendering of [`ProbeReadings`] - regrouping or
//! re-gating starts from the readings, never from the report.
//!
//! The primary fidelity surface is the corpus-exact
//! map-versus-representation grid: it reads the projector's own
//! placement without sampling noise, so gates bind there. The sampled
//! grids provide context - the canonical triangle whose
//! representation baseline the map's canonical reading is judged
//! against - and are reported ungated.
//!
//! Subgroups are entity types: an anchor contributes to one subgroup
//! per direct type, so multi-typed anchors count in each of their
//! groups. A subgroup flags at a neighbourhood size when its
//! degradation - one minus recall - exceeds the configured factor
//! times the overall degradation, the rule the specification sets at
//! twice. Flags are raised per neighbourhood size, so the size trend
//! that separates near-tie reshuffling (recall rising with the
//! neighbourhood) from genuine placement loss is visible in the flags
//! and in every subgroup's rows. Subgroups below the configured
//! anchor floor never flag - a handful of anchors cannot support a
//! degradation ratio - but their rows are still reported.
//!
//! Density distortion reads the spread of log neighbourhood-radius
//! ratios over the anchors, a unit-free reading of uneven compression;
//! the triplet rows read distance-order preservation over the probe's
//! shared pair sample for all three space pairs. Both are rendered
//! from the readings like every other row.
//!
//! When the probe carries a clump grouping, the report adds the
//! corpus reading collapsed onto clump ids and re-evaluates every
//! flag at that granularity. A flag whose collapsed degradation
//! satisfies the same factor rule is recorded as clump-resolved: its
//! entities are placed by clump, and within-clump order is not a
//! representable quantity, so the specification's triage rule treats
//! the group as restored rather than degraded. Clump-resolved flags
//! keep their record in the report but no longer fail the verdict;
//! without clump evidence every flag stays unresolved and fails, as
//! before.
//!
//! Metric floors default to unpinned: the specification carries no
//! verified map-fidelity numbers yet (engine-side measurements arrive
//! with the first full-scale fits), and an invented floor would gate
//! releases on fiction. A pinned floor is calibration evidence, and
//! belongs in configuration next to the measurement that produced it.

use alloc::collections::BTreeMap;

use smallvec::SmallVec;

use super::{
    clump::ClumpAggregate,
    metric::{NeighbourhoodAggregate, TripletAggregate},
    probe::{ProbeReadings, ReadingGrid},
};
use crate::dataset::OntologyRowId;

// The degradation factor is normative (specification 6.7: no important
// subgroup may suffer more than twice the overall degradation). The
// anchor floor bounds single-anchor leverage on a subgroup reading to
// one eighth; it is a sampling-noise floor, not a statement about
// which subgroups matter.
const DEFAULT_DEGRADATION_FACTOR: f64 = 2.0;
const DEFAULT_MINIMUM_SUBGROUP_ANCHORS: usize = 8;

/// Pinned gates for one assessment.
///
/// Floors and ceilings apply to the corpus map-versus-representation
/// grid at every neighbourhood size; [`None`] leaves a gate unpinned
/// and the corresponding reading report-only.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct QualityThresholds {
    /// Minimum recall, in `[0, 1]`. Defaults to unpinned.
    pub minimum_recall: Option<f64> = None,
    /// Minimum trustworthiness, in `[0, 1]`. Defaults to unpinned.
    pub minimum_trustworthiness: Option<f64> = None,
    /// Minimum continuity, in `[0, 1]`. Defaults to unpinned.
    pub minimum_continuity: Option<f64> = None,
    /// Maximum intrusion rate, in `[0, 1]`. Defaults to unpinned.
    pub maximum_intrusion_rate: Option<f64> = None,
    /// Maximum density-distortion spread. Defaults to unpinned. A
    /// pinned ceiling fails when the reading is absent - a gate on
    /// evidence that was never produced is a configuration
    /// contradiction, surfaced at the verdict.
    pub maximum_density_spread: Option<f64> = None,
    /// Minimum map-versus-representation triplet agreement, in
    /// `[0, 1]`. Defaults to unpinned; pinned, it fails when the
    /// triplet readings are disabled.
    pub minimum_triplet_agreement: Option<f64> = None,
    /// A subgroup flags when its degradation exceeds this factor times
    /// the overall degradation. Defaults to 2, the specification's
    /// subgroup rule.
    pub subgroup_degradation_factor: f64 = DEFAULT_DEGRADATION_FACTOR,
    /// Subgroups with fewer anchors never flag. Defaults to 8.
    pub minimum_subgroup_anchors: usize = DEFAULT_MINIMUM_SUBGROUP_ANCHORS,
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
/// The reading is the spread of `ln(map radius / representation
/// radius)` over the anchors: zero when the map rescales every
/// neighbourhood alike, growing as regions compress or dilate
/// unevenly. The median log ratio is the global scale offset - it
/// carries the two metrics' unit difference and is comparable only
/// across probes of the same spaces.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct DensityRow {
    /// The neighbourhood size the radii were read at.
    pub neighbourhood: usize,
    /// Anchors contributing a finite log ratio.
    pub anchors: usize,
    /// Anchors excluded for a zero radius: at least `neighbourhood`
    /// rows coincide with the anchor in one of the spaces.
    pub degenerate: usize,
    /// The median log radius ratio, absent without contributing
    /// anchors.
    pub median_log_ratio: Option<f64>,
    /// The median absolute deviation around the median, unscaled;
    /// absent without contributing anchors.
    pub spread: Option<f64>,
}

/// One space pair's triplet-agreement reading.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct TripletRow {
    /// Observed triplets across all anchors.
    pub triplets: u64,
    /// Triplets whose distance order both spaces share.
    pub preserved: u64,
    /// The preserved fraction, in `[0, 1]`; 1 when nothing was
    /// observed.
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
            agreement: merged.agreement(),
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
    /// Mean matched fraction of the collapsed neighbourhoods, in
    /// `[0, 1]`; never below the plain recall at the same size.
    pub recall: f64,
}

/// The clump-granularity evidence block.
///
/// The grouping's shape - counts at the threshold it was built at -
/// travels with the collapsed readings, so the block justifies its
/// own granularity: a threshold grouping half the corpus reads very
/// differently from one grouping a few percent.
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
    /// Collapsed corpus map-versus-representation readings, one row
    /// per neighbourhood size in reporting order.
    pub rows: Vec<ClumpRow>,
}

/// One subgroup's readings on the primary grid.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SubgroupReport {
    /// The subgroup's type, as its ontology row.
    pub ontology_row: u64,
    /// Anchors carrying the type.
    pub anchors: usize,
    /// Corpus map-versus-representation readings, one row per
    /// neighbourhood size in reporting order.
    pub rows: Vec<MetricRow>,
}

/// One breach of the subgroup degradation rule.
///
/// A flag carries its own triage evidence: when clump readings exist,
/// the breach is re-evaluated at clump granularity, and a breach the
/// collapse restores is marked resolved - the subgroup's entities are
/// placed by clump, and within-clump order is not a representable
/// quantity.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SubgroupFlag {
    /// The flagged subgroup's type, as its ontology row.
    pub ontology_row: u64,
    /// The neighbourhood size the breach was read at.
    pub neighbourhood: usize,
    /// Anchors carrying the type.
    pub anchors: usize,
    /// The subgroup's degradation: one minus its recall.
    pub degradation: f64,
    /// The overall degradation the factor multiplied.
    pub overall_degradation: f64,
    /// The subgroup's degradation at clump granularity, when clump
    /// readings exist.
    pub clump_degradation: Option<f64>,
    /// The overall clump-granularity degradation the re-evaluation
    /// compared against.
    pub clump_overall_degradation: Option<f64>,
    /// Whether the clump-granularity re-evaluation satisfies the
    /// degradation rule; always false without clump readings.
    pub clump_resolved: bool,
}

/// One probe's rendered evidence and verdict inputs.
///
/// The report carries the probe sizes and the applied thresholds, so
/// a serialized report justifies its own verdict without the
/// configuration that produced it.
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct QualityReport {
    /// Sampled anchor count.
    pub anchors: usize,
    /// The corpus grid's universe: every non-anchor row.
    pub corpus_universe: usize,
    /// The sampled grids' universe: the comparison row count.
    pub comparisons: usize,
    /// Corpus map-versus-representation readings, per neighbourhood
    /// size: the primary, gated surface.
    pub map_representation: Vec<MetricRow>,
    /// The corpus reading collapsed onto clump ids and the grouping's
    /// shape, when the probe carried a clump grouping.
    pub clumps: Option<ClumpReport>,
    /// Sampled map-versus-representation readings.
    pub sampled_map_representation: Vec<MetricRow>,
    /// Sampled map-versus-canonical readings.
    pub sampled_map_canonical: Vec<MetricRow>,
    /// Sampled representation-versus-canonical readings: the
    /// representation baseline.
    pub sampled_representation_canonical: Vec<MetricRow>,
    /// Density-distortion readings, per neighbourhood size.
    pub density: Vec<DensityRow>,
    /// Map-versus-representation triplet agreement: the gated pair.
    pub triplet_map_representation: TripletRow,
    /// Map-versus-canonical triplet agreement.
    pub triplet_map_canonical: TripletRow,
    /// Representation-versus-canonical triplet agreement.
    pub triplet_representation_canonical: TripletRow,
    /// Per-subgroup primary readings, ascending by ontology row.
    pub subgroups: Vec<SubgroupReport>,
    /// Degradation-rule breaches, in subgroup then neighbourhood
    /// order.
    pub flags: Vec<SubgroupFlag>,
    /// The applied recall floor, when pinned.
    pub minimum_recall: Option<f64>,
    /// The applied trustworthiness floor, when pinned.
    pub minimum_trustworthiness: Option<f64>,
    /// The applied continuity floor, when pinned.
    pub minimum_continuity: Option<f64>,
    /// The applied intrusion ceiling, when pinned.
    pub maximum_intrusion_rate: Option<f64>,
    /// The applied density-spread ceiling, when pinned.
    pub maximum_density_spread: Option<f64>,
    /// The applied triplet-agreement floor, when pinned.
    pub minimum_triplet_agreement: Option<f64>,
    /// The applied degradation factor.
    pub subgroup_degradation_factor: f64,
    /// The applied subgroup anchor floor.
    pub minimum_subgroup_anchors: usize,
}

impl QualityReport {
    /// Returns whether every pinned gate holds and no unresolved
    /// subgroup flag remains.
    ///
    /// A flagged subgroup fails the verdict unless its breach is
    /// clump-resolved - the specification's triage rule records such
    /// a group as placed by clump, not degraded. The
    /// approved-exception path for unresolved flags stays a human
    /// decision recorded outside the report.
    #[must_use]
    pub(crate) fn passes(&self) -> bool {
        let gates_hold = self.map_representation.iter().all(|row| {
            self.minimum_recall.is_none_or(|floor| row.recall >= floor)
                && self
                    .minimum_trustworthiness
                    .is_none_or(|floor| row.trustworthiness >= floor)
                && self
                    .minimum_continuity
                    .is_none_or(|floor| row.continuity >= floor)
                && self
                    .maximum_intrusion_rate
                    .is_none_or(|ceiling| row.intrusion_rate <= ceiling)
        });
        // Pinned gates on absent readings fail: a gate demands the
        // evidence it was pinned on.
        let density_holds = self.maximum_density_spread.is_none_or(|ceiling| {
            !self.density.is_empty()
                && self
                    .density
                    .iter()
                    .all(|row| row.spread.is_some_and(|spread| spread <= ceiling))
        });
        let triplets_hold = self.minimum_triplet_agreement.is_none_or(|floor| {
            self.triplet_map_representation.triplets > 0
                && self.triplet_map_representation.agreement >= floor
        });

        gates_hold
            && density_holds
            && triplets_hold
            && self.flags.iter().all(|flag| flag.clump_resolved)
    }
}

/// Renders one probe's readings into a report under the thresholds.
///
/// `anchor_types` lists each anchor's direct types, parallel to the
/// readings' anchors; an empty list leaves an anchor in the overall
/// readings only. Subgroup readings merge the per-anchor cells, so the
/// report costs no ranking work.
///
/// # Panics
///
/// Panics when `anchor_types` and the readings disagree about the
/// anchor count; both describe one probe, so a mismatch is a wiring
/// defect.
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
            .map(|rung| clumps.grid.overall(rung))
            .collect()
    });

    // Membership by ontology row; the map iterates ascending, so
    // subgroups and flags order deterministically.
    let mut members: BTreeMap<u64, Vec<usize>> = BTreeMap::new();
    for (anchor, types) in anchor_types.iter().enumerate() {
        for ontology in types {
            members.entry(ontology.get()).or_default().push(anchor);
        }
    }

    let mut subgroups = Vec::with_capacity(members.len());
    let mut flags = Vec::new();
    for (&ontology_row, anchors) in &members {
        let rows: Vec<MetricRow> = rungs
            .iter()
            .enumerate()
            .map(|(rung, &neighbourhood)| {
                let (&first, rest) = anchors
                    .split_first()
                    .expect("every membership list holds the anchor that created it");
                let mut merged = readings.map_representation.anchor(first, rung).clone();
                for &anchor in rest {
                    merged.merge(readings.map_representation.anchor(anchor, rung));
                }
                MetricRow::read(neighbourhood, &merged)
            })
            .collect();

        if anchors.len() >= thresholds.minimum_subgroup_anchors {
            for (rung, (subgroup_row, overall_row)) in
                rows.iter().zip(&map_representation).enumerate()
            {
                let degradation = 1.0 - subgroup_row.recall;
                let overall_degradation = 1.0 - overall_row.recall;
                if degradation <= thresholds.subgroup_degradation_factor * overall_degradation {
                    continue;
                }

                // The triage re-evaluation: the same rule at clump
                // granularity, subgroup against overall.
                let collapsed = readings.clumps.as_ref().map(|clumps| {
                    let (&first, rest) = anchors
                        .split_first()
                        .expect("every membership list holds the anchor that created it");
                    let mut merged = *clumps.grid.anchor(first, rung);
                    for &anchor in rest {
                        merged.merge(clumps.grid.anchor(anchor, rung));
                    }
                    let overall = &clump_overall
                        .as_ref()
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

    QualityReport {
        anchors: readings.anchors.len(),
        corpus_universe: readings.map_representation.overall(0).universe(),
        comparisons: readings.comparisons.len(),
        map_representation,
        clumps: readings.clumps.as_ref().map(|clumps| ClumpReport {
            epsilon: clumps.epsilon,
            count: clumps.count,
            groups: clumps.groups,
            grouped_rows: clumps.grouped_rows,
            rows: clump_overall
                .as_ref()
                .expect("clump readings produce overall clump aggregates")
                .iter()
                .zip(&rungs)
                .map(|(aggregate, &neighbourhood)| ClumpRow {
                    neighbourhood,
                    queries: aggregate.queries(),
                    recall: aggregate.recall(),
                })
                .collect(),
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
        flags,
        minimum_recall: thresholds.minimum_recall,
        minimum_trustworthiness: thresholds.minimum_trustworthiness,
        minimum_continuity: thresholds.minimum_continuity,
        maximum_intrusion_rate: thresholds.maximum_intrusion_rate,
        maximum_density_spread: thresholds.maximum_density_spread,
        minimum_triplet_agreement: thresholds.minimum_triplet_agreement,
        subgroup_degradation_factor: thresholds.subgroup_degradation_factor,
        minimum_subgroup_anchors: thresholds.minimum_subgroup_anchors,
    }
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

// Median and MAD stay private here until a second consumer graduates
// them into the planned top-level `statistics` module (the tier-B
// rule: on the second consumer, never speculatively).
/// Returns the median, averaging the middle pair over even lengths;
/// [`None`] on empty input. Sorts `values` in place.
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
