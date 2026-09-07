//! A prepared corpus evaluated in the solver's scaled coordinates.
//!
//! [`ScaledProblem`] bundles one validated [`Prepared`] corpus with one validated [`SolverConfig`]
//! and the corpus's [`GramView`], and exposes the physical evaluations transformed into the
//! solver's scaled coordinates. With the preparation diagonal `D`, points map as `θ(ζ) = D⁻¹ζ`,
//! gradients as `gζ = D⁻¹gθ`, and Hessian-vector products as `Hζ[v] = D⁻¹·Hθ[D⁻¹v]`. Physical
//! evaluation receives `θ(ζ)` only at this boundary, so every quantity the loop compares or
//! accumulates lives in one coordinate system.
//!
//! The underlying evaluations charge all the work themselves, and the coordinate transformations
//! add no traversals.

use super::{
    ContrastVector, SOLVER_DIMENSIONS, config::SolverConfig, gram::GramView, prepare::Prepared,
    work::WorkCounters,
};
use crate::math::{AlignedDVecN, BoxedDVecN};

/// A prepared corpus and validated configuration evaluated in scaled coordinates.
#[derive(Debug)]
pub(crate) struct ScaledProblem<'corpus> {
    /// The validated corpus with its closed targets and preparation-time diagonal.
    pub prepared: Prepared<'corpus>,
    /// The corpus's window onto the fit-level Gram matrix, row for row.
    pub gram: GramView<'corpus>,
    /// The validated solver-loop configuration.
    pub config: SolverConfig,
}

impl ScaledProblem<'_> {
    /// The physical contrast point `θ(ζ) = D⁻¹ζ`.
    pub(crate) fn point(&self, zeta: &AlignedDVecN<SOLVER_DIMENSIONS>) -> ContrastVector {
        ContrastVector::from_flat(&self.prepared.scaling.divide(zeta))
    }

    /// Evaluates the normalized objective and scaled gradient in one joint traversal.
    ///
    /// Returns [`None`] for a non-finite request, charged as a request only.
    pub(super) fn joint(
        &self,
        point: &ContrastVector,
        counters: &mut WorkCounters,
    ) -> Option<(f64, BoxedDVecN<SOLVER_DIMENSIONS>)> {
        let evaluation = self.prepared.joint(point, counters)?;
        Some((evaluation.objective, self.scaled(&evaluation.gradient)))
    }

    /// Evaluates the normalized objective alone.
    pub(super) fn objective(&self, point: &ContrastVector, counters: &mut WorkCounters) -> f64 {
        self.prepared.objective_only(point, counters)
    }

    /// Evaluates the scaled gradient `gζ = D⁻¹gθ` alone.
    ///
    /// Returns [`None`] for a non-finite request, charged as a request only.
    pub(super) fn gradient(
        &self,
        point: &ContrastVector,
        counters: &mut WorkCounters,
    ) -> Option<BoxedDVecN<SOLVER_DIMENSIONS>> {
        let gradient = self.prepared.gradient_only(point, counters)?;
        Some(self.scaled(&gradient))
    }

    /// Evaluates the scaled Hessian-vector product `Hζ[v] = D⁻¹·Hθ[D⁻¹v]` at the physical point.
    ///
    /// Returns [`None`] for a non-finite request, charged as a request only.
    pub(super) fn hessian_vector(
        &self,
        point: &ContrastVector,
        direction: &AlignedDVecN<SOLVER_DIMENSIONS>,
        counters: &mut WorkCounters,
    ) -> Option<BoxedDVecN<SOLVER_DIMENSIONS>> {
        let physical = ContrastVector::from_flat(&self.prepared.scaling.divide(direction));
        let product = self.prepared.hessian_vector(point, &physical, counters)?;
        Some(self.scaled(&product))
    }

    /// Applies `D⁻¹` to a physical derivative in flat layout.
    fn scaled(&self, vector: &ContrastVector) -> BoxedDVecN<SOLVER_DIMENSIONS> {
        self.prepared.scaling.divide(&vector.to_flat())
    }
}
