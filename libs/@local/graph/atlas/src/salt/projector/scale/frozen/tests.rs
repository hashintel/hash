//! Certificates for the frozen ruler.
//!
//! Exact-arithmetic fixtures pin the freeze's readings. Medians, quantiles, and the reference
//! spread are exactly representable, so the asserted constants are exact contracts rather than
//! tolerances.

#![expect(
    clippy::float_cmp,
    reason = "fixtures use exactly representable values, so the asserted constants are exact \
              contracts"
)]

use core::assert_matches;

use hashql_core::id::{Id as _, IdSlice};

use super::{FrozenRuler, InvalidRuler, RulerFloor, RulerParameters};
use crate::{
    identity::NodeRowId,
    math::{
        DNonNegative, DPositive, FinitePointField, NonNegative, Positive, PositiveUnitFraction,
        Vec2,
    },
    salt::knn::table::{Knn, KnnMatrix},
};

/// Views a finite coordinate array as the freeze's proven-finite boundary field.
fn frame(points: &[Vec2]) -> &FinitePointField<NodeRowId> {
    FinitePointField::new_unchecked(IdSlice::from_raw(points))
}

/// A neighbour table from per-row `(column, stored distance)` lists in ascending column
/// order. Every row lists the same count, and stored distances live in the cosine range.
fn table(rows: usize, entries: impl Fn(usize) -> Vec<(usize, f32)>) -> Knn<NodeRowId> {
    let mut indptr = vec![0_u64];
    let mut columns = Vec::new();
    let mut values = Vec::new();
    for row in 0..rows {
        for (column, distance) in entries(row) {
            columns.push(u32::try_from(column).expect("fixture columns fit u32"));
            values.push(NonNegative::new(distance).expect("fixture distances are in domain"));
        }
        indptr.push(u64::try_from(columns.len()).expect("fixture entries fit u64"));
    }
    let matrix = KnnMatrix::try_new((rows, rows), indptr, columns, values)
        .map_err(|(_, _, _, error)| error)
        .expect("the fixture matrix is structurally valid");
    Knn::new(matrix).expect("the fixture table is a valid neighbour table")
}

/// A table pairing consecutive twins, where each row's single stored neighbour is its partner.
fn twin_table(rows: usize) -> Knn<NodeRowId> {
    table(rows, |row| {
        vec![(
            if row.is_multiple_of(2) {
                row + 1
            } else {
                row - 1
            },
            0.5,
        )]
    })
}

fn params(epsilon_rel: f32, quantile: f64) -> RulerParameters {
    RulerParameters {
        epsilon_rel: Positive::new(epsilon_rel).expect("test epsilon is positive"),
        scale_quantile: PositiveUnitFraction::new(quantile)
            .expect("test quantile is a positive unit fraction"),
        floor: None,
    }
}

fn with_floor(
    mut parameters: RulerParameters,
    kappa_epsilon: f32,
    projection_band: f32,
) -> RulerParameters {
    parameters.floor = Some(RulerFloor {
        kappa_epsilon: Positive::new(kappa_epsilon).expect("test kappa is positive"),
        projection_band: Positive::new(projection_band).expect("test band is positive"),
    });
    parameters
}

/// Rows at distance two read `ρ₀ = 2` each, `s_ref = 1`, and a window ceiling of `2` - every
/// declared constant is exact.
#[test]
fn freezes_scales_sets_and_constants_from_the_boundary_field() {
    let coordinates = [Vec2::new(0.0, 0.0), Vec2::new(2.0, 0.0)];

    let ruler = FrozenRuler::freeze(
        frame(&coordinates),
        &twin_table(2).view(),
        params(0.25, 0.5),
    )
    .expect("the fixture is a valid ruler");

    assert_eq!(ruler.len(), 2);
    assert_eq!(ruler.scales()[NodeRowId::new(0)].get(), 2.0);
    assert_eq!(ruler.scales()[NodeRowId::new(1)].get(), 2.0);
    assert_eq!(ruler.reference_spread().get(), 1.0);
    assert_eq!(ruler.epsilon_rel().get(), 0.25);
    assert_eq!(ruler.epsilon().get(), 0.25);
    assert_eq!(
        ruler.frozen_set(NodeRowId::new(0)).as_raw(),
        &[NodeRowId::new(1)]
    );
    // σ₀ = √((2+0.25)(2+0.25)) = 2.25, every step exactly representable.
    assert_eq!(
        ruler
            .denominator(NodeRowId::new(0), NodeRowId::new(1))
            .get(),
        2.25
    );
}

/// Seventeen rows make row 0's table sixteen entries wide, one more than the set uses. Row 1
/// carries the largest stored distance, so the frozen set is rows 2..=16 and the frozen
/// median over 2D distances `{2..16}` is 9. The live reading then follows the frozen set:
/// moving row 5 far away re-reads over the same indices and shifts the median to 10.
#[test]
fn live_scales_read_the_frozen_sets_not_a_reselection() {
    let rows = 17;
    let knn = table(rows, |row| {
        (0..rows)
            .filter(|&column| column != row)
            .map(|column| {
                if row == 0 && column == 1 {
                    (column, 1.75)
                } else {
                    (column, 0.25)
                }
            })
            .collect()
    });
    #[expect(
        clippy::cast_precision_loss,
        reason = "fixture rows are tiny integers, exactly representable"
    )]
    let boundary: Vec<Vec2> = (0..rows).map(|row| Vec2::new(row as f32, 0.0)).collect();

    let ruler = FrozenRuler::freeze(frame(&boundary), &knn.view(), params(0.125, 0.5))
        .expect("the fixture is a valid ruler");

    let expected: Vec<NodeRowId> = (2..rows).map(NodeRowId::from_usize).collect();
    assert_eq!(ruler.frozen_set(NodeRowId::new(0)).as_raw(), &*expected);
    assert_eq!(ruler.scales()[NodeRowId::new(0)].get(), 9.0);

    let mut live = boundary;
    live[5] = Vec2::new(100.0, 0.0);
    let scales = ruler
        .live_scales(frame(&live))
        .expect("the live fixture is finite");
    assert_eq!(scales[NodeRowId::new(0)].get(), 10.0);
}

/// Per-row displacements of at most one band move every frozen-set median by at most twice
/// the band: the staleness bound the frozen index sets exist to keep.
#[test]
fn staleness_stays_within_twice_the_band() {
    let rows = 17;
    let knn = table(rows, |row| {
        (0..rows)
            .filter(|&column| column != row)
            .map(|column| (column, 0.25))
            .collect()
    });
    #[expect(
        clippy::cast_precision_loss,
        reason = "fixture rows are tiny integers, exactly representable"
    )]
    let boundary: Vec<Vec2> = (0..rows).map(|row| Vec2::new(row as f32, 0.0)).collect();

    let ruler = FrozenRuler::freeze(frame(&boundary), &knn.view(), params(0.125, 0.5))
        .expect("the fixture is a valid ruler");

    let band = 0.25_f32;
    let live: Vec<Vec2> = boundary
        .iter()
        .enumerate()
        .map(|(row, point)| {
            let step = if row.is_multiple_of(2) { band } else { -band };
            Vec2::new(point.x() + step, point.y())
        })
        .collect();
    let scales = ruler
        .live_scales(frame(&live))
        .expect("the live fixture is finite");

    for row in 0..rows {
        let row = NodeRowId::from_usize(row);
        let drift = (scales[row].get() - ruler.scales()[row].get()).abs();
        assert!(drift <= 2.0 * band, "row {row} drifted {drift}");
    }
}

/// A coincident pair's denominator is exactly `ε`: `√(ε·ε)` round-trips in f32.
#[test]
fn coincident_rows_read_the_regularizer_exactly() {
    let coordinates = [
        Vec2::new(0.0, 0.0),
        Vec2::new(0.0, 0.0),
        Vec2::new(4.0, 0.0),
        Vec2::new(6.0, 0.0),
    ];

    let ruler = FrozenRuler::freeze(frame(&coordinates), &twin_table(4).view(), params(0.5, 0.5))
        .expect("the fixture is a valid ruler");

    assert_eq!(ruler.scales()[NodeRowId::new(0)].get(), 0.0);
    assert_eq!(ruler.scales()[NodeRowId::new(2)].get(), 2.0);
    assert_eq!(
        ruler.denominator(NodeRowId::new(0), NodeRowId::new(1)),
        ruler.epsilon()
    );
}

/// The lower test binds when the band artifact exists, inclusively at its edge.
#[test]
fn the_floor_binds_when_declared() {
    let coordinates = [Vec2::new(0.0, 0.0), Vec2::new(2.0, 0.0)];

    let refused = FrozenRuler::freeze(
        frame(&coordinates),
        &twin_table(2).view(),
        with_floor(params(0.25, 0.5), 2.0, 0.25),
    );
    assert_eq!(
        refused,
        Err(InvalidRuler::OutOfWindow {
            epsilon_rel: Positive::new(0.25).expect("the test epsilon is positive"),
            floor: Some(DPositive::new_unchecked(0.5)),
            ceiling: DNonNegative::new(2.0).expect("the test ceiling is non-negative"),
        })
    );

    FrozenRuler::freeze(
        frame(&coordinates),
        &twin_table(2).view(),
        with_floor(params(0.5, 0.5), 2.0, 0.25),
    )
    .expect("the epsilon sits exactly on the floor, inclusively");
}

/// The upper test binds at freeze time with no band declared, inclusively at its edge.
#[test]
fn the_ceiling_binds_at_freeze_time() {
    let coordinates = [Vec2::new(0.0, 0.0), Vec2::new(2.0, 0.0)];

    let refused = FrozenRuler::freeze(frame(&coordinates), &twin_table(2).view(), params(4.0, 0.5));
    assert_eq!(
        refused,
        Err(InvalidRuler::OutOfWindow {
            epsilon_rel: Positive::new(4.0).expect("the test epsilon is positive"),
            floor: None,
            ceiling: DNonNegative::new(2.0).expect("the test ceiling is non-negative"),
        })
    );

    FrozenRuler::freeze(frame(&coordinates), &twin_table(2).view(), params(2.0, 0.5))
        .expect("the epsilon sits exactly on the ceiling, inclusively");
}

/// An empty window refuses as its own reading, before any membership test.
#[test]
fn an_empty_window_refuses_before_membership() {
    let coordinates = [Vec2::new(0.0, 0.0), Vec2::new(2.0, 0.0)];

    let refused = FrozenRuler::freeze(
        frame(&coordinates),
        &twin_table(2).view(),
        with_floor(params(3.0, 0.5), 16.0, 0.25),
    );

    assert_eq!(
        refused,
        Err(InvalidRuler::EmptyWindow {
            floor: DPositive::new_unchecked(4.0),
            ceiling: DNonNegative::new(2.0).expect("the test ceiling is non-negative"),
        })
    );
}

/// Coincident twin pairs at two distinct locations give positive spread with every scale
/// zero, so no upper bound exists to read.
#[test]
fn an_all_coincident_corpus_has_no_upper_bound_to_read() {
    let coordinates = [
        Vec2::new(0.0, 0.0),
        Vec2::new(0.0, 0.0),
        Vec2::new(5.0, 0.0),
        Vec2::new(5.0, 0.0),
    ];

    let refused = FrozenRuler::freeze(
        frame(&coordinates),
        &twin_table(4).view(),
        params(0.25, 0.5),
    );

    assert_eq!(refused, Err(InvalidRuler::NoPositiveScale));
}

/// A field with every row at one point has no degree-one unit carrier.
#[test]
fn zero_spread_refuses_before_the_window() {
    let coordinates = [Vec2::new(1.0, 1.0), Vec2::new(1.0, 1.0)];

    let refused = FrozenRuler::freeze(
        frame(&coordinates),
        &twin_table(2).view(),
        params(0.25, 0.5),
    );

    assert_eq!(
        refused,
        Err(InvalidRuler::SpreadOutOfDomain { spread: 0.0 })
    );
}

/// A window-legal epsilon can still square below the value domain: `ε = 2⁻⁸¹` passes the
/// window (ceiling 2) and refuses at the representation floor.
#[test]
fn a_subrepresentable_epsilon_refuses() {
    let coordinates = [Vec2::new(0.0, 0.0), Vec2::new(2.0_f32.powi(-60), 0.0)];

    let refused = FrozenRuler::freeze(
        frame(&coordinates),
        &twin_table(2).view(),
        params(2.0_f32.powi(-20), 0.5),
    );

    assert_eq!(
        refused,
        Err(InvalidRuler::RepresentationFloor {
            epsilon_abs: DPositive::new_unchecked(2.0_f64.powi(-81)),
        })
    );
}

/// The densest pair's shifted product must stay finite: every reading here is finite -
/// `ρ₀ = 3·2⁶²`, `ε = 3·2⁶¹` - and the shifted square `(9·2⁶¹)² = 81·2¹²²` reaches past
/// `f32`, so the freeze refuses before any pair could overflow at runtime.
#[test]
fn an_overflowing_shifted_scale_refuses() {
    let coordinates = [Vec2::new(0.0, 0.0), Vec2::new(3.0 * 2.0_f32.powi(62), 0.0)];

    let refused = FrozenRuler::freeze(frame(&coordinates), &twin_table(2).view(), params(1.0, 0.5));

    assert_eq!(
        refused,
        Err(InvalidRuler::RepresentationCeiling {
            shifted_scale: DPositive::new_unchecked(9.0 * 2.0_f64.powi(61)),
        })
    );
}

/// The window's ceiling moves with the declared order statistic: positives `{2, 2, 4, 4}`
/// read 2 at the median and 4 at the upper quartile, so one `ε_rel` sits outside the first
/// window and inside the second.
#[test]
fn the_ceiling_follows_the_declared_quantile() {
    let coordinates = [
        Vec2::new(0.0, 0.0),
        Vec2::new(2.0, 0.0),
        Vec2::new(10.0, 0.0),
        Vec2::new(14.0, 0.0),
    ];

    let refused = FrozenRuler::freeze(frame(&coordinates), &twin_table(4).view(), params(0.5, 0.5));
    assert_matches!(refused, Err(InvalidRuler::OutOfWindow { floor: None, .. }));

    FrozenRuler::freeze(
        frame(&coordinates),
        &twin_table(4).view(),
        params(0.5, 0.75),
    )
    .expect("the upper quartile raises the ceiling past the declared epsilon");
}

/// Zero scales stay out of the quantile's distribution. A fixture of coincident rows beside
/// one separated pair leaves `q⁺ = 2` rather than zero, which admits a modest `ε_rel`.
#[test]
fn the_quantile_reads_positive_scales_alone() {
    let coordinates = [
        Vec2::new(0.0, 0.0),
        Vec2::new(0.0, 0.0),
        Vec2::new(8.0, 0.0),
        Vec2::new(8.0, 0.0),
        Vec2::new(0.0, 8.0),
        Vec2::new(0.0, 8.0),
        Vec2::new(4.0, 0.0),
        Vec2::new(6.0, 0.0),
    ];

    FrozenRuler::freeze(
        frame(&coordinates),
        &twin_table(8).view(),
        params(0.25, 0.25),
    )
    .expect("the quantile reads the positive scales, so the window stays open");
}
