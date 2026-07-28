use crate::math::{
    Translation, Vec2, Vec2x4T,
    tests::{POINTS, SWEEP_POINTS, SWEEP_TRANSLATIONS},
};

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

/// `apply_x4` is exact against `apply` over a deterministic sweep of offsets and points.
///
/// The SIMD path is a plain lane-wise `f32` addition with no fused operation to round
/// differently from the scalar path's addition, so every lane must match bit for bit; measured
/// across [`SWEEP_TRANSLATIONS`] and [`SWEEP_POINTS`] (spanning zero, sub-unit and super-unit
/// magnitudes, and mixed signs), the maximum observed distance is 0 ULP in both components.
#[test]
fn translation_apply_x4_matches_apply_exactly_over_a_sweep() {
    for &offset in &SWEEP_TRANSLATIONS {
        let translation = Translation::new(offset.x(), offset.y());
        let (chunks, _remainder) = SWEEP_POINTS.as_chunks::<4>();
        for &chunk in chunks {
            let batch = translation.apply_x4(Vec2x4T::from(chunk));

            for (index, &point) in chunk.iter().enumerate() {
                assert_eq!(
                    batch.get(index),
                    translation.apply(point),
                    "offset {offset:?}, point {point:?}",
                );
            }
        }
    }
}
