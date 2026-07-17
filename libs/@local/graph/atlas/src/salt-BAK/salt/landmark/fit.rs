use core::{error::Error, f32::consts::TAU, fmt, num::NonZeroUsize};
use std::collections::HashMap;

use super::{LandmarkAssignment, LandmarkSelection};
use crate::{
    projection::{
        GraphError, SerialOptimizer, UmapError, UmapOptions, fit_curve_parameters, sparse_graph,
    },
    salt::{
        graph::{KnnTable, SemanticEdgeWeights},
        hash::{ContentHash, ContentHasher},
        identity::GenerationRowId,
    },
};

/// Bounded quotient-graph construction and deterministic layout schedule.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct LandmarkFitConfig {
    pub maximum_neighbors: NonZeroUsize,
    pub epochs: NonZeroUsize,
    pub initial_learning_rate: f64,
    pub repulsion_strength: f64,
    pub negative_sample_rate: NonZeroUsize,
    pub spread: f64,
    pub minimum_distance: f64,
    pub seed: u64,
}

/// Selected coordinates and dense assignment into the bounded skeleton.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct LandmarkSkeleton {
    rows: Box<[GenerationRowId]>,
    coordinates: Box<[[f64; 2]]>,
    assignment: LandmarkAssignment,
    content_hash: ContentHash,
}

impl LandmarkSkeleton {
    #[must_use]
    #[inline]
    pub(crate) fn rows(&self) -> &[GenerationRowId] {
        &self.rows
    }

    #[must_use]
    #[inline]
    pub(crate) fn coordinates(&self) -> &[[f64; 2]] {
        &self.coordinates
    }

    #[must_use]
    #[inline]
    pub(crate) const fn assignment(&self) -> &LandmarkAssignment {
        &self.assignment
    }

    #[must_use]
    #[inline]
    pub(crate) const fn content_hash(&self) -> ContentHash {
        self.content_hash
    }
}

/// Invalid semantic weights or non-parametric landmark optimization.
#[derive(Debug)]
pub(crate) enum LandmarkFitError {
    TooFewLandmarks {
        count: usize,
    },
    AssignmentRows {
        expected: usize,
        actual: usize,
    },
    AssignmentOrdinal {
        row: usize,
        ordinal: u32,
        landmarks: usize,
    },
    EmptyQuotientGraph,
    Graph(GraphError),
    Umap(UmapError),
}

impl fmt::Display for LandmarkFitError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TooFewLandmarks { count } => {
                write!(
                    formatter,
                    "landmark layout requires at least three rows, got {count}"
                )
            }
            Self::AssignmentRows { expected, actual } => write!(
                formatter,
                "landmark assignment has {actual} rows; semantic graph has {expected}"
            ),
            Self::AssignmentOrdinal {
                row,
                ordinal,
                landmarks,
            } => write!(
                formatter,
                "landmark assignment row {row} names ordinal {ordinal} outside {landmarks} \
                 landmarks"
            ),
            Self::EmptyQuotientGraph => {
                formatter.write_str("landmark quotient graph contains no inter-landmark edges")
            }
            Self::Graph(error) => error.fmt(formatter),
            Self::Umap(error) => error.fmt(formatter),
        }
    }
}

impl Error for LandmarkFitError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Graph(error) => Some(error),
            Self::Umap(error) => Some(error),
            Self::TooFewLandmarks { .. }
            | Self::AssignmentRows { .. }
            | Self::AssignmentOrdinal { .. }
            | Self::EmptyQuotientGraph => None,
        }
    }
}

impl From<GraphError> for LandmarkFitError {
    #[inline]
    fn from(error: GraphError) -> Self {
        Self::Graph(error)
    }
}

impl From<UmapError> for LandmarkFitError {
    #[inline]
    fn from(error: UmapError) -> Self {
        Self::Umap(error)
    }
}

/// Fits a deterministic non-parametric map over the landmark quotient graph.
///
/// Full-corpus semantic edges are contracted through the nearest-landmark
/// assignment. Each quotient row retains only its strongest configured
/// neighbors before symmetric union, keeping optimization memory proportional
/// to the bounded landmark count.
///
/// # Errors
///
/// This returns an error for malformed assignments or weights, an empty
/// quotient graph, invalid UMAP settings, or optimization failure.
pub(crate) fn fit_landmark_skeleton(
    selection: &LandmarkSelection,
    assignment: LandmarkAssignment,
    semantic: &KnnTable,
    semantic_weights: &SemanticEdgeWeights,
    config: LandmarkFitConfig,
) -> Result<LandmarkSkeleton, LandmarkFitError> {
    let landmarks = selection.rows().len();
    if landmarks < 3 {
        return Err(LandmarkFitError::TooFewLandmarks { count: landmarks });
    }
    if assignment.as_slice().len() != semantic.rows() {
        return Err(LandmarkFitError::AssignmentRows {
            expected: semantic.rows(),
            actual: assignment.as_slice().len(),
        });
    }
    for (row, &ordinal) in assignment.as_slice().iter().enumerate() {
        if ordinal as usize >= landmarks {
            return Err(LandmarkFitError::AssignmentOrdinal {
                row,
                ordinal,
                landmarks,
            });
        }
    }

    let graph = quotient_graph(
        semantic,
        semantic_weights.as_slice(),
        &assignment,
        landmarks,
        config.maximum_neighbors.get(),
    )?;
    let curve = fit_curve_parameters(config.spread, config.minimum_distance)?;
    let mut optimizer = SerialOptimizer::new(
        &graph,
        initial_coordinates(selection.rows(), config.seed),
        curve,
        UmapOptions {
            epochs: config.epochs.get(),
            initial_learning_rate: config.initial_learning_rate,
            repulsion_strength: config.repulsion_strength,
            negative_sample_rate: config.negative_sample_rate.get(),
        },
        random_state(config.seed),
    )?;
    optimizer.run()?;
    let coordinates = optimizer
        .coordinates()
        .iter()
        .map(|coordinate| [f64::from(coordinate[0]), f64::from(coordinate[1])])
        .collect::<Vec<_>>()
        .into_boxed_slice();
    let content_hash = skeleton_hash(selection, &assignment, &coordinates, config);
    Ok(LandmarkSkeleton {
        rows: selection.rows().into(),
        coordinates,
        assignment,
        content_hash,
    })
}

fn quotient_graph(
    semantic: &KnnTable,
    weights: &[f32],
    assignment: &LandmarkAssignment,
    landmarks: usize,
    maximum_neighbors: usize,
) -> Result<crate::projection::SparseGraph, LandmarkFitError> {
    let mut directed = (0..landmarks)
        .map(|_| HashMap::<u32, f64>::new())
        .collect::<Vec<_>>();
    for row in 0..semantic.rows() {
        let left = assignment.as_slice()[row];
        let start = row * semantic.neighbors();
        for (offset, &neighbor) in semantic.indices(row).iter().enumerate() {
            let right = assignment.as_slice()[neighbor as usize];
            if left != right {
                *directed[left as usize].entry(right).or_default() +=
                    f64::from(weights[start + offset]);
            }
        }
    }
    let mut undirected = HashMap::<(u32, u32), f32>::new();
    for (left, row) in directed.into_iter().enumerate() {
        let maximum = row.values().copied().fold(0.0_f64, f64::max);
        if maximum == 0.0 {
            continue;
        }
        let mut row = row.into_iter().collect::<Vec<_>>();
        row.sort_unstable_by(|(left_index, left_weight), (right_index, right_weight)| {
            right_weight
                .total_cmp(left_weight)
                .then_with(|| left_index.cmp(right_index))
        });
        row.truncate(maximum_neighbors);
        for (right, weight) in row {
            let left = u32::try_from(left).expect("landmark ordinal should fit u32");
            let pair = if left < right {
                (left, right)
            } else {
                (right, left)
            };
            #[expect(
                clippy::cast_possible_truncation,
                reason = "normalized finite quotient weights lie in the exactly checked f32 range"
            )]
            let normalized = (weight / maximum) as f32;
            undirected
                .entry(pair)
                .and_modify(|current| *current = current.max(normalized))
                .or_insert(normalized);
        }
    }
    if undirected.is_empty() {
        return Err(LandmarkFitError::EmptyQuotientGraph);
    }
    let mut rows = vec![Vec::<(u32, f32)>::new(); landmarks];
    for ((left, right), weight) in undirected {
        rows[left as usize].push((right, weight));
        rows[right as usize].push((left, weight));
    }
    let mut indptr = Vec::with_capacity(landmarks + 1);
    let mut indices = Vec::new();
    let mut values = Vec::new();
    indptr.push(0_u32);
    for row in &mut rows {
        row.sort_unstable_by_key(|(column, _)| *column);
        indices.extend(row.iter().map(|(column, _)| *column));
        values.extend(row.iter().map(|(_, weight)| *weight));
        indptr.push(
            u32::try_from(indices.len())
                .map_err(|_error| GraphError::TooManyEdges(indices.len()))?,
        );
    }
    Ok(sparse_graph(landmarks, indptr, indices, values)?)
}

fn initial_coordinates(rows: &[GenerationRowId], seed: u64) -> Vec<[f32; 2]> {
    rows.iter()
        .enumerate()
        .map(|(ordinal, row)| {
            #[expect(
                clippy::cast_precision_loss,
                reason = "bounded landmark ordinals are exactly representable at configured scale"
            )]
            let angle = TAU * ordinal as f32 / rows.len() as f32;
            let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.landmark-initial.v1");
            hasher.update(&seed.to_le_bytes());
            hasher.update(&row.as_u32().to_le_bytes());
            let jitter = f32::from(hasher.finish().as_bytes()[0]) / 255.0 * 0.01;
            [(1.0 + jitter) * angle.cos(), (1.0 + jitter) * angle.sin()]
        })
        .collect()
}

fn random_state(seed: u64) -> [i64; 3] {
    let mut state = [0_i64; 3];
    for (index, value) in state.iter_mut().enumerate() {
        let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.landmark-rng.v1");
        hasher.update(&seed.to_le_bytes());
        hasher.update(&[u8::try_from(index).expect("state index should fit u8")]);
        let digest = hasher.finish();
        *value = i64::from_le_bytes(
            digest.as_bytes()[..8]
                .try_into()
                .expect("hash prefix should have eight bytes"),
        );
    }
    state
}

fn skeleton_hash(
    selection: &LandmarkSelection,
    assignment: &LandmarkAssignment,
    coordinates: &[[f64; 2]],
    config: LandmarkFitConfig,
) -> ContentHash {
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.landmark-skeleton.v1");
    hasher.update(selection.content_hash().as_bytes());
    hasher.update(assignment.content_hash().as_bytes());
    for value in [
        config.maximum_neighbors.get(),
        config.epochs.get(),
        config.negative_sample_rate.get(),
    ] {
        hasher.update(
            &u64::try_from(value)
                .expect("landmark setting should fit u64")
                .to_le_bytes(),
        );
    }
    for value in [
        config.initial_learning_rate,
        config.repulsion_strength,
        config.spread,
        config.minimum_distance,
    ] {
        hasher.update(&value.to_bits().to_le_bytes());
    }
    hasher.update(&config.seed.to_le_bytes());
    for coordinate in coordinates {
        hasher.update(&coordinate[0].to_bits().to_le_bytes());
        hasher.update(&coordinate[1].to_bits().to_le_bytes());
    }
    hasher.finish()
}
