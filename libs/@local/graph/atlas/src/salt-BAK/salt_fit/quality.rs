#![expect(
    clippy::little_endian_bytes,
    reason = "quality reports use canonical little-endian scalar encodings"
)]

use alloc::collections::BinaryHeap;
use core::{cmp::Ordering, error::Error, fmt};

use rayon::prelude::*;
#[path = "quality/deferred.rs"]
mod deferred;
#[path = "quality/semantic.rs"]
mod semantic;

pub(in crate::salt_fit) use deferred::DeferredConditionQualityEvaluator;
pub(in crate::salt_fit) use semantic::LocalConditionQualityEvaluator;

use crate::salt::{
    ContentHash, ContentHasher,
    salt_fit_boundary::{
        AUDITED_NEIGHBORS, AUDITED_PREFIX_DIMENSIONS, AnalyticPoint, CanonicalEmbedding,
        EntityRole, IdentityDirectory, LandmarkCandidate, MergeTree, MergeTreeConfig,
        PROJECTOR_DIMENSIONS, PersistenceDiagnostics, PersistenceEvaluationError,
        PersistenceEvaluationSubject, PersistenceQualityEvaluator, RasterConfig,
        RepresentationAuditReport, canonical_corpus_hash, density_raster, merge_tree,
        prefix_corpus_hash, projector_corpus_hash, representation_stratification_hash,
    },
};

const REPRESENTATION_AUDIT_SAMPLE_ROWS: usize = 64;
const MINIMUM_STRATUM_SAMPLE_ROWS: usize = 2;
const MAXIMUM_AUDIT_NEIGHBORS: usize = 50;

#[derive(Debug)]
pub(super) enum FitQualityError {
    CorpusTooSmall {
        rows: usize,
        minimum: usize,
    },
    Representation(String),
    Allocation {
        buffer: &'static str,
        elements: usize,
    },
}

impl fmt::Display for FitQualityError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::CorpusTooSmall { rows, minimum } => write!(
                formatter,
                "quality gates require at least {minimum} entities, but extraction returned {rows}"
            ),
            Self::Representation(detail) => {
                write!(formatter, "representation audit failed: {detail}")
            }
            Self::Allocation { buffer, elements } => write!(
                formatter,
                "could not reserve {elements} values for quality buffer {buffer}"
            ),
        }
    }
}

impl Error for FitQualityError {}

pub(super) struct PreparedRepresentations {
    pub projector: Box<[f32]>,
    pub audit: RepresentationAuditReport,
    pub report: Box<[u8]>,
}

pub(super) fn audit_representations(
    canonical: &[f32],
    identities: &IdentityDirectory,
    candidates: &[LandmarkCandidate],
    roles: &[EntityRole],
) -> Result<PreparedRepresentations, FitQualityError> {
    let rows = identities.len();
    let minimum = MAXIMUM_AUDIT_NEIGHBORS + 1;
    if rows < minimum {
        return Err(FitQualityError::CorpusTooSmall { rows, minimum });
    }
    let projector = derive_projector(canonical, rows)?;
    let canonical_hash = canonical_corpus_hash(canonical);
    let projector_hash = projector_corpus_hash(&projector);
    let identity_hash = identities.content_hash();
    let stratification_hash = representation_stratification_hash(candidates, roles)
        .map_err(|error| FitQualityError::Representation(error.to_string()))?;
    let sample_rows = rows.min(REPRESENTATION_AUDIT_SAMPLE_ROWS);
    let query_rows = (0..sample_rows).collect::<Vec<_>>();
    let query_sample_hash = query_sample_hash(identity_hash, &query_rows);
    let norms = prefix_norms(canonical)?;
    let per_query = query_rows
        .par_iter()
        .map(|&query| exact_prefix_recall(canonical, &norms, query))
        .collect::<Vec<_>>();
    let mut matched = [[0_u64; AUDITED_NEIGHBORS.len()]; AUDITED_PREFIX_DIMENSIONS.len()];
    for query in per_query {
        for prefix in 0..AUDITED_PREFIX_DIMENSIONS.len() {
            for neighbors in 0..AUDITED_NEIGHBORS.len() {
                matched[prefix][neighbors] += query[prefix][neighbors];
            }
        }
    }
    let overall_recall = core::array::from_fn(|prefix| {
        core::array::from_fn(|neighbors| {
            bounded_ratio(
                matched[prefix][neighbors],
                sample_rows * AUDITED_NEIGHBORS[neighbors],
            )
        })
    });
    let summary = summary_hash(canonical_hash, projector_hash, matched, sample_rows);
    let audit = RepresentationAuditReport {
        suite_version: "salt-representation-prefix-exact-v1".to_owned(),
        canonical_corpus_hash: canonical_hash,
        projector_corpus_hash: projector_hash,
        identity_directory_hash: identity_hash,
        stratification_input_hash: stratification_hash,
        prefix_corpus_hashes: AUDITED_PREFIX_DIMENSIONS
            .map(|dimensions| prefix_corpus_hash(canonical, dimensions)),
        query_sample_hash,
        sample_rows,
        overall_recall,
        stratified_report_hash: report_hash(
            b"hash.graph.atlas.fit.representation-stratified.v1",
            summary,
            stratification_hash,
        ),
        diagnostic_report_hash: report_hash(
            b"hash.graph.atlas.fit.representation-diagnostics.v1",
            summary,
            query_sample_hash,
        ),
        clump_report_hash: report_hash(
            b"hash.graph.atlas.fit.representation-clump.v1",
            summary,
            canonical_hash,
        ),
    };
    audit
        .validate(canonical, &projector, identity_hash, stratification_hash)
        .map_err(|error| FitQualityError::Representation(error.to_string()))?;
    let report = serde_json::to_vec(&serde_json::json!({
        "schemaVersion": 1,
        "suiteVersion": audit.suite_version.as_str(),
        "outcome": "pass",
        "subjects": {
            "canonicalCorpus": canonical_hash,
            "projectorCorpus": projector_hash,
            "identityDirectory": identity_hash,
            "stratificationInput": stratification_hash
        },
        "measurements": &audit
    }))
    .map_err(|error| FitQualityError::Representation(error.to_string()))?
    .into_boxed_slice();
    Ok(PreparedRepresentations {
        projector,
        audit,
        report,
    })
}

pub(super) fn deferred_representations(
    canonical: &[f32],
    identities: &IdentityDirectory,
    candidates: &[LandmarkCandidate],
    roles: &[EntityRole],
) -> Result<PreparedRepresentations, FitQualityError> {
    let rows = identities.len();
    if rows == 0 {
        return Err(FitQualityError::CorpusTooSmall { rows, minimum: 1 });
    }
    let projector = derive_projector(canonical, rows)?;
    let canonical_hash = canonical_corpus_hash(canonical);
    let projector_hash = projector_corpus_hash(&projector);
    let identity_hash = identities.content_hash();
    let stratification_hash = representation_stratification_hash(candidates, roles)
        .map_err(|error| FitQualityError::Representation(error.to_string()))?;
    let query_sample_hash = report_hash(
        b"hash.graph.atlas.fit.deferred-representation-query.v1",
        identity_hash,
        canonical_hash,
    );
    let summary = report_hash(
        b"hash.graph.atlas.fit.deferred-representation-summary.v1",
        canonical_hash,
        projector_hash,
    );
    let audit = RepresentationAuditReport {
        suite_version: "salt-deferred-non-attesting-representation-v1".to_owned(),
        canonical_corpus_hash: canonical_hash,
        projector_corpus_hash: projector_hash,
        identity_directory_hash: identity_hash,
        stratification_input_hash: stratification_hash,
        prefix_corpus_hashes: AUDITED_PREFIX_DIMENSIONS
            .map(|dimensions| prefix_corpus_hash(canonical, dimensions)),
        query_sample_hash,
        sample_rows: 1,
        overall_recall: [[0.0; AUDITED_NEIGHBORS.len()]; AUDITED_PREFIX_DIMENSIONS.len()],
        stratified_report_hash: report_hash(
            b"hash.graph.atlas.fit.deferred-representation-stratified.v1",
            summary,
            stratification_hash,
        ),
        diagnostic_report_hash: report_hash(
            b"hash.graph.atlas.fit.deferred-representation-diagnostics.v1",
            summary,
            query_sample_hash,
        ),
        clump_report_hash: report_hash(
            b"hash.graph.atlas.fit.deferred-representation-clump.v1",
            summary,
            canonical_hash,
        ),
    };
    audit
        .validate(canonical, &projector, identity_hash, stratification_hash)
        .map_err(|error| FitQualityError::Representation(error.to_string()))?;
    let report = serde_json::to_vec(&serde_json::json!({
        "schemaVersion": 1,
        "suiteVersion": audit.suite_version.as_str(),
        "outcome": "deferred",
        "attesting": false,
        "note": "mock representation envelope; no representation evidence was collected",
        "subjects": {
            "canonicalCorpus": canonical_hash,
            "projectorCorpus": projector_hash,
            "identityDirectory": identity_hash,
            "stratificationInput": stratification_hash
        }
    }))
    .map_err(|error| FitQualityError::Representation(error.to_string()))?
    .into_boxed_slice();
    Ok(PreparedRepresentations {
        projector,
        audit,
        report,
    })
}

fn derive_projector(canonical: &[f32], rows: usize) -> Result<Box<[f32]>, FitQualityError> {
    let expected =
        rows.checked_mul(crate::salt::CANONICAL_DIMENSIONS)
            .ok_or(FitQualityError::Allocation {
                buffer: "canonical corpus",
                elements: usize::MAX,
            })?;
    if canonical.len() != expected {
        return Err(FitQualityError::Representation(
            "canonical matrix row count does not match the identity population".to_owned(),
        ));
    }
    let elements = rows
        .checked_mul(PROJECTOR_DIMENSIONS)
        .ok_or(FitQualityError::Allocation {
            buffer: "projector corpus",
            elements: usize::MAX,
        })?;
    let mut projector = try_vec("projector corpus", elements)?;
    for row in canonical.chunks_exact(crate::salt::CANONICAL_DIMENSIONS) {
        let embedding = CanonicalEmbedding::new(row)
            .map_err(|error| FitQualityError::Representation(error.to_string()))?;
        let mut prefix = [0.0; PROJECTOR_DIMENSIONS];
        let _normalization = embedding.normalize_prefix(&mut prefix);
        projector.extend_from_slice(&prefix);
    }
    Ok(projector.into_boxed_slice())
}

fn prefix_norms(canonical: &[f32]) -> Result<Box<[[f64; 5]]>, FitQualityError> {
    let rows = canonical.len() / crate::salt::CANONICAL_DIMENSIONS;
    let mut norms = try_vec("prefix norms", rows)?;
    for row in canonical.chunks_exact(crate::salt::CANONICAL_DIMENSIONS) {
        let mut values = [0.0_f64; 5];
        let mut sum = 0.0;
        let mut boundary = 0;
        for (index, &value) in row.iter().enumerate() {
            sum = f64::from(value).mul_add(f64::from(value), sum);
            if boundary < AUDITED_PREFIX_DIMENSIONS.len()
                && index + 1 == AUDITED_PREFIX_DIMENSIONS[boundary]
            {
                values[boundary] = sum.sqrt();
                boundary += 1;
            }
        }
        values[4] = sum.sqrt();
        if values
            .iter()
            .any(|norm| !norm.is_finite() || *norm <= f64::MIN_POSITIVE)
        {
            return Err(FitQualityError::Representation(
                "an audited prefix has zero or non-finite norm".to_owned(),
            ));
        }
        norms.push(values);
    }
    Ok(norms.into_boxed_slice())
}

fn exact_prefix_recall(canonical: &[f32], norms: &[[f64; 5]], query: usize) -> [[u64; 3]; 4] {
    let query_values = &canonical[query * crate::salt::CANONICAL_DIMENSIONS
        ..(query + 1) * crate::salt::CANONICAL_DIMENSIONS];
    let mut nearest: [BinaryHeap<Neighbor>; 5] = core::array::from_fn(|_| BinaryHeap::new());
    for (candidate, candidate_values) in canonical
        .chunks_exact(crate::salt::CANONICAL_DIMENSIONS)
        .enumerate()
    {
        if candidate == query {
            continue;
        }
        let mut dots = [0.0_f64; 5];
        let mut dot = 0.0;
        let mut boundary = 0;
        for (index, (&left, &right)) in query_values.iter().zip(candidate_values).enumerate() {
            dot = f64::from(left).mul_add(f64::from(right), dot);
            if boundary < AUDITED_PREFIX_DIMENSIONS.len()
                && index + 1 == AUDITED_PREFIX_DIMENSIONS[boundary]
            {
                dots[boundary] = dot;
                boundary += 1;
            }
        }
        dots[4] = dot;
        for prefix in 0..5 {
            let denominator = norms[query][prefix] * norms[candidate][prefix];
            let distance = 1.0 - (dots[prefix] / denominator).clamp(-1.0, 1.0);
            push_neighbor(
                &mut nearest[prefix],
                Neighbor {
                    distance,
                    row: candidate,
                },
            );
        }
    }
    let ordered = nearest.map(BinaryHeap::into_sorted_vec);
    core::array::from_fn(|prefix| {
        core::array::from_fn(|neighbors| {
            let count = AUDITED_NEIGHBORS[neighbors];
            ordered[prefix][..count]
                .iter()
                .filter(|candidate| {
                    ordered[4][..count]
                        .iter()
                        .any(|expected| expected.row == candidate.row)
                })
                .count() as u64
        })
    })
}

fn push_neighbor(neighbors: &mut BinaryHeap<Neighbor>, candidate: Neighbor) {
    if neighbors.len() < MAXIMUM_AUDIT_NEIGHBORS {
        neighbors.push(candidate);
        return;
    }
    if neighbors.peek().is_some_and(|worst| candidate < *worst) {
        let _removed = neighbors.pop();
        neighbors.push(candidate);
    }
}

#[derive(Debug, Copy, Clone)]
struct Neighbor {
    distance: f64,
    row: usize,
}

impl PartialEq for Neighbor {
    fn eq(&self, other: &Self) -> bool {
        self.distance.to_bits() == other.distance.to_bits() && self.row == other.row
    }
}

impl Eq for Neighbor {}

impl PartialOrd for Neighbor {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Neighbor {
    fn cmp(&self, other: &Self) -> Ordering {
        self.distance
            .total_cmp(&other.distance)
            .then_with(|| self.row.cmp(&other.row))
    }
}

fn query_sample_hash(identity: ContentHash, rows: &[usize]) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.fit.representation-audit-sample.v1");
    hasher.update(identity.as_bytes());
    for &row in rows {
        hasher.update(
            &u64::try_from(row)
                .expect("row should fit u64")
                .to_le_bytes(),
        );
    }
    hasher.finish()
}

fn summary_hash(
    canonical: ContentHash,
    projector: ContentHash,
    matched: [[u64; 3]; 4],
    sample_rows: usize,
) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.fit.representation-audit-summary.v1");
    hasher.update(canonical.as_bytes());
    hasher.update(projector.as_bytes());
    hasher.update(
        &u64::try_from(sample_rows)
            .expect("sample rows should fit u64")
            .to_le_bytes(),
    );
    for row in matched {
        for value in row {
            hasher.update(&value.to_le_bytes());
        }
    }
    hasher.finish()
}

fn report_hash(domain: &'static [u8], summary: ContentHash, subject: ContentHash) -> ContentHash {
    let mut hasher = ContentHasher::new(domain);
    hasher.update(summary.as_bytes());
    hasher.update(subject.as_bytes());
    hasher.finish()
}

fn bounded_ratio(numerator: u64, denominator: usize) -> f64 {
    let numerator = u32::try_from(numerator).expect("bounded M0 quality counts should fit in u32");
    let denominator =
        u32::try_from(denominator).expect("bounded M0 quality counts should fit in u32");
    f64::from(numerator) / f64::from(denominator)
}

/// Local two-sided persistence diagnostics plus deterministic planted shapes.
#[derive(Debug, Copy, Clone)]
pub(super) struct LocalPersistenceQualityEvaluator {
    contract_hash: ContentHash,
}

impl LocalPersistenceQualityEvaluator {
    #[must_use]
    pub(super) fn new() -> Self {
        Self {
            contract_hash: ContentHash::digest(
                b"hash.graph.atlas.fit.persistence-quality-contract.v1",
            ),
        }
    }
}

impl PersistenceQualityEvaluator for LocalPersistenceQualityEvaluator {
    #[expect(
        clippy::unnecessary_literal_bound,
        reason = "the evaluator trait permits runtime-owned suite versions"
    )]
    fn suite_version(&self) -> &str {
        "m0-local-persistence-v1"
    }

    fn contract_hash(&self) -> ContentHash {
        self.contract_hash
    }

    fn evaluate(
        &self,
        subject: PersistenceEvaluationSubject<'_>,
    ) -> Result<PersistenceDiagnostics, PersistenceEvaluationError> {
        let candidate_low = low_persistence_mass(subject.candidate_tree);
        let reference_low = low_persistence_mass(subject.reference_tree);
        let candidate_noise = noise_persistence(subject.candidate_tree);
        let reference_noise = noise_persistence(subject.reference_tree);
        let planted_shape_failures = planted_shape_failures()?;
        let distribution_report_hash = persistence_report_hash(
            b"hash.graph.atlas.fit.persistence-distribution-report.v1",
            subject,
            candidate_low,
            reference_low,
        );
        let noise_report_hash = persistence_report_hash(
            b"hash.graph.atlas.fit.persistence-noise-report.v1",
            subject,
            candidate_noise,
            reference_noise,
        );
        let mut planted = ContentHasher::new(b"hash.graph.atlas.fit.planted-shape-report.v1");
        planted.update(self.contract_hash.as_bytes());
        planted.update(&3_u64.to_le_bytes());
        planted.update(&planted_shape_failures.to_le_bytes());
        Ok(PersistenceDiagnostics {
            candidate_low_persistence_mass: candidate_low,
            reference_low_persistence_mass: reference_low,
            candidate_noise_persistence: candidate_noise,
            reference_noise_persistence: reference_noise,
            planted_shape_cases: 3,
            planted_shape_failures,
            distribution_report_hash,
            planted_shape_report_hash: planted.finish(),
            noise_report_hash,
        })
    }
}

fn low_persistence_mass(tree: &MergeTree) -> f64 {
    let cutoff = tree.density_maximum() * 0.01;
    tree.leaves()
        .iter()
        .map(|leaf| leaf.persistence())
        .filter(|persistence| *persistence <= cutoff)
        .sum()
}

fn noise_persistence(tree: &MergeTree) -> f64 {
    let cutoff = tree.density_maximum() * 0.01;
    tree.leaves()
        .iter()
        .map(|leaf| leaf.persistence())
        .filter(|persistence| *persistence <= cutoff)
        .fold(0.0, f64::max)
}

fn persistence_report_hash(
    domain: &'static [u8],
    subject: PersistenceEvaluationSubject<'_>,
    candidate: f64,
    reference: f64,
) -> ContentHash {
    let mut hasher = ContentHasher::new(domain);
    hasher.update(subject.checkpoint_hash.as_bytes());
    hasher.update(subject.field_hash.as_bytes());
    hasher.update(subject.candidate_tree.content_hash().as_bytes());
    hasher.update(subject.reference_tree.content_hash().as_bytes());
    hasher.update(subject.reference_source_hash.as_bytes());
    hasher.update(&candidate.to_bits().to_le_bytes());
    hasher.update(&reference.to_bits().to_le_bytes());
    hasher.finish()
}

fn planted_shape_failures() -> Result<u64, PersistenceEvaluationError> {
    let raster = RasterConfig {
        grid_size: 64,
        bandwidth_pixels: 1.5,
    };
    let tree = MergeTreeConfig {
        floor_fraction: 0.005,
        persistence_fraction: 0.05,
    };
    let empty = merge_tree(
        &density_raster(&[], raster).map_err(persistence_error)?,
        tree,
    )
    .map_err(persistence_error)?;
    let single = merge_tree(
        &density_raster(
            &[AnalyticPoint {
                coordinate: [0.0, 0.0],
                mass: 1.0,
            }],
            raster,
        )
        .map_err(persistence_error)?,
        tree,
    )
    .map_err(persistence_error)?;
    let double = merge_tree(
        &density_raster(
            &[
                AnalyticPoint {
                    coordinate: [-1.0, 0.0],
                    mass: 1.0,
                },
                AnalyticPoint {
                    coordinate: [1.0, 0.0],
                    mass: 1.0,
                },
            ],
            raster,
        )
        .map_err(persistence_error)?,
        tree,
    )
    .map_err(persistence_error)?;
    Ok(u64::from(!empty.leaves().is_empty())
        + u64::from(single.leaves().len() != 1)
        + u64::from(double.leaves().len() < 2))
}

fn persistence_error(error: impl fmt::Display) -> PersistenceEvaluationError {
    PersistenceEvaluationError::new(error.to_string())
}

fn try_vec<T>(buffer: &'static str, elements: usize) -> Result<Vec<T>, FitQualityError> {
    let mut values = Vec::new();
    values
        .try_reserve_exact(elements)
        .map_err(|_error| FitQualityError::Allocation { buffer, elements })?;
    Ok(values)
}

#[cfg(test)]
#[path = "quality/tests.rs"]
mod tests;
