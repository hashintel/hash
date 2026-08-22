use proptest::{prop_assert, prop_assert_eq, prop_assert_ne, property_test};

use super::{Depth, MortonCell, MortonKey};

#[test]
fn curve_start_matches_the_hand_table() {
    // The Z-order curve over the 4 x 4 grid, keys 0..16 by hand:
    // x supplies the even bits, y the odd bits.
    let expected = [
        (0, 0),
        (1, 0),
        (0, 1),
        (1, 1),
        (2, 0),
        (3, 0),
        (2, 1),
        (3, 1),
        (0, 2),
        (1, 2),
        (0, 3),
        (1, 3),
        (2, 2),
        (3, 2),
        (2, 3),
        (3, 3),
    ];

    for (bits, (x, y)) in expected.into_iter().enumerate() {
        assert_eq!(MortonKey::new(x, y).to_bits(), bits as u64);
        assert_eq!(MortonKey::from_bits(bits as u64).coordinates(), [x, y]);
    }
}

#[test]
fn extremes_interleave_exactly() {
    assert_eq!(MortonKey::new(0, 0).to_bits(), 0);
    assert_eq!(MortonKey::new(u32::MAX, u32::MAX).to_bits(), u64::MAX);
    assert_eq!(MortonKey::new(u32::MAX, 0).to_bits(), 0x5555_5555_5555_5555);
    assert_eq!(MortonKey::new(0, u32::MAX).to_bits(), 0xAAAA_AAAA_AAAA_AAAA);
}

#[test]
fn depth_admits_the_documented_domain() {
    assert_eq!(Depth::new(0), Some(Depth::MIN));
    assert_eq!(Depth::new(32), Some(Depth::MAX));
    assert_eq!(Depth::new(33), None);
}

#[test]
fn root_cell_spans_every_key() {
    let root = MortonCell::new(Depth::MIN, 0, 0).expect("the origin lies in the one root cell");

    assert_eq!(root.min_key(), MortonKey::from_bits(0));
    assert_eq!(root.max_key(), MortonKey::from_bits(u64::MAX));
    assert!(root.contains(MortonKey::new(123, 456)));
    assert_eq!(MortonCell::new(Depth::MIN, 1, 0), None);
}

#[test]
fn full_depth_cell_is_one_key() {
    let key = MortonKey::new(7, 11);
    let cell = key.cell(Depth::MAX);

    assert_eq!(cell.min_key(), key);
    assert_eq!(cell.max_key(), key);
    assert_eq!(cell.children(), None);
    assert_eq!(
        MortonCell::new(Depth::MAX, 7, 11),
        Some(cell),
        "the tile address of a key's coordinates is the key's own cell"
    );
}

#[test]
fn cell_addresses_reject_coordinates_outside_the_grid() {
    let depth = Depth::new(3).expect("3 subdivisions lie below the maximum of 32");

    assert!(MortonCell::new(depth, 7, 7).is_some());
    assert_eq!(MortonCell::new(depth, 8, 0), None);
    assert_eq!(MortonCell::new(depth, 0, 8), None);
}

#[test]
fn prefixes_index_the_depth_grid_in_key_order() {
    // Cell (x = 2, y = 3) of the depth-2 grid: axis bits sit at the
    // top of each 32-bit axis, and the prefix interleaves them.
    let key = MortonKey::new(2 << 30, 3 << 30);

    let depth = Depth::new(2).expect("2 subdivisions lie below the maximum of 32");
    assert_eq!(key.prefix(depth), 0b1110);
    assert_eq!(key.prefix(Depth::MIN), 0);
    assert_eq!(key.prefix(Depth::MAX), key.to_bits());
}

#[test]
fn shared_depth_counts_the_agreed_bit_pairs() {
    let key = MortonKey::new(0, 0);

    assert_eq!(key.shared_depth(key), Depth::MAX);
    // y's top bit differs: the keys part at the first subdivision.
    assert_eq!(key.shared_depth(MortonKey::new(0, 1 << 31)).get(), 0);
    // x's second bit differs: one agreed bit pair, so one shared subdivision.
    assert_eq!(key.shared_depth(MortonKey::new(1 << 30, 0)).get(), 1);
}

/// Interleaving then deinterleaving returns the axes exactly.
#[property_test]
fn round_trips_axes(x: u32, y: u32) {
    prop_assert_eq!(MortonKey::new(x, y).coordinates(), [x, y]);
}

/// The shared depth names the deepest grid whose cells hold both keys.
#[property_test]
fn shared_depth_is_the_deepest_shared_cell(left: u64, right: u64) {
    let left = MortonKey::from_bits(left);
    let right = MortonKey::from_bits(right);
    let shared = left.shared_depth(right);

    prop_assert_eq!(left.prefix(shared), right.prefix(shared));
    if let Some(finer) = Depth::new(shared.get() + 1) {
        prop_assert_ne!(left.prefix(finer), right.prefix(finer));
    } else {
        prop_assert_eq!(left, right);
    }
}

/// Every key lies in its own containing cell at every depth.
///
/// The cell's address form agrees with the key's prefix.
#[property_test]
fn keys_lie_in_their_cells(bits: u64, #[strategy = 0_u8..=32] depth: u8) {
    let depth = Depth::new(depth).expect("the strategy stays within the documented domain");
    let key = MortonKey::from_bits(bits);
    let cell = key.cell(depth);

    prop_assert!(cell.contains(key));
    prop_assert!(cell.min_key() <= key);
    prop_assert!(key <= cell.max_key());
    prop_assert_eq!(cell.min_key().prefix(depth), key.prefix(depth));
}

/// Children partition the parent range contiguously, in key order.
#[property_test]
fn children_partition_the_parent(bits: u64, #[strategy = 0_u8..32] depth: u8) {
    let depth = Depth::new(depth).expect("the strategy stays within the documented domain");
    let parent = MortonKey::from_bits(bits).cell(depth);
    let children = parent
        .children()
        .expect("depths below the maximum subdivide");

    prop_assert_eq!(children[0].min_key(), parent.min_key());
    prop_assert_eq!(children[3].max_key(), parent.max_key());
    for (previous, next) in children.iter().zip(&children[1..]) {
        prop_assert_eq!(
            previous.max_key().to_bits() + 1,
            next.min_key().to_bits(),
            "adjacent children meet without gap or overlap"
        );
    }
}

/// A key's next axis bits select the child that contains it.
#[property_test]
fn child_indexes_follow_the_axis_bits(bits: u64, #[strategy = 0_u8..32] depth: u8) {
    let depth = Depth::new(depth).expect("the strategy stays within the documented domain");
    let key = MortonKey::from_bits(bits);
    let children = key
        .cell(depth)
        .children()
        .expect("depths below the maximum subdivide");

    let child_depth = Depth::new(depth.get() + 1)
        .expect("one more subdivision stays within the documented domain");
    let [x, y] = key.coordinates();
    let axis_bit = |axis: u32| (axis >> (32 - u32::from(child_depth.get()))) & 1;
    let index = ((axis_bit(y) << 1) | axis_bit(x)) as usize;

    prop_assert_eq!(children[index], key.cell(child_depth));
    prop_assert!(children[index].contains(key));
}
