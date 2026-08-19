//! SIMD-native math primitives for fitting and serving 2D maps of embeddings.
//!
//! Everything here serves one pipeline that has to be fast and correct. The pipeline places
//! high-dimensional embedding vectors on a 2D map and goes on transforming, aligning, and verifying
//! that map. The types are `f32` throughout, batch four-wide where hot loops iterate, and every
//! performance claim in their docs traces to emitted assembly or a hardware-counter measurement.
//!
//! The module is crate-internal. Its examples carry `ignore` and spell each call as an in-crate
//! caller writes it.
//!
//! ```ignore
//! // Fit a layout's extent and map it onto a viewport in one transform.
//! let points = [
//!     Vec2::new(-2.0, 0.0),
//!     Vec2::new(6.0, 4.0),
//!     Vec2::new(2.0, 2.0),
//! ];
//! let bounds = Bounds2::from_points(points).expect("points are finite");
//! let viewport = Bounds2::new(Vec2::ZERO, Vec2::splat(10.0)).expect("corners are ordered");
//!
//! let transform = bounds.fit(viewport).expect("the layout has extent");
//! assert_eq!(transform.apply(Vec2::new(2.0, 2.0)), Vec2::new(5.0, 5.0));
//! ```
//!
//! # The types, by role
//!
//! 2D geometry: [`Vec2`] is the scalar point/vector. [`Vec2x4`](vec2::Vec2x4) (natural order)
//! and
//! [`Vec2x4T`] (transposed order) batch four of them for SIMD, staging and computing respectively.
//! [`Bounds2`] is the validated bounding box, with serial, SIMD, and parallel construction.
//!
//! Transforms, most constrained first: [`Rotation`] (angle only, exact inverse),
//! [`Translation`](translation::Translation) (offset only, exact inverse), [`Similarity`]
//! (uniform scale + rotation + translation, total inverse, fitted from weighted point
//! correspondences), [`Transform`] (general affine, fallible inverse).
//! Prefer the most constrained type that models the job; each widens into
//! [`Transform`] via [`From`], and composition is always `a.then(b)`,
//! reading in application order.
//!
//! Embeddings: [`VecN`] is the `N`-dimensional `f32` vector with the distance kernels;
//! [`BoxedVecN`] owns SIMD-aligned heap storage and hands out [`AlignedVecN`] references. [`DVecN`]
//! is the double-precision twin for the few consumers whose algorithms need it.
//!
//! Dense solves: [`DSquareMatrix`] is the runtime-order square `f64` matrix;
//! [`DSquareMatrix::cholesky`] factors it deterministically into the
//! [`DCholeskyFactor`](dsquare::DCholeskyFactor) that answers symmetric positive-definite
//! linear systems.
//!
//! Exact neighbours: [`KdTree`] indexes a placed 2D frame and answers exact k-nearest-neighbour
//! readouts equal to a full scan, with `f64` squared-distance readings and ties resolved by row.
//!
//! Layout fitting: [`AffinityCurve`] evaluates the affinity curve of UMAP-style layouts and its
//! attraction/repulsion gradients over batches. Its parameters come from [`AffinityCurve::fit`].
//!
//! Scalar helpers: [`softplus`] and the checked narrowings [`narrow_f32`] /
//! [`narrow_f32_exact`](scalar::narrow_f32_exact). The Huber penalty and the logistic function
//! live on [`NonNegative`] as
//! [`huber`](NonNegative::huber) and [`sigmoid`](NonNegative::sigmoid).
//!
//! Unclaimed folds: [`Derivation`] is a data-dependent fold's raw value bound for its
//! validated [`Domain`](derivation::Domain), claiming nothing until
//! [`finish`](Derivation::finish). [`Diverged`] returns the raw evidence
//! of a refused claim.
//!
//! # Precision policy
//!
//! `f32` is the working precision: coordinates, transforms, gradients, and distances take and
//! return `f32`. Long reductions accumulate in `f64` internally and round once at the end, which
//! the kernel docs state as an accuracy guarantee rather than exposing in signatures. A signature
//! takes `f64` only where a consumer's algorithm demands it, such as classifier logits on
//! [`DVecN`].
//!
//! # Batching
//!
//! Hot loops work in [`Vec2x4T`]. Convert `[Vec2; 4]` once at the loop boundary (paying one
//! shuffle), then run axis-parallel arithmetic inside and write back with [`Vec2x4T::from_lanes`].
//! Batch types align for full-width vector loads, and conversions to [`Simd`] compile to single
//! load and store instructions.
//!
//! [`Simd`]: core::simd::Simd
#![expect(unsafe_code)]
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
pub(crate) use self::scalar::{d_non_negative, finite, greater_than_one, positive_unit_fraction};
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
        narrow_f32, non_negative, nz, open_unit_fraction, positive, softplus, unit_fraction,
    },
    similarity::Similarity,
    transform::Transform,
    vec2::{Vec2, Vec2SliceExt, Vec2x4T},
    vecn::{AlignedVecN, BoxedVecN, VecN},
};
