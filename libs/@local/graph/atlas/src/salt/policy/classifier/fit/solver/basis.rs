//! The `HelmertV1` contrast basis between class logits and contrast coordinates.
//!
//! Three class logits carry one redundant degree of freedom: adding a common scalar to every
//! logit moves no probability. The solver therefore parameterizes the classifier in a
//! two-dimensional contrast space reached through the fixed matrix `B ∈ ℝ^(3×2)` whose rows, in
//! [`GeometryClass`] discriminant order, are `(1/√2, 1/√6)`, `(−1/√2, 1/√6)`, and `(0, −2/√6)`.
//! Its columns are orthonormal (`BᵀB = I₂`) and orthogonal to the constant vector (`Bᵀ1 = 0`), so
//! contrast coordinates span exactly the shift-free directions of logit space: [`expand`] maps a
//! contrast vector to class logits and [`reduce`] projects a class-space vector back, and the
//! roundtrip is the identity up to rounding.
//!
//! The six matrix entries are fixed IEEE-754 bit patterns in source, pinned by `to_bits` tests;
//! no platform math call recomputes them. Each magnitude is the correctly rounded value of its
//! real number, and `2/√6` is the exact double of `1/√6`, which makes both column sums exactly
//! `0.0` under plain class-order addition. Basis applications fold with `mul_add` in coordinate
//! order; under that fold every entry of `BᵀB` lies within one ulp of `I₂`.

use core::f64::consts::FRAC_1_SQRT_2;

use super::CONTRAST_ROWS;
use crate::salt::policy::GeometryClass;

/// `1/√6`, correctly rounded (bit pattern `0x3FDA20BD700C2C3E`).
const FRAC_1_SQRT_6: f64 = 0.408_248_290_463_863;

/// `2/√6`, the exact double of [`FRAC_1_SQRT_6`] (bit pattern `0x3FEA20BD700C2C3E`).
///
/// Doubling is exact in binary floating point, so this is also the correctly rounded value of
/// the real `2/√6`.
const FRAC_2_SQRT_6: f64 = 0.816_496_580_927_726;

/// The `HelmertV1` basis rows, one per class in discriminant order.
pub(super) const HELMERT_V1: [[f64; CONTRAST_ROWS]; GeometryClass::COUNT] = [
    [FRAC_1_SQRT_2, FRAC_1_SQRT_6],
    [-FRAC_1_SQRT_2, FRAC_1_SQRT_6],
    [0.0, -FRAC_2_SQRT_6],
];

/// Maps contrast coordinates to class logits: `ℓ = B·t`.
#[inline]
pub(crate) const fn expand(contrast: [f64; CONTRAST_ROWS]) -> [f64; GeometryClass::COUNT] {
    core::array::from_fn(const |class| {
        let row = HELMERT_V1[class];
        let mut logit = contrast[0] * row[0];

        let mut index = 1;
        while index < CONTRAST_ROWS {
            logit = contrast[index].mul_add(row[index], logit);
            index += 1;
        }

        logit
    })
}

/// Projects a class-space vector to contrast coordinates: `Bᵀ·v`.
#[inline]
pub(super) const fn reduce(classes: [f64; GeometryClass::COUNT]) -> [f64; CONTRAST_ROWS] {
    core::array::from_fn(const |column| {
        let mut accumulator = 0.0;

        let mut class = 0;
        while class < GeometryClass::COUNT {
            let row = HELMERT_V1[class];
            accumulator = classes[class].mul_add(row[column], accumulator);
            class += 1;
        }

        accumulator
    })
}
