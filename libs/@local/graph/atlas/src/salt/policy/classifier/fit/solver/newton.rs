//! The exact Newton inner solve through the row-space capacitance factorization.
//!
//! One inner solve computes the Newton step of the local quadratic model at the accepted point,
//! exactly and at conditioning-independent cost. The data Hessian has rank at most `2n` for `n`
//! corpus rows, far below the parameter dimension, so the coefficient block solves through the
//! Woodbury identity in row space and the two intercepts through a Schur complement:
//!
//! ```text
//! A₁₁ = (λ/S)·(I + ŨŨᵀ),  ũ_{i,k} = √(wᵢ/λ)·(Lᵢ[:,k] ⊗ x̄ᵢ),  LᵢLᵢᵀ = Cᵢ
//! A₁₁⁻¹ = (S/λ)·(I − Ũ·C⁻¹·Ũᵀ),  C = I₂ₙ + ŨᵀŨ  (SPD by construction)
//! (ŨᵀŨ)_{(i,k),(j,l)} = Kᵢⱼ·(L̃ᵢᵀL̃ⱼ)_{k,l},  L̃ᵢ = √(wᵢ/λ)·Lᵢ
//! ```
//!
//! `Kᵢⱼ` is the data Gram assembled once per fit ([`gram`](super::gram)); only the per-row `2×2`
//! factors `L̃ᵢ` are per-outer. `Ũ` is applied row-structurally - two wide dots per row on the
//! way down, two scaled accumulations on the way up - and is never materialized. One
//! capacitance Cholesky factor serves the three coefficient solves (the gradient and the two
//! intercept coupling columns); the `2×2` intercept Schur system finishes the point. The system
//! is solved in physical coordinates and the step returns as `sζ = D·sφ`, exact Newton being
//! invariant under the preparation diagonal.
//!
//! A Newton point inside the trust radius returns as [`NewtonTag::NewtonInterior`] with its
//! Hessian product priced through one certified oracle product - which also yields the recorded
//! relative Newton residual `‖Hζ·p + gζ‖/‖gζ‖`, the per-outer certificate of the factorization
//! against the oracle. A Newton point at or past the radius falls back to the classic dogleg:
//! the Cauchy point prices one additional oracle product, degenerate Cauchy curvature takes the
//! steepest-descent boundary crossing, and every crossing constructs through the validated
//! [`boundary`](super::boundary) machinery.
//!
//! Work is bounded before it happens: the three assembly traversals preflight the row budget
//! and every oracle product preflights the Hessian-vector and row budgets, all net of the final
//! reserve. Every arithmetic escape is a typed [`SolverFailure`] naming its [`NewtonStage`].
//! The factored blocks define the model the step solves; rounding drift between that model and
//! the oracle is measured by the recorded residual, never assumed away.

use super::{
    CONTRAST_ROWS, ContrastVector, SOLVER_DIMENSIONS,
    boundary::boundary_step,
    flat,
    problem::ScaledProblem,
    solve::SolverControl,
    stable::{checked_dot, checked_norm_squared, stable_l2},
    terminal::{NewtonStage, SolverFailure},
};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    math::{AlignedDVecN, BoxedDVecN, DCholeskyError, DSquareMatrix},
};

/// The terminating tag of a successful inner solve.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum NewtonTag {
    /// The Newton point lies strictly inside the trust region.
    NewtonInterior,
    /// The dogleg segment's crossing onto the trust boundary.
    DoglegBoundary,
    /// The steepest-descent crossing onto the trust boundary.
    CauchyBoundary,
}

/// A successful inner outcome: the step, its Hessian product, the tag, and the residual.
#[derive(Debug)]
pub(super) struct NewtonOutcome {
    /// The returned step `p` in scaled coordinates.
    step: BoxedDVecN<SOLVER_DIMENSIONS>,
    /// The matching oracle product `Hζ·p`.
    hessian_step: BoxedDVecN<SOLVER_DIMENSIONS>,
    /// The terminating tag.
    tag: NewtonTag,
    /// The relative Newton residual `‖Hζ·p_N + gζ‖/‖gζ‖` where the Newton point was priced;
    /// [`None`] on a steepest-descent outer, whose Newton product is never requested.
    residual: Option<f64>,
}

impl NewtonOutcome {
    /// The returned step `p` in scaled coordinates.
    pub(super) const fn step(&self) -> &AlignedDVecN<SOLVER_DIMENSIONS> {
        &self.step
    }

    /// The matching product `Hζ·p` returned with the step.
    pub(super) const fn hessian_step(&self) -> &AlignedDVecN<SOLVER_DIMENSIONS> {
        &self.hessian_step
    }

    /// Whether the outcome carries a validated boundary crossing.
    pub(super) const fn is_boundary(&self) -> bool {
        !matches!(self.tag, NewtonTag::NewtonInterior)
    }

    /// The terminating tag of the outcome.
    pub(super) const fn tag(&self) -> NewtonTag {
        self.tag
    }

    /// The relative Newton residual, where the Newton product was priced.
    pub(super) const fn residual(&self) -> Option<f64> {
        self.residual
    }
}

/// The typed non-finite failure of one Newton stage.
const fn non_finite(stage: NewtonStage) -> SolverFailure {
    SolverFailure::NonFiniteNewton { stage }
}

/// One row's scaled curvature factor `L̃ᵢ` in packed lower-triangle order `(l11, l21, l22)`.
type RowFactor = [f64; 3];

/// The coefficient rows of one structured solver vector.
type CoefficientRows = [BoxedDVecN<CANONICAL_DIMENSIONS>; CONTRAST_ROWS];

/// Zeroed coefficient rows.
fn zero_rows() -> CoefficientRows {
    core::array::from_fn(|_index| BoxedDVecN::zero())
}

/// Factors a `2×2` PSD block in packed lower-triangle order, zeroing a rank-dropped column.
///
/// A non-positive leading entry zeroes the first column - the fate of a saturated row whose
/// probabilities sit at a vertex - and a non-positive trailing pivot zeroes the second, so
/// every PSD block factors and `L·Lᵀ` reproduces the block exactly on its numerical rank.
pub(super) fn factor_block(c11: f64, c21: f64, c22: f64) -> RowFactor {
    if c11 <= 0.0 {
        let l22 = if c22 > 0.0 { c22.sqrt() } else { 0.0 };
        return [0.0, 0.0, l22];
    }

    let l11 = c11.sqrt();
    let l21 = c21 / l11;
    let pivot = l21.mul_add(-l21, c22);
    let l22 = if pivot > 0.0 { pivot.sqrt() } else { 0.0 };
    [l11, l21, l22]
}

/// The dot of packed factor columns `L̃ᵢ[:,k]·L̃ⱼ[:,l]`.
#[expect(
    clippy::min_ident_chars,
    reason = "k and l are the factor-column indices of the written algebra"
)]
#[inline]
fn column_dot(left: RowFactor, k: usize, right: RowFactor, l: usize) -> f64 {
    let left_column = if k == 0 {
        [left[0], left[1]]
    } else {
        [0.0, left[2]]
    };
    let right_column = if l == 0 {
        [right[0], right[1]]
    } else {
        [0.0, right[2]]
    };
    left_column[0].mul_add(right_column[0], left_column[1] * right_column[1])
}

/// Runs one exact Newton inner solve at the accepted point.
///
/// `point` is the physical image `θ(ζ)` of the accepted iterate and `gradient` its scaled
/// gradient. The Newton point prices one oracle Hessian-vector product; a boundary outer prices
/// one for the Cauchy curvature first and the dogleg segment prices the Newton product as well.
/// Budgets are tested before the work they fence: the row budget before every assembly
/// traversal, the Hessian-vector and row budgets before every oracle product.
///
/// # Errors
///
/// Returns [`SolverFailure::HvpBudget`] or [`SolverFailure::RowPassBudget`] when another unit
/// of work would exceed its budget, [`SolverFailure::NonFiniteNewton`] naming the stage where a
/// value left the finite domain, [`SolverFailure::SingularInterceptCurvature`] when no row
/// offers the intercepts curvature, and [`SolverFailure::NoFiniteBoundaryStep`] when a boundary
/// crossing could not be validated.
#[expect(
    clippy::too_many_lines,
    reason = "the assembly, factorization, back-substitution, and dogleg fallback are one solve; \
              every stage names its terminal in place, and splitting them would scatter the \
              coordinate and sign conventions"
)]
#[expect(
    clippy::min_ident_chars,
    reason = "i, j, k, and l are the row and factor-column indices of the written algebra"
)]
#[expect(
    clippy::panic_in_result_fn,
    reason = "a gram view covering a different corpus is a plumbing invariant violation, not a \
              solver terminal"
)]
pub(super) fn newton_step(
    problem: &ScaledProblem<'_>,
    point: &ContrastVector,
    gradient: &AlignedDVecN<SOLVER_DIMENSIONS>,
    control: &mut SolverControl,
) -> Result<NewtonOutcome, SolverFailure> {
    let config = &problem.config;
    let prepared = &problem.prepared;
    let rows = prepared.rows.len();
    assert_eq!(
        problem.gram.order(),
        rows,
        "the gram view covers exactly the prepared corpus rows",
    );

    // The physical right-hand side: gφ = D·gζ, one componentwise multiplication.
    let physical_flat = prepared.scaling.multiply(gradient);
    if !physical_flat.is_finite() {
        return Err(non_finite(NewtonStage::Weights));
    }
    let physical_gradient = ContrastVector::from_flat(&physical_flat);

    // Three assembly traversals per solve: curvature, projection down, lift back up.
    if control.free_row_traversals(config) < 3 {
        return Err(SolverFailure::RowPassBudget);
    }

    let evaluation = prepared
        .curvature_pass(point, &mut control.counters)
        .ok_or(non_finite(NewtonStage::Weights))?;
    if !evaluation
        .intercept_columns
        .iter()
        .all(ContrastVector::is_finite)
    {
        return Err(non_finite(NewtonStage::Weights));
    }

    // Per-row scaled factors L̃ᵢ with L̃ᵢL̃ᵢᵀ = (wᵢ/λ)·Cᵢ.
    let regularization = prepared.regularization;
    let mut factors = Vec::with_capacity(rows);
    for (block, row) in evaluation.blocks.iter().zip(prepared.rows) {
        let scale = row.weight / regularization;
        let scaled = [scale * block[0], scale * block[1], scale * block[2]];
        if !scaled.iter().all(|entry| entry.is_finite()) {
            return Err(non_finite(NewtonStage::Weights));
        }

        factors.push(factor_block(scaled[0], scaled[1], scaled[2]));
    }

    // Capacitance C = I + ŨᵀŨ, lower triangle only; block (i, j) reads Kᵢⱼ once per entry.
    let order = 2 * rows;
    let mut capacitance = DSquareMatrix::zeroed(order);
    for i in 0..rows {
        for k in 0..2 {
            let row_index = 2 * i + k;
            let row_slice = capacitance.row_mut(row_index);

            for j in 0..=i {
                let gram_entry = problem.gram.entry(i, j);

                for l in 0..2 {
                    let column = 2 * j + l;
                    if column > row_index {
                        break;
                    }

                    let mut value = gram_entry * column_dot(factors[i], k, factors[j], l);
                    if column == row_index {
                        value += 1.0;
                    }

                    row_slice[column] = value;
                }
            }
        }
    }

    control.counters.record_factorization();
    let factor = capacitance.cholesky().map_err(|error| match error {
        // A non-finite pivot is the fate of a non-finite assembled entry; a finite non-positive
        // pivot rejects the factorization itself.
        DCholeskyError::NonFinitePivot { .. } => non_finite(NewtonStage::Capacitance),
        DCholeskyError::NonPositivePivot { .. } => non_finite(NewtonStage::Factor),
    })?;

    // Ũᵀ pass, fused over the three right-hand sides: t_{(i,k)} = L̃ᵢ[:,k]·(v·x̄ᵢ).
    let right_hand_sides: [&CoefficientRows; 3] = [
        &physical_gradient.coefficients,
        &evaluation.intercept_columns[0].coefficients,
        &evaluation.intercept_columns[1].coefficients,
    ];
    let mut projected: [Vec<f64>; 3] = core::array::from_fn(|_index| vec![0.0_f64; order]);
    for (row_index, embedding) in prepared.embeddings.iter().enumerate() {
        if row_index == 0 {
            control.counters.start_newton_traversal();
        }
        control.counters.visit_row();

        let [l11, l21, l22] = factors[row_index];
        for (target, side) in projected.iter_mut().zip(right_hand_sides) {
            let along = [embedding.dot_wide(&side[0]), embedding.dot_wide(&side[1])];
            target[2 * row_index] = l11.mul_add(along[0], l21 * along[1]);
            target[2 * row_index + 1] = l22 * along[1];
        }
    }
    control.counters.complete_newton_traversal();

    for target in &mut projected {
        factor.solve_in_place(target);
        if !target.iter().all(|value| value.is_finite()) {
            return Err(non_finite(NewtonStage::Solve));
        }
    }

    // Ũ pass, fused: lift the capacitance solutions back to coefficient space.
    let mut lifted: [CoefficientRows; 3] = core::array::from_fn(|_index| zero_rows());
    for (row_index, embedding) in prepared.embeddings.iter().enumerate() {
        if row_index == 0 {
            control.counters.start_newton_traversal();
        }
        control.counters.visit_row();

        let [l11, l21, l22] = factors[row_index];
        for (accumulator, solution) in lifted.iter_mut().zip(&projected) {
            let leading = solution[2 * row_index];
            let trailing = solution[2 * row_index + 1];
            accumulator[0].add_scaled(embedding, l11 * leading);
            accumulator[1].add_scaled(embedding, l21.mul_add(leading, l22 * trailing));
        }
    }
    control.counters.complete_newton_traversal();

    // A₁₁⁻¹v = (S/λ)·(v − Ũ·C⁻¹·Ũᵀv) per right-hand side.
    let woodbury_scale = prepared.total_weight / regularization;
    let mut solved: [CoefficientRows; 3] = core::array::from_fn(|_index| zero_rows());
    for ((output, lift), side) in solved.iter_mut().zip(&lifted).zip(right_hand_sides) {
        for ((out, lifted_row), side_row) in output.iter_mut().zip(lift).zip(side) {
            out.clone_from(side_row);
            out.mul_add(lifted_row, -1.0);
            **out *= woodbury_scale;
        }
        if !output.iter().all(|row| row.is_finite()) {
            return Err(non_finite(NewtonStage::Solve));
        }
    }
    let [descent, coupling_first, coupling_second] = solved;

    // Intercept Schur complement: S[j][k] = A₂₂[j][k] − ⟨A₁₂e_j, Z_k⟩, solved as the strict
    // 2×2 Cholesky; a non-positive pivot means no row offers the intercepts curvature.
    let couplings = [&coupling_first, &coupling_second];
    let mut schur = [0.0_f64; 3];
    let schur_entries = [(0_usize, 0_usize), (1, 0), (1, 1)];
    for (slot, (j, k)) in schur_entries.into_iter().enumerate() {
        let curvature = evaluation.intercept_columns[k].intercepts[j];
        let correction = pair_dot(&evaluation.intercept_columns[j].coefficients, couplings[k]);
        schur[slot] = curvature - correction;
    }
    if !schur.iter().all(|entry| entry.is_finite()) {
        return Err(non_finite(NewtonStage::InterceptSchur));
    }

    let intercept_rhs = [
        pair_dot(&evaluation.intercept_columns[0].coefficients, &descent)
            - physical_gradient.intercepts[0],
        pair_dot(&evaluation.intercept_columns[1].coefficients, &descent)
            - physical_gradient.intercepts[1],
    ];
    let intercepts =
        solve_intercepts(schur, intercept_rhs).ok_or(SolverFailure::SingularInterceptCurvature)?;
    if !intercepts.iter().all(|value| value.is_finite()) {
        return Err(non_finite(NewtonStage::InterceptSchur));
    }

    // s_A = −w − Z₀·s_b[0] − Z₁·s_b[1], then sζ = D·sφ.
    let mut coefficients = zero_rows();
    for (slot, row) in coefficients.iter_mut().enumerate() {
        row.clone_from(&descent[slot]);
        row.negate();
        row.mul_add(&coupling_first[slot], -intercepts[0]);
        row.mul_add(&coupling_second[slot], -intercepts[1]);
    }
    let physical_step = ContrastVector {
        coefficients,
        intercepts,
    };
    let step = prepared.scaling.multiply(&physical_step.to_flat());
    if !step.is_finite() {
        return Err(non_finite(NewtonStage::NewtonPoint));
    }
    let step_norm = stable_l2(&step).ok_or(non_finite(NewtonStage::NewtonPoint))?;

    // Interior Newton point: price it through the oracle and return.
    if step_norm < control.radius {
        let hessian_step =
            priced_product(problem, point, &step, control, NewtonStage::NewtonPoint)?;
        let residual = newton_residual(&hessian_step, gradient);
        return Ok(NewtonOutcome {
            step,
            hessian_step,
            tag: NewtonTag::NewtonInterior,
            residual,
        });
    }

    // Dogleg fallback: one oracle product prices the Cauchy curvature g·Hg.
    let hessian_gradient = priced_product(problem, point, gradient, control, NewtonStage::Dogleg)?;
    let curvature =
        checked_dot(gradient, &hessian_gradient).ok_or(non_finite(NewtonStage::Dogleg))?;
    let gradient_norm = stable_l2(gradient).ok_or(non_finite(NewtonStage::Dogleg))?;
    let product_norm = stable_l2(&hessian_gradient).ok_or(non_finite(NewtonStage::Dogleg))?;
    let guard =
        f64::from(config.curvature_guard_ulps.get()) * f64::EPSILON * gradient_norm * product_norm;
    if !guard.is_finite() {
        return Err(non_finite(NewtonStage::Dogleg));
    }

    let zero = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();

    // Degenerate Cauchy curvature: the steepest-descent crossing without division.
    if curvature <= guard {
        return steepest_crossing(gradient, &hessian_gradient, control.radius);
    }

    let gradient_square = checked_norm_squared(gradient).ok_or(non_finite(NewtonStage::Dogleg))?;
    let cauchy_length = gradient_square / curvature;
    if !cauchy_length.is_finite() {
        return Err(non_finite(NewtonStage::Dogleg));
    }
    let cauchy = flat::advance(&zero, -cauchy_length, gradient);
    if !cauchy.is_finite() {
        return Err(non_finite(NewtonStage::Dogleg));
    }
    let cauchy_norm = stable_l2(&cauchy).ok_or(non_finite(NewtonStage::Dogleg))?;

    // A Cauchy point at or past the radius: the whole first leg leaves the region.
    if cauchy_norm >= control.radius {
        return steepest_crossing(gradient, &hessian_gradient, control.radius);
    }

    // The dogleg leg from the interior Cauchy point toward the Newton point; the Newton
    // product prices here and carries the recorded residual.
    let hessian_newton = priced_product(problem, point, &step, control, NewtonStage::NewtonPoint)?;
    let residual = newton_residual(&hessian_newton, gradient);

    let direction = flat::advance(&step, -1.0, &cauchy);
    let hessian_cauchy = flat::advance(&zero, -cauchy_length, &hessian_gradient);
    let hessian_direction = flat::advance(&hessian_newton, cauchy_length, &hessian_gradient);
    if !direction.is_finite() || !hessian_cauchy.is_finite() || !hessian_direction.is_finite() {
        return Err(non_finite(NewtonStage::Dogleg));
    }

    let crossed = boundary_step(
        &cauchy,
        &direction,
        &hessian_cauchy,
        &hessian_direction,
        control.radius,
    )
    .ok_or(SolverFailure::NoFiniteBoundaryStep)?;

    Ok(NewtonOutcome {
        step: crossed.step,
        hessian_step: crossed.hessian_step,
        tag: NewtonTag::DoglegBoundary,
        residual,
    })
}

/// The structured coefficient dot `Σ_slot left[slot]·right[slot]`, folded in contrast order.
fn pair_dot(left: &CoefficientRows, right: &CoefficientRows) -> f64 {
    let mut sum = 0.0_f64;
    for (left_row, right_row) in left.iter().zip(right) {
        sum += left_row.dot(right_row);
    }
    sum
}

/// Solves the `2×2` SPD intercept system through its strict Cholesky factor.
///
/// The caller passes finite entries; a pivot that is not strictly positive returns [`None`],
/// the system offering the intercepts no curvature, and overflowing back-substitution passes
/// through as non-finite solutions for the caller's finiteness gate.
fn solve_intercepts([s11, s21, s22]: [f64; 3], rhs: [f64; 2]) -> Option<[f64; 2]> {
    if s11 <= 0.0 {
        return None;
    }

    let l11 = s11.sqrt();
    // With finite entries the second pivot is finite or -∞, so the ordering test is total.
    let l21 = s21 / l11;
    let pivot = l21.mul_add(-l21, s22);
    if pivot <= 0.0 {
        return None;
    }
    let l22 = pivot.sqrt();

    // Forward substitution L·y = rhs, then back substitution Lᵀ·s = y.
    let y0 = rhs[0] / l11;
    let y1 = l21.mul_add(-y0, rhs[1]) / l22;
    let s1 = y1 / l22;
    let s0 = l21.mul_add(-s1, y0) / l11;
    Some([s0, s1])
}

/// One oracle Hessian-vector product behind its budget preflights.
fn priced_product(
    problem: &ScaledProblem<'_>,
    point: &ContrastVector,
    direction: &AlignedDVecN<SOLVER_DIMENSIONS>,
    control: &mut SolverControl,
    stage: NewtonStage,
) -> Result<BoxedDVecN<SOLVER_DIMENSIONS>, SolverFailure> {
    if control.counters.hvp_requests == problem.config.maximum_hvp_requests.get() {
        return Err(SolverFailure::HvpBudget);
    }
    if control.free_row_traversals(&problem.config) < 1 {
        return Err(SolverFailure::RowPassBudget);
    }

    // A rejected request and a non-finite product share the typed stage failure.
    problem
        .hessian_vector(point, direction, &mut control.counters)
        .filter(|product| product.is_finite())
        .ok_or(SolverFailure::NonFiniteNewton { stage })
}

/// The relative Newton residual `‖Hζ·p_N + gζ‖/‖gζ‖` of a priced Newton product.
fn newton_residual(
    hessian_newton: &AlignedDVecN<SOLVER_DIMENSIONS>,
    gradient: &AlignedDVecN<SOLVER_DIMENSIONS>,
) -> Option<f64> {
    let defect = flat::advance(hessian_newton, 1.0, gradient);
    let defect_norm = stable_l2(&defect)?;
    let gradient_norm = stable_l2(gradient)?;
    let residual = defect_norm / gradient_norm;
    residual.is_finite().then_some(residual)
}

/// The steepest-descent crossing onto the trust boundary, from the origin along `−g`.
fn steepest_crossing(
    gradient: &AlignedDVecN<SOLVER_DIMENSIONS>,
    hessian_gradient: &AlignedDVecN<SOLVER_DIMENSIONS>,
    radius: f64,
) -> Result<NewtonOutcome, SolverFailure> {
    let zero = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    let direction = flat::negated(gradient);
    let hessian_direction = flat::negated(hessian_gradient);

    let crossed = boundary_step(&zero, &direction, &zero, &hessian_direction, radius)
        .ok_or(SolverFailure::NoFiniteBoundaryStep)?;

    Ok(NewtonOutcome {
        step: crossed.step,
        hessian_step: crossed.hessian_step,
        tag: NewtonTag::CauchyBoundary,
        residual: None,
    })
}
