#![expect(
    clippy::float_cmp,
    reason = "exactness assertions are the point: in-place wrapping and lane order are \
              bit-precise contracts"
)]
#![expect(
    clippy::integer_division_remainder_used,
    reason = "alignment assertions take the pointer address modulo the SIMD alignment"
)]

use core::hash::{Hash, Hasher as _};
use std::hash::DefaultHasher;

use proptest::{prop_assert, prop_assert_eq, prop_assume, property_test, strategy::Strategy};

use crate::math::{AlignedVecN, BoxedDVecN, BoxedVecN, DVecN, VecN};

/// Deterministic, sign-varying components crossing multiple 8-lane chunks.
fn scattered<const N: usize>(offset: f32) -> [f32; N] {
    core::array::from_fn(|index| {
        let value = f32::from(u8::try_from(index % 200).expect("bounded by modulus"));

        (value - 100.0).mul_add(0.125, offset)
    })
}

/// Plain-f64 reference for every product-sum kernel under test.
fn reference_dot(left: &[f32], right: &[f64]) -> f64 {
    left.iter()
        .zip(right)
        .map(|(&narrow, &wide)| f64::from(narrow) * wide)
        .sum()
}

#[test]
fn is_finite_rejects_any_non_finite_component() {
    // N = 11 crosses one full 8-lane chunk plus a remainder. Index 3
    // poisons the lane path and index 9 poisons the remainder path.
    let finite: [f32; 11] = scattered(0.25);
    assert!(VecN::new(finite).is_finite());

    for position in [3, 9] {
        for poison in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
            let mut components = finite;
            components[position] = poison;
            assert!(
                !VecN::new(components).is_finite(),
                "{poison} at {position} should not be finite",
            );
        }
    }
}

#[test]
fn aligned_is_finite_matches_the_unaligned_answer() {
    let mut boxed = BoxedVecN::<11>::zero();
    boxed.as_array_mut().copy_from_slice(&scattered::<11>(-0.5));
    assert!(boxed.is_finite());

    for position in [2, 9] {
        boxed.as_array_mut().copy_from_slice(&scattered::<11>(-0.5));
        boxed.as_array_mut()[position] = f32::NAN;
        assert!(!boxed.is_finite(), "NaN at {position} should not be finite");
    }
}

#[test]
fn aligned_dot_wide_matches_f64_reference() {
    let narrow: [f32; 45] = scattered(0.25);
    let wide: [f64; 45] = core::array::from_fn(|index| {
        f64::from(u8::try_from(index % 100).expect("bounded by modulus")).mul_add(0.01, -0.3)
    });

    let mut boxed_narrow = BoxedVecN::<45>::zero();
    boxed_narrow.as_array_mut().copy_from_slice(&narrow);
    let boxed_wide = BoxedDVecN::new(DVecN::from_ref(&wide));

    let expected = reference_dot(&narrow, &wide);
    let actual = boxed_narrow.dot_wide(&boxed_wide);

    assert!(
        (actual - expected).abs() < 1e-12 * expected.abs().max(1.0),
        "{actual} vs {expected}",
    );
}

#[test]
fn dot_matches_f64_reference_across_chunk_sizes() {
    fn check<const N: usize>() {
        let left: [f32; N] = scattered(0.5);
        let right: [f32; N] = scattered(-1.25);
        let expected = reference_dot(&left, &right.map(f64::from));

        let actual = f64::from(VecN::new(left).dot(VecN::from_ref(&right)));
        assert!(
            (actual - expected).abs() <= expected.abs().mul_add(1e-6, 1e-6),
            "dot over {N}: {actual} vs {expected}",
        );
    }

    check::<0>();
    check::<3>();
    check::<8>();
    check::<11>();
    check::<19>();
    check::<512>();
}

#[test]
fn dot_accumulates_in_double_precision() {
    // A large product followed by many small ones: a naive f32 sum absorbs
    // the small products entirely (1e8 + 1 == 1e8 in f32), while the f64
    // accumulator keeps them and rounds once at the end.
    let mut left = [1.0_f32; 64];
    let mut right = [1.0_f32; 64];
    left[0] = 1e4;
    right[0] = 1e4;

    let naive: f32 = left
        .iter()
        .zip(&right)
        .map(|(&l_value, &r_value)| l_value * r_value)
        .sum();
    let exact = 1e8 + 63.0;

    assert_eq!(naive, 1e8, "the naive f32 sum must lose the tail");
    #[expect(
        clippy::cast_possible_truncation,
        reason = "test computes the reference rounding"
    )]
    let expected = exact as f32;
    assert_eq!(VecN::new(left).dot(VecN::from_ref(&right)), expected);
}

#[test]
fn norm_squared_matches_dot_with_self() {
    let components: [f32; 37] = scattered(2.0);
    let vec = VecN::new(components);

    assert_eq!(vec.norm_squared(), vec.dot(&vec));
    assert!(vec.norm_squared() >= 0.0);
    assert_eq!(VecN::new([0.0_f32; 8]).norm_squared(), 0.0);
}

#[test]
fn cosine_distance_matches_known_geometry() {
    let mut x_axis = [0.0_f32; 16];
    let mut y_axis = [0.0_f32; 16];
    x_axis[0] = 2.0;
    y_axis[1] = 0.5;

    // Orthogonal: one. Parallel (any positive scaling): zero. Opposite: two.
    assert_eq!(
        VecN::new(x_axis).cosine_distance(VecN::from_ref(&y_axis)),
        1.0,
    );
    assert_eq!(
        VecN::new(x_axis).cosine_distance(VecN::from_ref(&x_axis.map(|value| value * 3.0))),
        0.0,
    );
    assert_eq!(
        VecN::new(x_axis).cosine_distance(VecN::from_ref(&x_axis.map(|value| -value))),
        2.0,
    );
}

#[test]
fn cosine_distance_of_zero_vectors_follows_the_contract() {
    let zero = VecN::new([0.0_f32; 11]);
    let unit = VecN::new(scattered::<11>(1.0));

    assert_eq!(zero.cosine_distance(&zero), 0.0);
    assert_eq!(zero.cosine_distance(&unit), 1.0);
    assert_eq!(unit.cosine_distance(&zero), 1.0);
}

#[test]
fn cosine_distance_matches_f64_reference() {
    let left: [f32; 100] = scattered(0.75);
    let right: [f32; 100] = scattered(-0.5);

    let dot = reference_dot(&left, &right.map(f64::from));
    let left_norm = reference_dot(&left, &left.map(f64::from));
    let right_norm = reference_dot(&right, &right.map(f64::from));
    let expected = (1.0 - dot / (left_norm * right_norm).sqrt()).clamp(0.0, 2.0);

    let actual = f64::from(VecN::new(left).cosine_distance(VecN::from_ref(&right)));
    assert!(
        (actual - expected).abs() < 1e-6,
        "cosine distance: {actual} vs {expected}",
    );
}

#[test]
fn dot_wide_matches_f64_reference() {
    let narrow: [f32; 45] = scattered(0.25);
    let wide: [f64; 45] = core::array::from_fn(|index| {
        f64::from(u8::try_from(index % 100).expect("bounded by modulus")).mul_add(0.01, -0.3)
    });

    let expected = reference_dot(&narrow, &wide);
    let actual = VecN::new(narrow).dot_wide(DVecN::from_ref(&wide));

    assert!(
        (actual - expected).abs() < 1e-12 * expected.abs().max(1.0),
        "dot_wide: {actual} vs {expected}",
    );
}

#[test]
fn aligned_kernels_agree_with_vecn() {
    let left: [f32; 24] = scattered(1.5);
    let right: [f32; 24] = scattered(-2.0);
    let boxed_left = BoxedVecN::new(VecN::from_ref(&left));
    let boxed_right = BoxedVecN::new(VecN::from_ref(&right));

    assert_eq!(
        boxed_left.dot(&boxed_right),
        VecN::new(left).dot(VecN::from_ref(&right)),
    );
    assert_eq!(boxed_left.norm_squared(), VecN::new(left).norm_squared());
    assert_eq!(
        boxed_left.cosine_distance(&boxed_right),
        VecN::new(left).cosine_distance(VecN::from_ref(&right)),
    );
}

/// Components bounded to the well-conditioned `-1e3..1e3` range, in the fixed dimension 19.
///
/// Two full 8-lane chunks plus a remainder of three, so every fold exercises both the batched body
/// and the remainder.
fn components_strategy() -> impl Strategy<Value = [f32; 19]> {
    proptest::array::uniform19(-1e3_f32..1e3)
}

/// The dot product commutes bit for bit.
///
/// Both orders accumulate the same products in the same order.
#[property_test]
fn dot_is_commutative(
    #[strategy = components_strategy()] left: [f32; 19],
    #[strategy = components_strategy()] right: [f32; 19],
) {
    prop_assert_eq!(
        VecN::new(left).dot(VecN::from_ref(&right)),
        VecN::new(right).dot(VecN::from_ref(&left)),
    );
}

/// The squared norm is non-negative: it accumulates squares.
#[property_test]
fn norm_squared_is_non_negative(#[strategy = components_strategy()] components: [f32; 19]) {
    prop_assert!(VecN::new(components).norm_squared() >= 0.0);
}

/// Cosine distance lies in `[0, 2]`.
///
/// The distance from a non-zero vector to itself is zero up to rounding.
#[property_test]
fn cosine_distance_stays_in_range_and_vanishes_on_self(
    #[strategy = components_strategy()] left: [f32; 19],
    #[strategy = components_strategy()] right: [f32; 19],
) {
    let left = VecN::new(left);
    let right = VecN::new(right);

    let distance = left.cosine_distance(&right);
    prop_assert!((0.0..=2.0).contains(&distance));

    prop_assume!(left.norm_squared() > 0.0);
    prop_assert!(left.cosine_distance(&left) < 1e-6);
}

/// The fused SIMD dot product matches a plain-f64 reference loop.
///
/// The tolerance is relative, plus a small absolute floor for cancelled sums.
#[property_test]
fn dot_matches_a_plain_f64_reference(
    #[strategy = components_strategy()] left: [f32; 19],
    #[strategy = components_strategy()] right: [f32; 19],
) {
    let expected = reference_dot(&left, &right.map(f64::from));

    let actual = f64::from(VecN::new(left).dot(VecN::from_ref(&right)));
    prop_assert!(
        (actual - expected).abs() <= expected.abs().mul_add(1e-6, 1e-3),
        "dot {} vs reference {}",
        actual,
        expected,
    );
}

/// The checking slice wrapper refuses an offset view of aligned storage.
///
/// Eight `f32` components fill exactly one `f32x8` group, so the width condition holds and only
/// the address decides. One component in, the view sits four bytes past the boundary.
#[test]
fn aligned_from_slice_mut_checks_the_address() {
    let mut boxed = BoxedVecN::new(&VecN::new([7.0_f32; 16]));
    let array: &mut [f32; 16] = boxed.as_array_mut();

    assert!(AlignedVecN::<8>::from_slice_mut(&mut array[..8]).is_some());
    assert!(AlignedVecN::<8>::from_slice_mut(&mut array[1..9]).is_none());
}

/// Hashes one value with the std default hasher.
fn hash_of(value: impl Hash) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

/// The tests the `miri` nextest profile selects.
///
/// Each test here wraps, boxes or lane-splits component storage in place and checks the alignment
/// invariant those views carry. The profile selects by module path, so moving a test in or out of
/// this module is the whole edit.
mod miri {
    use core::{
        iter,
        simd::{Simd, f32x8, num::SimdFloat as _},
    };

    use super::{hash_of, scattered};
    use crate::math::{AlignedVecN, BoxedVecN, VecN, test_alloc::CountingAllocator};

    #[test]
    fn boxed_vecn_zero_is_all_zeros_and_writable() {
        let mut vector = BoxedVecN::<24>::zero();
        assert_eq!(*vector.as_array(), [0.0_f32; 24]);

        // The loop fills the buffer in place, the intended use of `zero`.
        for (index, slot) in vector.as_array_mut().iter_mut().enumerate() {
            *slot = f32::from(u8::try_from(index).expect("test dimensions are small"));
        }
        assert_eq!(vector.as_array()[23], 23.0);
        assert_eq!(
            vector.norm_squared(),
            VecN::new(*vector.as_array()).norm_squared()
        );
    }

    #[test]
    fn boxed_vecn_is_aligned_and_preserves_contents() {
        let source: [f32; 24] = core::array::from_fn(|index| {
            f32::from(u8::try_from(index).expect("test dimensions are small"))
        });

        // Allocate sixteen boxes so one aligned pointer cannot be luck.
        let boxes: Vec<BoxedVecN<24>> =
            iter::repeat_with(|| BoxedVecN::new(VecN::from_ref(&source)))
                .take(16)
                .collect();

        for boxed in &boxes {
            assert_eq!(boxed.as_array(), &source);
            assert_eq!(
                boxed.as_array().as_ptr().addr() % align_of::<core::simd::f32x8>(),
                0,
                "boxed storage must be aligned for f32x8",
            );
        }
    }

    #[test]
    fn vecn_wraps_in_place() {
        let mut source = [1.0_f32; 8];

        // The wrapper must reuse the storage, not copy it.
        assert_eq!(
            core::ptr::from_ref(VecN::from_ref(&source)).addr(),
            source.as_ptr().addr(),
        );

        assert_eq!(
            core::ptr::from_mut(VecN::from_mut(&mut source)).addr(),
            source.as_mut_ptr().addr(),
        );
        assert_eq!(VecN::from_ref(&source), VecN::from_ref(&[1.0; 8]));
    }

    /// The slice wrapper reinterprets a borrowed slice of arrays in place, in both directions.
    #[test]
    fn vecn_wrap_slice_wraps_in_place() {
        let mut source = [[1.0_f32; 8], [2.0_f32; 8], [3.0_f32; 8]];

        let wrapped = VecN::wrap_slice(&source);
        assert_eq!(
            core::ptr::from_ref(wrapped).cast::<u8>(),
            core::ptr::from_ref(&source).cast::<u8>(),
            "wrap_slice must reuse the source storage",
        );
        assert_eq!(wrapped[1], VecN::from_ref(&[2.0; 8]).to_owned());

        let wrapped_mut = VecN::wrap_slice_mut(&mut source);
        wrapped_mut[1] = *VecN::from_ref(&[9.0; 8]);
        assert_eq!(
            source[1], [9.0; 8],
            "a write through the mut wrapper must land in the source"
        );
    }

    #[test]
    fn lanes_iterate_lane_groups_in_order() {
        let source: [f32; 16] = core::array::from_fn(|index| {
            f32::from(u8::try_from(index).expect("test dimensions are small"))
        });
        let boxed = BoxedVecN::new(VecN::from_ref(&source));

        let (lanes, remainder) = boxed.lanes();
        assert!(remainder.is_empty());
        assert_eq!(
            lanes.iter().map(|lane| lane.to_array()).collect::<Vec<_>>(),
            [
                [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0],
                [8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0],
            ],
        );

        let maximum = lanes
            .iter()
            .map(|lane| lane.reduce_max())
            .fold(f32::MIN, f32::max);
        assert_eq!(maximum, 15.0);
    }

    #[test]
    fn lanes_split_off_partial_group_as_remainder() {
        let source: [f32; 11] = core::array::from_fn(|index| {
            f32::from(u8::try_from(index).expect("test dimensions are small"))
        });
        let boxed = BoxedVecN::new(VecN::from_ref(&source));

        let (lanes, remainder) = boxed.lanes();
        assert_eq!(lanes.len(), 1);
        assert_eq!(
            lanes[0].to_array(),
            [0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0]
        );
        assert_eq!(remainder, [8.0, 9.0, 10.0]);
    }

    #[test]
    fn aligned_vecn_rejects_misaligned_storage() {
        let boxed = BoxedVecN::new(&VecN::new([0.0_f32; 16]));

        // The box's own storage meets the f32x8 alignment, so wrapping it succeeds.
        assert!(AlignedVecN::<16>::from_ref(boxed.as_array()).is_some());

        // One component past an aligned base breaks the f32x8 alignment.
        let slice = &boxed.as_array()[1..9];
        let misaligned: &[f32; 8] = slice.try_into().expect("slice has length 8");
        assert!(AlignedVecN::<8>::from_ref(misaligned).is_none());
    }

    #[test]
    fn boxed_vecn_clone_is_deep_and_stays_aligned() {
        let original = BoxedVecN::from([1.0_f32, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0]);
        let clone = original.clone();

        assert_eq!(clone, original);
        assert_ne!(
            clone.as_array().as_ptr().addr(),
            original.as_array().as_ptr().addr(),
            "a clone must own its own buffer",
        );
        assert_eq!(
            clone.as_array().as_ptr().addr() % align_of::<core::simd::f32x8>(),
            0,
        );

        // The clone must survive its source.
        drop(original);
        assert_eq!(clone.as_array()[7], 8.0);
    }

    #[test]
    fn boxed_vecn_clone_from_reuses_the_allocation() {
        let source = BoxedVecN::from([9.0_f32; 8]);
        let mut target = BoxedVecN::from([0.0_f32; 8]);
        let address = target.as_array().as_ptr().addr();

        target.clone_from(&source);

        assert_eq!(target, source);
        assert_eq!(
            target.as_array().as_ptr().addr(),
            address,
            "clone_from must reuse the existing buffer",
        );
    }

    #[test]
    fn boxed_vecn_conversions_agree() {
        let components = [1.0_f32, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0];

        let from_array = BoxedVecN::from(components);
        let from_vecn = BoxedVecN::from(VecN::from_ref(&components));

        assert_eq!(from_array, from_vecn);
        assert_eq!(from_array.as_array(), &components);
        assert_eq!(
            AsRef::<AlignedVecN<8>>::as_ref(&from_array).as_array(),
            &components,
        );
    }

    #[test]
    fn lanes_mut_writes_back_in_place() {
        let mut boxed = BoxedVecN::from([1.0_f32; 11]);

        let (lanes, remainder) = boxed.lanes_mut();
        for lane in lanes.iter_mut() {
            *lane *= Simd::splat(2.0);
        }
        remainder.fill(5.0);

        // The writes must be visible through the shared view, in place.
        let (lanes, remainder) = boxed.lanes();
        assert_eq!(lanes[0].to_array(), [2.0; 8]);
        assert_eq!(remainder, [5.0; 3]);
        assert_eq!(boxed.as_array()[..8], [2.0; 8]);
    }

    #[test]
    fn try_as_aligned_agrees_between_shared_and_mutable() {
        let mut boxed = BoxedVecN::from([3.0_f32; 8]);

        // Boxed storage meets the f32x8 alignment, so both reinterpretations succeed.
        assert!(VecN::from_ref(boxed.as_array()).try_as_aligned().is_some());

        let vecn = VecN::from_mut(boxed.as_array_mut());
        let aligned = vecn.try_as_aligned_mut().expect("boxed storage is aligned");
        aligned.as_array_mut()[0] = 7.0;

        assert_eq!(boxed.as_array()[0], 7.0);
    }

    #[test]
    fn from_slice_yields_every_row_aligned_and_in_place() {
        let source: [f32; 32] = scattered(0.5);
        let matrix = BoxedVecN::from(source);

        let rows =
            AlignedVecN::<8>::from_slice(matrix.as_array()).expect("boxed storage is aligned");
        assert_eq!(rows.len(), 4);
        for (index, row) in rows.iter().enumerate() {
            assert!(
                row.as_array().as_ptr().is_aligned_to(align_of::<f32x8>()),
                "row {index} must satisfy the alignment invariant",
            );
            assert_eq!(row.as_array()[..], source[index * 8..(index + 1) * 8]);
        }

        // The rows alias the source storage: no copy happened.
        assert!(core::ptr::eq(
            rows.as_ptr().cast::<f32>(),
            matrix.as_array().as_ptr(),
        ));
    }

    #[test]
    fn from_slice_rejects_what_would_break_the_invariant() {
        let matrix = BoxedVecN::<32>::zero();
        let components = matrix.as_array().as_slice();

        // A zero dimension fails compilation outright; only the runtime
        // conditions remain to certify.

        // A partial trailing row cannot be a vector.
        assert!(AlignedVecN::<12>::from_slice(components).is_none());

        // One component past an aligned base breaks the alignment: a single
        // `f32` is narrower than `f32x8`'s alignment on every supported target.
        assert!(AlignedVecN::<8>::from_slice(&components[1..25]).is_none());

        // An empty slice at an aligned base yields zero rows.
        let empty = AlignedVecN::<8>::from_slice(&components[..0]).expect("zero rows are valid");
        assert!(empty.is_empty());
    }

    /// `Hash` follows the components and `Debug` prints them.
    #[test]
    fn boxed_hash_and_debug_follow_the_components() {
        let low = BoxedVecN::new(&VecN::new([0.5_f32, 1.5]));
        let high = BoxedVecN::new(&VecN::new([1.0_f32, 1.5]));

        // A fixed-key DefaultHasher makes distinctness deterministic for fixed inputs.
        assert_ne!(hash_of(&low), hash_of(&high));
        assert_eq!(format!("{low:?}"), "AlignedVecN([0.5, 1.5])");
    }

    /// Dropping a box returns its buffer to the allocator that provided it.
    #[test]
    fn boxed_drop_returns_the_buffer_to_its_allocator() {
        let alloc = CountingAllocator::new();

        let boxed = BoxedVecN::try_new_in(&VecN::new([1.0_f32, 2.0, 3.0]), &alloc)
            .expect("the global allocator provides a three-component buffer");
        assert_eq!(alloc.deallocations(), 0);

        drop(boxed);
        assert_eq!(alloc.deallocations(), 1);
    }
}
