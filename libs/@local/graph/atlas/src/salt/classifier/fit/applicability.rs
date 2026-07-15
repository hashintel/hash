use super::ClassifierTrainingSet;
use crate::salt::{classifier::error::ClassifierFitError, representation::CANONICAL_DIMENSIONS};

const VARIANCE_RELATIVE_FLOOR: f64 = 1.0e-12;
const DIMENSION_F64: f64 = 3072.0;
const _: () = assert!(CANONICAL_DIMENSIONS == 3072);

pub(super) struct FittedApplicability {
    pub mean: Box<[f64]>,
    pub inverse_scales: Box<[f64]>,
    pub distances: Box<[f64]>,
}

/// Fits diagonal variance shrunk toward the pooled variance.
///
/// With `n` rows and dimension `d`, shrinkage is `d / (n + d)`. This
/// regularizes sparse high-dimensional samples while retaining dimension-level
/// scale where the sample supports it.
pub(super) fn fit_applicability(
    training: ClassifierTrainingSet<'_>,
    indices: &[usize],
) -> Result<FittedApplicability, ClassifierFitError> {
    let count = indices.len();
    let count_f64 = count_as_f64(count);
    let mut mean = vec![0.0; CANONICAL_DIMENSIONS];
    for &row in indices {
        for (mean, value) in mean.iter_mut().zip(training.embedding(row)) {
            *mean += f64::from(*value);
        }
    }
    for value in &mut mean {
        *value /= count_f64;
    }

    let mut variances = vec![0.0; CANONICAL_DIMENSIONS];
    for &row in indices {
        for ((variance, value), mean) in
            variances.iter_mut().zip(training.embedding(row)).zip(&mean)
        {
            let centered = f64::from(*value) - *mean;
            *variance = centered.mul_add(centered, *variance);
        }
    }
    for variance in &mut variances {
        *variance /= count_f64;
    }
    let global_variance = variances.iter().sum::<f64>() / DIMENSION_F64;
    let inverse_scales = if global_variance == 0.0 {
        vec![1.0; CANONICAL_DIMENSIONS]
    } else {
        let dimension = DIMENSION_F64;
        let shrinkage = dimension / (count_f64 + dimension);
        let floor = global_variance * VARIANCE_RELATIVE_FLOOR;
        variances
            .into_iter()
            .map(|variance| {
                ((1.0 - shrinkage).mul_add(variance, shrinkage * global_variance))
                    .max(floor)
                    .sqrt()
                    .recip()
            })
            .collect()
    };

    let mut distances = Vec::with_capacity(count);
    for &row in indices {
        let squared = training
            .embedding(row)
            .iter()
            .zip(&mean)
            .zip(&inverse_scales)
            .map(|((&value, mean), inverse_scale)| {
                let standardized = (f64::from(value) - *mean) * inverse_scale;
                standardized * standardized
            })
            .sum::<f64>();
        let distance = (squared / DIMENSION_F64).sqrt();
        if !distance.is_finite() {
            return Err(ClassifierFitError::NonFiniteObjective);
        }
        distances.push(distance);
    }
    distances.sort_unstable_by(f64::total_cmp);
    Ok(FittedApplicability {
        mean: mean.into_boxed_slice(),
        inverse_scales: inverse_scales.into_boxed_slice(),
        distances: distances.into_boxed_slice(),
    })
}

#[expect(
    clippy::cast_precision_loss,
    reason = "classifier training sets are bounded far below f64 integer precision"
)]
#[inline]
fn count_as_f64(count: usize) -> f64 {
    count as f64
}
