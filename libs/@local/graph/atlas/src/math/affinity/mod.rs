//! The affinity curve of force-directed layouts and its gradient steps.
//!
//! A UMAP-style layout keeps a low-dimensional affinity curve
//!
//! ```text
//! q(d) = 1 / (1 + a * d^(2b))
//! ```
//!
//! over the 2D distance `d` between points, and descends its cross-entropy
//! against the high-dimensional neighbor graph by stochastic gradient
//! steps: sampled edges pull their endpoints together (attraction), and
//! sampled non-edges push them apart (repulsion). [`AffinityCurve`] holds
//! the fitted `a` and `b` parameters and evaluates both gradient families
//! for four point pairs at a time over [`Vec2x4T`] batches.
//!
//! Every per-axis gradient component is clamped to
//! [`GRADIENT_CLIP`](AffinityCurve::GRADIENT_CLIP) before the learning rate is
//! applied, which bounds the step a single sample can take and keeps early,
//! badly-placed points from being flung across the layout.
//!
//! Exactly coincident points receive no gradient in either direction:
//! their difference vector carries no direction to descend along, so
//! layouts rely on distinct initial placement to separate identical
//! points.
//!
//! All gradient arithmetic is `f32` with FMA contraction where the target
//! provides it, and the kernels are fully vectorized, including the
//! `d^(2b)` power. The one exception is [`AffinityCurve::fit`], the
//! one-shot least-squares parameter fit at initialization, which runs in
//! double precision and narrows its result to `f32`.
#![expect(
    clippy::min_ident_chars,
    reason = "`a` and `b` are the canonical names of the UMAP curve parameters throughout the \
              literature and the reference implementation"
)]

use core::simd::{Select as _, Simd, cmp::SimdPartialOrd as _, num::SimdFloat as _};

use levenberg_marquardt::{LeastSquaresProblem, LevenbergMarquardt};
use nalgebra::{DVector, Dyn, OMatrix, U2, Vector2, storage::Owned};

use super::{
    kernel::{mul_add_f32x4, pow_f32x4},
    scalar::narrow_f32,
    vec2::{Vec2, Vec2x4T},
};

#[cfg(test)]
mod tests;

/// Number of evenly spaced distances sampled when fitting the curve.
///
/// Matches the 300-point grid used by umap-learn's `find_ab_params`.
const FIT_SAMPLES: u16 = 300;

/// The affinity curve `1 / (1 + a * d^(2b))` mapping layout distance to
/// edge probability.
///
/// The parameters come from fitting the curve against the desired
/// membership falloff (spread and minimum distance) with
/// [`fit`](Self::fit), as UMAP's `a` and `b`; `a` scales the curve and
/// `b` shapes its tail. Both are strictly positive and finite by
/// construction.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::math::{AffinityCurve, Vec2};
///
/// let curve = AffinityCurve::new(1.577, 0.895).expect("parameters are positive and finite");
///
/// // Affinity is 1 at zero distance and falls off monotonically.
/// assert_eq!(curve.affinity(0.0), 1.0);
/// assert!(curve.affinity(1.0) > curve.affinity(4.0));
///
/// // Attraction pulls the endpoint toward the anchor.
/// let gradient = curve.attraction(Vec2::new(2.0, 0.0), Vec2::ZERO);
/// assert!(gradient.x() < 0.0);
/// assert_eq!(gradient.y(), 0.0);
/// ```
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct AffinityCurve {
    a: f32,
    b: f32,
}

impl AffinityCurve {
    /// The symmetric per-axis bound on every gradient component.
    ///
    /// Coefficients diverge as distances approach zero; the clamp bounds
    /// the displacement a single sampled pair can cause, before the
    /// learning rate scales it.
    pub const GRADIENT_CLIP: f32 = 4.0;
    /// Additive guard in the repulsion denominator.
    ///
    /// Keeps the coefficient finite as the squared distance approaches
    /// zero, bounding the repulsion between near-coincident points.
    const REPULSION_GUARD: f32 = 0.001;

    /// Creates a curve from its fitted parameters.
    ///
    /// Returns [`None`] unless both parameters are finite and strictly
    /// positive; the gradient expressions divide by `a`-scaled powers and
    /// multiply by `b`, so zero, negative, or non-finite parameters
    /// produce meaningless layouts.
    #[must_use]
    pub fn new(a: f32, b: f32) -> Option<Self> {
        (a.is_finite() && a > 0.0 && b.is_finite() && b > 0.0).then_some(Self { a, b })
    }

    /// Fits a curve from the desired membership falloff.
    ///
    /// The falloff keeps membership at `1` inside `minimum_distance` and
    /// decays as `exp(-(d - minimum_distance) / spread)` beyond it. This
    /// reproduces umap-learn's `find_ab_params`: the falloff is sampled
    /// at 300 evenly spaced distances over `[0, 3 * spread]` and the
    /// curve is fitted to the samples by Levenberg-Marquardt least
    /// squares. The fit runs once at initialization, in double
    /// precision, and narrows the result to the working `f32`
    /// parameters.
    ///
    /// Returns [`None`] when `spread` is not finite and strictly
    /// positive, when `minimum_distance` is not finite and strictly
    /// positive or exceeds `spread`, or when the least-squares fit fails
    /// to converge to parameters that [`new`](Self::new) accepts.
    ///
    /// # Examples
    ///
    /// ```
    /// use hash_graph_atlas::math::AffinityCurve;
    ///
    /// // The umap-learn defaults: spread 1.0, minimum distance 0.1.
    /// let curve = AffinityCurve::fit(1.0, 0.1).expect("the reference inputs are well-conditioned");
    ///
    /// assert!((curve.a() - 1.577).abs() < 0.01);
    /// assert!((curve.b() - 0.895).abs() < 0.01);
    /// ```
    #[must_use]
    pub fn fit(spread: f32, minimum_distance: f32) -> Option<Self> {
        if !spread.is_finite() || spread <= 0.0 {
            return None;
        }

        if !minimum_distance.is_finite() || minimum_distance <= 0.0 || minimum_distance > spread {
            return None;
        }

        let spread = f64::from(spread);
        let minimum_distance = f64::from(minimum_distance);

        let step = 3.0 * spread / f64::from(FIT_SAMPLES - 1);
        let mut distances = Vec::with_capacity(usize::from(FIT_SAMPLES));
        let mut targets = Vec::with_capacity(usize::from(FIT_SAMPLES));
        for index in 0..FIT_SAMPLES {
            let distance = f64::from(index) * step;
            let target = if distance < minimum_distance {
                1.0
            } else {
                (-(distance - minimum_distance) / spread).exp()
            };

            distances.push(distance);
            targets.push(target);
        }

        let problem = FitProblem {
            parameters: Vector2::new(1.0, 1.0),
            distances,
            targets,
        };
        let (problem, report) = LevenbergMarquardt::new().minimize(problem);
        if !report.termination.was_successful() {
            return None;
        }

        Self::new(
            narrow_f32(problem.parameters.x)?,
            narrow_f32(problem.parameters.y)?,
        )
    }

    /// Returns the `a` parameter.
    #[inline]
    #[must_use]
    pub const fn a(self) -> f32 {
        self.a
    }

    /// Returns the `b` parameter.
    #[inline]
    #[must_use]
    pub const fn b(self) -> f32 {
        self.b
    }

    /// Evaluates the affinity `1 / (1 + a * d^(2b))` at a squared distance.
    ///
    /// The affinity is `1` at distance zero and falls monotonically toward
    /// zero; it is the low-dimensional edge probability the layout
    /// optimizes toward.
    #[must_use]
    pub fn affinity(self, distance_squared: f32) -> f32 {
        if distance_squared <= 0.0 {
            return 1.0;
        }

        self.a.mul_add(distance_squared.powf(self.b), 1.0).recip()
    }

    /// Computes the clipped attraction gradients of four point pairs.
    ///
    /// Entry `i` is the gradient acting on `from[i]` for the edge toward
    /// `to[i]`: a negative multiple of the difference vector, clamped per
    /// axis, so it points from `from` toward `to`. The symmetric update
    /// applies `+lr * gradient` to `from` and `-lr * gradient` to `to`.
    ///
    /// Coincident pairs receive a zero gradient.
    #[must_use]
    pub fn attraction_x4(self, from: Vec2x4T, to: Vec2x4T) -> Vec2x4T {
        let distance_squared = from.distance_squared(to);

        // Shared power: d^(2b - 2), with d^(2b) recovered by one multiply.
        let power = pow_f32x4(distance_squared, Simd::splat(self.b - 1.0));
        let coefficient = (Simd::splat(-2.0 * self.a * self.b) * power)
            / mul_add_f32x4(
                Simd::splat(self.a) * power,
                distance_squared,
                Simd::splat(1.0),
            );

        // Coincident pairs: no direction to descend along.
        let coefficient = distance_squared
            .simd_gt(Simd::splat(0.0))
            .select(coefficient, Simd::splat(0.0));

        scaled_clipped_difference(from, to, coefficient)
    }

    /// Computes the clipped repulsion gradients of four point pairs.
    ///
    /// Entry `i` is the gradient acting on `from[i]` away from the
    /// negative sample `to[i]`: a positive multiple of the difference
    /// vector, clamped per axis. Only `from` moves; negative samples stay
    /// in place. `repulsion_strength` is the `gamma` weight of the
    /// repulsive term.
    ///
    /// Coincident pairs receive a zero gradient.
    #[must_use]
    pub fn repulsion_x4(self, from: Vec2x4T, to: Vec2x4T, repulsion_strength: f32) -> Vec2x4T {
        let distance_squared = from.distance_squared(to);

        let power = pow_f32x4(distance_squared, Simd::splat(self.b));
        let denominator = (Simd::splat(Self::REPULSION_GUARD) + distance_squared)
            * mul_add_f32x4(Simd::splat(self.a), power, Simd::splat(1.0));
        let coefficient = Simd::splat(2.0 * repulsion_strength * self.b) / denominator;

        // Coincident pairs: no direction to push along.
        let coefficient = distance_squared
            .simd_gt(Simd::splat(0.0))
            .select(coefficient, Simd::splat(0.0));

        scaled_clipped_difference(from, to, coefficient)
    }

    /// Computes the clipped attraction gradient of a single point pair.
    ///
    /// Scalar twin of [`attraction_x4`](Self::attraction_x4) for loop
    /// remainders; the semantics are identical.
    #[must_use]
    pub fn attraction(self, from: Vec2, to: Vec2) -> Vec2 {
        let distance_squared = from.distance_squared(to);
        if distance_squared <= 0.0 {
            return Vec2::ZERO;
        }

        let power = distance_squared.powf(self.b - 1.0);
        let coefficient =
            (-2.0 * self.a * self.b * power) / (self.a * power).mul_add(distance_squared, 1.0);

        clip_vec2((from - to) * coefficient)
    }

    /// Computes the clipped repulsion gradient of a single point pair.
    ///
    /// Scalar twin of [`repulsion_x4`](Self::repulsion_x4) for loop
    /// remainders; the semantics are identical.
    #[must_use]
    pub fn repulsion(self, from: Vec2, to: Vec2, repulsion_strength: f32) -> Vec2 {
        let distance_squared = from.distance_squared(to);
        if distance_squared <= 0.0 {
            return Vec2::ZERO;
        }

        let denominator = (Self::REPULSION_GUARD + distance_squared)
            * self.a.mul_add(distance_squared.powf(self.b), 1.0);
        let coefficient = 2.0 * repulsion_strength * self.b / denominator;

        clip_vec2((from - to) * coefficient)
    }
}

/// Scales the per-pair difference vectors and clamps each axis component.
#[expect(
    clippy::inline_always,
    reason = "SIMD values cross non-inlined call boundaries through memory; inlining into the \
              surrounding kernel must be guaranteed, not hinted"
)]
#[inline(always)]
fn scaled_clipped_difference(from: Vec2x4T, to: Vec2x4T, coefficient: Simd<f32, 4>) -> Vec2x4T {
    let clip = Simd::splat(AffinityCurve::GRADIENT_CLIP);

    Vec2x4T::from_lanes(
        ((from.xs() - to.xs()) * coefficient).simd_clamp(-clip, clip),
        ((from.ys() - to.ys()) * coefficient).simd_clamp(-clip, clip),
    )
}

/// Clamps both components into the gradient clip range.
#[expect(
    clippy::inline_always,
    reason = "SIMD values cross non-inlined call boundaries through memory; inlining into the \
              surrounding kernel must be guaranteed, not hinted"
)]
#[inline(always)]
const fn clip_vec2(gradient: Vec2) -> Vec2 {
    gradient.clamp(
        Vec2::splat(-AffinityCurve::GRADIENT_CLIP),
        Vec2::splat(AffinityCurve::GRADIENT_CLIP),
    )
}

/// Least-squares residuals of the affinity curve against the sampled
/// target falloff.
struct FitProblem {
    parameters: Vector2<f64>,
    distances: Vec<f64>,
    targets: Vec<f64>,
}

impl LeastSquaresProblem<f64, Dyn, U2> for FitProblem {
    type JacobianStorage = Owned<f64, Dyn, U2>;
    type ParameterStorage = Owned<f64, U2>;
    type ResidualStorage = Owned<f64, Dyn>;

    fn set_params(&mut self, x: &Vector2<f64>) {
        self.parameters = *x;
    }

    fn params(&self) -> Vector2<f64> {
        self.parameters
    }

    fn residuals(&self) -> Option<DVector<f64>> {
        let a = self.parameters.x;
        let b = self.parameters.y;
        if !a.is_finite() || !b.is_finite() {
            return None;
        }

        let residuals = DVector::from_iterator(
            self.distances.len(),
            self.distances
                .iter()
                .zip(&self.targets)
                .map(|(&distance, &target)| {
                    a.mul_add(distance.powf(2.0 * b), 1.0).recip() - target
                }),
        );
        residuals
            .iter()
            .all(|value| value.is_finite())
            .then_some(residuals)
    }

    fn jacobian(&self) -> Option<OMatrix<f64, Dyn, U2>> {
        let a = self.parameters.x;
        let b = self.parameters.y;
        let mut jacobian = OMatrix::<f64, Dyn, U2>::zeros_generic(Dyn(self.distances.len()), U2);

        for (row, &distance) in self.distances.iter().enumerate() {
            // The zero-distance sample has zero partials in both
            // parameters; skipping it also keeps `ln` off distance zero.
            if distance <= 0.0 {
                continue;
            }
            let power = distance.powf(2.0 * b);
            let denominator = a.mul_add(power, 1.0).powi(2);
            jacobian[(row, 0)] = -power / denominator;
            jacobian[(row, 1)] = -(2.0 * a * power * distance.ln()) / denominator;
        }

        jacobian
            .iter()
            .all(|value| value.is_finite())
            .then_some(jacobian)
    }
}
