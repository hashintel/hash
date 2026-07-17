//! Approximate cosine k-NN over mmap-backed embeddings via USearch/HNSW.

use core::num::NonZero;

use rayon::prelude::*;
use usearch::{Index, IndexOptions, MetricKind, ScalarKind};

use super::{
    GraphError, SparseGraph,
    fuzzy::{fuzzy_graph, smooth_knn_distances},
};
use crate::{float::FloatBytes, macros::nz};

/// Configuration for [`semantic_knn`] and [`semantic_graph`].
///
/// The defaults match the pipeline's production settings: 15 neighbors and
/// `USearch`'s cosine HNSW with moderate build effort.
#[derive(Debug, Copy, Clone, Default)]
pub struct SemanticGraphOptions {
    /// Number of nearest neighbors requested per row, including the row
    /// itself. Clamped to the row count for tiny samples.
    pub neighbors: NonZero<usize> = nz!(15),
    /// HNSW graph connectivity (`M`): the number of links kept per node.
    pub connectivity: NonZero<usize> = nz!(16),
    /// HNSW build-time candidate list size (`efConstruction`).
    pub expansion_add: NonZero<usize> = nz!(200),
    /// HNSW query-time candidate list size (`ef`). Raised to at least the
    /// neighbor count automatically.
    pub expansion_search: NonZero<usize> = nz!(64),
}

/// A validated k-nearest-neighbor table over the sampled rows.
///
/// Row `i` occupies `indices[i * neighbors..(i + 1) * neighbors]` and the
/// matching `distances` range. Within every row the first neighbor is the row
/// itself at distance zero, distances ascend, no neighbor repeats, and all
/// indices are valid rows. [`Knn::new`] establishes these invariants, so
/// downstream fuzzy-set code can rely on them without revalidating.
#[derive(Debug)]
pub(crate) struct Knn {
    indices: Vec<u32>,
    distances: Vec<f32>,
    rows: usize,
    neighbors: usize,
}

impl Knn {
    /// Validates raw k-NN storage and repairs each row's self-neighbor.
    ///
    /// Approximate search may return the row itself at any position, or miss
    /// it entirely. Rows are repaired in place without per-row allocation:
    /// the self-neighbor moves to the front (dropping the farthest neighbor
    /// when it was missing) and its distance is forced to zero.
    ///
    /// # Errors
    ///
    /// Returns an error when the shape is empty or has more neighbors than
    /// rows, when the storage length does not match `rows * neighbors`, or
    /// when a row contains an out-of-bounds index, a duplicate neighbor, a
    /// non-finite distance, or unsorted distances.
    pub(crate) fn new(
        rows: usize,
        neighbors: usize,
        mut indices: Vec<u32>,
        mut distances: Vec<f32>,
    ) -> Result<Self, GraphError> {
        if rows == 0 || neighbors == 0 || neighbors > rows {
            return Err(GraphError::InvalidKnnShape { rows, neighbors });
        }
        if rows > u32::MAX as usize {
            return Err(GraphError::TooManyRows(rows));
        }

        let expected = rows
            .checked_mul(neighbors)
            .ok_or(GraphError::TooManyEdges(usize::MAX))?;
        if indices.len() != expected || distances.len() != expected {
            return Err(GraphError::KnnLength {
                expected,
                indices: indices.len(),
                distances: distances.len(),
            });
        }

        let rows_u32 = u32::try_from(rows).map_err(|_error| GraphError::TooManyRows(rows))?;
        for (row, self_index) in (0..rows).zip(0_u32..rows_u32) {
            let start = row * neighbors;
            let stop = start + neighbors;

            for offset in 0..neighbors {
                let position = start + offset;
                let index = indices[position];
                if index >= rows_u32 {
                    return Err(GraphError::NeighborOutOfBounds {
                        row,
                        offset,
                        index,
                        rows,
                    });
                }
                if indices[start..position].contains(&index) {
                    return Err(GraphError::DuplicateNeighbor { row, index });
                }

                let distance = distances[position];
                if !distance.is_finite() {
                    return Err(GraphError::NonFiniteDistance {
                        row,
                        offset,
                        distance,
                    });
                }
                distances[position] = distance.max(0.0);
            }

            for offset in 1..neighbors {
                if distances[start + offset - 1] > distances[start + offset] {
                    return Err(GraphError::UnsortedDistances { row, offset });
                }
            }

            if let Some(position) = indices[start..stop]
                .iter()
                .position(|&index| index == self_index)
            {
                if position > 0 {
                    indices.copy_within(start..start + position, start + 1);
                    distances.copy_within(start..start + position, start + 1);
                    indices[start] = self_index;
                }
            } else {
                indices.copy_within(start..stop - 1, start + 1);
                distances.copy_within(start..stop - 1, start + 1);
                indices[start] = self_index;
            }
            distances[start] = 0.0;
        }

        Ok(Self {
            indices,
            distances,
            rows,
            neighbors,
        })
    }

    /// The number of sampled rows.
    pub(crate) const fn rows(&self) -> usize {
        self.rows
    }

    /// The number of neighbors stored per row, including the self-neighbor.
    pub(crate) const fn neighbors(&self) -> usize {
        self.neighbors
    }

    /// The flat row-major neighbor indices, `neighbors` entries per row.
    pub(crate) fn indices(&self) -> &[u32] {
        &self.indices
    }

    /// The flat row-major neighbor distances, aligned with
    /// [`Knn::indices`].
    pub(crate) fn distances(&self) -> &[f32] {
        &self.distances
    }
}

/// Extracts each sampled row's approximate cosine nearest neighbors.
///
/// An HNSW index is built over all embedding rows and queried once per row,
/// both in parallel across the rayon pool. Embedding rows are read straight
/// from the shared mapping, so memory stays bounded by the index itself. The
/// result passes through [`Knn::new`], so self-neighbors are repaired and all
/// invariants hold.
///
/// Recall is approximate: HNSW may miss true neighbors, with quality
/// controlled by the [`SemanticGraphOptions`] expansion settings.
///
/// # Errors
///
/// Returns an error when the options are invalid, when the sample is empty or
/// exceeds `u32` rows, when `USearch` fails to build or search, or when
/// `USearch` returns malformed results.
pub(crate) fn semantic_knn(
    embeddings: &FloatBytes,
    options: SemanticGraphOptions,
) -> Result<Knn, GraphError> {
    let rows = embeddings.len();
    if rows == 0 {
        return Err(GraphError::InvalidKnnShape {
            rows,
            neighbors: options.neighbors.get(),
        });
    }

    let Ok(rows) = u32::try_from(rows) else {
        return Err(GraphError::TooManyRows(rows));
    };

    let neighbors = options.neighbors.get().min(rows as usize);
    let entries = (rows as usize)
        .checked_mul(neighbors)
        .ok_or(GraphError::TooManyEdges(usize::MAX))?;

    let build_start = std::time::Instant::now();
    let index = Index::new(&IndexOptions {
        dimensions: embeddings.dim(),
        metric: MetricKind::Cos,
        quantization: ScalarKind::F32,
        connectivity: options.connectivity.get(),
        expansion_add: options.expansion_add.get(),
        expansion_search: options.expansion_search.get().max(neighbors),
        multi: false,
    })?;
    index.reserve_capacity_and_threads(rows as usize, rayon::current_num_threads())?;

    (0..rows)
        .into_par_iter()
        .map(|row| (row, embeddings.row(row as usize)))
        .try_for_each(|(row, embedding)| {
            index
                .add(u64::from(row), embedding)
                .map_err(GraphError::from)
        })?;
    let build_duration = build_start.elapsed();

    let search_start = std::time::Instant::now();
    let mut indices = vec![0; entries];
    let mut distances = vec![0.0; entries];

    indices
        .par_chunks_mut(neighbors)
        .zip(distances.par_chunks_mut(neighbors))
        .enumerate()
        .try_for_each(|(row, (row_indices, row_distances))| {
            let matches = index.search(embeddings.row(row), neighbors)?;
            if matches.keys.len() != neighbors || matches.distances.len() != neighbors {
                return Err(GraphError::SearchResultCount {
                    row,
                    expected: neighbors,
                    keys: matches.keys.len(),
                    distances: matches.distances.len(),
                });
            }

            for (offset, (&key, &distance)) in
                matches.keys.iter().zip(&matches.distances).enumerate()
            {
                let key = u32::try_from(key)
                    .ok()
                    .filter(|&key| key < rows)
                    .ok_or(GraphError::IndexKeyOutOfBounds { row, key, rows })?;
                row_indices[offset] = key;
                row_distances[offset] = distance;
            }
            Ok::<_, GraphError>(())
        })?;
    tracing::debug!(
        rows,
        neighbors,
        connectivity = options.connectivity.get(),
        expansion_add = options.expansion_add.get(),
        expansion_search = options.expansion_search.get(),
        build_ms = u64::try_from(build_duration.as_millis()).unwrap_or(u64::MAX),
        search_ms = u64::try_from(search_start.elapsed().as_millis()).unwrap_or(u64::MAX),
        entries,
        "HNSW k-NN extracted"
    );

    Knn::new(rows as usize, neighbors, indices, distances)
}

/// Builds the symmetric fuzzy semantic graph over sampled embeddings.
///
/// This chains [`semantic_knn`], [`smooth_knn_distances`] with the standard
/// local connectivity and bandwidth of `1.0`, and [`fuzzy_graph`].
///
/// # Errors
///
/// Returns an error when any of the chained stages fails; see
/// [`semantic_knn`] for the search failure modes.
pub(crate) fn semantic_graph(
    embeddings: &FloatBytes,
    options: SemanticGraphOptions,
) -> Result<SparseGraph, GraphError> {
    let knn = semantic_knn(embeddings, options)?;
    let smooth = smooth_knn_distances(&knn, 1.0, 1.0)?;
    fuzzy_graph(&knn, &smooth)
}
