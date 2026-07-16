#![expect(
    clippy::float_cmp,
    reason = "exactness assertions are the point: lane order, in-place wrapping, and inverse \
              negation are bit-precise contracts"
)]

use core::{
    iter,
    simd::{Simd, num::SimdFloat as _},
};

use super::{
    AlignedVecN, BoxedVecN, Rotation, Transform, Translation, Vec2, Vec2x4, Vec2x4T, VecN,
    kernel::mul_add_f32x4,
};

const POINTS: [Vec2; 4] = [
    Vec2::new(1.0, 5.0),
    Vec2::new(2.0, 6.0),
    Vec2::new(3.0, 7.0),
    Vec2::new(4.0, 8.0),
];

#[track_caller]
fn assert_vec2_close(actual: Vec2, expected: Vec2) {
    // Tolerance scales with magnitude: a few dozen ulps absorbs the
    // rounding of trigonometry, FMA contraction, and inverse round trips.
    let tolerance = |reference: f32| 32.0 * f32::EPSILON * reference.abs().max(1.0);

    assert!(
        (actual.x() - expected.x()).abs() < tolerance(expected.x())
            && (actual.y() - expected.y()).abs() < tolerance(expected.y()),
        "expected {expected:?}, got {actual:?}"
    );
}

#[test]
fn vec2_accessors_and_indexing() {
    let vec = Vec2::new(1.5, -2.5);

    assert_eq!(vec.x(), 1.5);
    assert_eq!(vec.y(), -2.5);
    assert_eq!(vec[0], vec.x());
    assert_eq!(vec[1], vec.y());
    assert_eq!(<[f32; 2]>::from(vec), [1.5, -2.5]);
    assert_eq!(Vec2::from([1.5, -2.5]), vec);
}

#[test]
#[should_panic(expected = "index out of bounds")]
fn vec2_index_out_of_bounds() {
    let _: f32 = Vec2::new(0.0, 0.0)[2];
}

#[test]
fn transposed_deinterleaves_by_axis() {
    let batch = Vec2x4T::from(POINTS);

    assert_eq!(batch.xs().to_array(), [1.0, 2.0, 3.0, 4.0]);
    assert_eq!(batch.ys().to_array(), [5.0, 6.0, 7.0, 8.0]);
    assert_eq!(
        batch.to_simd().to_array(),
        [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0],
    );
}

#[test]
fn natural_preserves_interleaved_order() {
    let batch = Vec2x4::from(POINTS);

    assert_eq!(
        batch.to_simd().to_array(),
        [1.0, 5.0, 2.0, 6.0, 3.0, 7.0, 4.0, 8.0],
    );
    assert_eq!(<[Vec2; 4]>::from(batch), POINTS);
}

#[test]
fn batch_getters_agree_across_layouts() {
    let natural = Vec2x4::from(POINTS);
    let transposed = Vec2x4T::from(POINTS);

    for (index, point) in POINTS.into_iter().enumerate() {
        assert_eq!(natural.get(index), point);
        assert_eq!(natural[index], point);
        assert_eq!(transposed.get(index), point);
    }
}

#[test]
#[should_panic(expected = "index out of bounds")]
fn natural_index_out_of_bounds() {
    let _: Vec2 = Vec2x4::from(POINTS)[4];
}

#[test]
fn layout_conversions_round_trip() {
    let natural = Vec2x4::from(POINTS);
    let transposed = Vec2x4T::from(POINTS);

    assert_eq!(Vec2x4::from(transposed), natural);
    assert_eq!(Vec2x4T::from(natural), transposed);
    assert_eq!(Vec2x4::from(Vec2x4T::from(natural)), natural);
}

#[test]
fn simd_conversions_round_trip() {
    let natural = Vec2x4::from(POINTS);
    let transposed = Vec2x4T::from(POINTS);

    assert_eq!(Vec2x4::from(natural.to_simd()), natural);
    assert_eq!(Vec2x4T::from(transposed.to_simd()), transposed);
}

#[test]
fn from_lanes_inverts_lane_extraction() {
    let batch = Vec2x4T::from(POINTS);

    assert_eq!(Vec2x4T::from_lanes(batch.xs(), batch.ys()), batch);
}

#[test]
fn identity_maps_vectors_to_themselves() {
    let vec = Vec2::new(3.0, -4.0);

    assert_eq!(Transform::IDENTITY.apply(vec), vec);
    assert_eq!(
        Transform::IDENTITY.apply_x4(Vec2x4T::from(POINTS)),
        Vec2x4T::from(POINTS),
    );
}

#[test]
fn scale_translation_and_rotation() {
    let scale = Transform::from_scale(Vec2::new(2.0, 3.0));
    assert_eq!(scale.apply(Vec2::new(1.0, 1.0)), Vec2::new(2.0, 3.0));

    let translation = Transform::from_translation(Vec2::new(-1.0, 4.0));
    assert_eq!(translation.apply(Vec2::new(1.0, 1.0)), Vec2::new(0.0, 5.0));

    let quarter_turn =
        Transform::from_rotation(Rotation::from_radians(core::f32::consts::FRAC_PI_2));
    assert_vec2_close(quarter_turn.apply(Vec2::new(1.0, 0.0)), Vec2::new(0.0, 1.0));
    assert_vec2_close(
        quarter_turn.apply(Vec2::new(0.0, 1.0)),
        Vec2::new(-1.0, 0.0),
    );
}

#[test]
fn then_composes_in_application_order() {
    let scale = Transform::from_scale(Vec2::new(2.0, 2.0));
    let translation = Transform::from_translation(Vec2::new(10.0, 0.0));
    let vec = Vec2::new(3.0, 4.0);

    // Scale first, then translate: (6, 8) + (10, 0).
    assert_eq!(scale.then(translation).apply(vec), Vec2::new(16.0, 8.0));
    // Translate first, then scale: (13, 4) * 2.
    assert_eq!(translation.then(scale).apply(vec), Vec2::new(26.0, 8.0));
}

#[test]
fn composition_matches_sequential_application() {
    let first = Transform::from_rotation(Rotation::from_radians(0.7));
    let second = Transform::from_scale(Vec2::new(1.5, -0.5))
        .then(Transform::from_translation(Vec2::new(3.0, -2.0)));
    let composed = first.then(second);

    for point in POINTS {
        assert_vec2_close(composed.apply(point), second.apply(first.apply(point)));
    }
}

#[test]
fn apply_x4_matches_scalar_apply() {
    let transform = Transform::from_rotation(Rotation::from_radians(1.2))
        .then(Transform::from_scale(Vec2::new(0.5, 2.0)))
        .then(Transform::from_translation(Vec2::new(-7.0, 0.25)));

    let batch = transform.apply_x4(Vec2x4T::from(POINTS));

    // FMA fuses the rounding of multiply and add, so the SIMD path may
    // differ from the scalar path by one unit in the last place.
    for (index, point) in POINTS.into_iter().enumerate() {
        assert_vec2_close(batch.get(index), transform.apply(point));
    }
}

#[test]
fn rotation_composition_adds_angles() {
    let first = Rotation::from_radians(0.3);
    let second = Rotation::from_radians(0.9);
    let composed = first.then(second);
    let direct = Rotation::from_radians(1.2);

    assert!((composed.cos() - direct.cos()).abs() < 1e-6);
    assert!((composed.sin() - direct.sin()).abs() < 1e-6);
    assert!((composed.radians() - 1.2).abs() < 1e-6);
}

#[test]
fn rotation_inverse_is_exact_negation() {
    let rotation = Rotation::from_radians(0.7);
    let inverse = rotation.inverse();

    // The inversion itself introduces no rounding.
    assert_eq!(inverse.cos(), rotation.cos());
    assert_eq!(inverse.sin(), -rotation.sin());

    let vec = Vec2::new(3.0, -4.0);
    assert_vec2_close(inverse.apply(rotation.apply(vec)), vec);
}

#[test]
fn rotation_apply_x4_matches_apply() {
    let rotation = Rotation::from_radians(2.1);
    let batch = rotation.apply_x4(Vec2x4T::from(POINTS));

    for (index, point) in POINTS.into_iter().enumerate() {
        assert_vec2_close(batch.get(index), rotation.apply(point));
    }
}

#[test]
fn translation_composes_and_inverts_exactly() {
    let translation = Translation::new(10.0, -2.5).then(Translation::new(0.5, 4.0));

    assert_eq!(translation.vector(), Vec2::new(10.5, 1.5));
    assert_eq!(translation.apply(Vec2::new(1.0, 1.0)), Vec2::new(11.5, 2.5),);
    assert_eq!(
        translation
            .inverse()
            .apply(translation.apply(Vec2::new(1.0, 1.0))),
        Vec2::new(1.0, 1.0),
    );
    assert_eq!(
        translation.then(translation.inverse()),
        Translation::IDENTITY,
    );
}

#[test]
fn translation_apply_x4_matches_apply() {
    let translation = Translation::new(-3.5, 0.25);
    let batch = translation.apply_x4(Vec2x4T::from(POINTS));

    for (index, point) in POINTS.into_iter().enumerate() {
        assert_eq!(batch.get(index), translation.apply(point));
    }
}

#[test]
fn widening_to_transform_preserves_behavior() {
    let rotation = Rotation::from_radians(0.4);
    let translation = Translation::new(5.0, -1.0);

    for point in POINTS {
        assert_vec2_close(
            Transform::from(rotation).apply(point),
            rotation.apply(point),
        );
        assert_eq!(
            Transform::from(translation).apply(point),
            translation.apply(point),
        );
    }
}

#[test]
fn transform_inverse_round_trips() {
    let transform = Transform::from_rotation(Rotation::from_radians(0.6))
        .then(Transform::from_scale(Vec2::new(2.0, 0.5)))
        .then(Transform::from_translation(Vec2::new(-4.0, 9.0)));
    let inverse = transform.inverse().expect("transform is invertible");

    for point in POINTS {
        assert_vec2_close(inverse.apply(transform.apply(point)), point);
        assert_vec2_close(transform.apply(inverse.apply(point)), point);
    }
}

#[test]
fn transform_inverse_rejects_collapsed_axes() {
    assert!(
        Transform::from_scale(Vec2::new(0.0, 1.0))
            .inverse()
            .is_none()
    );
    assert!(
        Transform::from_scale(Vec2::new(1.0, 0.0))
            .inverse()
            .is_none()
    );
    assert!(
        Transform::from_cols(
            Vec2::new(1.0, 2.0),
            Vec2::new(2.0, 4.0), // linearly dependent columns
            Vec2::new(0.0, 0.0),
        )
        .inverse()
        .is_none()
    );
}

#[test]
fn renormalize_removes_composition_drift() {
    let step = Rotation::from_radians(1e-3);

    // Walk once around the circle in small steps to accumulate drift.
    let mut chained = Rotation::IDENTITY;
    for _ in 0..6283 {
        chained = chained.then(step);
    }

    let norm = |rotation: Rotation| {
        rotation
            .cos()
            .mul_add(rotation.cos(), rotation.sin() * rotation.sin())
    };

    let renormalized = chained.renormalize();
    assert!(
        (norm(renormalized) - 1.0).abs() <= (norm(chained) - 1.0).abs(),
        "renormalizing must not move the vector further off the unit circle",
    );
    assert!((norm(renormalized) - 1.0).abs() < 4.0 * f32::EPSILON);
    // The angle must survive: after ~2 pi the rotation is nearly identity.
    assert!((renormalized.radians()).abs() < 1e-2);
}

#[test]
fn then_widens_rotation_and_translation() {
    // Mixed composition against hand-computed values: scale (3, 4) by 2
    // to (6, 8), translate to (7, 8), quarter-turn to (-8, 7).
    let transform = Transform::from_scale(Vec2::new(2.0, 2.0))
        .then(Translation::new(1.0, 0.0))
        .then(Rotation::from_radians(core::f32::consts::FRAC_PI_2));

    assert_vec2_close(transform.apply(Vec2::new(3.0, 4.0)), Vec2::new(-8.0, 7.0));
}

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

#[test]
fn kernel_mul_add_matches_scalar() {
    let lhs = Simd::from_array([1.0, -2.0, 0.5, 8.0]);
    let rhs = Simd::from_array([3.0, 0.25, -4.0, 0.0]);
    let accumulator = Simd::from_array([0.5, 0.5, 0.5, 0.5]);

    let result = mul_add_f32x4(lhs, rhs, accumulator).to_array();

    for lane in 0..4 {
        let expected = f32::mul_add(lhs[lane], rhs[lane], accumulator[lane]);
        assert!(
            (result[lane] - expected).abs() < 1e-6,
            "lane {lane}: expected {expected}, got {}",
            result[lane]
        );
    }
}
