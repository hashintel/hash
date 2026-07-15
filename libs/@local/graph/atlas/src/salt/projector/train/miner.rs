use core::num::NonZeroUsize;
use std::{collections::HashSet, time::Instant};

use usearch::{Index, IndexOptions, MetricKind, ScalarKind};

use super::{HardNegativeError, sample::SampledEdge};
use crate::salt::{
    graph::KnnTable,
    hash::{ContentHash, ContentHasher},
    identity::GenerationRowId,
    relation::{PairProtection, RelationPair},
};

/// Bounded 2D mining schedule and rank-weight function.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct HardNegativeConfig {
    pub neighbors: NonZeroUsize,
    pub candidate_multiplier: NonZeroUsize,
    pub connectivity: NonZeroUsize,
    pub expansion_add: NonZeroUsize,
    pub expansion_search: NonZeroUsize,
    pub maximum_weight: f64,
    pub rank_exponent: f64,
}

impl HardNegativeConfig {
    /// Validates positive finite rank-weight coefficients.
    ///
    /// # Errors
    ///
    /// This returns an error when maximum weight or rank exponent is not
    /// finite and positive.
    pub(crate) fn validate(self) -> Result<Self, HardNegativeError> {
        for (field, value) in [
            ("maximum-weight", self.maximum_weight),
            ("rank-exponent", self.rank_exponent),
        ] {
            if !value.is_finite() || value <= 0.0 {
                return Err(HardNegativeError::InvalidConfig { field, value });
            }
        }
        Ok(self)
    }

    /// Returns the stable backend and mining identity.
    #[must_use]
    pub(crate) fn content_hash(self) -> ContentHash {
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.hard-negative-usearch.v2");
        hasher.update(b"usearch-2.25.3");
        hasher.update(b"single-threaded-build");
        for value in [
            self.neighbors.get(),
            self.candidate_multiplier.get(),
            self.connectivity.get(),
            self.expansion_add.get(),
            self.expansion_search.get(),
        ] {
            hasher.update(
                &u64::try_from(value)
                    .expect("hard-negative setting should fit u64")
                    .to_le_bytes(),
            );
        }
        hasher.update(&self.maximum_weight.to_bits().to_le_bytes());
        hasher.update(&self.rank_exponent.to_bits().to_le_bytes());
        hasher.finish()
    }
}

/// Replaceable nearest-neighbor backend over a detached coordinate field.
pub(crate) trait SpatialNeighborIndex {
    fn rows(&self) -> usize;

    /// Returns nearest generation rows in backend distance order.
    ///
    /// # Errors
    ///
    /// This returns an error when the query row or backend result is invalid.
    fn search(
        &self,
        row: GenerationRowId,
        limit: usize,
    ) -> Result<Vec<SpatialNeighbor>, HardNegativeError>;

    fn identity(&self) -> ContentHash;
}

/// One detached spatial neighbor and its squared Euclidean distance.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SpatialNeighbor {
    pub row: u32,
    pub distance: f32,
}

impl<Spatial> SpatialNeighborIndex for &Spatial
where
    Spatial: SpatialNeighborIndex,
{
    #[inline]
    fn rows(&self) -> usize {
        <Spatial as SpatialNeighborIndex>::rows(*self)
    }

    #[inline]
    fn search(
        &self,
        row: GenerationRowId,
        limit: usize,
    ) -> Result<Vec<SpatialNeighbor>, HardNegativeError> {
        <Spatial as SpatialNeighborIndex>::search(*self, row, limit)
    }

    #[inline]
    fn identity(&self) -> ContentHash {
        <Spatial as SpatialNeighborIndex>::identity(*self)
    }
}

/// `USearch` HNSW implementation of the detached 2D mining index.
pub(crate) struct USearchSpatialIndex {
    index: Index,
    coordinates: Box<[[f32; 2]]>,
    identity: ContentHash,
}

impl USearchSpatialIndex {
    /// Builds a 2D Euclidean index in generation-row order.
    ///
    /// # Errors
    ///
    /// This returns an error for non-finite coordinates or backend failure.
    pub(crate) fn build(
        coordinates: &[[f64; 2]],
        config: HardNegativeConfig,
    ) -> Result<Self, HardNegativeError> {
        let started = Instant::now();
        let config = config.validate()?;
        if coordinates.is_empty() {
            return Err(HardNegativeError::EmptyCoordinates);
        }
        let mut narrowed = Vec::with_capacity(coordinates.len());
        for (row, coordinate) in coordinates.iter().enumerate() {
            let mut value = [0.0_f32; 2];
            for axis in 0..2 {
                if !coordinate[axis].is_finite() {
                    return Err(HardNegativeError::NonFiniteCoordinate {
                        row,
                        axis,
                        value: coordinate[axis],
                    });
                }
                #[expect(
                    clippy::cast_possible_truncation,
                    reason = "coordinate representability is checked immediately after conversion"
                )]
                {
                    value[axis] = coordinate[axis] as f32;
                }
                if !value[axis].is_finite() {
                    return Err(HardNegativeError::CoordinateOverflow {
                        row,
                        axis,
                        value: coordinate[axis],
                    });
                }
            }
            narrowed.push(value);
        }
        let index = Index::new(&IndexOptions {
            dimensions: 2,
            metric: MetricKind::L2sq,
            quantization: ScalarKind::F32,
            connectivity: config.connectivity.get(),
            expansion_add: config.expansion_add.get(),
            expansion_search: config.expansion_search.get(),
            multi: false,
        })?;
        index.reserve_capacity_and_threads(narrowed.len(), 1)?;
        for (row, coordinate) in narrowed.iter().enumerate() {
            index.add(
                u64::try_from(row).expect("generation row should fit u64"),
                coordinate,
            )?;
        }
        let spatial = Self {
            index,
            coordinates: narrowed.into_boxed_slice(),
            identity: config.content_hash(),
        };
        tracing::debug!(
            target: "hash_graph_atlas::salt",
            rows = spatial.coordinates.len(),
            duration_ms = started.elapsed().as_millis(),
            "hard-negative spatial index refreshed"
        );
        Ok(spatial)
    }
}

impl SpatialNeighborIndex for USearchSpatialIndex {
    #[inline]
    fn rows(&self) -> usize {
        self.coordinates.len()
    }

    fn search(
        &self,
        row: GenerationRowId,
        limit: usize,
    ) -> Result<Vec<SpatialNeighbor>, HardNegativeError> {
        let query =
            self.coordinates
                .get(row.as_usize())
                .ok_or_else(|| HardNegativeError::QueryRow {
                    row: row.as_u32(),
                    rows: self.rows(),
                })?;
        let matches = self.index.search(query, limit)?;
        matches
            .keys
            .into_iter()
            .zip(matches.distances)
            .map(|(key, distance)| {
                Ok(SpatialNeighbor {
                    row: u32::try_from(key)
                        .map_err(|_error| HardNegativeError::IndexKeyOverflow { key })?,
                    distance,
                })
            })
            .collect()
    }

    #[inline]
    fn identity(&self) -> ContentHash {
        self.identity
    }
}

/// Mines close 2D pairs after semantic and hard-protection exclusions.
pub(crate) struct HardNegativeMiner<'index, Spatial> {
    spatial: Spatial,
    semantic: &'index KnnTable,
    protection: &'index [PairProtection],
    config: HardNegativeConfig,
}

impl<'index, Spatial> HardNegativeMiner<'index, Spatial>
where
    Spatial: SpatialNeighborIndex,
{
    /// Binds detached spatial, semantic, and protection indexes.
    ///
    /// # Errors
    ///
    /// This returns an error unless row counts agree and protection pairs are
    /// strictly ordered.
    pub(crate) fn new(
        spatial: Spatial,
        semantic: &'index KnnTable,
        protection: &'index [PairProtection],
        config: HardNegativeConfig,
    ) -> Result<Self, HardNegativeError> {
        if !protection.is_sorted_by(|left, right| left.pair < right.pair) {
            return Err(HardNegativeError::UnorderedProtection);
        }
        Self::from_ordered_protection(spatial, semantic, protection, config)
    }

    pub(super) fn from_ordered_protection(
        spatial: Spatial,
        semantic: &'index KnnTable,
        protection: &'index [PairProtection],
        config: HardNegativeConfig,
    ) -> Result<Self, HardNegativeError> {
        let config = config.validate()?;
        if spatial.rows() != semantic.rows() {
            return Err(HardNegativeError::RowCount {
                spatial: spatial.rows(),
                semantic: semantic.rows(),
            });
        }
        Ok(Self {
            spatial,
            semantic,
            protection,
            config,
        })
    }

    /// Mines rank-weighted candidates for one generation row.
    ///
    /// # Errors
    ///
    /// This returns an error when the row is invalid, the backend fails, or
    /// fewer than the configured count remain after exclusions.
    pub(crate) fn mine(&self, row: GenerationRowId) -> Result<Vec<SampledEdge>, HardNegativeError> {
        if row.as_usize() >= self.semantic.rows() {
            return Err(HardNegativeError::QueryRow {
                row: row.as_u32(),
                rows: self.semantic.rows(),
            });
        }
        let requested = self.config.neighbors.get();
        let mut limit = requested
            .saturating_mul(self.config.candidate_multiplier.get())
            .saturating_add(1)
            .min(self.spatial.rows());
        let mut accepted = Vec::with_capacity(requested);
        loop {
            accepted.clear();
            let mut seen = HashSet::with_capacity(limit);
            let mut neighbors = self.spatial.search(row, limit)?;
            for neighbor in &neighbors {
                if !neighbor.distance.is_finite() || neighbor.distance.is_sign_negative() {
                    return Err(HardNegativeError::InvalidDistance {
                        row: neighbor.row,
                        distance: neighbor.distance,
                    });
                }
            }
            neighbors.sort_unstable_by(|left, right| {
                left.distance
                    .total_cmp(&right.distance)
                    .then_with(|| left.row.cmp(&right.row))
            });
            for neighbor in neighbors {
                let candidate = GenerationRowId::from_u32(neighbor.row)
                    .expect("spatial row should fit generation ID");
                if candidate == row
                    || !seen.insert(candidate)
                    || semantic_pair(self.semantic, row, candidate)
                    || hard_protected(self.protection, RelationPair::new(row, candidate))
                {
                    continue;
                }
                let rank = accepted.len();
                #[expect(
                    clippy::cast_precision_loss,
                    reason = "hard-negative minibatch ranks remain exactly representable in f64"
                )]
                let relative_rank = rank as f64 / requested as f64;
                accepted.push(SampledEdge {
                    left: row,
                    right: candidate,
                    weight: self.config.maximum_weight
                        * (1.0 - relative_rank).powf(self.config.rank_exponent),
                });
                if accepted.len() == requested {
                    return Ok(accepted);
                }
            }
            if limit == self.spatial.rows() {
                return Err(HardNegativeError::InsufficientCandidates {
                    row: row.as_u32(),
                    requested,
                    produced: accepted.len(),
                });
            }
            limit = limit.saturating_mul(2).min(self.spatial.rows());
        }
    }
}

#[inline]
fn semantic_pair(graph: &KnnTable, left: GenerationRowId, right: GenerationRowId) -> bool {
    graph.indices(left.as_usize()).contains(&right.as_u32())
        || graph.indices(right.as_usize()).contains(&left.as_u32())
}

#[inline]
fn hard_protected(protection: &[PairProtection], pair: RelationPair) -> bool {
    protection
        .binary_search_by_key(&pair, |entry| entry.pair)
        .is_ok_and(|index| protection[index].hard)
}
