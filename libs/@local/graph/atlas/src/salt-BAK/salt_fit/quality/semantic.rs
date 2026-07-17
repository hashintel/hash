//! Exact sampled map-neighbor and subgroup quality reports.

use alloc::collections::BTreeMap;
use core::cmp::Ordering;

use rayon::prelude::*;
use serde::Serialize;

use super::{FitQualityError, bounded_ratio, try_vec};
use crate::salt::{
    ContentHash, ContentHasher,
    salt_fit_boundary::{
        ConditionQuality, ConditionQualityEvaluationError, ConditionQualityEvaluator,
        PROJECTOR_DIMENSIONS, PersistedCondition, PersistedConditionQuality, ProjectedCondition,
    },
};

const NEIGHBOR_COUNTS: [usize; 3] = [15, 30, 50];
const MAXIMUM_NEIGHBORS: usize = 50;
const MAXIMUM_PROBES: usize = 256;
const MINIMUM_PROBES: usize = 32;
const MINIMUM_SUBGROUP_PROBES: usize = 8;
const TEACHER_COMPONENT_BUDGET: usize = 12_000_000_000;

/// Corpus-bound evaluator for exact sampled map-neighbor metrics.
#[derive(Debug)]
pub(in crate::salt_fit) struct LocalConditionQualityEvaluator {
    probes: Box<[SemanticProbe]>,
    row_count: usize,
    canonical_corpus_hash: ContentHash,
    contract_hash: ContentHash,
}

#[derive(Debug)]
struct SemanticProbe {
    anchor: usize,
    subgroup: ContentHash,
    rank_3072: Box<[u32]>,
    nearest_512: [usize; MAXIMUM_NEIGHBORS],
    nearest_3072: [usize; MAXIMUM_NEIGHBORS],
    radii_3072: [f64; 3],
}

impl LocalConditionQualityEvaluator {
    pub(in crate::salt_fit) fn new(
        canonical: &[f32],
        subgroups: &[ContentHash],
    ) -> Result<Self, FitQualityError> {
        if !canonical
            .len()
            .is_multiple_of(crate::salt::CANONICAL_DIMENSIONS)
        {
            return Err(FitQualityError::Representation(
                "canonical matrix has a partial row".to_owned(),
            ));
        }
        let row_count = canonical.len() / crate::salt::CANONICAL_DIMENSIONS;
        if row_count <= MAXIMUM_NEIGHBORS {
            return Err(FitQualityError::CorpusTooSmall {
                rows: row_count,
                minimum: MAXIMUM_NEIGHBORS + 1,
            });
        }
        if subgroups.len() != row_count {
            return Err(FitQualityError::Representation(
                "quality subgroup rows do not match the canonical corpus".to_owned(),
            ));
        }
        let canonical_corpus_hash =
            crate::salt::salt_fit_boundary::canonical_corpus_hash(canonical);
        let anchors = select_anchors(canonical_corpus_hash, subgroups, row_count)?;
        let norms = teacher_norms(canonical)?;
        let probes = anchors
            .par_iter()
            .map(|&anchor| teacher_probe(canonical, &norms, anchor, subgroups[anchor], row_count))
            .collect::<Result<Vec<_>, _>>()?;
        let mut contract =
            ContentHasher::new(b"hash.graph.atlas.fit.map-neighbor-quality-contract.v1");
        for value in [
            MAXIMUM_PROBES,
            MINIMUM_PROBES,
            MINIMUM_SUBGROUP_PROBES,
            TEACHER_COMPONENT_BUDGET,
        ] {
            contract.update(
                &u64::try_from(value)
                    .expect("quality constant should fit u64")
                    .to_le_bytes(),
            );
        }
        for count in NEIGHBOR_COUNTS {
            contract.update(
                &u64::try_from(count)
                    .expect("neighbor count should fit u64")
                    .to_le_bytes(),
            );
        }
        contract.update(canonical_corpus_hash.as_bytes());
        for subgroup in subgroups {
            contract.update(subgroup.as_bytes());
        }
        Ok(Self {
            probes: probes.into_boxed_slice(),
            row_count,
            canonical_corpus_hash,
            contract_hash: contract.finish(),
        })
    }

    fn measure(
        &self,
        coordinates: &[[f64; 2]],
        field_hash: ContentHash,
        condition: f32,
    ) -> Result<MeasuredCondition, ConditionQualityEvaluationError> {
        if coordinates.len() != self.row_count
            || coordinates
                .iter()
                .flatten()
                .any(|component| !component.is_finite())
        {
            return Err(ConditionQualityEvaluationError::new(
                "projected coordinates have the wrong row count or a non-finite component",
            ));
        }
        let evaluations = self
            .probes
            .par_iter()
            .map(|probe| evaluate_probe(probe, coordinates, self.row_count))
            .collect::<Vec<_>>();
        let metrics = aggregate(&evaluations, self.row_count);
        let fidelity = metrics
            .map_to_512_recall
            .into_iter()
            .chain(metrics.map_to_3072_recall)
            .fold(1.0_f64, f64::min);
        let (subgroups, maximum_subgroup_degradation) =
            subgroup_measurements(&self.probes, &evaluations, fidelity)?;
        let semantic_report = semantic_report(
            self.suite_version(),
            self.contract_hash,
            self.canonical_corpus_hash,
            field_hash,
            condition,
            &metrics,
            &evaluations,
        )?;
        let subgroup_report = subgroup_report(
            self.suite_version(),
            self.contract_hash,
            field_hash,
            condition,
            fidelity,
            maximum_subgroup_degradation,
            &subgroups,
        )?;
        let quality = ConditionQuality::new(
            field_hash,
            ContentHash::digest(&semantic_report),
            ContentHash::digest(&subgroup_report),
            fidelity,
            maximum_subgroup_degradation,
        );
        Ok(MeasuredCondition {
            quality,
            semantic_report,
            subgroup_report,
        })
    }

    #[cfg(test)]
    pub(super) fn measure_for_test(
        &self,
        coordinates: &[[f64; 2]],
        field_hash: ContentHash,
        condition: f32,
    ) -> Result<ConditionQuality, ConditionQualityEvaluationError> {
        self.measure(coordinates, field_hash, condition)
            .map(|measured| measured.quality)
    }
}

impl ConditionQualityEvaluator for LocalConditionQualityEvaluator {
    fn suite_version(&self) -> &str {
        "m0-local-map-neighbor-audit-v1"
    }

    fn contract_hash(&self) -> ContentHash {
        self.contract_hash
    }

    fn evaluate(
        &self,
        fields: &[ProjectedCondition],
    ) -> Result<Vec<ConditionQuality>, ConditionQualityEvaluationError> {
        fields
            .iter()
            .map(|field| {
                self.measure(field.coordinates(), field.content_hash(), field.condition())
                    .map(|measured| measured.quality)
            })
            .collect()
    }

    fn evaluate_persisted(
        &self,
        field: PersistedCondition<'_>,
    ) -> Result<PersistedConditionQuality, ConditionQualityEvaluationError> {
        let measured =
            self.measure(field.coordinates(), field.content_hash(), field.condition())?;
        PersistedConditionQuality::new(
            measured.quality,
            measured.semantic_report,
            measured.subgroup_report,
        )
    }
}

struct MeasuredCondition {
    quality: ConditionQuality,
    semantic_report: Vec<u8>,
    subgroup_report: Vec<u8>,
}

#[derive(Debug)]
struct ProbeEvaluation {
    anchor: usize,
    matched_512: [u64; 3],
    matched_3072: [u64; 3],
    matched_baseline: [u64; 3],
    trustworthiness_penalty: [u64; 3],
    continuity_penalty: [u64; 3],
    map_radii: [f64; 3],
    teacher_radii: [f64; 3],
    triplet_matches: u64,
    triplet_count: u64,
}

fn select_anchors(
    corpus: ContentHash,
    subgroups: &[ContentHash],
    row_count: usize,
) -> Result<Vec<usize>, FitQualityError> {
    let adaptive = TEACHER_COMPONENT_BUDGET
        .checked_div(
            row_count
                .saturating_mul(crate::salt::CANONICAL_DIMENSIONS)
                .max(1),
        )
        .unwrap_or(0)
        .clamp(MINIMUM_PROBES, MAXIMUM_PROBES);
    let mut groups = BTreeMap::<ContentHash, Vec<usize>>::new();
    for (row, subgroup) in subgroups.iter().copied().enumerate() {
        groups.entry(subgroup).or_default().push(row);
    }
    let required = groups.len().saturating_mul(MINIMUM_SUBGROUP_PROBES);
    if required > MAXIMUM_PROBES {
        return Err(FitQualityError::Representation(
            "quality subgroup count exceeds the bounded probe envelope".to_owned(),
        ));
    }
    let target = row_count.min(adaptive.max(required));
    for (subgroup, rows) in &mut groups {
        rows.sort_unstable_by_key(|&row| anchor_priority(corpus, *subgroup, row));
    }
    let mut anchors = Vec::with_capacity(target);
    let mut offset = 0;
    while anchors.len() < target {
        let mut advanced = false;
        for rows in groups.values() {
            if let Some(&row) = rows.get(offset) {
                anchors.push(row);
                advanced = true;
                if anchors.len() == target {
                    break;
                }
            }
        }
        if !advanced {
            break;
        }
        offset += 1;
    }
    Ok(anchors)
}

fn anchor_priority(corpus: ContentHash, subgroup: ContentHash, row: usize) -> u64 {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.fit.semantic-probe-anchor.v1");
    hasher.update(corpus.as_bytes());
    hasher.update(subgroup.as_bytes());
    hasher.update(
        &u64::try_from(row)
            .expect("generation row should fit u64")
            .to_le_bytes(),
    );
    let priority = hasher.finish();
    u64::from_le_bytes(
        priority.as_bytes()[..8]
            .try_into()
            .expect("SHA-256 contains eight bytes"),
    )
}

fn teacher_norms(canonical: &[f32]) -> Result<Box<[[f64; 2]]>, FitQualityError> {
    let rows = canonical.len() / crate::salt::CANONICAL_DIMENSIONS;
    let mut norms = try_vec("semantic teacher norms", rows)?;
    for row in canonical.chunks_exact(crate::salt::CANONICAL_DIMENSIONS) {
        let prefix = row[..PROJECTOR_DIMENSIONS]
            .iter()
            .fold(0.0, |sum, &value| {
                f64::from(value).mul_add(f64::from(value), sum)
            })
            .sqrt();
        let full = row
            .iter()
            .fold(0.0, |sum, &value| {
                f64::from(value).mul_add(f64::from(value), sum)
            })
            .sqrt();
        if !prefix.is_finite() || !full.is_finite() || prefix <= 0.0 || full <= 0.0 {
            return Err(FitQualityError::Representation(
                "semantic teacher contains a zero or non-finite norm".to_owned(),
            ));
        }
        norms.push([prefix, full]);
    }
    Ok(norms.into_boxed_slice())
}

fn teacher_probe(
    canonical: &[f32],
    norms: &[[f64; 2]],
    anchor: usize,
    subgroup: ContentHash,
    row_count: usize,
) -> Result<SemanticProbe, FitQualityError> {
    let anchor_values = row(canonical, anchor);
    let mut prefix = try_vec("512-dimensional teacher ranking", row_count - 1)?;
    let mut full = try_vec("3072-dimensional teacher ranking", row_count - 1)?;
    for candidate in 0..row_count {
        if candidate == anchor {
            continue;
        }
        let candidate_values = row(canonical, candidate);
        let mut prefix_dot = 0.0;
        let mut full_dot = 0.0;
        for (index, (&left, &right)) in anchor_values.iter().zip(candidate_values).enumerate() {
            full_dot = f64::from(left).mul_add(f64::from(right), full_dot);
            if index < PROJECTOR_DIMENSIONS {
                prefix_dot = f64::from(left).mul_add(f64::from(right), prefix_dot);
            }
        }
        prefix.push(DistanceRow {
            distance: 1.0
                - (prefix_dot / (norms[anchor][0] * norms[candidate][0])).clamp(-1.0, 1.0),
            row: candidate,
        });
        full.push(DistanceRow {
            distance: 1.0 - (full_dot / (norms[anchor][1] * norms[candidate][1])).clamp(-1.0, 1.0),
            row: candidate,
        });
    }
    prefix.sort_unstable();
    full.sort_unstable();
    let rank_3072 = ranks(&full, row_count);
    let nearest_512 = core::array::from_fn(|index| prefix[index].row);
    let nearest_3072 = core::array::from_fn(|index| full[index].row);
    let radii_3072 = NEIGHBOR_COUNTS.map(|count| full[count - 1].distance);
    Ok(SemanticProbe {
        anchor,
        subgroup,
        rank_3072,
        nearest_512,
        nearest_3072,
        radii_3072,
    })
}

fn evaluate_probe(
    probe: &SemanticProbe,
    coordinates: &[[f64; 2]],
    row_count: usize,
) -> ProbeEvaluation {
    let mut map = Vec::with_capacity(row_count - 1);
    for candidate in 0..row_count {
        if candidate != probe.anchor {
            map.push(DistanceRow {
                distance: squared_distance(coordinates[probe.anchor], coordinates[candidate]),
                row: candidate,
            });
        }
    }
    map.sort_unstable();
    let map_ranks = ranks(&map, row_count);
    let map_top = core::array::from_fn::<_, MAXIMUM_NEIGHBORS, _>(|index| map[index].row);
    let mut evaluation = ProbeEvaluation {
        anchor: probe.anchor,
        matched_512: [0; 3],
        matched_3072: [0; 3],
        matched_baseline: [0; 3],
        trustworthiness_penalty: [0; 3],
        continuity_penalty: [0; 3],
        map_radii: NEIGHBOR_COUNTS.map(|count| map[count - 1].distance),
        teacher_radii: probe.radii_3072,
        triplet_matches: 0,
        triplet_count: 0,
    };
    for (index, &count) in NEIGHBOR_COUNTS.iter().enumerate() {
        evaluation.matched_512[index] = overlap(&map_top[..count], &probe.nearest_512[..count]);
        evaluation.matched_3072[index] = overlap(&map_top[..count], &probe.nearest_3072[..count]);
        evaluation.matched_baseline[index] =
            overlap(&probe.nearest_512[..count], &probe.nearest_3072[..count]);
        evaluation.trustworthiness_penalty[index] = map_top[..count]
            .iter()
            .map(|&candidate| u64::from(probe.rank_3072[candidate].saturating_sub(count as u32)))
            .sum();
        evaluation.continuity_penalty[index] = probe.nearest_3072[..count]
            .iter()
            .map(|&candidate| u64::from(map_ranks[candidate].saturating_sub(count as u32)))
            .sum();
    }
    for (&near, &far) in probe.nearest_3072[..15]
        .iter()
        .zip(&probe.nearest_3072[35..50])
    {
        evaluation.triplet_matches += u64::from(map_ranks[near] < map_ranks[far]);
        evaluation.triplet_count += 1;
    }
    evaluation
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AggregateMetrics {
    probe_count: usize,
    neighbor_counts: [usize; 3],
    map_to_512_recall: [f64; 3],
    map_to_3072_recall: [f64; 3],
    baseline_512_to_3072_recall: [f64; 3],
    trustworthiness: [f64; 3],
    continuity: [f64; 3],
    false_neighbor_intrusion_rate: [f64; 3],
    false_neighbor_extrusion_rate: [f64; 3],
    density_distortion: [f64; 3],
    sampled_triplet_agreement: f64,
}

fn aggregate(evaluations: &[ProbeEvaluation], row_count: usize) -> AggregateMetrics {
    let probes = evaluations.len();
    let matched_512 = sum_array(evaluations, |evaluation| evaluation.matched_512);
    let matched_3072 = sum_array(evaluations, |evaluation| evaluation.matched_3072);
    let matched_baseline = sum_array(evaluations, |evaluation| evaluation.matched_baseline);
    let trust_penalty = sum_array(evaluations, |evaluation| evaluation.trustworthiness_penalty);
    let continuity_penalty = sum_array(evaluations, |evaluation| evaluation.continuity_penalty);
    let recall = |matched: [u64; 3]| {
        core::array::from_fn(|index| bounded_ratio(matched[index], probes * NEIGHBOR_COUNTS[index]))
    };
    let map_to_512_recall = recall(matched_512);
    let map_to_3072_recall = recall(matched_3072);
    let baseline_512_to_3072_recall = recall(matched_baseline);
    let trustworthiness = normalized_rank_score(trust_penalty, probes, row_count);
    let continuity = normalized_rank_score(continuity_penalty, probes, row_count);
    let false_neighbor_intrusion_rate =
        core::array::from_fn(|index| 1.0 - map_to_3072_recall[index]);
    let false_neighbor_extrusion_rate = false_neighbor_intrusion_rate;
    let density_distortion = density_distortion(evaluations);
    let triplet_matches: u64 = evaluations
        .iter()
        .map(|evaluation| evaluation.triplet_matches)
        .sum();
    let triplet_count = evaluations
        .iter()
        .map(|evaluation| evaluation.triplet_count)
        .sum::<u64>();
    AggregateMetrics {
        probe_count: probes,
        neighbor_counts: NEIGHBOR_COUNTS,
        map_to_512_recall,
        map_to_3072_recall,
        baseline_512_to_3072_recall,
        trustworthiness,
        continuity,
        false_neighbor_intrusion_rate,
        false_neighbor_extrusion_rate,
        density_distortion,
        sampled_triplet_agreement: if triplet_count == 0 {
            0.0
        } else {
            triplet_matches as f64 / triplet_count as f64
        },
    }
}

fn sum_array(
    evaluations: &[ProbeEvaluation],
    values: impl Fn(&ProbeEvaluation) -> [u64; 3],
) -> [u64; 3] {
    evaluations.iter().fold([0; 3], |mut sum, evaluation| {
        let values = values(evaluation);
        for index in 0..3 {
            sum[index] += values[index];
        }
        sum
    })
}

fn normalized_rank_score(penalty: [u64; 3], probes: usize, rows: usize) -> [f64; 3] {
    core::array::from_fn(|index| {
        let neighbors = NEIGHBOR_COUNTS[index];
        let denominator = probes
            .saturating_mul(neighbors)
            .saturating_mul(rows.saturating_mul(2).saturating_sub(3 * neighbors + 1));
        if denominator == 0 {
            0.0
        } else {
            (1.0 - 2.0 * penalty[index] as f64 / denominator as f64).clamp(0.0, 1.0)
        }
    })
}

fn density_distortion(evaluations: &[ProbeEvaluation]) -> [f64; 3] {
    core::array::from_fn(|index| {
        let mean_map = evaluations
            .iter()
            .map(|evaluation| evaluation.map_radii[index])
            .sum::<f64>()
            / evaluations.len() as f64;
        let mean_teacher = evaluations
            .iter()
            .map(|evaluation| evaluation.teacher_radii[index])
            .sum::<f64>()
            / evaluations.len() as f64;
        let map_scale = mean_map.max(f64::EPSILON);
        let teacher_scale = mean_teacher.max(f64::EPSILON);
        evaluations
            .iter()
            .map(|evaluation| {
                let normalized_map = (evaluation.map_radii[index] / map_scale).max(f64::EPSILON);
                let normalized_teacher =
                    (evaluation.teacher_radii[index] / teacher_scale).max(f64::EPSILON);
                (normalized_map / normalized_teacher).ln().abs()
            })
            .sum::<f64>()
            / evaluations.len() as f64
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SubgroupMeasurement {
    subgroup: ContentHash,
    probes: usize,
    recall_at_50: f64,
    degradation: f64,
}

fn subgroup_measurements(
    probes: &[SemanticProbe],
    evaluations: &[ProbeEvaluation],
    global_fidelity: f64,
) -> Result<(Vec<SubgroupMeasurement>, f64), ConditionQualityEvaluationError> {
    let mut groups = BTreeMap::<ContentHash, (u64, usize)>::new();
    for (probe, evaluation) in probes.iter().zip(evaluations) {
        let group = groups.entry(probe.subgroup).or_default();
        group.0 += evaluation.matched_3072[2];
        group.1 += 1;
    }
    let mut measurements = Vec::new();
    let mut maximum = 1.0_f64;
    for (subgroup, (matched, probe_count)) in groups {
        if probe_count < MINIMUM_SUBGROUP_PROBES || probe_count == probes.len() {
            continue;
        }
        let recall = bounded_ratio(matched, probe_count * NEIGHBOR_COUNTS[2]);
        let degradation = smoothed_error_ratio(global_fidelity, recall, probe_count);
        maximum = maximum.max(degradation);
        measurements.push(SubgroupMeasurement {
            subgroup,
            probes: probe_count,
            recall_at_50: recall,
            degradation,
        });
    }
    if measurements.is_empty() {
        return Err(ConditionQualityEvaluationError::new(
            "semantic quality has no proper subgroup with at least eight probes",
        ));
    }
    Ok((measurements, maximum))
}

fn smoothed_error_ratio(global_fidelity: f64, subgroup_fidelity: f64, probes: usize) -> f64 {
    let smoothing = 1.0 / (probes.max(1) as f64 + 1.0);
    let global_error = (1.0 - global_fidelity).max(smoothing);
    let subgroup_error = (1.0 - subgroup_fidelity).max(smoothing);
    (subgroup_error / global_error).max(1.0)
}

fn semantic_report(
    suite_version: &str,
    contract: ContentHash,
    corpus: ContentHash,
    field: ContentHash,
    condition: f32,
    metrics: &AggregateMetrics,
    probes: &[ProbeEvaluation],
) -> Result<Vec<u8>, ConditionQualityEvaluationError> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Subjects {
        evaluator_contract: ContentHash,
        canonical_corpus: ContentHash,
        canonical_field: ContentHash,
    }
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ProbeSummary {
        anchor: usize,
        map_to_512_matched: [u64; 3],
        map_to_3072_matched: [u64; 3],
        baseline_512_to_3072_matched: [u64; 3],
    }
    let probe_summaries = probes
        .iter()
        .map(|probe| ProbeSummary {
            anchor: probe.anchor,
            map_to_512_matched: probe.matched_512,
            map_to_3072_matched: probe.matched_3072,
            baseline_512_to_3072_matched: probe.matched_baseline,
        })
        .collect::<Vec<_>>();
    encode_report(
        suite_version,
        Subjects {
            evaluator_contract: contract,
            canonical_corpus: corpus,
            canonical_field: field,
        },
        serde_json::json!({
            "condition": condition,
            "aggregate": metrics,
            "probes": probe_summaries
        }),
    )
}

fn subgroup_report(
    suite_version: &str,
    contract: ContentHash,
    field: ContentHash,
    condition: f32,
    global_fidelity: f64,
    maximum_degradation: f64,
    subgroups: &[SubgroupMeasurement],
) -> Result<Vec<u8>, ConditionQualityEvaluationError> {
    encode_report(
        suite_version,
        serde_json::json!({
            "evaluatorContract": contract,
            "canonicalField": field
        }),
        serde_json::json!({
            "condition": condition,
            "globalFidelity": global_fidelity,
            "maximumSubgroupDegradation": maximum_degradation,
            "subgroups": subgroups
        }),
    )
}

fn encode_report(
    suite_version: &str,
    subjects: impl Serialize,
    measurements: impl Serialize,
) -> Result<Vec<u8>, ConditionQualityEvaluationError> {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Report<'suite, Subjects, Measurements> {
        schema_version: u32,
        suite_version: &'suite str,
        outcome: &'static str,
        subjects: Subjects,
        measurements: Measurements,
    }
    serde_json::to_vec(&Report {
        schema_version: 1,
        suite_version,
        outcome: "pass",
        subjects,
        measurements,
    })
    .map_err(|error| ConditionQualityEvaluationError::new(error.to_string()))
}

#[derive(Debug, Copy, Clone)]
struct DistanceRow {
    distance: f64,
    row: usize,
}

impl PartialEq for DistanceRow {
    fn eq(&self, other: &Self) -> bool {
        self.distance.to_bits() == other.distance.to_bits() && self.row == other.row
    }
}

impl Eq for DistanceRow {}

impl PartialOrd for DistanceRow {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for DistanceRow {
    fn cmp(&self, other: &Self) -> Ordering {
        self.distance
            .total_cmp(&other.distance)
            .then_with(|| self.row.cmp(&other.row))
    }
}

fn ranks(sorted: &[DistanceRow], row_count: usize) -> Box<[u32]> {
    let mut ranks = vec![u32::MAX; row_count];
    for (rank, candidate) in sorted.iter().enumerate() {
        ranks[candidate.row] =
            u32::try_from(rank + 1).expect("M0 row ceiling fits a u32 neighbor rank");
    }
    ranks.into_boxed_slice()
}

fn row(canonical: &[f32], row: usize) -> &[f32] {
    &canonical
        [row * crate::salt::CANONICAL_DIMENSIONS..(row + 1) * crate::salt::CANONICAL_DIMENSIONS]
}

fn overlap(left: &[usize], right: &[usize]) -> u64 {
    u64::try_from(
        left.iter()
            .filter(|candidate| right.contains(candidate))
            .count(),
    )
    .expect("neighbor overlap should fit u64")
}

fn squared_distance(left: [f64; 2], right: [f64; 2]) -> f64 {
    let x = left[0] - right[0];
    let y = left[1] - right[1];
    x.mul_add(x, y * y)
}
