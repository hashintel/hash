//! The solve-ready problem: a prepared corpus evaluated in scaled coordinates.
//!
//! [`ScaledProblem`] bundles one validated [`Prepared`] corpus with one validated
//! [`SolverConfig`] and exposes the physical evaluations transformed into the solver's scaled
//! coordinates: with the preparation diagonal `D`, points map as `θ(ζ) = D⁻¹ζ`, gradients as
//! `gζ = D⁻¹gθ`, and Hessian-vector products as `Hζ[v] = D⁻¹·Hθ[D⁻¹v]`. Physical evaluation
//! receives `θ(ζ)` only at this boundary, so every quantity the loop compares or accumulates
//! lives in one coordinate system.
//!
//! Work is charged by the underlying evaluations themselves; the coordinate transformations add
//! no traversals.

use super::{
    ContrastVector, SOLVER_DIMENSIONS, config::SolverConfig, prepare::Prepared, work::WorkCounters,
};
use crate::math::{AlignedDVecN, BoxedDVecN};

/// A prepared corpus and validated configuration evaluated in scaled coordinates.
#[derive(Debug)]
pub(super) struct ScaledProblem<'corpus> {
    /// The validated corpus with its closed targets and preparation-time diagonal.
    pub prepared: Prepared<'corpus>,
    /// The validated solver-loop configuration.
    pub config: SolverConfig,
}

impl ScaledProblem<'_> {
    /// The physical contrast point `θ(ζ) = D⁻¹ζ`.
    pub(super) fn point(&self, zeta: &AlignedDVecN<SOLVER_DIMENSIONS>) -> ContrastVector {
        ContrastVector::from_flat(&self.prepared.scaling.divide(zeta))
    }

    /// Evaluates the normalized objective and scaled gradient in one joint traversal.
    pub(super) fn joint(
        &self,
        point: &ContrastVector,
        counters: &mut WorkCounters,
    ) -> (f64, BoxedDVecN<SOLVER_DIMENSIONS>) {
        let evaluation = self.prepared.joint(point, counters);
        (evaluation.objective, self.scaled(&evaluation.gradient))
    }

    /// Evaluates the normalized objective alone.
    pub(super) fn objective(&self, point: &ContrastVector, counters: &mut WorkCounters) -> f64 {
        self.prepared.objective_only(point, counters)
    }

    /// Evaluates the scaled gradient `gζ = D⁻¹gθ` alone.
    pub(super) fn gradient(
        &self,
        point: &ContrastVector,
        counters: &mut WorkCounters,
    ) -> BoxedDVecN<SOLVER_DIMENSIONS> {
        self.scaled(&self.prepared.gradient_only(point, counters))
    }

    /// Evaluates the scaled Hessian-vector product `Hζ[v] = D⁻¹·Hθ[D⁻¹v]` at the physical point.
    pub(super) fn hessian_vector(
        &self,
        point: &ContrastVector,
        direction: &AlignedDVecN<SOLVER_DIMENSIONS>,
        counters: &mut WorkCounters,
    ) -> BoxedDVecN<SOLVER_DIMENSIONS> {
        let physical = ContrastVector::from_flat(&self.prepared.scaling.divide(direction));
        self.scaled(&self.prepared.hessian_vector(point, &physical, counters))
    }

    /// Applies `D⁻¹` to a physical derivative in flat layout.
    fn scaled(&self, vector: &ContrastVector) -> BoxedDVecN<SOLVER_DIMENSIONS> {
        self.prepared.scaling.divide(&vector.to_flat())
    }
}
