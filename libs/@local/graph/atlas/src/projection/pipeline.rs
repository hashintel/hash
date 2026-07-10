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

#[derive(Debug)]
pub(crate) enum ProjectionError {
    Sample(SampleError),
    Initialization(InitializationError),
    Semantic(GraphError),
    Features(StructureFeatureError),
    Relation(RelationGraphError),
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

#[derive(Debug, Clone, Default)]
pub(crate) struct ProjectionOptions {
    pub(crate) pca: PcaOptions,
    pub(crate) semantic: SemanticGraphOptions,
    pub(crate) features: StructureFeatureOptions,
    pub(crate) relation: RelationGraphOptions,
    pub(crate) layout: LayoutLadderOptions,
}

pub(crate) struct ProjectionArtifacts {
    pub(crate) embeddings: FloatBytes,
    pub(crate) relation_adjacency: SparseGraph,
    pub(crate) features: StructureFeatures,
    pub(crate) hubs: Vec<EntityId>,
    pub(crate) layouts: Vec<LayoutLevel>,
}

#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct ProjectorLadderOptions {
    pub(crate) training: TrainingConfig,
    pub(crate) chained_epochs: usize = 8,
}

impl ProjectionArtifacts {
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
/// transaction. The transaction is then committed before USearch construction, UMAP optimization,
/// layout persistence, or projector training.
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
