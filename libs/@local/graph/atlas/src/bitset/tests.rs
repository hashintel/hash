use alloc::collections::BTreeSet;

use hashql_core::id::Id as _;
use proptest::{arbitrary::any, prop_assert_eq, property_test};

use super::CompressedBitSet;
use crate::identity::{EdgeRowId, NodeRowId};

#[test]
fn starts_empty() {
    let set = CompressedBitSet::<NodeRowId>::new();

    assert!(set.is_empty());
    assert_eq!(set.count(), 0);
    assert_eq!(set.iter().next(), None);
    assert!(!set.contains(NodeRowId::new(0)));
}

#[test]
fn inserted_rows_are_contained_and_iterated_in_order() {
    // The rows straddle roaring's container boundary at 2^16, so the
    // iteration order crosses containers as well as words.
    let mut set = CompressedBitSet::new();
    for row in [97, 0, 0x1_0040, 0xFFFF, 3] {
        assert!(set.insert(NodeRowId::new(row)));
    }
    assert!(
        !set.insert(NodeRowId::new(3)),
        "reinsertion leaves the set unchanged"
    );

    assert_eq!(set.count(), 5);
    assert_eq!(
        set.iter().collect::<Vec<_>>(),
        [0, 3, 97, 0xFFFF, 0x1_0040].map(NodeRowId::new)
    );
    assert!(set.contains(NodeRowId::new(0x1_0040)));
    assert!(!set.contains(NodeRowId::new(0x1_0041)));
}

/// A one-pass build admits every row of its iterator and reads back in ascending order.
#[test]
fn from_rows_admits_every_row_and_iterates_in_order() {
    let links = CompressedBitSet::from_rows([4, 1, 2].map(EdgeRowId::new));

    assert_eq!(links.count(), 3);
    assert_eq!(
        links.iter().collect::<Vec<_>>(),
        [1, 2, 4].map(EdgeRowId::new)
    );
}

#[test]
fn removal_reports_whether_the_set_changed() {
    let mut set = CompressedBitSet::from_rows([1, 2].map(EdgeRowId::new));

    assert!(set.remove(EdgeRowId::new(2)));
    assert!(!set.remove(EdgeRowId::new(2)));
    assert_eq!(set.iter().collect::<Vec<_>>(), [EdgeRowId::new(1)]);
}

/// A row above the representable domain is not admitted, and the query answers rather than panics.
#[test]
fn rows_above_the_representable_domain_read_absent() {
    let mut set = CompressedBitSet::from_rows([NodeRowId::new(1)]);
    let beyond = NodeRowId::new(u64::from(u32::MAX) + 1);

    assert!(!set.contains(beyond));
    assert!(!set.remove(beyond));
    assert_eq!(set.count(), 1);
}

#[test]
#[should_panic(expected = "the row lies in the representable domain")]
fn insert_rejects_rows_above_the_representable_domain() {
    let mut set = CompressedBitSet::new();
    set.insert(NodeRowId::new(u64::from(u32::MAX) + 1));
}

/// Membership, cardinality, and iteration order agree with a reference set.
#[property_test]
fn agrees_with_a_reference_set(
    #[strategy = 1_u32..70_000] domain: u32,
    #[strategy = proptest::collection::vec(any::<proptest::sample::Index>(), 0..64)] picks: Vec<
        proptest::sample::Index,
    >,
) {
    let domain = domain as usize;
    let mut set = CompressedBitSet::new();
    let mut reference = BTreeSet::new();
    for pick in picks {
        let row = pick.index(domain);
        set.insert(NodeRowId::from_usize(row));
        reference.insert(row);
    }

    prop_assert_eq!(set.count(), reference.len() as u64);
    prop_assert_eq!(
        set.iter().collect::<Vec<_>>(),
        reference
            .iter()
            .map(|&row| NodeRowId::from_usize(row))
            .collect::<Vec<_>>()
    );
    for row in 0..domain {
        prop_assert_eq!(
            set.contains(NodeRowId::from_usize(row)),
            reference.contains(&row)
        );
    }
}
