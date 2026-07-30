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
//! through the deterministic bounded trust-region Newton-CG [`solver`], which operates in
//! contrast coordinates and certifies every solution against its gradient threshold. Whole
//! relation groups are assigned to seeded, size-balanced folds before fitting, so
//! near-duplicate corpus entries never straddle a train/validation split. The penalty strength
//! λ is selected over those folds ([`regularization`]): every candidate's fold models fit in
//! parallel, the minimum out-of-fold cross-entropy wins with an exact tie preferring the
//! stronger penalty, and the deployment model then fits at the winning strength over the
//! complete corpus. The winner's concatenated out-of-fold logits calibrate one scalar
//! deployment temperature ([`calibration`]), and the applicability distribution is fitted over
//! the complete corpus ([`applicability`]). Each fit's arithmetic is sequential and the fold
//! assignment is shared across candidates, so the result is deterministic. The out-of-fold
//! metrics judge the selected configuration on the same folds that chose it.
//!
//! Every fit must certify at the configured gradient threshold: a solve that ends at any typed
//! terminal - an exhausted budget, a stalled reduction, or arithmetic that left the finite
//! domain - is an error, never a best-effort model. An atlas generation requires a valid
//! classifier artifact and fails candidacy without one, so a questionable model must not be
//! published for the pipeline to limp on with.

use core::{error::Error, fmt};
use std::collections::HashMap;

use self::{
    objective::Parameters,
    regularization::RegularizationReading,
    solver::{ReceiptDetail, ScaledProblem, WorkCounters, prepare, solve},
};
use super::Classifier;
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{AlignedVecN, BoxedDVecN, DVecN, MatrixN},
    progress::Progress,
    salt::policy::GeometryClass,
};

mod applicability;
pub(crate) use self::solver::{
    CgStage, PreparationError, PreparationSettings, SolverConfig, SolverConfigError, SolverFailure,
};
mod calibration;
mod objective;
pub(crate) mod regularization;
pub(crate) mod solver;

#[cfg(test)]
mod tests;

/// A training input violated the corpus contract.
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum TrainingSetError {
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
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum FitError {
    /// The solver configuration violated a cross-field constraint.
    Config(SolverConfigError),
    /// The fold count cannot hold one validation portion out. At least 2 folds are required.
    FoldCount { folds: usize },
    /// Fewer distinct groups than requested folds.
    InsufficientGroups { groups: usize, folds: usize },
    /// A training portion violated the preparation contract.
    Preparation(PreparationError),
    /// The solve ended at a typed terminal instead of a certified minimizer.
    Solver(SolverFailure),
    /// An evaluation outside the solver produced a non-finite value.
    NonFinite,
}

#[expect(
    clippy::use_debug,
    reason = "the wrapped verdicts are typed vocabulary; their variant names are the message"
)]
impl fmt::Display for FitError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Config(error) => {
                write!(fmt, "the solver configuration is invalid: {error:?}")
            }
            Self::FoldCount { folds } => {
                write!(fmt, "{folds} validation folds cannot hold anything out")
            }
            Self::InsufficientGroups { groups, folds } => write!(
                fmt,
                "{groups} relation groups cannot fill {folds} validation folds",
            ),
            Self::Preparation(error) => {
                write!(fmt, "the training portion failed preparation: {error:?}")
            }
            Self::Solver(failure) => {
                write!(fmt, "the solve ended at the {failure:?} terminal")
            }
            Self::NonFinite => fmt.write_str("an evaluation produced a non-finite value"),
        }
    }
}

impl Error for FitError {}

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

/// Solver and grouped-validation settings.
///
/// The solver defaults are the deployment configuration, with the regularization strength
/// selected per fit ([`regularization`]); the out-of-fold metrics in [`FitEvidence`] judge the
/// selected configuration.
#[derive(Debug, Copy, Clone, PartialEq, Default)]
pub(crate) struct FitConfig {
    /// The bounded trust-region Newton-CG solver configuration, preparation knobs included.
    pub solver: SolverConfig = SolverConfig { .. },
    /// Grouped cross-validation fold count. At least 2.
    pub folds: usize = 5,
    /// Fold-assignment seed.
    pub seed: u64 = 0,
}

impl FitConfig {
    /// Admits the configuration or names the first violation.
    ///
    /// # Errors
    ///
    /// Returns [`FitError::Config`] for a solver configuration violating a cross-field
    /// constraint and [`FitError::FoldCount`] for fewer than two folds.
    pub(crate) fn validate(self) -> Result<(), FitError> {
        self.solver.validate().map_err(FitError::Config)?;

        if self.folds < 2 {
            return Err(FitError::FoldCount { folds: self.folds });
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
    /// The selected L2 penalty on contrast coefficients.
    pub regularization: f64,
    /// Every regularization candidate's out-of-fold reading, ascending by strength.
    pub selection: Box<[RegularizationReading]>,
    /// Weighted-mean cross-entropy of the uncalibrated posteriors.
    pub raw_cross_entropy: f64,
    /// Weighted-mean cross-entropy at the deployment temperature.
    pub calibrated_cross_entropy: f64,
    /// Weighted-mean Brier score of the uncalibrated posteriors.
    pub raw_brier: f64,
    /// Weighted-mean Brier score at the deployment temperature.
    pub calibrated_brier: f64,
    /// Started outer iterations of the final full-corpus fit.
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
/// Returns a [`FitError`] for invalid configuration, too few relation groups, a training
/// portion violating the preparation contract, a solve ending at a typed terminal, or a
/// non-finite out-of-fold evaluation.
///
/// The candidate fold fits are the long part of the stage and run in parallel; a fold reports
/// to `progress` when its last candidate lands, so completions arrive in whatever order the
/// pool finishes them.
pub(crate) fn fit<P: Progress + Sync>(
    training: TrainingSet<'_>,
    config: FitConfig,
    progress: &P,
) -> Result<Fit, FitError> {
    config.validate()?;

    let folds = grouped_folds(training.rows(), config.folds, config.seed)?;
    progress.classifier_started(config.folds);

    let selection = regularization::select(training, &folds, config, progress)?;
    progress.classifier_regularization_selected(selection.regularization.get());

    let mut deployment = config;
    deployment.solver.preparation.regularization = selection.regularization;
    let (final_parameters, iterations) = fit_model(training, &folds, None, deployment)?;

    let out_of_fold_logits = selection.out_of_fold_logits;
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
            regularization: selection.regularization.get(),
            selection: selection.curve,
            raw_cross_entropy: metrics.raw_cross_entropy,
            calibrated_cross_entropy: metrics.calibrated_cross_entropy,
            raw_brier: metrics.raw_brier,
            calibrated_brier: metrics.calibrated_brier,
            iterations,
        },
    })
}

/// Fits one model over the rows outside the held-out fold through the bounded solver.
///
/// Returns the flat class parameters and the count of started outer iterations.
///
/// # Errors
///
/// Returns [`FitError::Preparation`] when the training portion violates the preparation
/// contract and [`FitError::Solver`] when the solve ends at a typed terminal.
fn fit_model(
    training: TrainingSet<'_>,
    folds: &[usize],
    held_out: Option<usize>,
    config: FitConfig,
) -> Result<(Parameters, u64), FitError> {
    // The held-out fold's complement materializes densely: the solver
    // traverses whole corpora, and fold membership is not its contract.
    let subset = held_out.map(|held_out| {
        let members: Vec<usize> = folds
            .iter()
            .enumerate()
            .filter(|(_, fold)| **fold != held_out)
            .map(|(row, _)| row)
            .collect();

        let mut embeddings = MatrixN::zeroed(members.len());
        let embedding_rows = embeddings.rows_mut();
        let mut rows = Vec::with_capacity(members.len());
        for (position, &member) in members.iter().enumerate() {
            *embedding_rows[position].as_array_mut() = *training.embedding(member).as_array();
            rows.push(training.rows()[member]);
        }
        (embeddings, rows)
    });
    let (embeddings, rows) = subset.as_ref().map_or(
        (training.embeddings, training.rows),
        |(embeddings, rows)| (embeddings.rows(), rows.as_slice()),
    );

    let mut counters = WorkCounters::default();
    let prepared = prepare(embeddings, rows, config.solver.preparation, &mut counters)
        .map_err(FitError::Preparation)?;
    let problem = ScaledProblem {
        prepared,
        config: config.solver,
    };
    let run = solve(&problem, counters, ReceiptDetail::None);
    let converged = match run.outcome {
        Ok(converged) => converged,
        Err(failure) => {
            // The typed terminal, the candidate strength, the aggregate counters, and the fold
            // identity are the whole routine failure diagnostic; the probe replays `seed:fold`
            // when vectors are needed.
            tracing::error!(
                ?failure,
                ?held_out,
                regularization = config.solver.preparation.regularization.get(),
                outer_iterations_started = run.control.outer_iterations_started,
                counters = ?run.control.counters,
                "the classifier solve ended at a typed terminal",
            );
            return Err(FitError::Solver(failure));
        }
    };

    let point = problem.point(&converged.point.zeta);
    Ok((
        objective::expand_point(&point),
        run.control.outer_iterations_started,
    ))
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
