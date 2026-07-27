//! The single validated preparation traversal ahead of solving.
//!
//! [`prepare`] performs one deterministic pass over the corpus in ascending row order: it
//! validates every row, closes every target ([`ClosedTarget`]), and accumulates the total weight
//! `S = Σ_i w_i`, the aggregate class mass `Σ_i w_i u_ic`, and the weighted feature second
//! moments `Σ_i w_i x̄_ij²` behind the initial scaling. The traversal is real bounded work and is
//! charged like any other: the request when made, the pass at its first row access, one visit
//! per examined row, and the completion once every row has been seen, so a validation failure at
//! row `i` truthfully records `i + 1` visits and no completion.
//!
//! Success requires more than a completed traversal: the accumulated total weight must be finite
//! and positive, every class must carry positive aggregate mass, and the initial scaling must
//! construct finite scales. A corpus can therefore scan to completion and still fail
//! preparation.
//!
//! # Initial scaling
//!
//! Every fit starts at physical `T₀ = 0`. At zero the normalized initial Hessian diagonal for
//! augmented coordinate `j` is `h_jj = (1/(3S))·Σ_i w_i x̄_ij² + (λ/S)·1{j is a coefficient}`,
//! identical for both contrast rows; the per-coordinate scale is `D_j = √(max(h_jj,
//! curvature_floor))`. The floor is in curvature units - it clamps `h_jj` inside the square
//! root - so degenerate coordinates receive a finite positive scale instead of dividing the
//! solver by zero.

use core::num::NonZero;

use super::{
    super::TrainingRow,
    AUGMENTED_DIMENSIONS,
    scale::Scaling,
    target::{Canonicalization, ClosedTarget, ClosedTargetError},
    work::WorkCounters,
};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    math::{AlignedDVecN, AlignedVecN, BoxedDVecN, DPositive},
    salt::policy::GeometryClass,
};

/// Preparation rejected the corpus or its configuration.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) enum PreparationError {
    /// The embedding and row counts differ.
    RowMismatch { embeddings: usize, rows: usize },
    /// The corpus holds no rows.
    Empty,
    /// An embedding component is not finite.
    NonFiniteEmbedding { row: usize, component: usize },
    /// A row weight is not positive and finite.
    InvalidWeight { row: usize, value: f64 },
    /// A raw target component is non-finite or negative.
    InvalidTargetComponent {
        row: usize,
        class: GeometryClass,
        value: f64,
    },
    /// The row's target failed to close.
    Target {
        row: usize,
        error: ClosedTargetError,
    },
    /// The accumulated total weight is not positive and finite.
    InvalidTotalWeight { value: f64 },
    /// A class carries no positive aggregate mass.
    MissingClassMass { class: GeometryClass },
    /// An initial-scaling curvature value is not finite.
    InvalidScaling { coordinate: usize, value: f64 },
}

/// Solver-relevant knobs consumed by preparation.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) struct PreparationSettings {
    /// L2 penalty `λ` on contrast coefficients; intercepts are never regularized.
    pub regularization: DPositive,
    /// Unit-sum tolerance for raw targets, in ulps of one.
    pub target_sum_tolerance_ulps: NonZero<u32>,
    /// Floor on the initial Hessian diagonal, in curvature units.
    pub curvature_floor: DPositive,
}

/// Canonicalization and scaling evidence of one successful preparation.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(super) struct PreparationEvidence {
    /// Smallest and largest raw target sum seen across rows.
    pub sum_range: [f64; 2],
    /// Largest normalization adjustment `max_i,c |u_ic − t_ic/s_i|` across rows.
    pub maximum_adjustment: f64,
    /// Smallest and largest initial scale `D_j` across coordinates.
    pub scaling_range: [f64; 2],
}

/// A validated corpus with closed targets, accumulated statistics, and initial scaling.
#[derive(Debug)]
pub(super) struct Prepared<'corpus> {
    /// Embeddings in row order; row `i` of the corpus reads embedding `i`.
    pub embeddings: &'corpus [AlignedVecN<CANONICAL_DIMENSIONS>],
    /// Weighted training rows in original order.
    pub rows: &'corpus [TrainingRow],
    /// Closed target per row, in row order.
    pub targets: Box<[ClosedTarget]>,
    /// Total weight `S`, accumulated in row order; finite and positive.
    pub total_weight: f64,
    /// The validated L2 penalty `λ` the corpus was prepared under.
    pub regularization: f64,
    /// Aggregate weighted class mass `Σ_i w_i u_ic`, positive for every class.
    pub class_mass: [f64; GeometryClass::COUNT],
    /// The scaled-coordinate diagonal derived from the initial Hessian diagonal.
    pub scaling: Scaling,
    /// Canonicalization and scaling evidence.
    pub evidence: PreparationEvidence,
}

/// Validates the corpus and accumulates solver statistics in one charged traversal.
///
/// # Errors
///
/// Returns a [`PreparationError`] naming the first violated contract, in traversal order:
/// pre-traversal shape and configuration checks, then per-row validation in ascending row order,
/// then the post-traversal total-weight, class-mass, and scaling checks.
pub(super) fn prepare<'corpus>(
    embeddings: &'corpus [AlignedVecN<CANONICAL_DIMENSIONS>],
    rows: &'corpus [TrainingRow],
    settings: PreparationSettings,
    counters: &mut WorkCounters,
) -> Result<Prepared<'corpus>, PreparationError> {
    counters.request_preparation();

    // Pre-traversal rejections access no row and start no traversal.
    if embeddings.len() != rows.len() {
        return Err(PreparationError::RowMismatch {
            embeddings: embeddings.len(),
            rows: rows.len(),
        });
    }

    if rows.is_empty() {
        return Err(PreparationError::Empty);
    }

    let mut targets = Vec::with_capacity(rows.len());
    let mut total_weight = 0.0_f64;
    let mut class_mass = [0.0_f64; GeometryClass::COUNT];
    let mut moments = BoxedDVecN::<CANONICAL_DIMENSIONS>::zero();
    let mut sum_range = [f64::INFINITY, f64::NEG_INFINITY];
    let mut maximum_adjustment = 0.0_f64;

    for (row_index, (embedding, row)) in embeddings.iter().zip(rows).enumerate() {
        if row_index == 0 {
            counters.start_preparation_traversal();
        }
        counters.visit_preparation_row();

        validate_row(row_index, embedding, row)?;

        let (closed, Canonicalization { sum, adjustment }) =
            ClosedTarget::new(row.target, settings.target_sum_tolerance_ulps).map_err(|error| {
                PreparationError::Target {
                    row: row_index,
                    error,
                }
            })?;

        total_weight += row.weight;

        for (mass, component) in class_mass.iter_mut().zip(closed.components()) {
            *mass = row.weight.mul_add(component, *mass);
        }

        for (moment, &component) in moments.as_array_mut().iter_mut().zip(embedding.as_array()) {
            let wide = f64::from(component);
            *moment = (wide * wide).mul_add(row.weight, *moment);
        }

        sum_range = [sum_range[0].min(sum), sum_range[1].max(sum)];
        maximum_adjustment = maximum_adjustment.max(adjustment);
        targets.push(closed);
    }

    counters.complete_preparation_traversal();

    if !total_weight.is_finite() || total_weight <= 0.0 {
        return Err(PreparationError::InvalidTotalWeight {
            value: total_weight,
        });
    }

    // A NaN mass rejects like any non-positive mass.
    if let Some(class) = class_mass
        .iter()
        .position(|mass| mass.is_nan() || *mass <= 0.0)
    {
        return Err(PreparationError::MissingClassMass {
            class: GeometryClass::VARIANTS[class],
        });
    }

    let (scaling, scaling_range) = initial_scaling(&moments, total_weight, settings)?;

    Ok(Prepared {
        embeddings,
        rows,
        targets: targets.into_boxed_slice(),
        total_weight,
        regularization: settings.regularization.get(),
        class_mass,
        scaling,
        evidence: PreparationEvidence {
            sum_range,
            maximum_adjustment,
            scaling_range,
        },
    })
}

/// Rejects non-finite embeddings, invalid weights, and invalid raw target components.
fn validate_row(
    row_index: usize,
    embedding: &AlignedVecN<CANONICAL_DIMENSIONS>,
    row: &TrainingRow,
) -> Result<(), PreparationError> {
    if !embedding.is_finite() {
        // Cold path: name the first offending component.
        let Some(component) = embedding
            .as_array()
            .iter()
            .position(|value| !value.is_finite())
        else {
            unreachable!("a non-finite embedding contains a non-finite component")
        };

        return Err(PreparationError::NonFiniteEmbedding {
            row: row_index,
            component,
        });
    }

    if !row.weight.is_finite() || row.weight <= 0.0 {
        return Err(PreparationError::InvalidWeight {
            row: row_index,
            value: row.weight,
        });
    }

    for (class, value) in GeometryClass::VARIANTS.into_iter().zip(row.target) {
        if !value.is_finite() || value.is_sign_negative() {
            return Err(PreparationError::InvalidTargetComponent {
                row: row_index,
                class,
                value,
            });
        }
    }

    Ok(())
}

/// Builds the scaled-coordinate diagonal from the accumulated second moments.
///
/// The intercept coordinate of `x̄` is one, so its second moment is the total weight itself;
/// only the coefficient coordinates carry the `λ/S` regularization term.
fn initial_scaling(
    moments: &AlignedDVecN<CANONICAL_DIMENSIONS>,
    total_weight: f64,
    settings: PreparationSettings,
) -> Result<(Scaling, [f64; 2]), PreparationError> {
    let normalizer = (3.0 * total_weight).recip();
    let regularization_share = settings.regularization.get() / total_weight;

    let mut scales = BoxedDVecN::<AUGMENTED_DIMENSIONS>::zero();
    let mut scaling_range = [f64::INFINITY, f64::NEG_INFINITY];
    for (coordinate, scale) in scales.as_array_mut().iter_mut().enumerate() {
        let curvature = if coordinate < CANONICAL_DIMENSIONS {
            moments.as_array()[coordinate].mul_add(normalizer, regularization_share)
        } else {
            total_weight * normalizer
        };

        if !curvature.is_finite() {
            return Err(PreparationError::InvalidScaling {
                coordinate,
                value: curvature,
            });
        }

        *scale = curvature.max(settings.curvature_floor.get()).sqrt();
        scaling_range = [scaling_range[0].min(*scale), scaling_range[1].max(*scale)];
    }

    Ok((Scaling::from_augmented(&scales), scaling_range))
}
