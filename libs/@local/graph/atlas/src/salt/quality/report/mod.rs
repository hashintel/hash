//! Rendered probe evidence and the release verdict it supports.
//!
//! [`assess`] renders [`ProbeReadings`] as whole-probe metrics, per-type neighbourhood rows,
//! subgroup flags and the applied thresholds. Retain the per-anchor readings for regrouping into
//! different subgroups. The report contains aggregates, not individual anchor cells.
//!
//! Neighbourhood thresholds apply to the corpus map-versus-representation grid. Its comparison
//! universe contains every non-anchor row, but the aggregate retains anchor-sampling uncertainty.
//! Thresholds check observed statistics rather than population guarantees or confidence bounds.
//! Sampled neighbourhood grids provide map-versus-canonical context alongside the representation
//! baseline and remain report-only.
//!
//! Subgroups are entity types. An anchor contributes once per direct-type list entry, including
//! repeated entries. With unique type lists, multi-typed anchors count once in each group. At each
//! neighbourhood size, a sufficiently sampled subgroup flags when dₛ > f · d, where dₛ and d are
//! one minus subgroup and whole-probe recall, and f is a finite configured factor (2 by default).
//! The subtraction and comparison use f64 readings. A NaN factor instead flags every sufficiently
//! sampled subgroup because the implementation tests the negation of dₛ ≤ f · d. Subgroups below
//! the anchor floor (8 by default) never flag, but keep their rows. This limits individual-anchor
//! leverage without establishing statistical significance. Recall increasing with neighbourhood
//! size can suggest boundary reshuffling, but does not classify its cause.
//!
//! Density distortion is the unscaled median absolute deviation of log neighbourhood-radius ratios
//! across anchors. With positive finite map radius rₘ and representation radius rᵣ, each log ratio
//! is ln(rₘ) − ln(rᵣ). Uniform radius rescaling adds a constant to all ratios and leaves the spread
//! unchanged in exact arithmetic. Triplet rows measure distance-order preservation over the shared
//! pair sample for every space pair. Admission checks map-versus-representation triplet agreement
//! and density spread alongside the neighbourhood metrics.
//!
//! When the probe carries [`Clumps`](super::clump::Clumps), the report adds collapsed corpus and
//! representation-baseline recall. Each plain subgroup flag is clump-resolved when its collapsed
//! degradations satisfy dₛ ≤ f · d. This marks agreement after collapsing rows onto their
//! components. Single-linkage components can have diameter much greater than ε, and resolution
//! certifies neither compactness nor within-component placement. Subgroup flags and clump
//! resolution never affect admission.
//!
//! Default thresholds accept all in-domain fidelity values while requiring readings for
//! population-supported metrics. Insufficient populations permit admission without claiming that
//! unavailable metrics passed. Configure measured bounds through [`ThresholdOverrides`] for a
//! stricter assessment. [`QualityReport::controls`] defines the evidence-presence checks, which do
//! not validate report provenance or cross-field consistency.
//!
//! For measurements over published artifacts:
//! [`calibration`] sweeps the clump threshold over a published k-NN table. [`live`] assesses the
//! generation selected by a root's current pointer, querying the store with its recorded temporal
//! axes.

use alloc::collections::BTreeMap;

use hashql_core::id::{Id as _, IdSlice, IdVec};

use super::{
    clump::ClumpAggregate,
    probe::{AnchorOrdinal, ProbeReadings, ReadingGrid, Step, TypedReadings},
};
use crate::{identity::OntologyRowId, math::DFinite};

pub(crate) mod calibration;
mod document;
pub(crate) mod live;
mod thresholds;

pub(crate) use self::{
    document::{
        BaselineRow, BaselineSubgroupReport, ClumpReport, ClumpRow, DensityRow, MetricRow,
        QualityReport, SubgroupFlag, SubgroupReport, TripletRow,
    },
    thresholds::{QualityThresholds, ThresholdDomainError, ThresholdOverrides},
};

/// Renders one probe's typed readings into a report under the thresholds.
///
/// Subgroup readings merge per-anchor cells without ranking work. `readings` must preserve
/// [`ProbeReadings`]' axis, shape and arithmetic-capacity requirements. Type-list entries become
/// subgroup memberships without deduplication.
///
/// # Panics
///
/// Panics on out-of-domain grid indices or
/// incompatible aggregate shapes. Inconsistent radius counts can also panic with integer overflow
/// checks enabled.
#[must_use]
pub(crate) fn assess<N>(
    readings: TypedReadings<'_, N>,
    thresholds: &QualityThresholds,
) -> QualityReport {
    let anchor_types = readings.anchor_types();
    let readings = readings.readings();

    let neighbourhoods = &*readings.neighbourhoods;
    let overall_rows = |grid: Option<&ReadingGrid>| -> Vec<MetricRow> {
        let Some(grid) = grid else {
            return vec![];
        };

        neighbourhoods
            .iter_enumerated()
            .map(|(step, &neighbourhood)| MetricRow::read(neighbourhood, &grid.overall(step)))
            .collect()
    };

    let map_representation = overall_rows(readings.map_representation.as_ref());
    let clump_overall: Option<IdVec<Step, ClumpAggregate>> =
        readings.clumps.as_ref().map(|clumps| {
            neighbourhoods
                .ids()
                .filter_map(|step| {
                    clumps
                        .map_representation
                        .as_ref()
                        .map(|grid| grid.overall(step))
                })
                .collect()
        });

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
        corpus_universe: readings.corpus_universe,
        triplet_pairs_requested: readings.triplet_pairs_requested,
        comparisons: readings.comparisons.len(),
        map_representation,
        clumps: readings.clumps.as_ref().map(|clumps| {
            let rendered = |grid: Option<&ReadingGrid<ClumpAggregate>>| -> Vec<ClumpRow> {
                let Some(grid) = grid else {
                    return vec![];
                };

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
                map_representation: rendered(clumps.map_representation.as_ref()),
                representation_canonical: rendered(clumps.representation_canonical.as_ref()),
            }
        }),
        sampled_map_representation: overall_rows(readings.sampled_map_representation.as_ref()),
        sampled_map_canonical: overall_rows(readings.sampled_map_canonical.as_ref()),
        sampled_representation_canonical: overall_rows(
            readings.sampled_representation_canonical.as_ref(),
        ),
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
/// When clump readings exist, the same factor rule over collapsed recalls decides each flag's
/// resolution. `overall` and `clump_overall` must align with the neighbourhood axis.
///
/// # Panics
///
/// Panics for empty membership lists, invalid grid indices or incompatible aggregate shapes. Clump
/// readings require corresponding whole-probe clump aggregates.
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
            .filter_map(|(step, overall_row)| {
                let merged = readings.map_representation.as_ref()?.merged(anchors, step);
                Some(MetricRow::read(overall_row.neighbourhood, &merged))
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

                // compare collapsed subgroup degradation with collapsed whole-probe degradation
                let collapsed = readings.clumps.as_ref().and_then(|clumps| {
                    let merged = clumps.map_representation.as_ref()?.merged(anchors, step);

                    let overall = &clump_overall
                        .expect("clump readings produce overall clump aggregates")[step];
                    Some((merged.recall().complement(), overall.recall().complement()))
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
/// Each row compares plain sampled representation-versus-canonical recall with its collapsed
/// counterpart, when available.
///
/// # Panics
///
/// Panics for an empty membership list, an invalid grid index or incompatible aggregate shapes.
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
                .filter_map(|(step, &neighbourhood)| {
                    let merged = readings
                        .sampled_representation_canonical
                        .as_ref()?
                        .merged(anchors, step);

                    let collapsed = readings.clumps.as_ref().and_then(|clumps| {
                        let merged = clumps
                            .representation_canonical
                            .as_ref()?
                            .merged(anchors, step);

                        Some(merged.recall())
                    });

                    Some(BaselineRow {
                        neighbourhood,
                        queries: merged.queries(),
                        recall: merged.recall(),
                        clump_recall: collapsed,
                    })
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

/// Computes each neighbourhood size's median log ratio and unscaled MAD.
///
/// Positive radii contribute, and zero radii count as degenerate. Any non-finite radius invalidates
/// the step's median and spread, including a pair whose other radius is zero.
///
/// # Panics
///
/// Panics with integer overflow checks enabled when a step has more contributing radius pairs than
/// anchors.
fn density_rows<N>(readings: &ProbeReadings<N>) -> Vec<DensityRow> {
    let steps = readings.density_neighbourhoods.len();
    readings
        .density_neighbourhoods
        .iter()
        .enumerate()
        .map(|(step, &neighbourhood)| {
            let radii = readings.radii.iter().skip(step).step_by(steps.max(1));

            let mut ratios: Vec<_> = radii
                .filter_map(|radii| {
                    let map = radii.map.positive();
                    let representation = radii.representation.positive();

                    Option::zip(map, representation)
                })
                .map(|(map, presentation)| map.ln_wide() - presentation.ln_wide())
                .collect();

            let anchors = ratios.len();
            let degenerate = readings.anchors.len() - anchors;

            // a finite median can conceal non-finite inputs in a minority of anchors.
            let median_log_ratio = median(&mut ratios);
            let spread = median_log_ratio.and_then(|median_value| {
                for ratio in &mut ratios {
                    *ratio = (*ratio - median_value).abs().into();
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

/// Returns the median, averaging the middle pair over even lengths.
///
/// Empty input yields [`None`]. Sorts `values` in place.
#[expect(
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    reason = "the middle index is the floor of half the length by definition"
)]
fn median(values: &mut [DFinite]) -> Option<DFinite> {
    if values.is_empty() {
        return None;
    }

    values.sort_unstable();

    let middle = values.len() / 2;
    if values.len() % 2 == 1 {
        return Some(values[middle]);
    }

    Some(values[middle - 1].midpoint(values[middle]))
}

#[cfg(test)]
pub(crate) mod tests {
    pub(crate) use super::document::MetricEval;
}
