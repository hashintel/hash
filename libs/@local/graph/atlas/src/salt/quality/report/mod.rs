//! Rendered probe evidence and the release verdict it supports.
//!
//! [`assess`] turns one probe's readings into a flat, serializable record: every grid's whole-probe
//! metrics per neighbourhood size, per-subgroup readings on the primary grid, the subgroup flags
//! the degradation rule raises, and the thresholds the run applied. The report is a rendering of
//! [`ProbeReadings`] - regrouping or re-assessment starts from the readings, never from the report.
//!
//! The primary fidelity surface is the corpus-exact map-versus-representation grid. The pass ranks
//! each sampled anchor against the full corpus, so the comparison universe carries no subsampling,
//! while the anchors themselves come from a sample, so aggregate means retain anchor-sampling
//! uncertainty. The thresholds bind there, against the observed probe statistic rather than a
//! population guarantee or lower confidence bound. The sampled grids provide context - the
//! canonical triangle that supplies the representation baseline for the map's canonical reading -
//! and stay report-only.
//!
//! Subgroups are entity types: an anchor contributes to one subgroup per direct type, so
//! multi-typed anchors count in each of their groups. A subgroup flags at a neighbourhood size when
//! its degradation - one minus recall - exceeds the configured factor times the whole-probe
//! degradation - twice, by the normative default. The rule raises a flag per neighbourhood size, so
//! the size trend - recall rising with the neighbourhood suggests near-tie reshuffling rather than
//! placement loss, evidence rather than a classifier - shows up in the flags and in every
//! subgroup's rows. Subgroups below the configured anchor floor never flag - a handful of anchors
//! cannot support a degradation ratio - but the report still carries their rows.
//!
//! Density distortion reads the spread of log neighbourhood-radius ratios over the anchors, a
//! unit-free reading of uneven compression; the triplet rows read distance-order preservation over
//! the probe's shared pair sample for all three space pairs. The report renders both from the
//! readings like every other row.
//!
//! When the probe carries a clump grouping, the report adds the corpus reading collapsed onto clump
//! ids and re-evaluates every flag on those ids. A flag whose collapsed degradation satisfies the
//! same factor rule comes out clump-resolved, meaning the breach vanishes once recall counts by
//! component label. That is a triage diagnostic and nothing stronger, since chaining lets ε
//! single-linkage components reach arbitrary diameter, so resolution certifies neither component
//! compactness nor within-component placement. Subgroup flags and their resolution are report-only
//! either way, and they steer the human reading the report without affecting admission.
//!
//! The thresholds default to maximally permissive values - floors at zero, ceilings at their domain
//! edge - and the default verdict therefore turns on evidence presence rather than fidelity. An
//! invented floor would rest release verdicts on fiction. Deployments impose measured bounds
//! through the run's validated thresholds document.
//!
//! The suite's instruments over published artifacts live beside the rendering they read:
//! [`calibration`] sweeps the clump threshold over a published k-NN table for the evidence behind
//! the grouping's default, and [`live`] runs one whole assessment of a root's active generation
//! against the store at the snapshot the generation records.

use alloc::collections::BTreeMap;

use hashql_core::id::{Id as _, IdSlice, IdVec};

pub(crate) use self::{
    document::{
        BaselineRow, BaselineSubgroupReport, ClumpReport, ClumpRow, DensityRow, MetricRow,
        QualityReport, SubgroupFlag, SubgroupReport, TripletRow,
    },
    thresholds::{QualityThresholds, ThresholdDomainError, ThresholdOverrides},
};
use super::{
    clump::ClumpAggregate,
    probe::{AnchorOrdinal, ProbeReadings, ReadingGrid, Step, TypedReadings},
};
use crate::identity::OntologyRowId;

pub(crate) mod calibration;
mod document;
pub(crate) mod live;
mod thresholds;

/// Renders one probe's typed readings into a report under the thresholds.
///
/// Subgroup readings merge the per-anchor cells, so the report costs no ranking work.
#[must_use]
pub(crate) fn assess<N>(
    readings: TypedReadings<'_, N>,
    thresholds: &QualityThresholds,
) -> QualityReport {
    let anchor_types = readings.anchor_types();
    let readings = readings.readings();

    let neighbourhoods = &*readings.neighbourhoods;
    let overall_rows = |grid: &ReadingGrid| -> Vec<MetricRow> {
        neighbourhoods
            .iter_enumerated()
            .map(|(step, &neighbourhood)| MetricRow::read(neighbourhood, &grid.overall(step)))
            .collect()
    };

    let map_representation = overall_rows(&readings.map_representation);
    let clump_overall: Option<IdVec<Step, ClumpAggregate>> =
        readings.clumps.as_ref().map(|clumps| {
            neighbourhoods
                .ids()
                .map(|step| clumps.map_representation.overall(step))
                .collect()
        });

    // Membership by ontology row; the map iterates ascending, so
    // subgroups and flags order deterministically.
    let mut members: BTreeMap<OntologyRowId, Vec<AnchorOrdinal>> = BTreeMap::new();
    for (anchor, types) in anchor_types.iter().enumerate() {
        for &ontology in types {
            members
                .entry(ontology)
                .or_default()
                .push(AnchorOrdinal::from_usize(anchor));
        }
    }

    let (subgroups, flags) = subgroup_reports(
        readings,
        &map_representation,
        clump_overall.as_deref(),
        &members,
        thresholds,
    );
    let baseline_subgroups = baseline_subgroup_reports(readings, &members);

    QualityReport {
        anchors: readings.anchors.len(),
        corpus_universe: readings
            .map_representation
            .overall(Step::from_usize(0))
            .universe(),
        comparisons: readings.comparisons.len(),
        map_representation,
        clumps: readings.clumps.as_ref().map(|clumps| {
            let rendered = |grid: &ReadingGrid<ClumpAggregate>| -> Vec<ClumpRow> {
                neighbourhoods
                    .iter_enumerated()
                    .map(|(step, &neighbourhood)| {
                        let aggregate = grid.overall(step);
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
        density: density_rows(readings),
        triplet_map_representation: TripletRow::read(&readings.triplet_map_representation),
        triplet_map_canonical: TripletRow::read(&readings.triplet_map_canonical),
        triplet_representation_canonical: TripletRow::read(
            &readings.triplet_representation_canonical,
        ),
        subgroups,
        baseline_subgroups,
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

/// Merges subgroup memberships into per-type rows and degradation flags.
///
/// When clump readings exist, the same factor rule over the collapsed recalls re-evaluates every
/// breach on clump ids and decides the flag's resolution.
fn subgroup_reports<N>(
    readings: &ProbeReadings<N>,
    overall: &[MetricRow],
    clump_overall: Option<&IdSlice<Step, ClumpAggregate>>,
    members: &BTreeMap<OntologyRowId, Vec<AnchorOrdinal>>,
    thresholds: &QualityThresholds,
) -> (Vec<SubgroupReport>, Vec<SubgroupFlag>) {
    let mut subgroups = Vec::with_capacity(members.len());
    let mut flags = Vec::new();
    for (&ontology_row, anchors) in members {
        let rows: Vec<MetricRow> = readings
            .neighbourhoods
            .ids()
            .zip(overall)
            .map(|(step, overall_row)| {
                let merged = readings.map_representation.merged(anchors, step);
                MetricRow::read(overall_row.neighbourhood, &merged)
            })
            .collect();

        if anchors.len() >= thresholds.minimum_subgroup_anchors {
            let read_steps = readings.neighbourhoods.ids();
            for (step, (subgroup_row, overall_row)) in read_steps.zip(rows.iter().zip(overall)) {
                let degradation = subgroup_row.recall.complement();
                let overall_degradation = overall_row.recall.complement();

                if degradation <= thresholds.subgroup_degradation_factor * overall_degradation {
                    continue;
                }

                // The triage re-evaluation applies the same rule on clump
                // ids, subgroup against the whole probe.
                let collapsed = readings.clumps.as_ref().map(|clumps| {
                    let merged = clumps.map_representation.merged(anchors, step);
                    let overall = &clump_overall
                        .expect("clump readings produce overall clump aggregates")[step];
                    (merged.recall().complement(), overall.recall().complement())
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
fn baseline_subgroup_reports<N>(
    readings: &ProbeReadings<N>,
    members: &BTreeMap<OntologyRowId, Vec<AnchorOrdinal>>,
) -> Vec<BaselineSubgroupReport> {
    members
        .iter()
        .map(|(&ontology_row, anchors)| {
            let rows = readings
                .neighbourhoods
                .iter_enumerated()
                .map(|(step, &neighbourhood)| {
                    let merged = readings
                        .sampled_representation_canonical
                        .merged(anchors, step);

                    let collapsed = readings.clumps.as_ref().map(|clumps| {
                        let merged = clumps.representation_canonical.merged(anchors, step);
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
fn density_rows<N>(readings: &ProbeReadings<N>) -> Vec<DensityRow> {
    let steps = readings.neighbourhoods.len();
    readings
        .neighbourhoods
        .iter_enumerated()
        .map(|(step, &neighbourhood)| {
            let mut ratios: Vec<f64> = readings
                .radii
                .iter()
                .skip(step.as_usize())
                .step_by(steps.max(1))
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

// Statistics vocabulary promotes to a shared module on its second
// consumer. Median and MAD have one consumer.
/// Returns the median, averaging the middle pair over even lengths.
///
/// Empty input yields [`None`]. Sorts `values` in place.
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
