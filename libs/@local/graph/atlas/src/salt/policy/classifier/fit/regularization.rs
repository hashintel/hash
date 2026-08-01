//! Regularization-strength selection by grouped cross-validation.
//!
//! [`select`] fits one model per candidate strength and fold over the shared seeded fold
//! assignment. It scores every candidate by the weighted-mean out-of-fold cross-entropy of its
//! uncalibrated posteriors and picks the minimizer. An exact tie prefers the stronger penalty. The
//! fit evidence records the full curve alongside the winner, so a reader sees the plateau the
//! selection stood on.
//!
//! The candidate grid never changes. The preparation scaling normalizes coefficient coordinates
//! before the solver sees any candidate, so the parity strength `1.0` is the natural center and the
//! grid brackets it by three decades either side in a logarithmic 1-3 progression.

use core::{
    iter,
    sync::atomic::{Atomic, Ordering},
};

use hashql_core::id::{IdSlice, IdVec};
use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};

use super::{
    FitConfig, FitError, TrainingSet, calibration, fit_model, objective,
    solver::{Gram, WorkCounters},
};
use crate::{identity::CardRow, math::DPositive, progress::Progress, salt::policy::GeometryClass};

/// The candidate strengths, ascending.
pub(super) const CANDIDATES: [DPositive; 13] = {
    const fn strength(value: f64) -> DPositive {
        DPositive::new(value).expect("the candidate is finite and positive")
    }

    [
        strength(1.0e-3),
        strength(3.0e-3),
        strength(1.0e-2),
        strength(3.0e-2),
        strength(0.1),
        strength(0.3),
        strength(1.0),
        strength(3.0),
        strength(10.0),
        strength(30.0),
        strength(100.0),
        strength(300.0),
        strength(1.0e3),
    ]
};

/// One candidate's measured out-of-fold quality.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize)]
pub(crate) struct RegularizationReading {
    /// The candidate L2 penalty on contrast coefficients.
    pub regularization: f64,
    /// The candidate's weighted-mean out-of-fold cross-entropy of the uncalibrated posteriors.
    pub cross_entropy: f64,
}

/// The winning strength and the evidence that chose it.
pub(super) struct Selection {
    /// The winning candidate's strength.
    pub regularization: DPositive,
    /// Every candidate's reading, ascending by strength.
    pub curve: Box<[RegularizationReading]>,
    /// The winning candidate's out-of-fold logits per training row, in class order.
    pub out_of_fold_logits: IdVec<CardRow, [f64; GeometryClass::COUNT]>,
}

/// Returns the position of the minimum cross-entropy, with an exact tie going to the stronger
/// penalty.
pub(super) fn winner(curve: &[RegularizationReading]) -> usize {
    let mut winner = 0;
    for (candidate, reading) in curve.iter().enumerate() {
        if reading.cross_entropy <= curve[winner].cross_entropy {
            winner = candidate;
        }
    }

    winner
}

/// Selects the deployment regularization strength over the shared fold assignment.
///
/// Every `(candidate, fold)` model fits in parallel; a fold reports completed to `progress` when
/// its last candidate lands, so the fold counter keeps its meaning under the widened wave.
///
/// # Errors
///
/// Returns [`FitError::Preparation`] or [`FitError::Solver`] when any candidate's fold model
/// fails, and [`FitError::NonFinite`] when an out-of-fold evaluation leaves the finite domain.
pub(super) fn select<P: Progress + Sync>(
    training: TrainingSet<'_>,
    folds: &IdSlice<CardRow, usize>,
    config: FitConfig,
    gram: &Gram,
    progress: &P,
) -> Result<Selection, FitError> {
    let pending: Vec<_> = iter::repeat_with(|| Atomic::<usize>::new(CANDIDATES.len()))
        .take(config.folds)
        .collect();

    let pairs: Vec<(usize, usize)> = (0..CANDIDATES.len())
        .flat_map(|candidate| (0..config.folds).map(move |fold| (candidate, fold)))
        .collect();

    // Rayon's collect preserves input order: candidate-major, fold-minor.
    let models: Vec<_> = pairs
        .into_par_iter()
        .map(|(candidate, fold)| {
            let mut candidate_config = config;
            candidate_config.solver.preparation.regularization = CANDIDATES[candidate];
            let (parameters, _) = fit_model(
                training,
                folds,
                Some(fold),
                candidate_config,
                gram,
                WorkCounters::default(),
            )?;

            if pending[fold].fetch_sub(1, Ordering::AcqRel) == 1 {
                progress.classifier_fold_completed(fold);
            }

            Ok(parameters)
        })
        .collect::<Result<_, _>>()?;

    let mut curve = Vec::with_capacity(CANDIDATES.len());
    let mut winning_logits = IdVec::new();
    for (candidate, chunk) in models.chunks_exact(config.folds).enumerate() {
        let mut logits: IdVec<CardRow, _> =
            IdVec::from_elem([f64::NAN; GeometryClass::COUNT], training.len());
        for (row, values) in logits.iter_enumerated_mut() {
            *values = objective::logits(&chunk[folds[row]], training.embedding(row));
        }

        if logits.iter().flatten().any(|value| !value.is_finite()) {
            return Err(FitError::NonFinite);
        }

        let cross_entropy = calibration::raw_cross_entropy(training.rows(), &logits);
        if !cross_entropy.is_finite() {
            return Err(FitError::NonFinite);
        }

        curve.push(RegularizationReading {
            regularization: CANDIDATES[candidate].get(),
            cross_entropy,
        });

        if winner(&curve) == candidate {
            winning_logits = logits;
        }
    }

    let winner = winner(&curve);
    Ok(Selection {
        regularization: CANDIDATES[winner],
        curve: curve.into_boxed_slice(),
        out_of_fold_logits: winning_logits,
    })
}
