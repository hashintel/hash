#![expect(
    clippy::float_cmp,
    reason = "exactness assertions are the point: corner selection and fits over \
              exactly-representable values are bit-precise contracts"
)]
#![expect(
    clippy::integer_division_remainder_used,
    reason = "test data generation folds indices into range by modulus"
)]

use proptest::{prop_assert, prop_assert_eq, prop_assume, property_test, strategy::Strategy};

use crate::math::{
    Bounds2, Positive, Vec2, Vec2x4T,
    tests::{POINTS, assert_vec2_close},
};

#[test]
fn new_validates_corners() {
    assert!(Bounds2::new(Vec2::new(0.0, 0.0), Vec2::new(1.0, 1.0)).is_some());
    // The constructor accepts degenerate boxes.
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

#[test]
fn aspect_ratio_grows_the_axis_that_is_short_for_it() {
    let wide = Bounds2::new(Vec2::new(-8.0, -1.0), Vec2::new(8.0, 1.0))
        .expect("corners are finite and ordered");
    let ratio = Positive::new(4.0).expect("4 is positive");

    // 16 by 2 is wider than 4:1, so the height grows and the width stays.
    let grown = wide.with_aspect_ratio(ratio);
    assert_eq!(grown.size(), Vec2::new(16.0, 4.0));
    assert_eq!(grown.centre(), wide.centre());

    // 1 by 12 is narrower, so the width grows instead.
    let tall = Bounds2::new(Vec2::new(-0.5, -6.0), Vec2::new(0.5, 6.0))
        .expect("corners are finite and ordered");
    let grown = tall.with_aspect_ratio(ratio);
    assert_eq!(grown.size(), Vec2::new(48.0, 12.0));
    assert_eq!(grown.centre(), tall.centre());
}

#[test]
fn aspect_ratio_takes_a_degenerate_axis_out_of_the_other() {
    let ratio = Positive::new(2.0).expect("2 is positive");

    // All points on a horizontal line: the zero-extent axis grows out of the other.
    let line = Bounds2::from_points([Vec2::new(1.0, 5.0), Vec2::new(9.0, 5.0)])
        .expect("points are finite and non-empty");
    let grown = line.with_aspect_ratio(ratio);
    assert_eq!(grown.size(), Vec2::new(8.0, 4.0));
    assert_eq!(grown.centre(), line.centre());

    // A single point has no extent to take a ratio of.
    let point = Bounds2::new(Vec2::splat(3.0), Vec2::splat(3.0)).expect("a point is a valid box");
    assert_eq!(point.with_aspect_ratio(ratio).size(), Vec2::ZERO);
}

#[test]
fn scaling_about_the_centre_moves_both_corners() {
    let bounds = Bounds2::new(Vec2::new(0.0, 2.0), Vec2::new(4.0, 6.0))
        .expect("corners are finite and ordered");

    let widened = bounds.scaled_about_centre(Positive::new(1.5).expect("1.5 is positive"));
    assert_eq!(widened.size(), Vec2::splat(6.0));
    assert_eq!(widened.centre(), bounds.centre());
    assert_eq!(widened.min(), Vec2::new(-1.0, 1.0));
    assert_eq!(widened.max(), Vec2::new(5.0, 7.0));

    let narrowed = bounds.scaled_about_centre(Positive::new(0.5).expect("0.5 is positive"));
    assert_eq!(narrowed.size(), Vec2::splat(2.0));
    assert_eq!(narrowed.centre(), bounds.centre());
}

#[test]
fn quantize_maps_onto_the_axis_grid_and_clamps_outside_points() {
    let bounds = Bounds2::new(Vec2::ZERO, Vec2::new(1.0, 1.0)).expect("the corners are ordered");

    // The minimum corner takes cell zero; the maximum edge takes the last cell; the midpoint
    // lands exactly on the middle cell because every `f32` coordinate quantizes exactly.
    assert_eq!(bounds.quantize(Vec2::ZERO), [0, 0]);
    assert_eq!(bounds.quantize(Vec2::new(1.0, 0.5)), [u32::MAX, 1 << 31]);

    // Coordinates outside the bounds clamp onto the boundary cells.
    assert_eq!(bounds.quantize(Vec2::new(-3.0, 2.0)), [0, u32::MAX]);

    // A zero-extent axis maps to cell zero wherever the coordinate sits.
    let flat = Bounds2::new(Vec2::ZERO, Vec2::new(1.0, 0.0)).expect("a flat box is ordered");
    assert_eq!(flat.quantize(Vec2::new(0.5, 7.0)), [1 << 31, 0]);
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
fn from_slice_matches_from_points_at_every_alignment_offset() {
    // Slide the slice start across a full batch stride so the split lands
    // every possible prefix length.
    let points = scattered_points(64);

    for offset in 0..8 {
        let window = &points[offset..];

        assert_eq!(
            Bounds2::from_slice(window),
            Bounds2::from_points(window.iter().copied()),
            "offset {offset}",
        );
    }
}

#[test]
fn from_slice_rejects_non_finite_in_batch_and_remainder() {
    // Position 2 falls in the batched body, position 9 in the remainder of an 11-point slice.
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
    // Spans three parallel chunks (chunk size is 4096).
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
    // never materializes it: the map computes the unit coordinate first, so
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
    proptest::collection::vec(point_strategy(), 0..64)
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

/// The box computed from a point set contains every input point.
///
/// The min/max folds are exact, so containment is boundary-inclusive with no tolerance.
#[property_test]
fn from_points_contains_every_input_point(#[strategy = points_strategy()] points: Vec<Vec2>) {
    prop_assume!(!points.is_empty());

    let bounds = Bounds2::from_points(points.iter().copied())
        .expect("in-range points are finite and non-empty");

    for point in points {
        prop_assert!(bounds.contains(point), "{:?} outside {:?}", point, bounds);
    }
}

/// The union contains both operands' corners, exactly: union folds min/max, which never rounds.
#[property_test]
fn union_contains_both_operands_corners(
    #[strategy = bounds_strategy()] left: Bounds2,
    #[strategy = bounds_strategy()] right: Bounds2,
) {
    let union = left.union(right);

    for bounds in [left, right] {
        prop_assert!(union.contains(bounds.min()));
        prop_assert!(union.contains(bounds.max()));
    }
}

/// The slice fold agrees with the per-point fold on arbitrary point vectors, empty included.
///
/// Both compute the same exact min/max corners (or the same rejection).
#[property_test]
fn from_slice_equals_from_points_on_arbitrary_points(
    #[strategy = points_strategy()] points: Vec<Vec2>,
) {
    prop_assert_eq!(
        Bounds2::from_slice(&points),
        Bounds2::from_points(points.iter().copied()),
    );
}

/// The batched lanes and the remainder of `normalize_into` round identically.
///
/// Mapping a slice equals mapping every point alone (a single-point slice is all remainder), so the
/// output is independent of how points fall into batches.
#[property_test]
fn normalize_into_agrees_between_batched_body_and_remainder(
    #[strategy = points_strategy()] points: Vec<Vec2>,
    #[strategy = bounds_strategy()] world: Bounds2,
    #[strategy = bounds_strategy()] frame: Bounds2,
) {
    let together = world.normalize_into(frame, &points);

    for (point, expected) in points.iter().zip(&together) {
        let alone = world.normalize_into(frame, core::slice::from_ref(point));
        prop_assert_eq!(alone[0], *expected);
    }
}

/// The fitted transform maps source corners onto target corners.
///
/// Rounding scales with the target box's magnitude. The strategy bounds extents to `1..1e3`
/// (well-conditioned scale factors), and the cancellation in `point - min` grows by at most the
/// extent ratio.
#[property_test]
fn fit_maps_source_corners_onto_target_corners(
    #[strategy = bounds_strategy()] source: Bounds2,
    #[strategy = bounds_strategy()] target: Bounds2,
) {
    let transform = source.fit(target).expect("extents in 1..1e3 are normal");

    // The composed transform's intermediates reach `scale · |corner|`
    // with `scale ≤ target extent / 1` and `|corner| / source extent
    // ≤ 1e3`, so a handful of roundings amplify to a few times
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
            "expected {:?}, got {:?}",
            expected,
            mapped,
        );
    }
}

/// A positive, well-conditioned aspect ratio or scale factor.
///
/// Bounded to `1e-2..1e2`, where the ratio arithmetic stays far from overflow against extents in
/// `1..1e3`.
fn factor_strategy() -> impl Strategy<Value = Positive> {
    (1e-2_f32..1e2).prop_map(|value| Positive::new(value).expect("the range is positive"))
}

/// Growing to a ratio yields a box at that ratio which contains the original and shares its centre.
///
/// Corners come back through `centre ± size / 2`, so every assertion carries a tolerance scaled by
/// the grown box's magnitude: the rounding of a corner is a rounding of the extent it was rebuilt
/// from, which the ratio makes much larger than the centre it surrounds.
#[property_test]
fn aspect_ratio_contains_the_box_and_holds_its_ratio(
    #[strategy = bounds_strategy()] bounds: Bounds2,
    #[strategy = factor_strategy()] ratio: Positive,
) {
    let grown = bounds.with_aspect_ratio(ratio);
    let tolerance = 1e-4 * (grown.min().length() + grown.size().length()).max(1.0);

    prop_assert!(
        grown.min().x() <= bounds.min().x() + tolerance
            && grown.min().y() <= bounds.min().y() + tolerance
            && grown.max().x() >= bounds.max().x() - tolerance
            && grown.max().y() >= bounds.max().y() - tolerance,
        "{:?} does not contain {:?}",
        grown,
        bounds,
    );
    prop_assert!(
        (grown.centre().x() - bounds.centre().x()).abs() <= tolerance
            && (grown.centre().y() - bounds.centre().y()).abs() <= tolerance,
        "{:?} is not centred on {:?}",
        grown,
        bounds,
    );

    let reached = grown.size().x() / grown.size().y();
    prop_assert!(
        (reached - ratio.get()).abs() <= 1e-4 * ratio.get(),
        "reached {reached}, wanted {}",
        ratio.get(),
    );
}

/// Scaling about the centre scales both extents by the factor and fixes the centre.
///
/// A factor above one grows the box and one below shrinks it, so the same law states containment in
/// whichever direction the factor points. Tolerances scale with the scaled box's magnitude, since
/// that is what its corners were rebuilt from.
#[property_test]
fn scaling_about_the_centre_scales_both_extents(
    #[strategy = bounds_strategy()] bounds: Bounds2,
    #[strategy = factor_strategy()] factor: Positive,
) {
    let scaled = bounds.scaled_about_centre(factor);
    let expected = bounds.size() * factor.get();
    let tolerance = 1e-4 * (scaled.min().length() + scaled.size().length()).max(1.0);

    prop_assert!(
        (scaled.size().x() - expected.x()).abs() <= tolerance
            && (scaled.size().y() - expected.y()).abs() <= tolerance,
        "expected extent {:?}, got {:?}",
        expected,
        scaled.size(),
    );
    prop_assert!(
        (scaled.centre().x() - bounds.centre().x()).abs() <= tolerance
            && (scaled.centre().y() - bounds.centre().y()).abs() <= tolerance,
        "{:?} is not centred on {:?}",
        scaled,
        bounds,
    );

    let (outer, inner) = if factor.get() >= 1.0 {
        (scaled, bounds)
    } else {
        (bounds, scaled)
    };
    prop_assert!(
        outer.min().x() <= inner.min().x() + tolerance
            && outer.min().y() <= inner.min().y() + tolerance
            && outer.max().x() >= inner.max().x() - tolerance
            && outer.max().y() >= inner.max().y() - tolerance,
        "{outer:?} does not contain {inner:?}",
    );
}
