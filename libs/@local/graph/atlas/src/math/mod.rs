//! Geometry and numerical kernels for fitting and querying 2D maps of embeddings.
//!
//! The module provides vector arithmetic, coordinate transformations and fitting operations.
//! Single-precision storage keeps point and embedding arrays compact. Double-precision arithmetic
//! supplies wider accumulation and range where individual kernels need it. Validated fields and
//! scalar domains make input conditions explicit.
//!
//! # Example
//!
//! This in-crate example is ignored because the math API is crate-private. It maps a layout's
//! extent onto a viewport.
//!
//! ```ignore
//! use crate::math::{Bounds2, Vec2};
//!
//! let points = [
//!     Vec2::new(-2.0, 0.0),
//!     Vec2::new(6.0, 4.0),
//!     Vec2::new(2.0, 2.0),
//! ];
//! let bounds = Bounds2::from_points(points).expect("points are finite");
//! let viewport = Bounds2::new(Vec2::ZERO, Vec2::splat(10.0)).expect("corners are ordered");
//!
//! let mapped = bounds.normalize_into(viewport, &points);
//! assert_eq!(mapped[2], Vec2::new(5.0, 5.0));
//! ```
//!
//! # Types by role
//!
//! Geometry: [`Vec2`] is a single-precision point or vector. [`Vec2x4`](vec2::Vec2x4) keeps four
//! points in natural order, while [`Vec2x4T`] groups their x and y components for axis-parallel
//! arithmetic. [`DVec2`] and [`DVec2x4T`] provide double-precision counterparts.
//! [`FinitePointField`] validates a row-indexed slice's coordinates, and [`Bounds2`] describes a
//! finite ordered bounding box.
//!
//! Transformations: [`Rotation`] models an angle, [`Translation`](translation::Translation) an
//! offset, [`Similarity`] a positive uniform scale with rotation and translation, and [`Transform`]
//! a general affine map. Prefer the most constrained type that models the operation. Each converts
//! into [`Transform`] through [`From`], and `a.then(b)` composes in application order. Inverse
//! methods compute floating-point approximations subject to their documented range conditions.
//! [`Similarity::fit`] and [`Transform::fit_uniform`] estimate maps from corresponding points.
//!
//! Embeddings: [`VecN`] provides fixed-width single-precision vectors and distance kernels.
//! [`BoxedVecN`] owns aligned heap storage exposed through [`AlignedVecN`]. [`DVecN`],
//! [`BoxedDVecN`] and [`AlignedDVecN`] provide double-precision storage and reductions. [`MatrixN`]
//! stores rows with a fixed embedding width.
//!
//! Dense solves: [`DSquareMatrix`] is a runtime-order double-precision square matrix.
//! [`DSquareMatrix::cholesky`] computes a Cholesky factor for symmetric positive-definite systems,
//! rejecting nonpositive or non-finite computed pivots. Its
//! [`DCholeskyFactor`](dsquare::DCholeskyFactor) performs triangular solves. Rounding can make a
//! mathematically positive-definite input fail factorization.
//!
//! Neighbours: [`KdTree`] indexes a finite point field and orders selected neighbours by
//! double-precision squared distance, breaking ties by row. Its [selection model](kdtree) explains
//! the two walks and the precision limits of radius pruning.
//!
//! Affinities: [`AffinityCurve`] evaluates a distance-based affinity and attractive/repulsive
//! gradients. [`AffinityCurve::fit`] fits its parameters to a sampled target curve. Clipping,
//! regularization and numerical stopping conditions are part of those operations' contracts.
//!
//! Scalar domains: [`Finite`], [`Positive`] and related types express value ranges. [`softplus`],
//! [`NonNegative::huber`] and [`NonNegative::sigmoid`] provide common scalar functions.
//! [`narrow_f32`] checks the result of a double-to-single-precision conversion. [`Derivation`]
//! carries raw intermediate arithmetic toward a destination [`Domain`](derivation::Domain), and
//! [`Derivation::finish`] validates the final value or returns [`Diverged`].
//!
//! # Precision
//!
//! Single-precision storage does not imply single-precision arithmetic throughout. Wide distance
//! methods return `f64`, and fitting and reductions often accumulate in `f64` before any final
//! narrowing. Each arithmetic step can round at its working precision. Widening does not make a sum
//! exact, recover distinctions already lost from stored coordinates, or prevent cancellation.
//!
//! Individual kernels state their input domains, handling of special-case results and reduction
//! order. Parallel grouping can change acceptance decisions or final bits. An inverse or algebraic
//! identity in the real-valued model does not by itself promise an exact floating-point round trip.
//!
//! # Batching
//!
//! Convert an array of four [`Vec2`] points into [`Vec2x4T`] for a sequence of axis-parallel
//! operations. [`Vec2x4T::into_lanes`] exposes separate x and y vectors, and
//! [`Vec2x4T::from_lanes`] combines them. [`Vec2x4T::transpose`] returns natural point order for
//! access through [`Vec2x4::as_array`](vec2::Vec2x4::as_array). Alignment and lane layout support
//! SIMD access, while instruction selection and conversion cost depend on the target and
//! optimization context.
#![expect(unsafe_code)]
#![expect(
    dead_code,
    reason = "math code is correct either way, and moves in and out of use. Functions are \
              incrementally added, but not removed, to not duplicate work."
)]
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

mod affinity;
#[cfg(feature = "bench")]
pub mod bench;
mod bounds;
mod derivation;
mod dsquare;
mod dvec2;
mod dvecn;
mod field;
pub(crate) mod kdtree;
pub(crate) mod kernel;
mod matrixn;
mod rotation;
mod scalar;
mod similarity;
mod transform;
mod translation;
mod vec2;
mod vecn;

mod error;
#[cfg(test)]
mod test_alloc;
#[cfg(test)]
mod tests;

#[cfg(test)]
pub(crate) use self::scalar::{d_non_negative, finite, greater_than_one};
#[cfg(test)]
pub(crate) use self::translation::Translation;
pub(crate) use self::{
    affinity::AffinityCurve,
    bounds::Bounds2,
    derivation::{Derivation, Diverged},
    dsquare::{DCholeskyError, DSquareMatrix},
    dvec2::{DVec2, DVec2x4T},
    dvecn::{AlignedDVecN, BoxedDVecN, DVecN},
    error::NonFinitePoint,
    field::FinitePointField,
    kdtree::KdTree,
    matrixn::MatrixN,
    rotation::Rotation,
    scalar::{
        DFinite, DNonNegative, DPositive, Finite, GreaterThanOne, Log2, Negative, NonNegative,
        OpenUnitFraction, Positive, PositiveUnitFraction, UnitFraction, d_finite, d_positive,
        narrow_f32, non_negative, nz, open_unit_fraction, positive, positive_unit_fraction,
        softplus, unit_fraction,
    },
    similarity::Similarity,
    transform::Transform,
    vec2::{Vec2, Vec2SliceExt, Vec2x4T},
    vecn::{AlignedVecN, BoxedVecN, VecN},
};
