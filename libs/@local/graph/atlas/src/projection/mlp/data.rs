//! Dataset and batching for projector training.

use burn::{
    data::{dataloader::batcher::Batcher, dataset::Dataset},
    tensor::{Tensor, TensorData, backend::Backend},
};

use super::OUTPUT_DIM;
use crate::float::{FloatBytes, Sample};

/// A single training example: one entity's feature row and its target map
/// coordinates in standardized space.
#[derive(Debug, Clone)]
pub struct ProjectionItem {
    /// The entity's feature row, [`FloatBytes::dim`] values wide.
    pub embedding: Sample,
    /// The standardized map coordinates the encoder learns to reproduce.
    pub position: [f32; OUTPUT_DIM],
}

/// A collated batch of examples on the training device.
#[derive(Debug, Clone)]
pub struct ProjectionBatch<B: Backend> {
    /// Feature rows, shape `[batch, input_dim]`.
    pub embeddings: Tensor<B, 2>,
    /// Standardized target map coordinates, shape `[batch, 2]`.
    pub positions: Tensor<B, 2>,
}

/// The examples of one split (training or validation), selected by row index
/// from the shared feature and coordinate matrices.
///
/// Rows are read on demand, one example per [`Dataset::get`] call, so only
/// the rows a dataloader actually requests are paged in. Coordinates are
/// standardized on the fly with the stored center and scale, so the raw
/// layout matrix is never duplicated in memory.
pub(crate) struct ProjectionDataset {
    pub xs: FloatBytes,
    pub ys: FloatBytes,

    pub center: [f32; OUTPUT_DIM],
    pub scale: [f32; OUTPUT_DIM],

    pub indices: Vec<usize>,
}

impl Dataset<ProjectionItem> for ProjectionDataset {
    fn get(&self, index: usize) -> Option<ProjectionItem> {
        let &row = self.indices.get(index)?;

        let embedding = self.xs.sample(row);
        let raw = *self
            .ys
            .sample(row)
            .as_array::<OUTPUT_DIM>()
            .unwrap_or_else(|| unreachable!("rows are validated to be `OUTPUT_DIM` wide"));
        let position =
            core::array::from_fn(|axis| (raw[axis] - self.center[axis]) / self.scale[axis]);

        Some(ProjectionItem {
            embedding,
            position,
        })
    }

    fn len(&self) -> usize {
        self.indices.len()
    }
}

/// Collates [`ProjectionItem`]s into one [`ProjectionBatch`] on the device.
#[derive(Debug, Clone, Default)]
pub struct ProjectionBatcher;

impl<B: Backend> Batcher<B, ProjectionItem, ProjectionBatch<B>> for ProjectionBatcher {
    fn batch(&self, items: Vec<ProjectionItem>, device: &B::Device) -> ProjectionBatch<B> {
        let input_dim = items.first().map_or(0, |item| item.embedding.len());

        let mut embeddings = Vec::with_capacity(items.len() * input_dim);
        let mut positions = Vec::with_capacity(items.len() * OUTPUT_DIM);
        for item in &items {
            embeddings.extend_from_slice(&item.embedding);
            positions.extend_from_slice(&item.position);
        }

        ProjectionBatch {
            embeddings: Tensor::from_data(
                TensorData::new(embeddings, [items.len(), input_dim]),
                device,
            ),
            positions: Tensor::from_data(
                TensorData::new(positions, [items.len(), OUTPUT_DIM]),
                device,
            ),
        }
    }
}
