//! Applicability distribution fitting over the complete corpus.
//!
//! [`fit_applicability`] fits a per-dimension mean and a diagonal
//! variance shrunk toward the pooled variance,
//!
//! ```text
//! shrinkage = dimensions / (rows + dimensions),
//! ```
//!
//! which regularizes sparse high-dimensional samples while retaining
//! dimension-level scale where the sample supports it. The training
//! rows' own standardized distances are sorted and retained, so a
//! prediction's applicability is its empirical upper-tail rank: an
//! embedding far from everything the model was fitted on scores near
//! zero, flagging the prediction as unsupported. Applicability is not
//! a fourth geometry class; it is evidence about the embedding.

use super::{FitError, TrainingSet};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    math::{BoxedDVecN, VecN},
    salt::policy::classifier::{Applicability, standardized_distance},
};

/// Variance floor relative to the pooled variance.
const VARIANCE_RELATIVE_FLOOR: f64 = 1.0e-12;

/// Fits the applicability distribution over every training row.
///
/// # Errors
///
/// Returns [`FitError::NonFinite`] when a training distance overflows.
pub(super) fn fit_applicability(training: TrainingSet<'_>) -> Result<Applicability, FitError> {
    #[expect(
        clippy::cast_precision_loss,
        reason = "training corpora are bounded far below f64 integer precision"
    )]
    let count = training.len() as f64;
    #[expect(
        clippy::cast_precision_loss,
        reason = "the dimension count is far below f64 integer precision"
    )]
    let dimensions = CANONICAL_DIMENSIONS as f64;

    let mut mean = BoxedDVecN::<CANONICAL_DIMENSIONS>::zero();
    for row in 0..training.len() {
        mean.add_scaled(VecN::from_ref(training.embedding(row).as_array()), 1.0);
    }
    for value in mean.as_array_mut() {
        *value /= count;
    }

    let mut variances = BoxedDVecN::<CANONICAL_DIMENSIONS>::zero();
    for row in 0..training.len() {
        for ((variance, component), mean) in variances
            .as_array_mut()
            .iter_mut()
            .zip(training.embedding(row).as_array())
            .zip(mean.as_array())
        {
            let centered = f64::from(*component) - *mean;
            *variance = centered.mul_add(centered, *variance);
        }
    }
    for variance in variances.as_array_mut() {
        *variance /= count;
    }

    let pooled_variance = variances.as_array().iter().sum::<f64>() / dimensions;
    let mut inverse_scales = variances;
    if pooled_variance == 0.0 {
        inverse_scales.as_array_mut().fill(1.0);
    } else {
        let shrinkage = dimensions / (count + dimensions);
        let floor = pooled_variance * VARIANCE_RELATIVE_FLOOR;
        for value in inverse_scales.as_array_mut() {
            *value = ((1.0 - shrinkage).mul_add(*value, shrinkage * pooled_variance))
                .max(floor)
                .sqrt()
                .recip();
        }
    }

    let mut distances = Vec::with_capacity(training.len());
    for row in 0..training.len() {
        let distance = standardized_distance(training.embedding(row), &mean, &inverse_scales);
        if !distance.is_finite() {
            return Err(FitError::NonFinite);
        }
        distances.push(distance);
    }
    distances.sort_unstable_by(f64::total_cmp);

    Ok(Applicability {
        mean,
        inverse_scales,
        distances: distances.into_boxed_slice(),
    })
}
