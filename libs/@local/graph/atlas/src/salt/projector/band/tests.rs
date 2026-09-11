//! Certificates for the band projection and its enforcement record.
//!
//! Dyadic fixtures make every pre-projection reading exact - distances, normalized maxima, and
//! overshoots are exactly representable - the record therefore asserts exact contracts. The landing
//! point itself carries the documented margin, so its assertions bound rather than pin.

#![expect(
    clippy::float_cmp,
    reason = "the dyadic fixtures produce exactly representable readings, so the asserted \
              constants are exact contracts"
)]

use hashql_core::id::{Id as _, IdSlice};

use super::{BandProjection, BandRefusal};
use crate::{
    identity::NodeRowId,
    math::{DNonNegative, DPositive, DVec2, FinitePointField, NonFinitePoint, Positive, Vec2},
};

/// Boxes a finite point set as the freeze's proven-finite centre.
fn boxed_field(points: Box<[Vec2]>) -> Box<FinitePointField<NodeRowId>> {
    FinitePointField::new_boxed_unchecked(IdSlice::from_boxed_slice(points))
}

/// Views a finite live array as the enforcement field.
fn field(points: &mut [Vec2]) -> &mut FinitePointField<NodeRowId> {
    FinitePointField::new_unchecked_mut(IdSlice::from_raw_mut(points))
}

fn positive(value: f32) -> Positive {
    Positive::new(value).expect("test value is positive")
}

/// The centres reach an extent of `8.5`, making the margin `17 · 2⁻²³`. That clears the
/// headroom bar with room to spare, and the freeze admits the radius `0.5` (`β = 0.25`,
/// `s_ref = 2`).
const CENTRES: [Vec2; 6] = [
    Vec2::new(0.0, 0.0),
    Vec2::new(8.0, 0.0),
    Vec2::new(0.0, 8.0),
    Vec2::new(-8.0, 0.0),
    Vec2::new(0.0, -8.0),
    Vec2::new(8.0, 8.0),
];

/// One live row per centre. Rows 0 and 4 sit past the radius (displacements `1.25` and
/// `0.625`), row 1 sits exactly on it (legal, unclipped), and the rest sit inside. The batch
/// path covers rows 0 through 3 and the remainder path rows 4 and 5, with a clip on each.
const LIVE: [Vec2; 6] = [
    Vec2::new(0.75, 1.0),
    Vec2::new(8.0, 0.5),
    Vec2::new(0.125, 8.0),
    Vec2::new(-8.0, 0.0),
    Vec2::new(0.375, -8.5),
    Vec2::new(8.25, 8.0),
];

fn fixture() -> BandProjection<NodeRowId> {
    BandProjection::freeze(
        boxed_field(Box::new(CENTRES)),
        positive(0.25),
        positive(2.0),
    )
    .expect("the fixture is a valid constraint")
}

fn displacement(row: Vec2, centre: Vec2) -> f64 {
    let along_x = f64::from(row.x()) - f64::from(centre.x());
    let along_y = f64::from(row.y()) - f64::from(centre.y());
    along_x.hypot(along_y)
}

/// The freeze lands every declared constant exactly, and a fresh record is born zero over the
/// whole row domain.
#[test]
fn freezes_the_reconstruction_and_opens_a_zero_record() {
    let projection = fixture();

    assert_eq!(projection.len(), 6);
    assert_eq!(projection.dimensionless_radius().get(), 0.25);
    assert_eq!(projection.reference_spread().get(), 2.0);
    assert_eq!(projection.radius().get(), 0.5);
    assert_eq!(projection.centre()[NodeRowId::new(5)], Vec2::new(8.0, 8.0));

    let record = projection.open_record(7);
    assert!(!record.ever_clipped());
    assert_eq!(record.clipped_row_applications(), 0);
    assert_eq!(record.max_overshoot(), DNonNegative::ZERO);
    assert_eq!(record.opened_at(), 7);
    assert_eq!(record.last_application(), None);
    assert!(
        record
            .row_maxima()
            .iter()
            .all(|&maximum| maximum == DNonNegative::ZERO)
    );
}

/// One application clips exactly the two out-of-band rows and records their exact
/// pre-projection readings. Every in-band row keeps its bytes, the row exactly on the radius
/// included.
#[test]
fn enforces_per_row_and_records_the_pre_projection_readings() {
    let projection = fixture();
    let mut record = projection.open_record(7);
    let mut live = LIVE;

    projection.apply(field(&mut live), 9, &mut record);

    // The record's readings are exact: u = d / s_ref pre-projection, per row.
    assert!(record.ever_clipped());
    assert_eq!(record.clipped_row_applications(), 2);
    assert_eq!(record.max_overshoot().get(), 0.375);
    assert_eq!(record.opened_at(), 7);
    assert_eq!(record.last_application(), Some(9));
    let expected = [0.625, 0.25, 0.0625, 0.0, 0.3125, 0.125];
    for (row, &maximum) in expected.iter().enumerate() {
        assert_eq!(
            record.row_maxima()[NodeRowId::from_usize(row)].get(),
            maximum,
            "row {row}"
        );
    }

    // In-band rows keep their exact bytes, on-the-radius row 1 included.
    for row in [1_usize, 2, 3, 5] {
        assert_eq!(live[row], LIVE[row], "row {row}");
    }

    // Clipped rows land inside the radius, within one documented margin of it, along their own
    // pre-projection direction.
    for row in [0_usize, 4] {
        let centre = CENTRES[row];
        let landed = displacement(live[row], centre);
        assert!(landed <= 0.5, "row {row} landed at {landed}");
        assert!(landed >= 0.5 - 1e-5, "row {row} landed at {landed}");

        let pre_x = f64::from(LIVE[row].x()) - f64::from(centre.x());
        let pre_y = f64::from(LIVE[row].y()) - f64::from(centre.y());
        let post_x = f64::from(live[row].x()) - f64::from(centre.x());
        let post_y = f64::from(live[row].y()) - f64::from(centre.y());
        // Narrowing the landed point moves each component by up to half an f32 ulp of its own
        // magnitude (about `5e-7` at this fixture's coordinates near 8), so the cross reading
        // bounds rather than pins.
        let cross = pre_y.mul_add(-post_x, pre_x * post_y).abs();
        assert!(cross <= 1e-6, "row {row} left its direction by {cross}");
    }
}

/// A second application over the projected field moves nothing: the landing margin keeps every
/// clipped row strictly inside, so re-enforcement cannot inflate the record by rounding.
#[test]
fn a_projected_field_re_reads_as_inside() {
    let projection = fixture();
    let mut record = projection.open_record(7);
    let mut live = LIVE;

    projection.apply(field(&mut live), 9, &mut record);
    let projected = live;
    let maxima_after_first: Vec<DNonNegative> = record.row_maxima().iter().copied().collect();

    projection.apply(field(&mut live), 10, &mut record);

    assert_eq!(live, projected);
    // The once-clipped rows re-read as interior through the per-row form too, so a deposit
    // after this application composes through the identity.
    for (row, &value) in projected.iter().enumerate() {
        let (unmoved, clip) = projection.project(NodeRowId::from_usize(row), value);
        assert_eq!(unmoved, value, "row {row}");
        assert!(clip.is_none(), "row {row}");
    }
    assert_eq!(record.clipped_row_applications(), 2);
    assert_eq!(record.max_overshoot().get(), 0.375);
    assert_eq!(record.last_application(), Some(10));
    assert_eq!(record.row_maxima().as_raw(), &*maxima_after_first);
}

/// The running maxima keep a mid-run excursion that returns before the end: the reading a
/// radius would censor, visible although the final position sits inside.
#[test]
fn running_maxima_keep_the_transient_excursion() {
    let projection = BandProjection::freeze(
        boxed_field(Box::new([Vec2::new(0.0, 0.0)])),
        positive(0.25),
        positive(2.0),
    )
    .expect("the single-row fixture is a valid constraint");
    let mut record = projection.open_record(3);
    let row = NodeRowId::new(0);

    let mut live = [Vec2::new(0.0, 0.375)];
    projection.apply(field(&mut live), 4, &mut record);
    assert_eq!(record.row_maxima()[row].get(), 0.1875);
    assert!(!record.ever_clipped());

    live[0] = Vec2::new(0.0, 1.25);
    projection.apply(field(&mut live), 5, &mut record);
    assert_eq!(record.clipped_row_applications(), 1);
    assert_eq!(record.max_overshoot().get(), 0.375);
    assert!(displacement(live[0], Vec2::new(0.0, 0.0)) <= 0.5);

    live[0] = Vec2::new(0.0, 0.25);
    projection.apply(field(&mut live), 6, &mut record);

    // The excursion's exact pre-projection reading survives the return.
    assert_eq!(record.row_maxima()[row].get(), 0.625);
    assert_eq!(record.clipped_row_applications(), 1);
    assert_eq!(record.opened_at(), 3);
    assert_eq!(record.last_application(), Some(6));
}

/// A non-finite row refuses at the field's construction, naming the smallest offender, so a
/// diverged field never reaches enforcement and the record stays untouched.
#[test]
fn non_finite_row_refuses_at_construction() {
    let projection = fixture();
    let record = projection.open_record(7);
    let mut live = LIVE;
    live[2] = Vec2::new(f32::NAN, 0.0);

    assert_eq!(
        FinitePointField::new(IdSlice::<NodeRowId, _>::from_raw(&live)),
        Err(NonFinitePoint {
            id: NodeRowId::new(2)
        })
    );
    assert!(!record.ever_clipped());
    assert_eq!(record.last_application(), None);
    assert!(
        record
            .row_maxima()
            .iter()
            .all(|&maximum| maximum == DNonNegative::ZERO)
    );
}

/// The per-row projection and the whole-field application share one clip law. Clip decisions
/// match row for row and a clipped row reads identical bytes through both, with the derivative
/// tied to the landing the row actually took.
#[test]
fn the_per_row_projection_matches_the_application_row_for_row() {
    let projection = fixture();
    let mut record = projection.open_record(7);
    let mut live = LIVE;

    projection.apply(field(&mut live), 9, &mut record);

    // Interior rows and the on-radius row read the identity through the per-row form.
    for row in [1_usize, 2, 3, 5] {
        let (value, clip) = projection.project(NodeRowId::from_usize(row), LIVE[row]);
        assert_eq!(value, LIVE[row], "row {row}");
        assert!(clip.is_none(), "row {row}");
    }

    // Both clipped rows read bit-identical bytes through the per-row form.
    for row in [0_usize, 4] {
        let (value, clip) = projection.project(NodeRowId::from_usize(row), LIVE[row]);
        assert_eq!(value, live[row], "row {row}");
        assert!(clip.is_some(), "row {row}");
    }

    // Row 4: d = (0.375, -0.5) from its centre, ‖d‖ = 0.625 exactly. The direction is unit
    // and parallel to d, and factor·‖d‖ recovers the landing radius the row moved to, read
    // back from the landed position within the f32 narrowing allowance.
    let (_, clip) = projection.project(NodeRowId::new(4), LIVE[4]);
    let state = clip.expect("row 4 clipped");
    let unit_error = (state.direction.dot(state.direction).into_raw() - 1.0).abs();
    assert!(unit_error < 1e-15, "direction off unit by {unit_error}");
    let cross = state
        .direction
        .x()
        .mul_add(-0.5, -(state.direction.y() * 0.375))
        .abs();
    assert!(cross < 1e-15, "direction off its ray by {cross}");
    let landing = state.factor * 0.625;
    let landed = displacement(live[4], CENTRES[4]);
    assert!(
        (landing - landed).abs() < 1e-6,
        "factor names landing {landing}, the row landed at {landed}"
    );
}

/// The clip Jacobian is the exact derivative of the applied map: on an axis-aligned clip the
/// radial force dies to exactly zero and a tangential force scales by exactly the factor.
#[test]
fn the_clip_jacobian_kills_radial_force_exactly() {
    let projection = BandProjection::<NodeRowId>::freeze(
        boxed_field(Box::new([Vec2::new(0.0, 0.0)])),
        positive(0.25),
        positive(2.0),
    )
    .expect("the single-row fixture is a valid constraint");

    let (landed, clip) = projection.project(NodeRowId::new(0), Vec2::new(0.0, 1.25));

    // The direction is exact on the axis: 0/1.25 and 1.25/1.25 are exact divisions.
    let state = clip.expect("the row clipped");
    assert_eq!(state.direction, DVec2::new(0.0, 1.0));

    // A purely radial force dies exactly: its tangential remainder is the zero vector.
    assert_eq!(state.transform(DVec2::new(0.0, 3.0)), DVec2::ZERO);

    // A tangential force keeps its direction and scales by exactly the factor.
    assert_eq!(
        state.transform(DVec2::new(5.0, 0.0)),
        DVec2::new(5.0 * state.factor, 0.0)
    );

    // The factor is the landing over the pre-clip distance: the landed row reads it back.
    let landing = state.factor * 1.25;
    assert!((landing - f64::from(landed.y())).abs() < 1e-6);
}

/// The Jacobian matches finite differences of the map it claims to differentiate, on a
/// generic non-axis-aligned clip.
#[test]
fn the_clip_jacobian_matches_the_map_derivative() {
    let projection = fixture();

    let (_, clip) = projection.project(NodeRowId::new(0), LIVE[0]);

    // Row 0: centre (0, 0), pre-clip position (0.75, 1.0), ‖d‖ = 1.25 exactly. The mirror
    // states the applied map with the landing the state itself names, so the derivative under
    // test is the map's own.
    let state = clip.expect("row 0 clipped");
    let landing = state.factor * 1.25;
    let map = |x: f64, y: f64| {
        let norm = x.hypot(y);
        (landing * x / norm, landing * y / norm)
    };

    let step = 1e-4;
    let position = (0.75_f64, 1.0_f64);
    for component in 0..2 {
        let (mut plus, mut minus) = (position, position);
        if component == 0 {
            plus.0 += step;
            minus.0 -= step;
        } else {
            plus.1 += step;
            minus.1 -= step;
        }
        let above = map(plus.0, plus.1);
        let below = map(minus.0, minus.1);
        let column = (
            (above.0 - below.0) / (2.0 * step),
            (above.1 - below.1) / (2.0 * step),
        );

        let basis = if component == 0 {
            DVec2::new(1.0, 0.0)
        } else {
            DVec2::new(0.0, 1.0)
        };
        let evaluated = state.transform(basis);
        assert!(
            (evaluated.x() - column.0).abs() < 1e-8 && (evaluated.y() - column.1).abs() < 1e-8,
            "component {component}: ({}, {}) vs ({}, {})",
            evaluated.x(),
            evaluated.y(),
            column.0,
            column.1
        );
    }
}

/// The reconstructed radius must be a strictly positive f32: an overflowing product and an
/// underflowing one both refuse, each carrying the exact double-precision value.
#[test]
fn a_radius_outside_the_value_domain_refuses() {
    let centre: Box<[Vec2]> = Box::new([Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0)]);

    let overflowed = BandProjection::<NodeRowId>::freeze(
        boxed_field(centre.clone()),
        positive(f32::MAX),
        positive(f32::MAX),
    );
    assert_eq!(
        overflowed,
        Err(BandRefusal::RadiusOutOfDomain {
            radius: DPositive::new_unchecked(f64::from(f32::MAX) * f64::from(f32::MAX)),
        })
    );

    let underflowed = BandProjection::<NodeRowId>::freeze(
        boxed_field(centre),
        positive(2.0_f32.powi(-126)),
        positive(2.0_f32.powi(-126)),
    );
    assert_eq!(
        underflowed,
        Err(BandRefusal::RadiusOutOfDomain {
            radius: DPositive::new_unchecked(2.0_f64.powi(-252)),
        })
    );
}

/// An extent past the finite f32 range is refused, because a projected row there could narrow
/// to infinity. The radius must be commensurate with the largest centre to trip it - a smaller
/// excess is absorbed by the f64 sum, and an absorbable excess sits provably below the half-ulp
/// that narrowing to `f32::MAX` tolerates.
#[test]
fn an_extent_past_the_finite_range_refuses() {
    let refused = BandProjection::<NodeRowId>::freeze(
        boxed_field(Box::new([Vec2::new(f32::MAX, 0.0), Vec2::new(0.0, 0.0)])),
        positive(1.0),
        positive(2.0_f32.powi(127)),
    );

    assert_eq!(
        refused,
        Err(BandRefusal::RepresentationCeiling {
            extent: DPositive::new(f64::from(f32::MAX) + 2.0_f64.powi(127))
                .expect("the overflowing extent is positive"),
        })
    );
}

/// A radius below the landing margin's headroom refuses: centres at `2²⁰` and a radius of `128`
/// leave the margin `2⁻²² · (2²⁰ + 128)`, whose headroom `256.03125` exceeds the radius.
#[test]
fn a_radius_below_the_margin_headroom_refuses() {
    let refused = BandProjection::<NodeRowId>::freeze(
        boxed_field(Box::new([
            Vec2::new(2.0_f32.powi(20), 0.0),
            Vec2::new(0.0, 0.0),
        ])),
        positive(1.0),
        positive(128.0),
    );

    assert_eq!(
        refused,
        Err(BandRefusal::RepresentationFloor {
            radius: positive(128.0),
            floor: DPositive::new(256.03125).expect("the headroom reading is positive"),
        })
    );
}

/// Near the bottom of the f32 range the absolute margin floor takes over from the extent scale:
/// a subnormal radius of `2⁻¹³⁵` refuses against the floor's headroom `2⁻¹³⁰`, which the
/// extent-scaled margin alone would have admitted.
#[test]
fn the_margin_floor_binds_for_subnormal_radii() {
    let refused = BandProjection::<NodeRowId>::freeze(
        boxed_field(Box::new([
            Vec2::new(2.0_f32.powi(-120), 0.0),
            Vec2::new(0.0, 0.0),
        ])),
        positive(2.0_f32.powi(-35)),
        positive(2.0_f32.powi(-100)),
    );

    // Built as the freeze builds it: `powi(-135)` alone routes through an overflowing positive
    // power and returns zero, while the product of two representable powers is the exact
    // subnormal.
    let radius = 2.0_f32.powi(-35) * 2.0_f32.powi(-100);
    assert_eq!(
        refused,
        Err(BandRefusal::RepresentationFloor {
            radius: positive(radius),
            floor: DPositive::new(2.0_f64.powi(-130)).expect("the floor's headroom is positive"),
        })
    );
}

/// The saturation floor recovers the freeze's exact margin and sits two of them inside the
/// radius. Every quantity in this fixture is dyadic, so the assert is an exact contract.
#[test]
fn saturation_floor_sits_two_margins_inside_the_radius() {
    let projection = fixture();

    // Extent 8.5 at radius 0.5 makes the margin 17 · 2⁻²³, above the absolute floor.
    let margin = 17.0 * (-23.0_f64).exp2();
    let floor = 2.0_f64.mul_add(-margin, 0.5);

    assert_eq!(projection.saturation_floor_squared(), floor * floor);
}
