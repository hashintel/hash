#![expect(
    clippy::float_cmp,
    reason = "exactness assertions are the point: inverse negation is a bit-precise contract"
)]

use crate::math::{
    Rotation, Vec2, Vec2x4T,
    test_util::{POINTS, assert_vec2_close},
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
