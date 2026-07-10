//! End-to-end orchestration of the projection fit.
//!
//! [`fit_projection`] wires the stages together in dependency order and
//! enforces the pipeline's central resource rule: the sample's
//! repeatable-read transaction is committed as soon as relational extraction
//! finishes, before any long-running numerical stage starts.

use core::{error::Error, fmt};
use std::path::Path;

use burn::tensor::backend::AutodiffBackend;
use camino::Utf8Path;
use type_system::knowledge::entity::id::EntityId;

use super::{
    Projector, TrainingConfig,
    features::{
        StructureFeatureError, StructureFeatureOptions, StructureFeatures, structure_features,
    },
    graph::{GraphError, SemanticGraphOptions, SparseGraph, semantic_graph},
    initialization::{InitializationError, PcaOptions, pca_initialization},
    layout::{LayoutError, LayoutLadderOptions, LayoutLevel, fit_layout_ladder, fit_projectors},
    relation::{RelationGraphError, RelationGraphOptions, relation_graph},
    sample::{Sample, SampleError},
};
use crate::float::FloatBytes;

/// A failure in any stage of the projection fit, tagged by stage.
#[derive(Debug)]
pub(crate) enum ProjectionError {
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

/// Per-stage configuration for [`fit_projection`].
#[derive(Debug, Clone, Default)]
pub(crate) struct ProjectionOptions {
    pub(crate) pca: PcaOptions,
    pub(crate) semantic: SemanticGraphOptions,
    pub(crate) features: StructureFeatureOptions,
    pub(crate) relation: RelationGraphOptions,
    pub(crate) layout: LayoutLadderOptions,
}

/// Everything a caller needs after the graph and layout stages: inputs for
/// projector training plus the artifacts that must outlive the fit.
pub(crate) struct ProjectionArtifacts {
    /// The sampled embeddings, still mmap-backed.
    pub(crate) embeddings: FloatBytes,
    /// The hub-free symmetric relation adjacency used for features.
    pub(crate) relation_adjacency: SparseGraph,
    /// Transient structure features for projector training.
    pub(crate) features: StructureFeatures,
    /// Stable identities of removed hub rows, in sample-index order.
    pub(crate) hubs: Vec<EntityId>,
    /// The fitted, persisted layout levels in descending alpha order.
    pub(crate) layouts: Vec<LayoutLevel>,
}

/// Configuration for [`ProjectionArtifacts::fit_projectors`].
#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct ProjectorLadderOptions {
    /// Training hyperparameters for the first (cold) projector.
    pub(crate) training: TrainingConfig,
    /// Epoch budget for warm-chained projectors after the first.
    pub(crate) chained_epochs: usize = 8,
}

impl ProjectionArtifacts {
    /// Distills every fitted layout level into a projector; see
    /// [`fit_projectors`].
    pub(crate) fn fit_projectors<B: AutodiffBackend>(
        &self,
        options: ProjectorLadderOptions,
        artifact_root: impl AsRef<Path>,
        device: &B::Device,
    ) -> Vec<(f32, Projector<B::InnerBackend>)> {
        fit_projectors::<B>(
            self.features.values.clone(),
            &self.layouts,
            options.training,
            options.chained_epochs,
            artifact_root,
            device,
        )
    }
}

/// Fits the graph and layout stages while keeping the database snapshot as short-lived as possible.
///
/// Relational preprocessing consumes the temporary sample mapping inside the repeatable-read
/// transaction. The transaction is then committed before `USearch` construction, UMAP optimization,
/// layout persistence, or projector training.
///
/// When `initial_coordinates` is `None`, the layout starts from
/// [`pca_initialization`]; passing coordinates instead warm-starts the ladder,
/// which is how refits carry a previous layout forward.
///
/// # Errors
///
/// Returns the first failing stage's error; see [`ProjectionError`]. A
/// failure before layout publication leaves previously published artifacts
/// untouched.
pub(crate) async fn fit_projection(
    sample: Sample<'_>,
    initial_coordinates: Option<Vec<[f32; 2]>>,
    out: impl AsRef<Utf8Path>,
    options: ProjectionOptions,
) -> Result<ProjectionArtifacts, ProjectionError> {
    let out = out.as_ref();
    let relation = relation_graph(&sample, options.relation).await?;
    let embeddings = sample.finish().await?;
    let initial_coordinates = match initial_coordinates {
        Some(coordinates) => coordinates,
        None => pca_initialization(&embeddings, options.pca)?,
    };

    let semantic =
        semantic_graph(&embeddings, options.semantic).map_err(ProjectionError::Semantic)?;
    let layouts = fit_layout_ladder(
        &semantic,
        &relation.graph,
        initial_coordinates,
        out,
        options.layout,
    )?;
    let features = structure_features(&embeddings, &relation.adjacency, options.features)?;

    Ok(ProjectionArtifacts {
        embeddings,
        relation_adjacency: relation.adjacency,
        features,
        hubs: relation.hubs,
        layouts,
    })
}
