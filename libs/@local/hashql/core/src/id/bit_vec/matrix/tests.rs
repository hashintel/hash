use super::{BitMatrix, RowRef, SparseBitMatrix};
use crate::{
    id::{Id as _, bit_vec::DenseBitSet},
    newtype,
};

newtype!(struct TestId(usize is 0..=usize::MAX));

// =============================================================================
// RowRef / RowMut — view types
// =============================================================================

#[test]
fn row_ref_contains_and_iter() {
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 200);
    matrix.insert(TestId::from_usize(2), TestId::from_usize(0));
    matrix.insert(TestId::from_usize(2), TestId::from_usize(63));
    matrix.insert(TestId::from_usize(2), TestId::from_usize(64));
    matrix.insert(TestId::from_usize(2), TestId::from_usize(199));

    let row = matrix.row(TestId::from_usize(2));
    assert!(row.contains(TestId::from_usize(0)));
    assert!(row.contains(TestId::from_usize(63)));
    assert!(!row.contains(TestId::from_usize(1)));
    assert_eq!(row.count(), 4);
    assert!(!row.is_empty());

    let cols: Vec<usize> = row.iter().map(TestId::as_usize).collect();
    assert_eq!(cols, [0, 63, 64, 199]);
}

#[test]
fn row_ref_superset() {
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(10));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(20));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(30));

    matrix.insert(TestId::from_usize(1), TestId::from_usize(10));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(20));

    let row0 = matrix.row(TestId::from_usize(0));
    let row1 = matrix.row(TestId::from_usize(1));
    assert!(row0.superset(&row1));
    assert!(!row1.superset(&row0));
}

#[test]
fn row_mut_insert_remove() {
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
    {
        let mut row = matrix.row_mut(TestId::from_usize(0));
        assert!(row.insert(TestId::from_usize(42)));
        assert!(!row.insert(TestId::from_usize(42)));
        assert!(row.contains(TestId::from_usize(42)));
        assert!(row.remove(TestId::from_usize(42)));
        assert!(!row.contains(TestId::from_usize(42)));
    }
    assert!(!matrix.contains(TestId::from_usize(0), TestId::from_usize(42)));
}

#[test]
fn row_mut_union_subtract_intersect() {
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(10));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(20));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(20));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(30));

    // Union row1 into a copy
    let src = matrix.row(TestId::from_usize(1));
    let cols_src: Vec<usize> = src.iter().map(TestId::as_usize).collect();
    assert_eq!(cols_src, [20, 30]);

    // We can't borrow mutably and immutably at the same time, so test via
    // the matrix-level operations.
    assert!(matrix.union_rows(TestId::from_usize(1), TestId::from_usize(0)));
    let cols: Vec<usize> = matrix
        .iter_row(TestId::from_usize(0))
        .map(TestId::as_usize)
        .collect();
    assert_eq!(cols, [10, 20, 30]);
}

#[test]
fn row_mut_union_with_dense() {
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
    let mut dense = DenseBitSet::new_empty(100);
    dense.insert(TestId::from_usize(50));
    dense.insert(TestId::from_usize(99));

    let mut row = matrix.row_mut(TestId::from_usize(0));
    assert!(row.union_dense(&dense));
    assert!(row.contains(TestId::from_usize(50)));
    assert!(row.contains(TestId::from_usize(99)));
    assert!(!row.union_dense(&dense));
}

#[test]
fn row_mut_insert_all_and_clear() {
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(5, 100);
    {
        let mut row = matrix.row_mut(TestId::from_usize(2));
        row.insert_all();
        assert_eq!(row.count(), 100);
    }
    for col in 0..100 {
        assert!(matrix.contains(TestId::from_usize(2), TestId::from_usize(col)));
    }
    {
        let mut row = matrix.row_mut(TestId::from_usize(2));
        row.clear();
        assert!(row.is_empty());
    }
}

// =============================================================================
// BitMatrix — construction
// =============================================================================

#[test]
fn dense_new_empty() {
    let matrix: BitMatrix<TestId, TestId> = BitMatrix::new(10, 20);
    assert_eq!(matrix.row_domain_size(), 10);
    assert_eq!(matrix.col_domain_size(), 20);
    for row in matrix.rows() {
        assert!(matrix.is_empty_row(row));
    }
}

#[test]
fn dense_from_row_n() {
    let mut row = DenseBitSet::new_empty(100);
    row.insert(TestId::from_usize(5));
    row.insert(TestId::from_usize(50));
    row.insert(TestId::from_usize(99));

    let matrix: BitMatrix<TestId, TestId> = BitMatrix::from_row_n(&row, 4);
    for row in matrix.rows() {
        assert!(matrix.contains(row, TestId::from_usize(5)));
        assert!(matrix.contains(row, TestId::from_usize(50)));
        assert!(matrix.contains(row, TestId::from_usize(99)));
        assert_eq!(matrix.count_row(row), 3);
    }
}

// =============================================================================
// BitMatrix — element operations
// =============================================================================

#[test]
fn dense_insert_remove_contains() {
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(200, 200);
    let row = TestId::from_usize(10);
    let col = TestId::from_usize(150);

    assert!(!matrix.contains(row, col));
    assert!(matrix.insert(row, col));
    assert!(matrix.contains(row, col));
    assert!(!matrix.insert(row, col));

    assert!(matrix.remove(row, col));
    assert!(!matrix.contains(row, col));
    assert!(!matrix.remove(row, col));
}

// =============================================================================
// BitMatrix — row-to-row operations
// =============================================================================

#[test]
fn dense_union_rows() {
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(64, 100);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(10));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(20));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(30));

    assert!(matrix.union_rows(TestId::from_usize(0), TestId::from_usize(1)));
    assert!(matrix.contains(TestId::from_usize(1), TestId::from_usize(10)));
    assert!(matrix.contains(TestId::from_usize(1), TestId::from_usize(20)));
    assert!(matrix.contains(TestId::from_usize(1), TestId::from_usize(30)));
    assert!(!matrix.union_rows(TestId::from_usize(0), TestId::from_usize(1)));
}

#[test]
fn dense_subtract_rows() {
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(10, 100);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(20));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(10));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(20));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(30));

    assert!(matrix.subtract_rows(TestId::from_usize(0), TestId::from_usize(1)));
    assert!(matrix.contains(TestId::from_usize(1), TestId::from_usize(10)));
    assert!(!matrix.contains(TestId::from_usize(1), TestId::from_usize(20)));
    assert!(matrix.contains(TestId::from_usize(1), TestId::from_usize(30)));
}

#[test]
fn dense_intersect_rows_mut() {
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(10, 100);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(10));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(20));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(20));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(30));

    assert!(matrix.intersect_rows_mut(TestId::from_usize(0), TestId::from_usize(1)));
    assert!(!matrix.contains(TestId::from_usize(1), TestId::from_usize(10)));
    assert!(matrix.contains(TestId::from_usize(1), TestId::from_usize(20)));
    assert!(!matrix.contains(TestId::from_usize(1), TestId::from_usize(30)));
}

#[test]
fn dense_intersect_rows_collect() {
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(10, 200);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(10));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(20));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(150));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(20));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(30));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(150));

    let intersection = matrix.intersect_rows(TestId::from_usize(0), TestId::from_usize(1));
    let values: Vec<usize> = intersection.iter().map(|id| id.as_usize()).collect();
    assert_eq!(values, [20, 150]);
}

// =============================================================================
// BitMatrix — transitive closure
// =============================================================================

#[test]
fn transitive_closure_chain() {
    // 0 → 1 → 2 → 3
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(4, 4);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(1));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(2));
    matrix.insert(TestId::from_usize(2), TestId::from_usize(3));

    matrix.transitive_closure();

    assert!(matrix.contains(TestId::from_usize(0), TestId::from_usize(1)));
    assert!(matrix.contains(TestId::from_usize(0), TestId::from_usize(2)));
    assert!(matrix.contains(TestId::from_usize(0), TestId::from_usize(3)));
    assert!(matrix.contains(TestId::from_usize(1), TestId::from_usize(2)));
    assert!(matrix.contains(TestId::from_usize(1), TestId::from_usize(3)));
    assert!(matrix.contains(TestId::from_usize(2), TestId::from_usize(3)));

    assert!(!matrix.contains(TestId::from_usize(3), TestId::from_usize(0)));
    assert!(!matrix.contains(TestId::from_usize(2), TestId::from_usize(0)));
}

#[test]
fn transitive_closure_cycle() {
    // 0 → 1 → 2 → 0  (cycle)
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(3, 3);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(1));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(2));
    matrix.insert(TestId::from_usize(2), TestId::from_usize(0));

    matrix.transitive_closure();

    // Every node can reach every other node
    for row in 0..3 {
        for col in 0..3 {
            assert!(
                matrix.contains(TestId::from_usize(row), TestId::from_usize(col)),
                "{row} should reach {col}"
            );
        }
    }
}

#[test]
fn reflexive_transitive_closure() {
    // 0 → 1,  2 isolated
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(3, 3);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(1));

    matrix.reflexive_transitive_closure();

    // Diagonal
    for index in 0..3 {
        assert!(matrix.contains(TestId::from_usize(index), TestId::from_usize(index)));
    }
    // 0 reaches 1
    assert!(matrix.contains(TestId::from_usize(0), TestId::from_usize(1)));
    // 1 does not reach 0
    assert!(!matrix.contains(TestId::from_usize(1), TestId::from_usize(0)));
    // 2 is isolated
    assert!(!matrix.contains(TestId::from_usize(2), TestId::from_usize(0)));
    assert!(!matrix.contains(TestId::from_usize(0), TestId::from_usize(2)));
}

#[test]
fn transitive_closure_diamond() {
    //     0
    //    / \
    //   1   2
    //    \ /
    //     3
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(4, 4);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(1));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(2));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(3));
    matrix.insert(TestId::from_usize(2), TestId::from_usize(3));

    matrix.transitive_closure();

    assert!(matrix.contains(TestId::from_usize(0), TestId::from_usize(3)));
    assert!(!matrix.contains(TestId::from_usize(3), TestId::from_usize(0)));
    assert!(!matrix.contains(TestId::from_usize(1), TestId::from_usize(2)));
}

// =============================================================================
// SparseBitMatrix — arena-backed design
// =============================================================================

#[test]
fn sparse_new_empty() {
    let matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    assert_eq!(matrix.col_domain_size(), 100);
    assert_eq!(matrix.allocated_rows(), 0);
    assert!(matrix.is_empty_row(TestId::from_usize(0)));
}

#[test]
fn sparse_insert_allocates_row() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    assert!(matrix.row(TestId::from_usize(5)).is_none());
    matrix.insert(TestId::from_usize(5), TestId::from_usize(10));
    assert!(matrix.row(TestId::from_usize(5)).is_some());
    assert_eq!(matrix.allocated_rows(), 1);
}

#[test]
fn sparse_insert_remove_contains() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    let row = TestId::from_usize(3);
    let col = TestId::from_usize(22);

    assert!(!matrix.contains(row, col));
    assert!(matrix.insert(row, col));
    assert!(matrix.contains(row, col));
    assert!(!matrix.insert(row, col));
    assert!(matrix.remove(row, col));
    assert!(!matrix.contains(row, col));
    assert!(!matrix.remove(row, col));
}

#[test]
fn sparse_clear_row_recycles_slot() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    matrix.insert(TestId::from_usize(3), TestId::from_usize(22));
    matrix.insert(TestId::from_usize(3), TestId::from_usize(75));
    assert_eq!(matrix.allocated_rows(), 1);

    matrix.clear_row(TestId::from_usize(3));
    assert!(matrix.is_empty_row(TestId::from_usize(3)));
    assert_eq!(matrix.allocated_rows(), 0);

    // The freed slot should be reused when we allocate row 7.
    matrix.insert(TestId::from_usize(7), TestId::from_usize(50));
    assert_eq!(matrix.allocated_rows(), 1);
    // Reused slot should not contain stale data from row 3.
    assert!(!matrix.contains(TestId::from_usize(7), TestId::from_usize(22)));
    assert!(matrix.contains(TestId::from_usize(7), TestId::from_usize(50)));
}

#[test]
fn sparse_clear_all_recycles_all() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(10));
    matrix.insert(TestId::from_usize(5), TestId::from_usize(50));
    matrix.insert(TestId::from_usize(9), TestId::from_usize(90));
    assert_eq!(matrix.allocated_rows(), 3);

    matrix.clear();
    assert_eq!(matrix.allocated_rows(), 0);
    assert!(matrix.is_empty_row(TestId::from_usize(0)));
    assert!(matrix.is_empty_row(TestId::from_usize(5)));
}

#[test]
fn sparse_union_rows() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(10));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(20));

    assert!(matrix.union_rows(TestId::from_usize(0), TestId::from_usize(1)));
    assert!(matrix.contains(TestId::from_usize(1), TestId::from_usize(10)));
    assert!(matrix.contains(TestId::from_usize(1), TestId::from_usize(20)));
    assert!(!matrix.union_rows(TestId::from_usize(0), TestId::from_usize(1)));
}

#[test]
fn sparse_union_rows_self_is_noop() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(10));
    assert!(!matrix.union_rows(TestId::from_usize(0), TestId::from_usize(0)));
}

#[test]
fn sparse_union_rows_from_unallocated_is_noop() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    matrix.insert(TestId::from_usize(1), TestId::from_usize(20));
    assert!(!matrix.union_rows(TestId::from_usize(99), TestId::from_usize(1)));
}

#[test]
fn sparse_subtract_rows() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(10));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(20));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(10));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(30));

    assert!(matrix.subtract_rows(TestId::from_usize(0), TestId::from_usize(1)));
    assert!(!matrix.contains(TestId::from_usize(1), TestId::from_usize(10)));
    assert!(matrix.contains(TestId::from_usize(1), TestId::from_usize(30)));
}

#[test]
fn sparse_subtract_rows_self_clears() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(10));
    assert!(matrix.subtract_rows(TestId::from_usize(0), TestId::from_usize(0)));
    assert!(matrix.is_empty_row(TestId::from_usize(0)));
}

#[test]
fn sparse_intersect_rows() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(10));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(20));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(20));
    matrix.insert(TestId::from_usize(1), TestId::from_usize(30));

    assert!(matrix.intersect_rows(TestId::from_usize(0), TestId::from_usize(1)));
    assert!(!matrix.contains(TestId::from_usize(1), TestId::from_usize(10)));
    assert!(matrix.contains(TestId::from_usize(1), TestId::from_usize(20)));
    assert!(!matrix.contains(TestId::from_usize(1), TestId::from_usize(30)));
}

#[test]
fn sparse_intersect_rows_unallocated_read_clears_write() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    matrix.insert(TestId::from_usize(1), TestId::from_usize(20));

    assert!(matrix.intersect_rows(TestId::from_usize(99), TestId::from_usize(1)));
    assert!(matrix.is_empty_row(TestId::from_usize(1)));
}

#[test]
fn sparse_row_with_dense() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(10));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(20));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(30));

    let mut dense = DenseBitSet::new_empty(100);
    dense.insert(TestId::from_usize(20));
    dense.insert(TestId::from_usize(50));

    // Union
    let mut clone = matrix.clone();
    assert!(clone.union_row_with(TestId::from_usize(0), &dense));
    assert!(clone.contains(TestId::from_usize(0), TestId::from_usize(50)));

    // Subtract
    let mut clone = matrix.clone();
    assert!(clone.subtract_row_with(TestId::from_usize(0), &dense));
    assert!(!clone.contains(TestId::from_usize(0), TestId::from_usize(20)));
    assert!(clone.contains(TestId::from_usize(0), TestId::from_usize(10)));

    // Intersect
    assert!(matrix.intersect_row_with(TestId::from_usize(0), &dense));
    assert!(!matrix.contains(TestId::from_usize(0), TestId::from_usize(10)));
    assert!(matrix.contains(TestId::from_usize(0), TestId::from_usize(20)));
    assert!(!matrix.contains(TestId::from_usize(0), TestId::from_usize(30)));
}

#[test]
fn sparse_insert_all_into_row() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    matrix.insert_all_into_row(TestId::from_usize(2));
    assert_eq!(matrix.count_row(TestId::from_usize(2)), 100);
    for col in 0..100 {
        assert!(matrix.contains(TestId::from_usize(2), TestId::from_usize(col)));
    }
    assert!(matrix.is_empty_row(TestId::from_usize(0)));
}

#[test]
fn sparse_iter_row_and_count() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    assert_eq!(matrix.count_row(TestId::from_usize(0)), 0);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(5));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(50));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(99));

    assert_eq!(matrix.count_row(TestId::from_usize(0)), 3);
    let cols: Vec<usize> = matrix
        .iter_row(TestId::from_usize(0))
        .map(TestId::as_usize)
        .collect();
    assert_eq!(cols, [5, 50, 99]);
}

#[test]
fn sparse_superset_subset_row() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(10));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(20));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(30));

    let mut subset = DenseBitSet::new_empty(100);
    subset.insert(TestId::from_usize(10));
    subset.insert(TestId::from_usize(20));

    let mut superset = DenseBitSet::new_empty(100);
    superset.insert(TestId::from_usize(10));
    superset.insert(TestId::from_usize(20));
    superset.insert(TestId::from_usize(30));
    superset.insert(TestId::from_usize(40));

    assert_eq!(
        matrix.superset_row(TestId::from_usize(0), &subset),
        Some(true)
    );
    assert_eq!(
        matrix.superset_row(TestId::from_usize(0), &superset),
        Some(false)
    );
    assert_eq!(
        matrix.subset_row(TestId::from_usize(0), &superset),
        Some(true)
    );
    assert_eq!(
        matrix.subset_row(TestId::from_usize(0), &subset),
        Some(false)
    );

    // Unallocated row returns None
    assert_eq!(matrix.superset_row(TestId::from_usize(5), &subset), None);
}

// =============================================================================
// SparseBitMatrix — free-list stress test
// =============================================================================

#[test]
fn sparse_free_list_reuse_pattern() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(64);

    // Allocate 10 rows
    for row in 0..10 {
        matrix.insert(TestId::from_usize(row), TestId::from_usize(row));
    }
    assert_eq!(matrix.allocated_rows(), 10);

    // Free the even rows
    for row in (0..10).step_by(2) {
        matrix.clear_row(TestId::from_usize(row));
    }
    assert_eq!(matrix.allocated_rows(), 5);

    // Allocate 5 new rows — they should reuse freed slots,
    // NOT grow the backing buffer further.
    let backing_len_before = matrix.backing.len();
    for row in 10..15 {
        matrix.insert(TestId::from_usize(row), TestId::from_usize(0));
    }
    assert_eq!(matrix.backing.len(), backing_len_before);
    assert_eq!(matrix.allocated_rows(), 10);

    // Verify all data is correct
    for row in (0..10).step_by(2) {
        assert!(matrix.is_empty_row(TestId::from_usize(row)));
    }
    for row in (1..10).step_by(2) {
        assert!(matrix.contains(TestId::from_usize(row), TestId::from_usize(row)));
    }
    for row in 10..15 {
        assert!(matrix.contains(TestId::from_usize(row), TestId::from_usize(0)));
    }
}

// =============================================================================
// SparseBitMatrix — RowRef interop
// =============================================================================

#[test]
fn sparse_row_returns_row_ref() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    matrix.insert(TestId::from_usize(0), TestId::from_usize(10));
    matrix.insert(TestId::from_usize(0), TestId::from_usize(50));

    let row: RowRef<'_, TestId> = matrix.row(TestId::from_usize(0)).expect("row should exist");
    assert_eq!(row.count(), 2);
    assert!(row.contains(TestId::from_usize(10)));
    assert!(!row.contains(TestId::from_usize(11)));

    let cols: Vec<usize> = row.iter().map(TestId::as_usize).collect();
    assert_eq!(cols, [10, 50]);
}
