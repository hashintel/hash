//! Weighted orientation-preserving similarity alignment in two dimensions.
//!
//! Given source anchors `x_i`, target anchors `y_i`, and non-negative weights
//! `w_i`, alignment minimizes
//!
//! ```text
//! sum_i w_i ||s R x_i + t - y_i||^2
//! ```
//!
//! over positive scale `s`, translation `t`, and a rotation `R` with
//! determinant one. Weighted centroids remove translation. In two dimensions,
//! the remaining optimum has
//!
//! ```text
//! a = sum_i w_i dot(x_i, y_i)
//! b = sum_i w_i cross(x_i, y_i)
//! cos(theta) = a / hypot(a, b)
//! sin(theta) = b / hypot(a, b)
//! s = hypot(a, b) / sum_i w_i ||x_i||^2
//! ```
//!
//! where coordinates in the sums are centered. Accumulation uses `f64` in
//! caller order and allocates no intermediate matrices.

mod error;

pub(crate) use self::error::AlignmentError;

/// An orientation-preserving similarity transform in two dimensions.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SimilarityTransform {
    scale: f64,
    cosine: f64,
    sine: f64,
    translation: [f64; 2],
}

impl SimilarityTransform {
    /// Applies the transform to one coordinate.
    #[must_use]
    #[inline]
    pub(crate) fn apply(self, [x, y]: [f64; 2]) -> [f64; 2] {
        [
            self.scale
                .mul_add(self.cosine.mul_add(x, -self.sine * y), self.translation[0]),
            self.scale
                .mul_add(self.sine.mul_add(x, self.cosine * y), self.translation[1]),
        ]
    }

    /// Returns the uniform scale.
    #[must_use]
    #[inline]
    pub(crate) const fn scale(self) -> f64 {
        self.scale
    }

    /// Returns the rotation as `(cos(theta), sin(theta))`.
    #[must_use]
    #[inline]
    pub(crate) const fn rotation(self) -> [f64; 2] {
        [self.cosine, self.sine]
    }

    /// Returns the translation applied after scale and rotation.
    #[must_use]
    #[inline]
    pub(crate) const fn translation(self) -> [f64; 2] {
        self.translation
    }
}

/// Fits a weighted orientation-preserving similarity transform.
///
/// Zero-weight anchors are ignored. Coordinates and weights are scanned twice
/// without allocation. The same ordered inputs produce the same result on a
/// fixed floating-point target.
///
/// # Errors
///
/// This returns an error when slice lengths differ, an input is non-finite, a
/// weight is negative, all weights are zero, source anchors have no spatial
/// variance, or the anchors do not determine a finite positive-scale proper
/// rotation.
pub(crate) fn fit_similarity(
    source: &[[f64; 2]],
    target: &[[f64; 2]],
    weights: &[f64],
) -> Result<SimilarityTransform, AlignmentError> {
    if source.len() != target.len() || source.len() != weights.len() {
        return Err(AlignmentError::LengthMismatch {
            source: source.len(),
            target: target.len(),
            weights: weights.len(),
        });
    }
    if source.is_empty() {
        return Err(AlignmentError::Empty);
    }

    let mut total_weight = 0.0;
    let mut source_sum = [0.0; 2];
    let mut target_sum = [0.0; 2];
    for (row, ((source, target), &weight)) in source.iter().zip(target).zip(weights).enumerate() {
        if !weight.is_finite() || weight.is_sign_negative() {
            return Err(AlignmentError::InvalidWeight { row, weight });
        }
        for axis in 0..2 {
            if !source[axis].is_finite() || !target[axis].is_finite() {
                return Err(AlignmentError::NonFiniteCoordinate {
                    row,
                    axis,
                    source: source[axis],
                    target: target[axis],
                });
            }
            source_sum[axis] = weight.mul_add(source[axis], source_sum[axis]);
            target_sum[axis] = weight.mul_add(target[axis], target_sum[axis]);
        }
        total_weight += weight;
    }
    if !total_weight.is_finite() || total_weight <= 0.0 {
        return Err(AlignmentError::ZeroTotalWeight);
    }

    let source_center = [source_sum[0] / total_weight, source_sum[1] / total_weight];
    let target_center = [target_sum[0] / total_weight, target_sum[1] / total_weight];
    let mut source_variance = 0.0;
    let mut dot = 0.0;
    let mut cross = 0.0;
    for ((source, target), &weight) in source.iter().zip(target).zip(weights) {
        let source = [source[0] - source_center[0], source[1] - source_center[1]];
        let target = [target[0] - target_center[0], target[1] - target_center[1]];
        source_variance = weight.mul_add(
            source[0].mul_add(source[0], source[1] * source[1]),
            source_variance,
        );
        dot = weight.mul_add(source[0].mul_add(target[0], source[1] * target[1]), dot);
        cross = weight.mul_add(source[0].mul_add(target[1], -source[1] * target[0]), cross);
    }

    if !source_variance.is_finite() || source_variance <= f64::MIN_POSITIVE {
        return Err(AlignmentError::DegenerateSource);
    }
    let covariance = dot.hypot(cross);
    if !covariance.is_finite() || covariance <= f64::MIN_POSITIVE {
        return Err(AlignmentError::DegenerateOrientation);
    }
    let scale = covariance / source_variance;
    let cosine = dot / covariance;
    let sine = cross / covariance;
    let rotated_center = [
        cosine.mul_add(source_center[0], -sine * source_center[1]),
        sine.mul_add(source_center[0], cosine * source_center[1]),
    ];
    let translation = [
        target_center[0] - scale * rotated_center[0],
        target_center[1] - scale * rotated_center[1],
    ];
    let transform = SimilarityTransform {
        scale,
        cosine,
        sine,
        translation,
    };
    if !scale.is_finite()
        || scale <= 0.0
        || !cosine.is_finite()
        || !sine.is_finite()
        || !translation.iter().all(|value| value.is_finite())
    {
        return Err(AlignmentError::NonFiniteTransform);
    }
    Ok(transform)
}

#[cfg(test)]
mod tests;
