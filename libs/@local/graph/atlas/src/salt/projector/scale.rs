use rayon::prelude::*;

use super::error::ObjectiveError;
use crate::salt::graph::KnnTable;

const LOCAL_SCALE_NEIGHBORS: usize = 15;

/// Computes detached median 2D radii over semantic neighbors.
///
/// Each row uses its first 15 persisted semantic neighbors, or every neighbor
/// when a smaller test graph is supplied. The median is the middle value for
/// odd counts and the midpoint of the two central values for even counts.
///
/// # Errors
///
/// This returns an error when the coordinate and graph row counts differ or a
/// coordinate is non-finite.
pub(crate) fn local_scales(
    coordinates: &[[f64; 2]],
    semantic: &KnnTable,
) -> Result<Vec<f64>, ObjectiveError> {
    if coordinates.len() != semantic.rows() {
        return Err(ObjectiveError::CoordinateRowCount {
            expected: semantic.rows(),
            actual: coordinates.len(),
        });
    }
    for (row, coordinate) in coordinates.iter().enumerate() {
        for (axis, &value) in coordinate.iter().enumerate() {
            if !value.is_finite() {
                return Err(ObjectiveError::NonFiniteCoordinate { row, axis, value });
            }
        }
    }

    let neighbor_count = semantic.neighbors().min(LOCAL_SCALE_NEIGHBORS);
    Ok((0..coordinates.len())
        .into_par_iter()
        .map(|row| {
            let mut distances = [0.0; LOCAL_SCALE_NEIGHBORS];
            for (offset, &neighbor) in semantic.indices(row)[..neighbor_count].iter().enumerate() {
                let neighbor =
                    usize::try_from(neighbor).expect("validated semantic row should fit usize");
                let difference = [
                    coordinates[row][0] - coordinates[neighbor][0],
                    coordinates[row][1] - coordinates[neighbor][1],
                ];
                distances[offset] = difference[0].hypot(difference[1]);
            }
            distances[..neighbor_count].sort_unstable_by(f64::total_cmp);
            if neighbor_count % 2 == 0 {
                distances[neighbor_count / 2 - 1].midpoint(distances[neighbor_count / 2])
            } else {
                distances[neighbor_count / 2]
            }
        })
        .collect())
}
