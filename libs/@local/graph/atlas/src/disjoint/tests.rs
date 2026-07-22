#![expect(
    clippy::cast_possible_truncation,
    reason = "the reference partition's group sizes stay far below u32"
)]

use alloc::collections::BTreeMap;

use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;

use super::DisjointSet;

#[test]
fn discrete_partition_keeps_indices_apart() {
    let mut components = DisjointSet::new(5);
    assert_eq!(components.len(), 5);
    assert_eq!(components.groups(), 5);
    for index in 0..5 {
        assert_eq!(components.find(index), index);
        assert_eq!(components.group_size(index), 1);
    }
}

#[test]
fn chains_connect_transitively() {
    let mut components = DisjointSet::new(6);
    assert!(components.unite(0, 1));
    assert!(components.unite(1, 2));
    assert!(components.unite(4, 5));

    assert_eq!(components.find(0), components.find(2));
    assert_ne!(components.find(2), components.find(3));
    assert_eq!(components.find(4), components.find(5));
    assert_eq!(components.groups(), 3);
    assert_eq!(components.group_size(1), 3);
    assert_eq!(components.group_size(3), 1);

    // Re-uniting inside one group changes nothing.
    assert!(!components.unite(2, 0));
    assert_eq!(components.groups(), 3);
}

/// Random union sequences agree with a naive relabelling reference.
#[test]
fn random_unions_match_reference_partition() {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(7);
    let len = 64_u32;

    let mut components = DisjointSet::new(len as usize);
    // Reference: every index maps to a label; a union relabels one
    // whole side. Quadratic and obviously correct.
    let mut labels: Vec<u32> = (0..len).collect();

    for _ in 0..96 {
        let one = rng.random_range(0..len);
        let other = rng.random_range(0..len);
        components.unite(one, other);
        let (from, to) = (labels[one as usize], labels[other as usize]);
        if from != to {
            for label in &mut labels {
                if *label == from {
                    *label = to;
                }
            }
        }
    }

    let mut reference_groups: BTreeMap<u32, Vec<u32>> = BTreeMap::new();
    for index in 0..len {
        reference_groups
            .entry(labels[index as usize])
            .or_default()
            .push(index);
    }
    assert_eq!(components.groups(), reference_groups.len());
    for group in reference_groups.values() {
        let representative = components.find(group[0]);
        for &member in group {
            assert_eq!(components.find(member), representative);
        }
        assert_eq!(components.group_size(group[0]), group.len() as u32);
    }
}
