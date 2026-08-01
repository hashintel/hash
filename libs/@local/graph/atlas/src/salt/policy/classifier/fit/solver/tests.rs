#![expect(
    clippy::float_cmp,
    reason = "bit-exact assertions are contracts on exactly representable values"
)]

use core::{
    assert_matches,
    num::{NonZeroU32, NonZeroU64},
};

use super::{
    super::{
        TrainingRow,
        objective::{self, Parameters},
    },
    AUGMENTED_DIMENSIONS, CONTRAST_ROWS, ContrastVector, SOLVER_DIMENSIONS,
    basis::{self, HELMERT_V1},
    boundary::{GROSS_DEFECT_GUARD, boundary_step},
    config::{SolverConfig, SolverConfigError},
    flat as flat_vectors,
    gram::{Gram, GramView},
    newton::{NewtonOutcome, NewtonTag, factor_block, newton_step},
    prepare::{PreparationError, PreparationSettings, prepare},
    problem::ScaledProblem,
    receipt::{CandidateOutcome, CurvatureDiagnostic, ReceiptDetail, vector_digest},
    resolution::objective_resolution,
    scale::Scaling,
    solve::{
        AcceptedPoint, SolverControl, SolverRun, certify, derive_certificate, rejected, solve,
    },
    stable::{checked_dot, checked_norm_squared, stable_l2},
    target::{ClosedTarget, ClosedTargetError},
    terminal::{NewtonStage, SolverFailure},
    work::WorkCounters,
};
use crate::{
    dataset::CANONICAL_DIMENSIONS,
    integrity::{Sha256, Sha256Digest, Update as _},
    math::{
        AlignedVecN, BoxedDVecN, BoxedVecN, DNonNegative, DPositive, DVecN, OpenUnitFraction,
        d_non_negative, d_positive, greater_than_one, open_unit_fraction,
    },
    salt::policy::GeometryClass,
};

/// One ulp of unit-sum tolerance.
fn one_ulp() -> NonZeroU32 {
    NonZeroU32::new(1).expect("one is nonzero")
}

/// A flat solver vector with the given components set.
fn flat(assignments: &[(usize, f64)]) -> BoxedDVecN<SOLVER_DIMENSIONS> {
    let mut vector = BoxedDVecN::zero();
    for &(index, value) in assignments {
        vector.as_array_mut()[index] = value;
    }
    vector
}

const CAPACITY: usize = 4;

/// An owned solver-test corpus growing row by row.
struct Corpus {
    storage: BoxedVecN<{ CAPACITY * CANONICAL_DIMENSIONS }>,
    rows: Vec<TrainingRow>,
}

impl Corpus {
    fn new() -> Self {
        Self {
            storage: BoxedVecN::zero(),
            rows: Vec::new(),
        }
    }

    fn push(&mut self, leading: &[f32], target: [f64; GeometryClass::COUNT], weight: f64) {
        let index = self.rows.len();
        assert!(index < CAPACITY, "the fixture fits the capacity");
        let start = index * CANONICAL_DIMENSIONS;
        self.storage.as_array_mut()[start..start + leading.len()].copy_from_slice(leading);
        self.rows.push(TrainingRow {
            target,
            weight,
            group: digest(b"solver-fixture"),
        });
    }

    fn embeddings(&self) -> &[AlignedVecN<CANONICAL_DIMENSIONS>] {
        AlignedVecN::from_slice(&self.storage.as_array()[..self.rows.len() * CANONICAL_DIMENSIONS])
            .expect("boxed storage is aligned")
    }
}

fn digest(bytes: &[u8]) -> Sha256Digest {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher.finalize()
}

fn settings() -> PreparationSettings {
    PreparationSettings {
        regularization: d_positive!(0.5),
        target_sum_tolerance_ulps: one_ulp(),
        curvature_relative_floor: d_positive!(1.0e-12),
    }
}

/// Builds the valid three-row corpus with exact targets, weights summing to five, and known leading
/// components.
fn valid_corpus() -> Corpus {
    let mut corpus = Corpus::new();
    corpus.push(&[2.0, -1.0], [1.0, 0.0, 0.0], 1.5);
    corpus.push(&[0.0, 3.0], [0.0, 1.0, 0.0], 2.5);
    corpus.push(&[1.0, 0.5], [0.5, 0.25, 0.25], 1.0);
    corpus
}

/// Deterministic non-zero solver parameters touching both rows and both intercepts.
fn solver_parameters() -> ContrastVector {
    let mut parameters = ContrastVector::zero();
    parameters.coefficients[0].as_array_mut()[0] = 0.3;
    parameters.coefficients[0].as_array_mut()[1] = -0.2;
    parameters.coefficients[1].as_array_mut()[0] = 0.1;
    parameters.coefficients[1].as_array_mut()[1] = 0.4;
    parameters.intercepts = [0.05, -0.1];
    parameters
}

/// Reconstructs raw parameters `W = BA`, `b = Ba` in the legacy flat layout.
fn raw_parameters(contrast: &ContrastVector) -> Parameters {
    let mut raw = Parameters::zero();
    let (rows, intercepts) = raw.as_array_mut().as_chunks_mut::<CANONICAL_DIMENSIONS>();
    for coordinate in 0..CANONICAL_DIMENSIONS {
        let expanded = basis::expand([
            contrast.coefficients[0].as_array()[coordinate],
            contrast.coefficients[1].as_array()[coordinate],
        ]);
        for (row, value) in rows.iter_mut().zip(expanded) {
            row[coordinate] = value;
        }
    }
    intercepts.copy_from_slice(&basis::expand(contrast.intercepts));
    raw
}

/// `base + step · direction` over every contrast coordinate.
fn axpy(base: &ContrastVector, direction: &ContrastVector, step: f64) -> ContrastVector {
    let mut out = base.clone();
    for (out_row, direction_row) in out.coefficients.iter_mut().zip(&direction.coefficients) {
        for (component, input) in out_row
            .as_array_mut()
            .iter_mut()
            .zip(direction_row.as_array())
        {
            *component = step.mul_add(*input, *component);
        }
    }
    for (intercept, input) in out.intercepts.iter_mut().zip(direction.intercepts) {
        *intercept = step.mul_add(input, *intercept);
    }
    out
}

/// Checked flat dot of two contrast vectors.
fn flat_dot(left: &ContrastVector, right: &ContrastVector) -> f64 {
    checked_dot(&left.to_flat(), &right.to_flat()).expect("fixture dots stay finite")
}

/// Builds a coefficient axis, an intercept axis, and a mixed vector as the deterministic test
/// directions.
fn directions() -> [ContrastVector; 3] {
    let mut coefficient = ContrastVector::zero();
    coefficient.coefficients[0].as_array_mut()[0] = 1.0;

    let mut intercept = ContrastVector::zero();
    intercept.intercepts[1] = 1.0;

    let mut mixed = ContrastVector::zero();
    mixed.coefficients[0].as_array_mut()[1] = 0.7;
    mixed.coefficients[1].as_array_mut()[0] = -0.3;
    mixed.intercepts = [0.2, -0.5];

    [coefficient, intercept, mixed]
}

/// Every basis entry keeps its pinned IEEE-754 bit pattern.
#[test]
fn helmert_bits_stay_pinned() {
    let pinned: [[u64; CONTRAST_ROWS]; GeometryClass::COUNT] = [
        [0x3FE6_A09E_667F_3BCD, 0x3FDA_20BD_700C_2C3E],
        [0xBFE6_A09E_667F_3BCD, 0x3FDA_20BD_700C_2C3E],
        [0x0000_0000_0000_0000, 0xBFEA_20BD_700C_2C3E],
    ];

    for (row, pinned_row) in HELMERT_V1.iter().zip(pinned) {
        for (entry, bits) in row.iter().zip(pinned_row) {
            assert_eq!(entry.to_bits(), bits);
        }
    }

    assert_eq!(HELMERT_V1[0][0], core::f64::consts::FRAC_1_SQRT_2);
    assert_eq!(HELMERT_V1[2][1], -2.0 * HELMERT_V1[0][1]);
}

/// Every column sum vanishes exactly under plain class-order addition.
#[test]
fn helmert_columns_sum_to_zero_exactly() {
    for column in 0..CONTRAST_ROWS {
        let sum = HELMERT_V1
            .iter()
            .fold(0.0_f64, |sum, row| sum + row[column]);
        assert_eq!(sum, 0.0);
    }
}

/// `BᵀB` lies within one ulp of the identity under the ordered `mul_add` fold.
#[test]
fn helmert_columns_are_orthonormal() {
    for left in 0..CONTRAST_ROWS {
        for right in 0..CONTRAST_ROWS {
            let mut gram = 0.0_f64;
            for row in HELMERT_V1 {
                gram = row[left].mul_add(row[right], gram);
            }

            let identity = if left == right { 1.0 } else { 0.0 };
            assert!(
                (gram - identity).abs() <= f64::EPSILON,
                "gram[{left}][{right}] = {gram}",
            );
        }
    }
}

/// [`basis::reduce`] after [`basis::expand`] returns to the same contrast coordinates.
#[test]
fn basis_roundtrip_is_the_identity_up_to_rounding() {
    for contrast in [[1.0, 0.0], [0.0, 1.0], [0.75, -2.5], [-1.0e3, 1.0e-3]] {
        let logits = basis::expand(contrast);
        let recovered = basis::reduce(logits);

        // Rounding in the expanded logits is proportional to the largest coordinate, so the
        // roundtrip error of every component carries that scale after cancellation.
        let magnitude = contrast[0].abs().max(contrast[1].abs()).max(1.0);
        for (out, initial) in recovered.iter().zip(contrast) {
            assert!(
                (out - initial).abs() <= 4.0 * f64::EPSILON * magnitude,
                "{recovered:?} vs {contrast:?}",
            );
        }
    }
}

/// Expanded logits sum to zero up to rounding: contrast space is shift-free.
#[test]
fn expanded_logits_stay_shift_free() {
    for contrast in [[1.0, 1.0], [3.0, -0.5], [-2.0e2, 7.0]] {
        let logits = basis::expand(contrast);
        let sum: f64 = logits.iter().sum();
        let magnitude = contrast[0].abs().max(contrast[1].abs());
        assert!(sum.abs() <= 4.0 * f64::EPSILON * magnitude, "{logits:?}");
    }
}

/// [`checked_dot`] passes an exactly representable dot through the gate.
#[test]
fn checked_dot_passes_finite_values() {
    // Both terms are exact, so 2·4 + (−3)·5 = −7 under any fold shape.
    let left = flat(&[(0, 2.0), (9, -3.0)]);
    let right = flat(&[(0, 4.0), (9, 5.0)]);

    assert_eq!(checked_dot(&left, &right), Some(-7.0));
}

/// [`checked_dot`] reports a non-finite reduction as [`None`] instead of a value.
#[test]
fn checked_dot_rejects_non_finite_results() {
    let mut huge = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    huge.as_array_mut()[0] = f64::MAX;
    huge.as_array_mut()[1] = f64::MAX;
    let mut two = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    two.as_array_mut()[0] = 2.0;
    two.as_array_mut()[1] = 2.0;
    assert_eq!(checked_dot(&huge, &two), None);

    let mut poisoned = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    poisoned.as_array_mut()[7] = f64::NAN;
    let mut ones = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    ones.as_array_mut()[7] = 1.0;
    assert_eq!(checked_dot(&poisoned, &ones), None);
}

/// [`stable_l2`] passes exact norms through and reports non-finite components as [`None`].
#[test]
fn stable_l2_gates_the_house_norm() {
    // 3-4-5 triangle: every ratio and square of the house kernel is exact.
    let mut triangle = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    triangle.as_array_mut()[10] = 3.0;
    triangle.as_array_mut()[4000] = -4.0;
    assert_eq!(stable_l2(&triangle), Some(5.0));

    assert_eq!(
        stable_l2(&BoxedDVecN::<SOLVER_DIMENSIONS>::zero()),
        Some(0.0)
    );

    let mut poisoned = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    poisoned.as_array_mut()[123] = f64::INFINITY;
    assert_eq!(stable_l2(&poisoned), None);

    let mut hidden = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    hidden.as_array_mut()[6000] = f64::NAN;
    assert_eq!(stable_l2(&hidden), None);
}

/// An exact triple closes without adjustment and keeps the exact unit sum.
#[test]
fn closed_target_keeps_exact_triples() {
    let (closed, evidence) =
        ClosedTarget::new([0.5, 0.25, 0.25], one_ulp()).expect("an exact triple closes");

    assert_eq!(closed.leading(), [0.5, 0.25]);
    assert_eq!(closed.components(), [0.5, 0.25, 0.25]);
    assert_eq!(evidence.sum, 1.0);
    assert_eq!(evidence.adjustment, 0.0);
}

/// The unit-sum tolerance accepts at exactly `ulps · ulp(1)` and rejects one ulp beyond.
#[test]
fn closed_target_tolerance_boundary_is_inclusive() {
    // Raw sum exactly 1 + EPSILON: at the boundary of a one-ulp tolerance.
    let at_boundary = [0.5, 0.25, 0.25 + f64::EPSILON];
    ClosedTarget::new(at_boundary, one_ulp()).expect("the boundary is inclusive");

    let two_epsilon = 2.0 * f64::EPSILON;
    let beyond = [0.5, 0.25, 0.25 + two_epsilon];
    assert_eq!(
        ClosedTarget::new(beyond, one_ulp()),
        Err(ClosedTargetError::SumOutOfTolerance {
            sum: 1.0 + two_epsilon,
        }),
    );

    // A wider tolerance accepts the same triple.
    let two_ulps = NonZeroU32::new(2).expect("two is nonzero");
    ClosedTarget::new(beyond, two_ulps).expect("two ulps cover the deviation");
}

/// Non-finite raw sums reject through the tolerance comparison.
#[test]
fn closed_target_rejects_non_finite_sums() {
    assert_matches!(
        ClosedTarget::new([f64::NAN, 0.5, 0.25], one_ulp()),
        Err(ClosedTargetError::SumOutOfTolerance { .. }),
    );
    assert_matches!(
        ClosedTarget::new([f64::INFINITY, 0.5, f64::NEG_INFINITY], one_ulp()),
        Err(ClosedTargetError::SumOutOfTolerance { .. }),
    );
}

/// A negative-zero component rejects by sign, naming its class.
#[test]
fn closed_target_rejects_negative_zero_components() {
    assert_eq!(
        ClosedTarget::new([1.0, -0.0, 0.0], one_ulp()),
        Err(ClosedTargetError::InvalidComponent {
            class: GeometryClass::Proximal,
            value: -0.0,
        }),
    );
}

/// A successful preparation accumulates the contract statistics and charges its work.
#[test]
fn preparation_accumulates_statistics_and_charges_work() {
    let corpus = valid_corpus();
    let mut counters = WorkCounters::default();

    let prepared = prepare(corpus.embeddings(), &corpus.rows, settings(), &mut counters)
        .expect("the fixture corpus prepares");

    assert_eq!(counters.preparation_requests, 1);
    assert_eq!(counters.preparation_passes, 1);
    assert_eq!(counters.preparation_row_visits, 3);
    assert_eq!(counters.completed_preparation_traversals, 1);
    assert_eq!(counters.started_row_traversals, 1);
    assert_eq!(counters.row_visits, 3);

    // Exact accumulations: 1.5 + 2.5 + 1.0 and the weighted class masses.
    assert_eq!(prepared.total_weight, 5.0);
    assert_eq!(prepared.class_mass, [2.0, 2.75, 0.25]);
    assert_eq!(prepared.targets.len(), 3);
    assert_eq!(prepared.evidence.sum_range, [1.0, 1.0]);
    assert_eq!(prepared.evidence.maximum_adjustment, 0.0);
}

/// The initial diagonal follows `h_jj = (1/(3S))·Σ w x̄² + (λ/S)·1{coefficient}` with the
/// derived floor inside the square root, identically for both contrast rows.
#[test]
fn preparation_builds_the_documented_initial_diagonal() {
    let corpus = valid_corpus();
    let mut counters = WorkCounters::default();
    let prepared = prepare(corpus.embeddings(), &corpus.rows, settings(), &mut counters)
        .expect("the fixture corpus prepares");

    let diagonal = prepared.scaling.diagonal().as_array();
    let total = prepared.total_weight;
    let normalizer = (3.0 * total).recip();
    let share = settings().regularization.get() / total;

    // Leading coordinate: moment = 1.5·4 + 2.5·0 + 1·1 = 7.
    let leading = 7.0_f64.mul_add(normalizer, share);
    // Second coordinate: moment = 1.5·1 + 2.5·9 + 1·0.25 = 24.25.
    let second = 24.25_f64.mul_add(normalizer, share);
    // Zero-moment coefficient coordinates keep the regularization share alone.
    let zero = 0.0_f64.mul_add(normalizer, share);
    // The intercept curvature is the constant one third.
    let intercept = 1.0 / 3.0;

    // The derived floor is the largest curvature scaled by the configured relative floor.
    let floor =
        leading.max(second).max(zero).max(intercept) * settings().curvature_relative_floor.get();
    assert_eq!(prepared.evidence.curvature_floor, floor);

    let expected_leading = leading.max(floor).sqrt();
    assert_eq!(diagonal[0], expected_leading);

    let expected_second = second.max(floor).sqrt();
    assert_eq!(diagonal[1], expected_second);

    let expected_zero = zero.max(floor).sqrt();
    assert_eq!(diagonal[2], expected_zero);

    let expected_intercept = intercept.max(floor).sqrt();
    assert_eq!(diagonal[CANONICAL_DIMENSIONS], expected_intercept);

    // Both contrast rows carry identical scales, and the recorded range brackets them.
    for coordinate in 0..AUGMENTED_DIMENSIONS {
        assert_eq!(
            diagonal[coordinate],
            diagonal[AUGMENTED_DIMENSIONS + coordinate],
        );
        assert!(prepared.evidence.scaling_range[0] <= diagonal[coordinate]);
        assert!(prepared.evidence.scaling_range[1] >= diagonal[coordinate]);
    }
    assert_eq!(
        prepared.evidence.scaling_range,
        [expected_zero, {
            let intercept_free = expected_leading.max(expected_second);
            intercept_free.max(expected_intercept)
        }]
    );
}

/// Pre-traversal rejections start no traversal and visit no rows.
#[test]
fn preparation_rejects_before_any_row_without_a_traversal() {
    let corpus = valid_corpus();
    let mut counters = WorkCounters::default();

    assert_eq!(
        prepare(
            &corpus.embeddings()[..2],
            &corpus.rows,
            settings(),
            &mut counters,
        )
        .err(),
        Some(PreparationError::RowMismatch {
            embeddings: 2,
            rows: 3,
        }),
    );
    assert_eq!(
        prepare(&[], &[], settings(), &mut counters).err(),
        Some(PreparationError::Empty),
    );
    assert_eq!(counters.preparation_requests, 2);
    assert_eq!(counters.preparation_passes, 0);
    assert_eq!(counters.preparation_row_visits, 0);
    assert_eq!(counters.started_row_traversals, 0);
    assert_eq!(counters.row_visits, 0);
    assert_eq!(counters.completed_preparation_traversals, 0);
}

/// A row failure charges every visit up to and including the failing row, with no completion.
#[test]
fn preparation_charges_visits_up_to_the_failing_row() {
    let mut corpus = Corpus::new();
    corpus.push(&[1.0], [1.0, 0.0, 0.0], 1.0);
    corpus.push(&[1.0], [0.0, 1.0, 0.0], -3.0);
    corpus.push(&[1.0], [0.0, 0.0, 1.0], 1.0);
    let mut counters = WorkCounters::default();

    assert_eq!(
        prepare(corpus.embeddings(), &corpus.rows, settings(), &mut counters).err(),
        Some(PreparationError::InvalidWeight {
            row: 1,
            value: -3.0,
        }),
    );

    assert_eq!(counters.preparation_requests, 1);
    assert_eq!(counters.preparation_passes, 1);
    assert_eq!(counters.preparation_row_visits, 2);
    assert_eq!(counters.row_visits, 2);
    assert_eq!(counters.completed_preparation_traversals, 0);
}

/// Every per-row contract names the first offending row.
#[test]
fn preparation_names_the_offending_row() {
    let mut corpus = Corpus::new();
    corpus.push(&[1.0], [1.0, 0.0, 0.0], 1.0);
    corpus.push(&[f32::NAN], [1.0, 0.0, 0.0], 1.0);
    let mut counters = WorkCounters::default();
    assert_eq!(
        prepare(corpus.embeddings(), &corpus.rows, settings(), &mut counters).err(),
        Some(PreparationError::NonFiniteEmbedding {
            row: 1,
            component: 0,
        }),
    );

    let mut corpus = Corpus::new();
    corpus.push(&[1.0], [1.0, -0.5, 0.5], 1.0);
    assert_eq!(
        prepare(corpus.embeddings(), &corpus.rows, settings(), &mut counters).err(),
        Some(PreparationError::InvalidTargetComponent {
            row: 0,
            class: GeometryClass::Proximal,
            value: -0.5,
        }),
    );

    let mut corpus = Corpus::new();
    let four_epsilon = 4.0 * f64::EPSILON;
    corpus.push(&[1.0], [0.5, 0.25, 0.25 + four_epsilon], 1.0);
    assert_matches!(
        prepare(corpus.embeddings(), &corpus.rows, settings(), &mut counters),
        Err(PreparationError::Target {
            row: 0,
            error: ClosedTargetError::SumOutOfTolerance { .. },
        }),
    );
}

/// A traversal can complete every row and still fail the aggregate class mass.
#[test]
fn preparation_completes_yet_fails_aggregate_mass() {
    let mut corpus = Corpus::new();
    corpus.push(&[1.0], [1.0, 0.0, 0.0], 1.0);
    corpus.push(&[2.0], [0.0, 0.0, 1.0], 2.0);
    let mut counters = WorkCounters::default();

    assert_eq!(
        prepare(corpus.embeddings(), &corpus.rows, settings(), &mut counters).err(),
        Some(PreparationError::MissingClassMass {
            class: GeometryClass::Proximal,
        }),
    );

    assert_eq!(counters.preparation_passes, 1);
    assert_eq!(counters.preparation_row_visits, 2);
    assert_eq!(counters.completed_preparation_traversals, 1);
}

/// [`Scaling::divide`] is one componentwise division, and dividing the diagonal by itself is one.
#[test]
fn scaling_divides_componentwise() {
    let mut scales = BoxedDVecN::<AUGMENTED_DIMENSIONS>::zero();
    for (coordinate, scale) in scales.as_array_mut().iter_mut().enumerate() {
        #[expect(clippy::cast_precision_loss, reason = "small fixture coordinates")]
        let offset = coordinate as f64;
        *scale = 0.5 + offset / 1024.0;
    }
    let scaling = Scaling::from_augmented(&scales);

    let ones = scaling.divide(scaling.diagonal());
    assert!(ones.as_array().iter().all(|quotient| *quotient == 1.0));

    let mut vector = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    for (coordinate, component) in vector.as_array_mut().iter_mut().enumerate() {
        #[expect(clippy::cast_precision_loss, reason = "small fixture coordinates")]
        let offset = coordinate as f64;
        *component = offset - 3000.0;
    }
    let quotient = scaling.divide(&vector);
    for ((out, component), scale) in quotient
        .as_array()
        .iter()
        .zip(vector.as_array())
        .zip(scaling.diagonal().as_array())
    {
        assert_eq!(*out, component / scale);
    }
}

/// Flat and structured contrast-major coordinates convert without loss or reordering.
#[test]
fn contrast_vector_roundtrips_the_flat_layout() {
    let mut flat = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    for (coordinate, component) in flat.as_array_mut().iter_mut().enumerate() {
        #[expect(clippy::cast_precision_loss, reason = "small fixture coordinates")]
        let offset = coordinate as f64;
        *component = offset + 0.25;
    }

    let structured = ContrastVector::from_flat(&flat);
    assert_eq!(structured.coefficients[0].as_array()[0], 0.25);
    assert_eq!(
        structured.intercepts[0],
        flat.as_array()[CANONICAL_DIMENSIONS],
    );
    assert_eq!(
        structured.coefficients[1].as_array()[0],
        flat.as_array()[AUGMENTED_DIMENSIONS],
    );
    assert_eq!(
        structured.intercepts[1],
        flat.as_array()[SOLVER_DIMENSIONS - 1],
    );

    assert_eq!(*structured.to_flat().as_array(), *flat.as_array());
}

/// The derived reference component reports the canonicalization distance.
#[test]
fn closed_target_records_the_derived_adjustment() {
    // The raw sum is one ulp above 1, so normalization moves the components.
    let raw = [0.5, 0.25, 0.25 + f64::EPSILON];
    let (closed, evidence) = ClosedTarget::new(raw, one_ulp()).expect("within tolerance");

    let [u_0, u_1, u_2] = closed.components();
    assert_eq!(u_2, 1.0 - (u_0 + u_1));
    assert_eq!(evidence.sum, 1.0 + f64::EPSILON);
    assert_eq!(
        evidence.adjustment,
        (u_2 - raw[2] / evidence.sum).abs(),
        "the stored components are the quotients themselves, so only the derived component adjusts",
    );
}

/// At zero parameters every row's loss is exactly `ln 3` and the objective normalizes to it.
#[test]
fn objective_at_zero_is_ln_three() {
    let corpus = valid_corpus();
    let mut counters = WorkCounters::default();
    let prepared = prepare(corpus.embeddings(), &corpus.rows, settings(), &mut counters)
        .expect("the fixture corpus prepares");

    let objective = prepared.objective_only(&ContrastVector::zero(), &mut counters);
    assert!(
        (objective - 3.0_f64.ln()).abs() <= 4.0 * f64::EPSILON,
        "{objective}",
    );
}

/// The raw-space objective over the full corpus: a per-row reference over [`objective::logits`]
/// sharing no code with the contrast evaluation.
fn raw_objective(corpus: &Corpus, raw: &Parameters, regularization: f64) -> f64 {
    let mut objective = 0.0;
    for (row, embedding) in corpus.rows.iter().zip(corpus.embeddings()) {
        let logits = objective::logits(raw, embedding);
        let log_normalizer = DVecN::new(logits).log_sum_exp();

        let target_logit = row
            .target
            .into_iter()
            .zip(logits)
            .map(|(target, logit)| target * logit)
            .sum::<f64>();

        let target_mass = row.target.into_iter().sum::<f64>();
        objective = row.weight.mul_add(
            target_mass.mul_add(log_normalizer, -target_logit),
            objective,
        );
    }

    let (rows, _) = raw.as_array().as_chunks::<CANONICAL_DIMENSIONS>();
    for row in rows {
        objective = (0.5 * regularization).mul_add(DVecN::from_ref(row).norm_squared(), objective);
    }
    objective
}

/// The contrast objective agrees with the raw-space objective at `W = BA`, `b = Ba`.
#[test]
fn objective_matches_the_raw_space_reference() {
    let corpus = valid_corpus();
    let mut counters = WorkCounters::default();
    let prepared = prepare(corpus.embeddings(), &corpus.rows, settings(), &mut counters)
        .expect("the fixture corpus prepares");
    let parameters = solver_parameters();

    let mine = prepared.objective_only(&parameters, &mut counters);
    let reference = raw_objective(
        &corpus,
        &raw_parameters(&parameters),
        settings().regularization.get(),
    ) / prepared.total_weight;
    assert!(
        (mine - reference).abs() <= 1.0e-12 * reference.abs().max(1.0),
        "{mine} vs {reference}",
    );
}

/// Both raw gauges leave the data loss unchanged and vanish under contrast projection.
#[test]
fn raw_gauges_are_flat_and_projected_away() {
    let corpus = valid_corpus();
    let parameters = solver_parameters();

    let raw = raw_parameters(&parameters);
    // Regularization zero isolates the data term, whose gauges are exact.
    let base = raw_objective(&corpus, &raw, 0.0);

    // Intercept gauge b → b + c·1 and coefficient gauge W → W + 1vᵀ, applied together.
    let mut shifted = raw;
    {
        let (rows, intercepts) = shifted
            .as_array_mut()
            .as_chunks_mut::<CANONICAL_DIMENSIONS>();
        for row in rows.iter_mut() {
            row[0] += 0.83;
            row[1] -= 0.41;
        }
        for intercept in intercepts {
            *intercept += 0.37;
        }
    }
    let gauged = raw_objective(&corpus, &shifted, 0.0);
    assert!(
        (gauged - base).abs() <= 1.0e-10 * base.abs().max(1.0),
        "{gauged} vs {base}",
    );

    // Projection A = BᵀW, a = Bᵀb recovers the same contrast coordinates from either gauge.
    let (rows, intercepts) = shifted.as_array().as_chunks::<CANONICAL_DIMENSIONS>();
    assert!(rows.len() > 2, "one coefficient row per class");
    for coordinate in [0, 1, 2] {
        let projected = basis::reduce([
            rows[0][coordinate],
            rows[1][coordinate],
            rows[2][coordinate],
        ]);
        for (row, value) in projected.into_iter().enumerate() {
            let original = parameters.coefficients[row].as_array()[coordinate];
            assert!(
                (value - original).abs() <= 1.0e-14,
                "coefficient[{row}][{coordinate}]: {value} vs {original}",
            );
        }
    }
    let intercepts: [f64; GeometryClass::COUNT] = core::array::from_fn(|class| intercepts[class]);
    for (row, value) in basis::reduce(intercepts).into_iter().enumerate() {
        let original = parameters.intercepts[row];
        assert!(
            (value - original).abs() <= 1.0e-14,
            "intercept[{row}]: {value} vs {original}",
        );
    }
}

/// The analytical gradient matches central finite differences of the objective.
#[test]
fn gradient_matches_finite_differences() {
    let corpus = valid_corpus();
    let mut counters = WorkCounters::default();
    let prepared = prepare(corpus.embeddings(), &corpus.rows, settings(), &mut counters)
        .expect("the fixture corpus prepares");
    let parameters = solver_parameters();

    let gradient = prepared
        .gradient_only(&parameters, &mut counters)
        .expect("the fixture request is finite");
    let step = 1.0e-5;
    for direction in directions() {
        let forward = prepared.objective_only(&axpy(&parameters, &direction, step), &mut counters);
        let backward =
            prepared.objective_only(&axpy(&parameters, &direction, -step), &mut counters);
        let numerical = (forward - backward) / (2.0 * step);
        let analytical = flat_dot(&gradient, &direction);
        assert!(
            (numerical - analytical).abs() <= 1.0e-8 * analytical.abs().max(1.0),
            "{numerical} vs {analytical}",
        );
    }
}

/// The joint evaluation returns the same bytes as the separate passes.
#[test]
fn joint_evaluation_matches_the_separate_passes() {
    let corpus = valid_corpus();
    let mut counters = WorkCounters::default();
    let prepared = prepare(corpus.embeddings(), &corpus.rows, settings(), &mut counters)
        .expect("the fixture corpus prepares");
    let parameters = solver_parameters();

    let joint = prepared
        .joint(&parameters, &mut counters)
        .expect("the fixture request is finite");
    assert_eq!(
        joint.objective,
        prepared.objective_only(&parameters, &mut counters),
    );
    assert_eq!(
        joint.gradient,
        prepared
            .gradient_only(&parameters, &mut counters)
            .expect("the fixture request is finite"),
    );
}

/// The Hessian-vector product matches central finite differences of the gradient.
#[test]
fn hessian_vector_matches_gradient_differences() {
    let corpus = valid_corpus();
    let mut counters = WorkCounters::default();
    let prepared = prepare(corpus.embeddings(), &corpus.rows, settings(), &mut counters)
        .expect("the fixture corpus prepares");
    let parameters = solver_parameters();

    let step = 1.0e-5;
    for direction in directions() {
        let product = prepared
            .hessian_vector(&parameters, &direction, &mut counters)
            .expect("the fixture request is finite");
        let forward = prepared
            .gradient_only(&axpy(&parameters, &direction, step), &mut counters)
            .expect("the displaced fixture request is finite");
        let backward = prepared
            .gradient_only(&axpy(&parameters, &direction, -step), &mut counters)
            .expect("the displaced fixture request is finite");

        // Compare on the touched coordinates and every intercept.
        for row in 0..CONTRAST_ROWS {
            for coordinate in 0..3 {
                let numerical = (forward.coefficients[row].as_array()[coordinate]
                    - backward.coefficients[row].as_array()[coordinate])
                    / (2.0 * step);
                let analytical = product.coefficients[row].as_array()[coordinate];
                assert!(
                    (numerical - analytical).abs() <= 1.0e-7 * analytical.abs().max(1.0),
                    "coefficient[{row}][{coordinate}]: {numerical} vs {analytical}",
                );
            }
            let numerical = (forward.intercepts[row] - backward.intercepts[row]) / (2.0 * step);
            let analytical = product.intercepts[row];
            assert!(
                (numerical - analytical).abs() <= 1.0e-7 * analytical.abs().max(1.0),
                "intercept[{row}]: {numerical} vs {analytical}",
            );
        }
    }
}

/// The Hessian is symmetric and strictly positive along every witness direction.
#[test]
fn hessian_is_symmetric_and_strictly_convex() {
    let corpus = valid_corpus();
    let mut counters = WorkCounters::default();
    let prepared = prepare(corpus.embeddings(), &corpus.rows, settings(), &mut counters)
        .expect("the fixture corpus prepares");
    let parameters = solver_parameters();

    let [coefficient, intercept, mixed] = directions();
    for (left, right) in [
        (&coefficient, &intercept),
        (&coefficient, &mixed),
        (&intercept, &mixed),
    ] {
        let left_product = prepared
            .hessian_vector(&parameters, left, &mut counters)
            .expect("the fixture request is finite");
        let right_product = prepared
            .hessian_vector(&parameters, right, &mut counters)
            .expect("the fixture request is finite");
        let forward = flat_dot(left, &right_product);
        let backward = flat_dot(right, &left_product);
        assert!(
            (forward - backward).abs() <= 1.0e-12 * forward.abs().max(1.0),
            "{forward} vs {backward}",
        );
    }

    for direction in directions() {
        let product = prepared
            .hessian_vector(&parameters, &direction, &mut counters)
            .expect("the fixture request is finite");
        let curvature = flat_dot(&direction, &product);
        assert!(curvature > 0.0, "curvature {curvature} is not positive");
    }
}

/// Every evaluation charges its logical requests, pass shape, and physical traversal.
#[test]
fn evaluations_charge_their_work() {
    let corpus = valid_corpus();
    let mut counters = WorkCounters::default();
    let prepared = prepare(corpus.embeddings(), &corpus.rows, settings(), &mut counters)
        .expect("the fixture corpus prepares");
    let parameters = solver_parameters();
    let baseline = counters;

    let _joint = prepared
        .joint(&parameters, &mut counters)
        .expect("the fixture request is finite");
    let _objective = prepared.objective_only(&parameters, &mut counters);
    let _gradient = prepared
        .gradient_only(&parameters, &mut counters)
        .expect("the fixture request is finite");
    let _product = prepared.hessian_vector(&parameters, &directions()[0], &mut counters);

    assert_eq!(counters.objective_requests, 2);
    assert_eq!(counters.gradient_requests, 2);
    assert_eq!(counters.hvp_requests, 1);
    assert_eq!(counters.joint_passes, 1);
    assert_eq!(counters.objective_only_passes, 1);
    assert_eq!(counters.gradient_only_passes, 1);
    assert_eq!(
        counters.started_row_traversals,
        baseline.started_row_traversals + 4,
    );
    assert_eq!(counters.row_visits, baseline.row_visits + 4 * 3);
    assert_eq!(counters.completed_joint_traversals, 1);
    assert_eq!(counters.completed_objective_traversals, 1);
    assert_eq!(counters.completed_gradient_traversals, 1);
    assert_eq!(counters.completed_hvp_traversals, 1);
}

/// A non-finite request charges its logical request only and yields no result.
#[test]
fn non_finite_requests_start_no_traversal() {
    let corpus = valid_corpus();
    let mut counters = WorkCounters::default();
    let prepared = prepare(corpus.embeddings(), &corpus.rows, settings(), &mut counters)
        .expect("the fixture corpus prepares");
    let baseline = counters;

    let mut poisoned = solver_parameters();
    poisoned.intercepts[0] = f64::NAN;

    assert!(prepared.joint(&poisoned, &mut counters).is_none());
    assert!(prepared.objective_only(&poisoned, &mut counters).is_nan());
    assert!(prepared.gradient_only(&poisoned, &mut counters).is_none());
    assert!(
        prepared
            .hessian_vector(&solver_parameters(), &poisoned, &mut counters)
            .is_none()
    );

    assert_eq!(counters.objective_requests, 2);
    assert_eq!(counters.gradient_requests, 2);
    assert_eq!(counters.hvp_requests, 1);
    assert_eq!(counters.joint_passes, 0);
    assert_eq!(counters.objective_only_passes, 0);
    assert_eq!(counters.gradient_only_passes, 0);
    assert_eq!(
        counters.started_row_traversals,
        baseline.started_row_traversals
    );
    assert_eq!(counters.row_visits, baseline.row_visits);
}

/// Every special spacing case of the objective resolution holds exactly.
#[test]
fn objective_resolution_pins_the_ulp_exceptional_cases() {
    let four = NonZeroU32::new(4).expect("four is nonzero");

    // Zero and subnormal magnitudes resolve at the smallest positive subnormal spacing.
    assert_eq!(
        objective_resolution(0.0, one_ulp()),
        Some(f64::from_bits(1))
    );
    assert_eq!(
        objective_resolution(-0.0, one_ulp()),
        Some(f64::from_bits(1))
    );
    assert_eq!(
        objective_resolution(f64::MIN_POSITIVE / 2.0, one_ulp()),
        Some(f64::from_bits(1)),
    );
    assert_eq!(
        objective_resolution(0.0, four),
        Some(4.0 * f64::from_bits(1)),
    );

    // Normal magnitudes resolve at the next-up spacing, and negatives contribute magnitude only.
    assert_eq!(objective_resolution(1.0, one_ulp()), Some(f64::EPSILON));
    assert_eq!(objective_resolution(-1.0, one_ulp()), Some(f64::EPSILON));
    assert_eq!(
        objective_resolution(2.0, one_ulp()),
        Some(2.0 * f64::EPSILON),
        "at an exact power of two the next-up spacing is the wider interval's",
    );
    assert_eq!(objective_resolution(-1.0, four), Some(4.0 * f64::EPSILON),);

    // The top of the grid uses the predecessor spacing and stays finite.
    let top = objective_resolution(f64::MAX, one_ulp()).expect("finite at the maximum");
    assert_eq!(top, f64::MAX - f64::MAX.next_down());
    let widest = NonZeroU32::new(u32::MAX).expect("u32::MAX is nonzero");
    assert!(
        objective_resolution(f64::MAX, widest)
            .expect("the widest resolution stays finite")
            .is_finite(),
    );

    // Non-finite objectives carry no resolution.
    assert_eq!(objective_resolution(f64::NAN, one_ulp()), None);
    assert_eq!(objective_resolution(f64::INFINITY, one_ulp()), None);
    assert_eq!(objective_resolution(f64::NEG_INFINITY, one_ulp()), None);
}

/// A fully in-domain solver configuration.
fn solver_config() -> SolverConfig {
    SolverConfig {
        preparation: settings(),
        radius_minimum: d_positive!(1.0e-8),
        radius_initial: DPositive::ONE,
        radius_maximum: d_positive!(1.0e4),
        shrink_factor: open_unit_fraction!(0.25),
        expansion_factor: greater_than_one!(2.0),
        eta_accept: open_unit_fraction!(0.1),
        eta_expand: open_unit_fraction!(0.75),
        relative_scaled_gradient_tolerance: open_unit_fraction!(1.0e-6),
        absolute_scaled_gradient_tolerance: d_non_negative!(1.0e-10),
        objective_resolution_ulps: NonZeroU32::new(4).expect("four is nonzero"),
        curvature_guard_ulps: NonZeroU32::new(16).expect("sixteen is nonzero"),
        maximum_outer_iterations: NonZeroU64::new(100).expect("one hundred is nonzero"),
        maximum_hvp_requests: NonZeroU64::new(5_000).expect("five thousand is nonzero"),
        maximum_objective_requests: 200,
        maximum_gradient_requests: 200,
        maximum_row_traversals: 10_000,
    }
}

/// The in-domain fixture and the cross-field boundaries validate.
///
/// Per-field domains hold by construction; only the orderings and floors are validate's to
/// accept.
#[test]
fn config_accepts_the_domain_boundaries() {
    solver_config()
        .validate()
        .expect("the fixture is in-domain");

    // Equalities inside the radius chain are inclusive.
    SolverConfig {
        radius_minimum: DPositive::ONE,
        radius_initial: DPositive::ONE,
        radius_maximum: DPositive::ONE,
        ..solver_config()
    }
    .validate()
    .expect("a degenerate radius chain is in-domain");

    // Budget floors admit equality.
    SolverConfig {
        maximum_objective_requests: 2,
        maximum_gradient_requests: 2,
        maximum_row_traversals: 3,
        ..solver_config()
    }
    .validate()
    .expect("the budget floors are inclusive");
}

/// Validation rejects every violated cross-field ordering by name.
#[test]
fn config_rejects_misordered_fields() {
    let base = solver_config();

    // Every radius is individually in-domain, and only the ordering fails.
    for (minimum, initial, maximum) in [(2.0, 1.0, 3.0), (1.0, 3.0, 2.0), (2.0, 2.0, 1.0)] {
        assert_matches!(
            SolverConfig {
                radius_minimum: DPositive::new(minimum).expect("the case radius is positive"),
                radius_initial: DPositive::new(initial).expect("the case radius is positive"),
                radius_maximum: DPositive::new(maximum).expect("the case radius is positive"),
                ..base
            }
            .validate(),
            Err(SolverConfigError::RadiusDomain { .. }),
        );
    }

    // Both thresholds are individually interior, leaving equality and inversion as the violations.
    for (accept, expand) in [(0.5, 0.5), (0.5, 0.1)] {
        assert_matches!(
            SolverConfig {
                eta_accept: OpenUnitFraction::new(accept).expect("the case threshold is interior"),
                eta_expand: OpenUnitFraction::new(expand).expect("the case threshold is interior"),
                ..base
            }
            .validate(),
            Err(SolverConfigError::AcceptanceThresholds { .. }),
        );
    }
}

/// Every floored work budget rejects below its floor, by name.
#[test]
fn config_rejects_budgets_below_their_floors() {
    let base = solver_config();

    assert_eq!(
        SolverConfig {
            maximum_objective_requests: 1,
            ..base
        }
        .validate(),
        Err(SolverConfigError::ObjectiveBudget { value: 1 }),
    );
    assert_eq!(
        SolverConfig {
            maximum_gradient_requests: 1,
            ..base
        }
        .validate(),
        Err(SolverConfigError::GradientBudget { value: 1 }),
    );
    assert_eq!(
        SolverConfig {
            maximum_row_traversals: 2,
            ..base
        }
        .validate(),
        Err(SolverConfigError::TraversalBudget { value: 2 }),
    );
}

/// The gradient threshold is the stated maximum, zero is valid, and only a non-finite norm
/// maps away.
#[test]
fn gradient_threshold_follows_the_ruled_domain() {
    let config = SolverConfig {
        absolute_scaled_gradient_tolerance: DNonNegative::ZERO,
        relative_scaled_gradient_tolerance: open_unit_fraction!(1.0e-6),
        ..solver_config()
    };

    // With the absolute floor at zero the threshold is the pure relative term.
    assert_eq!(config.gradient_threshold(8.0), Some(1.0e-6 * 8.0));

    // With the absolute floor at zero and an exactly-zero initial norm the threshold is zero, and
    // only the exactly-zero gradient satisfies the sole certificate predicate.
    let zero_threshold = config
        .gradient_threshold(0.0)
        .expect("a zero threshold is valid");
    assert_eq!(zero_threshold, 0.0);
    assert!(0.0 <= zero_threshold);

    // A positive absolute floor dominates small initial norms.
    let floored = SolverConfig {
        absolute_scaled_gradient_tolerance: d_non_negative!(1.0e-4),
        ..config
    };
    assert_eq!(floored.gradient_threshold(1.0), Some(1.0e-4));

    // Only a non-finite initial norm maps to the overflow outcome; the threshold itself is
    // finite by construction.
    assert_eq!(config.gradient_threshold(f64::NAN), None);
    assert_eq!(config.gradient_threshold(f64::INFINITY), None);
}

/// From the origin the crossing is `τ = Δ/‖d‖`, and every output is exactly representable.
#[test]
fn boundary_step_crosses_exactly_from_the_origin() {
    let interior = flat(&[]);
    let direction = flat(&[(0, 1.0)]);
    let hessian_interior = flat(&[]);
    let hessian_direction = flat(&[(0, 0.5), (1, 0.25)]);

    let crossed = boundary_step(
        &interior,
        &direction,
        &hessian_interior,
        &hessian_direction,
        4.0,
    )
    .expect("the origin crossing is exact");

    // τ = 4: the step equals Δ·e₀ and the product advances by 4·H·d, all powers of two.
    assert_eq!(crossed.step.as_array()[0], 4.0);
    assert_eq!(crossed.step.as_array()[1], 0.0);
    assert_eq!(crossed.hessian_step.as_array()[0], 2.0);
    assert_eq!(crossed.hessian_step.as_array()[1], 1.0);
}

/// A backward direction picks the far crossing through the first (positive) paired root.
#[test]
fn boundary_step_picks_the_far_crossing_for_a_backward_direction() {
    let interior = flat(&[(0, 1.0)]);
    let direction = flat(&[(0, -1.0)]);
    let zero = flat(&[]);

    let crossed = boundary_step(&interior, &direction, &zero, &zero, 2.0)
        .expect("the backward crossing is exact");

    // From p = e₀ along −e₀ the boundary sits at −Δ·e₀, a crossing of τ = 3.
    assert_eq!(crossed.step.as_array()[0], -2.0);
    assert_eq!(crossed.hessian_step.as_array()[0], 0.0);
}

/// The Hessian product advances along the same `τ` as the step.
#[test]
fn boundary_step_advances_the_hessian_product_along_the_crossing() {
    let interior = flat(&[(0, 1.0)]);
    let direction = flat(&[(0, 1.0)]);
    let hessian_interior = flat(&[(0, 0.5), (1, 1.0)]);
    let hessian_direction = flat(&[(0, 0.25), (1, -0.5)]);

    let crossed = boundary_step(
        &interior,
        &direction,
        &hessian_interior,
        &hessian_direction,
        2.0,
    )
    .expect("the forward crossing is exact");

    // τ = 1: p + d reaches the radius, and Hp + H·d follows bit-for-bit.
    assert_eq!(crossed.step.as_array()[0], 2.0);
    assert_eq!(crossed.hessian_step.as_array()[0], 0.75);
    assert_eq!(crossed.hessian_step.as_array()[1], 0.5);
}

/// An irrational crossing under an odd radius passes both norm gates of the gross-defect guard.
#[test]
fn boundary_step_survives_an_irrational_crossing() {
    let interior = flat(&[(0, 0.75)]);
    let direction = flat(&[(1, 1.5)]);
    let hessian_interior = flat(&[(0, 0.5)]);
    let hessian_direction = flat(&[(1, 0.5)]);

    let crossed = boundary_step(
        &interior,
        &direction,
        &hessian_interior,
        &hessian_direction,
        3.0,
    )
    .expect("the crossing passes both norm gates");

    // τ = 1.875/√0.9375: the untouched coordinate stays exact, the advanced ones carry only
    // rounding-level error against the closed forms 1.5·τ and 0.5·τ.
    assert_eq!(crossed.step.as_array()[0], 0.75);
    assert!((crossed.step.as_array()[1] - 2.904_737_509_655_563).abs() < 1.0e-14);
    assert_eq!(crossed.hessian_step.as_array()[0], 0.5);
    assert!((crossed.hessian_step.as_array()[1] - 0.968_245_836_551_854_3).abs() < 1.0e-14);
}

/// An iterate on or beyond the boundary violates `c < 0` and constructs nothing.
#[test]
fn boundary_step_rejects_a_non_interior_iterate() {
    let direction = flat(&[(0, 1.0)]);
    let zero = flat(&[]);

    let on_boundary = flat(&[(0, 4.0)]);
    assert_eq!(
        boundary_step(&on_boundary, &direction, &zero, &zero, 4.0),
        None,
    );

    let beyond = flat(&[(0, 8.0)]);
    assert_eq!(boundary_step(&beyond, &direction, &zero, &zero, 4.0), None,);
}

/// A zero direction violates `a > 0` and constructs nothing.
#[test]
fn boundary_step_rejects_a_zero_direction() {
    let interior = flat(&[(0, 1.0)]);
    let zero = flat(&[]);

    assert_eq!(boundary_step(&interior, &zero, &zero, &zero, 4.0), None,);
}

/// The boundary construction rejects an overflowing radius normalization before any coefficient
/// forms.
#[test]
fn boundary_step_rejects_a_non_finite_normalization() {
    let interior = flat(&[(0, f64::MAX)]);
    let direction = flat(&[(0, 1.0)]);
    let zero = flat(&[]);

    assert_eq!(
        boundary_step(&interior, &direction, &zero, &zero, 0.5),
        None,
    );
}

/// An overflowing Hessian extension rejects the whole construction.
#[test]
fn boundary_step_rejects_an_overflowing_hessian_extension() {
    let interior = flat(&[]);
    let direction = flat(&[(0, 1.0)]);
    let hessian_interior = flat(&[]);
    let hessian_direction = flat(&[(0, f64::MAX)]);

    assert_eq!(
        boundary_step(
            &interior,
            &direction,
            &hessian_interior,
            &hessian_direction,
            4.0,
        ),
        None,
    );
}

/// The returned-step revalidation catches a radius whose rescaling quantizes to subnormals.
#[test]
fn boundary_revalidation_rejects_a_subnormal_rescaling() {
    let zero = flat(&[]);
    // 2⁻¹⁰⁴⁰: a subnormal radius whose rescaled step components quantize on the 2⁻¹⁰⁷⁴ grid,
    // mangling the returned geometry by ~2⁻²⁸ relative - far outside the gross-defect guard.
    let radius = f64::from_bits(1_u64 << 34);
    let mut direction = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    direction.as_array_mut().fill(radius);

    // The same geometry at radius one passes both gates: the normalized crossing itself is
    // sound, so a rejection below can only come from the rescaling revalidation.
    let mut unit_direction = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    unit_direction.as_array_mut().fill(1.0);
    boundary_step(&zero, &unit_direction, &zero, &zero, 1.0)
        .expect("the crossing is sound at a unit radius");

    assert_eq!(boundary_step(&zero, &direction, &zero, &zero, radius), None,);
}

/// Returns a deterministic dense component from the Weyl sequence on the golden ratio at the given
/// phase, folded to `[-1, 1]`, with every third component thinned to vary magnitudes within the
/// fill.
#[expect(
    clippy::cast_precision_loss,
    reason = "solver indices stay far below 2^52"
)]
fn dense_component(index: usize, phase: f64) -> f64 {
    let golden = 0.618_033_988_749_894_9_f64;
    let raw = (index as f64).mul_add(golden, phase);
    let fractional = raw - raw.floor();
    let signed = 2.0_f64.mul_add(fractional, -1.0);
    if index.is_multiple_of(3) {
        signed * 0.125
    } else {
        signed
    }
}

/// A dense solver vector with two full-scale leading components over a `1e-3` tail, scaled to
/// the given Euclidean norm.
///
/// The magnitude split concentrates the norm in two components while thousands of small squares
/// absorb into the fold accumulators, the structure that drives the reductions' rounding;
/// uniform dense fills stay within a few ulps of an exact unit norm at this dimension.
fn spiked_dense(norm: f64, phase: f64) -> BoxedDVecN<SOLVER_DIMENSIONS> {
    let mut vector = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    for (index, component) in vector.as_array_mut().iter_mut().enumerate() {
        let scale = if index < 2 { 1.0 } else { 1.0e-3 };
        *component = dense_component(index, phase) * scale;
    }
    let current = stable_l2(&vector).expect("the dense fill is finite");
    *vector *= norm / current;
    vector
}

/// Computes the Euclidean norm through an independent reduction.
///
/// The reduction is a scalar Neumaier-compensated sum of squares that shares no fold structure with
/// the house kernels. This is a reference for reported residuals rather than an accuracy oracle.
fn compensated_l2(values: &[f64]) -> f64 {
    let mut sum = 0.0_f64;
    let mut compensation = 0.0_f64;
    for &value in values {
        let squared = value * value;
        let tentative = sum + squared;
        compensation += if sum.abs() >= squared.abs() {
            (sum - tentative) + squared
        } else {
            (squared - tentative) + sum
        };
        sum = tentative;
    }
    (sum + compensation).sqrt()
}

/// Replicates the boundary construction through the same primitives, returning the rescaled
/// step with the built and returned radius-normalized residuals in ulps of one.
///
/// The built residual is internal to [`boundary_step`]; a consumer ties the replica to the
/// implementation by asserting the returned step equals the admitted payload bit-for-bit, so
/// the replica cannot drift from the arithmetic it reports on.
fn boundary_construction_replica(
    interior: &BoxedDVecN<SOLVER_DIMENSIONS>,
    direction: &BoxedDVecN<SOLVER_DIMENSIONS>,
    radius: f64,
) -> Option<(BoxedDVecN<SOLVER_DIMENSIONS>, f64, f64)> {
    let normalize = |vector: &BoxedDVecN<SOLVER_DIMENSIONS>| {
        let mut normalized = vector.clone();
        *normalized /= radius;
        normalized.is_finite().then_some(normalized)
    };
    let normalized_interior = normalize(interior)?;
    let normalized_direction = normalize(direction)?;

    let quadratic = checked_norm_squared(&normalized_direction)?;
    let linear = 2.0 * checked_dot(&normalized_interior, &normalized_direction)?;
    let constant = checked_norm_squared(&normalized_interior)? - 1.0;
    if !linear.is_finite() || quadratic <= 0.0 || constant >= 0.0 {
        return None;
    }
    let discriminant = linear.mul_add(linear, -4.0 * quadratic * constant);
    if !discriminant.is_finite() || discriminant < 0.0 {
        return None;
    }
    let root = -0.5 * (linear + discriminant.sqrt().copysign(linear));
    if !root.is_finite() || root == 0.0 {
        return None;
    }
    let crossing = [root / quadratic, constant / root]
        .into_iter()
        .find(|tau| tau.is_finite() && *tau > 0.0)?;

    let boundary = flat_vectors::advance(&normalized_interior, crossing, &normalized_direction);
    let norm = stable_l2(&boundary)?;
    let built = (norm - 1.0).abs() / f64::EPSILON;

    let mut step = boundary;
    *step *= radius;
    let returned = normalize(&step)?;
    let returned_norm = stable_l2(&returned)?;
    let returned_ulps = (returned_norm - 1.0).abs() / f64::EPSILON;
    Some((step, built, returned_ulps))
}

/// A dense solver-dimension crossing constructs, and the replica ties it byte-for-byte.
///
/// The crossing has `‖interior‖ = 0.9392·Δ`, `‖direction‖ = 3.404·Δ`,
/// `interior·direction ≈ −1.5624`, `Δ = 0.7`: a dense, cancellation-prone construction whose
/// honest residuals sit orders of magnitude inside the gross-defect guard. The byte-tie keeps
/// the replica honest: its reported residuals describe exactly the arithmetic that produced
/// the admitted step.
#[test]
fn boundary_step_admits_the_dense_crossing_and_ties_its_replica() {
    let radius = 0.7;
    let interior = spiked_dense(0.9392 * radius, 0.6);
    let direction = spiked_dense(3.404 * radius, 0.275);
    let hessian_interior = spiked_dense(0.5, 0.7);
    let hessian_direction = spiked_dense(1.0, 0.9);

    let guard_ulps = GROSS_DEFECT_GUARD / f64::EPSILON;
    let (replica_step, built, returned) =
        boundary_construction_replica(&interior, &direction, radius)
            .expect("the dense crossing constructs");
    assert!(built < guard_ulps, "built residual {built} ulp");
    assert!(returned < guard_ulps, "returned residual {returned} ulp");

    let admitted = boundary_step(
        &interior,
        &direction,
        &hessian_interior,
        &hessian_direction,
        radius,
    )
    .expect("the guard admits the crossing");

    // The byte-tie keeps the replica honest: the residuals above describe exactly the
    // arithmetic that produced the admitted step.
    assert_eq!(admitted.step.as_array(), replica_step.as_array());
    assert!(admitted.hessian_step.is_finite());

    // The independent reference agrees on the regime: the deviation is geometric, not an
    // artifact of the measuring fold.
    let mut normalized = admitted.step;
    *normalized /= radius;
    let reference = (compensated_l2(normalized.as_array()) - 1.0).abs() / f64::EPSILON;
    assert!(
        reference < guard_ulps,
        "compensated reference {reference} ulp"
    );
}

/// Honest crossings across the historical calibration grid's corners sit far inside the guard.
#[test]
fn honest_boundary_residuals_sit_inside_the_gross_defect_guard() {
    let guard_ulps = GROSS_DEFECT_GUARD / f64::EPSILON;
    for radius in [9.5e-4_f64, 0.7, 1.6e4] {
        for interior_fraction in [0.31_f64, 0.9392, 0.999] {
            let interior = spiked_dense(interior_fraction * radius, 0.55);
            let direction = spiked_dense(9.7 * radius, 0.2);
            let (_, built, returned) = boundary_construction_replica(&interior, &direction, radius)
                .expect("the honest crossing constructs");
            assert!(built < guard_ulps, "built {built} ulp at radius {radius}");
            assert!(
                returned < guard_ulps,
                "returned {returned} ulp at radius {radius}"
            );
        }
    }
}

/// The guard rejects a collapsed discriminant: the double-root value solves no crossing.
///
/// A construction whose discriminant flushed to zero yields `τ = −b/(2a)`; on a real crossing
/// that value lands the step far off unit norm, and the guard names the defect.
#[test]
fn the_gross_defect_guard_rejects_a_collapsed_discriminant() {
    // u = 0.6·e₀, v = e₀ + e₁ at Δ = 1 gives a = 2, b = 1.2, c = −0.64, honest τ = 0.34.
    let interior = flat(&[(0, 0.6)]);
    let direction = flat(&[(0, 1.0), (1, 1.0)]);
    let zero = flat(&[]);

    let collapsed = -1.2 / (2.0 * 2.0);
    let step = flat_vectors::advance(&interior, collapsed, &direction);
    let norm = stable_l2(&step).expect("the defective step is finite");
    assert!((norm - 1.0).abs() > GROSS_DEFECT_GUARD);

    // The honest construction of the same crossing passes both guard checks.
    boundary_step(&interior, &direction, &zero, &zero, 1.0)
        .expect("the honest crossing constructs");
}

/// The guard rejects the τ of a mis-built quadratic: an unhalved linear coefficient.
#[test]
fn the_gross_defect_guard_rejects_a_coefficient_defect() {
    // The same crossing with b = u·v instead of 2·u·v: the τ solves the wrong equation.
    let interior = flat(&[(0, 0.6)]);
    let direction = flat(&[(0, 1.0), (1, 1.0)]);

    let defective_linear = 0.6_f64;
    let quadratic = 2.0_f64;
    let constant = -0.64_f64;
    let discriminant = defective_linear.mul_add(defective_linear, -4.0 * quadratic * constant);
    let root = -0.5 * (defective_linear + discriminant.sqrt().copysign(defective_linear));
    let tau = constant / root;
    assert!(
        tau > 0.0,
        "the defective pairing still yields a forward tau"
    );

    let step = flat_vectors::advance(&interior, tau, &direction);
    let norm = stable_l2(&step).expect("the defective step is finite");
    assert!((norm - 1.0).abs() > GROSS_DEFECT_GUARD);
}

/// Rows whose targets all close to the uniform distribution: the origin is the minimizer.
fn uniform_corpus() -> Corpus {
    let third = 1.0 / 3.0;
    let mut corpus = Corpus::new();
    corpus.push(&[2.0, -1.0], [third; 3], 1.5);
    corpus.push(&[0.0, 3.0], [third; 3], 2.5);
    corpus.push(&[1.0, 0.5], [third; 3], 1.0);
    corpus
}

/// Prepares the corpus and runs the machine under the given configuration.
fn run_solver(corpus: &Corpus, config: SolverConfig) -> SolverRun {
    let mut counters = WorkCounters::default();
    let prepared = prepare(
        corpus.embeddings(),
        &corpus.rows,
        config.preparation,
        &mut counters,
    )
    .expect("the fixture corpus prepares");
    let gram = Gram::assemble(corpus.embeddings(), &mut counters);
    solve(
        &ScaledProblem {
            prepared,
            gram: GramView::full(&gram),
            config,
        },
        counters,
        ReceiptDetail::Digests,
    )
}

/// A passing initial gradient certifies before any outer iteration starts.
#[test]
fn solve_certifies_immediately_when_the_initial_gradient_passes() {
    let corpus = uniform_corpus();
    let run = run_solver(&corpus, solver_config());

    let converged = run.outcome.expect("the origin certifies immediately");
    assert!(
        converged
            .point
            .zeta
            .as_array()
            .iter()
            .all(|&value| value == 0.0)
    );
    assert!((converged.point.objective - 3.0_f64.ln()).abs() < 1.0e-12);

    // No outer iteration started, so the receipt list stays empty and the inner counters stay at
    // zero. The final certificate alone consumed the reserve.
    assert_eq!(run.control.outer_iterations_started, 0);
    assert!(run.receipts.is_empty());
    assert!(!run.control.final_reserve);
    let counters = run.control.counters;
    assert_eq!(counters.hvp_requests, 0);
    assert_eq!(counters.factorizations, 0);
    assert_eq!(counters.gram_assemblies, 1);
    assert_eq!(counters.joint_passes, 2);
    assert_eq!(counters.objective_requests, 2);
    assert_eq!(counters.gradient_requests, 2);
    assert_eq!(counters.started_row_traversals, 3);
    assert_eq!(counters.row_visits, 9);
    assert_eq!(counters.completed_joint_traversals, 2);
}

/// The routine posture stores no receipts: outcome, control, and certificate alone return.
#[test]
fn solve_stores_no_receipts_routinely() {
    let corpus = valid_corpus();
    let config = solver_config();
    let mut counters = WorkCounters::default();
    let prepared = prepare(
        corpus.embeddings(),
        &corpus.rows,
        config.preparation,
        &mut counters,
    )
    .expect("the fixture corpus prepares");
    let gram = Gram::assemble(corpus.embeddings(), &mut counters);
    let run = solve(
        &ScaledProblem {
            prepared,
            gram: GramView::full(&gram),
            config,
        },
        counters,
        ReceiptDetail::None,
    );

    run.outcome.expect("the fixture corpus converges");
    assert!(
        run.control.outer_iterations_started > 0,
        "outer iterations started"
    );
    assert!(run.receipts.is_empty(), "the routine posture stores none");
    assert!(
        run.coordinates.is_none(),
        "the coordinate identity travels with the receipts it describes"
    );
}

/// The full loop converges on the fixture corpus with truthful accounting throughout.
#[test]
fn solve_converges_on_the_fixture_corpus() {
    let corpus = valid_corpus();
    let config = solver_config();
    let run = run_solver(&corpus, config);

    let converged = run.outcome.expect("the fixture corpus converges");

    // The certificate evidence pins the derived threshold to its formula, and the fresh final
    // gradient satisfies it.
    let evidence = run.certificate.expect("the threshold was derived");
    assert_eq!(
        Some(evidence.gradient_threshold),
        config.gradient_threshold(evidence.initial_gradient_norm),
    );
    let final_norm =
        stable_l2(&converged.point.scaled_gradient).expect("the certified gradient is finite");
    assert!(final_norm <= evidence.gradient_threshold);

    // One receipt per started outer iteration, and the first one snapshots the origin.
    assert_eq!(
        run.receipts.len(),
        usize::try_from(run.control.outer_iterations_started).expect("small count")
    );
    let first = &run.receipts[0];
    assert_eq!(first.outer_iteration, 1);
    assert_eq!(first.radius, config.radius_initial.get());
    assert_eq!(
        first.digests.zeta,
        vector_digest(&BoxedDVecN::<SOLVER_DIMENSIONS>::zero())
    );
    assert!(converged.point.objective < first.objective);

    // Counter truthfulness: requests reconcile with passes and candidate outcomes, and every
    // started traversal belongs to a named category.
    let counters = run.control.counters;
    let candidates = counters.candidate_acceptances
        + counters.candidate_ratio_rejections
        + counters.candidate_non_finite_rejections;
    assert_eq!(counters.joint_passes, 2);
    assert_eq!(counters.objective_requests, 2 + candidates);
    assert_eq!(
        counters.gradient_requests,
        2 + counters.candidate_acceptances
    );
    assert_eq!(
        counters.started_row_traversals,
        counters.preparation_passes
            + counters.joint_passes
            + counters.objective_only_passes
            + counters.gradient_only_passes
            + counters.completed_hvp_traversals
            + counters.completed_newton_traversals,
    );
    // Each started outer charges three assembly traversals and one factorization.
    assert_eq!(
        counters.completed_newton_traversals,
        3 * run.control.outer_iterations_started,
    );
    assert_eq!(
        counters.factorizations,
        run.control.outer_iterations_started
    );
    assert_eq!(counters.gram_assemblies, 1);
    assert!(counters.candidate_acceptances >= 1);
    assert!(!run.control.final_reserve);

    // Every receipt completed its inner solve; classified candidates carry their scalar facts,
    // and every priced Newton point carries its oracle residual.
    for receipt in &run.receipts {
        let outcome = &receipt.outcome;
        assert!(outcome.tag.is_some());
        assert_matches!(outcome.step_norm, Some(norm) if norm > 0.0);
        assert_matches!(outcome.predicted_reduction, Some(predicted) if predicted > 0.0);
        assert!(outcome.candidate.is_some());
        if outcome.tag != Some(NewtonTag::CauchyBoundary) {
            assert_matches!(outcome.newton_residual, Some(residual) if residual >= 0.0);
        }
    }

    // Strict convexity: every accepted step carries positive curvature, dot and normalized.
    let accepted_receipts = run
        .receipts
        .iter()
        .filter(|receipt| receipt.outcome.candidate == Some(CandidateOutcome::Accepted));
    let mut curvatures = 0_u64;
    for receipt in accepted_receipts {
        assert_matches!(
            receipt.outcome.curvature,
            Some(CurvatureDiagnostic::Value { along, normalized })
                if along > 0.0 && normalized > 0.0,
        );
        assert_matches!(receipt.outcome.ratio, Some(ratio) if ratio >= config.eta_accept.get());
        curvatures += 1;
    }
    assert_eq!(curvatures, counters.candidate_acceptances);
}

/// Equality with the certificate threshold certifies: the tie returns success.
#[test]
fn solve_certificate_tie_returns_at_equality() {
    let corpus = valid_corpus();
    let probe = run_solver(&corpus, solver_config());
    let initial_norm = probe
        .certificate
        .expect("the probe run derived a threshold")
        .initial_gradient_norm;

    let tie = run_solver(
        &corpus,
        SolverConfig {
            absolute_scaled_gradient_tolerance: DNonNegative::new(initial_norm)
                .expect("the fixture norm is finite and non-negative"),
            relative_scaled_gradient_tolerance: open_unit_fraction!(1.0e-12),
            ..solver_config()
        },
    );

    tie.outcome.expect("equality with the threshold certifies");
    assert_eq!(tie.control.outer_iterations_started, 0);
    assert!(tie.receipts.is_empty());
}

/// A certificate out of reach exhausts the outer budget with one receipt per started iteration.
#[test]
fn solve_fails_the_outer_iteration_budget() {
    let corpus = valid_corpus();
    let run = run_solver(
        &corpus,
        SolverConfig {
            maximum_outer_iterations: NonZeroU64::new(1).expect("one is nonzero"),
            absolute_scaled_gradient_tolerance: DNonNegative::ZERO,
            relative_scaled_gradient_tolerance: open_unit_fraction!(1.0e-12),
            ..solver_config()
        },
    );

    assert_matches!(run.outcome, Err(SolverFailure::OuterIterationBudget));
    assert_eq!(run.control.outer_iterations_started, 1);
    assert_eq!(run.receipts.len(), 1);
    assert!(run.control.final_reserve);
}

/// The inner Newton budgets fail where their work would exceed them, receipts already stored.
#[test]
fn solve_orders_the_inner_newton_budgets() {
    let corpus = valid_corpus();
    let strict = SolverConfig {
        absolute_scaled_gradient_tolerance: DNonNegative::ZERO,
        relative_scaled_gradient_tolerance: open_unit_fraction!(1.0e-12),
        ..solver_config()
    };

    // One priced product per interior outer: the second outer's pricing preflight finds the
    // budget consumed. The dying outer never finished its inner solve: no tag.
    let hvp_starved = run_solver(
        &corpus,
        SolverConfig {
            maximum_hvp_requests: NonZeroU64::new(1).expect("one is nonzero"),
            ..strict
        },
    );
    assert_matches!(hvp_starved.outcome, Err(SolverFailure::HvpBudget));
    assert_eq!(hvp_starved.control.counters.hvp_requests, 1);
    assert_eq!(hvp_starved.receipts.len(), 2);
    assert!(hvp_starved.receipts[0].outcome.tag.is_some());
    assert_eq!(hvp_starved.receipts[1].outcome.tag, None);

    // At the row floor of three, preparation plus initialization plus the reserve leave
    // nothing for the three assembly traversals: the inner solve refuses before any assembly.
    let row_starved = run_solver(
        &corpus,
        SolverConfig {
            maximum_row_traversals: 3,
            ..strict
        },
    );
    assert_matches!(row_starved.outcome, Err(SolverFailure::RowPassBudget));
    assert_eq!(row_starved.control.counters.hvp_requests, 0);
    assert_eq!(row_starved.control.counters.completed_newton_traversals, 0);
    assert_eq!(row_starved.control.counters.started_row_traversals, 2);

    // Enough rows for the assembly, none left for the pricing product: the preflight before
    // the oracle request refuses with the assembly already charged.
    let pricing_starved = run_solver(
        &corpus,
        SolverConfig {
            maximum_row_traversals: 6,
            ..strict
        },
    );
    assert_matches!(pricing_starved.outcome, Err(SolverFailure::RowPassBudget));
    assert_eq!(pricing_starved.control.counters.hvp_requests, 0);
    assert_eq!(
        pricing_starved.control.counters.completed_newton_traversals,
        3
    );
    assert_eq!(pricing_starved.control.counters.started_row_traversals, 5);
}

/// Candidate preflight prices the objective, then the gradient, then the rows - reserve intact.
#[test]
fn solve_preflight_prices_objective_then_gradient_then_rows() {
    let corpus = valid_corpus();
    let strict = SolverConfig {
        absolute_scaled_gradient_tolerance: DNonNegative::ZERO,
        relative_scaled_gradient_tolerance: open_unit_fraction!(1.0e-12),
        ..solver_config()
    };

    let objective_starved = run_solver(
        &corpus,
        SolverConfig {
            maximum_objective_requests: 2,
            ..strict
        },
    );
    assert_matches!(
        objective_starved.outcome,
        Err(SolverFailure::ObjectiveRequestBudget),
    );
    // Only the initialized joint evaluation ran: the final reserve stayed untouched.
    assert_eq!(objective_starved.control.counters.objective_requests, 1);
    assert!(objective_starved.control.final_reserve);

    let gradient_starved = run_solver(
        &corpus,
        SolverConfig {
            maximum_objective_requests: 3,
            maximum_gradient_requests: 2,
            ..strict
        },
    );
    assert_matches!(
        gradient_starved.outcome,
        Err(SolverFailure::GradientRequestBudget),
    );
    assert_eq!(gradient_starved.control.counters.objective_requests, 1);

    // The inner solve finishes on three assembly traversals and one priced product, and the
    // candidate preflight then finds a single unreserved traversal where the candidate needs
    // two.
    let row_starved = run_solver(
        &corpus,
        SolverConfig {
            maximum_row_traversals: 8,
            ..strict
        },
    );
    assert_matches!(row_starved.outcome, Err(SolverFailure::RowPassBudget));
    assert_eq!(row_starved.control.counters.hvp_requests, 1);
    // The preflight death happened after the inner solve, so the receipt records the tag and the
    // predicted reduction, and no candidate was ever classified.
    let last = row_starved.receipts.last().expect("one receipt exists");
    assert!(last.outcome.tag.is_some());
    assert!(last.outcome.predicted_reduction.is_some());
    assert_eq!(last.outcome.candidate, None);
}

/// A rejection at the minimum trust radius underflows.
///
/// The fixture's first full Newton step lands where curvature has risen against the model: its
/// measured ratio is `0.99048`, so an acceptance threshold of `0.995` rejects it
/// deterministically, and the rejection at the minimum radius reaches the terminal that no
/// budget precedes any more.
#[test]
fn solve_underflows_the_radius_on_a_rejection_at_the_minimum() {
    let corpus = valid_corpus();
    let strict = SolverConfig {
        radius_minimum: d_positive!(2.0),
        radius_initial: d_positive!(2.0),
        radius_maximum: d_positive!(1.0e4),
        eta_accept: open_unit_fraction!(0.995),
        eta_expand: open_unit_fraction!(0.999),
        absolute_scaled_gradient_tolerance: DNonNegative::ZERO,
        relative_scaled_gradient_tolerance: open_unit_fraction!(1.0e-12),
        ..solver_config()
    };

    // The rejection happens at the minimum radius, so the radius test fires.
    let radius_starved = run_solver(&corpus, strict);
    assert_matches!(radius_starved.outcome, Err(SolverFailure::RadiusUnderflow));
    assert_eq!(
        radius_starved.control.counters.candidate_ratio_rejections,
        1
    );
    assert_eq!(radius_starved.control.radius, 2.0);
    // The rejected outer carries its classification and ratio in the completion record.
    let rejections = radius_starved
        .receipts
        .iter()
        .filter(|receipt| receipt.outcome.candidate == Some(CandidateOutcome::RejectedByRatio));
    for receipt in rejections {
        assert_matches!(receipt.outcome.ratio, Some(ratio) if ratio < 0.995);
    }
}

/// A predicted reduction within the objective's resolution stalls the solve.
#[test]
fn solve_stalls_at_the_objective_resolution() {
    let corpus = valid_corpus();
    let run = run_solver(
        &corpus,
        SolverConfig {
            objective_resolution_ulps: NonZeroU32::new(u32::MAX).expect("nonzero"),
            absolute_scaled_gradient_tolerance: DNonNegative::ZERO,
            relative_scaled_gradient_tolerance: open_unit_fraction!(1.0e-12),
            ..solver_config()
        },
    );

    assert_matches!(run.outcome, Err(SolverFailure::ResolutionStall));
}

/// An expanded boundary step grows the radius by the expansion factor.
#[test]
fn solve_expands_the_radius_on_an_expanded_boundary_step() {
    let corpus = valid_corpus();
    let run = run_solver(
        &corpus,
        SolverConfig {
            radius_initial: d_positive!(1.0e-3),
            maximum_outer_iterations: NonZeroU64::new(1).expect("one is nonzero"),
            absolute_scaled_gradient_tolerance: DNonNegative::ZERO,
            relative_scaled_gradient_tolerance: open_unit_fraction!(1.0e-12),
            ..solver_config()
        },
    );

    // The `1e-3` radius forces a boundary step whose small-step ratio expands the radius once, the
    // certificate stays out of reach, and the outer budget then ends the run.
    assert_matches!(run.outcome, Err(SolverFailure::OuterIterationBudget));
    assert_eq!(run.control.counters.candidate_acceptances, 1);
    assert_eq!(run.control.radius, 2.0e-3);
    assert_eq!(run.receipts[0].radius, 1.0e-3);
    // The Newton point sits far outside that radius, so the crossing is a boundary tag.
    assert_matches!(
        run.receipts[0].outcome.tag,
        Some(NewtonTag::CauchyBoundary | NewtonTag::DoglegBoundary),
    );
}

/// A valid degenerate corpus drives the full machine into the typed non-finite Newton terminal.
///
/// Weights of `f64::MAX / 4` keep `S` and every preparation aggregate finite, and the initial
/// scaled gradient stays finite yet fails its relative certificate, so an inner solve must run.
/// The per-row factor scale `wᵢ/λ` then overflows against the subnormal regularization, the
/// weighted curvature block leaves the finite domain, and the machine reaches
/// `NonFiniteNewton { Weights }` with the curvature traversal already charged.
#[test]
fn solve_reaches_the_non_finite_newton_terminal_on_a_degenerate_scale() {
    let subnormal = f64::from_bits(1);
    let mut corpus = Corpus::new();
    for _ in 0..3 {
        corpus.push(&[1.0, 1.0], [0.5, 0.25, 0.25], f64::MAX / 4.0);
    }

    let run = run_solver(
        &corpus,
        SolverConfig {
            preparation: PreparationSettings {
                regularization: DPositive::new(subnormal).expect("the subnormal is positive"),
                curvature_relative_floor: d_positive!(1.0e-310),
                ..settings()
            },
            absolute_scaled_gradient_tolerance: DNonNegative::ZERO,
            ..solver_config()
        },
    );

    assert_matches!(
        run.outcome,
        Err(SolverFailure::NonFiniteNewton {
            stage: NewtonStage::Weights,
        }),
    );

    // The overflow fired after the curvature traversal and before any oracle product or
    // factorization. The receipt exists with an empty completion: the iteration died inside
    // its inner assembly.
    let counters = run.control.counters;
    assert_eq!(counters.hvp_requests, 0);
    assert_eq!(counters.completed_newton_traversals, 1);
    assert_eq!(counters.factorizations, 0);
    assert_eq!(counters.started_row_traversals, 3);
    assert_eq!(run.receipts.len(), 1);
    assert_eq!(run.receipts[0].outcome.tag, None);
}

/// A valid corpus with an overflowing admitted objective fails the final certification.
///
/// Zero embeddings and one-hot targets keep every prepared datum and the scaled gradient finite
/// (the class residuals cancel to rounding residue, well inside the absolute tolerance), but the
/// weights push the accumulated origin data loss past the finite range. Initialization admits
/// the infinite objective - the certificate tests only the gradient - and the reserved final
/// evaluation then fails `FinalCertificationNonFinite` by name.
#[test]
fn solve_fails_final_certification_on_a_non_finite_admitted_objective() {
    let mut corpus = Corpus::new();
    let weight = f64::MAX / 3.2;
    corpus.push(&[0.0, 0.0], [1.0, 0.0, 0.0], weight);
    corpus.push(&[0.0, 0.0], [0.0, 1.0, 0.0], weight);
    corpus.push(&[0.0, 0.0], [0.0, 0.0, 1.0], weight);

    let run = run_solver(
        &corpus,
        SolverConfig {
            preparation: PreparationSettings {
                regularization: DPositive::ONE,
                curvature_relative_floor: DPositive::ONE,
                ..settings()
            },
            absolute_scaled_gradient_tolerance: d_non_negative!(4.0),
            ..solver_config()
        },
    );

    assert_matches!(run.outcome, Err(SolverFailure::FinalCertificationNonFinite));

    // The admitted evidence is honest. The accepted objective is infinite and the gradient passes
    // inside the absolute tolerance. No outer iteration started, and the failed certification
    // consumed the reserve.
    assert!(run.accepted.objective.is_infinite());
    let evidence = run.certificate.expect("the threshold was derived");
    assert!(evidence.initial_gradient_norm <= evidence.gradient_threshold);
    assert_eq!(run.control.outer_iterations_started, 0);
    assert!(run.receipts.is_empty());
    assert!(!run.control.final_reserve);
    assert_eq!(run.control.counters.joint_passes, 2);
}

/// The exposed domain tag and dimension are the exact digest-preimage prefix; the coordinate
/// system rides only the exposed identity.
#[test]
#[expect(
    clippy::host_endian_bytes,
    reason = "the digest preimage is native in-memory bytes; the component walk proves the \
              preimage layout on every environment"
)]
fn receipt_domain_tag_and_dimension_are_the_exact_digest_prefix() {
    let corpus = uniform_corpus();
    let run = run_solver(&corpus, solver_config());
    let coordinates = run
        .coordinates
        .expect("a debugging request carries the coordinate identity");

    // The identity pins its literal v2 values, not merely shared-source agreement.
    assert_eq!(
        coordinates.domain_tag,
        "salt-policy-classifier-solver-flat-v2"
    );
    assert_eq!(
        coordinates.coordinate_system,
        "scaled-helmert-v1-contrast-major"
    );
    assert_eq!(coordinates.dimensions, SOLVER_DIMENSIONS as u64);

    // Re-derive a digest from the exposed tag and dimension; agreement proves every preimage
    // starts with exactly those bytes, followed by the components' native bytes in vector
    // order. The coordinate system does not enter the preimage.
    let vector = flat(&[(0, 1.5), (7, -0.25)]);
    let mut hasher = Sha256::new();
    hasher.update(coordinates.domain_tag.as_bytes());
    hasher.update(&coordinates.dimensions.to_ne_bytes());
    for component in vector.as_array() {
        hasher.update(&component.to_bits().to_ne_bytes());
    }
    assert_eq!(hasher.finalize(), vector_digest(&vector));
}

/// A `None` threshold maps onto the typed `GradientThresholdOverflow` failure.
#[test]
fn derive_certificate_maps_none_onto_threshold_overflow() {
    let config = solver_config();

    assert_eq!(
        derive_certificate(&config, f64::NAN),
        Err(SolverFailure::GradientThresholdOverflow),
    );
    assert_eq!(
        derive_certificate(&config, f64::INFINITY),
        Err(SolverFailure::GradientThresholdOverflow),
    );

    let evidence = derive_certificate(&config, 8.0).expect("a finite norm derives");
    assert_eq!(evidence.initial_gradient_norm, 8.0);
    assert_eq!(
        Some(evidence.gradient_threshold),
        config.gradient_threshold(8.0),
    );
}

/// The final certificate re-proves the threshold and rejects a mismatch or non-finite result.
#[test]
fn certify_reproves_the_certificate_freshly() {
    let corpus = valid_corpus();
    let config = solver_config();
    let mut counters = WorkCounters::default();
    let prepared = prepare(
        corpus.embeddings(),
        &corpus.rows,
        config.preparation,
        &mut counters,
    )
    .expect("the fixture corpus prepares");
    let gram = Gram::assemble(corpus.embeddings(), &mut counters);
    let problem = ScaledProblem {
        prepared,
        gram: GramView::full(&gram),
        config,
    };

    let origin = BoxedDVecN::<SOLVER_DIMENSIONS>::zero();
    let point = problem.point(&origin);
    let (objective, scaled_gradient) = problem
        .joint(&point, &mut counters)
        .expect("the origin request is finite");
    let norm = stable_l2(&scaled_gradient).expect("the origin gradient is finite");
    let accepted = AcceptedPoint {
        zeta: origin,
        objective,
        scaled_gradient,
    };

    // A threshold below the true norm fails the fresh certificate by name.
    let mut control = SolverControl {
        radius: 1.0,
        consecutive_rejections: 0,
        outer_iterations_started: 0,
        counters,
        final_reserve: true,
    };
    assert_matches!(
        certify(&problem, &accepted, &mut control, norm / 2.0),
        Err(SolverFailure::FinalCertificateMismatch),
    );
    assert!(!control.final_reserve);

    // A threshold at the true norm certifies, and the fresh evaluation reproduces the bytes.
    let mut passing = SolverControl {
        radius: 1.0,
        consecutive_rejections: 0,
        outer_iterations_started: 0,
        counters,
        final_reserve: true,
    };
    let converged = certify(&problem, &accepted, &mut passing, norm)
        .expect("the threshold at the norm certifies");
    assert_eq!(converged.point.objective, accepted.objective);

    // A point whose evaluation leaves the finite domain fails the certification by name.
    let far = flat(&[(0, 1.0e300)]);
    let runaway = AcceptedPoint {
        zeta: far,
        objective: 1.0,
        scaled_gradient: BoxedDVecN::zero(),
    };
    let mut non_finite = SolverControl {
        radius: 1.0,
        consecutive_rejections: 0,
        outer_iterations_started: 0,
        counters,
        final_reserve: true,
    };
    assert_matches!(
        certify(&problem, &runaway, &mut non_finite, norm),
        Err(SolverFailure::FinalCertificationNonFinite),
    );
}

/// Rejection clips the shrink to the minimum, permits one attempt there, then underflows.
#[test]
fn rejected_clips_to_the_minimum_then_underflows_with_one_clipped_attempt() {
    let config = SolverConfig {
        radius_minimum: d_positive!(0.5),
        shrink_factor: open_unit_fraction!(0.25),
        ..solver_config()
    };
    let mut control = SolverControl {
        radius: 1.0,
        consecutive_rejections: 0,
        outer_iterations_started: 0,
        counters: WorkCounters::default(),
        final_reserve: true,
    };

    // First rejection clips the shrink to the minimum and permits one later attempt there.
    rejected(&mut control, &config).expect("the first rejection shrinks");
    assert_eq!(control.radius, 0.5);
    assert_eq!(control.consecutive_rejections, 1);

    // The second rejected attempt already used the minimum: underflow.
    assert_matches!(
        rejected(&mut control, &config),
        Err(SolverFailure::RadiusUnderflow),
    );

    // The streak counter keeps counting, because it reports and never terminates.
    assert_eq!(control.consecutive_rejections, 2);
}

/// The `2×2` PSD factor reproduces its block on the numerical rank and zeroes dropped columns.
#[test]
fn factor_block_reproduces_psd_blocks_and_drops_rank() {
    // A full-rank SPD block factors exactly on exactly-representable entries.
    assert_eq!(factor_block(4.0, 2.0, 5.0), [2.0, 1.0, 2.0]);

    // In a rank-one block the trailing pivot cancels to zero and its column drops.
    assert_eq!(factor_block(1.0, 2.0, 4.0), [1.0, 2.0, 0.0]);

    // A non-positive leading entry zeroes the first column, and the trailing direction survives.
    assert_eq!(factor_block(0.0, 0.0, 9.0), [0.0, 0.0, 3.0]);
    assert_eq!(factor_block(-1.0e-17, 3.0, 9.0), [0.0, 0.0, 3.0]);

    // A block degenerate in both pivots factors to zero.
    assert_eq!(factor_block(0.0, 0.0, 0.0), [0.0, 0.0, 0.0]);
    assert_eq!(factor_block(0.0, 0.0, -1.0e-17), [0.0, 0.0, 0.0]);
}

/// Gram entries are the exact-product dots, symmetric, and a fold view reads the full matrix
/// bit for bit as a direct dot over the member embeddings.
#[test]
fn gram_views_read_the_assembled_dots_bit_for_bit() {
    let corpus = valid_corpus();
    let mut counters = WorkCounters::default();
    let gram = Gram::assemble(corpus.embeddings(), &mut counters);
    assert_eq!(counters.gram_assemblies, 1);
    assert_eq!(gram.order(), 3);

    let embeddings = corpus.embeddings();
    for i in 0..3 {
        for j in 0..3 {
            assert_eq!(
                gram.entry(i, j).to_bits(),
                embeddings[i].dot_accumulated(&embeddings[j]).to_bits(),
                "entry ({i}, {j}) is the exact-product dot",
            );
        }
    }

    let members = [0_usize, 2];
    let view = GramView::subset(&gram, &members);
    assert_eq!(view.order(), 2);
    for row in 0..2 {
        for column in 0..2 {
            assert_eq!(
                view.entry(row, column).to_bits(),
                embeddings[members[row]]
                    .dot_accumulated(&embeddings[members[column]])
                    .to_bits(),
                "the view entry ({row}, {column}) equals the member dot bit for bit",
            );
        }
    }
}

/// The curvature pass's intercept columns are the oracle's Hessian columns.
///
/// The pass accumulates `H[0|e_k]` through the moment identity `C = q − mmᵀ`; the oracle
/// evaluates the same columns through its shifted-probability path. Agreement at a generic
/// point ties the Newton assembly to the finite-difference-certified oracle at the block
/// level, with rounding as the only separation.
#[test]
fn curvature_pass_matches_the_oracle_intercept_columns() {
    let corpus = valid_corpus();
    let mut counters = WorkCounters::default();
    let prepared = prepare(corpus.embeddings(), &corpus.rows, settings(), &mut counters)
        .expect("the fixture corpus prepares");

    let point = solver_parameters();
    let evaluation = prepared
        .curvature_pass(&point, &mut counters)
        .expect("the fixture request is finite");
    assert_eq!(evaluation.blocks.len(), 3);
    assert_eq!(counters.completed_newton_traversals, 1);

    for (slot, column) in evaluation.intercept_columns.iter().enumerate() {
        let mut direction = ContrastVector::zero();
        direction.intercepts[slot] = 1.0;
        let product = prepared
            .hessian_vector(&point, &direction, &mut counters)
            .expect("the oracle request is finite");

        for (column_row, product_row) in column.coefficients.iter().zip(&product.coefficients) {
            for (left, right) in column_row.as_array().iter().zip(product_row.as_array()) {
                assert!(
                    (left - right).abs() <= 1.0e-13 * right.abs().max(1.0),
                    "column {slot} coefficient {left:e} tracks the oracle {right:e}",
                );
            }
        }
        for (left, right) in column.intercepts.iter().zip(product.intercepts) {
            assert!(
                (left - right).abs() <= 1.0e-13 * right.abs().max(1.0),
                "column {slot} intercept {left:e} tracks the oracle {right:e}",
            );
        }
    }
}

/// Prepares the corpus and drives one inner Newton solve at the origin under the validated
/// configuration, returning the outcome with the counters before and after the solve. The
/// control radius is the configuration's initial radius.
fn newton_at_origin(
    corpus: &Corpus,
    config: SolverConfig,
) -> (
    Result<NewtonOutcome, SolverFailure>,
    WorkCounters,
    WorkCounters,
) {
    config
        .validate()
        .expect("the witness configuration is valid");
    let mut counters = WorkCounters::default();
    let prepared = prepare(
        corpus.embeddings(),
        &corpus.rows,
        config.preparation,
        &mut counters,
    )
    .expect("the witness corpus prepares");
    let gram = Gram::assemble(corpus.embeddings(), &mut counters);
    let radius = config.radius_initial.get();
    let problem = ScaledProblem {
        prepared,
        gram: GramView::full(&gram),
        config,
    };
    let point = problem.point(&BoxedDVecN::zero());
    let (_objective, gradient) = problem
        .joint(&point, &mut counters)
        .expect("the origin joint request is finite");
    let baseline = counters;
    let mut control = SolverControl {
        radius,
        consecutive_rejections: 0,
        outer_iterations_started: 0,
        counters,
        final_reserve: true,
    };
    let outcome = newton_step(&problem, &point, &gradient, &mut control);
    (outcome, baseline, control.counters)
}

/// The interior Newton point inverts the oracle within its recorded residual.
///
/// The residual reads the step's Hessian product from the finite-difference-certified oracle, so
/// the residual proves the factorization against an implementation it shares no arithmetic with. At
/// the origin the scaled system is near-identity, so backward-stable factorization keeps the
/// relative residual within a few ulps, and the bound carries three orders of margin over that
/// derivation. Each solve charges three assembly traversals, one factorization, and one priced
/// product.
#[test]
fn newton_step_inverts_the_oracle_within_its_residual() {
    let corpus = valid_corpus();
    let config = SolverConfig {
        radius_initial: d_positive!(1.0e4),
        ..solver_config()
    };

    let (outcome, baseline, counters) = newton_at_origin(&corpus, config);
    let outcome = outcome.expect("the wide radius keeps the Newton point interior");
    assert_eq!(outcome.tag(), NewtonTag::NewtonInterior);
    assert!(!outcome.is_boundary());

    let residual = outcome.residual().expect("the interior point is priced");
    assert!(
        residual <= 1.0e-12,
        "the near-identity fixture keeps the oracle residual at rounding scale, got {residual:e}",
    );
    assert!(outcome.hessian_step().is_finite());

    assert_eq!(
        counters.completed_newton_traversals,
        baseline.completed_newton_traversals + 3,
    );
    assert_eq!(counters.factorizations, baseline.factorizations + 1);
    assert_eq!(counters.hvp_requests, baseline.hvp_requests + 1);
    assert_eq!(
        counters.started_row_traversals,
        baseline.started_row_traversals + 4,
    );

    // A second identical solve returns identical bytes, so the engine is deterministic.
    let (again, _, _) = newton_at_origin(&corpus, config);
    let again = again.expect("the identical solve succeeds identically");
    assert_eq!(outcome.step().as_array(), again.step().as_array());
    assert_eq!(
        outcome.hessian_step().as_array(),
        again.hessian_step().as_array(),
    );
}

/// A small trust radius exits the inner solve through the steepest-descent crossing.
///
/// At the origin the scaled gradient norm is about `1.4`, so both the Newton point and the Cauchy
/// point sit far outside a radius of `1e-4`. The crossing follows `−g` from the origin through the
/// validated boundary construction. It prices one oracle product for the Cauchy curvature and never
/// requests the Newton product.
#[test]
fn newton_step_crosses_the_steepest_boundary_on_a_small_radius() {
    let corpus = valid_corpus();
    let config = SolverConfig {
        radius_initial: d_positive!(1.0e-4),
        ..solver_config()
    };
    let radius = config.radius_initial.get();

    let (outcome, baseline, counters) = newton_at_origin(&corpus, config);
    let outcome = outcome.expect("the small-radius solve exits through the boundary");
    assert_eq!(outcome.tag(), NewtonTag::CauchyBoundary);
    assert!(outcome.is_boundary());
    assert_eq!(outcome.residual(), None);

    // One priced product served the Cauchy curvature, and the crossing used that product.
    assert_eq!(counters.hvp_requests, baseline.hvp_requests + 1);
    assert_eq!(
        counters.completed_newton_traversals,
        baseline.completed_newton_traversals + 3,
    );

    // The returned payload satisfies the gross-defect guard the construction applied.
    let step_norm = stable_l2(outcome.step()).expect("the boundary step is finite");
    assert!((step_norm / radius - 1.0).abs() <= GROSS_DEFECT_GUARD);
    assert!(outcome.hessian_step().is_finite());
}

/// A radius between the Cauchy and Newton lengths exits through the dogleg leg.
///
/// The witness derives its radius from the fixture's own measured geometry, taking the Newton
/// length from a wide-radius solve and the Cauchy length from the oracle's own products. The
/// crossing reaches the boundary within the gross-defect guard. It prices both oracle products and
/// reports the Newton residual.
#[test]
fn newton_step_crosses_the_dogleg_leg_between_cauchy_and_newton() {
    let corpus = valid_corpus();
    let wide = SolverConfig {
        radius_initial: d_positive!(1.0e4),
        ..solver_config()
    };

    let (outcome, _, _) = newton_at_origin(&corpus, wide);
    let newton_norm = stable_l2(
        outcome
            .expect("the wide radius keeps the Newton point interior")
            .step(),
    )
    .expect("the Newton step is finite");

    // The Cauchy length `(g·g / g·Hg)·‖g‖` from the oracle at the origin.
    let mut counters = WorkCounters::default();
    let prepared = prepare(
        corpus.embeddings(),
        &corpus.rows,
        wide.preparation,
        &mut counters,
    )
    .expect("the witness corpus prepares");
    let gram = Gram::assemble(corpus.embeddings(), &mut counters);
    let problem = ScaledProblem {
        prepared,
        gram: GramView::full(&gram),
        config: wide,
    };
    let point = problem.point(&BoxedDVecN::zero());
    let (_objective, gradient) = problem
        .joint(&point, &mut counters)
        .expect("the origin joint request is finite");
    let hessian_gradient = problem
        .hessian_vector(&point, &gradient, &mut counters)
        .expect("the origin product is finite");
    let gradient_square = checked_norm_squared(&gradient).expect("the gradient is finite");
    let curvature = checked_dot(&gradient, &hessian_gradient).expect("the curvature is finite");
    let gradient_norm = stable_l2(&gradient).expect("the gradient is finite");
    let cauchy_norm = gradient_square / curvature * gradient_norm;

    // The dogleg premise of the witness: the fixture's Cauchy point sits strictly inside the
    // Newton length.
    assert!(
        cauchy_norm < 0.9 * newton_norm,
        "the fixture separates the dogleg legs (cauchy {cauchy_norm:e}, newton {newton_norm:e})",
    );

    let radius = f64::midpoint(cauchy_norm, newton_norm);
    let between = SolverConfig {
        radius_initial: DPositive::new(radius).expect("the measured radius is positive"),
        radius_maximum: d_positive!(1.0e4),
        ..solver_config()
    };

    let (outcome, baseline, counters) = newton_at_origin(&corpus, between);
    let outcome = outcome.expect("the between radius exits through the dogleg leg");
    assert_eq!(outcome.tag(), NewtonTag::DoglegBoundary);
    assert!(outcome.is_boundary());
    assert_matches!(outcome.residual(), Some(residual) if residual <= 1.0e-12);

    // Both oracle products priced: the Cauchy curvature and the Newton product.
    assert_eq!(counters.hvp_requests, baseline.hvp_requests + 2);

    // The returned payload satisfies the gross-defect guard the construction applied.
    let step_norm = stable_l2(outcome.step()).expect("the boundary step is finite");
    assert!((step_norm / radius - 1.0).abs() <= GROSS_DEFECT_GUARD);
    assert!(outcome.hessian_step().is_finite());
}

/// Saturated rows drop their curvature columns and the solve proceeds on the survivors.
///
/// At a point whose leading coefficient drives two rows' logits to exact probability vertices,
/// those rows' curvature blocks collapse to rounding residue and their factor columns drop,
/// while the third row stays interior. The capacitance keeps its unit diagonal on the dropped
/// columns, and the Newton point still inverts the oracle.
#[test]
fn newton_step_survives_saturated_rows() {
    let corpus = valid_corpus();
    let config = SolverConfig {
        radius_initial: d_positive!(1.0e8),
        radius_maximum: d_positive!(1.0e8),
        ..solver_config()
    };
    config
        .validate()
        .expect("the witness configuration is valid");

    let mut counters = WorkCounters::default();
    let prepared = prepare(
        corpus.embeddings(),
        &corpus.rows,
        config.preparation,
        &mut counters,
    )
    .expect("the witness corpus prepares");
    let gram = Gram::assemble(corpus.embeddings(), &mut counters);
    let problem = ScaledProblem {
        prepared,
        gram: GramView::full(&gram),
        config,
    };

    // Rows 0 and 2 carry a nonzero leading coordinate, so their reference differences reach
    // `±O(10³)` and the shifted exponentials underflow to exact vertices. Row 1 stays interior.
    let mut point = ContrastVector::zero();
    point.coefficients[0].as_array_mut()[0] = 4000.0;
    let (_objective, gradient) = problem
        .joint(&point, &mut counters)
        .expect("the saturated point evaluates finitely");

    let mut control = SolverControl {
        radius: config.radius_initial.get(),
        consecutive_rejections: 0,
        outer_iterations_started: 0,
        counters,
        final_reserve: true,
    };
    let outcome = newton_step(&problem, &point, &gradient, &mut control)
        .expect("rank-dropped rows leave the capacitance solvable");
    assert_eq!(outcome.tag(), NewtonTag::NewtonInterior);
    assert_matches!(outcome.residual(), Some(residual) if residual <= 1.0e-9);
}

/// Same corpus, same configuration: two solves produce byte-identical receipts and iterates.
#[test]
fn solve_is_deterministic_run_to_run() {
    let corpus = valid_corpus();
    let first = run_solver(&corpus, solver_config());
    let second = run_solver(&corpus, solver_config());

    assert_eq!(first.receipts, second.receipts);
    assert_eq!(
        first.accepted.objective.to_bits(),
        second.accepted.objective.to_bits(),
    );
    let first_bits: Vec<u64> = first
        .accepted
        .zeta
        .as_array()
        .iter()
        .map(|value| value.to_bits())
        .collect();
    let second_bits: Vec<u64> = second
        .accepted
        .zeta
        .as_array()
        .iter()
        .map(|value| value.to_bits())
        .collect();
    assert_eq!(first_bits, second_bits);
}

/// The flat vector operations keep their declared componentwise shapes.
#[test]
fn flat_operations_keep_the_declared_shapes() {
    let base = flat(&[(0, 1.0), (1, -2.0)]);
    let along = flat(&[(0, 0.5), (2, 4.0)]);

    let advanced = flat_vectors::advance(&base, 2.0, &along);
    assert_eq!(advanced.as_array()[0], 2.0_f64.mul_add(0.5, 1.0));
    assert_eq!(advanced.as_array()[1], -2.0);
    assert_eq!(advanced.as_array()[2], 8.0);

    let negation = flat_vectors::negated(&base);
    assert_eq!(negation.as_array()[0], -1.0);
    assert_eq!(negation.as_array()[1], 2.0);

    assert!(base.is_finite());
    assert!(!flat(&[(3, f64::NAN)]).is_finite());
    assert!(!flat(&[(3, f64::INFINITY)]).is_finite());
}

/// The free budgets net out the outstanding final reserve and saturate at zero.
#[test]
fn free_budgets_net_the_final_reserve() {
    let config = SolverConfig {
        maximum_objective_requests: 5,
        maximum_gradient_requests: 4,
        maximum_row_traversals: 7,
        ..solver_config()
    };
    let counters = WorkCounters {
        objective_requests: 3,
        gradient_requests: 3,
        started_row_traversals: 7,
        ..WorkCounters::default()
    };

    let mut control = SolverControl {
        radius: 1.0,
        consecutive_rejections: 0,
        outer_iterations_started: 0,
        counters,
        final_reserve: true,
    };
    assert_eq!(control.free_objective_requests(&config), 1);
    assert_eq!(control.free_gradient_requests(&config), 0);
    assert_eq!(control.free_row_traversals(&config), 0);

    control.final_reserve = false;
    assert_eq!(control.free_objective_requests(&config), 2);
    assert_eq!(control.free_gradient_requests(&config), 1);
    assert_eq!(control.free_row_traversals(&config), 0);
}

/// The scaled Hessian-vector product is the sandwich `D⁻¹·Hθ[D⁻¹v]` in that order.
#[test]
fn scaled_problem_applies_the_hessian_sandwich_in_order() {
    let corpus = valid_corpus();
    let config = solver_config();
    let mut counters = WorkCounters::default();
    let prepared = prepare(
        corpus.embeddings(),
        &corpus.rows,
        config.preparation,
        &mut counters,
    )
    .expect("the fixture corpus prepares");

    let point = solver_parameters();
    let direction = flat(&[(0, 1.0), (AUGMENTED_DIMENSIONS, -0.5)]);

    let mut manual_counters = counters;
    let physical = ContrastVector::from_flat(&prepared.scaling.divide(&direction));
    let manual_product = prepared
        .hessian_vector(&point, &physical, &mut manual_counters)
        .expect("the fixture request is finite");
    let manual = prepared.scaling.divide(&manual_product.to_flat());

    let gram = Gram::assemble(corpus.embeddings(), &mut counters);
    let problem = ScaledProblem {
        prepared,
        gram: GramView::full(&gram),
        config,
    };
    let scaled = problem
        .hessian_vector(&point, &direction, &mut counters)
        .expect("the fixture request is finite");

    assert_eq!(scaled.as_array(), manual.as_array());
}
