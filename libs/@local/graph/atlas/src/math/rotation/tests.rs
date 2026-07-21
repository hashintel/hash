#![expect(
    clippy::float_cmp,
    reason = "exactness assertions are the point: inverse negation is a bit-precise contract"
)]

use proptest::prelude::*;

use crate::math::{
    Rotation, Vec2, Vec2x4T,
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

/// An angle within a few turns of zero, where `sin_cos` is well-conditioned.
fn angle() -> impl Strategy<Value = f32> {
    -16.0_f32..16.0
}

/// A vector with coordinates bounded to the well-conditioned `-1e5..1e5` range.
///
/// The rotation laws are about algebra, not overflow.
fn vec2_strategy() -> impl Strategy<Value = Vec2> {
    (-1e5_f32..1e5, -1e5_f32..1e5).prop_map(|(x, y)| Vec2::new(x, y))
}

proptest! {
    /// Rotation preserves length.
    ///
    /// `|apply(v)| == |v|` up to rounding scaled by the vector's magnitude.
    #[test]
    fn apply_preserves_length(radians in angle(), vec in vec2_strategy()) {
        let rotated = Rotation::from_radians(radians).apply(vec);

        let length = vec.length();
        prop_assert!(
            (rotated.length() - length).abs() <= 16.0 * f32::EPSILON * length.max(1.0),
            "|{:?}| = {} became {}", vec, length, rotated.length(),
        );
    }

    /// Composition distributes over application.
    ///
    /// `a.then(b).apply(v) == b.apply(a.apply(v))` up to rounding scaled by the vector's magnitude.
    #[test]
    fn then_matches_sequential_application(
        first_radians in angle(),
        second_radians in angle(),
        vec in vec2_strategy(),
    ) {
        let first = Rotation::from_radians(first_radians);
        let second = Rotation::from_radians(second_radians);

        let composed = first.then(second).apply(vec);
        let sequential = second.apply(first.apply(vec));

        let tolerance = 32.0 * f32::EPSILON * vec.length().max(1.0);
        prop_assert!(
            (composed.x() - sequential.x()).abs() <= tolerance
                && (composed.y() - sequential.y()).abs() <= tolerance,
            "composed {:?} vs sequential {:?}", composed, sequential,
        );
    }

    /// The inverse undoes the rotation.
    ///
    /// `inverse().apply(apply(v)) == v` up to rounding scaled by the vector's magnitude.
    #[test]
    fn inverse_undoes_apply(radians in angle(), vec in vec2_strategy()) {
        let rotation = Rotation::from_radians(radians);

        let round_tripped = rotation.inverse().apply(rotation.apply(vec));

        let tolerance = 32.0 * f32::EPSILON * vec.length().max(1.0);
        prop_assert!(
            (round_tripped.x() - vec.x()).abs() <= tolerance
                && (round_tripped.y() - vec.y()).abs() <= tolerance,
            "{:?} round-tripped to {:?}", vec, round_tripped,
        );
    }

    /// Renormalizing preserves the angle.
    ///
    /// The cosine and sine keep their direction (compared componentwise rather than through
    /// `atan2`, which wraps at pi), even after enough compositions to accumulate drift.
    #[test]
    fn renormalize_preserves_the_angle(radians in angle(), compositions in 1_usize..64) {
        let step = Rotation::from_radians(radians);
        let mut chained = Rotation::IDENTITY;
        for _ in 0..compositions {
            chained = chained.then(step);
        }

        let renormalized = chained.renormalize();

        // The drifted vector's length stays within a couple of ulps of
        // one per composition, so dividing it out moves each component by
        // at most that relative amount.
        let tolerance = 8.0
            * f32::EPSILON
            * f32::from(u8::try_from(compositions + 2).expect("bounded below 66"));
        prop_assert!(
            (renormalized.cos() - chained.cos()).abs() <= tolerance
                && (renormalized.sin() - chained.sin()).abs() <= tolerance,
            "({}, {}) renormalized to ({}, {})",
            chained.cos(), chained.sin(), renormalized.cos(), renormalized.sin(),
        );
    }
}
