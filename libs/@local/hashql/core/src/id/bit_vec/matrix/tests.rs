use super::{BitMatrix, RowRef, SparseBitMatrix};
use crate::id::{Id as _, bit_vec::DenseBitSet, newtype};

newtype!(
    #[id(crate = crate)]
    struct TestId(u32 is 0..=u32::MAX)
);

fn id(index: usize) -> TestId {
    TestId::from_usize(index)
}

fn row_cols(iter: impl Iterator<Item = TestId>) -> Vec<usize> {
    iter.map(TestId::as_usize).collect()
}

// =============================================================================
// Dense BitMatrix
// =============================================================================

mod dense {
    use super::*;

    // =========================================================================
    // Construction
    // =========================================================================

    #[test]
    fn new_empty() {
        let matrix: BitMatrix<TestId, TestId> = BitMatrix::new(10, 20);
        assert_eq!(matrix.row_domain_size(), 10);
        assert_eq!(matrix.col_domain_size(), 20);
        for row in matrix.rows() {
            assert!(matrix.is_empty_row(row));
        }
    }

    #[test]
    fn from_row_n() {
        let mut row = DenseBitSet::new_empty(100);
        row.insert(id(5));
        row.insert(id(50));
        row.insert(id(99));

        let matrix: BitMatrix<TestId, TestId> = BitMatrix::from_row_n(&row, 4);
        for row in matrix.rows() {
            assert!(matrix.contains(row, id(5)));
            assert!(matrix.contains(row, id(50)));
            assert!(matrix.contains(row, id(99)));
            assert_eq!(matrix.count_row(row), 3);
        }
    }

    #[test]
    fn from_row_n_zero() {
        let row = DenseBitSet::new_empty(100);
        let matrix: BitMatrix<TestId, TestId> = BitMatrix::from_row_n(&row, 0);
        assert_eq!(matrix.row_domain_size(), 0);
        assert_eq!(matrix.col_domain_size(), 100);
        assert_eq!(matrix.rows().count(), 0);
    }

    #[test]
    fn from_row_n_independence() {
        let mut row = DenseBitSet::new_empty(100);
        row.insert(id(10));
        row.insert(id(20));

        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::from_row_n(&row, 2);
        matrix.remove(id(0), id(10));

        assert!(!matrix.contains(id(0), id(10)));
        assert!(matrix.contains(id(1), id(10)));
    }

    #[test]
    fn zero_size_matrices() {
        let zero_rows: BitMatrix<TestId, TestId> = BitMatrix::new(0, 100);
        assert_eq!(zero_rows.row_domain_size(), 0);
        assert_eq!(zero_rows.col_domain_size(), 100);
        assert_eq!(zero_rows.rows().count(), 0);

        let zero_cols: BitMatrix<TestId, TestId> = BitMatrix::new(10, 0);
        assert_eq!(zero_cols.row_domain_size(), 10);
        assert_eq!(zero_cols.col_domain_size(), 0);
        assert!(zero_cols.is_empty_row(id(0)));
        assert_eq!(zero_cols.count_row(id(0)), 0);
        assert_eq!(zero_cols.iter_row(id(0)).count(), 0);

        let zero_both: BitMatrix<TestId, TestId> = BitMatrix::new(0, 0);
        assert_eq!(zero_both.rows().count(), 0);
    }

    // =========================================================================
    // Element operations
    // =========================================================================

    #[test]
    fn insert_remove_contains() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(200, 200);
        let row = id(10);
        let col = id(150);

        assert!(!matrix.contains(row, col));
        assert!(matrix.insert(row, col));
        assert!(matrix.contains(row, col));
        assert!(!matrix.insert(row, col));

        assert!(matrix.remove(row, col));
        assert!(!matrix.contains(row, col));
        assert!(!matrix.remove(row, col));
    }

    // =========================================================================
    // RowRef / RowMut view types
    // =========================================================================

    #[test]
    fn row_ref_iteration_across_boundaries() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(2, 200);
        for &col in &[0, 63, 64, 127, 128, 199] {
            matrix.insert(id(0), id(col));
        }

        let row = matrix.row(id(0));
        assert!(row.contains(id(0)));
        assert!(row.contains(id(63)));
        assert!(row.contains(id(64)));
        assert!(row.contains(id(127)));
        assert!(row.contains(id(128)));
        assert!(row.contains(id(199)));
        assert!(!row.contains(id(1)));
        assert!(!row.contains(id(62)));
        assert!(!row.contains(id(65)));
        assert_eq!(row.count(), 6);
        assert!(!row.is_empty());

        assert_eq!(row_cols(row.iter()), [0, 63, 64, 127, 128, 199]);
    }

    #[test]
    fn row_ref_superset() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
        matrix.insert(id(0), id(10));
        matrix.insert(id(0), id(20));
        matrix.insert(id(0), id(30));

        matrix.insert(id(1), id(10));
        matrix.insert(id(1), id(20));

        let row0 = matrix.row(id(0));
        let row1 = matrix.row(id(1));
        assert!(row0.superset(&row1));
        assert!(!row1.superset(&row0));
    }

    #[test]
    fn row_ref_superset_dense() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
        matrix.insert(id(0), id(10));
        matrix.insert(id(0), id(20));
        matrix.insert(id(0), id(30));

        let mut subset = DenseBitSet::new_empty(100);
        subset.insert(id(10));
        subset.insert(id(20));

        let mut not_subset = DenseBitSet::new_empty(100);
        not_subset.insert(id(10));
        not_subset.insert(id(99));

        let row = matrix.row(id(0));
        assert!(row.superset_dense(&subset));
        assert!(!row.superset_dense(&not_subset));
    }

    #[test]
    fn row_mut_bitwise_ops() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
        matrix.insert(id(0), id(10));
        matrix.insert(id(0), id(20));

        matrix.insert(id(1), id(20));
        matrix.insert(id(1), id(30));

        let src = matrix.row(id(1));
        let cols_src: Vec<usize> = row_cols(src.iter());
        assert_eq!(cols_src, [20, 30]);

        assert!(matrix.union_rows(id(1), id(0)));
        assert_eq!(row_cols(matrix.iter_row(id(0))), [10, 20, 30]);
    }

    #[test]
    fn row_mut_union_with_dense() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
        let mut dense = DenseBitSet::new_empty(100);
        dense.insert(id(50));
        dense.insert(id(99));

        let mut row = matrix.row_mut(id(0));
        assert!(row.union_dense(&dense));
        assert!(row.contains(id(50)));
        assert!(row.contains(id(99)));
        assert!(!row.union_dense(&dense));
    }

    #[test]
    fn insert_all_various_sizes() {
        for &cols in &[0, 1, 63, 64, 65, 127, 128, 129] {
            let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(2, cols);
            matrix.insert_all_into_row(id(0));
            assert_eq!(matrix.count_row(id(0)), cols);
            assert_eq!(matrix.count_row(id(1)), 0);

            let mut row = matrix.row_mut(id(0));
            row.clear();
            assert!(row.is_empty());
        }
    }

    // =========================================================================
    // Row-to-row operations
    // =========================================================================

    #[test]
    fn union_rows() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(64, 100);
        matrix.insert(id(0), id(10));
        matrix.insert(id(0), id(20));
        matrix.insert(id(1), id(30));

        assert!(matrix.union_rows(id(0), id(1)));
        assert!(matrix.contains(id(1), id(10)));
        assert!(matrix.contains(id(1), id(20)));
        assert!(matrix.contains(id(1), id(30)));
        assert!(!matrix.union_rows(id(0), id(1)));
    }

    #[test]
    fn subtract_rows() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(10, 100);
        matrix.insert(id(0), id(20));
        matrix.insert(id(1), id(10));
        matrix.insert(id(1), id(20));
        matrix.insert(id(1), id(30));

        assert!(matrix.subtract_rows(id(0), id(1)));
        assert!(matrix.contains(id(1), id(10)));
        assert!(!matrix.contains(id(1), id(20)));
        assert!(matrix.contains(id(1), id(30)));
    }

    #[test]
    fn intersect_rows_mut() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(10, 100);
        matrix.insert(id(0), id(10));
        matrix.insert(id(0), id(20));
        matrix.insert(id(1), id(20));
        matrix.insert(id(1), id(30));

        assert!(matrix.intersect_rows_mut(id(0), id(1)));
        assert!(!matrix.contains(id(1), id(10)));
        assert!(matrix.contains(id(1), id(20)));
        assert!(!matrix.contains(id(1), id(30)));
    }

    #[test]
    fn intersect_rows_collect() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(10, 200);
        matrix.insert(id(0), id(10));
        matrix.insert(id(0), id(20));
        matrix.insert(id(0), id(150));
        matrix.insert(id(1), id(20));
        matrix.insert(id(1), id(30));
        matrix.insert(id(1), id(150));

        let intersection = matrix.intersect_rows(id(0), id(1));
        let values: Vec<usize> = intersection.iter().map(|item| item.as_usize()).collect();
        assert_eq!(values, [20, 150]);
    }

    #[test]
    fn bitwise_rows_self() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
        matrix.insert(id(0), id(10));
        matrix.insert(id(0), id(20));

        assert!(!matrix.union_rows(id(0), id(0)));
        assert_eq!(matrix.count_row(id(0)), 2);

        assert!(matrix.subtract_rows(id(0), id(0)));
        assert!(matrix.is_empty_row(id(0)));

        matrix.insert(id(1), id(10));
        matrix.insert(id(1), id(20));

        assert!(!matrix.intersect_rows_mut(id(1), id(1)));
        assert_eq!(matrix.count_row(id(1)), 2);
    }

    // =========================================================================
    // Clear
    // =========================================================================

    #[test]
    fn clear_all() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(10, 100);
        for row in 0..10 {
            for col in (0..100).step_by(7) {
                matrix.insert(id(row), id(col));
            }
        }
        matrix.clear();
        for row in 0..10 {
            assert!(matrix.is_empty_row(id(row)));
            assert_eq!(matrix.count_row(id(row)), 0);
        }
    }

    #[test]
    fn clear_then_reuse() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
        matrix.insert(id(0), id(50));
        matrix.clear();
        assert!(matrix.insert(id(0), id(50)));
        assert!(matrix.contains(id(0), id(50)));
    }

    // =========================================================================
    // Transitive closure
    // =========================================================================

    #[test]
    fn transitive_closure_chain() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(4, 4);
        matrix.insert(id(0), id(1));
        matrix.insert(id(1), id(2));
        matrix.insert(id(2), id(3));

        matrix.transitive_closure();

        assert!(matrix.contains(id(0), id(1)));
        assert!(matrix.contains(id(0), id(2)));
        assert!(matrix.contains(id(0), id(3)));
        assert!(matrix.contains(id(1), id(2)));
        assert!(matrix.contains(id(1), id(3)));
        assert!(matrix.contains(id(2), id(3)));

        assert!(!matrix.contains(id(3), id(0)));
        assert!(!matrix.contains(id(2), id(0)));
    }

    #[test]
    fn transitive_closure_cycle() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(3, 3);
        matrix.insert(id(0), id(1));
        matrix.insert(id(1), id(2));
        matrix.insert(id(2), id(0));

        matrix.transitive_closure();

        for row in 0..3 {
            for col in 0..3 {
                assert!(
                    matrix.contains(id(row), id(col)),
                    "{row} should reach {col}"
                );
            }
        }
    }

    #[test]
    fn reflexive_transitive_closure() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(3, 3);
        matrix.insert(id(0), id(1));

        matrix.reflexive_transitive_closure();

        for index in 0..3 {
            assert!(matrix.contains(id(index), id(index)));
        }
        assert!(matrix.contains(id(0), id(1)));
        assert!(!matrix.contains(id(1), id(0)));
        assert!(!matrix.contains(id(2), id(0)));
        assert!(!matrix.contains(id(0), id(2)));
    }

    #[test]
    fn transitive_closure_diamond() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(4, 4);
        matrix.insert(id(0), id(1));
        matrix.insert(id(0), id(2));
        matrix.insert(id(1), id(3));
        matrix.insert(id(2), id(3));

        matrix.transitive_closure();

        assert!(matrix.contains(id(0), id(3)));
        assert!(!matrix.contains(id(3), id(0)));
        assert!(!matrix.contains(id(1), id(2)));
    }

    #[test]
    fn transitive_closure_idempotent() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(4, 4);
        matrix.insert(id(0), id(1));
        matrix.insert(id(1), id(2));
        matrix.insert(id(2), id(3));

        matrix.transitive_closure();
        let snapshot: Vec<u64> = matrix.words().to_vec();
        matrix.transitive_closure();
        assert_eq!(matrix.words(), snapshot);
    }

    // =========================================================================
    // Out-of-bounds panics
    // =========================================================================

    #[test]
    #[should_panic = "assertion failed"]
    fn insert_row_out_of_bounds() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
        matrix.insert(id(5), id(0));
    }

    #[test]
    #[should_panic = "assertion failed"]
    fn insert_col_out_of_bounds() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
        matrix.insert(id(0), id(100));
    }

    #[test]
    #[should_panic = "assertion failed"]
    fn remove_row_out_of_bounds() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
        matrix.remove(id(5), id(0));
    }

    #[test]
    #[should_panic = "assertion failed"]
    fn contains_row_out_of_bounds() {
        let matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
        let _contains = matrix.contains(id(5), id(0));
    }

    #[test]
    #[should_panic = "assertion failed"]
    fn contains_col_out_of_bounds() {
        let matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
        let _contains = matrix.contains(id(0), id(100));
    }

    #[test]
    #[should_panic = "assertion failed"]
    fn row_out_of_bounds() {
        let matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
        let _row = matrix.row(id(5));
    }

    #[test]
    #[should_panic = "assertion failed"]
    fn row_mut_out_of_bounds() {
        let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
        let _row_mut = matrix.row_mut(id(5));
    }
}

// =============================================================================
// Sparse BitMatrix
// =============================================================================

mod sparse {
    use super::*;

    // =========================================================================
    // Construction
    // =========================================================================

    #[test]
    fn new_empty() {
        let matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        assert_eq!(matrix.col_domain_size(), 100);
        assert_eq!(matrix.allocated_rows(), 0);
        assert!(matrix.is_empty_row(id(0)));
    }

    #[test]
    fn zero_cols() {
        let matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(0);
        assert_eq!(matrix.col_domain_size(), 0);
        assert_eq!(matrix.allocated_rows(), 0);
        assert!(matrix.is_empty_row(id(0)));
    }

    // =========================================================================
    // Element operations
    // =========================================================================

    #[test]
    fn insert_allocates_row() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        assert!(matrix.row(id(5)).is_none());
        matrix.insert(id(5), id(10));
        assert!(matrix.row(id(5)).is_some());
        assert_eq!(matrix.allocated_rows(), 1);
    }

    #[test]
    fn insert_remove_contains() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        let row = id(3);
        let col = id(22);

        assert!(!matrix.contains(row, col));
        assert!(matrix.insert(row, col));
        assert!(matrix.contains(row, col));
        assert!(!matrix.insert(row, col));
        assert!(matrix.remove(row, col));
        assert!(!matrix.contains(row, col));
        assert!(!matrix.remove(row, col));
    }

    #[test]
    fn remove_unallocated_row() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        assert!(!matrix.remove(id(5), id(10)));
    }

    #[test]
    fn iter_row_and_count() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        assert_eq!(matrix.count_row(id(0)), 0);
        matrix.insert(id(0), id(5));
        matrix.insert(id(0), id(50));
        matrix.insert(id(0), id(99));

        assert_eq!(matrix.count_row(id(0)), 3);
        assert_eq!(row_cols(matrix.iter_row(id(0))), [5, 50, 99]);
    }

    // =========================================================================
    // RowRef interop
    // =========================================================================

    #[test]
    fn row_returns_row_ref() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(0), id(10));
        matrix.insert(id(0), id(50));

        let row: RowRef<'_, TestId> = matrix.row(id(0)).expect("row should exist");
        assert_eq!(row.count(), 2);
        assert!(row.contains(id(10)));
        assert!(!row.contains(id(11)));
        assert_eq!(row_cols(row.iter()), [10, 50]);
    }

    // =========================================================================
    // Clearing and free-list
    // =========================================================================

    #[test]
    fn clear_row_recycles_slot() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(3), id(22));
        matrix.insert(id(3), id(75));
        assert_eq!(matrix.allocated_rows(), 1);

        matrix.clear_row(id(3));
        assert!(matrix.is_empty_row(id(3)));
        assert_eq!(matrix.allocated_rows(), 0);

        matrix.insert(id(7), id(50));
        assert_eq!(matrix.allocated_rows(), 1);
        assert!(!matrix.contains(id(7), id(22)));
        assert!(matrix.contains(id(7), id(50)));
    }

    #[test]
    fn clear_all_recycles_all() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(0), id(10));
        matrix.insert(id(5), id(50));
        matrix.insert(id(9), id(90));
        assert_eq!(matrix.allocated_rows(), 3);

        matrix.clear();
        assert_eq!(matrix.allocated_rows(), 0);
        assert!(matrix.is_empty_row(id(0)));
        assert!(matrix.is_empty_row(id(5)));
    }

    #[test]
    fn free_list_reuse_pattern() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(64);

        for row in 0..10 {
            matrix.insert(id(row), id(row));
        }
        assert_eq!(matrix.allocated_rows(), 10);

        for row in (0..10).step_by(2) {
            matrix.clear_row(id(row));
        }
        assert_eq!(matrix.allocated_rows(), 5);

        let backing_len_before = matrix.backing.len();
        for row in 10..15 {
            matrix.insert(id(row), id(0));
        }
        assert_eq!(matrix.backing.len(), backing_len_before);
        assert_eq!(matrix.allocated_rows(), 10);

        for row in (0..10).step_by(2) {
            assert!(matrix.is_empty_row(id(row)));
        }
        for row in (1..10).step_by(2) {
            assert!(matrix.contains(id(row), id(row)));
        }
        for row in 10..15 {
            assert!(matrix.contains(id(row), id(0)));
        }
    }

    // =========================================================================
    // Insert all + boundary sizes
    // =========================================================================

    #[test]
    fn insert_all_into_row() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert_all_into_row(id(2));
        assert_eq!(matrix.count_row(id(2)), 100);
        for col in 0..100 {
            assert!(matrix.contains(id(2), id(col)));
        }
        assert!(matrix.is_empty_row(id(0)));
    }

    #[test]
    fn insert_all_boundary_sizes() {
        for &cols in &[1, 63, 64, 65, 128, 129] {
            let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(cols);
            matrix.insert_all_into_row(id(0));
            assert_eq!(matrix.count_row(id(0)), cols, "cols={cols}");
            assert!(matrix.contains(id(0), id(cols - 1)), "cols={cols}");
        }
    }

    // =========================================================================
    // Row-to-row operations
    // =========================================================================

    #[test]
    fn union_rows() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(0), id(10));
        matrix.insert(id(1), id(20));

        assert!(matrix.union_rows(id(0), id(1)));
        assert!(matrix.contains(id(1), id(10)));
        assert!(matrix.contains(id(1), id(20)));
        assert!(!matrix.union_rows(id(0), id(1)));
    }

    #[test]
    fn union_rows_self_is_noop() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(0), id(10));
        assert!(!matrix.union_rows(id(0), id(0)));
    }

    #[test]
    fn union_rows_from_unallocated_is_noop() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(1), id(20));
        assert!(!matrix.union_rows(id(99), id(1)));
    }

    #[test]
    fn subtract_rows() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(0), id(10));
        matrix.insert(id(0), id(20));
        matrix.insert(id(1), id(10));
        matrix.insert(id(1), id(30));

        assert!(matrix.subtract_rows(id(0), id(1)));
        assert!(!matrix.contains(id(1), id(10)));
        assert!(matrix.contains(id(1), id(30)));
    }

    #[test]
    fn subtract_rows_self_clears() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(0), id(10));
        assert!(matrix.subtract_rows(id(0), id(0)));
        assert!(matrix.is_empty_row(id(0)));
    }

    #[test]
    fn subtract_rows_unallocated_write_noop() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(0), id(10));
        assert!(!matrix.subtract_rows(id(0), id(5)));
    }

    #[test]
    fn intersect_rows() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(0), id(10));
        matrix.insert(id(0), id(20));
        matrix.insert(id(1), id(20));
        matrix.insert(id(1), id(30));

        assert!(matrix.intersect_rows(id(0), id(1)));
        assert!(!matrix.contains(id(1), id(10)));
        assert!(matrix.contains(id(1), id(20)));
        assert!(!matrix.contains(id(1), id(30)));
    }

    #[test]
    fn intersect_rows_unallocated_read_clears_write() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(1), id(20));

        assert!(matrix.intersect_rows(id(99), id(1)));
        assert!(matrix.is_empty_row(id(1)));
    }

    #[test]
    fn intersect_rows_self_noop() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(0), id(10));
        matrix.insert(id(0), id(20));

        assert!(!matrix.intersect_rows(id(0), id(0)));
        assert!(matrix.contains(id(0), id(10)));
        assert!(matrix.contains(id(0), id(20)));
    }

    // =========================================================================
    // Row-to-DenseBitSet operations
    // =========================================================================

    #[test]
    fn row_with_dense() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(0), id(10));
        matrix.insert(id(0), id(20));
        matrix.insert(id(0), id(30));

        let mut dense = DenseBitSet::new_empty(100);
        dense.insert(id(20));
        dense.insert(id(50));

        let mut clone = matrix.clone();
        assert!(clone.union_row_with(id(0), &dense));
        assert!(clone.contains(id(0), id(50)));

        let mut clone = matrix.clone();
        assert!(clone.subtract_row_with(id(0), &dense));
        assert!(!clone.contains(id(0), id(20)));
        assert!(clone.contains(id(0), id(10)));

        assert!(matrix.intersect_row_with(id(0), &dense));
        assert!(!matrix.contains(id(0), id(10)));
        assert!(matrix.contains(id(0), id(20)));
        assert!(!matrix.contains(id(0), id(30)));
    }

    // =========================================================================
    // Superset / subset
    // =========================================================================

    #[test]
    fn superset_subset_row() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(0), id(10));
        matrix.insert(id(0), id(20));
        matrix.insert(id(0), id(30));

        let mut subset = DenseBitSet::new_empty(100);
        subset.insert(id(10));
        subset.insert(id(20));

        let mut superset = DenseBitSet::new_empty(100);
        superset.insert(id(10));
        superset.insert(id(20));
        superset.insert(id(30));
        superset.insert(id(40));

        assert_eq!(matrix.superset_row(id(0), &subset), Some(true));
        assert_eq!(matrix.superset_row(id(0), &superset), Some(false));
        assert_eq!(matrix.subset_row(id(0), &superset), Some(true));
        assert_eq!(matrix.subset_row(id(0), &subset), Some(false));

        assert_eq!(matrix.superset_row(id(5), &subset), None);
    }

    // =========================================================================
    // Out-of-bounds panics
    // =========================================================================

    #[test]
    #[should_panic = "assertion failed"]
    fn remove_col_out_of_bounds() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(0), id(10));
        matrix.remove(id(0), id(100));
    }

    #[test]
    #[should_panic = "assertion failed"]
    fn insert_col_out_of_bounds() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(0), id(100));
    }

    #[test]
    #[should_panic = "assertion failed"]
    fn contains_col_out_of_bounds() {
        let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
        matrix.insert(id(0), id(10));
        let _contains = matrix
            .row(id(0))
            .expect("should should exist")
            .contains(id(100));
    }
}

// =============================================================================
// Property-based tests
// =============================================================================

mod prop {
    #![expect(clippy::min_ident_chars)]
    use test_strategy::proptest;

    use super::*;

    #[derive(Debug, Clone)]
    enum DenseOp {
        Insert(usize, usize),
        Remove(usize, usize),
        Contains(usize, usize),
        UnionRows(usize, usize),
        SubtractRows(usize, usize),
        IntersectRowsMut(usize, usize),
        InsertAllIntoRow(usize),
        ClearRow(usize),
        Clear,
        CountRow(usize),
    }

    fn arbitrary_dense_ops(
        rows: usize,
        cols: usize,
        count: usize,
    ) -> impl proptest::strategy::Strategy<Value = Vec<DenseOp>> {
        use proptest::prelude::*;

        prop::collection::vec(
            prop_oneof![
                (0..rows, 0..cols).prop_map(|(row, col)| DenseOp::Insert(row, col)),
                (0..rows, 0..cols).prop_map(|(row, col)| DenseOp::Remove(row, col)),
                (0..rows, 0..cols).prop_map(|(row, col)| DenseOp::Contains(row, col)),
                (0..rows, 0..rows).prop_map(|(read, write)| DenseOp::UnionRows(read, write)),
                (0..rows, 0..rows).prop_map(|(read, write)| DenseOp::SubtractRows(read, write)),
                (0..rows, 0..rows).prop_map(|(read, write)| DenseOp::IntersectRowsMut(read, write)),
                (0..rows).prop_map(DenseOp::InsertAllIntoRow),
                (0..rows).prop_map(DenseOp::ClearRow),
                Just(DenseOp::Clear),
                (0..rows).prop_map(DenseOp::CountRow),
            ],
            1..=count,
        )
    }

    #[derive(Debug, Clone)]
    enum SparseOp {
        Insert(usize, usize),
        Remove(usize, usize),
        Contains(usize, usize),
        UnionRows(usize, usize),
        SubtractRows(usize, usize),
        IntersectRows(usize, usize),
        ClearRow(usize),
        InsertAllIntoRow(usize),
    }

    fn arbitrary_sparse_ops(
        rows: usize,
        cols: usize,
        count: usize,
    ) -> impl proptest::strategy::Strategy<Value = Vec<SparseOp>> {
        use proptest::prelude::*;

        prop::collection::vec(
            prop_oneof![
                (0..rows, 0..cols).prop_map(|(row, col)| SparseOp::Insert(row, col)),
                (0..rows, 0..cols).prop_map(|(row, col)| SparseOp::Remove(row, col)),
                (0..rows, 0..cols).prop_map(|(row, col)| SparseOp::Contains(row, col)),
                (0..rows, 0..rows).prop_map(|(read, write)| SparseOp::UnionRows(read, write)),
                (0..rows, 0..rows).prop_map(|(read, write)| SparseOp::SubtractRows(read, write)),
                (0..rows, 0..rows).prop_map(|(read, write)| SparseOp::IntersectRows(read, write)),
                (0..rows).prop_map(SparseOp::ClearRow),
                (0..rows).prop_map(SparseOp::InsertAllIntoRow),
            ],
            1..=count,
        )
    }

    #[proptest]
    fn dense_vs_sparse_equivalence(
        #[strategy(3..=32_usize)] rows: usize,
        #[strategy(1..=200_usize)] cols: usize,
        #[strategy(arbitrary_sparse_ops(#rows, #cols, 200))] ops: Vec<SparseOp>,
    ) {
        let mut dense = BitMatrix::<TestId, TestId>::new(rows, cols);
        let mut sparse = SparseBitMatrix::<TestId, TestId>::new(cols);

        for op in &ops {
            match *op {
                SparseOp::Insert(row, col) => {
                    let row = id(row);
                    let col = id(col);
                    let dense_changed = dense.insert(row, col);
                    let sparse_changed = sparse.insert(row, col);
                    assert_eq!(
                        dense_changed, sparse_changed,
                        "insert({row:?}, {col:?}) changed mismatch"
                    );
                }
                SparseOp::Remove(row, col) => {
                    let row = id(row);
                    let col = id(col);
                    let dense_changed = dense.remove(row, col);
                    let sparse_changed = sparse.remove(row, col);
                    assert_eq!(
                        dense_changed, sparse_changed,
                        "remove({row:?}, {col:?}) changed mismatch"
                    );
                }
                SparseOp::Contains(row, col) => {
                    let row = id(row);
                    let col = id(col);
                    let dense_val = dense.contains(row, col);
                    let sparse_val = sparse.contains(row, col);
                    assert_eq!(dense_val, sparse_val, "contains({row:?}, {col:?}) mismatch");
                }
                SparseOp::UnionRows(read, write) => {
                    let read = id(read);
                    let write = id(write);
                    dense.union_rows(read, write);
                    sparse.union_rows(read, write);
                }
                SparseOp::SubtractRows(read, write) => {
                    let read = id(read);
                    let write = id(write);
                    dense.subtract_rows(read, write);
                    sparse.subtract_rows(read, write);
                }
                SparseOp::IntersectRows(read, write) => {
                    let read = id(read);
                    let write = id(write);
                    dense.intersect_rows_mut(read, write);
                    sparse.intersect_rows(read, write);
                }
                SparseOp::ClearRow(row) => {
                    let row = id(row);
                    dense.clear_row(row);
                    sparse.clear_row(row);
                }
                SparseOp::InsertAllIntoRow(row) => {
                    let row = id(row);
                    dense.insert_all_into_row(row);
                    sparse.insert_all_into_row(row);
                }
            }
        }

        for row in 0..rows {
            for col in 0..cols {
                let row = id(row);
                let col = id(col);
                assert_eq!(
                    dense.contains(row, col),
                    sparse.contains(row, col),
                    "final mismatch at ({row:?}, {col:?})"
                );
            }
        }
    }

    #[proptest]
    fn dense_excess_bits_invariant(
        #[strategy(1..=32_usize)] rows: usize,
        #[strategy(1..=200_usize)] cols: usize,
        #[strategy(arbitrary_dense_ops(#rows, #cols, 100))] ops: Vec<DenseOp>,
    ) {
        let mut matrix = BitMatrix::<TestId, TestId>::new(rows, cols);

        for op in &ops {
            match *op {
                DenseOp::Insert(row, col) => {
                    matrix.insert(id(row), id(col));
                }
                DenseOp::Remove(row, col) => {
                    matrix.remove(id(row), id(col));
                }
                DenseOp::UnionRows(read, write) => {
                    matrix.union_rows(id(read), id(write));
                }
                DenseOp::SubtractRows(read, write) => {
                    matrix.subtract_rows(id(read), id(write));
                }
                DenseOp::IntersectRowsMut(read, write) => {
                    matrix.intersect_rows_mut(id(read), id(write));
                }
                DenseOp::InsertAllIntoRow(row) => {
                    matrix.insert_all_into_row(id(row));
                }
                DenseOp::ClearRow(row) => {
                    matrix.clear_row(id(row));
                }
                DenseOp::Clear => {
                    matrix.clear();
                }
                DenseOp::Contains(row, col) => {
                    let _contains = matrix.contains(id(row), id(col));
                }
                DenseOp::CountRow(row) => {
                    let _contains = matrix.count_row(id(row));
                }
            }
        }

        let excess_bits = cols % 64;
        if excess_bits != 0 {
            let mask = !0_u64 << excess_bits;
            let words = matrix.words();
            let words_per_row = cols.div_ceil(64);

            for row in 0..rows {
                let last_word_index = (row + 1) * words_per_row - 1;
                let last_word = words[last_word_index];
                assert!(
                    last_word & mask == 0,
                    "row {row}: excess bits set in last word: {last_word:#066b}, mask: \
                     {mask:#066b}"
                );
            }
        }
    }
}
