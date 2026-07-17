use rayon::prelude::*;

use super::error::ObjectiveError;
use crate::salt::graph::KnnTable;

const LOCAL_SCALE_NEIGHBORS: usize = 15;

/// Validated detached local radii in generation-row order.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LocalScales(Box<[f64]>);

impl LocalScales {
    /// Validates one local radius per generation row.
    ///
    /// # Errors
    ///
    /// This returns an error when the row count differs or a radius is negative
    /// or non-finite.
    pub(crate) fn new(values: impl Into<Box<[f64]>>, rows: usize) -> Result<Self, ObjectiveError> {
        let values = values.into();
        if values.len() != rows {
            return Err(ObjectiveError::LocalScaleRowCount {
                expected: rows,
                actual: values.len(),
            });
        }
        if let Some(&value) = values
            .iter()
            .find(|value| !value.is_finite() || value.is_sign_negative())
        {
            return Err(ObjectiveError::InvalidLocalScale { value });
        }
        Ok(Self(values))
    }

    #[must_use]
    #[inline]
    pub(crate) fn as_slice(&self) -> &[f64] {
        &self.0
    }
}

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
) -> Result<LocalScales, ObjectiveError> {
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
    let values = (0..coordinates.len())
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
                let distance = difference[0].hypot(difference[1]);
                if !distance.is_finite() {
                    return Err(ObjectiveError::InvalidLocalScale { value: distance });
                }
                distances[offset] = distance;
            }
            distances[..neighbor_count].sort_unstable_by(f64::total_cmp);
            Ok(if neighbor_count % 2 == 0 {
                distances[neighbor_count / 2 - 1].midpoint(distances[neighbor_count / 2])
            } else {
                distances[neighbor_count / 2]
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(LocalScales(values.into_boxed_slice()))
}
