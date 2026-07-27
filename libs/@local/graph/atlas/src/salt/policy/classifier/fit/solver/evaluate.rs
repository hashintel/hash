//! Analytical objective, gradient, and Hessian-vector products over a prepared corpus.
//!
//! All four evaluations share one per-row logits path: contrast logits `t = T·x̄`, class logits
//! `ℓ = B·t`, reference differences `δ_c = ℓ_c − ℓ_2`, one stable log-sum-exp over
//! `(δ_0, δ_1, 0)` in class order, and probabilities from the same shifted exponentials. The
//! objective, the gradient residual `p − q`, and the Hessian curvature `diag(p) − ppᵀ` all read
//! these shared bytes, so no evaluation can disagree with another about a row's logits.
//!
//! The evaluated quantities are normalized by the total weight `S`:
//!
//! ```text
//! F̄(T)   = (1/S)·[Σ_i w_i·(logsumexp(δ_0, δ_1, 0) − u_0δ_0 − u_1δ_1) + (λ/2)·‖A‖²]
//! ∇F̄(T)  = (1/S)·Σ_i w_i·Bᵀ(p_i − q_i)·x̄_iᵀ + (λ/S)·[A|0]
//! H[U]   = (1/S)·Σ_i w_i·Bᵀ(diag(p_i) − p_ip_iᵀ)·B·U·x̄_i·x̄_iᵀ + (λ/S)·[U_coefficients|0]
//! ```
//!
//! Rows accumulate in ascending original index; classes fold in discriminant order. Results are
//! plain values that may be non-finite when the arithmetic overflows - every caller maps a
//! non-finite objective, gradient, or product onto its own typed outcome. A request whose
//! parameters are already non-finite is charged as a request only: it starts no traversal and
//! visits no rows.

use super::{ContrastVector, basis, prepare::Prepared, work::WorkCounters};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    math::{AlignedVecN, VecN},
    salt::policy::GeometryClass,
};

/// One shared per-row logits evaluation.
struct RowPrelude {
    /// Reference differences `δ_0` and `δ_1`; `δ_2` is zero by construction.
    delta: [f64; 2],
    /// `logsumexp(δ_0, δ_1, 0)`, stable under the class-order shifted fold.
    log_normalizer: f64,
    /// Class probabilities from the same shifted exponentials.
    probabilities: [f64; GeometryClass::COUNT],
}

/// Objective value and gradient from one joint traversal.
#[derive(Debug)]
pub(super) struct JointEvaluation {
    pub objective: f64,
    pub gradient: ContrastVector,
}

impl Prepared<'_> {
    /// Evaluates the normalized objective and gradient in one traversal.
    pub(super) fn joint(
        &self,
        parameters: &ContrastVector,
        counters: &mut WorkCounters,
    ) -> JointEvaluation {
        counters.request_joint();
        if !parameters.is_finite() {
            return JointEvaluation {
                objective: f64::NAN,
                gradient: non_finite_vector(),
            };
        }

        let mut data_loss = 0.0_f64;
        let mut gradient = ContrastVector::zero();
        for (row_index, (embedding, row)) in self.embeddings.iter().zip(self.rows).enumerate() {
            if row_index == 0 {
                counters.start_joint_traversal();
            }
            counters.visit_row();

            let prelude = row_prelude(parameters, embedding);
            data_loss = row
                .weight
                .mul_add(prelude.loss(self.targets[row_index].leading()), data_loss);
            accumulate_residual(
                &mut gradient,
                &prelude,
                self.targets[row_index].components(),
                row.weight,
                embedding,
            );
        }
        counters.complete_joint_traversal();

        self.finish_gradient(&mut gradient, parameters);
        JointEvaluation {
            objective: self.finish_objective(data_loss, parameters),
            gradient,
        }
    }

    /// Evaluates the normalized objective alone.
    pub(super) fn objective_only(
        &self,
        parameters: &ContrastVector,
        counters: &mut WorkCounters,
    ) -> f64 {
        counters.request_objective();
        if !parameters.is_finite() {
            return f64::NAN;
        }

        let mut data_loss = 0.0_f64;
        for (row_index, (embedding, row)) in self.embeddings.iter().zip(self.rows).enumerate() {
            if row_index == 0 {
                counters.start_objective_traversal();
            }
            counters.visit_row();

            let prelude = row_prelude(parameters, embedding);
            data_loss = row
                .weight
                .mul_add(prelude.loss(self.targets[row_index].leading()), data_loss);
        }
        counters.complete_objective_traversal();

        self.finish_objective(data_loss, parameters)
    }

    /// Evaluates the normalized gradient alone.
    pub(super) fn gradient_only(
        &self,
        parameters: &ContrastVector,
        counters: &mut WorkCounters,
    ) -> ContrastVector {
        counters.request_gradient();
        if !parameters.is_finite() {
            return non_finite_vector();
        }

        let mut gradient = ContrastVector::zero();
        for (row_index, (embedding, row)) in self.embeddings.iter().zip(self.rows).enumerate() {
            if row_index == 0 {
                counters.start_gradient_traversal();
            }
            counters.visit_row();

            let prelude = row_prelude(parameters, embedding);
            accumulate_residual(
                &mut gradient,
                &prelude,
                self.targets[row_index].components(),
                row.weight,
                embedding,
            );
        }
        counters.complete_gradient_traversal();

        self.finish_gradient(&mut gradient, parameters);
        gradient
    }

    /// Evaluates the normalized Hessian-vector product `H[U]` at the given parameters.
    pub(super) fn hessian_vector(
        &self,
        parameters: &ContrastVector,
        direction: &ContrastVector,
        counters: &mut WorkCounters,
    ) -> ContrastVector {
        counters.request_hvp();
        if !parameters.is_finite() || !direction.is_finite() {
            return non_finite_vector();
        }

        let mut product = ContrastVector::zero();
        for (row_index, (embedding, row)) in self.embeddings.iter().zip(self.rows).enumerate() {
            if row_index == 0 {
                counters.start_hvp_traversal();
            }
            counters.visit_row();

            let prelude = row_prelude(parameters, embedding);

            // ν = U·x̄, then z = B·ν in class space.
            let projected = basis::expand(contrast_logits(direction, embedding));

            // (diag(p) − ppᵀ)·z = p ⊙ (z − (pᵀz)·1), folded in class order.
            let mut alignment = 0.0_f64;
            for (probability, component) in prelude.probabilities.into_iter().zip(projected) {
                alignment = probability.mul_add(component, alignment);
            }
            let mut curved = [0.0_f64; GeometryClass::COUNT];
            for ((out, probability), component) in
                curved.iter_mut().zip(prelude.probabilities).zip(projected)
            {
                *out = probability * (component - alignment);
            }

            let contrast = basis::reduce(curved);
            for (row_slot, weight_share) in contrast.into_iter().enumerate() {
                let scaled = row.weight * weight_share;
                product.coefficients[row_slot]
                    .add_scaled(VecN::from_ref(embedding.as_array()), scaled);
                product.intercepts[row_slot] += scaled;
            }
        }
        counters.complete_hvp_traversal();

        // Normalize and add the coefficient-only regularization curvature (λ/S)·U_coefficients.
        let share = self.regularization / self.total_weight;
        for (product_row, direction_row) in
            product.coefficients.iter_mut().zip(&direction.coefficients)
        {
            for (component, input) in product_row
                .as_array_mut()
                .iter_mut()
                .zip(direction_row.as_array())
            {
                *component = share.mul_add(*input, *component / self.total_weight);
            }
        }
        for intercept in &mut product.intercepts {
            *intercept /= self.total_weight;
        }
        product
    }

    /// Adds the regularizer to the accumulated data loss and normalizes by the total weight.
    fn finish_objective(&self, data_loss: f64, parameters: &ContrastVector) -> f64 {
        // ‖A‖² folded with `mul_add` over the coefficient coordinates in vector order.
        let mut coefficient_norm = 0.0_f64;
        for row in &parameters.coefficients {
            for &component in row.as_array() {
                coefficient_norm = component.mul_add(component, coefficient_norm);
            }
        }

        (0.5 * self.regularization).mul_add(coefficient_norm, data_loss) / self.total_weight
    }

    /// Normalizes the accumulated residual sum and adds `(λ/S)·[A|0]`.
    fn finish_gradient(&self, gradient: &mut ContrastVector, parameters: &ContrastVector) {
        let share = self.regularization / self.total_weight;
        for (gradient_row, parameter_row) in gradient
            .coefficients
            .iter_mut()
            .zip(&parameters.coefficients)
        {
            for (component, parameter) in gradient_row
                .as_array_mut()
                .iter_mut()
                .zip(parameter_row.as_array())
            {
                *component = share.mul_add(*parameter, *component / self.total_weight);
            }
        }
        for intercept in &mut gradient.intercepts {
            *intercept /= self.total_weight;
        }
    }
}

impl RowPrelude {
    /// The reference-difference data loss `logsumexp(δ_0, δ_1, 0) − u_0δ_0 − u_1δ_1`.
    fn loss(&self, leading: [f64; 2]) -> f64 {
        let after_first = leading[0].mul_add(-self.delta[0], self.log_normalizer);
        leading[1].mul_add(-self.delta[1], after_first)
    }
}

/// Contrast logits `t = T·x̄`: one wide dot plus the intercept per contrast row.
fn contrast_logits(
    parameters: &ContrastVector,
    embedding: &AlignedVecN<CANONICAL_DIMENSIONS>,
) -> [f64; 2] {
    core::array::from_fn(|row| {
        embedding.dot_wide(&parameters.coefficients[row]) + parameters.intercepts[row]
    })
}

/// Runs the shared logits path for one row.
fn row_prelude(
    parameters: &ContrastVector,
    embedding: &AlignedVecN<CANONICAL_DIMENSIONS>,
) -> RowPrelude {
    let logits = basis::expand(contrast_logits(parameters, embedding));
    let delta = [logits[0] - logits[2], logits[1] - logits[2]];

    // Stable shifted fold over (δ_0, δ_1, 0) in class order; the shift keeps every exponential
    // in [0, 1] and a NaN input propagates through the exponentials into every output.
    let shift = delta[0].max(delta[1]).max(0.0);
    let exponentials = [
        (delta[0] - shift).exp(),
        (delta[1] - shift).exp(),
        (-shift).exp(),
    ];
    let total = exponentials[0] + exponentials[1] + exponentials[2];

    RowPrelude {
        delta,
        log_normalizer: shift + total.ln(),
        probabilities: [
            exponentials[0] / total,
            exponentials[1] / total,
            exponentials[2] / total,
        ],
    }
}

/// Accumulates one row's weighted gradient residual `w·Bᵀ(p − q)·x̄ᵀ`.
fn accumulate_residual(
    gradient: &mut ContrastVector,
    prelude: &RowPrelude,
    target: [f64; GeometryClass::COUNT],
    weight: f64,
    embedding: &AlignedVecN<CANONICAL_DIMENSIONS>,
) {
    let mut residual = [0.0_f64; GeometryClass::COUNT];
    for ((out, probability), component) in
        residual.iter_mut().zip(prelude.probabilities).zip(target)
    {
        *out = probability - component;
    }

    let contrast = basis::reduce(residual);
    for (row_slot, weight_share) in contrast.into_iter().enumerate() {
        let scaled = weight * weight_share;
        gradient.coefficients[row_slot].add_scaled(VecN::from_ref(embedding.as_array()), scaled);
        gradient.intercepts[row_slot] += scaled;
    }
}

/// A vector of NaN coordinates: the result shape of a rejected non-finite request.
fn non_finite_vector() -> ContrastVector {
    let mut vector = ContrastVector::zero();
    for row in &mut vector.coefficients {
        row.as_array_mut().fill(f64::NAN);
    }
    vector.intercepts = [f64::NAN; 2];
    vector
}

impl ContrastVector {
    /// Whether every coordinate is finite.
    pub(super) fn is_finite(&self) -> bool {
        self.coefficients
            .iter()
            .all(|row| row.as_array().iter().all(|component| component.is_finite()))
            && self.intercepts.iter().all(|value| value.is_finite())
    }
}
