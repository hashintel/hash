//! Applicability distribution fitting over the complete corpus.
//!
//! [`fit_applicability`] fits a per-dimension mean and a diagonal variance shrunk toward the pooled
//! variance,
//!
//! ```text
//! shrinkage = dimensions / (rows + dimensions),
//! ```
//!
//! which regularizes sparse high-dimensional samples while retaining dimension-level scale where
//! the sample supports it. The fit sorts and retains the training rows' own standardized distances,
//! so a prediction's applicability is its empirical upper-tail rank. An embedding far from every
//! training row scores near zero, flagging the prediction as unsupported. Applicability is evidence
//! about the embedding. It is not a fourth geometry class.

use super::{FitError, TrainingSet};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    math::{BoxedDVecN, VecN},
    salt::policy::classifier::{Applicability, Standardization},
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
    for embedding in training.embeddings {
        mean.add_widened(VecN::from_ref(embedding.as_array()));
    }
    *mean /= count;

    let mut variances = BoxedDVecN::<CANONICAL_DIMENSIONS>::zero();
    for embedding in training.embeddings {
        variances.add_squared_deviation(VecN::from_ref(embedding.as_array()), &mean);
    }
    *variances /= count;

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

    let standardization = Standardization {
        mean,
        inverse_scales,
    };

    let mut distances = Vec::with_capacity(training.len());
    for embedding in training.embeddings {
        let distance = standardization
            .distance(embedding)
            .ok_or(FitError::NonFinite)?;
        distances.push(distance);
    }
    distances.sort_unstable();

    Ok(Applicability {
        standardization,
        distances: distances.into_boxed_slice(),
    })
}
