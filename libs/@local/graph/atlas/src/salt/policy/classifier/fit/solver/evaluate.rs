//! Analytical objective, gradient, and Hessian-vector products over a prepared corpus.
//!
//! All evaluations share one per-row logits path. It computes contrast logits `t = T·x̄`, then class
//! logits `ℓ = B·t`, then reference differences `δ_c = ℓ_c − ℓ_ref` against the last class, then
//! one stable log-sum-exp over the reference differences and zero in class order, and finally
//! probabilities from the same shifted exponentials. The objective, the gradient residual `p − q`,
//! the Hessian curvature `diag(p) − ppᵀ`, and the per-row contrast curvature blocks of the exact
//! Newton assembly all read these shared bytes, so no evaluation can disagree with another about a
//! row's logits.
//!
//! Every evaluation normalizes its result by the total weight `S`:
//!
//! ```text
//! F̄(T)   = (1/S)·[Σ_i w_i·(logsumexp(δ, 0) − Σ_c u_cδ_c) + (λ/2)·‖A‖²]
//! ∇F̄(T)  = (1/S)·Σ_i w_i·Bᵀ(p_i − q_i)·x̄_iᵀ + (λ/S)·[A|0]
//! H[U]   = (1/S)·Σ_i w_i·Bᵀ(diag(p_i) − p_ip_iᵀ)·B·U·x̄_i·x̄_iᵀ + (λ/S)·[U_coefficients|0]
//! ```
//!
//! Rows accumulate in ascending original index. Classes fold in discriminant order. Computed
//! results are plain values that may be non-finite when the arithmetic overflows, and every caller
//! maps a non-finite objective, gradient, or product onto its own typed outcome. A request whose
//! parameters are already non-finite counts as a request only. It traverses no rows and yields no
//! vector at all: the scalar objective reports NaN, and the vector evaluations report [`None`].

use super::{
    CONTRAST_ROWS, ContrastVector, LEADING_CLASSES, basis, prepare::Prepared, target::ClosedTarget,
    work::WorkCounters,
};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    math::{AlignedVecN, DNonNegative, Derivation, d_positive},
    salt::policy::GeometryClass,
};

/// Objective value and gradient from one joint traversal.
#[derive(Debug)]
pub(super) struct JointEvaluation {
    pub objective: f64,
    pub gradient: ContrastVector,
}

/// Per-row curvature blocks and intercept Hessian columns from one Newton-assembly traversal.
#[derive(Debug)]
pub(super) struct CurvatureEvaluation {
    /// The unweighted contrast curvature `Cᵢ` per row, packed as `(c11, c21, c22)`.
    pub blocks: Vec<[f64; 3]>,
    /// The normalized Hessian columns `H[0|e_k]` of the intercept unit directions: coefficient
    /// coupling in the coefficient rows, intercept curvature in the intercepts.
    pub intercept_columns: [ContrastVector; CONTRAST_ROWS],
}

/// One shared per-row logits evaluation.
struct RowPrelude {
    /// Reference differences `δ_c` of the leading classes. The reference's own is zero by
    /// construction.
    delta: [f64; LEADING_CLASSES],
    /// `logsumexp(δ, 0)`, stable under the class-order shifted fold.
    log_normalizer: f64,
    /// Class probabilities from the same shifted exponentials.
    probabilities: [f64; GeometryClass::COUNT],
}

impl RowPrelude {
    /// Runs the shared logits path for one row.
    fn new(parameters: &ContrastVector, embedding: &AlignedVecN<CANONICAL_DIMENSIONS>) -> Self {
        let logits = basis::expand(parameters.logits(embedding));
        let reference = logits[GeometryClass::COUNT - 1];
        let delta: [f64; LEADING_CLASSES] = core::array::from_fn(|class| logits[class] - reference);

        // Stable shifted fold over the reference differences and zero in class order; the shift
        // keeps every exponential in [0, 1] and a NaN input propagates through the exponentials
        // into every output.
        let shift = delta.into_iter().reduce(f64::max).unwrap_or(0.0).max(0.0);
        let exponentials: [f64; GeometryClass::COUNT] = core::array::from_fn(|class| {
            if class < LEADING_CLASSES {
                (delta[class] - shift).exp()
            } else {
                (-shift).exp()
            }
        });

        let mut total = 0.0_f64;
        for exponential in exponentials {
            total += exponential;
        }

        Self {
            delta,
            log_normalizer: shift + total.ln(),
            probabilities: core::array::from_fn(|class| exponentials[class] / total),
        }
    }

    /// The reference-difference data loss `logsumexp(δ, 0) − Σ_c u_cδ_c`, folded in class order.
    fn loss(&self, leading: [f64; LEADING_CLASSES]) -> f64 {
        let mut value = self.log_normalizer;
        for (target, delta) in leading.into_iter().zip(self.delta) {
            value = target.mul_add(-delta, value);
        }
        value
    }

    /// Accumulates one row's weighted gradient residual `w·Bᵀ(p − q)·x̄ᵀ`.
    fn accumulate_residual(
        &self,
        gradient: &mut ContrastVector,
        target: &ClosedTarget,
        weight: f64,
        embedding: &AlignedVecN<CANONICAL_DIMENSIONS>,
    ) {
        let mut residual = [0.0_f64; GeometryClass::COUNT];

        for ((out, probability), component) in residual
            .iter_mut()
            .zip(self.probabilities)
            .zip(target.components())
        {
            *out = probability - component;
        }

        let contrast = basis::reduce(residual);
        for (row_slot, weight_share) in contrast.into_iter().enumerate() {
            let scaled = weight * weight_share;

            gradient.coefficients[row_slot].add_scaled(embedding, scaled);
            gradient.intercepts[row_slot] += scaled;
        }
    }
}

impl Prepared<'_> {
    /// Evaluates the normalized objective and gradient in one traversal.
    pub(super) fn joint(
        &self,
        parameters: &ContrastVector,
        counters: &mut WorkCounters,
    ) -> Option<JointEvaluation> {
        counters.request_joint();
        if !parameters.is_finite() {
            return None;
        }

        let mut data_loss = 0.0_f64;
        let mut gradient = ContrastVector::zero();
        for (row_index, (embedding, row)) in self.embeddings.iter().zip(self.rows).enumerate() {
            if row_index == 0 {
                counters.start_joint_traversal();
            }
            counters.visit_row();

            let prelude = RowPrelude::new(parameters, embedding);
            data_loss = row
                .weight
                .mul_add(prelude.loss(self.targets[row_index].leading()), data_loss);

            prelude.accumulate_residual(
                &mut gradient,
                &self.targets[row_index],
                row.weight,
                embedding,
            );
        }
        counters.complete_joint_traversal();

        self.finish_gradient(&mut gradient, parameters);
        Some(JointEvaluation {
            objective: self.finish_objective(data_loss, parameters),
            gradient,
        })
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

            let prelude = RowPrelude::new(parameters, embedding);
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
    ) -> Option<ContrastVector> {
        counters.request_gradient();
        if !parameters.is_finite() {
            return None;
        }

        let mut gradient = ContrastVector::zero();
        for (row_index, (embedding, row)) in self.embeddings.iter().zip(self.rows).enumerate() {
            if row_index == 0 {
                counters.start_gradient_traversal();
            }
            counters.visit_row();

            let prelude = RowPrelude::new(parameters, embedding);
            prelude.accumulate_residual(
                &mut gradient,
                &self.targets[row_index],
                row.weight,
                embedding,
            );
        }
        counters.complete_gradient_traversal();

        self.finish_gradient(&mut gradient, parameters);
        Some(gradient)
    }

    /// Evaluates the normalized Hessian-vector product `H[U]` at the given parameters.
    pub(super) fn hessian_vector(
        &self,
        parameters: &ContrastVector,
        direction: &ContrastVector,
        counters: &mut WorkCounters,
    ) -> Option<ContrastVector> {
        counters.request_hvp();
        if !parameters.is_finite() || !direction.is_finite() {
            return None;
        }

        let mut product = ContrastVector::zero();
        for (row_index, (embedding, row)) in self.embeddings.iter().zip(self.rows).enumerate() {
            if row_index == 0 {
                counters.start_hvp_traversal();
            }
            counters.visit_row();

            let prelude = RowPrelude::new(parameters, embedding);

            // ν = U·x̄, then z = B·ν in class space.
            let projected = basis::expand(direction.logits(embedding));

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
                product.coefficients[row_slot].add_scaled(embedding, scaled);
                product.intercepts[row_slot] += scaled;
            }
        }

        counters.complete_hvp_traversal();

        // Normalize and add the coefficient-only regularization curvature (λ/S)·U_coefficients.
        // The share exits raw at once: it feeds the raw per-component fmas below, on the same
        // solver-interior bytes the objective's own exit documents.
        let share = (self.regularization / self.total_weight).into_raw();
        for (product_row, direction_row) in
            product.coefficients.iter_mut().zip(&direction.coefficients)
        {
            // Divide-then-fma matches the fused single-loop bytes: each component becomes
            // `share.mul_add(direction, component / S)` with the same two roundings.
            // `finish_gradient` keeps the same shape for the gradient.
            **product_row /= self.total_weight;
            product_row.mul_add(direction_row, share);
        }

        for intercept in &mut product.intercepts {
            *intercept /= self.total_weight;
        }

        Some(product)
    }

    /// Evaluates the per-row contrast curvature blocks and intercept Hessian columns.
    ///
    /// One traversal serves the exact Newton assembly: for every row it computes the contrast
    /// curvature `Cᵢ = Bᵀ(diag(pᵢ) − pᵢpᵢᵀ)B` through the moments `m_k = Σ_c p_c·B[c,k]` and
    /// `q_kl = Σ_c p_c·B[c,k]·B[c,l]` as `C[k,l] = q_kl − m_k·m_l`, and accumulates the
    /// normalized Hessian columns of the intercept unit directions,
    /// `H[0|e_k] = (1/S)·Σᵢ wᵢ·(Cᵢe_k)·[x̄ᵢᵀ | 1]` - the coefficient coupling block and the
    /// intercept curvature block of the Newton system in one pass. Intercepts carry no
    /// regularization, so the columns are complete as accumulated.
    ///
    /// Rows accumulate in ascending original index and classes fold in discriminant order, as
    /// every other evaluation here. Returns [`None`] for a non-finite request, which visits no
    /// rows. Computed values may be non-finite when the arithmetic overflows, and the caller
    /// maps them onto its typed outcome.
    pub(super) fn curvature_pass(
        &self,
        parameters: &ContrastVector,
        counters: &mut WorkCounters,
    ) -> Option<CurvatureEvaluation> {
        if !parameters.is_finite() {
            return None;
        }

        let mut blocks = Vec::with_capacity(self.rows.len());
        let mut intercept_columns: [ContrastVector; CONTRAST_ROWS] =
            core::array::from_fn(|_index| ContrastVector::zero());
        for (row_index, (embedding, row)) in self.embeddings.iter().zip(self.rows).enumerate() {
            if row_index == 0 {
                counters.start_newton_traversal();
            }
            counters.visit_row();

            let prelude = RowPrelude::new(parameters, embedding);

            let mut moment = [0.0_f64; CONTRAST_ROWS];
            let mut square = [0.0_f64; 3];
            for (class, probability) in prelude.probabilities.into_iter().enumerate() {
                let basis_row = basis::HELMERT_V1[class];
                moment[0] = probability.mul_add(basis_row[0], moment[0]);
                moment[1] = probability.mul_add(basis_row[1], moment[1]);
                square[0] = (probability * basis_row[0]).mul_add(basis_row[0], square[0]);
                square[1] = (probability * basis_row[1]).mul_add(basis_row[0], square[1]);
                square[2] = (probability * basis_row[1]).mul_add(basis_row[1], square[2]);
            }
            let block = [
                moment[0].mul_add(-moment[0], square[0]),
                moment[1].mul_add(-moment[0], square[1]),
                moment[1].mul_add(-moment[1], square[2]),
            ];

            // Column k of Cᵢ in packed lower-triangle order: (c11, c21) and (c21, c22).
            let scaled = [
                [row.weight * block[0], row.weight * block[1]],
                [row.weight * block[1], row.weight * block[2]],
            ];
            for (column, contributions) in intercept_columns.iter_mut().zip(scaled) {
                for (slot, &value) in contributions.iter().enumerate() {
                    column.coefficients[slot].add_scaled(embedding, value);
                    column.intercepts[slot] += value;
                }
            }

            blocks.push(block);
        }
        counters.complete_newton_traversal();

        for column in &mut intercept_columns {
            for coefficient_row in &mut column.coefficients {
                **coefficient_row /= self.total_weight;
            }
            for intercept in &mut column.intercepts {
                *intercept /= self.total_weight;
            }
        }

        Some(CurvatureEvaluation {
            blocks,
            intercept_columns,
        })
    }

    /// Reports every row's data-Hessian curvature scale `max_c p_c(1−p_c)` at the parameters.
    ///
    /// The scale reads the same shared logits path as the objective, gradient, and
    /// Hessian-vector product, so the census cannot disagree with them about a row's
    /// probabilities. A diagnostic observer for the solver's report probe: it visits every row
    /// but charges no work counters, because it participates in no solve.
    pub(super) fn row_curvature_scales(&self, parameters: &ContrastVector) -> Vec<f64> {
        self.embeddings
            .iter()
            .map(|embedding| {
                let prelude = RowPrelude::new(parameters, embedding);

                prelude
                    .probabilities
                    .into_iter()
                    .map(|probability| probability * (1.0 - probability))
                    .fold(0.0_f64, f64::max)
            })
            .collect()
    }

    /// Adds the regularizer to the accumulated data loss and normalizes by the total weight.
    fn finish_objective(&self, data_loss: f64, parameters: &ContrastVector) -> f64 {
        // ‖A‖² through the house striped kernel, one row at a time in contrast order. The
        // derivation rides raw to one exit because the parameters are unbounded solver state:
        // initialization deliberately admits a non-finite origin objective, and resolution and
        // final certification refuse it by name where the design says so.
        let mut coefficient_norm = Derivation::<DNonNegative>::ZERO;
        for row in &parameters.coefficients {
            coefficient_norm += row.norm_squared();
        }

        // The λ/2 factor stays raw: halving a subnormal λ underflows to zero. That zero is a
        // lawful degenerate configuration, not a defect for this row's debug assert to catch.
        // The solve refuses it later, in its own place.
        (coefficient_norm.mul_add(
            self.regularization * d_positive!(0.5),
            Derivation::<DNonNegative>::raw(data_loss),
        ) / self.total_weight)
            .into_raw()
    }

    /// Normalizes the accumulated residual sum and adds `(λ/S)·[A|0]`.
    fn finish_gradient(&self, gradient: &mut ContrastVector, parameters: &ContrastVector) {
        let share = (self.regularization / self.total_weight).into_raw();
        for (gradient_row, parameter_row) in gradient
            .coefficients
            .iter_mut()
            .zip(&parameters.coefficients)
        {
            // Divide-then-fma matches the fused single-loop bytes: each component becomes
            // `share.mul_add(parameter, component / S)` with the same two roundings.
            **gradient_row /= self.total_weight;
            gradient_row.mul_add(parameter_row, share);
        }

        for intercept in &mut gradient.intercepts {
            *intercept /= self.total_weight;
        }
    }
}
