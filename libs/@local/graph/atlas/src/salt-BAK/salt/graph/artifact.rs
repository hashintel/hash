use core::{error::Error, fmt};

use camino::Utf8Path;

use super::{KnnTable, SemanticGraph};
use crate::salt::{
    format::SEMANTIC_GRAPH_FORMAT,
    hash::{ContentHash, ContentHasher},
    storage::mmap::{
        ArtifactScalar, ArtifactSection, ArtifactWriteError, PublishedArtifact, SectionId,
        publish_artifact,
    },
};

pub(crate) const INDICES: SectionId = SectionId::new(1);
const DISTANCES: SectionId = SectionId::new(2);
pub(crate) const WEIGHTS: SectionId = SectionId::new(3);
const BACKEND_HASH: SectionId = SectionId::new(4);
const CONFIGURATION_HASH: SectionId = SectionId::new(5);
const WEIGHT_HASH: SectionId = SectionId::new(6);

/// Validated positive weights parallel to a persisted k-neighbor table.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct SemanticEdgeWeights {
    values: Box<[f32]>,
    content_hash: ContentHash,
}

impl SemanticEdgeWeights {
    /// Validates one weight for every directed semantic edge.
    ///
    /// # Errors
    ///
    /// This returns an error for a shape mismatch or a weight outside the
    /// finite fuzzy-membership interval `(0, 1]`.
    pub(crate) fn new(
        table: &KnnTable,
        values: impl Into<Box<[f32]>>,
    ) -> Result<Self, SemanticWeightError> {
        let values = values.into();
        let expected = table.rows() * table.neighbors();
        if values.len() != expected {
            return Err(SemanticWeightError::Count {
                expected,
                actual: values.len(),
            });
        }
        if let Some(index) = values
            .iter()
            .position(|weight| !weight.is_finite() || *weight <= 0.0 || *weight > 1.0)
        {
            return Err(SemanticWeightError::Invalid {
                index,
                value: values[index],
            });
        }
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.semantic-weights.v1");
        for weight in &values {
            hasher.update(&weight.to_bits().to_le_bytes());
        }
        Ok(Self {
            values,
            content_hash: hasher.finish(),
        })
    }

    #[must_use]
    #[inline]
    pub(crate) fn as_slice(&self) -> &[f32] {
        &self.values
    }

    #[must_use]
    #[inline]
    pub(crate) const fn content_hash(&self) -> ContentHash {
        self.content_hash
    }
}

/// Invalid semantic edge-weight storage.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum SemanticWeightError {
    Count { expected: usize, actual: usize },
    Invalid { index: usize, value: f32 },
}

impl fmt::Display for SemanticWeightError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Count { expected, actual } => {
                write!(
                    formatter,
                    "semantic graph needs {expected} weights, got {actual}"
                )
            }
            Self::Invalid { index, value } => {
                write!(
                    formatter,
                    "semantic weight {index} is outside the finite interval (0, 1]: {value}"
                )
            }
        }
    }
}

impl Error for SemanticWeightError {}

/// Publishes neighbors, distances, weights, and provenance hashes together.
///
/// # Errors
///
/// This returns an error when section encoding or immutable publication fails.
pub(crate) fn publish_semantic_graph(
    path: &Utf8Path,
    graph: &SemanticGraph,
    weights: &SemanticEdgeWeights,
) -> Result<PublishedArtifact, ArtifactWriteError> {
    publish_artifact(
        path,
        SEMANTIC_GRAPH_FORMAT,
        &[
            section(
                0,
                INDICES,
                &[graph.table.rows(), graph.table.neighbors()],
                graph.table.all_indices(),
            )?,
            section(
                1,
                DISTANCES,
                &[graph.table.rows(), graph.table.neighbors()],
                graph.table.all_distances(),
            )?,
            section(
                2,
                WEIGHTS,
                &[graph.table.rows(), graph.table.neighbors()],
                weights.as_slice(),
            )?,
            section(3, BACKEND_HASH, &[32], graph.backend.as_bytes())?,
            section(4, CONFIGURATION_HASH, &[32], graph.configuration.as_bytes())?,
            section(5, WEIGHT_HASH, &[32], weights.content_hash().as_bytes())?,
        ],
    )
}

#[inline]
fn section<'data, T>(
    index: usize,
    id: SectionId,
    dimensions: &[usize],
    values: &'data [T],
) -> Result<ArtifactSection<'data>, ArtifactWriteError>
where
    T: ArtifactScalar,
{
    ArtifactSection::new(id, dimensions, values)
        .map_err(|error| ArtifactWriteError::InvalidSection { index, error })
}
