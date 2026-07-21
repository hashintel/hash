#![expect(
    clippy::float_cmp,
    reason = "exactness assertions are the point: corner selection and fits over \
              exactly-representable values are bit-precise contracts"
)]
#![expect(
    clippy::integer_division_remainder_used,
    reason = "test data generation folds indices into range by modulus"
)]

use proptest::prelude::*;

use crate::math::{
    Bounds2, Vec2, Vec2x4T,
    tests::{POINTS, assert_vec2_close},
};

#[test]
fn new_validates_corners() {
    assert!(Bounds2::new(Vec2::new(0.0, 0.0), Vec2::new(1.0, 1.0)).is_some());
    // Degenerate boxes are allowed.
    assert!(Bounds2::new(Vec2::splat(3.0), Vec2::splat(3.0)).is_some());

    // Swapped corners, on either axis.
    assert!(Bounds2::new(Vec2::new(2.0, 0.0), Vec2::new(1.0, 1.0)).is_none());
    assert!(Bounds2::new(Vec2::new(0.0, 2.0), Vec2::new(1.0, 1.0)).is_none());

    // Non-finite corners.
    assert!(Bounds2::new(Vec2::new(f32::NAN, 0.0), Vec2::new(1.0, 1.0)).is_none());
    assert!(Bounds2::new(Vec2::ZERO, Vec2::new(f32::INFINITY, 1.0)).is_none());
}

#[test]
fn from_points_finds_tight_extent() {
    let bounds = Bounds2::from_points(POINTS).expect("points are finite and non-empty");

    assert_eq!(bounds.min(), Vec2::new(1.0, 5.0));
    assert_eq!(bounds.max(), Vec2::new(4.0, 8.0));
    assert_eq!(bounds.size(), Vec2::new(3.0, 3.0));
    assert_eq!(bounds.centre(), Vec2::new(2.5, 6.5));
}

#[test]
fn from_points_rejects_empty_and_non_finite() {
    assert!(Bounds2::from_points([]).is_none());
    assert!(Bounds2::from_points([Vec2::new(1.0, f32::NAN)]).is_none());
    // A single bad point poisons the whole set, wherever it sits.
    assert!(
        Bounds2::from_points([Vec2::ZERO, Vec2::new(f32::NEG_INFINITY, 0.0), Vec2::ZERO]).is_none()
    );
}

#[test]
fn contains_is_boundary_inclusive() {
    let bounds =
        Bounds2::new(Vec2::ZERO, Vec2::splat(2.0)).expect("corners are finite and ordered");

    assert!(bounds.contains(Vec2::splat(1.0)));
    assert!(bounds.contains(Vec2::ZERO));
    assert!(bounds.contains(Vec2::splat(2.0)));
    assert!(!bounds.contains(Vec2::new(2.1, 1.0)));
    assert!(!bounds.contains(Vec2::new(1.0, -0.1)));
    assert!(!bounds.contains(Vec2::new(f32::NAN, 1.0)));
}

#[test]
fn union_covers_both_operands() {
    let left = Bounds2::new(Vec2::new(-1.0, 0.0), Vec2::new(1.0, 2.0))
        .expect("corners are finite and ordered");
    let right = Bounds2::new(Vec2::new(0.0, -3.0), Vec2::new(4.0, 1.0))
        .expect("corners are finite and ordered");

    let union = left.union(right);
    assert_eq!(union.min(), Vec2::new(-1.0, -3.0));
    assert_eq!(union.max(), Vec2::new(4.0, 2.0));
}

#[test]
fn minimum_extent_widens_degenerate_axes_only() {
    // All points on a vertical line: x extent is zero, y extent is 4.
    let bounds = Bounds2::from_points([Vec2::new(3.0, 0.0), Vec2::new(3.0, 4.0)])
        .expect("points are finite and non-empty");

    let widened = bounds.with_minimum_extent(2.0);
    assert_eq!(widened.size(), Vec2::new(2.0, 4.0));
    // Widening is symmetric around the centre.
    assert_eq!(widened.centre(), bounds.centre());
    assert_eq!(widened.min().x(), 2.0);
    assert_eq!(widened.max().x(), 4.0);
}

/// Deterministic, sign-varying, finite test points.
fn scattered_points(count: usize) -> Vec<Vec2> {
    (0..count)
        .map(|index| {
            let value = f32::from(u16::try_from(index % 40_000).expect("bounded by modulus"));

            Vec2::new((value - 17_000.0) * 0.25, (19_000.0 - value) * 0.5)
        })
        .collect()
}

#[test]
fn from_slice_matches_from_points_for_every_remainder_length() {
    // Cover empty, remainder-only, exact-batch, and mixed lengths.
    for length in [0, 1, 3, 4, 5, 8, 11] {
        let points = scattered_points(length);

        assert_eq!(
            Bounds2::from_slice(&points),
            Bounds2::from_points(points.iter().copied()),
            "length {length}",
        );
    }
}

#[test]
fn from_slice_rejects_non_finite_in_batch_and_remainder() {
    // Position 2 falls in the SIMD-folded body, position 9 in the scalar
    // remainder of an 11-point slice.
    for position in [2, 9] {
        let mut points = scattered_points(11);
        points[position] = Vec2::new(f32::NAN, 0.0);
        assert!(Bounds2::from_slice(&points).is_none(), "NaN at {position}");

        points[position] = Vec2::new(0.0, f32::INFINITY);
        assert!(
            Bounds2::from_slice(&points).is_none(),
            "infinity at {position}",
        );
    }
}

#[test]
fn from_slice_par_matches_serial() {
    // Spans several parallel chunks (chunk size is 4096).
    let points = scattered_points(10_000);

    assert_eq!(
        Bounds2::from_slice_par(&points),
        Bounds2::from_slice(&points),
    );
    assert_eq!(Bounds2::from_slice_par(&[]), None);
}

#[test]
fn from_slice_par_poisons_on_non_finite_in_any_chunk() {
    let mut points = scattered_points(10_000);
    // Deep in a later chunk.
    points[9_500] = Vec2::splat(f32::NAN);

    assert_eq!(Bounds2::from_slice_par(&points), None);
}

#[test]
fn fit_maps_corners_onto_target() {
    let layout = Bounds2::from_points(POINTS).expect("points are finite and non-empty");
    let viewport =
        Bounds2::new(Vec2::ZERO, Vec2::splat(10.0)).expect("corners are finite and ordered");

    let transform = layout.fit(viewport).expect("layout has positive extent");

    // The scale factor 10/3 is not exactly representable, so corners land
    // within rounding of the target rather than exactly on it.
    assert_vec2_close(transform.apply(layout.min()), viewport.min());
    assert_vec2_close(transform.apply(layout.max()), viewport.max());
    assert_vec2_close(transform.apply(layout.centre()), viewport.centre());

    // The batched application agrees with the scalar one up to FMA
    // contraction.
    let batch = transform.apply_x4(Vec2x4T::from(POINTS));
    for (index, point) in POINTS.into_iter().enumerate() {
        assert_vec2_close(batch.get(index), transform.apply(point));
    }

    // Every mapped point lands inside the viewport, up to rounding: the
    // fit promises corner correspondence, not strict containment, so the
    // check allows an ulp-scale margin.
    let padded = Bounds2::new(
        viewport.min() - Vec2::splat(1e-4),
        viewport.max() + Vec2::splat(1e-4),
    )
    .expect("padded corners remain finite and ordered");
    for point in POINTS {
        assert!(padded.contains(transform.apply(point)));
    }
}

#[test]
fn fit_rejects_degenerate_extents_until_widened() {
    let target =
        Bounds2::new(Vec2::ZERO, Vec2::splat(1.0)).expect("corners are finite and ordered");
    let collinear = Bounds2::from_points([Vec2::new(3.0, 0.0), Vec2::new(3.0, 4.0)])
        .expect("points are finite and non-empty");

    assert!(collinear.fit(target).is_none());
    assert!(collinear.with_minimum_extent(1.0).fit(target).is_some());
}

#[test]
fn normalize_into_maps_corners_and_midpoints_exactly() {
    let layout = Bounds2::from_points(POINTS).expect("points are finite and non-empty");
    let viewport =
        Bounds2::new(Vec2::ZERO, Vec2::splat(10.0)).expect("corners are finite and ordered");

    // The scale factor 10/3 is not exactly representable, but the mapping
    // never materializes it: the unit coordinate is computed first, so
    // corners (unit 0 and 1) and the centre (unit 0.5) land exactly.
    let mapped = layout.normalize_into(viewport, &[layout.min(), layout.max(), layout.centre()]);
    assert_eq!(mapped, [Vec2::ZERO, Vec2::splat(10.0), Vec2::splat(5.0)]);
}

#[test]
fn normalize_into_collapses_a_zero_extent_axis_to_the_target_centre() {
    let collinear = Bounds2::from_points([Vec2::new(3.0, 0.0), Vec2::new(3.0, 4.0)])
        .expect("points are finite and non-empty");
    let frame =
        Bounds2::new(Vec2::splat(-1.0), Vec2::splat(1.0)).expect("corners are finite and ordered");

    // The x axis has zero extent and collapses to the frame's centre; the
    // y axis maps affinely as usual.
    let mapped = collinear.normalize_into(frame, &[Vec2::new(3.0, 1.0)]);
    assert_eq!(mapped, [Vec2::new(0.0, -0.5)]);
}

#[test]
fn normalize_into_stays_exact_far_from_the_origin() {
    // A box sitting at 2^14 with unit extent: the world minimum dwarfs
    // the extent, the regime where composing scale and translation in
    // `f32` cancels catastrophically. The per-axis `f64` map keeps the
    // quarter point exact.
    let world = Bounds2::new(Vec2::splat(16_384.0), Vec2::splat(16_385.0))
        .expect("corners are finite and ordered");
    let frame =
        Bounds2::new(Vec2::splat(-1.0), Vec2::splat(1.0)).expect("corners are finite and ordered");

    let mapped = world.normalize_into(frame, &[Vec2::splat(16_384.25)]);
    assert_eq!(mapped, [Vec2::splat(-0.5)]);
}

/// A point with coordinates bounded to the well-conditioned `-1e3..1e3` range.
///
/// The bounding-box laws are about corner algebra, not overflow.
fn point_strategy() -> impl Strategy<Value = Vec2> {
    (-1e3_f32..1e3, -1e3_f32..1e3).prop_map(|(x, y)| Vec2::new(x, y))
}

/// A point vector crossing the SIMD fold's chunk boundary in both directions.
///
/// Short enough to keep case counts sane.
fn points_strategy() -> impl Strategy<Value = Vec<Vec2>> {
    prop::collection::vec(point_strategy(), 0..64)
}

/// A well-conditioned box.
///
/// A corner bounded to `-1e3..1e3` and per-axis extents in `1..1e3`, bounded away from the
/// degenerate scales `fit` rejects.
fn bounds_strategy() -> impl Strategy<Value = Bounds2> {
    (point_strategy(), 1.0_f32..1e3, 1.0_f32..1e3).prop_map(|(min, width, height)| {
        Bounds2::new(min, min + Vec2::new(width, height))
            .expect("a finite corner plus positive extents is a valid box")
    })
}

proptest! {
    /// The box computed from a point set contains every input point: the min/max folds are exact, so containment is boundary-inclusive with no tolerance.
    #[test]
    fn from_points_contains_every_input_point(points in points_strategy()) {
        prop_assume!(!points.is_empty());

        let bounds = Bounds2::from_points(points.iter().copied())
            .expect("in-range points are finite and non-empty");

        for point in points {
            prop_assert!(bounds.contains(point), "{:?} outside {:?}", point, bounds);
        }
    }

    /// The union contains both operands' corners, exactly: union folds min/max, which never rounds.
    #[test]
    fn union_contains_both_operands_corners(
        left in bounds_strategy(),
        right in bounds_strategy(),
    ) {
        let union = left.union(right);

        for bounds in [left, right] {
            prop_assert!(union.contains(bounds.min()));
            prop_assert!(union.contains(bounds.max()));
        }
    }

    /// The SIMD fold agrees with the scalar fold on arbitrary point vectors, including the empty one: both compute the same exact min/max corners (or the same rejection).
    #[test]
    fn from_slice_equals_from_points_on_arbitrary_points(points in points_strategy()) {
        prop_assert_eq!(
            Bounds2::from_slice(&points),
            Bounds2::from_points(points.iter().copied()),
        );
    }

    /// The batched lanes and the scalar tail of `normalize_into` round identically: mapping a slice equals mapping every point alone (a single-point slice takes the scalar path), so the output is independent of how points fall into batches.
    #[test]
    fn normalize_into_agrees_between_batched_and_scalar_paths(
        points in points_strategy(),
        world in bounds_strategy(),
        frame in bounds_strategy(),
    ) {
        let together = world.normalize_into(frame, &points);

        for (point, expected) in points.iter().zip(&together) {
            let alone = world.normalize_into(frame, core::slice::from_ref(point));
            prop_assert_eq!(alone[0], *expected);
        }
    }

    /// The fitted transform maps source corners onto target corners, up to rounding scaled by the target box's magnitude: extents are bounded to `1..1e3` (well-conditioned scale factors), and the cancellation in `point - min` is amplified by at most the extent ratio.
    #[test]
    fn fit_maps_source_corners_onto_target_corners(
        source in bounds_strategy(),
        target in bounds_strategy(),
    ) {
        let transform = source.fit(target).expect("extents in 1..1e3 are normal");

        // The composed transform's intermediates reach `scale * |corner|`
        // with `scale <= target extent / 1` and `|corner| / source extent
        // <= 1e3`, so a handful of roundings amplify to a few times
        // `1e-4` of the target box's magnitude.
        let magnitude = target.min().length() + target.size().length();
        let tolerance = 4e-3 * magnitude.max(1.0);
        for (mapped, expected) in [
            (transform.apply(source.min()), target.min()),
            (transform.apply(source.max()), target.max()),
        ] {
            prop_assert!(
                (mapped.x() - expected.x()).abs() <= tolerance
                    && (mapped.y() - expected.y()).abs() <= tolerance,
                "expected {:?}, got {:?}", expected, mapped,
            );
        }
    }
}
