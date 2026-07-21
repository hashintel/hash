use alloc::collections::BTreeSet;

use proptest::prelude::*;

use super::BitSet;

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

/// Intersection keeps exactly the shared indices, and indices beyond the other set's capacity
/// read as absent from it.
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

proptest! {
    /// The packed words agree with a reference set on membership, count, and iteration order at every capacity shape.
    #[test]
    fn agrees_with_a_reference_set(
        len in 1_usize..300,
        picks in prop::collection::vec(any::<prop::sample::Index>(), 0..64),
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
}
