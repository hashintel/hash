//! Persisted semantic neighbors and replaceable ANN search.
//!
//! The semantic graph is a directed cosine k-nearest-neighbor table over
//! normalized 512-component projector representations. Rows exclude their own
//! index, contain no duplicate neighbor, and are sorted by ascending
//! `(distance, row index)`. The default stores 30 neighbors; this bound applies
//! only to semantic sampling and does not limit relation edges.
//!
//! [`NeighborIndex`] separates persisted graph semantics from the search
//! implementation. A backend is accepted only after [`audit::audit_recall`]
//! compares its 50-neighbor queries with exact cosine rankings on an explicit
//! sample.
//!
//! # Fuzzy semantic weights
//!
//! The persisted neighbor table is converted into a UMAP-style fuzzy
//! simplicial set. For row `i`, `rho_i` is its first positive neighbor
//! distance. A bounded binary search chooses `sigma_i` so directed memberships
//!
//! ```text
//! p(i -> j) = exp(-max(0, d(i, j) - rho_i) / sigma_i)
//! ```
//!
//! sum to `log2(k)`. Reciprocal directed memberships are combined by
//! probabilistic union:
//!
//! ```text
//! w(i, j) = p(i -> j) + p(j -> i) - p(i -> j) * p(j -> i)
//! ```
//!
//! A one-sided edge keeps its directed membership. These weights define
//! semantic positive sampling and the local scales used to normalize relation
//! distance; they do not limit or replace the complete relation instance set.
//!
//! # ANN reproducibility boundary
//!
//! The `USearch` adapter inserts rows through one writer context in generation
//! order, but its C++ random engine is not a portable byte-level contract.
//! The durable product is therefore the validated [`KnnTable`] plus a
//! deterministic exact-recall audit, not the transient HNSW graph.
//!
//! Audit rows are selected round-robin across complete categorical strata by
//! content-derived priorities. For each row, the approximate 50-neighbor set
//! is intersected with an exact SIMD cosine ranking whose ties resolve by
//! generation row. Aggregate recall must be at least `0.95`.

use core::{
    num::NonZeroUsize,
    simd::{f32x8, num::SimdFloat as _},
};
use std::time::Instant;

use rayon::prelude::*;

use crate::salt::{
    hash::{ContentHash, ContentHasher},
    representation::PROJECTOR_DIMENSIONS,
};

mod artifact;
pub(crate) mod audit;
mod error;
mod kernel;
mod usearch;
mod weight;

#[allow(
    unused_imports,
    reason = "semantic graph backends and publication form the generation adapter surface"
)]
pub(crate) use self::{
    artifact::{SemanticEdgeWeights, publish_semantic_graph},
    error::SemanticGraphError,
    usearch::{USearchConfig, USearchIndex},
    weight::fuzzy_edge_weights,
};

const DEFAULT_NEIGHBORS: usize = 30;
const MAXIMUM_SQUARED_EMBEDDING_NORM: f64 = 1.0 + 1.0e-4;

/// Borrowed row-major projector representations.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ProjectorEmbeddings<'embedding> {
    rows: &'embedding [[f32; PROJECTOR_DIMENSIONS]],
}

impl<'embedding> ProjectorEmbeddings<'embedding> {
    /// Validates a flat matrix of projector representations.
    ///
    /// # Errors
    ///
    /// Returns an error for an empty matrix, an incomplete row, more than
    /// `u32::MAX` rows, a non-finite component, or a row whose squared norm
    /// exceeds the normalized-prefix bound.
    pub(crate) fn new(values: &'embedding [f32]) -> Result<Self, SemanticGraphError> {
        let (rows, remainder) = values.as_chunks::<PROJECTOR_DIMENSIONS>();
        if !remainder.is_empty() {
            return Err(SemanticGraphError::EmbeddingLength {
                actual: values.len(),
                dimensions: PROJECTOR_DIMENSIONS,
            });
        }
        if rows.is_empty() {
            return Err(SemanticGraphError::EmptyCorpus);
        }
        if rows.len() > u32::MAX as usize {
            return Err(SemanticGraphError::TooManyRows { rows: rows.len() });
        }

        for (row_index, row) in rows.iter().enumerate() {
            let (chunks, remainder) = row.as_chunks::<8>();
            debug_assert!(remainder.is_empty());
            let mut squared_norm = 0.0;
            for (chunk_index, chunk) in chunks.iter().enumerate() {
                let vector = f32x8::from_array(*chunk);
                if !vector.is_finite().all() {
                    let lane = chunk
                        .iter()
                        .position(|value| !value.is_finite())
                        .expect("SIMD check should identify a non-finite lane");
                    return Err(SemanticGraphError::NonFiniteEmbedding {
                        row: row_index,
                        component: chunk_index * 8 + lane,
                    });
                }
                squared_norm += f64::from((vector * vector).reduce_sum());
            }
            if !squared_norm.is_finite() || squared_norm > MAXIMUM_SQUARED_EMBEDDING_NORM {
                return Err(SemanticGraphError::EmbeddingNorm {
                    row: row_index,
                    squared_norm,
                });
            }
        }
        Ok(Self { rows })
    }

    /// Returns the row count.
    #[must_use]
    #[inline]
    pub(crate) const fn len(self) -> usize {
        self.rows.len()
    }

    /// Borrows one validated row.
    #[must_use]
    #[inline]
    pub(crate) const fn row(self, index: usize) -> &'embedding [f32; PROJECTOR_DIMENSIONS] {
        &self.rows[index]
    }
}

/// One neighbor returned by a search backend.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct Neighbor {
    pub row: u32,
    pub distance: f32,
}

/// A built search index over one immutable representation matrix.
pub(crate) trait NeighborIndex: Sync {
    /// Returns up to `limit` cosine neighbors for `query`.
    fn search(
        &self,
        query: &[f32; PROJECTOR_DIMENSIONS],
        limit: usize,
    ) -> Result<Vec<Neighbor>, SemanticGraphError>;

    /// Identifies backend implementation, version and build configuration.
    fn identity(&self) -> ContentHash;
}

/// Persisted non-self nearest neighbors in row-major order.
#[derive(Debug, Clone)]
pub(crate) struct KnnTable {
    indices: Vec<u32>,
    distances: Vec<f32>,
    rows: usize,
    neighbors: usize,
}

impl KnnTable {
    /// Validates persisted neighbor storage.
    ///
    /// # Errors
    ///
    /// Returns an error when shape, range, uniqueness, finiteness or ordering
    /// invariants are violated.
    pub(crate) fn new(
        rows: usize,
        neighbors: usize,
        indices: Vec<u32>,
        distances: Vec<f32>,
    ) -> Result<Self, SemanticGraphError> {
        if rows <= 1 || neighbors == 0 || neighbors >= rows {
            return Err(SemanticGraphError::InvalidNeighborCount { rows, neighbors });
        }
        let entries = rows
            .checked_mul(neighbors)
            .ok_or(SemanticGraphError::TooManyNeighborEntries { rows, neighbors })?;
        if indices.len() != entries || distances.len() != entries {
            return Err(SemanticGraphError::NeighborStorageLength {
                expected: entries,
                indices: indices.len(),
                distances: distances.len(),
            });
        }

        let rows_u32 = u32::try_from(rows).map_err(|_| SemanticGraphError::TooManyRows { rows })?;
        for row in 0..rows {
            let start = row * neighbors;
            let end = start + neighbors;
            let row_index = u32::try_from(row).expect("validated row should fit u32");
            for offset in 0..neighbors {
                let position = start + offset;
                let neighbor = indices[position];
                if neighbor >= rows_u32 {
                    return Err(SemanticGraphError::NeighborOutOfBounds {
                        row,
                        neighbor: u64::from(neighbor),
                        rows,
                    });
                }
                if neighbor == row_index {
                    return Err(SemanticGraphError::SelfNeighbor { row });
                }
                if indices[start..position].contains(&neighbor) {
                    return Err(SemanticGraphError::DuplicateNeighbor { row, neighbor });
                }
                let distance = distances[position];
                if !distance.is_finite() {
                    return Err(SemanticGraphError::NonFiniteDistance {
                        row,
                        neighbor,
                        distance,
                    });
                }
                if distance.is_sign_negative() || distance > 2.0 {
                    return Err(SemanticGraphError::DistanceOutOfRange {
                        row,
                        neighbor,
                        distance,
                    });
                }
                if offset > 0
                    && (distances[position - 1], indices[position - 1]) > (distance, neighbor)
                {
                    return Err(SemanticGraphError::UnsortedNeighbors { row, offset });
                }
            }
            debug_assert_eq!(indices[start..end].len(), neighbors);
        }

        Ok(Self {
            indices,
            distances,
            rows,
            neighbors,
        })
    }

    /// Returns the row count.
    #[must_use]
    #[inline]
    pub(crate) const fn rows(&self) -> usize {
        self.rows
    }

    /// Returns the number of stored non-self neighbors per row.
    #[must_use]
    #[inline]
    pub(crate) const fn neighbors(&self) -> usize {
        self.neighbors
    }

    /// Borrows one row's neighbor indices.
    #[must_use]
    #[inline]
    pub(crate) fn indices(&self, row: usize) -> &[u32] {
        let start = row * self.neighbors;
        &self.indices[start..start + self.neighbors]
    }

    /// Borrows one row's cosine distances.
    #[must_use]
    #[inline]
    pub(crate) fn distances(&self, row: usize) -> &[f32] {
        let start = row * self.neighbors;
        &self.distances[start..start + self.neighbors]
    }

    #[must_use]
    #[inline]
    pub(super) fn all_indices(&self) -> &[u32] {
        &self.indices
    }

    #[must_use]
    #[inline]
    pub(super) fn all_distances(&self) -> &[f32] {
        &self.distances
    }
}

/// Semantic graph construction settings.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct SemanticGraphConfig {
    pub neighbors: NonZeroUsize,
}

impl Default for SemanticGraphConfig {
    fn default() -> Self {
        Self {
            neighbors: NonZeroUsize::new(DEFAULT_NEIGHBORS)
                .expect("default neighbor count should be nonzero"),
        }
    }
}

/// Persisted table and identities needed to reproduce it.
#[derive(Debug, Clone)]
pub(crate) struct SemanticGraph {
    pub table: KnnTable,
    pub backend: ContentHash,
    pub configuration: ContentHash,
}

/// Queries every representation and builds a validated persisted table.
pub(crate) fn build_semantic_graph(
    embeddings: ProjectorEmbeddings<'_>,
    index: &impl NeighborIndex,
    config: SemanticGraphConfig,
) -> Result<SemanticGraph, SemanticGraphError> {
    let started = Instant::now();
    let rows = embeddings.len();
    let neighbors = config.neighbors.get();
    if rows <= 1 || neighbors >= rows {
        return Err(SemanticGraphError::InvalidNeighborCount { rows, neighbors });
    }
    let entries = rows
        .checked_mul(neighbors)
        .ok_or(SemanticGraphError::TooManyNeighborEntries { rows, neighbors })?;
    let mut indices = vec![0_u32; entries];
    let mut distances = vec![0.0_f32; entries];

    indices
        .par_chunks_mut(neighbors)
        .zip(distances.par_chunks_mut(neighbors))
        .enumerate()
        .try_for_each(|(row, (row_indices, row_distances))| {
            let search_limit = (neighbors + 1).min(rows);
            let matches = index.search(embeddings.row(row), search_limit)?;
            let matches = normalize_neighbors(matches, row, rows, neighbors)?;
            for (offset, neighbor) in matches.into_iter().enumerate() {
                row_indices[offset] = neighbor.row;
                row_distances[offset] = neighbor.distance;
            }
            Ok::<_, SemanticGraphError>(())
        })?;

    let table = KnnTable::new(rows, neighbors, indices, distances)?;
    let mut hasher = ContentHasher::new(b"salt:semantic-graph-config:v1");
    hasher.update(
        &u64::try_from(neighbors)
            .expect("neighbor count should fit u64")
            .to_le_bytes(),
    );
    let graph = SemanticGraph {
        table,
        backend: index.identity(),
        configuration: hasher.finish(),
    };
    tracing::info!(
        target: "hash_graph_atlas::salt",
        rows,
        neighbors,
        entries,
        duration_ms = started.elapsed().as_millis(),
        "semantic graph built"
    );
    Ok(graph)
}

pub(super) fn normalize_neighbors(
    mut neighbors: Vec<Neighbor>,
    query_row: usize,
    rows: usize,
    required: usize,
) -> Result<Vec<Neighbor>, SemanticGraphError> {
    let query_row_u32 = u32::try_from(query_row).expect("query row should fit u32");
    for neighbor in &mut neighbors {
        if usize::try_from(neighbor.row)
            .ok()
            .is_none_or(|row| row >= rows)
        {
            return Err(SemanticGraphError::NeighborOutOfBounds {
                row: query_row,
                neighbor: u64::from(neighbor.row),
                rows,
            });
        }
        if !neighbor.distance.is_finite() {
            return Err(SemanticGraphError::NonFiniteDistance {
                row: query_row,
                neighbor: neighbor.row,
                distance: neighbor.distance,
            });
        }
        neighbor.distance = if neighbor.distance == 0.0 {
            0.0
        } else {
            neighbor.distance.clamp(0.0, 2.0)
        };
    }
    neighbors.sort_unstable_by(|left, right| {
        left.distance
            .total_cmp(&right.distance)
            .then_with(|| left.row.cmp(&right.row))
    });
    if let Some(duplicate) = neighbors
        .windows(2)
        .find(|pair| pair[0].row == pair[1].row)
        .map(|pair| pair[0].row)
    {
        return Err(SemanticGraphError::DuplicateNeighbor {
            row: query_row,
            neighbor: duplicate,
        });
    }
    neighbors.retain(|neighbor| neighbor.row != query_row_u32);
    if neighbors.len() < required {
        return Err(SemanticGraphError::SearchCount {
            row: query_row,
            expected_at_least: required,
            actual: neighbors.len(),
        });
    }
    neighbors.truncate(required);
    Ok(neighbors)
}

#[cfg(test)]
mod tests;
