//! UMAP-style affinity and clipped attraction/repulsion updates.
//!
//! For a point difference Δ = from − to ∈ ℝ² and squared distance ρ = ‖Δ‖² ≥ 0, the affinity model
//! is q(ρ) = 1 / (1 + aρᵇ), with a, b > 0. Equivalently, at Euclidean distance d it is 1 / (1 + a ·
//! d^(2b)). [`AffinityCurve`] holds these parameters and evaluates scalar or four-pair SIMD
//! updates.
//!
//! An edge contributes loss −ln q. Differentiating with respect to `from` and negating gives the
//! attraction update −2abρ^(b−1)Δ / (1 + aρᵇ). A non-edge with weight γ ≥ 0 contributes −γ ln(1 −
//! q), whose negative gradient is 2γbΔ / (ρ(1 + aρᵇ)) for ρ > 0. Repulsion replaces the leading
//! denominator ρ with ρ + ε, where ε = 0.001, to regularize close pairs.
//!
//! Each update is clamped componentwise to ±[`GRADIENT_CLIP`](AffinityCurve::GRADIENT_CLIP). A
//! finite clipped update has Euclidean norm at most 4√2 before multiplication by a learning rate.
//! Componentwise clipping preserves each component's sign but can change the direction from a
//! scalar multiple of Δ. These functions return updates without moving either endpoint.
//!
//! Finite coincident points receive zero updates because their difference supplies no direction.
//! Distinct points whose computed squared distance underflows to zero also receive zero. Gradient
//! arithmetic uses `f32`, with explicit fused multiply-adds. SIMD powers use [`pow_f32x4`], while
//! scalar powers use [`f32::powf`]. Their approximations and distance grouping can differ. Finite
//! input coordinates and positive parameters alone do not prevent intermediate overflow or NaNs,
//! and clipping does not establish a universally finite result.
//!
//! [`AffinityCurve::fit`] estimates the parameters in `f64` and narrows the result to `f32`.
#![expect(
    clippy::min_ident_chars,
    reason = "`a` and `b` are the canonical names of the UMAP curve parameters throughout the \
              literature and the reference implementation"
)]

use core::simd::{Select as _, Simd, cmp::SimdPartialOrd as _, num::SimdFloat as _};

use super::{
    Derivation, Finite, NonNegative, Positive,
    kernel::{mul_add_f32x4, pow_f32x4},
    non_negative, positive,
    vec2::{Vec2, Vec2x4T},
};

mod fit;
#[cfg(test)]
mod tests;

#[cfg(test)]
pub(crate) use self::fit::AffinityFitConfig;

/// A positive-parameter affinity curve for layout distances.
///
/// The model is q(ρ) = 1 / (1 + aρᵇ) for squared distance ρ ≥ 0. Parameter a sets the distance
/// scale and b shapes the decay. Both are finite and strictly positive by construction.
/// [`fit`](Self::fit) estimates them from a desired membership falloff.
///
/// # Example
///
/// This example is ignored because [`AffinityCurve`] is crate-private.
///
/// ```ignore
/// use crate::math::{AffinityCurve, NonNegative, Vec2, non_negative, positive};
///
/// let curve = AffinityCurve::new(positive!(1.577), positive!(0.895));
///
/// // Affinity is 1 at zero distance and falls off monotonically.
/// assert_eq!(curve.affinity(NonNegative::ZERO), 1.0);
/// assert!(curve.affinity(non_negative!(1.0)) > curve.affinity(non_negative!(4.0)));
///
/// // Attraction pulls the endpoint toward the anchor.
/// let gradient = curve.attraction(Vec2::new(2.0, 0.0), Vec2::ZERO);
/// assert!(gradient.x() < 0.0);
/// assert_eq!(gradient.y(), 0.0);
/// ```
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct AffinityCurve {
    a: Positive,
    b: Positive,
}

impl AffinityCurve {
    /// The symmetric per-axis clip for finite gradient components.
    ///
    /// Clipping limits each component to [−4, 4] before a learning rate is applied. Compare this
    /// scale with the coordinate extent when choosing update magnitudes.
    pub(crate) const GRADIENT_CLIP: f32 = 4.0;
    /// Additive guard in the repulsion denominator.
    ///
    /// Replaces ρ with ρ + ε in the repulsion denominator, with ε = 0.001. In real arithmetic this
    /// bounds its nonnegative coefficient by 2γb/ε near zero. It does not prevent `f32` overflow
    /// for arbitrary parameter magnitudes.
    const REPULSION_GUARD: NonNegative = non_negative!(0.001);

    /// Creates a curve from its fitted parameters.
    #[must_use]
    pub(crate) const fn new(a: Positive, b: Positive) -> Self {
        Self { a, b }
    }

    /// Returns the coefficient controlling the affinity's distance scale.
    #[inline]
    #[must_use]
    pub(crate) const fn a(self) -> Positive {
        self.a
    }

    /// Returns the exponent shaping the affinity's decay.
    #[inline]
    #[must_use]
    pub(crate) const fn b(self) -> Positive {
        self.b
    }

    /// Evaluates q(ρ) = 1 / (1 + aρᵇ) at a squared distance.
    ///
    /// A zero `distance_squared` returns one. For positive inputs, this evaluates the model
    /// with [`f32::powf`] and a fused denominator. The real curve decreases monotonically, but no
    /// strict monotonicity or ULP guarantee is made for the approximation. Overflow in the positive
    /// denominator can produce a zero affinity.
    #[must_use]
    pub(crate) fn affinity(self, distance_squared: NonNegative) -> f32 {
        if distance_squared <= 0.0 {
            return 1.0;
        }

        let raised = distance_squared.powf(self.b.into());
        let denominator = Derivation::from(self.a).mul_add(raised, Positive::ONE);
        (Derivation::from(NonNegative::ONE) / denominator).into_raw()
    }

    /// Computes the clipped attraction gradients of four point pairs.
    ///
    /// Lane i acts on `from[i]` toward `to[i]`, following the module's attraction formula and
    /// componentwise clip. For a symmetric update with learning rate η, add ηg to `from` and
    /// subtract ηg from `to`.
    ///
    /// Both endpoint batches must be finite. To obtain finite updates, the computed coefficient and
    /// scaled differences must avoid NaNs. Finite coincident pairs, including computed-zero squared
    /// distances, receive zero.
    #[must_use]
    pub(crate) fn attraction_x4(self, from: Vec2x4T, to: Vec2x4T) -> Vec2x4T {
        let distance_squared = from.distance_squared(to);

        // share ρ^(b−1) between the numerator and denominator, with ρᵇ recovered by multiplication
        let power = pow_f32x4(
            distance_squared,
            Simd::splat((self.b - Positive::ONE).get()),
        );
        let scale = (-Finite::from(positive!(2.0)) * self.a) * self.b;
        let coefficient = (Simd::splat(scale.into_raw()) * power)
            / mul_add_f32x4(
                Simd::splat(self.a.get()) * power,
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
    /// Lane i acts on `from[i]` away from `to[i]`, following the module's regularized repulsion
    /// formula and componentwise clip. `repulsion_strength` is γ. The function moves neither
    /// endpoint.
    ///
    /// Both endpoint batches must be finite. To obtain finite updates, the computed coefficient and
    /// scaled differences must avoid NaNs. Finite coincident pairs, including computed-zero squared
    /// distances, receive zero.
    #[must_use]
    pub(crate) fn repulsion_x4(
        self,
        from: Vec2x4T,
        to: Vec2x4T,
        repulsion_strength: NonNegative,
    ) -> Vec2x4T {
        let distance_squared = from.distance_squared(to);

        let power = pow_f32x4(distance_squared, Simd::splat(self.b.get()));
        let denominator = (Simd::splat(Self::REPULSION_GUARD.get()) + distance_squared)
            * mul_add_f32x4(Simd::splat(self.a.get()), power, Simd::splat(1.0));
        let scale = (positive!(2.0) * repulsion_strength) * self.b;
        let coefficient = Simd::splat(scale.into_raw()) / denominator;

        // Coincident pairs: no direction to push along.
        let coefficient = distance_squared
            .simd_gt(Simd::splat(0.0))
            .select(coefficient, Simd::splat(0.0));

        scaled_clipped_difference(from, to, coefficient)
    }

    /// Computes the clipped attraction gradient of a single point pair.
    ///
    /// This uses [`attraction_x4`](Self::attraction_x4)'s model with scalar powers and distance
    /// arithmetic. Both points and the computed squared distance must be finite. Computed-zero
    /// squared distance returns zero. The coefficient and scaled differences must avoid NaNs
    /// for a finite clipped result. Scalar and SIMD values can differ.
    #[must_use]
    pub(crate) fn attraction(self, from: Vec2, to: Vec2) -> Vec2 {
        let distance_squared = from.distance_squared(to);
        if distance_squared <= 0.0 {
            return Vec2::ZERO;
        }

        let power = distance_squared.powf(self.b - Positive::ONE);
        let numerator = (-Finite::from(positive!(2.0)) * self.a) * self.b * power;
        let denominator =
            (Derivation::from(self.a) * power).mul_add(distance_squared, Positive::ONE);
        let coefficient = numerator / denominator;

        clip_vec2((from - to) * coefficient.into_raw())
    }

    /// Computes the clipped repulsion gradient of a single point pair.
    ///
    /// This uses [`repulsion_x4`](Self::repulsion_x4)'s model with scalar powers and distance
    /// arithmetic. Both points and the computed squared distance must be finite. Computed-zero
    /// squared distance returns zero. The coefficient and scaled differences must avoid NaNs for a
    /// finite clipped result. Scalar and SIMD values can differ.
    #[must_use]
    pub(crate) fn repulsion(self, from: Vec2, to: Vec2, repulsion_strength: NonNegative) -> Vec2 {
        let distance_squared = from.distance_squared(to);
        if distance_squared <= 0.0 {
            return Vec2::ZERO;
        }

        let power = distance_squared.powf(self.b.into());
        let denominator = (Derivation::from(Self::REPULSION_GUARD) + distance_squared)
            * Derivation::from(self.a).mul_add(power, Positive::ONE);
        let coefficient = (positive!(2.0) * repulsion_strength) * self.b / denominator;

        clip_vec2((from - to) * coefficient.into_raw())
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
