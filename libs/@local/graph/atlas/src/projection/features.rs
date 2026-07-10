use core::{error::Error, fmt, num::NonZero};
use std::collections::BinaryHeap;

use rayon::prelude::*;

use super::graph::SparseGraph;
use crate::float::FloatBytes;

#[derive(Debug)]
pub(crate) enum StructureFeatureError {
    EmptyEmbeddings,
    RowCount {
        embeddings: usize,
        adjacency: usize,
    },
    DimensionOverflow(usize),
    OutputSizeOverflow {
        rows: usize,
        dimensions: usize,
    },
    NonFiniteValue {
        row: usize,
        dimension: usize,
        value: f32,
    },
}

impl fmt::Display for StructureFeatureError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyEmbeddings => {
                formatter.write_str("structure features require at least one embedding")
            }
            Self::RowCount {
                embeddings,
                adjacency,
            } => write!(
                formatter,
                "structure feature inputs disagree on row count: {embeddings} embeddings and \
                 {adjacency} adjacency rows"
            ),
            Self::DimensionOverflow(dimensions) => write!(
                formatter,
                "embedding dimension {dimensions} cannot be represented as a 2d + 2 feature row"
            ),
            Self::OutputSizeOverflow { rows, dimensions } => write!(
                formatter,
                "{rows} structure feature rows of width {dimensions} exceed the supported buffer \
                 size"
            ),
            Self::NonFiniteValue {
                row,
                dimension,
                value,
            } => write!(
                formatter,
                "structure feature ({row}, {dimension}) is non-finite: {value}"
            ),
        }
    }
}

impl Error for StructureFeatureError {}

#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct StructureFeatureOptions {
    pub(crate) neighbor_cap: usize = 256,
    pub(crate) salt: u64 = 0x5EED_00D5,
}

pub(crate) struct StructureFeatures {
    pub(crate) values: FloatBytes,
    pub(crate) degree_normalizer: f64,
    pub(crate) embedding_dimensions: usize,
    pub(crate) neighbor_cap: usize,
    pub(crate) salt: u64,
}

pub(crate) fn structure_features(
    embeddings: &FloatBytes,
    adjacency: &SparseGraph,
    options: StructureFeatureOptions,
) -> Result<StructureFeatures, StructureFeatureError> {
    let rows = embeddings.len();
    if rows == 0 {
        return Err(StructureFeatureError::EmptyEmbeddings);
    }
    if adjacency.rows() != rows || adjacency.cols() != rows {
        return Err(StructureFeatureError::RowCount {
            embeddings: rows,
            adjacency: adjacency.rows(),
        });
    }

    let embedding_dimensions = embeddings.dim();
    let feature_dimensions = embedding_dimensions
        .checked_mul(2)
        .and_then(|dimensions| dimensions.checked_add(2))
        .ok_or(StructureFeatureError::DimensionOverflow(
            embedding_dimensions,
        ))?;
    let values =
        rows.checked_mul(feature_dimensions)
            .ok_or(StructureFeatureError::OutputSizeOverflow {
                rows,
                dimensions: feature_dimensions,
            })?;

    let maximum_degree = adjacency
        .outer_iterator()
        .map(|neighbors| neighbors.nnz())
        .max()
        .unwrap_or(0);
    let degree_normalizer = if maximum_degree == 0 {
        1.0
    } else {
        (maximum_degree as f64).ln_1p()
    };

    let mut values = vec![0.0_f32; values];
    values
        .par_chunks_mut(feature_dimensions)
        .enumerate()
        .try_for_each_init(
            || RowScratch::new(embedding_dimensions, options.neighbor_cap),
            |scratch, (row, output)| {
                write_feature_row(
                    row,
                    output,
                    embeddings,
                    adjacency,
                    degree_normalizer,
                    options,
                    scratch,
                )
            },
        )?;

    let values = FloatBytes::from_vec(
        values,
        NonZero::new(feature_dimensions).expect("2d + 2 is statically positive"),
    )
    .expect("feature allocation was constructed from whole rows");

    Ok(StructureFeatures {
        values,
        degree_normalizer,
        embedding_dimensions,
        neighbor_cap: options.neighbor_cap,
        salt: options.salt,
    })
}

struct RowScratch {
    neighbors: BinaryHeap<(u64, u32)>,
    selected: Vec<(u64, u32)>,
    accumulator: Vec<f64>,
}

impl RowScratch {
    fn new(dimensions: usize, neighbor_cap: usize) -> Self {
        Self {
            neighbors: BinaryHeap::with_capacity(neighbor_cap),
            selected: Vec::with_capacity(neighbor_cap),
            accumulator: vec![0.0; dimensions],
        }
    }
}

fn write_feature_row(
    row: usize,
    output: &mut [f32],
    embeddings: &FloatBytes,
    adjacency: &SparseGraph,
    degree_normalizer: f64,
    options: StructureFeatureOptions,
    scratch: &mut RowScratch,
) -> Result<(), StructureFeatureError> {
    let dimensions = embeddings.dim();
    let embedding = embeddings.row(row);
    for (dimension, &value) in embedding.iter().enumerate() {
        if !value.is_finite() {
            return Err(StructureFeatureError::NonFiniteValue {
                row,
                dimension,
                value,
            });
        }
    }
    output[..dimensions].copy_from_slice(embedding);

    let adjacency = adjacency
        .outer_view(row)
        .expect("validated adjacency row is in bounds");
    scratch.neighbors.clear();
    if options.neighbor_cap > 0 {
        for &neighbor in adjacency.indices() {
            let candidate = (splitmix64(u64::from(neighbor) ^ options.salt), neighbor);
            if scratch.neighbors.len() < options.neighbor_cap {
                scratch.neighbors.push(candidate);
            } else if scratch
                .neighbors
                .peek()
                .is_some_and(|largest| candidate < *largest)
            {
                scratch.neighbors.pop();
                scratch.neighbors.push(candidate);
            }
        }
    }

    scratch.selected.clear();
    scratch.selected.extend(scratch.neighbors.drain());
    scratch.selected.sort_unstable();
    scratch.accumulator.fill(0.0);

    for &(_hash, neighbor) in &scratch.selected {
        for (sum, &value) in scratch
            .accumulator
            .iter_mut()
            .zip(embeddings.row(neighbor as usize))
        {
            *sum += f64::from(value);
        }
    }

    let neighbor_mean = &mut output[dimensions..dimensions * 2];
    let coherence = if scratch.selected.is_empty() {
        neighbor_mean.fill(0.0);
        0.0
    } else {
        let inverse_count = 1.0 / scratch.selected.len() as f64;
        for (mean, &sum) in neighbor_mean.iter_mut().zip(&scratch.accumulator) {
            *mean = (sum * inverse_count) as f32;
        }
        let norm = neighbor_mean
            .iter()
            .map(|value| value * value)
            .sum::<f32>()
            .sqrt();
        if norm > 0.0 {
            let inverse_norm = norm.recip();
            for value in neighbor_mean {
                *value *= inverse_norm;
            }
        }
        norm
    };

    output[dimensions * 2] = coherence;
    output[dimensions * 2 + 1] = ((adjacency.nnz() as f64).ln_1p() / degree_normalizer) as f32;

    for (dimension, &value) in output.iter().enumerate() {
        if !value.is_finite() {
            return Err(StructureFeatureError::NonFiniteValue {
                row,
                dimension,
                value,
            });
        }
    }
    Ok(())
}

const fn splitmix64(mut value: u64) -> u64 {
    value = value.wrapping_add(0x9E37_79B9_7F4A_7C15);
    value = (value ^ (value >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    value ^ (value >> 31)
}

#[cfg(test)]
mod tests {
    use std::{fs::File, io::BufReader, path::Path};

    use npyz::Deserialize;

    use super::*;
    use crate::projection::graph::sparse_graph;

    fn read_npy<T: Deserialize>(relative: impl AsRef<Path>) -> Vec<T> {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../../tools/embedding2d/oracle/fixtures/v1/features")
            .join(relative);
        let file = BufReader::new(File::open(path).expect("oracle fixture should open"));
        npyz::NpyFile::new(file)
            .expect("oracle fixture should parse")
            .into_vec::<T>()
            .expect("oracle data should parse")
    }

    fn owned_embeddings(values: &[f32], dimensions: usize) -> FloatBytes {
        FloatBytes::from_slice(values, NonZero::new(dimensions).unwrap())
            .expect("embeddings should have whole rows")
    }

    #[test]
    fn matches_structure_feature_oracle() {
        let embeddings = owned_embeddings(&read_npy::<f32>("embeddings.npy"), 4);
        let indptr = read_npy::<i64>("adjacency-indptr.npy")
            .into_iter()
            .map(|value| value as u32)
            .collect::<Vec<_>>();
        let indices = read_npy::<i64>("adjacency-indices.npy")
            .into_iter()
            .map(|value| value as u32)
            .collect::<Vec<_>>();
        let adjacency = sparse_graph(
            embeddings.len(),
            indptr,
            indices.clone(),
            vec![1.0; indices.len()],
        )
        .expect("oracle adjacency should be valid");
        let actual = structure_features(
            &embeddings,
            &adjacency,
            StructureFeatureOptions {
                neighbor_cap: 2,
                salt: 0x5EED_00D5,
            },
        )
        .expect("structure features should build");
        let expected = read_npy::<f32>("values.npy");

        assert_eq!(actual.values.dim(), 10);
        assert_eq!(actual.values.len(), 8);
        assert_eq!(actual.degree_normalizer, 2.0_f64.ln_1p());
        for (actual, expected) in (0..actual.values.len())
            .flat_map(|row| actual.values.row(row))
            .zip(expected)
        {
            assert!(
                (actual - expected).abs() <= 2.0e-6,
                "{actual} != {expected}"
            );
        }
    }
}
