use alloc::collections::BTreeSet;

use hashql_core::id::{
    Id as _,
    bit_vec::{BitRelations as _, DenseBitSet},
};
use proptest::{arbitrary::any, prop_assert_eq, property_test};
use zerocopy::IntoBytes as _;

use super::{CompressedBitSet, DenseBitSlice, DenseBitSliceArray};
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

/// Range coverage demands exactly the rows below `n`.
///
/// Rows above `n` never count against the answer, and `n = 0` holds vacuously. The fixture rows
/// straddle roaring's container boundary at 2^16, so a covered range crosses containers as well
/// as words, and no set covers a domain wider than the representable rows.
#[test]
fn contains_below_demands_every_row_of_the_range() {
    let empty = CompressedBitSet::<NodeRowId>::new();
    assert!(
        empty.contains_below(0),
        "an empty range is covered vacuously"
    );
    assert!(!empty.contains_below(1));

    let hole = 0x1_0040_u64;
    let mut set =
        CompressedBitSet::from_rows((0..0x1_0100).filter(|&row| row != hole).map(NodeRowId::new));
    assert!(
        set.contains_below(hole),
        "the range below the hole is covered"
    );
    assert!(
        !set.contains_below(hole + 1),
        "the hole breaks coverage at its own row"
    );
    assert!(
        !set.contains_below(0x1_0100),
        "a row above the hole cannot repair the range below it"
    );

    set.insert(NodeRowId::new(hole));
    assert!(
        set.contains_below(0x1_0100),
        "filling the hole covers the range"
    );
    assert!(
        !set.contains_below(0x1_0101),
        "coverage ends at the last admitted row"
    );
    assert!(
        !set.contains_below(u64::from(u32::MAX) + 2),
        "a range wider than the representable domain is never covered"
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

/// Builds one frame by hand: the domain header, then the member words.
#[expect(
    clippy::little_endian_bytes,
    reason = "the tests craft the frame's little-endian bytes by hand"
)]
fn frame(domain_size: u64, words: &[u64]) -> Vec<u8> {
    let mut bytes = domain_size.to_le_bytes().to_vec();
    for word in words {
        bytes.extend_from_slice(&word.to_le_bytes());
    }
    bytes
}

#[test]
fn dense_bit_slice_starts_empty() {
    let set = DenseBitSlice::<NodeRowId>::new_empty(130);

    assert_eq!(set.domain_size(), 130);
    assert_eq!(set.count(), 0);
    assert_eq!(set.iter().next(), None);
    assert!(!set.contains(NodeRowId::new(0)));
}

#[test]
fn dense_bit_slice_inserted_rows_are_contained_and_iterated_in_order() {
    // The rows straddle the 64-bit word boundary, so the iteration order crosses words.
    let mut set = DenseBitSlice::new_empty(130);
    for row in [97, 0, 63, 64, 129] {
        assert!(set.insert(NodeRowId::new(row)));
    }
    assert!(
        !set.insert(NodeRowId::new(63)),
        "reinsertion leaves the set unchanged"
    );

    assert_eq!(set.count(), 5);
    assert_eq!(
        set.iter().collect::<Vec<_>>(),
        [0, 63, 64, 97, 129].map(NodeRowId::new)
    );
    assert!(set.contains(NodeRowId::new(129)));
    assert!(!set.contains(NodeRowId::new(128)));
}

#[test]
fn dense_bit_slice_removal_reports_whether_the_set_changed() {
    let mut set = DenseBitSlice::new_empty(130);
    set.insert(EdgeRowId::new(1));
    set.insert(EdgeRowId::new(2));

    assert!(set.remove(EdgeRowId::new(2)));
    assert!(!set.remove(EdgeRowId::new(2)));
    assert_eq!(set.iter().collect::<Vec<_>>(), [EdgeRowId::new(1)]);
}

/// A row outside the domain is not admitted, and the query answers rather than panics.
#[test]
fn dense_bit_slice_rows_outside_the_domain_read_absent() {
    let mut set = DenseBitSlice::new_empty(100);
    set.insert(NodeRowId::new(1));

    assert!(!set.contains(NodeRowId::new(100)));
    assert!(!set.remove(NodeRowId::new(100)));
    assert_eq!(set.count(), 1);
}

#[test]
#[should_panic(expected = "the row lies in the set's domain")]
fn dense_bit_slice_insert_rejects_rows_outside_the_domain() {
    let mut set = DenseBitSlice::new_empty(100);
    set.insert(NodeRowId::new(100));
}

/// The rank of a row is the member count below it, at every word boundary and beyond the domain.
#[test]
fn dense_bit_slice_counts_members_below_a_row() {
    let mut set = DenseBitSlice::new_empty(130);
    for row in [0, 63, 64, 100, 129] {
        set.insert(NodeRowId::new(row));
    }

    let count_below = |row: u64| set.count_below(NodeRowId::new(row));
    assert_eq!(count_below(0), 0);
    assert_eq!(count_below(1), 1);
    assert_eq!(count_below(63), 1);
    assert_eq!(count_below(64), 2);
    assert_eq!(count_below(65), 3);
    assert_eq!(count_below(100), 3);
    assert_eq!(count_below(129), 4);

    // A row at or beyond the domain ranks after every member.
    assert_eq!(count_below(130), 5);
    assert_eq!(count_below(4_000), 5);
}

/// The word view is the LSB-first bitmask: bit `row % 8` of byte `row / 8`, over every 8-byte
/// word the domain occupies.
#[test]
fn dense_bit_slice_packs_rows_lsb_first() {
    // 11 rows occupy one word, eight bytes. Rows 0 and 3 set bits 0 and 3 of byte 0
    // (0b0000_1001), rows 8 and 10 set bits 0 and 2 of byte 1 (0b0000_0101), and the six
    // padding bytes stay zero.
    let mut set = DenseBitSlice::new_empty(11);
    for row in [0, 3, 8, 10] {
        set.insert(NodeRowId::new(row));
    }

    let mut expected = [0_u8; 8];
    expected[0] = 0b0000_1001;
    expected[1] = 0b0000_0101;
    assert_eq!(set.words().as_bytes(), expected);
}

#[test]
fn dense_bit_slice_words_cross_the_word_boundary() {
    // 70 rows occupy two words, sixteen bytes. Row 64 is bit 0 and row 69 bit 5 of byte 8
    // (0b0010_0001), and every other byte stays zero.
    let mut set = DenseBitSlice::new_empty(70);
    set.insert(NodeRowId::new(64));
    set.insert(NodeRowId::new(69));

    let mut expected = [0_u8; 16];
    expected[8] = 0b0010_0001;
    assert_eq!(set.words().as_bytes(), expected);
}

#[test]
fn dense_bit_slice_zero_domain_packs_to_no_words() {
    let set = DenseBitSlice::<NodeRowId>::new_empty(0);

    assert!(set.words().is_empty());
}

/// Membership, cardinality, iteration order, and the byte round trip agree with a reference set.
#[property_test]
fn dense_bit_slice_agrees_with_a_reference_set(
    #[strategy = 1_usize..4_096] domain: usize,
    #[strategy = proptest::collection::vec(any::<proptest::sample::Index>(), 0..64)] picks: Vec<
        proptest::sample::Index,
    >,
) {
    let mut set = DenseBitSlice::new_empty(domain);
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
        prop_assert_eq!(
            set.count_below(NodeRowId::from_usize(row)),
            reference.range(..row).count() as u64
        );
    }

    prop_assert_eq!(
        DenseBitSlice::<NodeRowId>::try_from_prefix(set.as_bytes()),
        Ok((&*set, &[] as &[u8]))
    );
}

/// Word-wise relations against an in-memory set mutate the frame and report change.
#[test]
fn dense_bit_slice_relations_against_an_in_memory_set() {
    let mut slice = DenseBitSlice::new_empty(130);
    for row in [1, 64, 100] {
        slice.insert(NodeRowId::new(row));
    }
    let mut other = DenseBitSet::new_empty(130);
    for row in [64, 100, 129] {
        other.insert(NodeRowId::from_usize(row));
    }

    assert!(slice.union(&other));
    assert_eq!(
        slice.iter().collect::<Vec<_>>(),
        [1, 64, 100, 129].map(NodeRowId::new)
    );
    assert!(
        DenseBitSlice::<NodeRowId>::try_from_prefix(slice.as_bytes()).is_ok(),
        "the union preserves the frame's final-word invariant"
    );
    assert!(!slice.union(&other), "a second union changes nothing");

    assert!(slice.intersect(&other));
    assert_eq!(
        slice.iter().collect::<Vec<_>>(),
        [64, 100, 129].map(NodeRowId::new)
    );

    assert!(slice.subtract(&other));
    assert_eq!(slice.count(), 0);
    assert!(
        !slice.subtract(&other),
        "subtracting from an empty set changes nothing"
    );
}

#[test]
#[should_panic(expected = "the sets draw from the same domain")]
fn dense_bit_slice_relations_reject_mismatched_domains() {
    let mut slice = DenseBitSlice::<NodeRowId>::new_empty(100);
    let other = DenseBitSet::<NodeRowId>::new_empty(101);
    slice.union(&other);
}

#[test]
fn dense_bit_slice_total_byte_len_counts_the_header_and_the_words() {
    // The empty domain still carries its 8-byte header; 64 rows fill exactly one word; 65 spill
    // into a second.
    assert_eq!(DenseBitSlice::<NodeRowId>::total_byte_len(0), 8);
    assert_eq!(DenseBitSlice::<NodeRowId>::total_byte_len(1), 16);
    assert_eq!(DenseBitSlice::<NodeRowId>::total_byte_len(64), 16);
    assert_eq!(DenseBitSlice::<NodeRowId>::total_byte_len(65), 24);

    let set = DenseBitSlice::<NodeRowId>::new_empty(130);
    assert_eq!(
        set.as_bytes().len() as u64,
        DenseBitSlice::<NodeRowId>::total_byte_len(130),
        "the built set occupies exactly the length the geometry promises",
    );
}

#[test]
fn dense_bit_slice_iterates_ranges_across_word_boundaries() {
    let mut set = DenseBitSlice::<NodeRowId>::new_empty(130);
    for row in [0, 63, 64, 100, 129] {
        set.insert(NodeRowId::new(row));
    }

    let rows_in = |start: u64, end: u64| {
        set.iter_in(NodeRowId::new(start)..NodeRowId::new(end))
            .map(NodeRowId::as_u32)
            .collect::<Vec<_>>()
    };

    assert_eq!(rows_in(0, 130), [0, 63, 64, 100, 129]);
    assert_eq!(rows_in(1, 129), [63, 64, 100]);
    assert_eq!(rows_in(63, 65), [63, 64]);
    assert_eq!(rows_in(64, 64), [] as [u32; 0]);
    assert_eq!(rows_in(101, 130), [129]);

    // The end clamps to the domain, so a longer range names no extra rows.
    assert_eq!(rows_in(101, 4_000), [129]);
}

#[test]
#[should_panic(expected = "an inverted row range admits no iteration order")]
fn dense_bit_slice_range_iteration_rejects_inverted_ranges() {
    let set = DenseBitSlice::<NodeRowId>::new_empty(100);
    let _rows = set.iter_in(NodeRowId::new(60)..NodeRowId::new(2));
}

#[test]
fn dense_bit_slice_relations_apply_between_slices() {
    let mut target = DenseBitSlice::<NodeRowId>::new_empty(130);
    target.insert(NodeRowId::new(1));
    let mut other = DenseBitSlice::<NodeRowId>::new_empty(130);
    for row in [64, 129] {
        other.insert(NodeRowId::new(row));
    }

    assert!(target.union(&*other));
    assert_eq!(
        target.iter().collect::<Vec<_>>(),
        [1, 64, 129].map(NodeRowId::new)
    );
    assert!(!target.union(&*other), "a second union changes nothing");

    assert!(target.intersect(&*other));
    assert_eq!(
        target.iter().collect::<Vec<_>>(),
        [64, 129].map(NodeRowId::new)
    );

    assert!(target.subtract(&*other));
    assert_eq!(target.count(), 0);
}

#[test]
#[should_panic(expected = "the sets draw from the same domain")]
fn dense_bit_slice_relations_reject_mismatched_slice_domains() {
    let mut target = DenseBitSlice::<NodeRowId>::new_empty(100);
    let other = DenseBitSlice::<NodeRowId>::new_empty(101);
    target.union(&*other);
}

#[test]
#[should_panic(expected = "the rank names one of the array's frames")]
fn dense_bit_slice_array_rejects_ranks_beyond_the_frames() {
    let sets = DenseBitSliceArray::<NodeRowId>::new_empty(100, 2);
    let _: &DenseBitSlice<NodeRowId> = &sets[2];
}

/// The tests the `miri` nextest profile selects.
///
/// Each test here reinterprets raw words as dense bit slices and frame arrays through the zerocopy
/// doors, including the misshapen inputs those doors refuse. The profile selects by module path, so
/// moving a test in or out of this module is the whole edit.
mod miri {
    use zerocopy::{IntoBytes as _, TryFromBytes as _};

    use super::frame;
    use crate::{
        bitset::{
            DenseBitSlice, DenseBitSliceArray, ParseDenseBitSliceArrayError,
            ParseDenseBitSliceError,
        },
        identity::NodeRowId,
    };

    /// A live set and its frame are the same bytes in both directions.
    #[test]
    fn dense_bit_slice_frames_round_trip() {
        let mut set = DenseBitSlice::new_empty(130);
        set.insert(NodeRowId::new(3));
        set.insert(NodeRowId::new(64));

        let (read, rest) =
            DenseBitSlice::<NodeRowId>::try_from_prefix(set.as_bytes()).expect("the frame parses");
        assert_eq!(read, &*set);
        assert_eq!(read.iter().collect::<Vec<_>>(), [3, 64].map(NodeRowId::new));
        assert!(rest.is_empty());
    }

    #[test]
    fn dense_bit_slice_zero_domain_frames_parse() {
        let set = DenseBitSlice::<NodeRowId>::new_empty(0);
        assert_eq!(set.as_bytes().len(), 8);

        let (read, rest) =
            DenseBitSlice::<NodeRowId>::try_from_prefix(set.as_bytes()).expect("the frame parses");
        assert_eq!(read.count(), 0);
        assert_eq!(read.domain_size(), 0);
        assert!(rest.is_empty());
    }

    /// The final word carries in-domain bits and refuses bits above the domain.
    #[test]
    fn dense_bit_slice_polices_the_final_word() {
        let legal = frame(100, &[0, 1 << (99 - 64)]);
        let (read, _rest) =
            DenseBitSlice::<NodeRowId>::try_from_prefix(&legal).expect("the frame parses");
        assert!(read.contains(NodeRowId::new(99)));

        assert_eq!(
            DenseBitSlice::<NodeRowId>::try_from_prefix(&frame(100, &[0, 1 << (100 - 64)])),
            Err(ParseDenseBitSliceError::ExcessBits)
        );
    }

    /// `try_from_prefix` refuses every misshapen frame and names the cause.
    #[test]
    fn dense_bit_slice_refuses_misshapen_frames() {
        assert_eq!(
            DenseBitSlice::<NodeRowId>::try_from_prefix(&[0_u8; 4]),
            Err(ParseDenseBitSliceError::Header { bytes: 4 })
        );
        assert_eq!(
            DenseBitSlice::<NodeRowId>::try_from_prefix(&frame(64, &[0])[..12]),
            Err(ParseDenseBitSliceError::WordCount {
                domain_size: 64,
                words: 0
            })
        );
        assert_eq!(
            DenseBitSlice::<NodeRowId>::try_from_prefix(&frame(65, &[0])),
            Err(ParseDenseBitSliceError::WordCount {
                domain_size: 65,
                words: 1
            })
        );

        // A buffer longer than its frame is a prefix read rather than a refusal.
        let long = frame(64, &[0, 0]);
        let (read, rest) =
            DenseBitSlice::<NodeRowId>::try_from_prefix(&long).expect("the header frames the set");
        assert_eq!(read.domain_size(), 64);
        assert_eq!(rest, [0_u8; 8]);
    }

    /// The frame invariant is the type's bit validity, so the zerocopy doors validate it
    /// themselves.
    #[test]
    fn dense_bit_slice_zerocopy_doors_carry_the_frame_invariant() {
        let valid = frame(100, &[0, 1 << (99 - 64)]);
        let read =
            DenseBitSlice::<NodeRowId>::try_ref_from_bytes(&valid).expect("the frame is valid");
        assert!(read.contains(NodeRowId::new(99)));

        DenseBitSlice::<NodeRowId>::try_ref_from_bytes(&frame(65, &[0]))
            .expect_err("the frame carries one word where a 65-row domain occupies two");
        DenseBitSlice::<NodeRowId>::try_ref_from_bytes(&frame(100, &[0, 1 << (100 - 64)]))
            .expect_err("the frame sets a bit above its domain in the final word");
    }

    /// A plain prefix read is greedy, so framing a prefix takes the header's own word count.
    #[test]
    fn dense_bit_slice_prefix_reads_take_the_header_count() {
        let mut bytes = frame(100, &[3, 1]);
        bytes.extend_from_slice(&[0xAB; 8]);

        DenseBitSlice::<NodeRowId>::try_ref_from_prefix(&bytes).expect_err(
            "the greedy split hands validation three words where the header claims two",
        );

        let (read, rest) = DenseBitSlice::<NodeRowId>::try_from_prefix(&bytes)
            .expect("the header's own count frames the prefix");
        assert_eq!(
            read.iter().collect::<Vec<_>>(),
            [0, 1, 64].map(NodeRowId::new)
        );
        assert_eq!(rest, [0xAB; 8]);
    }

    #[test]
    fn dense_bit_slice_array_starts_as_empty_frames() {
        let sets = DenseBitSliceArray::<NodeRowId>::new_empty(130, 3);

        assert_eq!(sets.len(), 3);
        assert_eq!(sets.domain_size(), 130);
        assert_eq!(
            Some(sets.as_bytes().len() as u64),
            DenseBitSliceArray::<NodeRowId>::total_byte_len(130, 3),
            "the allocation is exactly the domain header plus the frame count's strides",
        );
        for rank in 0..3 {
            assert_eq!(sets[rank].domain_size(), 130);
            assert_eq!(sets[rank].count(), 0);
        }
    }

    #[test]
    fn dense_bit_slice_array_indexes_independent_frames() {
        let mut sets = DenseBitSliceArray::<NodeRowId>::new_empty(130, 3);
        assert!(sets[0].insert(NodeRowId::new(3)));
        assert!(sets[1].insert(NodeRowId::new(64)));
        assert!(sets[1].insert(NodeRowId::new(3)));
        assert!(sets[2].insert(NodeRowId::new(129)));

        assert_eq!(sets[0].iter().collect::<Vec<_>>(), [3].map(NodeRowId::new));
        assert_eq!(
            sets[1].iter().collect::<Vec<_>>(),
            [3, 64].map(NodeRowId::new)
        );
        assert_eq!(
            sets[2].iter().collect::<Vec<_>>(),
            [129].map(NodeRowId::new)
        );
    }

    /// The live array and its byte region are the same bytes in both directions, and the region is
    /// the domain header, then the frames back to back: what a file write emits.
    #[test]
    fn dense_bit_slice_array_round_trips_through_its_region() {
        let mut sets = DenseBitSliceArray::<NodeRowId>::new_empty(130, 2);
        sets[0].insert(NodeRowId::new(0));
        sets[1].insert(NodeRowId::new(129));

        let concatenated: Vec<u8> = (0..sets.len())
            .flat_map(|rank| sets[rank].as_bytes().to_vec())
            .collect();
        assert_eq!(&sets.as_bytes()[8..], concatenated);

        let read = DenseBitSliceArray::<NodeRowId>::try_from_bytes(sets.as_bytes(), 130, 2)
            .expect("the region parses");
        assert_eq!(read, &*sets);
        assert_eq!(read[0].iter().collect::<Vec<_>>(), [NodeRowId::new(0)]);
        assert_eq!(read[1].iter().collect::<Vec<_>>(), [NodeRowId::new(129)]);
    }

    /// An array of no frames still states its domain: the header is the whole region.
    #[test]
    fn dense_bit_slice_array_of_no_frames() {
        let sets = DenseBitSliceArray::<NodeRowId>::new_empty(130, 0);

        assert_eq!(sets.len(), 0);
        assert_eq!(sets.domain_size(), 130);
        assert_eq!(sets.as_bytes().len(), 8);

        let read = DenseBitSliceArray::<NodeRowId>::try_from_bytes(sets.as_bytes(), 130, 0)
            .expect("the header-only region parses");
        assert_eq!(read.len(), 0);
        assert_eq!(read.domain_size(), 130);
    }

    /// `try_from_bytes` refuses every misshapen region and names the rank and cause.
    #[test]
    fn dense_bit_slice_array_refuses_misshapen_regions() {
        // Domain 100 takes two words, so one frame is 24 bytes behind the 8-byte region header:
        // frame 1 occupies bytes 32..56, and position 100 is bit 4 of byte 52 in its final word.
        let sets = DenseBitSliceArray::<NodeRowId>::new_empty(100, 2);
        let bytes = sets.as_bytes();

        assert_eq!(
            DenseBitSliceArray::<NodeRowId>::try_from_bytes(&bytes[..bytes.len() - 8], 100, 2),
            Err(ParseDenseBitSliceArrayError::Length {
                expected: Some(56),
                actual: 48
            })
        );
        assert_eq!(
            DenseBitSliceArray::<NodeRowId>::try_from_bytes(bytes, 100, u64::MAX),
            Err(ParseDenseBitSliceArrayError::Length {
                expected: None,
                actual: 56
            }),
            "an overflowing frame count matches no real region",
        );

        // `try_from_bytes` refuses a region header that disagrees with the caller before it reads
        // any frame.
        assert_eq!(
            DenseBitSliceArray::<NodeRowId>::try_from_bytes(bytes, 101, 2),
            Err(ParseDenseBitSliceArrayError::Header {
                expected: 101,
                actual: 100
            })
        );

        // A frame claiming a smaller domain parses cleanly inside its chunk. The agreement check
        // refuses it.
        let mut shrunk = bytes.to_vec();
        shrunk[32..].copy_from_slice(&frame(99, &[0, 0]));
        assert_eq!(
            DenseBitSliceArray::<NodeRowId>::try_from_bytes(&shrunk, 100, 2),
            Err(ParseDenseBitSliceArrayError::Domain {
                rank: 1,
                expected: 100,
                actual: 99
            })
        );

        let mut excess = bytes.to_vec();
        excess[52] |= 0b0001_0000;
        assert_eq!(
            DenseBitSliceArray::<NodeRowId>::try_from_bytes(&excess, 100, 2),
            Err(ParseDenseBitSliceArrayError::Frame {
                rank: 1,
                error: ParseDenseBitSliceError::ExcessBits
            })
        );
    }

    /// The region invariant is the type's bit validity, so the zerocopy doors validate it
    /// themselves.
    #[test]
    fn dense_bit_slice_array_zerocopy_doors_carry_the_region_invariant() {
        // The fixture is two 24-byte frames of domain 100 behind the 8-byte region header: frame 1
        // occupies bytes 32..56, and position 100 is bit 4 of byte 52 in its final word.
        let mut sets = DenseBitSliceArray::<NodeRowId>::new_empty(100, 2);
        sets[0].insert(NodeRowId::new(99));
        let bytes = sets.as_bytes();

        let read = DenseBitSliceArray::<NodeRowId>::try_ref_from_bytes(bytes)
            .expect("the region is valid");
        assert_eq!(read, &*sets);
        assert!(read[0].contains(NodeRowId::new(99)));

        // Torn strides, an excess bit, and a frame claiming a foreign domain are all refused.
        DenseBitSliceArray::<NodeRowId>::try_ref_from_bytes(&bytes[..bytes.len() - 8])
            .expect_err("the region tears mid-stride");
        let mut excess = bytes.to_vec();
        excess[52] |= 0b0001_0000;
        DenseBitSliceArray::<NodeRowId>::try_ref_from_bytes(&excess)
            .expect_err("frame 1 sets a bit above the domain");
        let mut shrunk = bytes.to_vec();
        shrunk[32..].copy_from_slice(&frame(99, &[0, 0]));
        DenseBitSliceArray::<NodeRowId>::try_ref_from_bytes(&shrunk)
            .expect_err("frame 1 claims a foreign domain");

        // A header-only region is the array of no frames.
        let empty = DenseBitSliceArray::<NodeRowId>::new_empty(64, 0);
        let read = DenseBitSliceArray::<NodeRowId>::try_ref_from_bytes(empty.as_bytes())
            .expect("the header-only region is valid");
        assert_eq!(read.len(), 0);
        assert_eq!(read.domain_size(), 64);
    }

    #[test]
    #[should_panic(expected = "the rank names one of the array's frames")]
    fn dense_bit_slice_array_of_no_frames_rejects_every_rank() {
        let sets = DenseBitSliceArray::<NodeRowId>::new_empty(100, 0);
        let _: &DenseBitSlice<NodeRowId> = &sets[0];
    }
}
