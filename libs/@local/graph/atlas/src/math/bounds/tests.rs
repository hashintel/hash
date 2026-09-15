#![expect(
    clippy::float_cmp,
    reason = "exactness assertions are the point: corner selection and fits over \
              exactly-representable values are bit-precise contracts"
)]
#![expect(
    clippy::integer_division_remainder_used,
    reason = "test data generation folds indices into range by modulus"
)]

use core::{
    assert_matches,
    mem::{offset_of, size_of},
};

use proptest::{prop_assert, prop_assert_eq, prop_assume, property_test, strategy::Strategy};
use zerocopy::{FromZeros as _, IntoBytes as _, TryFromBytes as _};

use crate::math::{
    Bounds2, Positive, Vec2, Vec2x4T, positive,
    tests::{POINTS, assert_vec2_close},
};

#[test]
fn bounds_bytes_validate_both_corners() {
    for (min, max) in [
        (Vec2::new(2.0, 0.0), Vec2::splat(1.0)),
        (Vec2::new(0.0, 2.0), Vec2::splat(1.0)),
        (Vec2::new(f32::NAN, 0.0), Vec2::splat(1.0)),
        (Vec2::new(0.0, f32::NEG_INFINITY), Vec2::splat(1.0)),
        (Vec2::ZERO, Vec2::new(f32::INFINITY, 1.0)),
        (Vec2::ZERO, Vec2::new(1.0, f32::NAN)),
    ] {
        let mut storage = [0_u32; size_of::<Bounds2>().div_euclid(size_of::<u32>())];
        let bytes = storage.as_mut_bytes();
        for (offset, corner) in [
            (offset_of!(Bounds2, min), min),
            (offset_of!(Bounds2, max), max),
        ] {
            bytes[offset..offset + size_of::<Vec2>()].copy_from_slice(corner.as_bytes());
        }
        assert_matches!(
            Bounds2::try_read_from_bytes(bytes),
            Err(zerocopy::ConvertError::Validity(_))
        );
        assert_matches!(
            Bounds2::try_ref_from_bytes(bytes),
            Err(zerocopy::ConvertError::Validity(_))
        );
        assert_matches!(
            Bounds2::try_mut_from_bytes(bytes),
            Err(zerocopy::ConvertError::Validity(_))
        );
    }

    for (min, max) in [
        (Vec2::ZERO, Vec2::ZERO),
        (Vec2::splat(-0.0), Vec2::ZERO),
        (Vec2::new(-2.0, 3.0), Vec2::new(4.0, 3.0)),
        (Vec2::splat(-f32::MAX), Vec2::splat(f32::MAX)),
    ] {
        let bounds = Bounds2::new(min, max).expect("finite ordered corners");
        let restored = Bounds2::try_ref_from_bytes(bounds.as_bytes()).expect("valid stored bounds");
        assert_eq!(restored.as_bytes(), bounds.as_bytes());
        let copied = Bounds2::try_read_from_bytes(bounds.as_bytes()).expect("valid stored bounds");
        assert_eq!(copied.as_bytes(), bounds.as_bytes());
    }

    let zero = Bounds2::new_zeroed();
    assert_eq!(zero.min(), Vec2::ZERO);
    assert_eq!(zero.max(), Vec2::ZERO);
}

#[test]
fn bounds_serde_validates_corners() {
    for json in [
        r#"{"min":[1,1],"max":[0,0]}"#,
        r#"{"min":[0,2],"max":[1,1]}"#,
        r#"{"min":[-1e40,0],"max":[1,1]}"#,
        r#"{"min":[0,0],"max":[1,1e40]}"#,
    ] {
        serde_json::from_str::<Bounds2>(json).expect_err("invalid corners should not deserialize");
    }
    let json = r#"{"min":[-2.0,3.0],"max":[4.0,3.0]}"#;
    let bounds: Bounds2 = serde_json::from_str(json).expect("finite ordered corners");
    assert_eq!(bounds.min(), Vec2::new(-2.0, 3.0));
    assert_eq!(bounds.max(), Vec2::new(4.0, 3.0));
    assert_eq!(
        serde_json::to_string(&bounds).expect("finite coefficients"),
        json
    );
}

/// `Bounds2::new` accepts ordered and degenerate corners and refuses swapped corners on either
/// axis and non-finite corners.
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

/// `from_points` over the shared fixture yields the tight minimum, maximum, size and centre.
#[test]
fn from_points_finds_tight_extent() {
    let bounds = Bounds2::from_points(POINTS).expect("points are finite and non-empty");

    assert_eq!(bounds.min(), Vec2::new(1.0, 5.0));
    assert_eq!(bounds.max(), Vec2::new(4.0, 8.0));
    assert_eq!(bounds.size(), Vec2::new(3.0, 3.0));
    assert_eq!(bounds.centre(), Vec2::new(2.5, 6.5));
}

/// `from_points` returns `None` for no points and for any non-finite point wherever it sits.
#[test]
fn from_points_rejects_empty_and_non_finite() {
    assert!(Bounds2::from_points([]).is_none());
    assert!(Bounds2::from_points([Vec2::new(1.0, f32::NAN)]).is_none());
    // A single bad point poisons the whole set, wherever it sits.
    assert!(
        Bounds2::from_points([Vec2::ZERO, Vec2::new(f32::NEG_INFINITY, 0.0), Vec2::ZERO]).is_none()
    );
}

/// Folding `extend` over the fixture equals `from_points`, extending `None` yields a point box, and
/// a non-finite point poisons the extent whether or not one exists.
#[test]
fn extend_matches_from_points() {
    let folded = POINTS
        .iter()
        .fold(None, |extent, &point| Bounds2::extend(extent, point));
    assert_eq!(folded, Bounds2::from_points(POINTS));

    assert_eq!(
        Bounds2::extend(None, Vec2::splat(1.0)),
        Bounds2::new(Vec2::splat(1.0), Vec2::splat(1.0))
    );
    assert!(Bounds2::extend(None, Vec2::new(f32::NAN, 0.0)).is_none());
    assert!(
        Bounds2::extend(
            Bounds2::new(Vec2::ZERO, Vec2::ZERO),
            Vec2::new(1.0, f32::NAN)
        )
        .is_none()
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

/// `union` takes the componentwise minimum of the minima and maximum of the maxima.
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

/// `with_minimum_extent` widens a zero-extent axis symmetrically about the centre and leaves an
/// axis already wider alone.
#[test]
fn minimum_extent_widens_degenerate_axes_only() {
    // All points on a vertical line: x extent is zero, y extent is 4.
    let bounds = Bounds2::from_points([Vec2::new(3.0, 0.0), Vec2::new(3.0, 4.0)])
        .expect("points are finite and non-empty");

    let widened = bounds
        .with_minimum_extent(positive!(2.0))
        .expect("the widened corners are far inside the `f32` range");
    assert_eq!(widened.size(), Vec2::new(2.0, 4.0));
    // Widening is symmetric around the centre.
    assert_eq!(widened.centre(), bounds.centre());
    assert_eq!(widened.min().x(), 2.0);
    assert_eq!(widened.max().x(), 4.0);
}

/// `with_aspect_ratio` grows only the axis that is short for the ratio, keeping the centre: a
/// wide box gains height and a tall box gains width.
#[test]
fn aspect_ratio_grows_the_axis_that_is_short_for_it() {
    let wide = Bounds2::new(Vec2::new(-8.0, -1.0), Vec2::new(8.0, 1.0))
        .expect("corners are finite and ordered");
    let ratio = Positive::new(4.0).expect("4 is positive");

    // 16 by 2 is wider than 4:1, so the height grows and the width stays.
    let grown = wide
        .with_aspect_ratio(ratio)
        .expect("the grown corners are far inside the `f32` range");
    assert_eq!(grown.size(), Vec2::new(16.0, 4.0));
    assert_eq!(grown.centre(), wide.centre());
    assert_eq!(
        (grown.min().x(), grown.max().x()),
        (wide.min().x(), wide.max().x())
    );

    // 1 by 12 is narrower, so the width grows instead.
    let tall = Bounds2::new(Vec2::new(-0.5, -6.0), Vec2::new(0.5, 6.0))
        .expect("corners are finite and ordered");
    let grown = tall
        .with_aspect_ratio(ratio)
        .expect("the grown corners are far inside the `f32` range");
    assert_eq!(grown.size(), Vec2::new(48.0, 12.0));
    assert_eq!(grown.centre(), tall.centre());
    assert_eq!(
        (grown.min().y(), grown.max().y()),
        (tall.min().y(), tall.max().y())
    );
}

/// A zero-extent axis grows out of the other under `with_aspect_ratio`, and a single point stays
/// a point.
#[test]
fn aspect_ratio_takes_a_degenerate_axis_out_of_the_other() {
    let ratio = Positive::new(2.0).expect("2 is positive");

    // All points on a horizontal line: the zero-extent axis grows out of the other.
    let line = Bounds2::from_points([Vec2::new(1.0, 5.0), Vec2::new(9.0, 5.0)])
        .expect("points are finite and non-empty");
    let grown = line
        .with_aspect_ratio(ratio)
        .expect("the grown corners are far inside the `f32` range");
    assert_eq!(grown.size(), Vec2::new(8.0, 4.0));
    assert_eq!(grown.centre(), line.centre());

    // A single point has no extent to take a ratio of, and comes back bit for bit.
    let point = Bounds2::new(Vec2::splat(3.0), Vec2::splat(3.0)).expect("a point is a valid box");
    assert_eq!(point.with_aspect_ratio(ratio), Some(point));
}

/// `scaled_about_centre` multiplies the size by the factor while keeping the centre, for factors
/// above and below one.
#[test]
fn scaling_about_the_centre_moves_both_corners() {
    let bounds = Bounds2::new(Vec2::new(0.0, 2.0), Vec2::new(4.0, 6.0))
        .expect("corners are finite and ordered");

    let widened = bounds
        .scaled_about_centre(positive!(1.5))
        .expect("the scaled corners are far inside the `f32` range");
    assert_eq!(widened.size(), Vec2::splat(6.0));
    assert_eq!(widened.centre(), bounds.centre());
    assert_eq!(widened.min(), Vec2::new(-1.0, 1.0));
    assert_eq!(widened.max(), Vec2::new(5.0, 7.0));

    let narrowed = bounds
        .scaled_about_centre(positive!(0.5))
        .expect("the scaled corners are far inside the `f32` range");
    assert_eq!(narrowed.size(), Vec2::splat(2.0));
    assert_eq!(narrowed.centre(), bounds.centre());
    assert_eq!(narrowed.min(), Vec2::new(1.0, 3.0));
    assert_eq!(narrowed.max(), Vec2::new(3.0, 5.0));
}

#[test]
fn growth_identity() {
    let bounds = Bounds2::new(Vec2::new(-8.0, -1.0), Vec2::new(8.0, 1.0))
        .expect("corners are finite and ordered");

    assert_eq!(bounds.with_aspect_ratio(positive!(8.0)), Some(bounds));
    assert_eq!(bounds.scaled_about_centre(Positive::ONE), Some(bounds));
    assert_eq!(bounds.with_minimum_extent(positive!(2.0)), Some(bounds));
    assert_eq!(bounds.with_minimum_extent(positive!(1.0)), Some(bounds));
}

#[test]
fn growth_translated_sliver() {
    let narrow = Bounds2::new(Vec2::new(16_777_216.0, 0.0), Vec2::new(16_777_218.0, 2.0))
        .expect("corners are finite and ordered");

    // Already square: nothing to grow.
    assert_eq!(narrow.with_aspect_ratio(Positive::ONE), Some(narrow));

    // Ratio 2 wants x = [2²⁴ - 1, 2²⁴ + 3]. The high corner has no `f32`, and the enclosure
    // steps to 2²⁴ + 4: five wide against a requested four.
    let wider = narrow
        .with_aspect_ratio(positive!(2.0))
        .expect("the grown corners are far inside the `f32` range");
    assert_eq!(wider.min(), Vec2::new(16_777_215.0, 0.0));
    assert_eq!(wider.max(), Vec2::new(16_777_220.0, 2.0));
    assert!(wider.contains(narrow.min()) && wider.contains(narrow.max()));

    // Ratio 0.5 grows y instead, where the corners are small and the intent is exact.
    let taller = narrow
        .with_aspect_ratio(positive!(0.5))
        .expect("the grown corners are far inside the `f32` range");
    assert_eq!(taller.min(), Vec2::new(16_777_216.0, -1.0));
    assert_eq!(taller.max(), Vec2::new(16_777_218.0, 3.0));
}

#[test]
fn centre_range_edge() {
    let point = Bounds2::new(Vec2::splat(f32::MAX), Vec2::splat(f32::MAX))
        .expect("a point at the range edge is a valid box");
    assert_eq!(point.centre(), Vec2::splat(f32::MAX));

    let wide = Bounds2::new(Vec2::new(1e38, -f32::MAX), Vec2::new(3e38, f32::MAX))
        .expect("corners are finite and ordered");
    assert_eq!(wide.centre(), Vec2::new(2e38, 0.0));
}

#[test]
fn growth_range_edge_point() {
    let point = Bounds2::new(Vec2::splat(f32::MAX), Vec2::splat(f32::MAX))
        .expect("a point at the range edge is a valid box");

    assert_eq!(point.with_aspect_ratio(Positive::ONE), Some(point));
    assert_eq!(point.scaled_about_centre(positive!(1.5)), Some(point));
    assert_eq!(point.with_minimum_extent(Positive::ONE), None);

    // The mirror image at the low end refuses for the low corner.
    let low = Bounds2::new(Vec2::new(-f32::MAX, 0.0), Vec2::new(-f32::MAX, 0.0))
        .expect("a point at the range edge is a valid box");
    assert_eq!(low.with_minimum_extent(Positive::ONE), None);
}

#[test]
fn growth_representability() {
    let flat =
        Bounds2::new(Vec2::ZERO, Vec2::new(f32::MAX, 0.0)).expect("corners are finite and ordered");
    let half_max = f32::MAX / 2.0;

    // Ratio 1 wants y = [-MAX/2, MAX/2], both representable. x keeps its corners.
    let square = flat
        .with_aspect_ratio(Positive::ONE)
        .expect("the grown corners lie inside the `f32` range");
    assert_eq!(square.min(), Vec2::new(0.0, -half_max));
    assert_eq!(square.max(), Vec2::new(f32::MAX, half_max));

    // Spanning the whole range, ratio 1 wants y = [-MAX, MAX] exactly, and ratio 1/2 wants twice
    // that.
    let full = Bounds2::new(Vec2::new(-f32::MAX, 0.0), Vec2::new(f32::MAX, 0.0))
        .expect("corners are finite and ordered");
    assert_eq!(
        full.with_aspect_ratio(Positive::ONE),
        Bounds2::new(Vec2::splat(-f32::MAX), Vec2::splat(f32::MAX))
    );
    assert_eq!(full.with_aspect_ratio(positive!(0.5)), None);

    // a four percent margin exceeds the range for a box reaching MAX, but fits at MAX/2.
    let margin = positive!(1.04);
    let reaching_max =
        Bounds2::new(Vec2::ZERO, Vec2::new(f32::MAX, 1.0)).expect("corners are finite and ordered");
    assert_eq!(reaching_max.scaled_about_centre(margin), None);

    let reaching_half =
        Bounds2::new(Vec2::ZERO, Vec2::new(half_max, 1.0)).expect("corners are finite and ordered");
    let widened = reaching_half
        .scaled_about_centre(margin)
        .expect("the scaled corners lie inside the `f32` range");
    assert!(widened.contains(reaching_half.min()) && widened.contains(reaching_half.max()));
    // The intent as the rounding contract states it: the extent scaled, and each corner shifted
    // by half the change.
    let extent = f64::from(half_max);
    let shift = (extent * f64::from(margin) - extent) * 0.5;
    assert_axis_encloses_tightly(widened.min().x(), widened.max().x(), -shift, extent + shift);
}

#[test]
fn minimum_extent_absorbed_shift() {
    let half_max = f32::MAX / 2.0;
    let point =
        Bounds2::new(Vec2::splat(half_max), Vec2::splat(half_max)).expect("a point is a valid box");

    // The `f64` ulp at MAX/2 is 2⁷⁴. A shift of 0.5 rounds away, and each corner steps one `f32`.
    let widened = point
        .with_minimum_extent(Positive::ONE)
        .expect("one step in each direction stays inside the `f32` range");
    assert_eq!(widened.min(), Vec2::splat(half_max.next_down()));
    assert_eq!(widened.max(), Vec2::splat(half_max.next_up()));
}

#[test]
fn scaling_adjacent_corners() {
    let sliver = Bounds2::new(Vec2::new(1.0, 0.0), Vec2::new(1.0_f32.next_up(), 4.0))
        .expect("corners are finite and ordered");

    let halved = sliver
        .scaled_about_centre(positive!(0.5))
        .expect("shrinking stays inside the `f32` range");
    assert_eq!(halved.min(), Vec2::new(1.0, 1.0));
    assert_eq!(halved.max(), Vec2::new(1.0_f32.next_up(), 3.0));
}

#[test]
fn minimum_extent_inexact_corners() {
    let point = Bounds2::new(Vec2::splat(0.1), Vec2::splat(0.1)).expect("a point is a valid box");

    let widened = point
        .with_minimum_extent(Positive::ONE)
        .expect("the widened corners are far inside the `f32` range");
    let (low, high) = (f64::from(0.1_f32) - 0.5, f64::from(0.1_f32) + 0.5);
    assert_axis_encloses_tightly(widened.min().x(), widened.max().x(), low, high);
    assert!(f64::from(widened.max().x()) - f64::from(widened.min().x()) >= 1.0);
}

#[test]
fn aspect_ratio_rounded_shift() {
    let corner = 2.0_f32.powi(60);
    // height 2³⁸ + 64 requires an x shift of 2³⁷ + 32. The f64 spacing at 2⁶⁰ is 128 below
    // and 256 above. Both shifted corners round onto the f32 values 2⁶⁰ ∓ 2³⁷.
    let bounds = Bounds2::new(
        Vec2::new(corner, -64.0),
        Vec2::new(corner, 2.0_f32.powi(38)),
    )
    .expect("corners are finite and ordered");

    let grown = bounds
        .with_aspect_ratio(Positive::ONE)
        .expect("the grown corners are far inside the `f32` range");
    assert_eq!(grown.min().x(), corner - 2.0_f32.powi(37));
    assert_eq!(grown.max().x(), corner + 2.0_f32.powi(37));
    assert!(grown.contains(bounds.min()) && grown.contains(bounds.max()));

    let target = f64::from(2.0_f32.powi(38)) + 64.0;
    let reached = f64::from(grown.max().x()) - f64::from(grown.min().x());
    assert_eq!(target - reached, 64.0);
    assert!(target - reached < 2.0_f64.powi(-50) * f64::from(corner));
}

/// Asserts an axis is the tightest `f32` enclosure of `[low, high]`: each corner lies on the
/// outward side of its bound and its inward neighbour does not.
///
/// # Panics
///
/// Panics when either corner fails the enclosure or nearest-neighbour condition.
#[track_caller]
fn assert_axis_encloses_tightly(min: f32, max: f32, low: f64, high: f64) {
    assert!(
        f64::from(min) <= low && f64::from(min.next_up()) > low,
        "{min} is not the largest f32 at or below {low}",
    );
    assert!(
        f64::from(max) >= high && f64::from(max.next_down()) < high,
        "{max} is not the smallest f32 at or above {high}",
    );
}

#[test]
fn quantize_maps_onto_the_axis_grid_and_clamps_outside_points() {
    let bounds = Bounds2::new(Vec2::ZERO, Vec2::new(1.0, 1.0)).expect("the corners are ordered");

    // the unit interval's midpoint scales to exactly 2³¹. The maximum endpoint clamps to
    // `u32::MAX`, while the minimum maps to zero.
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
fn from_slice_par_matches_serial() {
    // Spans three parallel chunks (chunk size is 4096).
    let points = scattered_points(10_000);

    assert_eq!(
        Bounds2::from_slice_par(&points),
        Bounds2::from_slice(&points),
    );
    assert_eq!(Bounds2::from_slice_par(&[]), None);
}

/// A NaN deep in a later parallel chunk makes `from_slice_par` return `None`.
#[test]
fn from_slice_par_poisons_on_non_finite_in_any_chunk() {
    let mut points = scattered_points(10_000);
    // Deep in a later chunk.
    points[9_500] = Vec2::splat(f32::NAN);

    assert_eq!(Bounds2::from_slice_par(&points), None);
}

/// `fit` maps the layout's corners and centre onto the viewport's within rounding, the batched
/// application agrees with the scalar one, and every mapped point lies inside the viewport up to
/// an ulp-scale margin.
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

/// `fit` returns `None` for a zero-extent axis and `Some` once `with_minimum_extent` has widened
/// it.
#[test]
fn fit_rejects_degenerate_extents_until_widened() {
    let target =
        Bounds2::new(Vec2::ZERO, Vec2::splat(1.0)).expect("corners are finite and ordered");
    let collinear = Bounds2::from_points([Vec2::new(3.0, 0.0), Vec2::new(3.0, 4.0)])
        .expect("points are finite and non-empty");

    assert!(collinear.fit(target).is_none());
    assert!(
        collinear
            .with_minimum_extent(Positive::ONE)
            .expect("the widened corners are far inside the `f32` range")
            .fit(target)
            .is_some()
    );
}

/// `normalize_into` lands the corners and centre exactly on the target's, since it computes the
/// unit coordinate before scaling.
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

/// `normalize_into` maps a zero-extent axis to the target's centre while the other axis maps
/// affinely.
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

/// A unit box at `2¹⁴` maps its quarter point exactly to `-0.5` through the per-axis `f64` map,
/// where an `f32` scale-translate composition would cancel.
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

/// The image of a proper box in a frame is the frame itself.
#[test]
fn image_in_proper_box() {
    let world = Bounds2::new(Vec2::new(-4.0, -2.0), Vec2::new(8.0, 6.0))
        .expect("corners are finite and ordered");
    let frame =
        Bounds2::new(Vec2::splat(-1.0), Vec2::splat(1.0)).expect("corners are finite and ordered");

    assert_eq!(world.image_in(frame), frame);
}

/// The image of a zero-extent axis in a viewport is that viewport's centre line on that axis.
#[test]
fn image_in_degenerate_axis() {
    let collinear = Bounds2::new(Vec2::new(3.0, -2.0), Vec2::new(3.0, 6.0))
        .expect("a zero-extent axis is a valid box");
    let viewport =
        Bounds2::new(Vec2::ZERO, Vec2::new(10.0, 4.0)).expect("corners are finite and ordered");

    assert_eq!(
        collinear.image_in(viewport),
        Bounds2::new(Vec2::new(5.0, 0.0), Vec2::new(5.0, 4.0)).expect("the image is ordered")
    );
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

/// The image of a point set's tight box is the tight box of the normalized set.
#[property_test]
fn image_in_normalized_extent(
    #[strategy = points_strategy()] points: Vec<Vec2>,
    #[strategy = bounds_strategy()] frame: Bounds2,
) {
    prop_assume!(!points.is_empty());

    let world = Bounds2::from_points(points.iter().copied())
        .expect("in-range points are finite and non-empty");
    let normalized = Bounds2::from_points(world.normalize_into(frame, &points))
        .expect("the mapped points are finite");

    prop_assert_eq!(normalized, world.image_in(frame));
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
    let tolerance = 4e-3 * magnitude.at_least(positive!(1.0));
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

/// Returns the spacing just above a corner's magnitude in the `f32` grid.
///
/// The outward rounding of a corner moves it by less than one grid step at the result, and the
/// step just above a magnitude is never smaller than the step just below it. This bounds the move
/// for a corner of either sign.
fn ulp(corner: f32) -> f64 {
    f64::from(corner.abs().next_up()) - f64::from(corner.abs())
}

/// Computes the extent after widening an axis's corners to `f64`.
fn extent_of(low: f32, high: f32) -> f64 {
    f64::from(high) - f64::from(low)
}

/// Asserts an axis reached `target` as the rounding contract promises: its extent lies between the
/// target less the intent's `f64` residual and the target plus one ulp of each corner.
///
/// # Panics
///
/// Panics when the represented extent falls outside the stated bounds.
#[track_caller]
fn assert_axis_reaches(low: f32, high: f32, target: f64) {
    let reached = extent_of(low, high);
    let residual = 2.0_f64.powi(-50) * f64::from(low.abs().max(high.abs()));

    assert!(
        reached >= target - residual,
        "[{low}, {high}] measures {reached}, short of {target} by more than the residual \
         {residual}",
    );
    assert!(
        reached <= target + ulp(low) + ulp(high),
        "[{low}, {high}] measures {reached}, over {target} by more than an ulp per corner",
    );
}

/// Asserts the represented midpoint moved from the original's by less than one ulp of the larger
/// corner, the bound the outward rounding of two corners allows.
///
/// # Panics
///
/// Panics when either midpoint moves by at least the stated bound.
#[track_caller]
fn assert_midpoint_within_an_ulp(original: Bounds2, resized: Bounds2) {
    for (before, after, bound) in [
        (
            f64::midpoint(f64::from(original.min().x()), f64::from(original.max().x())),
            f64::midpoint(f64::from(resized.min().x()), f64::from(resized.max().x())),
            ulp(resized.min().x()).max(ulp(resized.max().x())),
        ),
        (
            f64::midpoint(f64::from(original.min().y()), f64::from(original.max().y())),
            f64::midpoint(f64::from(resized.min().y()), f64::from(resized.max().y())),
            ulp(resized.min().y()).max(ulp(resized.max().y())),
        ),
    ] {
        assert!(
            (after - before).abs() < bound,
            "midpoint moved from {before} to {after}, at least an ulp {bound}",
        );
    }
}

#[property_test]
fn aspect_ratio_growth_laws(
    #[strategy = bounds_strategy()] bounds: Bounds2,
    #[strategy = factor_strategy()] ratio: Positive,
) {
    let grown = bounds
        .with_aspect_ratio(ratio)
        .expect("corners in -1e3..1e3 grown by a ratio in 1e-2..1e2 stay inside the `f32` range");

    prop_assert!(
        grown.contains(bounds.min()) && grown.contains(bounds.max()),
        "{grown:?} does not contain {bounds:?}",
    );
    assert_midpoint_within_an_ulp(bounds, grown);

    let width = extent_of(bounds.min().x(), bounds.max().x());
    let height = extent_of(bounds.min().y(), bounds.max().y());
    let ratio = f64::from(ratio);
    if width < height * ratio {
        prop_assert_eq!(
            (grown.min().y(), grown.max().y()),
            (bounds.min().y(), bounds.max().y()),
        );
        assert_axis_reaches(grown.min().x(), grown.max().x(), height * ratio);
    } else {
        prop_assert_eq!(
            (grown.min().x(), grown.max().x()),
            (bounds.min().x(), bounds.max().x()),
        );
        assert_axis_reaches(
            grown.min().y(),
            grown.max().y(),
            (width / ratio).max(height),
        );
    }
}

#[property_test]
fn scaling_containment_laws(
    #[strategy = bounds_strategy()] bounds: Bounds2,
    #[strategy = factor_strategy()] factor: Positive,
) {
    let scaled = bounds
        .scaled_about_centre(factor)
        .expect("corners in -1e3..1e3 scaled by a factor in 1e-2..1e2 stay inside the `f32` range");

    let scale = f64::from(factor);
    assert_axis_reaches(
        scaled.min().x(),
        scaled.max().x(),
        extent_of(bounds.min().x(), bounds.max().x()) * scale,
    );
    assert_axis_reaches(
        scaled.min().y(),
        scaled.max().y(),
        extent_of(bounds.min().y(), bounds.max().y()) * scale,
    );
    assert_midpoint_within_an_ulp(bounds, scaled);

    let (outer, inner) = if factor >= Positive::ONE {
        (scaled, bounds)
    } else {
        (bounds, scaled)
    };
    prop_assert!(
        outer.contains(inner.min()) && outer.contains(inner.max()),
        "{outer:?} does not contain {inner:?}",
    );
}

/// Generates a box with its `x` axis collapsed onto a line.
///
/// The `y` axis keeps the well-conditioned extent of [`bounds_strategy`].
fn collinear_strategy() -> impl Strategy<Value = Bounds2> {
    bounds_strategy().prop_map(|bounds| {
        Bounds2::new(bounds.min(), Vec2::new(bounds.min().x(), bounds.max().y()))
            .expect("collapsing an axis keeps the corners ordered")
    })
}

#[property_test]
fn minimum_extent_growth_laws(
    #[strategy = collinear_strategy()] bounds: Bounds2,
    #[strategy = factor_strategy()] minimum: Positive,
) {
    let widened = bounds
        .with_minimum_extent(minimum)
        .expect("corners in -1e3..1e3 widened by at most 1e2 stay inside the `f32` range");

    prop_assert!(
        widened.contains(bounds.min()) && widened.contains(bounds.max()),
        "{widened:?} does not contain {bounds:?}",
    );
    assert_midpoint_within_an_ulp(bounds, widened);

    let minimum = f64::from(minimum);
    assert_axis_reaches(widened.min().x(), widened.max().x(), minimum);

    let height = extent_of(bounds.min().y(), bounds.max().y());
    if height >= minimum {
        prop_assert_eq!(
            (widened.min().y(), widened.max().y()),
            (bounds.min().y(), bounds.max().y()),
        );
    } else {
        assert_axis_reaches(widened.min().y(), widened.max().y(), minimum);
    }
}

/// The tests the `miri` nextest profile selects.
///
/// Each test here reduces point slices through the batched kernel at every alignment offset and
/// remainder length, beside the scalar path. The profile selects by module path, so moving a test
/// in or out of this module is the whole edit.
mod miri {
    use super::scattered_points;
    use crate::math::{Bounds2, Vec2};

    /// `from_slice` equals `from_points` for lengths 0, 1, 3, 4, 5, 8 and 11, covering the empty,
    /// remainder-only, exact-batch and mixed paths.
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

    /// `from_slice` equals `from_points` for every start offset across a batch stride.
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

    /// A NaN or infinity in the batched body or the remainder makes `from_slice` return `None`.
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
}
