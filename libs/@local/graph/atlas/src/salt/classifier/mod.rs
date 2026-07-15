//! Calibrated relation-policy classifier inference.
//!
//! [`ClassifierView`] evaluates a three-class linear model over the full
//! 3,072-component relation-card embedding. Classes are ordered Coincident,
//! Proximal and Overlay. For embedding `e`, coefficient matrix `W`, intercept
//! vector `b` and scalar temperature `T`, inference computes:
//!
//! ```text
//! logits = W * e + b
//! raw = softmax(logits)
//! calibrated = softmax(logits / T)
//! ```
//!
//! Applicability is independent of the class probabilities. Given fitted mean
//! `mean`, inverse scales `scale` and dimension `D`, the standardized distance
//! is:
//!
//! ```text
//! distance = sqrt(sum(((e[k] - mean[k]) * scale[k])^2) / D)
//! applicability = 1 - lower_bound(training_distances, distance) / N
//! ```
//!
//! `training_distances` is sorted ascending, so exact training-distance ties
//! remain applicable through lower-bound semantics.
//!
//! # Artifact contract
//!
//! [`CLASSIFIER_FORMAT`] contains seven 64-byte-aligned sections:
//!
//! 1. class order as three [`u8`] values;
//! 2. row-major `3 x 3072` [`f64`] coefficients;
//! 3. three [`f64`] intercepts;
//! 4. one positive [`f64`] temperature;
//! 5. 3,072 [`f64`] applicability means;
//! 6. 3,072 positive [`f64`] inverse scales; and
//! 7. one non-empty sorted [`f64`] training-distance vector.
//!
//! Shapes, scalar types, finiteness, positivity and ordering are validated
//! before any section is exposed as a classifier.
//!
//! # Numerical behavior
//!
//! Input [`f32`] values are widened to [`f64`]. Prediction uses a fixed
//! reduction order, constant additional space and no allocation. Targets with
//! native FMA may differ in their final bits from targets that evaluate
//! multiplication and addition separately. Non-finite intermediate results
//! fail the prediction instead of entering policy resolution.

use core::simd::{f32x8, f64x8, num::SimdFloat as _};

use crate::salt::{
    format::CLASSIFIER_FORMAT,
    policy::{PlacementClass, PlacementPosterior, Probability},
    representation::{CANONICAL_DIMENSIONS, CanonicalEmbedding},
    simd::mul_add_f64x8,
    storage::mmap::{ArtifactFormat, ArtifactView, SectionId, SectionView},
};

mod artifact;
mod error;
mod fit;

#[allow(
    unused_imports,
    reason = "classifier fitting and publication form the generation adapter surface"
)]
pub(crate) use self::{
    artifact::{publish_fitted_classifier, publish_fitted_classifier_with_format},
    error::{ClassifierError, ClassifierFitError},
    fit::{
        ClassifierFitConfig, ClassifierTrainingRow, ClassifierTrainingSet, FittedClassifier,
        FittedClassifierScore, fit_classifier,
    },
};

const CLASS_COUNT: usize = 3;
const SECTION_COUNT: u32 = 7;
const CLASS_ORDER: SectionId = SectionId::new(1);
const COEFFICIENTS: SectionId = SectionId::new(2);
const INTERCEPTS: SectionId = SectionId::new(3);
const TEMPERATURE: SectionId = SectionId::new(4);
const APPLICABILITY_MEAN: SectionId = SectionId::new(5);
const APPLICABILITY_INVERSE_SCALES: SectionId = SectionId::new(6);
const APPLICABILITY_TRAINING_DISTANCES: SectionId = SectionId::new(7);
const SIMD_LANES: usize = 8;
const CHUNKS: usize = CANONICAL_DIMENSIONS / SIMD_LANES;

const _: () = assert!(CANONICAL_DIMENSIONS.is_multiple_of(SIMD_LANES * 2));

/// Classifier probabilities and applicability evidence.
///
/// Raw and calibrated posteriors remain separate so calibration cannot be
/// applied twice. Applicability is likewise retained independently for
/// attraction and protection policy.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct ClassifierOutput {
    pub logits: [f64; CLASS_COUNT],
    pub raw: PlacementPosterior,
    pub calibrated: PlacementPosterior,
    pub distance: f64,
    pub applicability: Probability,
}

/// Validated classifier parameters that borrow their artifact storage.
///
/// Cloning this view copies only references. Parameter arrays remain immutable
/// for the lifetime of the view.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ClassifierView<'artifact> {
    coefficients: &'artifact [f64],
    intercepts: &'artifact [f64],
    temperature: f64,
    applicability_mean: &'artifact [f64],
    applicability_inverse_scales: &'artifact [f64],
    applicability_training_distances: &'artifact [f64],
}

impl<'artifact> ClassifierView<'artifact> {
    /// Validates and borrows classifier sections.
    ///
    /// # Errors
    ///
    /// This returns an error for an incompatible schema, missing or malformed
    /// sections, non-finite parameters, invalid scales, or unsorted distances.
    pub(crate) fn new(artifact: ArtifactView<'artifact>) -> Result<Self, ClassifierError> {
        Self::new_with_format(artifact, CLASSIFIER_FORMAT)
    }

    /// Validates classifier sections under a caller-selected model schema.
    ///
    /// # Errors
    ///
    /// This returns the same structural and numerical errors as [`Self::new`],
    /// additionally requiring `expected_format`.
    pub(crate) fn new_with_format(
        artifact: ArtifactView<'artifact>,
        expected_format: ArtifactFormat,
    ) -> Result<Self, ClassifierError> {
        let header = artifact.header();
        if header.format != expected_format {
            return Err(ClassifierError::Format {
                expected: expected_format,
                actual: header.format,
            });
        }
        if header.section_count != SECTION_COUNT {
            return Err(ClassifierError::SectionCount {
                expected: SECTION_COUNT,
                actual: header.section_count,
            });
        }

        let class_order = required(artifact, CLASS_ORDER)?;
        require_shape(class_order, [CLASS_COUNT as u64, 0, 0])?;
        if class_order.as_u8()?
            != [
                PlacementClass::Coincident as u8,
                PlacementClass::Proximal as u8,
                PlacementClass::Overlay as u8,
            ]
        {
            return Err(ClassifierError::ClassOrder);
        }

        let coefficients = required(artifact, COEFFICIENTS)?;
        require_shape(
            coefficients,
            [CLASS_COUNT as u64, CANONICAL_DIMENSIONS as u64, 0],
        )?;
        let coefficients = coefficients.as_f64()?;
        require_finite(COEFFICIENTS, coefficients)?;

        let intercepts = required(artifact, INTERCEPTS)?;
        require_shape(intercepts, [CLASS_COUNT as u64, 0, 0])?;
        let intercepts = intercepts.as_f64()?;
        require_finite(INTERCEPTS, intercepts)?;

        let temperature = required(artifact, TEMPERATURE)?;
        require_shape(temperature, [1, 0, 0])?;
        let temperature = temperature.as_f64()?[0];
        if !temperature.is_finite() {
            return Err(ClassifierError::NonFinite {
                section: TEMPERATURE,
                index: 0,
            });
        }
        if temperature <= 0.0 {
            return Err(ClassifierError::NonPositive {
                section: TEMPERATURE,
                index: 0,
            });
        }

        let applicability_mean = required(artifact, APPLICABILITY_MEAN)?;
        require_shape(applicability_mean, [CANONICAL_DIMENSIONS as u64, 0, 0])?;
        let applicability_mean = applicability_mean.as_f64()?;
        require_finite(APPLICABILITY_MEAN, applicability_mean)?;

        let applicability_inverse_scales = required(artifact, APPLICABILITY_INVERSE_SCALES)?;
        require_shape(
            applicability_inverse_scales,
            [CANONICAL_DIMENSIONS as u64, 0, 0],
        )?;
        let applicability_inverse_scales = applicability_inverse_scales.as_f64()?;
        require_positive(APPLICABILITY_INVERSE_SCALES, applicability_inverse_scales)?;

        let training = required(artifact, APPLICABILITY_TRAINING_DISTANCES)?;
        if training.descriptor.rank != 1
            || training.descriptor.shape[0] == 0
            || training.descriptor.shape[1..] != [0, 0]
        {
            return Err(ClassifierError::Shape {
                section: APPLICABILITY_TRAINING_DISTANCES,
                expected: [1, 0, 0],
                actual: training.descriptor.shape,
            });
        }
        let applicability_training_distances = training.as_f64()?;
        require_nonnegative_sorted(
            APPLICABILITY_TRAINING_DISTANCES,
            applicability_training_distances,
        )?;

        Ok(Self {
            coefficients,
            intercepts,
            temperature,
            applicability_mean,
            applicability_inverse_scales,
            applicability_training_distances,
        })
    }

    /// Returns the fitted calibration temperature.
    #[must_use]
    #[inline]
    pub(crate) const fn temperature(self) -> f64 {
        self.temperature
    }

    /// Evaluates calibrated placement probabilities and applicability.
    ///
    /// The complete canonical embedding participates in both the class logits
    /// and applicability distance. The returned applicability uses empirical
    /// survival with lower-bound tie handling.
    ///
    /// # Errors
    ///
    /// This returns an error when finite inputs and parameters overflow during
    /// inference.
    ///
    /// # Complexity
    ///
    /// This runs in `O(D)` time for `D = 3072`, uses constant additional space
    /// and does not allocate.
    pub(crate) fn predict(
        self,
        embedding: CanonicalEmbedding<'_>,
    ) -> Result<ClassifierOutput, ClassifierError> {
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
        let mut index = 0;
        while index + 2 <= CHUNKS {
            let input0: f64x8 = f32x8::from_array(input[index]).cast();
            let input1: f64x8 = f32x8::from_array(input[index + 1]).cast();
            for class in 0..CLASS_COUNT {
                let offset = class * CHUNKS + index;
                logits[class][0] = mul_add_f64x8(
                    input0,
                    f64x8::from_array(coefficients[offset]),
                    logits[class][0],
                );
                logits[class][1] = mul_add_f64x8(
                    input1,
                    f64x8::from_array(coefficients[offset + 1]),
                    logits[class][1],
                );
            }

            let centered0 = (input0 - f64x8::from_array(mean[index]))
                * f64x8::from_array(inverse_scales[index]);
            let centered1 = (input1 - f64x8::from_array(mean[index + 1]))
                * f64x8::from_array(inverse_scales[index + 1]);
            distance[0] = mul_add_f64x8(centered0, centered0, distance[0]);
            distance[1] = mul_add_f64x8(centered1, centered1, distance[1]);
            index += 2;
        }
        debug_assert_eq!(index, CHUNKS);

        let logits = core::array::from_fn(|class| {
            (logits[class][0] + logits[class][1]).reduce_sum() + self.intercepts[class]
        });
        let distance =
            ((distance[0] + distance[1]).reduce_sum() / CANONICAL_DIMENSIONS as f64).sqrt();
        if !distance.is_finite() || logits.iter().any(|value| !value.is_finite()) {
            return Err(ClassifierError::NonFiniteOutput);
        }

        let raw = softmax(logits, 1.0);
        let calibrated = softmax(logits, self.temperature);
        let insertion = self
            .applicability_training_distances
            .partition_point(|training| *training < distance);
        #[expect(
            clippy::cast_precision_loss,
            reason = "classifier training sets are constrained far below f64 integer precision"
        )]
        let applicability =
            1.0 - insertion as f64 / self.applicability_training_distances.len() as f64;
        let raw =
            PlacementPosterior::new(raw[0], raw[1], raw[2]).map_err(ClassifierError::Posterior)?;
        let calibrated = PlacementPosterior::new(calibrated[0], calibrated[1], calibrated[2])
            .map_err(ClassifierError::Posterior)?;
        let applicability =
            Probability::new(applicability).map_err(|_| ClassifierError::NonFiniteOutput)?;

        Ok(ClassifierOutput {
            logits,
            raw,
            calibrated,
            distance,
            applicability,
        })
    }
}

#[inline]
fn required(
    artifact: ArtifactView<'_>,
    section: SectionId,
) -> Result<SectionView<'_>, ClassifierError> {
    artifact
        .section(section)
        .ok_or(ClassifierError::MissingSection { section })
}

fn require_shape(section: SectionView<'_>, expected: [u64; 3]) -> Result<(), ClassifierError> {
    if section.descriptor.shape != expected {
        return Err(ClassifierError::Shape {
            section: section.descriptor.id,
            expected,
            actual: section.descriptor.shape,
        });
    }
    Ok(())
}

fn require_finite(section: SectionId, values: &[f64]) -> Result<(), ClassifierError> {
    if let Some(index) = values.iter().position(|value| !value.is_finite()) {
        return Err(ClassifierError::NonFinite { section, index });
    }
    Ok(())
}

fn require_positive(section: SectionId, values: &[f64]) -> Result<(), ClassifierError> {
    require_finite(section, values)?;
    if let Some(index) = values.iter().position(|value| *value <= 0.0) {
        return Err(ClassifierError::NonPositive { section, index });
    }
    Ok(())
}

fn require_nonnegative_sorted(section: SectionId, values: &[f64]) -> Result<(), ClassifierError> {
    require_finite(section, values)?;
    if let Some(index) = values.iter().position(|value| value.is_sign_negative()) {
        return Err(ClassifierError::Negative { section, index });
    }
    if let Some(index) = values.windows(2).position(|pair| pair[0] > pair[1]) {
        return Err(ClassifierError::Unsorted {
            section,
            index: index + 1,
        });
    }
    Ok(())
}

fn softmax(logits: [f64; CLASS_COUNT], temperature: f64) -> [f64; CLASS_COUNT] {
    let scaled = logits.map(|value| value / temperature);
    let maximum = scaled.into_iter().reduce(f64::max).unwrap_or(0.0);
    let exponents = scaled.map(|value| (value - maximum).exp());
    let total = exponents.iter().sum::<f64>();
    exponents.map(|value| value / total)
}

#[cfg(test)]
mod tests;
