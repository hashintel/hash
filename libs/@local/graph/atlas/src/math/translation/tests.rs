use crate::math::{Translation, Vec2, Vec2x4T, tests::POINTS};

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
