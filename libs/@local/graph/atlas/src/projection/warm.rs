//! Refit warm starts from a previous generation's artifacts.
//!
//! A refit stays visually stable when it starts near the previous answer.
//! [`load_warm_start`] validates a previous artifact directory against the
//! current fit's feature contract, and the resulting [`WarmStart`] offers
//! the two initialization inputs the pipeline uses:
//!
//! - the previous alpha-1.0 layout coordinates, reused row for row when the sample is unchanged;
//! - the previous alpha-1.0 encoder, both as an initializer for the first projector and, via
//!   [`infer_initial_coordinates`], as a placement model for a changed sample.
//!
//! Every failure mode here is a fallback, not an error: a missing,
//! unreadable, or incompatible previous generation logs a warning and the
//! fit proceeds cold.

use core::error::Error;

use burn::tensor::{Tensor, TensorData, backend::Backend};
use camino::Utf8Path;

use super::{
    artifact::{LoadedProjection, load_projection},
    features::{StructureFeatureOptions, StructureFeatures},
    mlp::Projector,
    pipeline::ProjectionError,
};
use crate::float::FloatBytes;

/// A validated previous generation usable for warm starts.
pub(super) struct WarmStart<B: Backend> {
    pub(super) projection: LoadedProjection<B>,
    previous_layout: FloatBytes,
}

impl<B: Backend> WarmStart<B> {
    /// The previous alpha-1.0 coordinates, when their row count matches the
    /// current sample.
    pub(super) fn coordinates(&self, rows: usize) -> Option<Vec<[f32; 2]>> {
        (self.previous_layout.len() == rows).then(|| {
            (0..rows)
                .map(|row| {
                    let coordinates = self.previous_layout.row(row);
                    [coordinates[0], coordinates[1]]
                })
                .collect()
        })
    }

    /// The previous alpha-1.0 encoder in standardized output space, ready to
    /// initialize the first projector.
    pub(super) fn standardized_encoder(&self, device: &B::Device) -> Option<Projector<B>> {
        self.projection
            .encoder(1.0)
            .map(|encoder| encoder.standardized(device))
    }
}

/// Loads and validates a previous generation for warm starting.
///
/// Compatibility requires the previous fit's embedding width, neighbor cap,
/// and selection salt to match the current options, and an alpha-1.0 encoder
/// and layout to be present. Returns `None`, with a warning, when the
/// artifacts are missing or incompatible; the caller then falls back to a
/// cold start.
pub(super) fn load_warm_start<B: Backend>(
    directory: &Utf8Path,
    embeddings: &FloatBytes,
    features: &StructureFeatureOptions,
    device: &B::Device,
) -> Option<WarmStart<B>> {
    let projection = match load_projection::<B>(directory, device) {
        Ok(projection) => projection,
        Err(error) => {
            tracing::warn!(
                directory = %directory,
                error = &error as &dyn Error,
                "previous artifacts are absent or unreadable; falling back to a cold start"
            );
            return None;
        }
    };

    let metadata = &projection.metadata;
    let compatible = metadata.embedding_dimensions == embeddings.dim()
        && metadata.neighbor_cap == features.neighbor_cap
        && metadata.salt == features.salt
        && projection.encoder(1.0).is_some();
    if !compatible {
        tracing::warn!(
            directory = %directory,
            "previous artifacts are incompatible with the current feature contract; falling back \
             to a cold start"
        );
        return None;
    }

    let layout_file = projection
        .metadata
        .encoders
        .iter()
        .find(|encoder| encoder.tag == "a100")
        .map(|encoder| directory.join(&encoder.layout_file))?;
    let previous_layout = std::fs::File::open(&layout_file)
        .map_err(|error| {
            tracing::warn!(
                layout = %layout_file,
                error = &error as &dyn Error,
                "previous alpha-1.0 layout is unreadable; falling back to a cold start"
            );
        })
        .ok()
        .and_then(|file| {
            FloatBytes::from_file(file, core::num::NonZero::new(2).expect("2 is non-zero"))
                .map_err(|error| {
                    tracing::warn!(
                        layout = %layout_file,
                        error = &error as &dyn Error,
                        "previous alpha-1.0 layout is malformed; falling back to a cold start"
                    );
                })
                .ok()
        })?;

    Some(WarmStart {
        projection,
        previous_layout,
    })
}

/// Places every current row with the previous alpha-1.0 encoder.
///
/// The features were generated with the current fit's degree normalizer, but
/// the previous encoder expects its own fit-time normalizer; the degree
/// column is rescaled per batch so the encoder sees the inputs it was
/// trained on. The resulting coordinates are in the previous layout's units,
/// which is exactly the warm-start contract.
///
/// # Errors
///
/// Returns an error when the encoder produces a non-finite coordinate, which
/// would poison the layout optimization it initializes.
pub(super) fn infer_initial_coordinates<B: Backend>(
    warm: &WarmStart<B>,
    features: &StructureFeatures,
    device: &B::Device,
) -> Result<Vec<[f32; 2]>, ProjectionError> {
    const INFERENCE_BATCH: usize = 8192;

    let encoder = warm
        .projection
        .encoder(1.0)
        .expect("compatibility validation requires the alpha-1.0 encoder");
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the normalizer ratio is near one; f32 carries it fine"
    )]
    let degree_rescale =
        (features.degree_normalizer / warm.projection.metadata.degree_normalizer) as f32;

    let rows = features.values.len();
    let dimensions = features.values.dim();
    let mut coordinates = Vec::with_capacity(rows);
    let mut batch = Vec::with_capacity(INFERENCE_BATCH * dimensions);

    let mut start = 0;
    while start < rows {
        let stop = (start + INFERENCE_BATCH).min(rows);
        batch.clear();
        for row in start..stop {
            batch.extend_from_slice(features.values.row(row));
            // The degree column is the last value of the row.
            let last = batch.len() - 1;
            batch[last] *= degree_rescale;
        }

        let input = Tensor::<B, 2>::from_data(
            TensorData::new(batch.clone(), [stop - start, dimensions]),
            device,
        );
        let output = encoder
            .encoder
            .forward(input)
            .into_data()
            .to_vec::<f32>()
            .expect("encoder output is a contiguous f32 tensor");

        for (offset, pair) in output.chunks_exact(2).enumerate() {
            let row = start + offset;
            for (axis, &value) in pair.iter().enumerate() {
                if !value.is_finite() {
                    return Err(ProjectionError::WarmStartCoordinate { row, axis, value });
                }
            }
            coordinates.push([pair[0], pair[1]]);
        }
        start = stop;
    }

    Ok(coordinates)
}

#[cfg(test)]
mod tests {
    use core::num::NonZero;

    use burn::backend::{Autodiff, Candle, candle::CandleDevice};
    use camino::Utf8Path;

    use super::*;
    use crate::{
        float::FloatBytes,
        macros::nz,
        projection::{
            artifact::publish_projection,
            features::{StructureFeatureOptions, structure_features},
            graph::{SemanticGraphOptions, semantic_graph},
            initialization::{PcaOptions, pca_initialization},
            layout::{LayoutLadderOptions, fit_layout_ladder, fit_projectors},
            mlp::TrainingConfig,
            relation::RelationGraph,
        },
    };

    type TestBackend = Candle;
    type TestAutodiffBackend = Autodiff<TestBackend>;

    const ROWS: usize = 40;
    const DIM: usize = 8;

    fn device() -> CandleDevice {
        CandleDevice::Cpu
    }

    /// Two drifting clusters of unit-norm embeddings.
    fn embeddings() -> FloatBytes {
        let mut values = Vec::with_capacity(ROWS * DIM);
        for row in 0..ROWS {
            let mut embedding = [0.0_f32; DIM];
            let cluster = (row % 2) * 4;
            for (index, value) in embedding.iter_mut().enumerate() {
                let phase = (row * 13 + index * 7) % 23;
                *value = 0.1 + phase as f32 / 23.0 + if index == cluster { 2.0 } else { 0.0 };
            }
            let norm = embedding
                .iter()
                .map(|value| value * value)
                .sum::<f32>()
                .sqrt();
            values.extend(embedding.iter().map(|value| value / norm));
        }
        FloatBytes::from_vec(values, NonZero::new(DIM).unwrap()).unwrap()
    }

    /// A symmetric ring adjacency with unit weights.
    fn relation_graphs() -> RelationGraph {
        let mut indptr = Vec::with_capacity(ROWS + 1);
        let mut indices = Vec::with_capacity(ROWS * 2);
        indptr.push(0_u32);
        for row in 0..ROWS {
            let mut neighbors = [(row + ROWS - 1) % ROWS, (row + 1) % ROWS];
            neighbors.sort_unstable();
            indices.extend(neighbors.map(|neighbor| neighbor as u32));
            indptr.push(indices.len() as u32);
        }
        let values = vec![1.0_f32; indices.len()];
        let adjacency =
            crate::projection::graph::SparseGraph::new((ROWS, ROWS), indptr, indices, values);
        RelationGraph {
            graph: adjacency.clone(),
            adjacency,
            hubs: Vec::new(),
        }
    }

    fn training_config() -> TrainingConfig {
        TrainingConfig {
            batch_size: 16,
            epochs: 3,
            validation_fraction: 0.1,
            num_workers: 1,
            ..TrainingConfig::default()
        }
    }

    /// Runs every numerical stage end to end and exercises the warm-start
    /// helpers against the published artifacts.
    #[test]
    fn smoke_tests_the_numerical_pipeline_and_warm_start() {
        let directory = tempfile::tempdir().expect("output directory should open");
        let out = Utf8Path::from_path(directory.path()).expect("path should be UTF-8");
        let embeddings = embeddings();
        let relation = relation_graphs();
        let feature_options = StructureFeatureOptions {
            neighbor_cap: 4,
            ..StructureFeatureOptions::default()
        };

        // Cold numerical pipeline: PCA -> semantic -> ladder -> features ->
        // projectors -> publication.
        let initial = pca_initialization(&embeddings, PcaOptions { sketch_rows: 16 })
            .expect("PCA should initialize");
        let semantic = semantic_graph(
            &embeddings,
            SemanticGraphOptions {
                neighbors: nz!(5_usize),
                expansion_search: nz!(16_usize),
                ..SemanticGraphOptions::default()
            },
        )
        .expect("semantic graph should build");
        let layouts = fit_layout_ladder(
            &semantic,
            &relation.graph,
            initial,
            out,
            LayoutLadderOptions {
                alphas: vec![1.0, 0.5],
                first_epochs: 4,
                chained_epochs: 2,
                ..LayoutLadderOptions::default()
            },
        )
        .expect("layout ladder should fit");
        let features = structure_features(&embeddings, &relation.adjacency, feature_options)
            .expect("structure features should build");
        let encoders = fit_projectors::<TestAutodiffBackend>(
            &features.values,
            &layouts,
            None,
            training_config(),
            2,
            directory.path().join("training"),
            &device(),
        )
        .expect("projector ladder should fit");
        assert_eq!(encoders.len(), 2);
        assert!(
            encoders
                .iter()
                .all(|(_, fitted)| fitted.validation_rmse.is_finite())
        );
        publish_projection(out, &features, &relation.hubs, &encoders, &layouts)
            .expect("artifacts should publish");

        // The published generation loads back as a compatible warm start.
        let warm = load_warm_start::<TestBackend>(out, &embeddings, &feature_options, &device())
            .expect("published artifacts should be a valid warm start");

        // Unchanged sample: coordinates carry over row for row.
        let carried = warm
            .coordinates(ROWS)
            .expect("row counts match, so coordinates carry over");
        assert_eq!(carried.len(), ROWS);
        let persisted = &layouts[0].coordinates;
        for (row, coordinate) in carried.iter().enumerate() {
            assert_eq!(persisted.row(row), coordinate.as_slice());
        }
        assert_ne!(
            warm.coordinates(ROWS + 1),
            Some(carried.clone()),
            "a changed row count must not carry coordinates"
        );
        assert!(warm.coordinates(ROWS + 1).is_none());

        // Changed sample: the previous encoder places every row finitely.
        let inferred = infer_initial_coordinates::<TestBackend>(&warm, &features, &device())
            .expect("warm-start inference should succeed");
        assert_eq!(inferred.len(), ROWS);
        assert!(inferred.iter().flatten().all(|value| value.is_finite()));

        // The first projector's warm start is available.
        assert!(warm.standardized_encoder(&device()).is_some());
    }

    #[test]
    fn falls_back_when_artifacts_are_missing_or_incompatible() {
        let directory = tempfile::tempdir().expect("output directory should open");
        let out = Utf8Path::from_path(directory.path()).expect("path should be UTF-8");
        let embeddings = embeddings();
        let options = StructureFeatureOptions::default();

        // Missing artifacts: fallback.
        assert!(load_warm_start::<TestBackend>(out, &embeddings, &options, &device()).is_none());

        // Published but incompatible artifacts (different salt): fallback.
        let relation = relation_graphs();
        let features = structure_features(&embeddings, &relation.adjacency, options)
            .expect("structure features should build");
        let layouts = fit_layout_ladder(
            &semantic_graph(
                &embeddings,
                SemanticGraphOptions {
                    neighbors: nz!(5_usize),
                    expansion_search: nz!(16_usize),
                    ..SemanticGraphOptions::default()
                },
            )
            .expect("semantic graph should build"),
            &relation.graph,
            pca_initialization(&embeddings, PcaOptions { sketch_rows: 16 })
                .expect("PCA should initialize"),
            out,
            LayoutLadderOptions {
                alphas: vec![1.0],
                first_epochs: 2,
                ..LayoutLadderOptions::default()
            },
        )
        .expect("layout ladder should fit");
        let encoders = fit_projectors::<TestAutodiffBackend>(
            &features.values,
            &layouts,
            None,
            training_config(),
            2,
            directory.path().join("training"),
            &device(),
        )
        .expect("projector should fit");
        publish_projection(out, &features, &[], &encoders, &layouts)
            .expect("artifacts should publish");

        assert!(
            load_warm_start::<TestBackend>(
                out,
                &embeddings,
                &StructureFeatureOptions {
                    salt: 0xBAD_5EED,
                    ..options
                },
                &device(),
            )
            .is_none(),
            "a salt mismatch must fall back to a cold start"
        );
        assert!(
            load_warm_start::<TestBackend>(out, &embeddings, &options, &device()).is_some(),
            "matching options must warm start"
        );
    }
}
