//! Fuzzy simplicial set construction, union, and alpha blending.
//!
//! These stages turn a validated [`Knn`] into the symmetric fuzzy graphs UMAP
//! optimizes, following `umap-learn`'s `fuzzy_simplicial_set` pipeline. The
//! operation order and `f32` precision intentionally match the pinned oracle;
//! each stage is exposed separately so the conformance tests can compare its
//! output against the corresponding fixture.

use super::{GraphBuilder, GraphError, SparseGraph, knn::Knn, merge_graphs, validate_graph};

/// Convergence tolerance for the smoothed-distance binary search, matching
/// `umap-learn`'s `SMOOTH_K_TOLERANCE`.
const SMOOTH_K_TOLERANCE: f32 = 1.0e-5;
/// Lower bound on `sigma` as a fraction of the mean distance, matching
/// `umap-learn`'s `MIN_K_DIST_SCALE`.
const MIN_K_DIST_SCALE: f32 = 1.0e-3;

/// Per-row smoothed-distance parameters: the kernel bandwidth `sigma` and the
/// connectivity distance `rho`.
#[derive(Debug)]
pub(crate) struct SmoothKnn {
    sigmas: Vec<f32>,
    rhos: Vec<f32>,
}

impl SmoothKnn {
    /// The per-row kernel bandwidths, one per sampled row.
    pub(crate) fn sigmas(&self) -> &[f32] {
        &self.sigmas
    }

    /// The per-row distances to the nearest distinct neighbor, one per
    /// sampled row.
    pub(crate) fn rhos(&self) -> &[f32] {
        &self.rhos
    }
}

/// Solves each row's kernel bandwidth so its neighborhood has effective size
/// `log2(neighbors) * bandwidth`.
///
/// For every row, `rho` is set to the distance of the `local_connectivity`th
/// non-zero neighbor (interpolating fractional values), then `sigma` is found
/// by binary search so the row's membership weights sum to the target. This
/// reproduces `umap-learn`'s `smooth_knn_dist`, including its 64-iteration
/// search and mean-distance floor on `sigma`.
///
/// # Errors
///
/// Returns an error when `local_connectivity` is not finite and non-negative
/// or when `bandwidth` is not finite and positive.
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

    let target = (knn.neighbors() as f32).log2() * bandwidth;
    let mean_distances = mean(knn.distances());
    let mut sigmas = Vec::with_capacity(knn.rows());
    let mut rhos = Vec::with_capacity(knn.rows());

    for distances in knn.distances().chunks_exact(knn.neighbors()) {
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

/// Computes the directed membership weight of every k-NN entry.
///
/// The result runs parallel to [`Knn::indices`]: self-neighbors get `0.0`,
/// neighbors within `rho` get `1.0`, and farther neighbors decay as
/// `exp(-(distance - rho) / sigma)`. Every value lies in `[0, 1]`.
pub(crate) fn membership_strengths(knn: &Knn, smooth: &SmoothKnn) -> Vec<f32> {
    let mut values = Vec::with_capacity(knn.distances().len());

    for (row, self_index) in (0..knn.rows()).zip(0_u32..) {
        let start = row * knn.neighbors();
        let sigma = smooth.sigmas[row];
        let rho = smooth.rhos[row];

        for offset in 0..knn.neighbors() {
            let position = start + offset;
            let adjusted = knn.distances()[position] - rho;
            let value = if knn.indices()[position] == self_index {
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

/// Builds the symmetric fuzzy graph from a k-NN table and its smoothed
/// distances.
///
/// The directed membership weights are assembled into CSR rows and
/// symmetrized with [`fuzzy_union`]. Zero-weight entries (including
/// self-neighbors) are dropped.
///
/// # Errors
///
/// Returns an error when the merged edge count exceeds `u32` pointers.
pub(crate) fn fuzzy_graph(knn: &Knn, smooth: &SmoothKnn) -> Result<SparseGraph, GraphError> {
    let memberships = membership_strengths(knn, smooth);
    let mut builder = GraphBuilder::new(knn.rows(), memberships.len())?;
    let mut row_entries = Vec::with_capacity(knn.neighbors());

    for row in 0..knn.rows() {
        let start = row * knn.neighbors();
        row_entries.clear();
        for offset in 0..knn.neighbors() {
            let position = start + offset;
            let value = memberships[position];
            if value > 0.0 {
                row_entries.push((knn.indices()[position], value));
            }
        }
        row_entries.sort_unstable_by_key(|&(index, _)| index);
        builder.extend_row(&row_entries)?;
    }

    fuzzy_union(&builder.finish()?)
}

/// Symmetrizes a directed fuzzy graph with the probabilistic t-conorm
/// `a + b - a * b`.
///
/// The result is symmetric and keeps every weight in `[0, 1]`.
///
/// # Errors
///
/// Returns an error when the graph fails validation or the merged edge count
/// exceeds `u32` pointers.
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

/// Rescales each row to a maximum of one and re-applies the fuzzy union.
///
/// Blending two graphs dilutes each row's strongest membership below one;
/// this restores `umap-learn`'s `reset_local_connectivity` invariant that
/// every non-isolated row has full membership in its nearest neighbor.
///
/// # Errors
///
/// Returns an error when the graph fails validation or the merged edge count
/// exceeds `u32` pointers.
pub(crate) fn reset_local_connectivity(graph: SparseGraph) -> Result<SparseGraph, GraphError> {
    validate_graph(&graph)?;

    let rows = graph.rows();
    let shape = graph.shape();
    let (indptr, indices, mut values) = graph.into_raw_storage();
    for row in 0..rows {
        let start = indptr[row] as usize;
        let stop = indptr[row + 1] as usize;
        let maximum = values[start..stop].iter().copied().fold(0.0, f32::max);
        if maximum > 0.0 {
            for value in &mut values[start..stop] {
                *value /= maximum;
            }
        }
    }

    fuzzy_union(&SparseGraph::new(shape, indptr, indices, values))
}

/// Fuses a semantic and a relation graph at `alpha` and restores local
/// connectivity.
///
/// The blend is `alpha * semantic + (1 - alpha) * relation`, so `1.0` is
/// purely semantic and `0.0` purely relational. Zero blended entries are
/// dropped, the result is passed through [`reset_local_connectivity`], and
/// neither input is modified, so both can be reused across the alpha ladder.
///
/// # Errors
///
/// Returns an error when `alpha` is outside `[0, 1]`, when either graph fails
/// validation, when the shapes differ, or when the merged edge count exceeds
/// `u32` pointers.
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
    reset_local_connectivity(blended)
}
