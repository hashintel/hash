//! Certificates for local-scale measurement.
//!
//! Fixture distances and coordinates are hand-picked exactly representable values, so the asserted
//! medians are exact contracts.

#![expect(
    clippy::float_cmp,
    reason = "medians of exactly representable distances are exact contracts"
)]

use hashql_core::id::IdSlice;

use super::{LocalScales, NonFiniteScale};
use crate::{
    identity::NodeRowId,
    math::Vec2,
    salt::knn::table::{Knn, KnnMatrix},
};

/// A complete-graph neighbour table.
///
/// Every row lists every other row, with `distances(row)` supplying that row's stored distances in
/// ascending column order.
fn complete_table(rows: usize, distances: impl Fn(usize) -> Vec<f32>) -> Knn<NodeRowId> {
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
            let mut distances = vec![0.125_f32; rows - 1];
            distances[0] = 1.875;
            distances
        } else {
            vec![0.25; rows - 1]
        }
    });
    #[expect(
        clippy::cast_precision_loss,
        reason = "fixture rows are tiny integers, exactly representable"
    )]
    let coordinates: Vec<Vec2> = (0..rows).map(|row| Vec2::new(row as f32, 0.0)).collect();

    let scales = LocalScales::compute(IdSlice::from_raw(&coordinates), &table.view())
        .expect("the fixture is finite");

    assert_eq!(scales.as_slice()[NodeRowId::new(0)].get(), 9.0);
    assert_eq!(scales.len(), rows);
}

/// An even neighbour count takes the midpoint of the central pair.
#[test]
fn even_neighbour_counts_use_the_midpoint() {
    let table = complete_table(3, |_| vec![0.25, 0.5]);
    let coordinates = [
        Vec2::new(0.0, 0.0),
        Vec2::new(3.0, 0.0),
        Vec2::new(0.0, 4.0),
    ];

    let scales = LocalScales::compute(IdSlice::from_raw(&coordinates), &table.view())
        .expect("the fixture is finite");

    // Row 0's 2D distances are {3, 4}: median 3.5.
    assert_eq!(scales.as_slice()[NodeRowId::new(0)].get(), 3.5);
}

/// Detection completes through the diverged row itself.
///
/// With an odd neighbour count, an observer's median legitimately skips a single poisoned distance
/// (NaN sorts last), so rows 0..=2 stay finite here - the diverged row 3, whose every distance is
/// non-finite, is what trips the error.
#[test]
fn diverged_row_flags_itself_even_when_observers_stay_finite() {
    let table = complete_table(4, |_| vec![0.25, 0.5, 0.75]);
    let coordinates = [
        Vec2::new(0.0, 0.0),
        Vec2::new(3.0, 0.0),
        Vec2::new(0.0, 4.0),
        Vec2::new(f32::NAN, 0.0),
    ];

    assert_eq!(
        LocalScales::compute(IdSlice::from_raw(&coordinates), &table.view()),
        Err(NonFiniteScale {
            row: NodeRowId::new(3)
        })
    );
}

/// A non-finite coordinate surfaces as the smallest affected row.
#[test]
fn rejects_non_finite_coordinates() {
    let table = complete_table(3, |_| vec![0.25, 0.5]);
    let coordinates = [
        Vec2::new(0.0, 0.0),
        Vec2::new(3.0, 0.0),
        Vec2::new(f32::NAN, 4.0),
    ];

    // Row 2's coordinate poisons rows 0, 1, and 2; row 0 is smallest.
    assert_eq!(
        LocalScales::compute(IdSlice::from_raw(&coordinates), &table.view()),
        Err(NonFiniteScale {
            row: NodeRowId::new(0)
        })
    );
}
