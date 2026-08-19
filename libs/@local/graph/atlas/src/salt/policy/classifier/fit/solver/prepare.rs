//! The single validated preparation traversal ahead of solving.
//!
//! [`prepare`] performs one deterministic pass over the corpus in ascending row order. It validates
//! every row and closes every target ([`ClosedTarget`]). The same pass accumulates the total weight
//! `S = Σ_i w_i`, the aggregate class mass `Σ_i w_i u_ic`, and the weighted feature second moments
//! `Σ_i w_i x̄_ij²` behind the initial scaling. The traversal is real bounded work and the counters
//! charge it like any other, recording the request when made, the pass at its first row access, one
//! visit per examined row, and the completion once the pass has visited every row. A validation
//! failure at row `i` therefore records `i + 1` visits and no completion.
//!
//! A completed traversal alone does not make preparation succeed. Preparation also requires a
//! finite and positive accumulated total weight, positive aggregate mass in every class, and finite
//! positive scales from the initial scaling. A traversal that reaches the last row therefore still
//! fails preparation when one of these checks does not hold.
//!
//! # Initial scaling
//!
//! Every fit starts at physical `T₀ = 0`. At zero the normalized initial Hessian diagonal for
//! coefficient coordinate `j` is `h_jj = (1/(3S))·Σ_i w_i x̄_ij² + λ/S`, identical for both contrast
//! rows. The intercept moment is `S` itself, so the intercept curvature is exactly `⅓`, and
//! preparation reads it from [`INTERCEPT_CURVATURE`].
//!
//! Each coordinate then takes the scale `D_j = √(max(h_jj, floor))` with `floor =
//! curvature_relative_floor · max_k h_kk`. The floor follows the corpus's measured curvature scale
//! instead of pinning an absolute magnitude, the intercept anchors `max_k h_kk ≥ ⅓`, and degenerate
//! coordinates receive a finite positive scale instead of dividing the solver by zero.

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
pub(crate) enum PreparationError {
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
    /// An initial-scaling curvature is not finite, or a constructed scale is not finite and
    /// positive.
    InvalidScaling { coordinate: usize, value: f64 },
}

/// Solver-relevant knobs consumed by preparation.
///
/// Every field carries a default, so `PreparationSettings { .. }` is the deployment configuration.
/// The tolerance default admits targets whose sums carry division rounding only.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct PreparationSettings {
    /// L2 penalty `λ` on contrast coefficients.
    ///
    /// The penalty never reaches the intercepts.
    pub regularization: DPositive = DPositive::ONE,
    /// Unit-sum tolerance for raw targets, in ulps of one.
    pub target_sum_tolerance_ulps: NonZero<u32> = const {
        NonZero::new(16).expect("sixteen is nonzero")
    },
    /// Floor on the initial Hessian diagonal, as a fraction of the largest curvature.
    pub curvature_relative_floor: DPositive = const {
        DPositive::new(1.0e-12).expect("the floor is positive")
    },
}

/// Canonicalization and scaling evidence of one successful preparation.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct PreparationEvidence {
    /// Smallest and largest raw target sum seen across rows.
    pub sum_range: [f64; 2],
    /// Largest normalization adjustment `max_i,c |u_ic − t_ic/s_i|` across rows.
    pub maximum_adjustment: f64,
    /// Smallest and largest initial scale `D_j` across coordinates.
    pub scaling_range: [f64; 2],
    /// The largest initial curvature scaled by the relative floor.
    pub curvature_floor: f64,
}

/// A validated corpus with closed targets, accumulated statistics, and initial scaling.
#[derive(Debug)]
pub(crate) struct Prepared<'corpus> {
    /// Embeddings in row order.
    ///
    /// Row `i` of the corpus reads embedding `i`.
    pub embeddings: &'corpus [AlignedVecN<CANONICAL_DIMENSIONS>],
    /// Weighted training rows in original order.
    pub rows: &'corpus [TrainingRow],
    /// Closed target per row, in row order.
    pub targets: Box<[ClosedTarget]>,
    /// Total weight `S`, accumulated in row order.
    pub total_weight: DPositive,
    /// The validated L2 penalty `λ` that preparation applied to the corpus.
    pub regularization: DPositive,
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
pub(crate) fn prepare<'corpus>(
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

    let total_weight =
        DPositive::new(total_weight).ok_or(PreparationError::InvalidTotalWeight {
            value: total_weight,
        })?;

    // A NaN mass rejects like any non-positive mass.
    if let Some(class) = class_mass
        .iter()
        .position(|mass| mass.is_nan() || *mass <= 0.0)
    {
        return Err(PreparationError::MissingClassMass {
            class: GeometryClass::VARIANTS[class],
        });
    }

    let initial = initial_scaling(&moments, total_weight, settings)?;

    Ok(Prepared {
        embeddings,
        rows,
        targets: targets.into_boxed_slice(),
        total_weight,
        regularization: settings.regularization,
        class_mass,
        scaling: initial.scaling,
        evidence: PreparationEvidence {
            sum_range,
            maximum_adjustment,
            scaling_range: initial.range,
            curvature_floor: initial.floor,
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

/// The intercept coordinate's normalized initial curvature.
///
/// The intercept moment is the total weight itself, so its normalized curvature is `S/(3S) = ⅓`
/// for every corpus. Written as the constant, it survives a `3·S` overflow that would flush the
/// computed quotient to zero, and it anchors the curvature maximum - and with it the derived
/// floor - strictly above zero.
const INTERCEPT_CURVATURE: f64 = 1.0 / 3.0;

/// The constructed diagonal with its derivation evidence.
struct InitialScaling {
    /// The scaled-coordinate diagonal.
    scaling: Scaling,
    /// Smallest and largest constructed scale across coordinates.
    range: [f64; 2],
    /// The derived curvature floor.
    floor: f64,
}

/// Builds the scaled-coordinate diagonal from the accumulated second moments.
///
/// Only the coefficient coordinates carry the `λ/S` regularization term. The intercept curvature
/// is [`INTERCEPT_CURVATURE`]. The floor is the largest curvature scaled by the configured
/// relative floor, so it follows the corpus's curvature scale.
fn initial_scaling(
    moments: &AlignedDVecN<CANONICAL_DIMENSIONS>,
    total_weight: DPositive,
    settings: PreparationSettings,
) -> Result<InitialScaling, PreparationError> {
    let normalizer = (3.0 * total_weight).recip();
    let regularization_share = settings.regularization.get() / total_weight;

    let mut curvatures = BoxedDVecN::<AUGMENTED_DIMENSIONS>::zero();
    let mut maximum = f64::NEG_INFINITY;
    for (coordinate, curvature) in curvatures.as_array_mut().iter_mut().enumerate() {
        *curvature = if coordinate < CANONICAL_DIMENSIONS {
            moments.as_array()[coordinate].mul_add(normalizer, regularization_share)
        } else {
            INTERCEPT_CURVATURE
        };

        if !curvature.is_finite() {
            return Err(PreparationError::InvalidScaling {
                coordinate,
                value: *curvature,
            });
        }

        maximum = maximum.max(*curvature);
    }

    let floor = maximum * settings.curvature_relative_floor.get();

    let mut scales = curvatures;
    let mut range = [f64::INFINITY, f64::NEG_INFINITY];
    for (coordinate, scale) in scales.as_array_mut().iter_mut().enumerate() {
        *scale = scale.max(floor).sqrt();
        if !scale.is_finite() || *scale <= 0.0 {
            return Err(PreparationError::InvalidScaling {
                coordinate,
                value: *scale,
            });
        }

        range = [range[0].min(*scale), range[1].max(*scale)];
    }

    Ok(InitialScaling {
        scaling: Scaling::from_augmented(&scales),
        range,
        floor,
    })
}
