#![expect(
    clippy::cast_precision_loss,
    reason = "test orders and integer patterns lie far below 2^53 and convert exactly"
)]
#![expect(
    clippy::integer_division_remainder_used,
    reason = "the fixture pattern folds indices into small integers through a modulus"
)]

use core::simd::f64x8;

use super::{DCholeskyError, DSquareMatrix, DSquareRowBlock};
use crate::math::DVecN;

/// A deterministic integer pattern in `[−5, 5]`.
fn pattern(row: usize, column: usize) -> f64 {
    ((row * 31 + column * 17 + 5) % 11) as f64 - 5.0
}

/// The exact entry `A[i][j] = Σ_k G[k][i]·G[k][j] + [i = j]·order` of `A = GᵀG + order·I`.
///
/// Every term is a small integer, so the sums stay far below 2⁵³ and the fixture is exactly
/// reproducible. `GᵀG` is positive-semidefinite, so `λ_min ≥ order` and `λ_max ≤ trace(A)`.
fn fixture_entry(order: usize, row: usize, column: usize) -> f64 {
    let products: f64 = (0..order)
        .map(|index| pattern(index, row) * pattern(index, column))
        .sum();

    if row == column {
        products + order as f64
    } else {
        products
    }
}

/// The fixture `A = GᵀG + order·I`, written into the lower triangle only.
fn spd_fixture(order: usize) -> DSquareMatrix {
    let mut matrix = DSquareMatrix::zeroed(order);
    for row in 0..order {
        for column in 0..=row {
            matrix.row_mut(row)[column] = fixture_entry(order, row, column);
        }
    }

    matrix
}

/// The orders the certificates cover: 1, 2, a padded stride (7), whole lanes (8), four lanes with a
/// tail (33), and one past the derived block height (200).
const ORDERS: [usize; 6] = [1, 2, 7, 8, 33, 200];

#[test]
fn the_largest_certificate_order_crosses_a_block_boundary() {
    // Keeps the panel pass certified: were the working-set budget ever raised past order 200's
    // whole triangle, the roundtrip certificates would stop exercising it without any test failing.
    assert!(super::block_rows_for(200) < 200);
}

#[test]
fn factor_times_its_transpose_recovers_the_lower_triangle() {
    for order in ORDERS {
        let factor = spd_fixture(order)
            .cholesky()
            .expect("the fixture is positive-definite");

        // In IEEE arithmetic the factor satisfies A − L·Lᵀ = ΔA with
        // |ΔA[i][j]| ≤ c·(order + 1)·ε·‖Lᵢ‖·‖Lⱼ‖, and ‖Lᵢ‖² = A[i][i], so the largest diagonal
        // entry bounds every ‖Lᵢ‖·‖Lⱼ‖. Margin 8 absorbs the constant c.
        let max_diagonal = (0..order)
            .map(|index| fixture_entry(order, index, index))
            .fold(0.0_f64, f64::max);
        let tolerance = 8.0 * (order as f64 + 1.0) * f64::EPSILON * max_diagonal;

        for row in 0..order {
            for column in 0..=row {
                let product: f64 = (0..=column)
                    .map(|component| factor.row(row)[component] * factor.row(column)[component])
                    .sum();
                let expected = fixture_entry(order, row, column);
                assert!(
                    (product - expected).abs() <= tolerance,
                    "entry ({row}, {column}) of order {order}: |{product} − {expected}| > \
                     {tolerance}",
                );
            }
        }
    }
}

#[test]
fn the_solution_reproduces_the_right_hand_side() {
    for order in ORDERS {
        let factor = spd_fixture(order)
            .cholesky()
            .expect("the fixture is positive-definite");

        let mut solution: Vec<f64> = (0..order).map(|index| pattern(index, 3)).collect();
        factor.solve_in_place(&mut solution);

        // Factor-and-substitute is backward stable: (A + ΔA)·x̂ = b with
        // |ΔA[i][j]| ≤ c·order·ε·(max diagonal), so each residual component obeys
        // |A·x̂ − b|ᵢ ≤ c·order·ε·(max diagonal)·Σⱼ|x̂ⱼ|. The residual recomputation below rounds
        // at the same order. Margin 8 absorbs both constants.
        let max_diagonal = (0..order)
            .map(|index| fixture_entry(order, index, index))
            .fold(0.0_f64, f64::max);
        let magnitude_sum: f64 = solution.iter().map(|component| component.abs()).sum();
        let tolerance = 8.0 * order as f64 * f64::EPSILON * max_diagonal * magnitude_sum;

        for row in 0..order {
            let recovered: f64 = (0..order)
                .map(|column| fixture_entry(order, row, column) * solution[column])
                .sum();
            let expected = pattern(row, 3);
            assert!(
                (recovered - expected).abs() <= tolerance,
                "component {row} of order {order}: |{recovered} − {expected}| > {tolerance}",
            );
        }
    }
}

#[test]
fn a_negative_pivot_reports_its_index_and_value() {
    // Pivot 1 is A[1][1] − L[1][0]² = −9 − 0² exactly.
    let mut matrix = DSquareMatrix::zeroed(2);
    matrix.row_mut(0)[0] = 4.0;
    matrix.row_mut(1)[1] = -9.0;

    assert_eq!(
        matrix
            .cholesky()
            .expect_err("a negative pivot must be rejected"),
        DCholeskyError::NonPositivePivot {
            index: 1,
            value: -9.0
        },
    );
}

#[test]
fn an_indefinite_matrix_passes_early_pivots_and_fails_later() {
    // Lower triangle [[4], [2, 5], [2, 1, 0.5]]: L₀₀ = 2, L₁₀ = 1, L₁₁ = √(5 − 1) = 2, L₂₀ = 1,
    // L₂₁ = (1 − 1·1)/2 = 0, and pivot 2 is 0.5 − (1² + 0²) = −0.5 exactly.
    let mut matrix = DSquareMatrix::zeroed(3);
    matrix.row_mut(0)[0] = 4.0;
    matrix.row_mut(1)[0] = 2.0;
    matrix.row_mut(1)[1] = 5.0;
    matrix.row_mut(2)[0] = 2.0;
    matrix.row_mut(2)[1] = 1.0;
    matrix.row_mut(2)[2] = 0.5;

    assert_eq!(
        matrix
            .cholesky()
            .expect_err("an indefinite matrix must be rejected"),
        DCholeskyError::NonPositivePivot {
            index: 2,
            value: -0.5
        },
    );
}

#[test]
fn a_nan_below_the_diagonal_poisons_that_row_pivot() {
    let mut matrix = spd_fixture(3);
    matrix.row_mut(2)[0] = f64::NAN;

    // Pivots 0 and 1 never read row 2. The NaN propagates through L[2][0] into pivot 2.
    assert_eq!(
        matrix
            .cholesky()
            .expect_err("a NaN in the lower triangle must be rejected"),
        DCholeskyError::NonFinitePivot { index: 2 },
    );
}

#[test]
fn a_nan_on_the_diagonal_poisons_its_own_pivot() {
    let mut matrix = spd_fixture(3);
    matrix.row_mut(1)[1] = f64::NAN;

    assert_eq!(
        matrix.cholesky().expect_err("a NaN pivot must be rejected"),
        DCholeskyError::NonFinitePivot { index: 1 },
    );
}

#[test]
fn factoring_identical_bytes_yields_identical_bytes() {
    let first = spd_fixture(33)
        .cholesky()
        .expect("the fixture is positive-definite");
    let second = spd_fixture(33)
        .cholesky()
        .expect("the fixture is positive-definite");

    for (left, right) in first.components().iter().zip(second.components()) {
        assert_eq!(left.to_bits(), right.to_bits());
    }
}

#[test]
fn both_dots_reduce_equal_inputs_to_identical_bits() {
    // The operands come from two aligned matrix rows; the shifted copy hands the plain-slice dot a
    // start the lane loads cannot assume. Lengths sweep zero, mid-lane tails, and whole lanes.
    const ORDER: usize = 40;
    let mut storage = DSquareMatrix::zeroed(ORDER);
    for column in 0..ORDER {
        storage.row_mut(0)[column] = pattern(3, column);
        storage.row_mut(1)[column] = pattern(7, column);
    }

    let mut shifted = [0.0; ORDER + 1];
    shifted[1..].copy_from_slice(storage.row(1));

    for length in 0..=ORDER {
        let left = DSquareRowBlock::from_slice(&storage.row(0)[..length]);
        let aligned = DSquareRowBlock::from_slice(&storage.row(1)[..length]);

        let through_views = left.dot(aligned).to_bits();
        assert_eq!(
            through_views,
            left.dot_vector(&storage.row(1)[..length]).to_bits(),
            "the dots disagreed at length {length}",
        );
        assert_eq!(
            through_views,
            left.dot_vector(&shifted[1..=length]).to_bits(),
            "the shifted start changed the bits at length {length}",
        );
    }
}

#[test]
fn the_row_dot_and_dvecn_dot_reduce_equal_bytes_to_identical_bits() {
    // The module doc ties the prefix dots to the fold shape of `DVecN::dot`; the test above and
    // dvecn's aligned-reduction test guard each family internally, and this pins the families to
    // each other. Length 29 makes three eight-lane folds - the interleave visits both
    // accumulators, unevenly - and a five-component scalar tail.
    const LENGTH: usize = 29;
    let mut storage = DSquareMatrix::zeroed(LENGTH);
    for column in 0..LENGTH {
        storage.row_mut(0)[column] = pattern(3, column);
        storage.row_mut(1)[column] = pattern(7, column);
    }

    let first = DVecN::new(core::array::from_fn::<f64, LENGTH, _>(|column| {
        pattern(3, column)
    }));
    let second = DVecN::new(core::array::from_fn(|column| pattern(7, column)));

    let left = DSquareRowBlock::from_slice(&storage.row(0)[..LENGTH]);
    let aligned = DSquareRowBlock::from_slice(&storage.row(1)[..LENGTH]);

    assert_eq!(left.dot(aligned).to_bits(), first.dot(&second).to_bits());
}

#[test]
fn factoring_never_writes_the_padding() {
    // Orders 7 and 33 pad their strides to 8 and 40: one and seven trailing components per row.
    for order in [7, 33] {
        let factor = spd_fixture(order)
            .cholesky()
            .expect("the fixture is positive-definite");

        let stride = factor.stride();
        for row in 0..order {
            let padding = &factor.components()[row * stride + order..(row + 1) * stride];
            assert!(
                padding.iter().all(|component| component.to_bits() == 0),
                "row {row} of order {order} smeared into its padding",
            );
        }
    }
}

#[test]
fn the_strict_upper_triangle_never_reaches_the_factor() {
    let clean = spd_fixture(33);
    let mut poisoned = spd_fixture(33);
    for row in 0..33 {
        for column in row + 1..33 {
            poisoned.row_mut(row)[column] = f64::NAN;
        }
    }

    let clean = clean.cholesky().expect("the fixture is positive-definite");
    let poisoned = poisoned
        .cholesky()
        .expect("the strict upper triangle is ignored by contract");

    for (left, right) in clean.components().iter().zip(poisoned.components()) {
        assert_eq!(left.to_bits(), right.to_bits());
    }
}

#[test]
fn the_zero_matrix_reads_zero_everywhere() {
    let matrix = DSquareMatrix::zeroed(3);

    assert_eq!(matrix.order(), 3);
    for row in 0..3 {
        assert_eq!(matrix.row(row).len(), 3);
        assert!(
            matrix
                .row(row)
                .iter()
                .all(|component| component.to_bits() == 0)
        );
    }
}

#[test]
fn every_row_is_aligned_for_simd() {
    let matrix = DSquareMatrix::zeroed(7);

    for row in 0..7 {
        assert!(
            matrix.row(row).as_ptr().is_aligned_to(align_of::<f64x8>()),
            "row {row} missed the alignment invariant",
        );
    }
}

#[test]
#[expect(
    clippy::float_cmp,
    reason = "the values are stored literals, not computed results"
)]
fn writes_through_rows_land_at_their_offsets() {
    let mut matrix = DSquareMatrix::zeroed(3);
    matrix.row_mut(1)[0] = 1.0;
    matrix.row_mut(2)[2] = 2.0;

    assert_eq!(matrix.row(1)[0], 1.0);
    assert_eq!(matrix.row(2)[2], 2.0);
    assert_eq!(matrix.row(0), &[0.0; 3]);
}

#[test]
#[should_panic(expected = "row index 3 is out of bounds for order 3")]
fn a_row_past_the_order_panics() {
    let matrix = DSquareMatrix::zeroed(3);
    let _: &[f64] = matrix.row(3);
}

#[test]
#[should_panic(expected = "the right-hand side's length must equal the factor's order")]
fn a_mismatched_right_hand_side_panics() {
    let factor = spd_fixture(2)
        .cholesky()
        .expect("the fixture is positive-definite");

    let mut vector = [1.0; 3];
    factor.solve_in_place(&mut vector);
}

#[test]
fn the_empty_matrix_factors_and_solves() {
    let factor = DSquareMatrix::zeroed(0)
        .cholesky()
        .expect("no pivots exist to fail");

    assert_eq!(factor.order(), 0);
    factor.solve_in_place(&mut []);
}
