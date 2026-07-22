use core::simd::f32x8;

use super::MatrixN;

#[test]
fn a_zeroed_matrix_reads_zero_everywhere() {
    let matrix = MatrixN::<8>::zeroed(3);

    assert_eq!(matrix.len(), 3);
    assert!(!matrix.is_empty());
    assert_eq!(matrix.as_components(), &[0.0; 24]);
    assert_eq!(matrix.rows().len(), 3);
}

#[test]
fn every_row_is_aligned_for_simd() {
    let matrix = MatrixN::<40>::zeroed(5);

    for row in matrix.rows() {
        assert!(
            core::ptr::from_ref(row)
                .cast::<f32>()
                .is_aligned_to(align_of::<f32x8>()),
            "a row missed the alignment invariant",
        );
        let (_, remainder) = row.lanes();
        assert!(remainder.is_empty(), "a 40-wide row is whole lanes");
    }
}

#[test]
#[expect(
    clippy::float_cmp,
    reason = "the values are stored literals, not computed results"
)]
fn writes_through_rows_land_at_the_row_major_offsets() {
    let mut matrix = MatrixN::<8>::zeroed(3);

    matrix.rows_mut()[1].as_array_mut()[0] = 1.0;
    matrix.rows_mut()[2].as_array_mut()[7] = 2.0;

    assert_eq!(matrix.as_components()[8], 1.0);
    assert_eq!(matrix.as_components()[23], 2.0);
    assert_eq!(matrix.rows()[0].as_array(), &[0.0; 8]);
}

#[test]
#[expect(
    clippy::float_cmp,
    reason = "the values are stored literals, not computed results"
)]
fn a_clone_is_equal_and_independent() {
    let mut matrix = MatrixN::<8>::zeroed(2);
    matrix.rows_mut()[0].as_array_mut()[3] = 4.0;

    let clone = matrix.clone();
    assert_eq!(clone, matrix);

    matrix.rows_mut()[0].as_array_mut()[3] = 5.0;
    assert_ne!(clone, matrix);
    assert_eq!(clone.as_components()[3], 4.0);
}

#[test]
fn the_empty_matrix_is_well_formed() {
    let matrix = MatrixN::<8>::zeroed(0);

    assert!(matrix.is_empty());
    assert!(matrix.rows().is_empty());
    assert!(matrix.as_components().is_empty());
    assert_eq!(matrix, matrix.clone());
}
