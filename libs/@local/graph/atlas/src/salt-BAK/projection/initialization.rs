//! Bounded-memory PCA initialization for cold layout fits.
//!
//! A UMAP layout converges faster and more reproducibly from a structured
//! start than from random noise. [`pca_initialization`] projects every
//! sampled embedding onto its two dominant principal axes, fitting the basis
//! on a bounded sketch of rows so initialization cost stays flat as the
//! sample grows.

use core::{error::Error, fmt};

use faer::Mat;
use rayon::prelude::*;

use crate::float::FloatBytes;

/// A failure while computing the PCA initialization.
#[derive(Debug)]
pub enum InitializationError {
    /// The sample has fewer than two rows.
    TooFewRows(usize),
    /// The sketch size option is below two.
    InvalidSketchRows(usize),
    /// The singular value decomposition failed.
    Decomposition(String),
    /// The embeddings do not span two usable principal axes.
    RankDeficient,
    /// A projected coordinate is NaN or infinite.
    NonFiniteCoordinate { row: usize, axis: usize, value: f32 },
}

impl fmt::Display for InitializationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TooFewRows(rows) => {
                write!(
                    formatter,
                    "PCA initialization requires at least two rows, got {rows}"
                )
            }
            Self::InvalidSketchRows(rows) => {
                write!(
                    formatter,
                    "PCA sketch row count must be at least two, got {rows}"
                )
            }
            Self::Decomposition(error) => write!(formatter, "PCA decomposition failed: {error}"),
            Self::RankDeficient => formatter.write_str(
                "PCA initialization requires at least two non-degenerate principal components",
            ),
            Self::NonFiniteCoordinate { row, axis, value } => write!(
                formatter,
                "PCA coordinate ({row}, {axis}) is non-finite: {value}"
            ),
        }
    }
}

impl Error for InitializationError {}

/// Configuration for [`pca_initialization`].
#[derive(Debug, Copy, Clone, Default)]
pub struct PcaOptions {
    /// Number of rows used to fit the principal basis. Projection still covers every row.
    pub sketch_rows: usize = 2_048,
}

/// Projects every embedding onto the sample's two dominant principal axes.
///
/// The mean is computed over all rows in parallel, the principal basis is
/// fitted by thin SVD on an evenly strided sketch of at most
/// [`PcaOptions::sketch_rows`] centered rows, and then every row is projected
/// onto the first two right singular vectors. Peak additional memory is the
/// sketch matrix plus the output; the embeddings themselves are read from
/// their shared mapping. The result is deterministic for a given sample.
///
/// # Errors
///
/// Returns an error when fewer than two rows or sketch rows are available,
/// when the decomposition fails or yields fewer than two non-degenerate
/// components, or when a projected coordinate is not finite.
pub(crate) fn pca_initialization(
    embeddings: &FloatBytes,
    options: PcaOptions,
) -> Result<Vec<[f32; 2]>, InitializationError> {
    if embeddings.len() < 2 {
        return Err(InitializationError::TooFewRows(embeddings.len()));
    }
    if options.sketch_rows < 2 {
        return Err(InitializationError::InvalidSketchRows(options.sketch_rows));
    }

    let rows = embeddings.len();
    let dimensions = embeddings.dim();
    let sums = (0..rows)
        .into_par_iter()
        .fold(
            || vec![0.0_f64; dimensions],
            |mut sums, row| {
                for (sum, &value) in sums.iter_mut().zip(embeddings.row(row)) {
                    *sum += f64::from(value);
                }
                sums
            },
        )
        .reduce(
            || vec![0.0_f64; dimensions],
            |mut left, right| {
                for (left, right) in left.iter_mut().zip(right) {
                    *left += right;
                }
                left
            },
        );
    let inverse_rows = 1.0 / rows as f64;
    let mean = sums
        .into_iter()
        .map(|sum| (sum * inverse_rows) as f32)
        .collect::<Vec<_>>();

    let sketch_rows = options.sketch_rows.min(rows);
    tracing::debug!(
        sketch_rows,
        dimensions,
        "fitting PCA basis on strided sketch"
    );
    let sketch = Mat::from_fn(sketch_rows, dimensions, |sample, dimension| {
        let row = sample * rows / sketch_rows;
        embeddings.row(row)[dimension] - mean[dimension]
    });
    let decomposition = sketch
        .thin_svd()
        .map_err(|error| InitializationError::Decomposition(format!("{error:?}")))?;
    let singular_values = decomposition.S().column_vector();
    if singular_values.nrows() < 2
        || !singular_values[0].is_finite()
        || !singular_values[1].is_finite()
        || singular_values[1] <= f32::EPSILON * singular_values[0]
    {
        return Err(InitializationError::RankDeficient);
    }
    let right_vectors = decomposition.V();

    let coordinates = (0..rows)
        .into_par_iter()
        .map(|row| {
            let embedding = embeddings.row(row);
            let mut coordinate = [0.0_f32; 2];
            for dimension in 0..dimensions {
                let centered = embedding[dimension] - mean[dimension];
                coordinate[0] += centered * right_vectors[(dimension, 0)];
                coordinate[1] += centered * right_vectors[(dimension, 1)];
            }
            coordinate
        })
        .collect::<Vec<_>>();

    for (row, coordinate) in coordinates.iter().enumerate() {
        for (axis, &value) in coordinate.iter().enumerate() {
            if !value.is_finite() {
                return Err(InitializationError::NonFiniteCoordinate { row, axis, value });
            }
        }
    }
    Ok(coordinates)
}

#[cfg(test)]
mod tests {
    use std::{io::Write as _, num::NonZero};

    use super::*;

    fn mmap_embeddings<const DIM: usize>(rows: &[[f32; DIM]]) -> FloatBytes {
        let mut file = tempfile::tempfile().expect("temporary embedding file should open");
        for row in rows {
            for value in row {
                file.write_all(&value.to_ne_bytes())
                    .expect("embedding should write");
            }
        }
        file.flush().expect("embeddings should flush");
        FloatBytes::from_file(file, NonZero::new(DIM).unwrap()).expect("embeddings should mmap")
    }

    #[test]
    fn initializes_from_dominant_axes_without_materializing_embeddings() {
        let rows = (0..64)
            .map(|row| {
                let x = row as f32 - 31.5;
                let y = ((row * 17) % 64) as f32 - 31.5;
                [x, y * 0.1, (x * 0.01).sin(), 1.0]
            })
            .collect::<Vec<_>>();
        let embeddings = mmap_embeddings(&rows);
        let coordinates = pca_initialization(&embeddings, PcaOptions { sketch_rows: 32 })
            .expect("PCA should initialize");

        assert_eq!(coordinates.len(), rows.len());
        assert!(coordinates.iter().flatten().all(|value| value.is_finite()));
        let first_span = coordinates
            .iter()
            .map(|coordinate| coordinate[0])
            .reduce(f32::max)
            .unwrap()
            - coordinates
                .iter()
                .map(|coordinate| coordinate[0])
                .reduce(f32::min)
                .unwrap();
        let second_span = coordinates
            .iter()
            .map(|coordinate| coordinate[1])
            .reduce(f32::max)
            .unwrap()
            - coordinates
                .iter()
                .map(|coordinate| coordinate[1])
                .reduce(f32::min)
                .unwrap();
        assert!(first_span > second_span);
    }
}
