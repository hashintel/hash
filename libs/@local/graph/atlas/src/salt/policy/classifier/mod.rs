//! The open-world relation-policy classifier.
//!
//! The annotation corpus bootstraps a shared model. It is not an enumeration of the production type
//! universe. Classification covers every relation type without a higher-precedence explicit policy
//! record, including types the corpus never saw. That is the open-world contract, and the
//! applicability score below is its safety valve.
//!
//! [`Classifier`] evaluates a three-class linear model over the full 3,072-component relation-card
//! embedding. For embedding `e`, coefficient rows `W`, intercepts `b`, and calibration temperature
//! `T`, prediction computes
//!
//! ```text
//! logits = W e + b
//! raw = softmax(logits)
//! calibrated = softmax(logits / T)
//! ```
//!
//! Applicability is evidence about the embedding, independent of the class probabilities: the
//! standardized diagonal-Mahalanobis distance of `e` from the training distribution, ranked against
//! the sorted training distances,
//!
//! ```text
//! distance = √(mean(((e - mean) · inverse_scale)^2))
//! applicability = 1 - lower_bound(training_distances, distance) / N.
//! ```
//!
//! Lower-bound rank semantics keep an embedding that ties a training distance exactly applicable.
//! How the score mixes a prediction toward Overlay is precedence resolution's contract, not the
//! classifier's.
//!
//! [`fit()`] trains the model from a weighted soft-label corpus. Raw and calibrated posteriors stay
//! separate in [`Prediction`], so a caller cannot apply calibration twice.
//!
//! Inputs are `f32` data widened to `f64` at the arithmetic seams ([`AlignedVecN::dot_wide`]);
//! parameters and outputs live in `f64`.

use core::{
    error::Error,
    fmt,
    simd::{f64x8, num::SimdFloat as _},
};

use super::{GeometryClass, Posterior};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    math::{AlignedDVecN, AlignedVecN, BoxedDVecN, UnitFraction, kernel::mul_add_f64x8},
};

pub(crate) mod artifact;
pub(crate) mod fit;
pub(crate) mod report;

#[cfg(test)]
mod tests;

#[expect(
    unused_imports,
    reason = "the generation runner and precedence resolution consume the fit surface"
)]
pub(crate) use self::fit::{
    Fit, FitConfig, FitError, FitEvidence, NewtonStage, PreparationError, PreparationSettings,
    SolverConfig, SolverConfigError, SolverFailure, TrainingRow, TrainingSet, TrainingSetError,
    fit,
};

const _: () = assert!(CANONICAL_DIMENSIONS.is_multiple_of(8));

/// A prediction overflowed into a non-finite logit or distance.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PredictError;

impl fmt::Display for PredictError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("the prediction produced a non-finite logit or distance")
    }
}

impl Error for PredictError {}

/// Applicability evidence fitted from the training distribution.
///
/// `inverse_scales` components are positive, and `distances` is non-empty, nonnegative, and
/// ascending. [`fit()`] and validated artifact reads are the construction sites.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Applicability {
    mean: BoxedDVecN<CANONICAL_DIMENSIONS>,
    inverse_scales: BoxedDVecN<CANONICAL_DIMENSIONS>,
    distances: Box<[f64]>,
}

/// The fitted policy classifier.
///
/// Coefficient rows follow class order. All parameters are finite and the temperature is positive;
/// [`fit()`] and validated artifact reads are the construction sites.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Classifier {
    coefficients: [BoxedDVecN<CANONICAL_DIMENSIONS>; GeometryClass::COUNT],
    intercepts: [f64; GeometryClass::COUNT],
    temperature: f64,

    applicability: Applicability,
}

/// One classified relation-card embedding.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct Prediction {
    /// Raw class logits in class order.
    pub logits: [f64; GeometryClass::COUNT],
    /// The uncalibrated distribution `softmax(logits)`.
    pub raw: Posterior,
    /// The deployment distribution `softmax(logits / T)`.
    pub calibrated: Posterior,
    /// Standardized distance from the training distribution.
    pub distance: f64,
    /// Upper-tail rank of `distance` among the training distances, in `[0, 1]`.
    pub applicability: UnitFraction,
}

impl Classifier {
    /// Returns the fitted calibration temperature.
    #[inline]
    #[must_use]
    pub(crate) const fn temperature(&self) -> f64 {
        self.temperature
    }

    /// Classifies one relation-card embedding.
    ///
    /// # Errors
    ///
    /// Returns [`PredictError`] when finite inputs and parameters overflow during evaluation.
    ///
    /// # Complexity
    ///
    /// Runs in `O(D)` time for `D = 3072` and constant additional space.
    pub(crate) fn predict(
        &self,
        embedding: &AlignedVecN<CANONICAL_DIMENSIONS>,
    ) -> Result<Prediction, PredictError> {
        let logits = core::array::from_fn(|class| {
            embedding.dot_wide(&self.coefficients[class]) + self.intercepts[class]
        });

        let distance = standardized_distance(
            embedding,
            &self.applicability.mean,
            &self.applicability.inverse_scales,
        );
        if !distance.is_finite() || logits.iter().any(|value| !value.is_finite()) {
            return Err(PredictError);
        }

        let insertion = self
            .applicability
            .distances
            .partition_point(|training| *training < distance);

        // `partition_point` keeps the insertion index at or below the length, so the ratio is a
        // fraction by construction and only an empty distribution refuses.
        let applicability =
            UnitFraction::ratio(insertion as u64, self.applicability.distances.len() as u64)
                .expect("a fitted classifier holds a nonempty training distance distribution")
                .complement();

        Ok(Prediction {
            logits,
            raw: Posterior::softmax(logits, 1.0),
            calibrated: Posterior::softmax(logits, self.temperature),
            distance,
            applicability,
        })
    }
}

/// Standardized diagonal-Mahalanobis distance of an embedding from a fitted training distribution.
///
/// Computes `√(mean(((e - mean) · inverse_scale)^2))`, accumulated in double precision over two
/// independent chains.
fn standardized_distance(
    embedding: &AlignedVecN<CANONICAL_DIMENSIONS>,
    mean: &AlignedDVecN<CANONICAL_DIMENSIONS>,
    inverse_scales: &AlignedDVecN<CANONICAL_DIMENSIONS>,
) -> f64 {
    let (embedding, embedding_rest) = embedding.lanes();
    let (mean, mean_rest) = mean.lanes();
    let (inverse_scales, scales_rest) = inverse_scales.lanes();
    debug_assert!(embedding_rest.is_empty() && mean_rest.is_empty() && scales_rest.is_empty());

    let mut sums = [f64x8::splat(0.0); 2];

    for (index, ((components, mean), inverse_scale)) in
        embedding.iter().zip(mean).zip(inverse_scales).enumerate()
    {
        let standardized = (components.cast::<f64>() - mean) * inverse_scale;
        sums[index & 1] = mul_add_f64x8(standardized, standardized, sums[index & 1]);
    }

    #[expect(
        clippy::cast_precision_loss,
        reason = "the dimension count is far below f64 integer precision"
    )]
    let dimensions = CANONICAL_DIMENSIONS as f64;
    ((sums[0] + sums[1]).reduce_sum() / dimensions).sqrt()
}
