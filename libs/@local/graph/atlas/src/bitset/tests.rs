use alloc::collections::BTreeSet;

use proptest::{arbitrary::any, prop_assert_eq, property_test};

use super::{BitMatrix, BitSet};

#[test]
fn starts_empty() {
    let set = BitSet::new(130);

    assert_eq!(set.len(), 130);
    assert!(!set.is_empty());
    assert_eq!(set.count(), 0);
    assert_eq!(set.iter().next(), None);
    assert!((0..130).all(|index| !set.contains(index)));
}

#[test]
fn inserted_indices_are_contained_and_iterated_in_order() {
    // Indices straddle word boundaries: 63/64 cross the first word,
    // 129 lands in a partial third word.
    let mut set = BitSet::new(130);
    for index in [97, 0, 63, 64, 129, 3] {
        set.insert(index);
    }
    set.insert(3); // Reinsertion is idempotent.

    assert_eq!(set.count(), 6);
    assert_eq!(set.iter().collect::<Vec<_>>(), [0, 3, 63, 64, 97, 129]);
    assert!(set.contains(64));
    assert!(!set.contains(65));
}

#[test]
fn empty_capacity_holds_nothing() {
    let set = BitSet::new(0);

    assert!(set.is_empty());
    assert_eq!(set.iter().next(), None);
}

#[test]
#[should_panic(expected = "the index lies beyond the capacity")]
fn contains_rejects_out_of_capacity_indices() {
    // Word 0 exists for capacity 10, so only the explicit capacity
    // check can reject index 10.
    let set = BitSet::new(10);
    let _contained = set.contains(10);
}

#[test]
#[should_panic(expected = "the index lies beyond the capacity")]
fn insert_rejects_out_of_capacity_indices() {
    let mut set = BitSet::new(10);
    set.insert(10);
}

/// Intersection keeps exactly the shared indices.
///
/// Indices beyond the other set's capacity read as absent from it.
#[test]
fn intersection_matches_set_semantics() {
    // 130 spans three words; 70 spans two - the third word and the
    // second word's tail cover the capacity-mismatch paths.
    let mut wide = BitSet::new(130);
    for index in [0, 63, 64, 69, 70, 100, 129] {
        wide.insert(index);
    }
    let mut narrow = BitSet::new(70);
    for index in [0, 63, 69] {
        narrow.insert(index);
    }

    wide.intersect_with(&narrow);
    assert_eq!(wide.iter().collect::<Vec<_>>(), [0, 63, 69]);
}

#[test]
fn matrix_starts_empty() {
    let matrix = BitMatrix::new(3, 130);

    assert_eq!(matrix.rows(), 3);
    assert_eq!(matrix.columns(), 130);
    assert_eq!(matrix.stride(), 3);
    assert!((0..3).all(|row| matrix.row(row).iter().all(|&word| word == 0)));
}

#[test]
fn inserted_cells_are_contained_in_their_row_alone() {
    // Columns straddle word boundaries: 63/64 cross the first word,
    // 129 lands in a partial third word.
    let mut matrix = BitMatrix::new(2, 130);
    for column in [97, 0, 63, 64, 129] {
        matrix.insert(1, column);
    }

    assert!((0..130).all(|column| !matrix.contains(0, column)));
    assert!(matrix.contains(1, 64));
    assert!(!matrix.contains(1, 65));
    assert_eq!(matrix.row(1)[0], (1 << 0) | (1 << 63));
}

#[test]
fn or_row_into_folds_rows_in_both_split_directions() {
    let mut matrix = BitMatrix::new(3, 70);
    matrix.insert(0, 3);
    matrix.insert(1, 64);
    matrix.insert(2, 69);

    // A later row folds into an earlier one, and an earlier into a
    // later: both arms of the disjoint split.
    matrix.or_row_into(2, 0);
    matrix.or_row_into(0, 1);

    assert!(matrix.contains(0, 3) && matrix.contains(0, 69));
    assert!(matrix.contains(1, 3) && matrix.contains(1, 64) && matrix.contains(1, 69));
    assert!(!matrix.contains(2, 3));

    // Folding a row into itself changes nothing.
    let before = matrix.clone();
    matrix.or_row_into(1, 1);
    assert_eq!(matrix, before);
}

#[test]
#[should_panic(expected = "the row lies beyond the shape")]
fn matrix_row_rejects_out_of_shape_rows() {
    let matrix = BitMatrix::new(2, 10);
    let _row = matrix.row(2);
}

#[test]
#[should_panic(expected = "the column lies beyond the shape")]
fn matrix_insert_rejects_out_of_shape_columns() {
    // Word 0 exists for 10 columns, so only the explicit shape check
    // can reject column 10.
    let mut matrix = BitMatrix::new(2, 10);
    matrix.insert(1, 10);
}

/// Cells and row folds agree with a reference matrix of sets.
#[property_test]
fn matrix_agrees_with_a_reference(
    #[strategy = 1_usize..8] rows: usize,
    #[strategy = 1_usize..150] columns: usize,
    #[strategy = proptest::collection::vec(any::<(proptest::sample::Index, proptest::sample::Index)>(), 0..48)]
    picks: Vec<(proptest::sample::Index, proptest::sample::Index)>,
    #[strategy = proptest::collection::vec(any::<(proptest::sample::Index, proptest::sample::Index)>(), 0..8)]
    folds: Vec<(proptest::sample::Index, proptest::sample::Index)>,
) {
    let mut matrix = BitMatrix::new(rows, columns);
    let mut reference = vec![BTreeSet::new(); rows];

    for (row, column) in picks {
        let (row, column) = (row.index(rows), column.index(columns));
        matrix.insert(row, column);
        reference[row].insert(column);
    }

    for (source, target) in folds {
        let (source, target) = (source.index(rows), target.index(rows));
        matrix.or_row_into(source, target);
        let folded: Vec<usize> = reference[source].iter().copied().collect();
        reference[target].extend(folded);
    }

    for (row, columns_of_row) in reference.iter().enumerate() {
        for column in 0..columns {
            prop_assert_eq!(
                matrix.contains(row, column),
                columns_of_row.contains(&column)
            );
        }
    }
}

/// The packed words agree with a reference set on membership, count, and iteration order.
///
/// Every capacity shape is exercised.
#[property_test]
fn agrees_with_a_reference_set(
    #[strategy = 1_usize..30] len: usize,
    #[strategy = proptest::collection::vec(any::<proptest::sample::Index>(), 0..64)] picks: Vec<
        proptest::sample::Index,
    >,
) {
    let mut set = BitSet::new(len);
    let mut reference = BTreeSet::new();
    for pick in picks {
        let index = pick.index(len);
        set.insert(index);
        reference.insert(index);
    }

    prop_assert_eq!(set.count(), reference.len());
    for index in 0..len {
        prop_assert_eq!(set.contains(index), reference.contains(&index));
    }
    prop_assert_eq!(
        set.iter().collect::<Vec<_>>(),
        reference.into_iter().collect::<Vec<_>>()
    );
}
