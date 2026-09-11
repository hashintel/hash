//! Certificates for local-scale measurement.
//!
//! Fixture distances and coordinates are hand-picked exactly representable values, so the asserted
//! medians are exact contracts.

#![expect(
    clippy::float_cmp,
    reason = "medians of exactly representable distances are exact contracts"
)]

use hashql_core::id::IdSlice;

use super::LocalScales;
use crate::{
    identity::NodeRowId,
    math::{FinitePointField, NonNegative, Vec2, non_negative},
    salt::knn::table::{Knn, KnnMatrix},
};

/// Wraps fixture points every test states as finite literals.
fn frame(points: &[Vec2]) -> &FinitePointField<NodeRowId> {
    FinitePointField::new_unchecked(IdSlice::from_raw(points))
}

/// A complete-graph neighbour table.
///
/// Every row lists every other row, with `distances(row)` supplying that row's stored distances in
/// ascending column order.
fn complete_table(rows: usize, distances: impl Fn(usize) -> Vec<NonNegative>) -> Knn<NodeRowId> {
    let neighbours = rows - 1;
    let mut indptr = Vec::with_capacity(rows + 1);
    let mut columns = Vec::with_capacity(rows * neighbours);
    let mut values = Vec::with_capacity(rows * neighbours);
    indptr.push(0_u64);
    for row in 0..rows {
        let row_distances = distances(row);
        assert_eq!(row_distances.len(), neighbours, "fixture arity");
        let mut distance = row_distances.into_iter();
        for column in (0..rows).filter(|&column| column != row) {
            columns.push(u32::try_from(column).expect("fixture columns fit u32"));
            values.push(distance.next().expect("fixture arity"));
        }
        indptr.push(u64::try_from(columns.len()).expect("fixture entries fit u64"));
    }
    let matrix = KnnMatrix::try_new((rows, rows), indptr, columns, values)
        .map_err(|(_, _, _, error)| error)
        .expect("the fixture matrix is structurally valid");
    Knn::new(matrix).expect("the fixture table is a valid neighbour table")
}

/// Selection follows stored distance, not storage order.
///
/// Seventeen rows make row 0's table sixteen entries wide, one more than the scale uses. Row 1 -
/// first in storage order - carries the largest stored distance, so the nearest fifteen are rows
/// 2..=16. With row `j` placed at `(j, 0)`, the correct median over 2D distances `{2..=16}` is 9;
/// selecting the first fifteen by storage order would include row 1 and yield 8.
#[test]
fn selects_neighbours_by_stored_distance_not_storage_order() {
    let rows = 17;
    let table = complete_table(rows, |row| {
        if row == 0 {
            // Column order is 1, 2, .., 16: row 1 farthest, the rest near.
            let mut distances = vec![non_negative!(0.125); rows - 1];
            distances[0] = non_negative!(1.875);
            distances
        } else {
            vec![non_negative!(0.25); rows - 1]
        }
    });
    #[expect(
        clippy::cast_precision_loss,
        reason = "fixture rows are tiny integers, exactly representable"
    )]
    let coordinates: Vec<Vec2> = (0..rows).map(|row| Vec2::new(row as f32, 0.0)).collect();

    let scales =
        LocalScales::compute(frame(&coordinates), &table.view()).expect("the fixture is finite");

    assert_eq!(scales.as_slice()[NodeRowId::new(0)].get(), 9.0);
    assert_eq!(scales.len(), rows);
}

/// An even neighbour count takes the midpoint of the central pair.
#[test]
fn even_neighbour_counts_use_the_midpoint() {
    let table = complete_table(3, |_| vec![non_negative!(0.25), non_negative!(0.5)]);
    let coordinates = [
        Vec2::new(0.0, 0.0),
        Vec2::new(3.0, 0.0),
        Vec2::new(0.0, 4.0),
    ];

    let scales =
        LocalScales::compute(frame(&coordinates), &table.view()).expect("the fixture is finite");

    // Row 0's 2D distances are {3, 4}: median 3.5.
    assert_eq!(scales.as_slice()[NodeRowId::new(0)].get(), 3.5);
}

// No test drives a non-finite coordinate through `compute`. The one production caller
// (`refresh::forward`) rejects non-finite readback points before the frame exists. The one
// reachable non-finite reading, a distance overflowing to +∞ from pre-divergence coordinates,
// is unconstructible in debug builds by design.
