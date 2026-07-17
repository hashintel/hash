//! `USearch` cosine index behind the semantic-neighbor interface.
//!
//! Construction uses one writer context so host parallelism cannot alter the
//! random level stream. Query scratch space is expanded only after the graph is
//! complete. The C++ default random engine remains implementation-defined, so
//! byte-for-byte regeneration requires the same pinned binary toolchain; the
//! persisted neighbor table and its exact-recall audit are the portable
//! generation record.

use core::{fmt, num::NonZeroUsize};
use std::time::Instant;

use usearch::{Index, IndexOptions, MetricKind, ScalarKind};

use super::{Neighbor, NeighborIndex, ProjectorEmbeddings, SemanticGraphError};
use crate::salt::{
    hash::{ContentHash, ContentHasher},
    representation::PROJECTOR_DIMENSIONS,
};

const DEFAULT_CONNECTIVITY: usize = 16;
const DEFAULT_EXPANSION_ADD: usize = 200;
const DEFAULT_EXPANSION_SEARCH: usize = 128;

/// Pinned `USearch` HNSW build and query settings.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct USearchConfig {
    pub connectivity: NonZeroUsize,
    pub expansion_add: NonZeroUsize,
    pub expansion_search: NonZeroUsize,
}

impl Default for USearchConfig {
    fn default() -> Self {
        Self {
            connectivity: NonZeroUsize::new(DEFAULT_CONNECTIVITY)
                .expect("default connectivity should be nonzero"),
            expansion_add: NonZeroUsize::new(DEFAULT_EXPANSION_ADD)
                .expect("default build expansion should be nonzero"),
            expansion_search: NonZeroUsize::new(DEFAULT_EXPANSION_SEARCH)
                .expect("default search expansion should be nonzero"),
        }
    }
}

/// Immutable `USearch` index built in generation-row order.
pub(crate) struct USearchIndex {
    index: Index,
    identity: ContentHash,
}

impl USearchIndex {
    /// Builds an index through one writer context in generation-row order.
    ///
    /// # Errors
    ///
    /// Returns an error when `USearch` cannot allocate, reserve, or add a row.
    pub(crate) fn build(
        embeddings: ProjectorEmbeddings<'_>,
        config: USearchConfig,
    ) -> Result<Self, SemanticGraphError> {
        let started = Instant::now();
        let index = Index::new(&IndexOptions {
            dimensions: PROJECTOR_DIMENSIONS,
            metric: MetricKind::Cos,
            quantization: ScalarKind::F32,
            connectivity: config.connectivity.get(),
            expansion_add: config.expansion_add.get(),
            expansion_search: config.expansion_search.get(),
            multi: false,
        })?;
        index.reserve_capacity_and_threads(embeddings.len(), 1)?;
        for row in 0..embeddings.len() {
            index.add(
                u64::try_from(row).expect("validated row should fit u64"),
                embeddings.row(row),
            )?;
        }
        index
            .reserve_capacity_and_threads(embeddings.len(), rayon::current_num_threads().max(1))?;

        let mut hasher = ContentHasher::new(b"salt:ann-backend:usearch-hnsw:v3");
        hasher.update(usearch::version().as_bytes());
        hasher.update(b"single-threaded-build");
        hasher.update(index.hardware_acceleration().as_bytes());
        hasher.update(
            &u64::try_from(PROJECTOR_DIMENSIONS)
                .expect("projector dimensions should fit u64")
                .to_le_bytes(),
        );
        for value in [
            config.connectivity.get(),
            config.expansion_add.get(),
            config.expansion_search.get(),
        ] {
            hasher.update(
                &u64::try_from(value)
                    .expect("USearch option should fit u64")
                    .to_le_bytes(),
            );
        }

        let built = Self {
            index,
            identity: hasher.finish(),
        };
        tracing::info!(
            target: "hash_graph_atlas::salt",
            rows = embeddings.len(),
            dimensions = PROJECTOR_DIMENSIONS,
            duration_ms = started.elapsed().as_millis(),
            "semantic ANN index built"
        );
        Ok(built)
    }
}

impl fmt::Debug for USearchIndex {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("USearchIndex")
            .field("identity", &self.identity)
            .finish_non_exhaustive()
    }
}

impl NeighborIndex for USearchIndex {
    fn search(
        &self,
        query: &[f32; PROJECTOR_DIMENSIONS],
        limit: usize,
    ) -> Result<Vec<Neighbor>, SemanticGraphError> {
        let matches = self.index.search(query, limit)?;
        if matches.keys.len() != limit || matches.distances.len() != limit {
            return Err(SemanticGraphError::IndexResultLength {
                requested: limit,
                keys: matches.keys.len(),
                distances: matches.distances.len(),
            });
        }
        let mut neighbors = Vec::with_capacity(matches.keys.len());
        for (&key, &distance) in matches.keys.iter().zip(&matches.distances) {
            let row =
                u32::try_from(key).map_err(|_| SemanticGraphError::IndexKeyOverflow { key })?;
            neighbors.push(Neighbor { row, distance });
        }
        Ok(neighbors)
    }

    #[inline]
    fn identity(&self) -> ContentHash {
        self.identity
    }
}
