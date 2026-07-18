//! `argmin-math` operations for [`BoxedDVecN`].
//!
//! These impls make the boxed double-precision vector a parameter and
//! gradient type for argmin's quasi-Newton solvers: every bulk operation
//! of a solver's inner loop - dot products, norms, vector arithmetic,
//! scaled updates - runs on this crate's `f64x8` kernels instead of a
//! backend's. The set covers what L-BFGS and its line searches demand of
//! both the parameter and the gradient type; operations arrive here with
//! their first demanding solver, never speculatively.
//!
//! Every operation returns a freshly allocated vector, which is argmin's
//! cost model: the solver owns its iteration state and replaces it whole.

use core::{
    alloc::Allocator,
    simd::{f64x8, num::SimdFloat as _},
};

use argmin_math::{
    ArgminAdd, ArgminDot, ArgminL1Norm, ArgminL2Norm, ArgminMinMax, ArgminMul, ArgminScaledAdd,
    ArgminScaledSub, ArgminSignum, ArgminSub, ArgminZeroLike,
};

use super::BoxedDVecN;
use crate::math::kernel::mul_add_f64x8;

#[cfg(test)]
mod tests;

/// Transforms every component of a copy of `source`.
///
/// `lanes_op` handles the aligned 8-lane groups and `scalar_op` the
/// trailing `N % 8` components; both must compute the same function.
#[inline]
fn map<const N: usize, A: Allocator + Clone>(
    source: &BoxedDVecN<N, A>,
    lanes_op: impl Fn(f64x8) -> f64x8,
    scalar_op: impl Fn(f64) -> f64,
) -> BoxedDVecN<N, A> {
    let mut output = source.clone();

    let (lanes, remainder) = output.lanes_mut();
    for lane in lanes {
        *lane = lanes_op(*lane);
    }
    for component in remainder {
        *component = scalar_op(*component);
    }

    output
}

/// Combines the components of `left` and `right` pairwise into a new
/// vector.
///
/// `lanes_op` handles the aligned 8-lane groups and `scalar_op` the
/// trailing `N % 8` components; both must compute the same function.
#[inline]
fn zip<const N: usize, A: Allocator + Clone>(
    left: &BoxedDVecN<N, A>,
    right: &BoxedDVecN<N, A>,
    lanes_op: impl Fn(f64x8, f64x8) -> f64x8,
    scalar_op: impl Fn(f64, f64) -> f64,
) -> BoxedDVecN<N, A> {
    let mut output = left.clone();

    let (lanes, remainder) = output.lanes_mut();
    let (right_lanes, right_remainder) = right.lanes();
    for (lane, &rhs) in lanes.iter_mut().zip(right_lanes) {
        *lane = lanes_op(*lane, rhs);
    }
    for (component, &rhs) in remainder.iter_mut().zip(right_remainder) {
        *component = scalar_op(*component, rhs);
    }

    output
}

impl<const N: usize, A: Allocator + Clone> ArgminDot<Self, f64> for BoxedDVecN<N, A> {
    #[inline]
    fn dot(&self, other: &Self) -> f64 {
        (**self).dot(other)
    }
}

impl<const N: usize, A: Allocator + Clone> ArgminAdd<Self, Self> for BoxedDVecN<N, A> {
    #[inline]
    fn add(&self, other: &Self) -> Self {
        zip(self, other, |lhs, rhs| lhs + rhs, |lhs, rhs| lhs + rhs)
    }
}

impl<const N: usize, A: Allocator + Clone> ArgminAdd<f64, Self> for BoxedDVecN<N, A> {
    #[inline]
    fn add(&self, other: &f64) -> Self {
        let addend = f64x8::splat(*other);
        map(self, |lanes| lanes + addend, |component| component + *other)
    }
}

impl<const N: usize, A: Allocator + Clone> ArgminSub<Self, Self> for BoxedDVecN<N, A> {
    #[inline]
    fn sub(&self, other: &Self) -> Self {
        zip(self, other, |lhs, rhs| lhs - rhs, |lhs, rhs| lhs - rhs)
    }
}

impl<const N: usize, A: Allocator + Clone> ArgminSub<f64, Self> for BoxedDVecN<N, A> {
    #[inline]
    fn sub(&self, other: &f64) -> Self {
        let subtrahend = f64x8::splat(*other);
        map(
            self,
            |lanes| lanes - subtrahend,
            |component| component - *other,
        )
    }
}

impl<const N: usize, A: Allocator + Clone> ArgminMul<Self, Self> for BoxedDVecN<N, A> {
    #[inline]
    fn mul(&self, other: &Self) -> Self {
        zip(self, other, |lhs, rhs| lhs * rhs, |lhs, rhs| lhs * rhs)
    }
}

impl<const N: usize, A: Allocator + Clone> ArgminMul<f64, Self> for BoxedDVecN<N, A> {
    #[inline]
    fn mul(&self, other: &f64) -> Self {
        let factor = f64x8::splat(*other);
        map(self, |lanes| lanes * factor, |component| component * *other)
    }
}

impl<const N: usize, A: Allocator + Clone> ArgminScaledAdd<Self, f64, Self> for BoxedDVecN<N, A> {
    #[inline]
    fn scaled_add(&self, factor: &f64, vec: &Self) -> Self {
        let scale = f64x8::splat(*factor);
        zip(
            self,
            vec,
            |lhs, rhs| mul_add_f64x8(rhs, scale, lhs),
            |lhs, rhs| rhs.mul_add(*factor, lhs),
        )
    }
}

impl<const N: usize, A: Allocator + Clone> ArgminScaledSub<Self, f64, Self> for BoxedDVecN<N, A> {
    #[inline]
    fn scaled_sub(&self, factor: &f64, vec: &Self) -> Self {
        // Negating the factor is exact, so the subtraction fuses like the
        // addition.
        let negated = -*factor;
        let scale = f64x8::splat(negated);
        zip(
            self,
            vec,
            |lhs, rhs| mul_add_f64x8(rhs, scale, lhs),
            |lhs, rhs| rhs.mul_add(negated, lhs),
        )
    }
}

impl<const N: usize, A: Allocator> ArgminL1Norm<f64> for BoxedDVecN<N, A> {
    #[inline]
    fn l1_norm(&self) -> f64 {
        self.abs_sum()
    }
}

impl<const N: usize, A: Allocator> ArgminL2Norm<f64> for BoxedDVecN<N, A> {
    #[inline]
    fn l2_norm(&self) -> f64 {
        self.norm_squared().sqrt()
    }
}

impl<const N: usize, A: Allocator + Clone> ArgminSignum for BoxedDVecN<N, A> {
    #[inline]
    fn signum(mut self) -> Self {
        let (lanes, remainder) = self.lanes_mut();
        for lane in lanes {
            *lane = lane.signum();
        }
        for component in remainder {
            *component = component.signum();
        }

        self
    }
}

impl<const N: usize, A: Allocator + Clone> ArgminMinMax for BoxedDVecN<N, A> {
    #[inline]
    fn min(x: &Self, y: &Self) -> Self {
        zip(x, y, f64x8::simd_min, f64::min)
    }

    #[inline]
    fn max(x: &Self, y: &Self) -> Self {
        zip(x, y, f64x8::simd_max, f64::max)
    }
}

impl<const N: usize, A: Allocator + Clone> ArgminZeroLike for BoxedDVecN<N, A> {
    #[inline]
    fn zero_like(&self) -> Self {
        Self::zero_in(self.alloc.clone())
    }
}
