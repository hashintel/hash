//! The classifier report: a certified refit of one published generation's deployed model.
//!
//! The report reconstructs the classifier training set from the generation's staged annotation
//! artifacts (the [`replay`] facility), re-runs the full production fit under the
//! echoed
//! configuration - fold assignment seeded by the echo, so the refit is deterministic - and
//! asserts that the recomputed model reproduces the staged `.clsf` artifact byte-for-byte. The
//! bundle therefore provably describes the deployed model, not a lookalike.
//!
//! One JSON document carries everything a downstream renderer needs: per-row identity, fold,
//! soft target, weight, out-of-fold logits, raw and calibrated posteriors, and applicability;
//! the model summary (coefficient row norms, intercepts, temperature, the sorted
//! training-distance distribution, and the out-of-fold metrics); and the certification verdict
//! with both digests.
//!
//! Failures panic with the failing step's error: a report run has no recovery path, and the
//! error is the diagnosis.

pub(crate) mod replay;

use self::replay::Frozen;
use super::{
    fit::{Fit, TrainingSet, fit},
    softmax,
};
use crate::{
    file::{
        WriteInto as _,
        generation::{GenerationId, GenerationRoot},
    },
    integrity::Sha256Digest,
    salt::policy::GeometryClass,
};

/// The certification verdict: the refit model against the staged artifact.
#[derive(Debug, serde::Serialize)]
struct Certification {
    /// The staged `.clsf` artifact's recorded identity.
    staged: Sha256Digest,
    /// SHA-256 of the refit model's serialized bytes.
    recomputed: Sha256Digest,
    /// The two digests agree: the report describes the deployed model.
    verified: bool,
}

/// The deployed model's summary: parameters and out-of-fold evidence.
#[derive(Debug, serde::Serialize)]
struct ModelSummary {
    /// Euclidean norm of each coefficient row, in class order.
    coefficient_norms: [f64; GeometryClass::COUNT],
    /// The intercepts, in class order.
    intercepts: [f64; GeometryClass::COUNT],
    /// The fitted calibration temperature.
    temperature: f64,
    /// Cross-validation fold count of the echoed configuration.
    folds: usize,
    /// Fold-assignment seed of the echoed configuration.
    seed: u64,
    /// Started outer iterations of the final full-corpus fit.
    iterations: u64,
    /// Weighted-mean cross-entropy of the uncalibrated out-of-fold posteriors.
    raw_cross_entropy: f64,
    /// Weighted-mean cross-entropy at the deployment temperature.
    calibrated_cross_entropy: f64,
    /// Weighted-mean Brier score of the uncalibrated out-of-fold posteriors.
    raw_brier: f64,
    /// Weighted-mean Brier score at the deployment temperature.
    calibrated_brier: f64,
    /// The applicability evidence's training distances, sorted ascending.
    training_distances: Box<[f64]>,
}

/// One training row's report: identity, supervision, and out-of-fold behaviour.
#[derive(Debug, serde::Serialize)]
struct RowReport {
    /// The card's canonical identity URL.
    identity: String,
    /// The indivisible validation group.
    group: Sha256Digest,
    /// The fold that held this row out.
    fold: usize,
    /// Soft target over the geometry classes, in class order.
    target: [f64; GeometryClass::COUNT],
    /// Vote count backing the target.
    weight: f64,
    /// Out-of-fold logits, in class order.
    out_of_fold_logits: [f64; GeometryClass::COUNT],
    /// The uncalibrated out-of-fold distribution `softmax(logits)`.
    raw_posterior: [f64; GeometryClass::COUNT],
    /// The deployment out-of-fold distribution `softmax(logits / T)`.
    calibrated_posterior: [f64; GeometryClass::COUNT],
    /// Standardized distance from the training distribution.
    distance: f64,
    /// Upper-tail rank of `distance` among the training distances, in `[0, 1]`.
    applicability: f64,
}

/// The certified classifier report of one published generation.
#[derive(Debug, serde::Serialize)]
pub(crate) struct ClassifierReport {
    /// The reported generation's hex identity.
    generation: GenerationId,
    certification: Certification,
    model: ModelSummary,
    rows: Vec<RowReport>,
}

impl ClassifierReport {
    /// Reconstructs the staged corpus, refits the deployed model, certifies the bytes, and
    /// compiles the bundle.
    ///
    /// # Panics
    ///
    /// Panics when the generation cannot be opened, its staged corpus fails reconstruction, the
    /// refit fails, or the recomputed model does not reproduce the staged artifact bytes.
    pub(crate) async fn compile(root: &GenerationRoot, generation: GenerationId) -> Self {
        let frozen = Frozen::load(root, generation);
        let reconstructed = frozen.reconstruct().await;
        let embeddings = reconstructed.trained_embeddings();
        let rows = reconstructed.rows();
        let identities = reconstructed.identities();

        let training =
            TrainingSet::new(embeddings, rows).expect("the staged corpus validated at fit time");
        let config = frozen.fit();
        let refit: Fit = fit(training, config).expect("the staged corpus refits");

        let staged = frozen.staged_classifier_digest();
        let recomputed = refit
            .classifier
            .write_into(std::io::sink())
            .expect("writing to a sink performs no fallible IO");
        assert!(
            recomputed == staged,
            "the refit model reproduces the staged classifier artifact bytes",
        );

        let temperature = refit.classifier.temperature();
        let row_reports = rows
            .iter()
            .zip(identities)
            .enumerate()
            .map(|(row, (training_row, identity))| {
                let logits = refit.evidence.out_of_fold_logits[row];
                let prediction = refit
                    .classifier
                    .predict(&embeddings[row])
                    .expect("the deployed model evaluates its own training rows");

                RowReport {
                    identity: identity.canonical_url(),
                    group: training_row.group,
                    fold: refit.evidence.folds[row],
                    target: training_row.target,
                    weight: training_row.weight,
                    out_of_fold_logits: logits,
                    raw_posterior: softmax(logits, 1.0),
                    calibrated_posterior: softmax(logits, temperature),
                    distance: prediction.distance,
                    applicability: prediction.applicability,
                }
            })
            .collect();

        let coefficient_norms = core::array::from_fn(|class| {
            refit.classifier.coefficients[class].norm_squared().sqrt()
        });

        Self {
            generation,
            certification: Certification {
                staged,
                recomputed,
                verified: recomputed == staged,
            },
            model: ModelSummary {
                coefficient_norms,
                intercepts: refit.classifier.intercepts,
                temperature,
                folds: config.folds,
                seed: config.seed,
                iterations: refit.evidence.iterations,
                raw_cross_entropy: refit.evidence.raw_cross_entropy,
                calibrated_cross_entropy: refit.evidence.calibrated_cross_entropy,
                raw_brier: refit.evidence.raw_brier,
                calibrated_brier: refit.evidence.calibrated_brier,
                training_distances: refit.classifier.applicability.distances,
            },
            rows: row_reports,
        }
    }

    /// The reported training-row count.
    pub(crate) const fn row_count(&self) -> usize {
        self.rows.len()
    }
}
