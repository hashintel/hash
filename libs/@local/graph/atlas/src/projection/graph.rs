use core::{error::Error, fmt};

use rayon::prelude::*;
use sprs::CsMatI;
use usearch::{Index, IndexOptions, MetricKind, ScalarKind};

use crate::float::FloatBytes;

const SMOOTH_K_TOLERANCE: f32 = 1.0e-5;
const MIN_K_DIST_SCALE: f32 = 1.0e-3;
const GRAPH_WEIGHT_TOLERANCE: f32 = 1.0e-5;

pub(crate) type SparseGraph = CsMatI<f32, u32, u32>;

#[derive(Debug)]
pub(crate) enum GraphError {
    InvalidKnnShape {
        rows: usize,
        neighbors: usize,
    },
    KnnLength {
        expected: usize,
        indices: usize,
        distances: usize,
    },
    TooManyRows(usize),
    TooManyEdges(usize),
    NeighborOutOfBounds {
        row: usize,
        offset: usize,
        index: u32,
        rows: usize,
    },
    DuplicateNeighbor {
        row: usize,
        index: u32,
    },
    NonFiniteDistance {
        row: usize,
        offset: usize,
        distance: f32,
    },
    UnsortedDistances {
        row: usize,
        offset: usize,
    },
    InvalidLocalConnectivity(f32),
    InvalidBandwidth(f32),
    GraphShape {
        left: (usize, usize),
        right: (usize, usize),
    },
    NonSquareGraph {
        rows: usize,
        columns: usize,
    },
    InvalidGraphWeight {
        offset: usize,
        weight: f32,
    },
    InvalidAlpha(f32),
    SparseStructure(String),
    InvalidSemanticOption {
        name: &'static str,
        value: usize,
    },
    Index(cxx::Exception),
    SearchResultCount {
        row: usize,
        expected: usize,
        keys: usize,
        distances: usize,
    },
    IndexKeyOutOfBounds {
        row: usize,
        key: u64,
        rows: usize,
    },
}

impl fmt::Display for GraphError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidKnnShape { rows, neighbors } => write!(
                formatter,
                "invalid k-NN shape: {rows} rows with {neighbors} neighbors per row"
            ),
            Self::KnnLength {
                expected,
                indices,
                distances,
            } => write!(
                formatter,
                "invalid k-NN storage: expected {expected} entries, got {indices} indices and \
                 {distances} distances"
            ),
            Self::TooManyRows(rows) => {
                write!(
                    formatter,
                    "{rows} rows cannot be represented by u32 graph indices"
                )
            }
            Self::TooManyEdges(edges) => {
                write!(
                    formatter,
                    "{edges} edges cannot be represented by u32 graph pointers"
                )
            }
            Self::NeighborOutOfBounds {
                row,
                offset,
                index,
                rows,
            } => write!(
                formatter,
                "neighbor {offset} of row {row} has index {index}, outside {rows} rows"
            ),
            Self::DuplicateNeighbor { row, index } => {
                write!(
                    formatter,
                    "row {row} contains duplicate neighbor index {index}"
                )
            }
            Self::NonFiniteDistance {
                row,
                offset,
                distance,
            } => write!(
                formatter,
                "neighbor {offset} of row {row} has non-finite distance {distance}"
            ),
            Self::UnsortedDistances { row, offset } => write!(
                formatter,
                "neighbor distances for row {row} are not sorted at offset {offset}"
            ),
            Self::InvalidLocalConnectivity(value) => {
                write!(
                    formatter,
                    "local connectivity must be finite and non-negative, got {value}"
                )
            }
            Self::InvalidBandwidth(value) => {
                write!(
                    formatter,
                    "bandwidth must be finite and positive, got {value}"
                )
            }
            Self::GraphShape { left, right } => write!(
                formatter,
                "graph shapes differ: {} by {} and {} by {}",
                left.0, left.1, right.0, right.1
            ),
            Self::NonSquareGraph { rows, columns } => {
                write!(formatter, "graph must be square, got {rows} by {columns}")
            }
            Self::InvalidGraphWeight { offset, weight } => write!(
                formatter,
                "graph value at storage offset {offset} is outside [0, 1]: {weight}"
            ),
            Self::InvalidAlpha(alpha) => {
                write!(
                    formatter,
                    "graph blend alpha must be within [0, 1], got {alpha}"
                )
            }
            Self::SparseStructure(error) => write!(formatter, "invalid sparse graph: {error}"),
            Self::InvalidSemanticOption { name, value } => {
                write!(
                    formatter,
                    "semantic graph option {name} must be positive, got {value}"
                )
            }
            Self::Index(error) => write!(formatter, "USearch index operation failed: {error}"),
            Self::SearchResultCount {
                row,
                expected,
                keys,
                distances,
            } => write!(
                formatter,
                "USearch returned {keys} keys and {distances} distances for row {row}, expected \
                 {expected} of each"
            ),
            Self::IndexKeyOutOfBounds { row, key, rows } => write!(
                formatter,
                "USearch returned key {key} for row {row}, outside {rows} sampled rows"
            ),
        }
    }
}

impl Error for GraphError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Index(error) => Some(error),
            Self::InvalidKnnShape { .. }
            | Self::KnnLength { .. }
            | Self::TooManyRows(_)
            | Self::TooManyEdges(_)
            | Self::NeighborOutOfBounds { .. }
            | Self::DuplicateNeighbor { .. }
            | Self::NonFiniteDistance { .. }
            | Self::UnsortedDistances { .. }
            | Self::InvalidLocalConnectivity(_)
            | Self::InvalidBandwidth(_)
            | Self::GraphShape { .. }
            | Self::NonSquareGraph { .. }
            | Self::InvalidGraphWeight { .. }
            | Self::InvalidAlpha(_)
            | Self::SparseStructure(_)
            | Self::InvalidSemanticOption { .. }
            | Self::SearchResultCount { .. }
            | Self::IndexKeyOutOfBounds { .. } => None,
        }
    }
}

impl From<cxx::Exception> for GraphError {
    fn from(error: cxx::Exception) -> Self {
        Self::Index(error)
    }
}

#[derive(Debug, Copy, Clone, Default)]
pub(crate) struct SemanticGraphOptions {
    pub(crate) neighbors: usize = 15,
    pub(crate) connectivity: usize = 16,
    pub(crate) expansion_add: usize = 200,
    pub(crate) expansion_search: usize = 64,
}

impl SemanticGraphOptions {
    fn validate(self) -> Result<Self, GraphError> {
        for (name, value) in [
            ("neighbors", self.neighbors),
            ("connectivity", self.connectivity),
            ("expansion_add", self.expansion_add),
            ("expansion_search", self.expansion_search),
        ] {
            if value == 0 {
                return Err(GraphError::InvalidSemanticOption { name, value });
            }
        }
        Ok(self)
    }
}

#[derive(Debug)]
pub(crate) struct Knn {
    indices: Vec<u32>,
    distances: Vec<f32>,
    rows: usize,
    neighbors: usize,
}

impl Knn {
    pub(crate) fn new(
        rows: usize,
        neighbors: usize,
        mut indices: Vec<u32>,
        mut distances: Vec<f32>,
    ) -> Result<Self, GraphError> {
        if rows == 0 || neighbors == 0 || neighbors > rows {
            return Err(GraphError::InvalidKnnShape { rows, neighbors });
        }
        if rows > u32::MAX as usize {
            return Err(GraphError::TooManyRows(rows));
        }

        let expected = rows
            .checked_mul(neighbors)
            .ok_or(GraphError::TooManyEdges(usize::MAX))?;
        if indices.len() != expected || distances.len() != expected {
            return Err(GraphError::KnnLength {
                expected,
                indices: indices.len(),
                distances: distances.len(),
            });
        }

        let rows_u32 = u32::try_from(rows).map_err(|_error| GraphError::TooManyRows(rows))?;
        for (row, self_index) in (0..rows).zip(0_u32..rows_u32) {
            let start = row * neighbors;
            let stop = start + neighbors;

            for offset in 0..neighbors {
                let position = start + offset;
                let index = indices[position];
                if index >= rows_u32 {
                    return Err(GraphError::NeighborOutOfBounds {
                        row,
                        offset,
                        index,
                        rows,
                    });
                }
                if indices[start..position].contains(&index) {
                    return Err(GraphError::DuplicateNeighbor { row, index });
                }

                let distance = distances[position];
                if !distance.is_finite() {
                    return Err(GraphError::NonFiniteDistance {
                        row,
                        offset,
                        distance,
                    });
                }
                distances[position] = distance.max(0.0);
            }

            for offset in 1..neighbors {
                if distances[start + offset - 1] > distances[start + offset] {
                    return Err(GraphError::UnsortedDistances { row, offset });
                }
            }

            if let Some(position) = indices[start..stop]
                .iter()
                .position(|&index| index == self_index)
            {
                if position > 0 {
                    indices.copy_within(start..start + position, start + 1);
                    distances.copy_within(start..start + position, start + 1);
                    indices[start] = self_index;
                }
            } else {
                indices.copy_within(start..stop - 1, start + 1);
                distances.copy_within(start..stop - 1, start + 1);
                indices[start] = self_index;
            }
            distances[start] = 0.0;
        }

        Ok(Self {
            indices,
            distances,
            rows,
            neighbors,
        })
    }

    pub(crate) const fn rows(&self) -> usize {
        self.rows
    }

    pub(crate) const fn neighbors(&self) -> usize {
        self.neighbors
    }

    pub(crate) fn indices(&self) -> &[u32] {
        &self.indices
    }

    pub(crate) fn distances(&self) -> &[f32] {
        &self.distances
    }
}

pub(crate) fn semantic_knn(
    embeddings: &FloatBytes,
    options: SemanticGraphOptions,
) -> Result<Knn, GraphError> {
    let options = options.validate()?;
    let rows = embeddings.len();
    if rows == 0 {
        return Err(GraphError::InvalidKnnShape {
            rows,
            neighbors: options.neighbors,
        });
    }
    if rows > u32::MAX as usize {
        return Err(GraphError::TooManyRows(rows));
    }
    let neighbors = options.neighbors.min(rows);
    let entries = rows
        .checked_mul(neighbors)
        .ok_or(GraphError::TooManyEdges(usize::MAX))?;

    let index = Index::new(&IndexOptions {
        dimensions: embeddings.dim(),
        metric: MetricKind::Cos,
        quantization: ScalarKind::F32,
        connectivity: options.connectivity,
        expansion_add: options.expansion_add,
        expansion_search: options.expansion_search.max(neighbors),
        multi: false,
    })?;
    index.reserve_capacity_and_threads(rows, rayon::current_num_threads())?;

    (0..rows).into_par_iter().try_for_each(|row| {
        index
            .add(row as u64, embeddings.row(row))
            .map_err(GraphError::from)
    })?;

    let mut indices = vec![0; entries];
    let mut distances = vec![0.0; entries];
    indices
        .par_chunks_mut(neighbors)
        .zip(distances.par_chunks_mut(neighbors))
        .enumerate()
        .try_for_each(|(row, (row_indices, row_distances))| {
            let matches = index.search(embeddings.row(row), neighbors)?;
            if matches.keys.len() != neighbors || matches.distances.len() != neighbors {
                return Err(GraphError::SearchResultCount {
                    row,
                    expected: neighbors,
                    keys: matches.keys.len(),
                    distances: matches.distances.len(),
                });
            }

            for (offset, (&key, &distance)) in
                matches.keys.iter().zip(&matches.distances).enumerate()
            {
                let key = u32::try_from(key)
                    .ok()
                    .filter(|&key| key < rows as u32)
                    .ok_or(GraphError::IndexKeyOutOfBounds { row, key, rows })?;
                row_indices[offset] = key;
                row_distances[offset] = distance;
            }
            Ok::<_, GraphError>(())
        })?;

    Knn::new(rows, neighbors, indices, distances)
}

pub(crate) fn semantic_graph(
    embeddings: &FloatBytes,
    options: SemanticGraphOptions,
) -> Result<SparseGraph, GraphError> {
    let knn = semantic_knn(embeddings, options)?;
    let smooth = smooth_knn_distances(&knn, 1.0, 1.0)?;
    fuzzy_graph(&knn, &smooth)
}

#[derive(Debug)]
pub(crate) struct SmoothKnn {
    sigmas: Vec<f32>,
    rhos: Vec<f32>,
}

impl SmoothKnn {
    pub(crate) fn sigmas(&self) -> &[f32] {
        &self.sigmas
    }

    pub(crate) fn rhos(&self) -> &[f32] {
        &self.rhos
    }
}

#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    clippy::manual_midpoint,
    clippy::suboptimal_flops,
    reason = "operation order and f32 conversions intentionally match the pinned umap-learn oracle"
)]
pub(crate) fn smooth_knn_distances(
    knn: &Knn,
    local_connectivity: f32,
    bandwidth: f32,
) -> Result<SmoothKnn, GraphError> {
    if !local_connectivity.is_finite() || local_connectivity < 0.0 {
        return Err(GraphError::InvalidLocalConnectivity(local_connectivity));
    }
    if !bandwidth.is_finite() || bandwidth <= 0.0 {
        return Err(GraphError::InvalidBandwidth(bandwidth));
    }

    let target = (knn.neighbors as f32).log2() * bandwidth;
    let mean_distances = mean(&knn.distances);
    let mut sigmas = Vec::with_capacity(knn.rows);
    let mut rhos = Vec::with_capacity(knn.rows);

    for distances in knn.distances.chunks_exact(knn.neighbors) {
        let non_zero_start = distances.partition_point(|&distance| distance <= 0.0);
        let non_zero = &distances[non_zero_start..];
        let rho = if non_zero.len() as f32 >= local_connectivity {
            let index = local_connectivity.floor() as usize;
            let interpolation = local_connectivity - index as f32;
            if index > 0 {
                let mut rho = non_zero[index - 1];
                if interpolation > SMOOTH_K_TOLERANCE {
                    rho += interpolation * (non_zero[index] - non_zero[index - 1]);
                }
                rho
            } else {
                interpolation * non_zero.first().copied().unwrap_or(0.0)
            }
        } else {
            non_zero.last().copied().unwrap_or(0.0)
        };

        let mut low = 0.0_f32;
        let mut high = f32::MAX;
        let mut midpoint = 1.0_f32;

        for _ in 0..64 {
            let mut sum = 0.0_f32;
            for &distance in &distances[1..] {
                let adjusted = distance - rho;
                sum += if adjusted > 0.0 {
                    (-adjusted / midpoint).exp()
                } else {
                    1.0
                };
            }

            if (sum - target).abs() < SMOOTH_K_TOLERANCE {
                break;
            }
            if sum > target {
                high = midpoint;
                midpoint = (low + high) / 2.0;
            } else {
                low = midpoint;
                midpoint = if high >= f32::MAX {
                    midpoint * 2.0
                } else {
                    (low + high) / 2.0
                };
            }
        }

        let scale = if rho > 0.0 {
            MIN_K_DIST_SCALE * mean(distances)
        } else {
            MIN_K_DIST_SCALE * mean_distances
        };
        sigmas.push(midpoint.max(scale));
        rhos.push(rho);
    }

    Ok(SmoothKnn { sigmas, rhos })
}

#[expect(
    clippy::cast_precision_loss,
    reason = "NumPy's float32 mean divides by the length represented as f32"
)]
fn mean(values: &[f32]) -> f32 {
    values.iter().copied().sum::<f32>() / values.len() as f32
}

pub(crate) fn membership_strengths(knn: &Knn, smooth: &SmoothKnn) -> Vec<f32> {
    let mut values = Vec::with_capacity(knn.distances.len());

    for (row, self_index) in (0..knn.rows).zip(0_u32..) {
        let start = row * knn.neighbors;
        let sigma = smooth.sigmas[row];
        let rho = smooth.rhos[row];

        for offset in 0..knn.neighbors {
            let position = start + offset;
            let adjusted = knn.distances[position] - rho;
            let value = if knn.indices[position] == self_index {
                0.0
            } else if adjusted <= 0.0 || sigma == 0.0 {
                1.0
            } else {
                (-adjusted / sigma).exp()
            };
            values.push(value);
        }
    }

    values
}

pub(crate) fn fuzzy_graph(knn: &Knn, smooth: &SmoothKnn) -> Result<SparseGraph, GraphError> {
    let memberships = membership_strengths(knn, smooth);
    let mut builder = GraphBuilder::new(knn.rows, memberships.len())?;
    let mut row_entries = Vec::with_capacity(knn.neighbors);

    for row in 0..knn.rows {
        let start = row * knn.neighbors;
        row_entries.clear();
        for offset in 0..knn.neighbors {
            let position = start + offset;
            let value = memberships[position];
            if value > 0.0 {
                row_entries.push((knn.indices[position], value));
            }
        }
        row_entries.sort_unstable_by_key(|&(index, _)| index);
        builder.extend_row(&row_entries)?;
    }

    fuzzy_union(&builder.finish()?)
}

#[expect(
    clippy::suboptimal_flops,
    reason = "operation order intentionally matches the pinned umap-learn oracle"
)]
pub(crate) fn fuzzy_union(directed: &SparseGraph) -> Result<SparseGraph, GraphError> {
    validate_graph(directed)?;
    let transpose = directed.transpose_view().to_csr();
    merge_graphs(directed, &transpose, |left, right| {
        left + right - left * right
    })
}

pub(crate) fn reset_local_connectivity(graph: &SparseGraph) -> Result<SparseGraph, GraphError> {
    validate_graph(graph)?;

    let (indptr, indices, mut values) = graph.clone().into_raw_storage();
    for row in 0..graph.rows() {
        let start = indptr[row] as usize;
        let stop = indptr[row + 1] as usize;
        let maximum = values[start..stop].iter().copied().fold(0.0, f32::max);
        if maximum > 0.0 {
            for value in &mut values[start..stop] {
                *value /= maximum;
            }
        }
    }

    fuzzy_union(&SparseGraph::new(graph.shape(), indptr, indices, values))
}

#[expect(
    clippy::suboptimal_flops,
    reason = "operation order intentionally matches the pinned umap-learn oracle"
)]
pub(crate) fn blend_and_reset(
    semantic: &SparseGraph,
    relation: &SparseGraph,
    alpha: f32,
) -> Result<SparseGraph, GraphError> {
    if !alpha.is_finite() || !(0.0..=1.0).contains(&alpha) {
        return Err(GraphError::InvalidAlpha(alpha));
    }
    validate_graph(semantic)?;
    validate_graph(relation)?;

    let relation_alpha = 1.0 - alpha;
    let blended = merge_graphs(semantic, relation, |semantic, relation| {
        alpha * semantic + relation_alpha * relation
    })?;
    reset_local_connectivity(&blended)
}

fn validate_graph(graph: &SparseGraph) -> Result<(), GraphError> {
    if graph.rows() != graph.cols() {
        return Err(GraphError::NonSquareGraph {
            rows: graph.rows(),
            columns: graph.cols(),
        });
    }
    if graph.rows() > u32::MAX as usize {
        return Err(GraphError::TooManyRows(graph.rows()));
    }
    for (offset, &weight) in graph.data().iter().enumerate() {
        if !weight.is_finite()
            || weight < -GRAPH_WEIGHT_TOLERANCE
            || weight > 1.0 + GRAPH_WEIGHT_TOLERANCE
        {
            return Err(GraphError::InvalidGraphWeight { offset, weight });
        }
    }
    Ok(())
}

pub(super) fn elementwise_max(
    left: &SparseGraph,
    right: &SparseGraph,
) -> Result<SparseGraph, GraphError> {
    merge_graphs(left, right, f32::max)
}

pub(super) fn sparse_graph(
    rows: usize,
    indptr: Vec<u32>,
    indices: Vec<u32>,
    values: Vec<f32>,
) -> Result<SparseGraph, GraphError> {
    SparseGraph::try_new((rows, rows), indptr, indices, values)
        .map_err(|(_, _, _, error)| GraphError::SparseStructure(error.to_string()))
}

fn merge_graphs(
    left: &SparseGraph,
    right: &SparseGraph,
    combine: impl Fn(f32, f32) -> f32,
) -> Result<SparseGraph, GraphError> {
    if left.shape() != right.shape() {
        return Err(GraphError::GraphShape {
            left: left.shape(),
            right: right.shape(),
        });
    }

    let capacity = left
        .nnz()
        .checked_add(right.nnz())
        .ok_or(GraphError::TooManyEdges(usize::MAX))?;
    let mut builder = GraphBuilder::new(left.rows(), capacity)?;

    for row in 0..left.rows() {
        let left_row = left.outer_view(row).expect("row is within graph shape");
        let right_row = right.outer_view(row).expect("row is within graph shape");
        let mut left_offset = 0;
        let mut right_offset = 0;

        while left_offset < left_row.nnz() || right_offset < right_row.nnz() {
            let left_index = left_row.indices().get(left_offset).copied();
            let right_index = right_row.indices().get(right_offset).copied();

            let (index, left_value, right_value) = match (left_index, right_index) {
                (Some(left_index), Some(right_index)) => match left_index.cmp(&right_index) {
                    core::cmp::Ordering::Equal => {
                        let values = (left_row.data()[left_offset], right_row.data()[right_offset]);
                        left_offset += 1;
                        right_offset += 1;
                        (left_index, values.0, values.1)
                    }
                    core::cmp::Ordering::Less => {
                        let value = left_row.data()[left_offset];
                        left_offset += 1;
                        (left_index, value, 0.0)
                    }
                    core::cmp::Ordering::Greater => {
                        let value = right_row.data()[right_offset];
                        right_offset += 1;
                        (right_index, 0.0, value)
                    }
                },
                (Some(left_index), None) => {
                    let value = left_row.data()[left_offset];
                    left_offset += 1;
                    (left_index, value, 0.0)
                }
                (None, Some(right_index)) => {
                    let value = right_row.data()[right_offset];
                    right_offset += 1;
                    (right_index, 0.0, value)
                }
                (None, None) => break,
            };

            let value = combine(left_value, right_value);
            if value > 0.0 {
                builder.push(index, value)?;
            }
        }
        builder.finish_row()?;
    }

    builder.finish()
}

struct GraphBuilder {
    rows: usize,
    rows_u32: u32,
    indptr: Vec<u32>,
    indices: Vec<u32>,
    values: Vec<f32>,
}

impl GraphBuilder {
    fn new(rows: usize, capacity: usize) -> Result<Self, GraphError> {
        let rows_u32 = u32::try_from(rows).map_err(|_error| GraphError::TooManyRows(rows))?;
        Ok(Self {
            rows,
            rows_u32,
            indptr: vec![0],
            indices: Vec::with_capacity(capacity),
            values: Vec::with_capacity(capacity),
        })
    }

    fn push(&mut self, index: u32, value: f32) -> Result<(), GraphError> {
        if index >= self.rows_u32 {
            return Err(GraphError::NeighborOutOfBounds {
                row: self.indptr.len() - 1,
                offset: self.indices.len(),
                index,
                rows: self.rows,
            });
        }
        self.indices.push(index);
        self.values.push(value);
        Ok(())
    }

    fn extend_row(&mut self, entries: &[(u32, f32)]) -> Result<(), GraphError> {
        for &(index, value) in entries {
            self.push(index, value)?;
        }
        self.finish_row()
    }

    fn finish_row(&mut self) -> Result<(), GraphError> {
        let edges = u32::try_from(self.indices.len())
            .map_err(|_error| GraphError::TooManyEdges(self.indices.len()))?;
        self.indptr.push(edges);
        Ok(())
    }

    fn finish(self) -> Result<SparseGraph, GraphError> {
        SparseGraph::try_new(
            (self.rows, self.rows),
            self.indptr,
            self.indices,
            self.values,
        )
        .map_err(|(_, _, _, error)| GraphError::SparseStructure(error.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs::File,
        io::{BufReader, Write as _},
        num::NonZero,
        path::{Path, PathBuf},
    };

    use npyz::Deserialize;

    use super::*;

    const FLOAT_TOLERANCE: f32 = 2.0e-5;

    fn fixture_path(relative: impl AsRef<Path>) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../../tools/embedding2d/oracle/fixtures/v1")
            .join(relative)
    }

    fn read_npy<T: Deserialize>(relative: impl AsRef<Path>) -> (Vec<u64>, Vec<T>) {
        let file = BufReader::new(File::open(fixture_path(relative)).expect("fixture should open"));
        let npy = npyz::NpyFile::new(file).expect("fixture header should parse");
        let shape = npy.shape().to_vec();
        let values = npy.into_vec::<T>().expect("fixture data should parse");
        (shape, values)
    }

    fn read_graph(prefix: &str) -> SparseGraph {
        let (_, indptr) = read_npy::<i64>(format!("{prefix}-indptr.npy"));
        let (_, indices) = read_npy::<i64>(format!("{prefix}-indices.npy"));
        let (_, values) = read_npy::<f32>(format!("{prefix}-values.npy"));
        let rows = indptr.len() - 1;

        SparseGraph::new(
            (rows, rows),
            indptr
                .into_iter()
                .map(|value| u32::try_from(value).expect("fixture pointer should fit u32"))
                .collect(),
            indices
                .into_iter()
                .map(|value| u32::try_from(value).expect("fixture index should fit u32"))
                .collect(),
            values,
        )
    }

    fn assert_close(actual: &[f32], expected: &[f32]) {
        assert_eq!(actual.len(), expected.len());
        for (offset, (&actual, &expected)) in actual.iter().zip(expected).enumerate() {
            assert!(
                (actual - expected).abs() <= FLOAT_TOLERANCE,
                "value {offset} differs: {actual} != {expected}"
            );
        }
    }

    fn assert_graph(actual: &SparseGraph, expected_prefix: &str) {
        let expected = read_graph(expected_prefix);
        assert_eq!(actual.shape(), expected.shape());
        assert_eq!(
            actual.indptr().raw_storage(),
            expected.indptr().raw_storage()
        );
        assert_eq!(actual.indices(), expected.indices());
        assert_close(actual.data(), expected.data());
    }

    fn mmap_embeddings<const DIM: usize>(rows: &[[f32; DIM]]) -> FloatBytes {
        let mut file = tempfile::tempfile().expect("temporary embedding file should open");
        for row in rows {
            for value in row {
                file.write_all(&value.to_ne_bytes())
                    .expect("embedding should write");
            }
        }
        file.flush().expect("embeddings should flush");
        FloatBytes::from_file(file, NonZero::new(DIM).expect("test dimension is positive"))
            .expect("embeddings should mmap")
    }

    fn semantic_knn_fixture() -> Knn {
        let (shape, indices) = read_npy::<i64>("semantic/knn-indices.npy");
        let (_, distances) = read_npy::<f32>("semantic/knn-distances.npy");
        let rows = usize::try_from(shape[0]).expect("row count should fit usize");
        let neighbors = usize::try_from(shape[1]).expect("neighbor count should fit usize");

        Knn::new(
            rows,
            neighbors,
            indices
                .into_iter()
                .map(|index| u32::try_from(index).expect("neighbor index should fit u32"))
                .collect(),
            distances,
        )
        .expect("oracle k-NN should be valid")
    }

    #[test]
    fn builds_knn_from_mmap_with_usearch() {
        let embeddings = mmap_embeddings(&[
            [1.0, 0.0, 0.0],
            [0.99, 0.01, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, 1.0],
        ]);
        let knn = semantic_knn(
            &embeddings,
            SemanticGraphOptions {
                neighbors: 3,
                expansion_search: 8,
                ..SemanticGraphOptions::default()
            },
        )
        .expect("USearch should build a k-NN result");

        assert_eq!(knn.rows(), 4);
        assert_eq!(knn.neighbors(), 3);
        for row in 0..knn.rows() {
            let start = row * knn.neighbors();
            let stop = start + knn.neighbors();
            assert_eq!(knn.indices()[start], row as u32);
            assert_eq!(knn.distances()[start], 0.0);
            assert!(knn.indices()[start..stop].iter().all(|&index| index < 4));
            assert!(
                knn.distances()[start..stop]
                    .windows(2)
                    .all(|pair| pair[0] <= pair[1])
            );
        }

        let graph = semantic_graph(
            &embeddings,
            SemanticGraphOptions {
                neighbors: 3,
                expansion_search: 8,
                ..SemanticGraphOptions::default()
            },
        )
        .expect("semantic graph should build");
        assert_eq!(graph.shape(), (4, 4));
        for (row, vector) in graph.outer_iterator().enumerate() {
            for (column, &weight) in vector.iter() {
                assert_eq!(graph.get(column, row), Some(&weight));
                assert!((0.0..=1.0).contains(&weight));
            }
        }
    }

    #[test]
    fn repairs_self_neighbor_without_allocating_per_row() {
        let knn = Knn::new(
            4,
            3,
            vec![1, 0, 2, 0, 2, 3, 2, 1, 3, 3, 2, 1],
            vec![0.0, 0.0, 1.0, 0.2, 0.4, 0.8, 0.0, 0.4, 0.7, 0.0, 0.3, 0.6],
        )
        .expect("k-NN should be repairable");

        assert_eq!(knn.indices(), &[0, 1, 2, 1, 0, 2, 2, 1, 3, 3, 2, 1]);
        assert_eq!(
            knn.distances(),
            &[0.0, 0.0, 1.0, 0.0, 0.2, 0.4, 0.0, 0.4, 0.7, 0.0, 0.3, 0.6]
        );
    }

    #[test]
    fn matches_semantic_graph_oracle() {
        let knn = semantic_knn_fixture();
        let smooth = smooth_knn_distances(&knn, 1.0, 1.0).expect("parameters are valid");
        let (_, expected_sigmas) = read_npy::<f32>("semantic/sigmas.npy");
        let (_, expected_rhos) = read_npy::<f32>("semantic/rhos.npy");
        assert_close(smooth.sigmas(), &expected_sigmas);
        assert_close(smooth.rhos(), &expected_rhos);

        let memberships = membership_strengths(&knn, &smooth);
        let (_, expected_memberships) = read_npy::<f32>("semantic/membership-values.npy");
        assert_close(&memberships, &expected_memberships);

        let graph = fuzzy_graph(&knn, &smooth).expect("oracle graph should be valid");
        assert_graph(&graph, "semantic/fuzzy-union");
    }

    #[test]
    fn matches_fusion_and_local_connectivity_oracle() {
        let semantic = read_graph("fusion/semantic");
        let relation = read_graph("fusion/relation");

        for (alpha, expected) in [
            (1.0, "fusion/fused-a100"),
            (0.65, "fusion/fused-a065"),
            (0.0, "fusion/fused-a000"),
        ] {
            let fused = blend_and_reset(&semantic, &relation, alpha)
                .expect("oracle graphs and alpha should be valid");
            assert_graph(&fused, expected);
        }
    }
}
