#![expect(
    clippy::float_cmp,
    reason = "exactness assertions are the point: in-place wrapping and lane order are \
              bit-precise contracts"
)]

use core::{
    iter,
    simd::{Simd, num::SimdFloat as _},
};

use crate::math::{AlignedVecN, BoxedVecN, VecN};

#[test]
fn boxed_vecn_is_aligned_and_preserves_contents() {
    let source: [f32; 24] = core::array::from_fn(|index| {
        f32::from(u8::try_from(index).expect("test dimensions are small"))
    });

    // Allocate several boxes so one aligned pointer cannot be luck.
    let boxes: Vec<BoxedVecN<24>> = iter::repeat_with(|| BoxedVecN::new(VecN::from_ref(&source)))
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

    // The box's own storage is aligned, so wrapping it succeeds.
    assert!(AlignedVecN::<16>::from_ref(boxed.as_array()).is_some());

    // One component past an aligned base is misaligned for f32x8.
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

    // Boxed storage is aligned, so both reinterpretations succeed.
    assert!(VecN::from_ref(boxed.as_array()).try_as_aligned().is_some());

    let vecn = VecN::from_mut(boxed.as_array_mut());
    let aligned = vecn.try_as_aligned_mut().expect("boxed storage is aligned");
    aligned.as_array_mut()[0] = 7.0;

    assert_eq!(boxed.as_array()[0], 7.0);
}
