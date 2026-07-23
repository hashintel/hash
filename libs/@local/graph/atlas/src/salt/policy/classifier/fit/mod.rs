//! Deterministic soft-target classifier fitting and grouped validation.
//!
//! [`fit`] trains the deployed linear model by minimizing weighted multinomial cross-entropy with
//! L2-regularized coefficients and unregularized intercepts,
//!
//! ```text
//! Σ_i v_i · cross_entropy(q_i, softmax(W e_i + b))
//!     + (λ / 2) · squared_norm(W),
//! ```
//!
//! through L-BFGS with an Armijo backtracking line search ([`objective`]). Whole relation groups
//! are assigned to seeded, size-balanced folds before fitting, so near-duplicate corpus entries
//! never straddle a train/validation split; concatenated out-of-fold logits calibrate one scalar
//! deployment temperature ([`calibration`]), and the applicability distribution is fitted over the
//! complete corpus ([`applicability`]). The fold models and the final model are independent and fit
//! in parallel; each fit's arithmetic is sequential, so the result is deterministic.
//!
//! Every fit must reach the configured gradient tolerance: a fit that exhausts its iteration bound
//! is an error, never a best-effort model. An atlas generation requires a valid classifier artifact
//! and fails candidacy without one, so a questionable model must not be published for the pipeline
//! to limp on with.

use core::{error::Error, fmt};
use std::collections::HashMap;

use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};

use self::objective::Parameters;
use super::Classifier;
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{AlignedVecN, BoxedDVecN, DVecN},
    salt::policy::GeometryClass,
};

mod applicability;
mod calibration;
mod objective;

#[cfg(test)]
mod tests;

/// A training input violated the corpus contract.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum TrainingSetError {
    /// The corpus holds no rows.
    Empty,
    /// The embedding and row counts differ.
    RowMismatch { embeddings: usize, rows: usize },
    /// An embedding component is not finite.
    NonFiniteEmbedding { row: usize, component: usize },
    /// A target probability lies outside `[0, 1]` or is not finite.
    InvalidTarget {
        row: usize,
        class: GeometryClass,
        value: f64,
    },
    /// A target distribution does not sum to one.
    UnnormalizedTarget { row: usize, sum: f64 },
    /// A vote weight is not positive and finite.
    InvalidWeight { row: usize, value: f64 },
}

impl fmt::Display for TrainingSetError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::Empty => fmt.write_str("the training corpus holds no rows"),
            Self::RowMismatch { embeddings, rows } => write!(
                fmt,
                "{embeddings} embeddings do not match {rows} training rows",
            ),
            Self::NonFiniteEmbedding { row, component } => write!(
                fmt,
                "component {component} of the row {row} embedding is not finite",
            ),
            Self::InvalidTarget { row, class, value } => write!(
                fmt,
                "the {class} target {value} of row {row} is not a probability",
            ),
            Self::UnnormalizedTarget { row, sum } => {
                write!(fmt, "the row {row} target distribution sums to {sum}")
            }
            Self::InvalidWeight { row, value } => {
                write!(fmt, "the row {row} vote weight {value} is not positive")
            }
        }
    }
}

impl Error for TrainingSetError {}

/// The fit could not produce a valid classifier.
#[derive(Debug)]
pub(crate) enum FitError {
    /// A configuration value lies outside its documented domain.
    InvalidConfig { field: &'static str, value: f64 },
    /// Fewer distinct groups than requested folds.
    InsufficientGroups { groups: usize, folds: usize },
    /// A fold's training portion carries no target mass for a class.
    MissingClassMass { class: GeometryClass },
    /// An evaluation outside the solver produced a non-finite value.
    NonFinite,
    /// The optimizer failed internally.
    Solver(argmin::core::Error),
    /// The iteration bound was exhausted above the gradient tolerance.
    DidNotConverge { iterations: u64, gradient_norm: f64 },
}

impl fmt::Display for FitError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidConfig { field, value } => {
                write!(fmt, "the configured {field} {value} is out of domain")
            }
            Self::InsufficientGroups { groups, folds } => write!(
                fmt,
                "{groups} relation groups cannot fill {folds} validation folds",
            ),
            Self::MissingClassMass { class } => write!(
                fmt,
                "a training fold carries no target mass for the {class} class",
            ),
            Self::NonFinite => fmt.write_str("an evaluation produced a non-finite value"),
            Self::Solver(error) => write!(fmt, "the optimizer failed: {error}"),
            Self::DidNotConverge {
                iterations,
                gradient_norm,
            } => write!(
                fmt,
                "the fit stopped after {iterations} iterations at gradient norm {gradient_norm}",
            ),
        }
    }
}

impl From<argmin::core::Error> for FitError {
    fn from(error: argmin::core::Error) -> Self {
        Self::Solver(error)
    }
}

impl Error for FitError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Solver(error) => Some(error.as_ref()),
            Self::InvalidConfig { .. }
            | Self::InsufficientGroups { .. }
            | Self::MissingClassMass { .. }
            | Self::NonFinite
            | Self::DidNotConverge { .. } => None,
        }
    }
}

/// One soft label, vote weight, and indivisible validation group.
///
/// The group digest names the finest unit a validation split may not divide. Corpus assembly unions
/// every leakage axis - relation family, inverse pair, base URL, publisher, near-duplicate card
/// family - into this one label before rows reach the fit, so near-identical corpus entries can
/// never straddle a train/validation boundary and inflate the out-of-fold metrics.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct TrainingRow {
    /// Soft target over the geometry classes, in class order.
    pub target: [f64; GeometryClass::COUNT],
    /// Vote count backing the target.
    pub weight: f64,
    /// Indivisible validation group.
    pub group: Sha256Digest,
}

/// Validated borrowed classifier training data.
///
/// Embeddings borrow in the shape the mapped card-embedding artifact yields; row `i` of `rows`
/// labels embedding `i`.
#[derive(Debug, Copy, Clone)]
pub(crate) struct TrainingSet<'training> {
    embeddings: &'training [AlignedVecN<CANONICAL_DIMENSIONS>],
    rows: &'training [TrainingRow],
}

impl<'training> TrainingSet<'training> {
    /// Validates embeddings and weighted soft labels.
    ///
    /// # Errors
    ///
    /// Returns a [`TrainingSetError`] for an empty corpus, mismatched lengths, non-finite embedding
    /// components, targets that are not probability distributions, or non-positive vote weights.
    pub(crate) fn new(
        embeddings: &'training [AlignedVecN<CANONICAL_DIMENSIONS>],
        rows: &'training [TrainingRow],
    ) -> Result<Self, TrainingSetError> {
        if rows.is_empty() {
            return Err(TrainingSetError::Empty);
        }

        if embeddings.len() != rows.len() {
            return Err(TrainingSetError::RowMismatch {
                embeddings: embeddings.len(),
                rows: rows.len(),
            });
        }

        // The scan touches every component once (a few MB of SIMD
        // compares at annotation-corpus scale, well under a
        // millisecond) and runs once per fit; the borrowed slice type
        // carries no finiteness guarantee of its own.
        for (row_index, embedding) in embeddings.iter().enumerate() {
            if embedding.is_finite() {
                continue;
            }

            // Cold path: name the first offending component.
            let Some(component) = embedding
                .as_array()
                .iter()
                .position(|value| !value.is_finite())
            else {
                unreachable!("a non-finite embedding contains a non-finite component")
            };

            return Err(TrainingSetError::NonFiniteEmbedding {
                row: row_index,
                component,
            });
        }

        for (row_index, row) in rows.iter().enumerate() {
            for (class, value) in GeometryClass::VARIANTS.into_iter().zip(row.target) {
                if !value.is_finite() || value.is_sign_negative() || value > 1.0 {
                    return Err(TrainingSetError::InvalidTarget {
                        row: row_index,
                        class,
                        value,
                    });
                }
            }

            let sum = row.target.into_iter().sum::<f64>();
            if (sum - 1.0).abs() > 1.0e-9 {
                return Err(TrainingSetError::UnnormalizedTarget {
                    row: row_index,
                    sum,
                });
            }

            if !row.weight.is_finite() || row.weight <= 0.0 {
                return Err(TrainingSetError::InvalidWeight {
                    row: row_index,
                    value: row.weight,
                });
            }
        }

        Ok(Self { embeddings, rows })
    }

    /// Returns the embedding labelled by row `row`.
    #[inline]
    pub(super) const fn embedding(
        self,
        row: usize,
    ) -> &'training AlignedVecN<CANONICAL_DIMENSIONS> {
        &self.embeddings[row]
    }

    /// Returns the labelled rows.
    #[inline]
    pub(super) const fn rows(self) -> &'training [TrainingRow] {
        self.rows
    }

    /// Returns the corpus row count.
    #[inline]
    pub(super) const fn len(self) -> usize {
        self.rows.len()
    }
}

/// Optimizer and grouped-validation settings.
///
/// The defaults are starting points pending corpus-scale tuning; the out-of-fold metrics in
/// [`FitEvidence`] judge them.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct FitConfig {
    /// L2 penalty `λ` multiplying `squared_norm(W) / 2`; intercepts are never regularized.
    ///
    /// Positive. Defaults to 1.0.
    pub regularization: f64 = 1.0,
    /// Iteration bound per model fit. Positive. Defaults to 500.
    pub maximum_iterations: u64 = 500,
    /// Euclidean gradient norm at which a fit converges. Positive. Defaults to 1e-6.
    pub gradient_tolerance: f64 = 1.0e-6,
    /// Retained L-BFGS curvature pairs. Positive. Defaults to 8.
    pub history_size: usize = 8,
    /// Grouped cross-validation fold count. At least 2. Defaults to 5.
    pub folds: usize = 5,
    /// Fold-assignment seed.
    pub seed: u64 = 0,
}

impl FitConfig {
    pub(crate) fn validate(self) -> Result<(), FitError> {
        // TODO: not a huge fan of this, this is stringly typed :/
        for (field, value) in [
            ("regularization", self.regularization),
            ("gradient_tolerance", self.gradient_tolerance),
        ] {
            if !value.is_finite() || value <= 0.0 {
                return Err(FitError::InvalidConfig { field, value });
            }
        }

        if self.maximum_iterations == 0 {
            return Err(FitError::InvalidConfig {
                field: "maximum_iterations",
                value: 0.0,
            });
        }

        if self.history_size == 0 {
            return Err(FitError::InvalidConfig {
                field: "history_size",
                value: 0.0,
            });
        }

        if self.folds < 2 {
            #[expect(
                clippy::cast_precision_loss,
                reason = "the offending fold count is 0 or 1"
            )]
            return Err(FitError::InvalidConfig {
                field: "folds",
                value: self.folds as f64,
            });
        }

        Ok(())
    }
}

/// Grouped out-of-fold discrimination and calibration evidence.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct FitEvidence {
    /// Fold assignment per training row.
    pub folds: Box<[usize]>,
    /// Out-of-fold logits per training row, in class order.
    pub out_of_fold_logits: Box<[[f64; GeometryClass::COUNT]]>,
    /// Weighted-mean cross-entropy of the uncalibrated posteriors.
    pub raw_cross_entropy: f64,
    /// Weighted-mean cross-entropy at the deployment temperature.
    pub calibrated_cross_entropy: f64,
    /// Weighted-mean Brier score of the uncalibrated posteriors.
    pub raw_brier: f64,
    /// Weighted-mean Brier score at the deployment temperature.
    pub calibrated_brier: f64,
    /// Iterations of the final full-corpus fit.
    pub iterations: u64,
}

/// A fitted classifier with its validation evidence.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Fit {
    /// The deployable model.
    pub classifier: Classifier,
    /// The evidence that judges it.
    pub evidence: FitEvidence,
}

/// Fits the deployment model, grouped calibration, and applicability.
///
/// # Errors
///
/// Returns a [`FitError`] for invalid configuration, too few relation groups, a fold without
/// complete class mass, a non-finite evaluation, an optimizer failure, or a fit that exhausts its
/// iteration bound above the gradient tolerance.
pub(crate) fn fit(training: TrainingSet<'_>, config: FitConfig) -> Result<Fit, FitError> {
    config.validate()?;

    let folds = grouped_folds(training.rows(), config.folds, config.seed)?;

    // Fold index `config.folds` holds nothing out: it is the final
    // full-corpus model, fitted in parallel with the fold models.
    let mut models: Vec<_> = (0..=config.folds)
        .into_par_iter()
        .map(|fold| {
            let held_out = (fold < config.folds).then_some(fold);
            objective::fit_model(training, &folds, held_out, config)
        })
        .collect::<Result<_, _>>()?;

    let (final_parameters, iterations) = models.pop().unwrap_or_else(|| {
        unreachable!("one model is fitted per fold plus the final full-corpus model")
    });

    let mut out_of_fold_logits = vec![[f64::NAN; GeometryClass::COUNT]; training.len()];
    for (row, logits) in out_of_fold_logits.iter_mut().enumerate() {
        let (parameters, _) = &models[folds[row]];
        *logits = objective::logits(parameters, training.embedding(row));
    }

    if out_of_fold_logits
        .iter()
        .flatten()
        .any(|value| !value.is_finite())
    {
        return Err(FitError::NonFinite);
    }

    let temperature = calibration::fit_temperature(training.rows(), &out_of_fold_logits);
    let metrics = calibration::metrics(training.rows(), &out_of_fold_logits, temperature);
    let applicability = applicability::fit_applicability(training)?;

    let (coefficients, intercepts) = split_parameters(&final_parameters);
    Ok(Fit {
        classifier: Classifier {
            coefficients,
            intercepts,
            temperature,
            applicability,
        },
        evidence: FitEvidence {
            folds: folds.into_boxed_slice(),
            out_of_fold_logits: out_of_fold_logits.into_boxed_slice(),
            raw_cross_entropy: metrics.raw_cross_entropy,
            calibrated_cross_entropy: metrics.calibrated_cross_entropy,
            raw_brier: metrics.raw_brier,
            calibrated_brier: metrics.calibrated_brier,
            iterations,
        },
    })
}

/// Copies a flat parameter vector into per-class coefficient rows and intercepts.
fn split_parameters(
    parameters: &Parameters,
) -> (
    [BoxedDVecN<CANONICAL_DIMENSIONS>; GeometryClass::COUNT],
    [f64; GeometryClass::COUNT],
) {
    let (rows, intercepts) = parameters.as_array().as_chunks::<CANONICAL_DIMENSIONS>();
    let coefficients = core::array::from_fn(|class| BoxedDVecN::new(DVecN::from_ref(&rows[class])));

    let intercepts = *intercepts
        .as_array()
        .unwrap_or_else(|| unreachable!("the parameter tail holds one intercept per class"));

    (coefficients, intercepts)
}

/// Assigns whole groups to seeded, size-balanced folds.
///
/// Groups are placed largest first onto the currently smallest fold; equal sizes break by a seeded
/// hash of the group digest and then by the digest itself, so the assignment is deterministic and
/// independent of row order.
fn grouped_folds(
    rows: &[TrainingRow],
    fold_count: usize,
    seed: u64,
) -> Result<Vec<usize>, FitError> {
    let mut groups = HashMap::<Sha256Digest, Vec<usize>>::new();
    for (index, row) in rows.iter().enumerate() {
        groups.entry(row.group).or_default().push(index);
    }

    if groups.len() < fold_count {
        return Err(FitError::InsufficientGroups {
            groups: groups.len(),
            folds: fold_count,
        });
    }

    // Priorities are precomputed: hashing inside the comparator would
    // recompute two digests per comparison.
    let mut ordered: Vec<_> = groups
        .into_iter()
        .map(|(group, group_rows)| (group_priority(group, seed), group, group_rows))
        .collect();
    ordered.sort_unstable_by(
        |(left_priority, left_group, left_rows), (right_priority, right_group, right_rows)| {
            right_rows
                .len()
                .cmp(&left_rows.len())
                .then_with(|| left_priority.cmp(right_priority))
                .then_with(|| left_group.cmp(right_group))
        },
    );

    let mut sizes = vec![0_usize; fold_count];
    let mut assignments = vec![0_usize; rows.len()];
    for (_, _, group_rows) in ordered {
        let fold = (0..fold_count)
            .min_by_key(|&fold| (sizes[fold], fold))
            .unwrap_or_else(|| unreachable!("the validated fold count is at least 2"));

        for row in &group_rows {
            assignments[*row] = fold;
        }

        sizes[fold] += group_rows.len();
    }

    Ok(assignments)
}

/// Seeded fold-assignment priority of a group.
#[expect(
    clippy::little_endian_bytes,
    reason = "the priority preimage is pinned to canonical little-endian bytes on every platform"
)]
fn group_priority(group: Sha256Digest, seed: u64) -> Sha256Digest {
    let mut hasher = Sha256::new();
    hasher.update(b"salt-policy-classifier-fold-v1");
    hasher.update(&seed.to_le_bytes());
    hasher.update(&group.to_bytes());
    hasher.finalize()
}
