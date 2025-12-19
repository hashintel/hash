//! This file is derived from the Rust compiler source code.
//! Source: <https://github.com/rust-lang/rust/blob/f5242367f4acf0130c9b68e6956531b2cb73bd38/compiler/rustc_index/src/bit_set/tests.rs>.
//!
//! Originally dual-licensed under either of:
//!   - Apache License, Version 2.0 (see LICENSE-APACHE.md or <https://www.apache.org/licenses/LICENSE-2.0>)
//!   - MIT license (see LICENSE-MIT.md or <https://opensource.org/licenses/MIT>)
//!
//! You may use, copy, modify, and distribute this file under the terms of the
//! GNU Affero General Public License, Version 3.0, as part of this project,
//! provided that all original notices are preserved.
//!
//! Local adaptations relative to the pinned upstream:
//! API:
//! - Use `Id` in place of `Idx`.
//!   - `index` -> `as_usize`
//!   - `new` -> `from_usize`
//!
//! Implementation and maintenance:
//! - Applied clippy-driven fixes (no intended semantic changes).
//! - Removed benchmarks
#![expect(clippy::too_many_lines, clippy::min_ident_chars, clippy::unwrap_used)]

use alloc::rc::Rc;
use core::{marker::PhantomData, ops::RangeBounds};

use super::GrowableBitSet;
use crate::{
    id::{
        Id as _,
        bit_vec::{
            BitMatrix, BitRelations as _, Chunk, ChunkedBitSet, DenseBitSet, SparseBitMatrix,
            WORD_BITS,
        },
    },
    newtype,
};

newtype!(struct TestId(usize is 0..=usize::MAX));

#[test]
fn new_filled() {
    for i in 0..128 {
        let idx_buf = DenseBitSet::<TestId>::new_filled(i);
        let elems: Vec<_> = idx_buf.iter().map(TestId::as_usize).collect();
        let expected: Vec<_> = (0..i).collect();
        assert_eq!(elems, expected);
    }
}

#[test]
fn bitset_iter_works() {
    let mut bitset = DenseBitSet::new_empty(100);
    bitset.insert(TestId::from_usize(1));
    bitset.insert(TestId::from_usize(10));
    bitset.insert(TestId::from_usize(19));
    bitset.insert(TestId::from_usize(62));
    bitset.insert(TestId::from_usize(63));
    bitset.insert(TestId::from_usize(64));
    bitset.insert(TestId::from_usize(65));
    bitset.insert(TestId::from_usize(66));
    bitset.insert(TestId::from_usize(99));
    assert_eq!(
        bitset.iter().map(TestId::as_usize).collect::<Vec<_>>(),
        [1, 10, 19, 62, 63, 64, 65, 66, 99]
    );
}

#[test]
fn bitset_iter_works_2() {
    let mut bitset = DenseBitSet::new_empty(320);
    bitset.insert(TestId::from_usize(0));
    bitset.insert(TestId::from_usize(127));
    bitset.insert(TestId::from_usize(191));
    bitset.insert(TestId::from_usize(255));
    bitset.insert(TestId::from_usize(319));
    assert_eq!(
        bitset.iter().map(TestId::as_usize).collect::<Vec<_>>(),
        [0, 127, 191, 255, 319]
    );
}

#[test]
fn bitset_clone_from() {
    let mut a = DenseBitSet::new_empty(10);
    a.insert(TestId::from_usize(4));
    a.insert(TestId::from_usize(7));
    a.insert(TestId::from_usize(9));

    let mut b = DenseBitSet::new_empty(2);
    b.clone_from(&a);
    assert_eq!(b.domain_size(), 10);
    assert_eq!(
        b.iter().map(TestId::as_usize).collect::<Vec<_>>(),
        [4, 7, 9]
    );

    b.clone_from(&DenseBitSet::new_empty(40));
    assert_eq!(b.domain_size(), 40);
    assert_eq!(b.iter().collect::<Vec<_>>(), []);
}

#[test]
fn union_two_sets() {
    let mut set1 = DenseBitSet::new_empty(65);
    let mut set2 = DenseBitSet::new_empty(65);
    assert!(set1.insert(TestId::from_usize(3)));
    assert!(!set1.insert(TestId::from_usize(3)));
    assert!(set2.insert(TestId::from_usize(5)));
    assert!(set2.insert(TestId::from_usize(64)));
    assert!(set1.union(&set2));
    assert!(!set1.union(&set2));
    assert!(set1.contains(TestId::from_usize(3)));
    assert!(!set1.contains(TestId::from_usize(4)));
    assert!(set1.contains(TestId::from_usize(5)));
    assert!(!set1.contains(TestId::from_usize(63)));
    assert!(set1.contains(TestId::from_usize(64)));
}

#[test]
fn union_not() {
    let mut a = DenseBitSet::new_empty(100);
    let mut b = DenseBitSet::new_empty(100);

    a.insert(TestId::from_usize(3));
    a.insert(TestId::from_usize(5));
    a.insert(TestId::from_usize(80));
    a.insert(TestId::from_usize(81));

    b.insert(TestId::from_usize(5)); // Already in `a`.
    b.insert(TestId::from_usize(7));
    b.insert(TestId::from_usize(63));
    b.insert(TestId::from_usize(81)); // Already in `a`.
    b.insert(TestId::from_usize(90));

    a.union_not(&b);

    // After union-not, `a` should contain all values in the domain, except for
    // the ones that are in `b` and were _not_ already in `a`.
    assert_eq!(
        a.iter().map(TestId::as_usize).collect::<Vec<_>>(),
        (0_usize..100)
            .filter(|&x| !matches!(x, 7 | 63 | 90))
            .collect::<Vec<_>>(),
    );
}

#[test]
fn chunked_bitset() {
    let mut b0 = ChunkedBitSet::<TestId>::new_empty(0);
    let b0b = b0.clone();
    assert_eq!(
        b0,
        ChunkedBitSet {
            domain_size: 0,
            chunks: Box::new([]),
            marker: PhantomData
        }
    );

    // There are no valid insert/remove/contains operations on a 0-domain
    // bitset, but we can test `union`.
    b0.assert_valid();
    assert!(!b0.union(&b0b));
    assert_eq!(b0.chunks(), vec![]);
    assert_eq!(b0.count(), 0);
    b0.assert_valid();

    //-----------------------------------------------------------------------

    let mut b1 = ChunkedBitSet::<TestId>::new_empty(1);
    assert_eq!(
        b1,
        ChunkedBitSet {
            domain_size: 1,
            chunks: Box::new([Chunk::Zeros]),
            marker: PhantomData
        }
    );
    assert_eq!(b1.chunk_domain_size(0), 1);

    b1.assert_valid();
    assert!(!b1.contains(TestId::from_usize(0)));
    assert_eq!(b1.count(), 0);
    assert!(b1.insert(TestId::from_usize(0)));
    assert!(b1.contains(TestId::from_usize(0)));
    assert_eq!(b1.count(), 1);
    assert_eq!(b1.chunks(), [Chunk::Ones]);
    assert!(!b1.insert(TestId::from_usize(0)));
    assert!(b1.remove(TestId::from_usize(0)));
    assert!(!b1.contains(TestId::from_usize(0)));
    assert_eq!(b1.count(), 0);
    assert_eq!(b1.chunks(), [Chunk::Zeros]);
    b1.assert_valid();

    //-----------------------------------------------------------------------

    let mut b100 = ChunkedBitSet::<TestId>::new_filled(100);
    assert_eq!(
        b100,
        ChunkedBitSet {
            domain_size: 100,
            chunks: Box::new([Chunk::Ones]),
            marker: PhantomData
        }
    );
    assert_eq!(b100.chunk_domain_size(0), 100);

    b100.assert_valid();
    for i in 0..100 {
        assert!(b100.contains(TestId::from_usize(i)));
    }
    assert_eq!(b100.count(), 100);
    assert!(b100.remove(TestId::from_usize(3)));
    assert!(b100.insert(TestId::from_usize(3)));
    assert_eq!(b100.chunks(), vec![Chunk::Ones]);
    assert!(
        b100.remove(TestId::from_usize(20))
            && b100.remove(TestId::from_usize(30))
            && b100.remove(TestId::from_usize(40))
            && b100.remove(TestId::from_usize(99))
            && b100.insert(TestId::from_usize(30))
    );
    assert_eq!(b100.count(), 97);
    assert!(
        !b100.contains(TestId::from_usize(20))
            && b100.contains(TestId::from_usize(30))
            && !b100.contains(TestId::from_usize(99))
            && b100.contains(TestId::from_usize(50))
    );
    #[rustfmt::skip]
    assert_eq!(
        b100.chunks(),
        vec![Chunk::Mixed(
            97,
            Rc::new([
                0b1111_1111_1111_1111_1111_1110_1111_1111_1111_1111_1110_1111_1111_1111_1111_1111,
                0b0000_0000_0000_0000_0000_0000_0000_0111_1111_1111_1111_1111_1111_1111_1111_1111,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0,
            ])
        )],
    );
    b100.assert_valid();
    let mut num_removed = 0;
    for i in 0..100 {
        if b100.remove(TestId::from_usize(i)) {
            num_removed += 1;
        }
    }
    assert_eq!(num_removed, 97);
    assert_eq!(b100.chunks(), vec![Chunk::Zeros]);
    b100.assert_valid();

    //-----------------------------------------------------------------------

    let mut b2548 = ChunkedBitSet::<TestId>::new_empty(2548);
    assert_eq!(
        b2548,
        ChunkedBitSet {
            domain_size: 2548,
            chunks: Box::new([Chunk::Zeros, Chunk::Zeros]),
            marker: PhantomData
        }
    );
    assert_eq!(b2548.chunk_domain_size(0), 2048);
    assert_eq!(b2548.chunk_domain_size(1), 500);

    b2548.assert_valid();
    b2548.insert(TestId::from_usize(14));
    b2548.remove(TestId::from_usize(14));
    assert_eq!(b2548.chunks(), vec![Chunk::Zeros, Chunk::Zeros]);
    b2548.insert_all();
    for i in 0..2548 {
        assert!(b2548.contains(TestId::from_usize(i)));
    }
    assert_eq!(b2548.count(), 2548);
    assert_eq!(b2548.chunks(), vec![Chunk::Ones, Chunk::Ones]);
    b2548.assert_valid();

    //-----------------------------------------------------------------------

    let mut b4096 = ChunkedBitSet::<TestId>::new_empty(4096);
    assert_eq!(
        b4096,
        ChunkedBitSet {
            domain_size: 4096,
            chunks: Box::new([Chunk::Zeros, Chunk::Zeros]),
            marker: PhantomData
        }
    );
    assert_eq!(b4096.chunk_domain_size(0), 2048);
    assert_eq!(b4096.chunk_domain_size(1), 2048);

    b4096.assert_valid();
    for i in 0..4096 {
        assert!(!b4096.contains(TestId::from_usize(i)));
    }
    assert!(
        b4096.insert(TestId::from_usize(0))
            && b4096.insert(TestId::from_usize(4095))
            && !b4096.insert(TestId::from_usize(4095))
    );
    assert!(
        b4096.contains(TestId::from_usize(0))
            && !b4096.contains(TestId::from_usize(2047))
            && !b4096.contains(TestId::from_usize(2048))
            && b4096.contains(TestId::from_usize(4095))
    );
    #[rustfmt::skip]
    assert_eq!(
        b4096.chunks(),
        vec![
            Chunk::Mixed(1, Rc::new([
                1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
            ])),
            Chunk::Mixed(1, Rc::new([
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x8000_0000_0000_0000
            ])),
        ],
    );
    assert_eq!(b4096.count(), 2);
    b4096.assert_valid();

    //-----------------------------------------------------------------------

    let mut b10000 = ChunkedBitSet::<TestId>::new_empty(10000);
    assert_eq!(
        b10000,
        ChunkedBitSet {
            domain_size: 10000,
            chunks: Box::new([
                Chunk::Zeros,
                Chunk::Zeros,
                Chunk::Zeros,
                Chunk::Zeros,
                Chunk::Zeros,
            ]),
            marker: PhantomData,
        }
    );
    assert_eq!(b10000.chunk_domain_size(0), 2048);
    assert_eq!(b10000.chunk_domain_size(1), 2048);
    assert_eq!(b10000.chunk_domain_size(2), 2048);
    assert_eq!(b10000.chunk_domain_size(3), 2048);
    assert_eq!(b10000.chunk_domain_size(4), 1808);

    b10000.assert_valid();
    assert!(b10000.insert(TestId::from_usize(3000)) && b10000.insert(TestId::from_usize(5000)));
    #[rustfmt::skip]
    assert_eq!(
        b10000.chunks(),
        vec![
            Chunk::Zeros,
            Chunk::Mixed(1, Rc::new([
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x0100_0000_0000_0000, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            ])),
            Chunk::Mixed(1, Rc::new([
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x0100, 0,
                0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            ])),
            Chunk::Zeros,
            Chunk::Zeros,
        ],
    );
    let mut b10000b = ChunkedBitSet::<TestId>::new_empty(10000);
    b10000b.clone_from(&b10000);
    assert_eq!(b10000, b10000b);
    for i in 6000..7000 {
        b10000b.insert(TestId::from_usize(i));
    }
    assert_eq!(b10000b.count(), 1002);
    b10000b.assert_valid();
    b10000b.clone_from(&b10000);
    assert_eq!(b10000b.count(), 2);
    for i in 2000..8000 {
        b10000b.insert(TestId::from_usize(i));
    }
    b10000.union(&b10000b);
    assert_eq!(b10000.count(), 6000);
    b10000.union(&b10000b);
    assert_eq!(b10000.count(), 6000);
    b10000.assert_valid();
    b10000b.assert_valid();
}

fn with_elements_chunked(elements: &[usize], domain_size: usize) -> ChunkedBitSet<TestId> {
    let mut s = ChunkedBitSet::new_empty(domain_size);
    for &e in elements {
        assert!(s.insert(TestId::from_usize(e)));
    }
    s
}

#[test]
fn chunked_bitset_iter() {
    fn check_iter(bit: &ChunkedBitSet<TestId>, vec: &Vec<usize>) {
        // Test collecting via both `.next()` and `.fold()` calls, to make sure both are correct
        let mut collect_next = Vec::new();
        let bit_iter = bit.iter();
        for item in bit_iter {
            collect_next.push(item.as_usize());
        }
        assert_eq!(vec, &collect_next);

        let collect_fold = bit.iter().fold(Vec::new(), |mut words, item| {
            words.push(item.as_usize());
            words
        });
        assert_eq!(vec, &collect_fold);
    }

    // Empty
    let vec: Vec<usize> = Vec::new();
    let bit = with_elements_chunked(&vec, 9000);
    check_iter(&bit, &vec);

    // Filled
    let n = 10000;
    let vec: Vec<usize> = (0..n).collect();
    let bit = with_elements_chunked(&vec, n);
    check_iter(&bit, &vec);

    // Filled with trailing zeros
    let n = 10000;
    let vec: Vec<usize> = (0..n).collect();
    let bit = with_elements_chunked(&vec, 2 * n);
    check_iter(&bit, &vec);

    // Mixed
    let n = 12345;
    let vec: Vec<usize> = vec![0, 1, 2, 2010, 2047, 2099, 6000, 6002, 6004];
    let bit = with_elements_chunked(&vec, n);
    check_iter(&bit, &vec);
}

#[test]
fn grow() {
    let mut set: GrowableBitSet<TestId> = GrowableBitSet::with_capacity(65);
    for index in 0..65 {
        assert!(set.insert(TestId::from_usize(index)));
        assert!(!set.insert(TestId::from_usize(index)));
    }
    set.ensure(128);

    // Check if the bits set before growing are still set
    for index in 0..65 {
        assert!(set.contains(TestId::from_usize(index)));
    }

    // Check if the new bits are all un-set
    for index in 65..128 {
        assert!(!set.contains(TestId::from_usize(index)));
    }

    // Check that we can set all new bits without running out of bounds
    for index in 65..128 {
        assert!(set.insert(TestId::from_usize(index)));
        assert!(!set.insert(TestId::from_usize(index)));
    }
}

#[test]
fn matrix_intersection() {
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(200, 200);

    // (*) Elements reachable from both 2 and 65.

    matrix.insert(TestId::from_usize(2), TestId::from_usize(3));
    matrix.insert(TestId::from_usize(2), TestId::from_usize(6));
    matrix.insert(TestId::from_usize(2), TestId::from_usize(10)); // (*)
    matrix.insert(TestId::from_usize(2), TestId::from_usize(64)); // (*)
    matrix.insert(TestId::from_usize(2), TestId::from_usize(65));
    matrix.insert(TestId::from_usize(2), TestId::from_usize(130));
    matrix.insert(TestId::from_usize(2), TestId::from_usize(160)); // (*)

    matrix.insert(TestId::from_usize(64), TestId::from_usize(133));

    matrix.insert(TestId::from_usize(65), TestId::from_usize(2));
    matrix.insert(TestId::from_usize(65), TestId::from_usize(8));
    matrix.insert(TestId::from_usize(65), TestId::from_usize(10)); // (*)
    matrix.insert(TestId::from_usize(65), TestId::from_usize(64)); // (*)
    matrix.insert(TestId::from_usize(65), TestId::from_usize(68));
    matrix.insert(TestId::from_usize(65), TestId::from_usize(133));
    matrix.insert(TestId::from_usize(65), TestId::from_usize(160)); // (*)

    let intersection = matrix.intersect_rows(TestId::from_usize(2), TestId::from_usize(64));
    assert!(intersection.is_empty());

    let intersection = matrix.intersect_rows(TestId::from_usize(2), TestId::from_usize(65));
    assert_eq!(
        intersection,
        &[
            TestId::from_usize(10),
            TestId::from_usize(64),
            TestId::from_usize(160)
        ]
    );
}

#[test]
fn matrix_iter() {
    let mut matrix: BitMatrix<TestId, TestId> = BitMatrix::new(64, 100);
    matrix.insert(TestId::from_usize(3), TestId::from_usize(22));
    matrix.insert(TestId::from_usize(3), TestId::from_usize(75));
    matrix.insert(TestId::from_usize(2), TestId::from_usize(99));
    matrix.insert(TestId::from_usize(4), TestId::from_usize(0));
    matrix.union_rows(TestId::from_usize(3), TestId::from_usize(5));
    matrix.insert_all_into_row(TestId::from_usize(6));

    let expected = [99];
    let mut iter = expected.iter();
    for i in matrix.iter(TestId::from_usize(2)) {
        let j = *iter.next().unwrap();
        assert_eq!(i.as_usize(), j);
    }
    assert!(iter.next().is_none());

    let expected = [22, 75];
    let mut iter = expected.iter();
    assert_eq!(matrix.count(TestId::from_usize(3)), expected.len());
    for i in matrix.iter(TestId::from_usize(3)) {
        let j = *iter.next().unwrap();
        assert_eq!(i.as_usize(), j);
    }
    assert!(iter.next().is_none());

    let expected = [0];
    let mut iter = expected.iter();
    assert_eq!(matrix.count(TestId::from_usize(4)), expected.len());
    for i in matrix.iter(TestId::from_usize(4)) {
        let j = *iter.next().unwrap();
        assert_eq!(i.as_usize(), j);
    }
    assert!(iter.next().is_none());

    let expected = [22, 75];
    let mut iter = expected.iter();
    assert_eq!(matrix.count(TestId::from_usize(5)), expected.len());
    for i in matrix.iter(TestId::from_usize(5)) {
        let j = *iter.next().unwrap();
        assert_eq!(i.as_usize(), j);
    }
    assert!(iter.next().is_none());

    assert_eq!(matrix.count(TestId::from_usize(6)), 100);
    let mut count = 0;
    for (idx, i) in matrix.iter(TestId::from_usize(6)).enumerate() {
        assert_eq!(idx, i.as_usize());
        count += 1;
    }
    assert_eq!(count, 100);

    if let Some(i) = matrix.iter(TestId::from_usize(7)).next() {
        panic!("expected no elements in row, but contains element {i:?}");
    }
}

#[test]
fn sparse_matrix_iter() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    matrix.insert(TestId::from_usize(3), TestId::from_usize(22));
    matrix.insert(TestId::from_usize(3), TestId::from_usize(75));
    matrix.insert(TestId::from_usize(2), TestId::from_usize(99));
    matrix.insert(TestId::from_usize(4), TestId::from_usize(0));
    matrix.union_rows(TestId::from_usize(3), TestId::from_usize(5));

    let expected = [99];
    let mut iter = expected.iter();
    for i in matrix.iter(TestId::from_usize(2)) {
        let j = *iter.next().unwrap();
        assert_eq!(i.as_usize(), j);
    }
    assert!(iter.next().is_none());

    let expected = [22, 75];
    let mut iter = expected.iter();
    for i in matrix.iter(TestId::from_usize(3)) {
        let j = *iter.next().unwrap();
        assert_eq!(i.as_usize(), j);
    }
    assert!(iter.next().is_none());

    let expected = [0];
    let mut iter = expected.iter();
    for i in matrix.iter(TestId::from_usize(4)) {
        let j = *iter.next().unwrap();
        assert_eq!(i.as_usize(), j);
    }
    assert!(iter.next().is_none());

    let expected = [22, 75];
    let mut iter = expected.iter();
    for i in matrix.iter(TestId::from_usize(5)) {
        let j = *iter.next().unwrap();
        assert_eq!(i.as_usize(), j);
    }
    assert!(iter.next().is_none());
}

#[test]
fn sparse_matrix_operations() {
    let mut matrix: SparseBitMatrix<TestId, TestId> = SparseBitMatrix::new(100);
    matrix.insert(TestId::from_usize(3), TestId::from_usize(22));
    matrix.insert(TestId::from_usize(3), TestId::from_usize(75));
    matrix.insert(TestId::from_usize(2), TestId::from_usize(99));
    matrix.insert(TestId::from_usize(4), TestId::from_usize(0));

    let mut disjoint: DenseBitSet<TestId> = DenseBitSet::new_empty(100);
    disjoint.insert(TestId::from_usize(33));

    let mut superset = DenseBitSet::new_empty(100);
    superset.insert(TestId::from_usize(22));
    superset.insert(TestId::from_usize(75));
    superset.insert(TestId::from_usize(33));

    let mut subset = DenseBitSet::new_empty(100);
    subset.insert(TestId::from_usize(22));

    // SparseBitMatrix::remove
    {
        let mut matrix = matrix.clone();
        matrix.remove(TestId::from_usize(3), TestId::from_usize(22));
        assert!(
            !matrix
                .row(TestId::from_usize(3))
                .unwrap()
                .contains(TestId::from_usize(22))
        );
        matrix.remove(TestId::from_usize(0), TestId::from_usize(0));
        assert!(matrix.row(TestId::from_usize(0)).is_none());
    }

    // SparseBitMatrix::clear
    {
        let mut matrix = matrix.clone();
        matrix.clear(TestId::from_usize(3));
        assert!(
            !matrix
                .row(TestId::from_usize(3))
                .unwrap()
                .contains(TestId::from_usize(75))
        );
        matrix.clear(TestId::from_usize(0));
        assert!(matrix.row(TestId::from_usize(0)).is_none());
    }

    // SparseBitMatrix::intersect_row
    {
        let mut matrix = matrix.clone();
        assert!(!matrix.intersect_row(TestId::from_usize(3), &superset));
        assert!(matrix.intersect_row(TestId::from_usize(3), &subset));
        matrix.intersect_row(TestId::from_usize(0), &disjoint);
        assert!(matrix.row(TestId::from_usize(0)).is_none());
    }

    // SparseBitMatrix::subtract_row
    {
        let mut matrix = matrix.clone();
        assert!(!matrix.subtract_row(TestId::from_usize(3), &disjoint));
        assert!(matrix.subtract_row(TestId::from_usize(3), &subset));
        assert!(matrix.subtract_row(TestId::from_usize(3), &superset));
        matrix.intersect_row(TestId::from_usize(0), &disjoint);
        assert!(matrix.row(TestId::from_usize(0)).is_none());
    }

    // SparseBitMatrix::union_row
    {
        let mut matrix = matrix.clone();
        assert!(!matrix.union_row(TestId::from_usize(3), &subset));
        assert!(matrix.union_row(TestId::from_usize(3), &disjoint));
        matrix.union_row(TestId::from_usize(0), &disjoint);
        assert!(matrix.row(TestId::from_usize(0)).is_some());
    }
}

#[test]
fn dense_insert_range() {
    #[track_caller]
    fn check<R>(domain: usize, range: R)
    where
        R: RangeBounds<usize> + Clone + IntoIterator<Item = usize> + core::fmt::Debug,
    {
        let start = range.start_bound().cloned().map(TestId::from_usize);
        let end = range.end_bound().cloned().map(TestId::from_usize);

        let mut set = DenseBitSet::new_empty(domain);
        set.insert_range((start, end));
        for i in &set {
            assert!(range.contains(&i.as_usize()));
        }
        for i in range.clone() {
            assert!(
                set.contains(TestId::from_usize(i)),
                "{i} in {set:?}, inserted {range:?}"
            );
        }
    }

    check(300, 10..10);
    check(300, WORD_BITS..WORD_BITS * 2);
    check(300, WORD_BITS - 1..WORD_BITS * 2);
    check(300, WORD_BITS - 1..WORD_BITS);
    check(300, 10..100);
    check(300, 10..30);
    check(300, 0..5);
    check(300, 0..250);
    check(300, 200..250);

    check(300, 10..=10);
    check(300, WORD_BITS..=WORD_BITS * 2);
    check(300, WORD_BITS - 1..=WORD_BITS * 2);
    check(300, WORD_BITS - 1..=WORD_BITS);
    check(300, 10..=100);
    check(300, 10..=30);
    check(300, 0..=5);
    check(300, 0..=250);
    check(300, 200..=250);

    for i in 0..WORD_BITS * 2 {
        for j in i..WORD_BITS * 2 {
            check(WORD_BITS * 2, i..j);
            check(WORD_BITS * 2, i..=j);
            check(300, i..j);
            check(300, i..=j);
        }
    }
}

#[test]
fn dense_last_set_before() {
    fn easy(set: &DenseBitSet<TestId>, needle: impl RangeBounds<usize>) -> Option<TestId> {
        let mut last_leq = None;
        for e in set {
            if needle.contains(&e.as_usize()) {
                last_leq = Some(e);
            }
        }

        last_leq
    }

    #[track_caller]
    fn cmp(set: &DenseBitSet<TestId>, needle: impl RangeBounds<usize> + Clone + core::fmt::Debug) {
        let start = needle.start_bound().cloned().map(TestId::from_usize);
        let end = needle.end_bound().cloned().map(TestId::from_usize);

        assert_eq!(
            set.last_set_in((start, end)),
            easy(set, needle.clone()),
            "{needle:?} in {set:?}"
        );
    }
    let mut set = DenseBitSet::new_empty(300);
    cmp(&set, 50..=50);
    set.insert(TestId::from_usize(WORD_BITS));
    cmp(&set, WORD_BITS..=WORD_BITS);
    set.insert(TestId::from_usize(WORD_BITS - 1));
    cmp(&set, 0..WORD_BITS);
    cmp(&set, 0..=5);
    cmp(&set, 10..100);
    set.insert(TestId::from_usize(100));
    cmp(&set, 100..110);
    cmp(&set, 99..100);
    cmp(&set, 99..=100);

    for i in 0..=WORD_BITS * 2 {
        for j in i..=WORD_BITS * 2 {
            for k in 0..WORD_BITS * 2 {
                let mut set = DenseBitSet::new_empty(300);
                cmp(&set, i..j);
                cmp(&set, i..=j);
                set.insert(TestId::from_usize(k));
                cmp(&set, i..j);
                cmp(&set, i..=j);
            }
        }
    }
}

#[test]
fn dense_contains_any() {
    let mut set: DenseBitSet<TestId> = DenseBitSet::new_empty(300);
    assert!(!set.contains_any(TestId::from_usize(0)..TestId::from_usize(300)));
    set.insert_range(TestId::from_usize(10)..TestId::from_usize(20));
    set.insert_range(TestId::from_usize(60)..TestId::from_usize(70));
    set.insert_range(TestId::from_usize(150)..=TestId::from_usize(250));

    assert!(set.contains_any(TestId::from_usize(0)..TestId::from_usize(30)));
    assert!(set.contains_any(TestId::from_usize(5)..TestId::from_usize(100)));
    assert!(set.contains_any(TestId::from_usize(250)..=TestId::from_usize(255)));

    assert!(!set.contains_any(TestId::from_usize(20)..TestId::from_usize(59)));
    assert!(!set.contains_any(TestId::from_usize(256)..=TestId::from_usize(290)));

    set.insert(TestId::from_usize(22));
    assert!(set.contains_any(TestId::from_usize(20)..TestId::from_usize(59)));
}
