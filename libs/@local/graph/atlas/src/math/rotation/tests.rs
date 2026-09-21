use proptest::{prop_assert, property_test, strategy::Strategy};

use crate::math::{
    Rotation, Vec2, Vec2x4T, positive,
    tests::{POINTS, assert_vec2_close},
};

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
fn rotation_apply_turns_a_positive_angle_counterclockwise() {
    let quarter_turn = Rotation::from_radians(core::f32::consts::FRAC_PI_2);

    assert_vec2_close(quarter_turn.apply(Vec2::new(1.0, 0.0)), Vec2::new(0.0, 1.0));
    assert_vec2_close(
        quarter_turn.apply(Vec2::new(0.0, 1.0)),
        Vec2::new(-1.0, 0.0),
    );
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
fn renormalize_removes_composition_drift() {
    let step = Rotation::from_radians(1e-3);

    // 6283 steps of approximately 10⁻³ radians make nearly one full turn
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
    // 6.283 radians is about 0.000185 radians short of 2π
    assert!((renormalized.radians()).abs() < 1e-2);
}

/// Generates finite angles within a few turns of zero.
fn angle() -> impl Strategy<Value = f32> {
    -16.0_f32..16.0
}

/// Generates vectors with coordinates in `-1e5..1e5`.
///
/// This range keeps the tested products and squared lengths finite.
fn vec2_strategy() -> impl Strategy<Value = Vec2> {
    (-1e5_f32..1e5, -1e5_f32..1e5).prop_map(|(x, y)| Vec2::new(x, y))
}

#[property_test]
fn apply_preserves_length(
    #[strategy = angle()] radians: f32,
    #[strategy = vec2_strategy()] vec: Vec2,
) {
    let rotated = Rotation::from_radians(radians).apply(vec);

    let length = vec.length();
    prop_assert!(
        (rotated.length() - length).abs() <= 16.0 * f32::EPSILON * length.at_least(positive!(1.0)),
        "|{:?}| = {} became {}",
        vec,
        length,
        rotated.length(),
    );
}

#[property_test]
fn then_matches_sequential_application(
    #[strategy = angle()] first_radians: f32,
    #[strategy = angle()] second_radians: f32,
    #[strategy = vec2_strategy()] vec: Vec2,
) {
    let first = Rotation::from_radians(first_radians);
    let second = Rotation::from_radians(second_radians);

    let composed = first.then(second).apply(vec);
    let sequential = second.apply(first.apply(vec));

    let tolerance = 32.0 * f32::EPSILON * vec.length().at_least(positive!(1.0));
    prop_assert!(
        (composed.x() - sequential.x()).abs() <= tolerance
            && (composed.y() - sequential.y()).abs() <= tolerance,
        "composed {:?} vs sequential {:?}",
        composed,
        sequential,
    );
}

#[property_test]
fn inverse_undoes_apply(
    #[strategy = angle()] radians: f32,
    #[strategy = vec2_strategy()] vec: Vec2,
) {
    let rotation = Rotation::from_radians(radians);

    let round_tripped = rotation.inverse().apply(rotation.apply(vec));

    let tolerance = 32.0 * f32::EPSILON * vec.length().at_least(positive!(1.0));
    prop_assert!(
        (round_tripped.x() - vec.x()).abs() <= tolerance
            && (round_tripped.y() - vec.y()).abs() <= tolerance,
        "{:?} round-tripped to {:?}",
        vec,
        round_tripped,
    );
}

/// Compares the pair before and after renormalizing a bounded composition chain.
///
/// Componentwise comparison avoids the angular branch cut at ±π. It bounds the change to the stored
/// pair, rather than certifying an exact recovered angle.
#[property_test]
fn renormalize_preserves_the_angle(
    #[strategy = angle()] radians: f32,
    #[strategy = 1_usize..64] compositions: usize,
) {
    let step = Rotation::from_radians(radians);
    let mut chained = Rotation::IDENTITY;
    for _ in 0..compositions {
        chained = chained.then(step);
    }

    let renormalized = chained.renormalize();

    // the absolute tolerance grows with the number of rounded compositions
    let tolerance =
        8.0 * f32::EPSILON * f32::from(u8::try_from(compositions + 2).expect("bounded below 66"));
    prop_assert!(
        (renormalized.cos() - chained.cos()).abs() <= tolerance
            && (renormalized.sin() - chained.sin()).abs() <= tolerance,
        "({}, {}) renormalized to ({}, {})",
        chained.cos(),
        chained.sin(),
        renormalized.cos(),
        renormalized.sin(),
    );
}

/// Renormalizes a pair whose length exceeds one by a quarter.
///
/// The squared length of (3/4, 1) is 9/16 + 1 = 25/16. Its length is exactly 5/4, and multiplying
/// by 4/5 gives the normalized pair (3/5, 4/5), compared with a tolerance for rounding.
#[test]
fn renormalize_rescales_a_quarter_off_unit_pair() {
    let renormalized = Rotation::from_cos_sin(0.75, 1.0).renormalize();

    assert!(
        (renormalized.cos() - 0.6).abs() < 1e-6 && (renormalized.sin() - 0.8).abs() < 1e-6,
        "renormalized to ({}, {})",
        renormalized.cos(),
        renormalized.sin(),
    );
}
