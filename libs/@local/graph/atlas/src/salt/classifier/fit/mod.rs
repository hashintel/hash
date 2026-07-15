//! Deterministic soft-target classifier fitting and grouped validation.
//!
//! The deployed linear model minimizes weighted multinomial cross-entropy with
//! L2-regularized coefficients and unregularized intercepts. Whole relation
//! families are assigned to size-balanced folds before fitting; out-of-fold
//! logits calibrate one scalar deployment temperature. Applicability is fitted
//! independently from the complete training embedding distribution.

mod applicability;
mod calibration;
mod optimizer;

use core::simd::{f32x8, f64x8, num::SimdFloat as _};
use std::{collections::HashMap, num::NonZeroUsize};

use self::{
    applicability::fit_applicability,
    calibration::{fit_temperature, metrics},
    optimizer::fit_model,
};
use super::error::{ClassifierError, ClassifierFitError};
use crate::salt::{
    hash::{ContentHash, ContentHasher},
    representation::{CANONICAL_DIMENSIONS, CanonicalEmbedding},
    simd::mul_add_f64x8,
};

const CLASS_COUNT: usize = 3;
const SIMD_LANES: usize = 8;
const SIMD_CHUNKS: usize = CANONICAL_DIMENSIONS / SIMD_LANES;
const _: () = assert!(CANONICAL_DIMENSIONS.is_multiple_of(SIMD_LANES * 2));

/// One soft label, vote weight, and indivisible validation family.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ClassifierTrainingRow {
    pub target: [f64; CLASS_COUNT],
    pub vote_weight: f64,
    pub family: ContentHash,
}

/// Validated borrowed full-dimensional classifier training data.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ClassifierTrainingSet<'training> {
    embeddings: &'training [f32],
    rows: &'training [ClassifierTrainingRow],
}

impl<'training> ClassifierTrainingSet<'training> {
    /// Validates row-major embeddings and weighted soft labels.
    ///
    /// # Errors
    ///
    /// This returns an error for empty or incomplete embeddings, non-finite
    /// components, invalid probabilities, or non-positive vote weights.
    pub(crate) fn new(
        embeddings: &'training [f32],
        rows: &'training [ClassifierTrainingRow],
    ) -> Result<Self, ClassifierFitError> {
        if rows.is_empty() {
            return Err(ClassifierFitError::EmptyTrainingSet);
        }
        let expected = rows.len().checked_mul(CANONICAL_DIMENSIONS).ok_or(
            ClassifierFitError::EmbeddingLength {
                rows: rows.len(),
                actual: embeddings.len(),
                expected: usize::MAX,
            },
        )?;
        if embeddings.len() != expected {
            return Err(ClassifierFitError::EmbeddingLength {
                rows: rows.len(),
                actual: embeddings.len(),
                expected,
            });
        }
        if embeddings.iter().any(|value| !value.is_finite()) {
            return Err(ClassifierFitError::NonFiniteObjective);
        }
        for (row_index, row) in rows.iter().enumerate() {
            let mut sum = 0.0;
            for (class, value) in row.target.into_iter().enumerate() {
                if !value.is_finite() || value.is_sign_negative() || value > 1.0 {
                    return Err(ClassifierFitError::InvalidTarget {
                        row: row_index,
                        class,
                        value,
                    });
                }
                sum += value;
            }
            if (sum - 1.0).abs() > 1.0e-9 {
                return Err(ClassifierFitError::InvalidTargetSum {
                    row: row_index,
                    sum,
                });
            }
            if !row.vote_weight.is_finite() || row.vote_weight <= 0.0 {
                return Err(ClassifierFitError::InvalidWeight {
                    row: row_index,
                    value: row.vote_weight,
                });
            }
        }
        Ok(Self { embeddings, rows })
    }

    #[inline]
    pub(super) fn embedding(self, row: usize) -> &'training [f32; CANONICAL_DIMENSIONS] {
        let start = row * CANONICAL_DIMENSIONS;
        self.embeddings[start..start + CANONICAL_DIMENSIONS]
            .try_into()
            .expect("validated row bounds should be complete")
    }

    #[inline]
    pub(super) const fn rows(self) -> &'training [ClassifierTrainingRow] {
        self.rows
    }

    #[inline]
    pub(super) const fn len(self) -> usize {
        self.rows.len()
    }
}

/// Deterministic optimizer and grouped-validation settings.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ClassifierFitConfig {
    /// L2 penalty coefficient `λ` multiplying `‖W‖² / 2`.
    pub regularization: f64,
    pub maximum_iterations: NonZeroUsize,
    pub gradient_tolerance: f64,
    pub history_size: NonZeroUsize,
    pub folds: NonZeroUsize,
    pub seed: u64,
}

impl ClassifierFitConfig {
    fn validate(self) -> Result<(), ClassifierFitError> {
        for (field, value) in [
            ("regularization", self.regularization),
            ("gradient_tolerance", self.gradient_tolerance),
        ] {
            if !value.is_finite() || value <= 0.0 {
                return Err(ClassifierFitError::InvalidConfig { field, value });
            }
        }
        if self.folds.get() < 2 {
            return Err(ClassifierFitError::InvalidConfig {
                field: "folds",
                value: self.folds.get() as f64,
            });
        }
        Ok(())
    }
}

/// Owned deployed classifier and fitting evidence.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct FittedClassifier {
    pub coefficients: Box<[f64]>,
    pub intercepts: [f64; CLASS_COUNT],
    pub temperature: f64,
    pub applicability_mean: Box<[f64]>,
    pub applicability_inverse_scales: Box<[f64]>,
    pub applicability_training_distances: Box<[f64]>,
    pub optimizer_iterations: usize,
    pub validation: ClassifierValidation,
}

/// Raw and calibrated probabilities with independent applicability evidence.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct FittedClassifierScore {
    pub logits: [f64; CLASS_COUNT],
    pub raw: [f64; CLASS_COUNT],
    pub calibrated: [f64; CLASS_COUNT],
    pub distance: f64,
    pub applicability: f64,
}

impl FittedClassifier {
    /// Scores one full-dimensional embedding from owned fitted parameters.
    ///
    /// # Errors
    ///
    /// This returns an error when finite inputs and parameters overflow.
    pub(crate) fn score(
        &self,
        embedding: CanonicalEmbedding<'_>,
    ) -> Result<FittedClassifierScore, ClassifierError> {
        let (input, remainder) = embedding.as_array().as_chunks::<SIMD_LANES>();
        debug_assert!(remainder.is_empty());
        let (coefficients, remainder) = self.coefficients.as_chunks::<SIMD_LANES>();
        debug_assert!(remainder.is_empty());
        let (mean, remainder) = self.applicability_mean.as_chunks::<SIMD_LANES>();
        debug_assert!(remainder.is_empty());
        let (inverse_scales, remainder) =
            self.applicability_inverse_scales.as_chunks::<SIMD_LANES>();
        debug_assert!(remainder.is_empty());

        let zero = f64x8::splat(0.0);
        let mut logits = [[zero; 2]; CLASS_COUNT];
        let mut distance = [zero; 2];
        for index in 0..SIMD_CHUNKS {
            let input: f64x8 = f32x8::from_array(input[index]).cast();
            for class in 0..CLASS_COUNT {
                logits[class][index & 1] = mul_add_f64x8(
                    input,
                    f64x8::from_array(coefficients[class * SIMD_CHUNKS + index]),
                    logits[class][index & 1],
                );
            }
            let centered =
                (input - f64x8::from_array(mean[index])) * f64x8::from_array(inverse_scales[index]);
            distance[index & 1] = mul_add_f64x8(centered, centered, distance[index & 1]);
        }
        let logits = core::array::from_fn(|class| {
            (logits[class][0] + logits[class][1]).reduce_sum() + self.intercepts[class]
        });
        const DIMENSION_F64: f64 = 3072.0;
        let distance = ((distance[0] + distance[1]).reduce_sum() / DIMENSION_F64).sqrt();
        if !distance.is_finite() || logits.iter().any(|value| !value.is_finite()) {
            return Err(ClassifierError::NonFiniteOutput);
        }
        let raw = score_softmax(logits, 1.0);
        let calibrated = score_softmax(logits, self.temperature);
        let insertion = self
            .applicability_training_distances
            .partition_point(|training| *training < distance);
        #[expect(
            clippy::cast_precision_loss,
            reason = "classifier training sets are bounded far below f64 integer precision"
        )]
        let applicability =
            1.0 - insertion as f64 / self.applicability_training_distances.len() as f64;
        Ok(FittedClassifierScore {
            logits,
            raw,
            calibrated,
            distance,
            applicability,
        })
    }
}

/// Grouped out-of-fold discrimination and calibration evidence.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ClassifierValidation {
    pub folds: Box<[u16]>,
    pub logits: Box<[[f64; CLASS_COUNT]]>,
    pub raw_cross_entropy: f64,
    pub calibrated_cross_entropy: f64,
    pub raw_brier: f64,
    pub calibrated_brier: f64,
}

/// Fits the deployment model, grouped calibration, and applicability state.
///
/// # Errors
///
/// This returns an error for invalid configuration, too few relation families,
/// a fold without all class mass, non-finite optimization, failed line search,
/// or failure to converge within the configured iteration bound.
pub(crate) fn fit_classifier(
    training: ClassifierTrainingSet<'_>,
    config: ClassifierFitConfig,
) -> Result<FittedClassifier, ClassifierFitError> {
    config.validate()?;
    let folds = grouped_folds(training.rows(), config.folds.get(), config.seed)?;
    let all_indices = (0..training.len()).collect::<Vec<_>>();
    let mut out_of_fold_logits = vec![[f64::NAN; CLASS_COUNT]; training.len()];

    for fold in 0..config.folds.get() {
        let fitting = all_indices
            .iter()
            .copied()
            .filter(|&row| usize::from(folds[row]) != fold)
            .collect::<Vec<_>>();
        let validation = all_indices
            .iter()
            .copied()
            .filter(|&row| usize::from(folds[row]) == fold)
            .collect::<Vec<_>>();
        let model = fit_model(training, &fitting, config)?;
        for row in validation {
            out_of_fold_logits[row] = model.logits(training.embedding(row));
        }
    }
    if out_of_fold_logits
        .iter()
        .flatten()
        .any(|value| !value.is_finite())
    {
        return Err(ClassifierFitError::NonFiniteObjective);
    }

    let temperature = fit_temperature(training.rows(), &out_of_fold_logits);
    let validation_metrics = metrics(training.rows(), &out_of_fold_logits, temperature);
    let model = fit_model(training, &all_indices, config)?;
    let applicability = fit_applicability(training, &all_indices)?;
    Ok(FittedClassifier {
        coefficients: model.coefficients,
        intercepts: model.intercepts,
        temperature,
        applicability_mean: applicability.mean,
        applicability_inverse_scales: applicability.inverse_scales,
        applicability_training_distances: applicability.distances,
        optimizer_iterations: model.iterations,
        validation: ClassifierValidation {
            folds: folds.into_boxed_slice(),
            logits: out_of_fold_logits.into_boxed_slice(),
            raw_cross_entropy: validation_metrics.raw_cross_entropy,
            calibrated_cross_entropy: validation_metrics.calibrated_cross_entropy,
            raw_brier: validation_metrics.raw_brier,
            calibrated_brier: validation_metrics.calibrated_brier,
        },
    })
}

fn grouped_folds(
    rows: &[ClassifierTrainingRow],
    fold_count: usize,
    seed: u64,
) -> Result<Vec<u16>, ClassifierFitError> {
    let mut families = HashMap::<ContentHash, Vec<usize>>::new();
    for (index, row) in rows.iter().enumerate() {
        families.entry(row.family).or_default().push(index);
    }
    if families.len() < fold_count {
        return Err(ClassifierFitError::InsufficientFamilies {
            families: families.len(),
            folds: fold_count,
        });
    }
    let mut ordered = families.into_iter().collect::<Vec<_>>();
    ordered.sort_unstable_by(|(left_family, left_rows), (right_family, right_rows)| {
        right_rows
            .len()
            .cmp(&left_rows.len())
            .then_with(|| {
                family_priority(*left_family, seed).cmp(&family_priority(*right_family, seed))
            })
            .then_with(|| left_family.cmp(right_family))
    });

    let mut sizes = vec![0_usize; fold_count];
    let mut assignments = vec![0_u16; rows.len()];
    for (_, family_rows) in ordered {
        let fold = (0..fold_count)
            .min_by_key(|&fold| (sizes[fold], fold))
            .expect("validated fold count should be non-zero");
        let fold_u16 = u16::try_from(fold).map_err(|_| ClassifierFitError::InvalidConfig {
            field: "folds",
            value: fold_count as f64,
        })?;
        for row in &family_rows {
            assignments[*row] = fold_u16;
        }
        sizes[fold] += family_rows.len();
    }
    Ok(assignments)
}

fn family_priority(family: ContentHash, seed: u64) -> ContentHash {
    let mut hasher = ContentHasher::new(b"salt-classifier-family-fold-v1");
    hasher.update(&seed.to_le_bytes());
    hasher.update(family.as_bytes());
    hasher.finish()
}

#[inline]
fn score_softmax(logits: [f64; CLASS_COUNT], temperature: f64) -> [f64; CLASS_COUNT] {
    let maximum = logits.into_iter().fold(f64::NEG_INFINITY, f64::max);
    let exponentials = logits.map(|value| ((value - maximum) / temperature).exp());
    let denominator = exponentials.into_iter().sum::<f64>();
    exponentials.map(|value| value / denominator)
}
