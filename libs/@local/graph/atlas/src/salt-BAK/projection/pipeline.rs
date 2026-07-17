//! End-to-end orchestration of the projection fit.
//!
//! [`fit_projection`] wires the stages together in dependency order and
//! enforces the pipeline's central resource rules: the sample's
//! repeatable-read transaction is committed as soon as relational extraction
//! finishes, before any long-running numerical stage starts, and transient
//! training inputs (sparse graphs, structure features) are dropped as soon
//! as their consumers complete.
//!
//! A refit can warm-start from a previous generation's artifacts (see
//! [`ProjectionOptions::warm_start`]): an unchanged sample reuses the
//! previous alpha-1.0 layout coordinates directly, a changed sample places
//! every row through the previous alpha-1.0 encoder, and the first projector
//! fine-tunes from the previous encoder's weights. Missing or incompatible
//! previous artifacts fall back to a cold start with a warning rather than
//! failing the fit.

use core::{error::Error, fmt};
use std::time::{Duration, Instant};

use burn::tensor::backend::AutodiffBackend;
use camino::{Utf8Path, Utf8PathBuf};
use type_system::knowledge::entity::id::EntityId;

use super::{
    artifact::{ArtifactError, ProjectionMetadata, publish_projection},
    features::{
        StructureFeatureError, StructureFeatureOptions, StructureFeatures, structure_features,
    },
    graph::{GraphError, SemanticGraphOptions, semantic_graph},
    initialization::{InitializationError, PcaOptions, pca_initialization},
    layout::{LayoutError, LayoutLadderOptions, LayoutLevel, fit_layout_ladder, fit_projectors},
    mlp::{FittedProjector, ProjectorError, TrainingConfig},
    relation::{RelationGraphError, RelationGraphOptions, relation_graph},
    sample::{Sample, SampleError},
    warm::{infer_initial_coordinates, load_warm_start},
};
use crate::float::FloatBytes;

/// A failure in any stage of the projection fit, tagged by stage.
#[derive(Debug)]
pub enum ProjectionError {
    /// Sampling or the relational snapshot failed.
    Sample(SampleError),
    /// PCA initialization failed.
    Initialization(InitializationError),
    /// Semantic k-NN or fuzzy graph construction failed.
    Semantic(GraphError),
    /// Structure-feature generation failed.
    Features(StructureFeatureError),
    /// Relation graph construction failed.
    Relation(RelationGraphError),
    /// Layout fitting or publication failed.
    Layout(LayoutError),
    /// Projector training failed.
    Projector(ProjectorError),
    /// Artifact publication failed.
    Artifact(ArtifactError),
    /// A warm-start inference produced a non-finite coordinate.
    WarmStartCoordinate { row: usize, axis: usize, value: f32 },
}

impl fmt::Display for ProjectionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Sample(error) => error.fmt(formatter),
            Self::Initialization(error) => error.fmt(formatter),
            Self::Semantic(error) => error.fmt(formatter),
            Self::Features(error) => error.fmt(formatter),
            Self::Relation(error) => error.fmt(formatter),
            Self::Layout(error) => error.fmt(formatter),
            Self::Projector(error) => error.fmt(formatter),
            Self::Artifact(error) => error.fmt(formatter),
            Self::WarmStartCoordinate { row, axis, value } => write!(
                formatter,
                "warm-start inference produced a non-finite coordinate at row {row}, axis {axis}: \
                 {value}"
            ),
        }
    }
}

impl Error for ProjectionError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Sample(error) => Some(error),
            Self::Initialization(error) => Some(error),
            Self::Semantic(error) => Some(error),
            Self::Features(error) => Some(error),
            Self::Relation(error) => Some(error),
            Self::Layout(error) => Some(error),
            Self::Projector(error) => Some(error),
            Self::Artifact(error) => Some(error),
            Self::WarmStartCoordinate { .. } => None,
        }
    }
}

impl From<SampleError> for ProjectionError {
    fn from(error: SampleError) -> Self {
        Self::Sample(error)
    }
}

impl From<InitializationError> for ProjectionError {
    fn from(error: InitializationError) -> Self {
        Self::Initialization(error)
    }
}

impl From<StructureFeatureError> for ProjectionError {
    fn from(error: StructureFeatureError) -> Self {
        Self::Features(error)
    }
}

impl From<RelationGraphError> for ProjectionError {
    fn from(error: RelationGraphError) -> Self {
        Self::Relation(error)
    }
}

impl From<LayoutError> for ProjectionError {
    fn from(error: LayoutError) -> Self {
        Self::Layout(error)
    }
}

impl From<ProjectorError> for ProjectionError {
    fn from(error: ProjectorError) -> Self {
        Self::Projector(error)
    }
}

impl From<ArtifactError> for ProjectionError {
    fn from(error: ArtifactError) -> Self {
        Self::Artifact(error)
    }
}

/// Training hyperparameters for the projector ladder.
#[derive(Debug, Copy, Clone, Default)]
pub struct ProjectorLadderOptions {
    /// Training hyperparameters for the first (cold) projector.
    pub training: TrainingConfig,
    /// Epoch budget for warm-chained projectors after the first.
    pub chained_epochs: usize = 8,
}

/// Per-stage configuration for [`fit_projection`].
#[derive(Debug, Clone, Default)]
pub struct ProjectionOptions {
    pub pca: PcaOptions,
    pub semantic: SemanticGraphOptions,
    pub features: StructureFeatureOptions,
    pub relation: RelationGraphOptions,
    pub layout: LayoutLadderOptions,
    pub projector: ProjectorLadderOptions,
    /// Directory holding a previous fit's artifacts to warm-start from.
    ///
    /// Pass the previous generation's output directory (usually the same
    /// directory the fit publishes into) to keep successive refits visually
    /// stable. Absent, unreadable, or incompatible artifacts fall back to a
    /// cold start with a warning rather than an error.
    pub warm_start: Option<Utf8PathBuf>,
}

/// Wall-clock durations and key sizes of one fit, per stage.
#[derive(Debug, Clone, Default)]
pub struct FitMetrics {
    /// Sampled row count.
    pub rows: usize,
    /// Embedding width per row.
    pub dimensions: usize,
    /// Whether the sample was restored from the on-disk cache.
    pub from_cache: bool,
    /// How the initial coordinates were produced.
    pub initialization: InitializationKind,
    /// Deduplicated, hub-free undirected relation count.
    pub relation_edges: usize,
    /// Number of hub rows whose relations were removed.
    pub hub_count: usize,
    /// Stored entries in the semantic fuzzy graph.
    pub semantic_edges: usize,
    /// Duration of relational extraction and relation graph construction.
    pub relation_duration: Duration,
    /// Duration of initial-coordinate construction.
    pub initialization_duration: Duration,
    /// Duration of semantic k-NN and fuzzy graph construction.
    pub semantic_duration: Duration,
    /// Duration of the full layout ladder.
    pub layout_duration: Duration,
    /// Duration of structure-feature generation.
    pub feature_duration: Duration,
    /// Duration of the full projector ladder.
    pub projector_duration: Duration,
    /// Duration of artifact publication.
    pub publish_duration: Duration,
}

/// How the first rung's initial coordinates were produced.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub enum InitializationKind {
    /// Cold start from PCA of the sampled embeddings.
    #[default]
    Pca,
    /// The previous fit's alpha-1.0 coordinates, reused row for row.
    CarriedCoordinates,
    /// Every row placed by the previous fit's alpha-1.0 encoder.
    InferredPlacement,
}

/// Everything a caller receives from a completed fit.
pub struct ProjectionOutcome<B: burn::tensor::backend::Backend> {
    /// The sampled embeddings, still mmap-backed.
    pub embeddings: FloatBytes,
    /// Stable identities of removed hub rows, in sample-index order.
    pub hubs: Vec<EntityId>,
    /// The fitted, persisted layout levels in descending alpha order.
    pub layouts: Vec<LayoutLevel>,
    /// The fitted encoders, paired with their alpha levels.
    pub encoders: Vec<(f32, FittedProjector<B>)>,
    /// The published serving contract.
    pub metadata: ProjectionMetadata,
    /// Per-stage timings and sizes.
    pub metrics: FitMetrics,
}

/// Runs the complete projection fit and publishes its serving artifacts.
///
/// The stages run in dependency order: relational extraction inside the
/// sample's snapshot, transaction commit, initial coordinates (PCA or warm
/// start), semantic graph construction, the alpha-ladder layout fit,
/// structure-feature generation, the projector ladder, and finally artifact
/// publication (hubs, metadata, and one encoder per alpha; layouts are
/// published as each rung finishes). The database connection is released
/// before any numerical stage begins, and no artifact is published unless
/// every stage before it succeeded.
///
/// # Errors
///
/// Returns the first failing stage's error; see [`ProjectionError`]. A
/// failure leaves previously published artifact generations intact.
pub async fn fit_projection<B: AutodiffBackend>(
    sample: Sample<'_>,
    out: impl AsRef<Utf8Path>,
    options: ProjectionOptions,
    device: &B::Device,
) -> Result<ProjectionOutcome<B::InnerBackend>, ProjectionError> {
    let out = out.as_ref();
    let mut metrics = FitMetrics {
        rows: sample.embeddings().len(),
        dimensions: sample.embeddings().dim(),
        from_cache: sample.from_cache(),
        ..FitMetrics::default()
    };
    tracing::info!(
        rows = metrics.rows,
        dimensions = metrics.dimensions,
        from_cache = metrics.from_cache,
        out = %out,
        "starting projection fit"
    );

    // Stage 1: relational preprocessing inside the snapshot, then commit.
    let stage = Instant::now();
    let from_cache = sample.from_cache();
    let relation = relation_graph(&sample, options.relation).await?;
    let embeddings = sample.finish().await?;
    metrics.relation_duration = stage.elapsed();
    metrics.relation_edges = relation.adjacency.nnz() / 2;
    metrics.hub_count = relation.hubs.len();
    tracing::info!(
        undirected_edges = metrics.relation_edges,
        hubs = metrics.hub_count,
        relation_entries = relation.graph.nnz(),
        duration_ms = millis(metrics.relation_duration),
        "relation graphs built; database snapshot released"
    );

    // Stage 2: previous-generation warm start, if requested and compatible.
    let warm = options.warm_start.as_deref().and_then(|directory| {
        load_warm_start::<B::InnerBackend>(directory, &embeddings, &options.features, device)
    });

    // Warm-start inference needs the structure features before the layouts;
    // a cold start defers them until after the ladder to keep peak memory
    // lower.
    let mut features: Option<StructureFeatures> = None;

    let stage = Instant::now();
    let (initial_coordinates, initial_projector) = match warm {
        Some(previous) => {
            let carried = from_cache
                .then(|| previous.coordinates(metrics.rows))
                .flatten();
            let initial_projector = previous.standardized_encoder(device);
            match carried {
                Some(coordinates) => {
                    metrics.initialization = InitializationKind::CarriedCoordinates;
                    (coordinates, initial_projector)
                }
                None => {
                    let generated =
                        structure_features(&embeddings, &relation.adjacency, options.features)?;
                    let coordinates = infer_initial_coordinates::<B::InnerBackend>(
                        &previous, &generated, device,
                    )?;
                    features = Some(generated);
                    metrics.initialization = InitializationKind::InferredPlacement;
                    (coordinates, initial_projector)
                }
            }
        }
        None => {
            metrics.initialization = InitializationKind::Pca;
            (pca_initialization(&embeddings, options.pca)?, None)
        }
    };
    metrics.initialization_duration = stage.elapsed();
    tracing::info!(
        kind = ?metrics.initialization,
        duration_ms = millis(metrics.initialization_duration),
        "initial coordinates ready"
    );

    // Stage 3: semantic fuzzy graph over the sampled embeddings.
    let stage = Instant::now();
    let semantic =
        semantic_graph(&embeddings, options.semantic).map_err(ProjectionError::Semantic)?;
    metrics.semantic_duration = stage.elapsed();
    metrics.semantic_edges = semantic.nnz();
    tracing::info!(
        entries = metrics.semantic_edges,
        neighbors = options.semantic.neighbors.get(),
        connectivity = options.semantic.connectivity.get(),
        expansion_add = options.semantic.expansion_add.get(),
        expansion_search = options.semantic.expansion_search.get(),
        duration_ms = millis(metrics.semantic_duration),
        "semantic graph built"
    );

    // Stage 4: the alpha ladder. Each rung publishes its layout file.
    let stage = Instant::now();
    let layouts = fit_layout_ladder(
        &semantic,
        &relation.graph,
        initial_coordinates,
        out,
        options.layout,
    )?;
    metrics.layout_duration = stage.elapsed();
    tracing::info!(
        levels = layouts.len(),
        duration_ms = millis(metrics.layout_duration),
        "layout ladder fitted"
    );
    // The fused inputs are no longer needed; only the adjacency survives
    // into feature generation.
    drop(semantic);
    let adjacency = relation.adjacency;
    let hubs = relation.hubs;
    drop(relation.graph);

    // Stage 5: structure features (unless warm-start inference already
    // generated them).
    let stage = Instant::now();
    let features = match features {
        Some(features) => features,
        None => structure_features(&embeddings, &adjacency, options.features)?,
    };
    metrics.feature_duration = stage.elapsed();
    tracing::info!(
        rows = features.values.len(),
        dimensions = features.values.dim(),
        bytes = features.values.len() * features.values.dim() * size_of::<f32>(),
        duration_ms = millis(metrics.feature_duration),
        "structure features ready"
    );
    drop(adjacency);

    // Stage 6: the projector ladder, warm-chained rung to rung.
    let stage = Instant::now();
    let encoders = fit_projectors::<B>(
        &features.values,
        &layouts,
        initial_projector,
        options.projector.training,
        options.projector.chained_epochs,
        out.join("training").as_std_path(),
        device,
    )?;
    metrics.projector_duration = stage.elapsed();
    tracing::info!(
        levels = encoders.len(),
        duration_ms = millis(metrics.projector_duration),
        "projector ladder fitted"
    );

    // Stage 7: durable serving artifacts. The transient feature matrix is
    // dropped right afterwards.
    let stage = Instant::now();
    let metadata = publish_projection(out, &features, &hubs, &encoders, &layouts)?;
    metrics.publish_duration = stage.elapsed();
    drop(features);
    tracing::info!(
        out = %out,
        encoders = metadata.encoders.len(),
        hubs = metadata.hub_count,
        duration_ms = millis(metrics.publish_duration),
        "serving artifacts published"
    );

    Ok(ProjectionOutcome {
        embeddings,
        hubs,
        layouts,
        encoders,
        metadata,
        metrics,
    })
}

/// Saturating milliseconds for tracing fields.
fn millis(duration: Duration) -> u64 {
    u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
}
