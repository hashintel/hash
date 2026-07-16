//! Quality-gated fixtures for stage-level performance measurements.
//!
//! The benchmark executable is intentionally a thin consumer of production
//! implementations. Fixtures validate numerical behavior before Criterion
//! measures them, preventing a faster but incorrect implementation from
//! appearing as a benchmark improvement.

use super::{
    analytic::{
        AnalyticPoint, MergeTreeConfig, RasterConfig, RegionConfig, density_raster,
        density_regions, merge_tree,
    },
    graph::{
        SemanticGraphConfig, USearchConfig, USearchIndex, audit::audit_recall, build_semantic_graph,
    },
    representation::{CANONICAL_DIMENSIONS, OwnedCanonicalEmbedding, PROJECTOR_DIMENSIONS},
};
use crate::salt::graph::ProjectorEmbeddings;

/// Canonical embedding width used by the prefix benchmark.
pub const CANONICAL_WIDTH: usize = CANONICAL_DIMENSIONS;

/// Projector embedding width used by the prefix and graph benchmarks.
pub const PROJECTOR_WIDTH: usize = PROJECTOR_DIMENSIONS;

/// Minimum normalized persistence admitted by the analytic benchmark fixture.
pub const ANALYTIC_PERSISTENCE_FLOOR: f64 = 0.25;

/// Deterministic validated input for projector-prefix normalization.
pub struct PrefixFixture {
    embedding: OwnedCanonicalEmbedding,
}

impl PrefixFixture {
    /// Builds a finite input with mixed signs and no zero-norm prefix.
    ///
    /// # Panics
    ///
    /// This panics if the fixed modular fixture no longer fits its declared
    /// 16-bit intermediate or fails canonical embedding validation.
    #[must_use]
    pub fn new() -> Self {
        let values = (0..CANONICAL_DIMENSIONS)
            .map(|index| {
                let residue = (index * 109 + 37) % 2_003;
                f32::from(u16::try_from(residue).expect("residue should fit u16")) / 1_001.0 - 1.0
            })
            .collect();
        Self {
            embedding: OwnedCanonicalEmbedding::from_vec(values)
                .expect("benchmark embedding should validate"),
        }
    }

    /// Runs the production allocation-free prefix transform.
    #[must_use]
    pub fn normalize(&self, output: &mut [f32; PROJECTOR_WIDTH]) -> f64 {
        self.embedding.as_borrowed().normalize_prefix(output).norm
    }

    /// Compares a transformed prefix with an independent scalar `f64` oracle.
    #[must_use]
    pub fn maximum_error(&self, actual: &[f32; PROJECTOR_WIDTH]) -> f64 {
        let input = self.embedding.as_array();
        let norm = input[..PROJECTOR_DIMENSIONS]
            .iter()
            .map(|value| f64::from(*value).powi(2))
            .sum::<f64>()
            .sqrt();
        actual
            .iter()
            .zip(&input[..PROJECTOR_DIMENSIONS])
            .map(|(&actual, &value)| (f64::from(actual) - f64::from(value) / norm).abs())
            .fold(0.0, f64::max)
    }
}

impl Default for PrefixFixture {
    fn default() -> Self {
        Self::new()
    }
}

/// Aggregate result that keeps semantic-graph work observable to Criterion.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct SemanticGraphObservation {
    /// Number of persisted directed neighbor entries.
    pub entries: usize,
    /// Content identity of the graph configuration.
    pub configuration: [u8; 32],
}

/// Deterministic ANN fixture admitted by the production exact-recall gate.
pub struct SemanticGraphFixture {
    values: Box<[f32]>,
    index: USearchIndex,
    rows: usize,
    recall: f64,
}

/// Observable quality and work produced by analytic materialization.
#[derive(Debug, Copy, Clone, PartialEq)]
pub struct AnalyticObservation {
    /// Number of persistent merge-tree leaves.
    pub persistent_leaves: usize,
    /// Number of retained watershed regions.
    pub regions: usize,
    /// Total persistence normalized by maximum density.
    pub normalized_persistence: f64,
}

/// Deterministic separated-cluster fixture for analytic quality and wall time.
pub struct AnalyticFixture {
    points: Box<[AnalyticPoint]>,
    coordinates: Box<[[f64; 2]]>,
    rows: usize,
}

impl AnalyticFixture {
    /// Builds three compact clusters with unequal mass.
    ///
    /// # Panics
    ///
    /// This panics when fewer than 96 rows are requested or when the production
    /// analytic stages fail their persistence and region quality floors.
    #[must_use]
    pub fn new(rows: usize) -> Self {
        assert!(rows >= 96, "analytic benchmark requires at least 96 rows");
        let coordinates = (0..rows)
            .map(|row| {
                let cluster = row % 3;
                let center = [[-3.0, -2.0], [3.0, -2.0], [0.0, 3.0]][cluster];
                let dx = f64::from(
                    u16::try_from((row * 37) % 101).expect("fixture residue should fit u16"),
                ) / 500.0
                    - 0.1;
                let dy = f64::from(
                    u16::try_from((row * 61) % 103).expect("fixture residue should fit u16"),
                ) / 500.0
                    - 0.1;
                [center[0] + dx, center[1] + dy]
            })
            .collect::<Box<[_]>>();
        let points = coordinates
            .iter()
            .enumerate()
            .map(|(row, &coordinate)| AnalyticPoint {
                coordinate,
                mass: match row % 3 {
                    0 => 1.0,
                    1 => 0.8,
                    _ => 0.6,
                },
            })
            .collect::<Box<[_]>>();
        let fixture = Self {
            points,
            coordinates,
            rows,
        };
        let quality = fixture.build_analytics();
        assert!(
            quality.persistent_leaves >= 3,
            "analytic fixture must retain all three separated peaks"
        );
        assert!(
            quality.regions >= 3,
            "analytic fixture must retain all three watershed regions"
        );
        assert!(
            quality.normalized_persistence >= ANALYTIC_PERSISTENCE_FLOOR,
            "analytic fixture must satisfy the normalized persistence floor"
        );
        fixture
    }

    /// Runs raster, merge-tree, and watershed construction.
    ///
    /// # Panics
    ///
    /// This panics only if the deterministic fixture violates a production
    /// analytic invariant.
    #[must_use]
    pub fn build_analytics(&self) -> AnalyticObservation {
        let raster = density_raster(
            &self.points,
            RasterConfig {
                grid_size: 256,
                bandwidth_pixels: 2.0,
            },
        )
        .expect("benchmark raster should build");
        let tree = merge_tree(&raster, MergeTreeConfig::default())
            .expect("benchmark merge tree should build");
        let regions = density_regions(
            &raster,
            &tree,
            &self.coordinates,
            RegionConfig {
                density_floor_fraction: 0.005,
                minimum_peak_fraction: 0.05,
                maximum_regions: 16,
            },
        )
        .expect("benchmark regions should build");
        AnalyticObservation {
            persistent_leaves: tree.leaves().len(),
            regions: regions.peaks().len(),
            normalized_persistence: tree.normalized_persistence(),
        }
    }

    /// Returns the corpus row count.
    #[must_use]
    pub const fn rows(&self) -> usize {
        self.rows
    }
}

impl SemanticGraphFixture {
    /// Builds and exact-audits a normalized synthetic corpus.
    ///
    /// # Panics
    ///
    /// This panics when fewer than 52 rows are requested or when production
    /// validation, ANN construction, or the `0.95` recall gate fails.
    #[must_use]
    #[expect(
        clippy::cast_possible_truncation,
        reason = "bounded normalized fixture components are intentionally represented as f32"
    )]
    pub fn new(rows: usize) -> Self {
        assert!(rows >= 52, "semantic benchmark requires at least 52 rows");
        let mut values = vec![0.0_f32; rows * PROJECTOR_DIMENSIONS];
        for (row, embedding) in values.chunks_exact_mut(PROJECTOR_DIMENSIONS).enumerate() {
            let mut squared_norm = 0.0_f64;
            for (column, value) in embedding.iter_mut().enumerate() {
                let mixed = row
                    .wrapping_mul(1_000_003)
                    .wrapping_add(column.wrapping_mul(97_409))
                    .wrapping_add(row.wrapping_mul(column).wrapping_mul(0x0001_0001));
                let residue = mixed % 20_003;
                let centered =
                    f64::from(u16::try_from(residue).expect("residue should fit u16")) - 10_001.0;
                *value = (centered / 10_001.0) as f32;
                squared_norm += f64::from(*value).powi(2);
            }
            let inverse = squared_norm.sqrt().recip();
            for value in embedding {
                *value = (f64::from(*value) * inverse) as f32;
            }
        }
        let embeddings =
            ProjectorEmbeddings::new(&values).expect("benchmark representations should validate");
        let index = USearchIndex::build(embeddings, USearchConfig::default())
            .expect("benchmark ANN index should build");
        let sample_count = 32.min(rows);
        let sample = (0..sample_count)
            .map(|index| {
                u32::try_from(index * rows / sample_count).expect("sample row should fit u32")
            })
            .collect::<Vec<_>>();
        let recall = audit_recall(embeddings, &index, &sample)
            .and_then(super::graph::audit::RecallAudit::require_minimum)
            .expect("benchmark ANN index should pass the exact-recall gate")
            .recall;
        Self {
            values: values.into_boxed_slice(),
            index,
            rows,
            recall,
        }
    }

    /// Returns exact-audit recall measured before timing begins.
    #[must_use]
    pub const fn recall(&self) -> f64 {
        self.recall
    }

    /// Builds the complete directed semantic table with production code.
    ///
    /// # Panics
    ///
    /// This panics if immutable fixture values no longer validate or the
    /// already-audited backend cannot produce a complete neighbor table.
    #[must_use]
    pub fn build_graph(&self) -> SemanticGraphObservation {
        let embeddings = ProjectorEmbeddings::new(&self.values)
            .expect("validated benchmark representations should remain valid");
        let graph = build_semantic_graph(embeddings, &self.index, SemanticGraphConfig::default())
            .expect("quality-gated benchmark graph should build");
        SemanticGraphObservation {
            entries: graph.table.rows() * graph.table.neighbors(),
            configuration: *graph.configuration.as_bytes(),
        }
    }

    /// Returns the corpus row count.
    #[must_use]
    pub const fn rows(&self) -> usize {
        self.rows
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projector_prefix_matches_the_scalar_quality_oracle() {
        let fixture = PrefixFixture::new();
        let mut output = [0.0; PROJECTOR_WIDTH];
        let _ = fixture.normalize(&mut output);

        assert!(fixture.maximum_error(&output) <= 1.0e-7);
    }

    #[test]
    fn semantic_fixture_passes_recall_before_building_the_timed_stage() {
        let fixture = SemanticGraphFixture::new(128);
        let observation = fixture.build_graph();

        assert_eq!(observation.entries, 128 * 30);
    }

    #[test]
    fn analytic_fixture_passes_persistence_before_timing() {
        let observation = AnalyticFixture::new(192).build_analytics();

        assert!(observation.persistent_leaves >= 3);
        assert!(observation.regions >= 3);
        assert!(observation.normalized_persistence >= ANALYTIC_PERSISTENCE_FLOOR);
    }
}
