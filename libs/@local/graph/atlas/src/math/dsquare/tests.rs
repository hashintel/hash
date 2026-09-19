#![expect(
    clippy::cast_precision_loss,
    reason = "test orders and integer patterns lie far below 2^53 and convert exactly"
)]
#![expect(
    clippy::integer_division_remainder_used,
    reason = "the fixture pattern folds indices into small integers through a modulus"
)]

use super::{DCholeskyError, DSquareMatrix};

/// Returns a deterministic integer pattern in [−5, 5].
///
/// # Panics
///
/// Panics if `row * 31 + column * 17 + 5` overflows when overflow checks are enabled.
fn pattern(row: usize, column: usize) -> f64 {
    ((row * 31 + column * 17 + 5) % 11) as f64 - 5.0
}

/// Computes an entry of the fixture A = `GᵀG` + order · I.
///
/// With G[k][i] given by [`pattern`], A[i][j] = Σₖ G[k][i] · G[k][j] + [i = j] · order. Products
/// have magnitude at most 25. For the small orders used here, 26 · order < 2⁵³ bounds every
/// intermediate integer, making the entry exact. For positive order, `GᵀG` is positive-semidefinite
/// and gives λₘᵢₙ ≥ order and λₘₐₓ ≤ trace(A).
///
/// # Panics
///
/// Panics on index arithmetic overflow in [`pattern`] when overflow checks are enabled.
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

/// Writes the fixture A = `GᵀG` + order · I into a matrix's lower triangle.
///
/// # Panics
///
/// Panics if [`DSquareMatrix::zeroed`] cannot represent the layout or [`fixture_entry`] overflows
/// its index arithmetic.
fn spd_fixture(order: usize) -> DSquareMatrix {
    let mut matrix = DSquareMatrix::zeroed(order);
    for row in 0..order {
        for column in 0..=row {
            matrix.row_mut(row)[column] = fixture_entry(order, row, column);
        }
    }

    matrix
}

/// Matrix orders covering minimal, padded-stride and whole-lane geometries.
///
/// Orders 7 and 33 require row padding. Order 8 occupies one full eight-lane group, while 33 has
/// four groups and a one-component tail. [`miri::block_height_invariance`] varies the block height
/// separately.
const ORDERS: [usize; 5] = [1, 2, 7, 8, 33];

#[test]
fn factor_times_its_transpose_recovers_the_lower_triangle() {
    for order in ORDERS {
        let factor = spd_fixture(order)
            .cholesky()
            .expect("the fixture is positive-definite");

        // Cholesky reconstruction error scales with reduction length and products of row norms. For
        // an exact factor, ‖Lᵢ‖² = A[i][i], making the largest diagonal a natural input scale. The
        // test allows 8 · (order + 1) · ε times that scale for factorization and reconstruction
        // rounding.
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

/// Checks the printed rows of an exactly factored 2 × 2 matrix.
///
/// A = [[4, 2], [2, 5]] factors as L = [[2, 0], [1, 2]]: √4, 2/2 and √(5 − 1) are all representable
/// integers. The [`Debug`](core::fmt::Debug) forms print the matrix's rows and the factor's lower
/// triangle.
#[test]
fn exact_factor_reports_its_order_and_debug_forms() {
    let mut matrix = DSquareMatrix::zeroed(2);
    matrix.row_mut(0).copy_from_slice(&[4.0, 2.0]);
    matrix.row_mut(1).copy_from_slice(&[2.0, 5.0]);
    assert_eq!(format!("{matrix:?}"), "[[4.0, 2.0], [2.0, 5.0]]");

    let factor = matrix.cholesky().expect("the matrix is positive definite");
    assert_eq!(factor.order, 2);
    assert_eq!(format!("{factor:?}"), "[[2.0], [1.0, 2.0]]");
}

#[test]
fn block_rows_for_production_order() {
    assert!(super::block_rows_for(super::stride_for(200)).get() < 200);
}

mod miri {
    use core::simd::f64x8;

    use super::{ORDERS, fixture_entry, pattern, spd_fixture};
    use crate::math::{
        DVecN,
        dsquare::{DSquareMatrix, DSquareRowBlock},
        nz,
        test_alloc::CountingAllocator,
    };

    #[test]
    fn the_solution_reproduces_the_right_hand_side() {
        for order in ORDERS {
            let factor = spd_fixture(order)
                .cholesky()
                .expect("the fixture is positive-definite");

            let mut solution: Vec<f64> = (0..order).map(|index| pattern(index, 3)).collect();
            factor.solve_in_place(&mut solution);

            // If (A + ΔA)·x̂ = b, then |A·x̂ − b|ᵢ ≤ Σⱼ |ΔA[i][j]| · |x̂ⱼ|. The test uses 8 · order ·
            // ε · max diagonal as its entrywise error allowance and multiplies by Σⱼ |x̂ⱼ|. This
            // scales the residual tolerance with both input magnitude and the computed solution.
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

    /// Compares selected block heights against a single-block factorization.
    ///
    /// The derived height at order 13 uses one block. Heights 1, 2, 3, 5 and 8 require panel
    /// updates across block boundaries while retaining the arithmetic order within each entry.
    #[test]
    fn block_height_invariance() {
        const ORDER: usize = 13;

        let reference = spd_fixture(ORDER)
            .cholesky()
            .expect("the fixture is positive-definite");

        for height in [nz!(1), nz!(2), nz!(3), nz!(5), nz!(8)] {
            let factor = spd_fixture(ORDER)
                .cholesky_blocked(height)
                .expect("the fixture is positive-definite");

            for (index, (blocked, derived)) in factor
                .components()
                .iter()
                .zip(reference.components())
                .enumerate()
            {
                assert_eq!(
                    blocked.to_bits(),
                    derived.to_bits(),
                    "height {height} moved component {index}",
                );
            }
        }
    }

    #[test]
    fn both_dots_reduce_equal_inputs_to_identical_bits() {
        // the shifted copy supplies a slice without the matrix row's alignment guarantee. Prefix
        // lengths cover the empty, partial-lane and whole-lane paths.
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
        // length 29 makes three eight-lane groups and a five-component tail. The interleaved fold
        // updates accumulator zero twice and accumulator one once.
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

        assert_eq!(
            left.dot(aligned).to_bits(),
            first.dot(&second).into_raw().to_bits()
        );
    }

    #[test]
    fn the_zero_matrix_reads_zero_everywhere() {
        let matrix = DSquareMatrix::zeroed(3);

        assert_eq!(matrix.order, 3);
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
    #[allow(
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

        assert_eq!(factor.order, 0);
        factor.solve_in_place(&mut []);
    }

    #[test]
    fn matrix_drop_returns_the_buffer_to_its_allocator() {
        let alloc = CountingAllocator::new();

        let matrix = DSquareMatrix::zeroed_in(2, &alloc);
        assert_eq!(alloc.deallocations(), 0);

        drop(matrix);
        assert_eq!(alloc.deallocations(), 1);
    }

    #[test]
    fn factor_drop_returns_the_moved_buffer_to_its_allocator() {
        let alloc = CountingAllocator::new();

        let mut matrix = DSquareMatrix::zeroed_in(2, &alloc);
        matrix.row_mut(0).copy_from_slice(&[4.0, 2.0]);
        matrix.row_mut(1).copy_from_slice(&[2.0, 5.0]);

        let factor = matrix.cholesky().expect("the matrix is positive definite");
        assert_eq!(alloc.deallocations(), 0);

        drop(factor);
        assert_eq!(alloc.deallocations(), 1);
    }
}
