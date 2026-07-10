//! Numeric pieces shared by the serial and parallel optimizers.
//!
//! Everything here reproduces the pinned `umap-learn` oracle: edge retention,
//! sampling schedules, layout normalization, gradient coefficients, gradient
//! clipping, and the tau random-number generator. Deviating from the oracle's
//! operation order or precision in this module invalidates the conformance
//! fixtures, so changes must be re-validated against them.

use super::{CurveParameters, UmapError};
use crate::projection::graph::{GraphError, SparseGraph};

/// Epoch defaults used when the caller requests ten or fewer epochs; these
/// mirror `umap-learn`'s `n_epochs=None` behavior for the edge-retention
/// threshold.
const DEFAULT_SMALL_GRAPH_EPOCHS: usize = 500;
const DEFAULT_LARGE_GRAPH_EPOCHS: usize = 200;
const SMALL_GRAPH_ROWS: usize = 10_000;

/// Off-diagonal graph edges retained for optimization, in CSR order.
///
/// Rows and columns index optimizer vertices. `row_offsets` has one more
/// entry than the vertex count, and `tails` and `weights` run parallel to
/// each other.
pub(super) struct OptimizerEdges {
    pub(super) row_offsets: Vec<u32>,
    pub(super) tails: Vec<u32>,
    pub(super) weights: Vec<f32>,
}

impl OptimizerEdges {
    /// Expands the CSR row offsets into one head vertex per edge.
    ///
    /// The serial reference optimizer walks a flat edge list rather than row
    /// ranges, matching the `umap-learn` kernel's `head`/`tail` arrays.
    pub(super) fn heads(&self) -> Vec<u32> {
        let mut heads = Vec::with_capacity(self.tails.len());
        for (row, window) in self.row_offsets.windows(2).enumerate() {
            heads.resize(window[1] as usize, row as u32);
        }
        heads
    }
}

/// Extracts the edges strong enough to be sampled at least once.
///
/// Following `umap-learn`, edges with weight below `maximum / epochs` would
/// never be scheduled and are dropped up front. When `epochs` is ten or
/// fewer, the threshold instead uses the library's default epoch count for
/// the graph size. Diagonal entries are dropped as well: a vertex exerts no
/// force on itself.
///
/// # Errors
///
/// Returns an error when the graph has no positive-weight edges, when any
/// stored weight is not finite and positive, or when the retained edge count
/// exceeds `u32` offsets.
pub(super) fn optimizer_edges(
    graph: &SparseGraph,
    epochs: usize,
) -> Result<OptimizerEdges, UmapError> {
    let maximum = graph
        .data()
        .iter()
        .copied()
        .reduce(f32::max)
        .ok_or(UmapError::EmptyGraph)?;
    if !maximum.is_finite() || maximum <= 0.0 {
        return Err(UmapError::EmptyGraph);
    }

    let default_epochs = if graph.rows() <= SMALL_GRAPH_ROWS {
        DEFAULT_SMALL_GRAPH_EPOCHS
    } else {
        DEFAULT_LARGE_GRAPH_EPOCHS
    };
    let threshold_epochs = if epochs > 10 { epochs } else { default_epochs };
    #[expect(
        clippy::cast_precision_loss,
        reason = "the retention threshold intentionally matches umap-learn's f32 computation"
    )]
    let threshold = maximum / threshold_epochs as f32;
    let mut row_offsets = Vec::with_capacity(graph.rows() + 1);
    let mut tails = Vec::with_capacity(graph.nnz());
    let mut weights = Vec::with_capacity(graph.nnz());
    row_offsets.push(0);

    for (row, vector) in graph.outer_iterator().enumerate() {
        for (column, &weight) in vector.iter() {
            if !weight.is_finite() || weight <= 0.0 {
                return Err(UmapError::InvalidGraphWeight {
                    offset: weights.len(),
                    weight,
                });
            }
            if row != column && weight >= threshold {
                tails.push(column as u32);
                weights.push(weight);
            }
        }
        row_offsets.push(
            u32::try_from(tails.len())
                .map_err(|_error| UmapError::Graph(GraphError::TooManyEdges(tails.len())))?,
        );
    }

    if weights.is_empty() {
        return Err(UmapError::EmptyGraph);
    }
    Ok(OptimizerEdges {
        row_offsets,
        tails,
        weights,
    })
}

/// Computes how many epochs elapse between samples of each edge, in `f64`.
///
/// The strongest edge is sampled every epoch; an edge at half the maximum
/// weight is sampled every other epoch, and so on.
///
/// # Errors
///
/// Returns [`UmapError::EmptyGraph`] when `weights` is empty.
#[expect(
    clippy::cast_precision_loss,
    reason = "umap-learn computes sample counts in f32 before producing an f64 schedule"
)]
pub(super) fn make_epochs_per_sample(
    weights: &[f32],
    epochs: usize,
) -> Result<Vec<f64>, UmapError> {
    let maximum = weights
        .iter()
        .copied()
        .reduce(f32::max)
        .ok_or(UmapError::EmptyGraph)?;
    let epochs_f32 = epochs as f32;
    let epochs_f64 = epochs as f64;
    Ok(weights
        .iter()
        .map(|&weight| {
            let samples = epochs_f32 * (weight / maximum);
            epochs_f64 / f64::from(samples)
        })
        .collect())
}

/// The `f32` variant of [`make_epochs_per_sample`] used by the parallel
/// optimizer's compact per-edge schedule.
///
/// # Errors
///
/// Returns [`UmapError::EmptyGraph`] when `weights` is empty.
#[expect(
    clippy::cast_precision_loss,
    reason = "the production parallel optimizer intentionally stores compact f32 schedules"
)]
pub(super) fn make_epochs_per_sample_f32(
    weights: &[f32],
    epochs: usize,
) -> Result<Vec<f32>, UmapError> {
    let maximum = weights
        .iter()
        .copied()
        .reduce(f32::max)
        .ok_or(UmapError::EmptyGraph)?;
    let epochs = epochs as f32;
    Ok(weights
        .iter()
        .map(|&weight| epochs / (epochs * (weight / maximum)))
        .collect())
}

/// Rescales each axis of the initial layout to `[0, 10]`.
///
/// This matches the oracle's initialization scaling and keeps the gradient
/// clipping range meaningful regardless of the caller's coordinate units.
///
/// # Errors
///
/// Returns an error when any coordinate is NaN or infinite, or when an axis
/// has no range to rescale.
pub(super) fn normalize_coordinates(
    mut coordinates: Vec<[f32; 2]>,
) -> Result<Vec<[f32; 2]>, UmapError> {
    let mut minimum = [f32::INFINITY; 2];
    let mut maximum = [f32::NEG_INFINITY; 2];
    for (row, coordinate) in coordinates.iter().enumerate() {
        for axis in 0..2 {
            let value = coordinate[axis];
            if !value.is_finite() {
                return Err(UmapError::NonFiniteCoordinate { row, axis, value });
            }
            minimum[axis] = minimum[axis].min(value);
            maximum[axis] = maximum[axis].max(value);
        }
    }

    let span = [maximum[0] - minimum[0], maximum[1] - minimum[1]];
    for (axis, &span) in span.iter().enumerate() {
        if span <= 0.0 || !span.is_finite() {
            return Err(UmapError::DegenerateCoordinateAxis(axis));
        }
    }

    for coordinate in &mut coordinates {
        for axis in 0..2 {
            coordinate[axis] = 10.0 * (coordinate[axis] - minimum[axis]) / span[axis];
        }
    }
    Ok(coordinates)
}

/// Seeds one tau RNG state per vertex from the base state and the vertex's
/// first coordinate, matching the oracle's per-row stream derivation.
pub(super) fn per_vertex_random_states(
    coordinates: &[[f32; 2]],
    random_state: [i64; 3],
) -> Vec<[i64; 3]> {
    coordinates
        .iter()
        .map(|coordinate| {
            let offset = (f64::from(coordinate[0])).to_bits().cast_signed();
            random_state.map(|state| state.wrapping_add(offset))
        })
        .collect()
}

#[expect(
    clippy::suboptimal_flops,
    reason = "operation order intentionally matches the pinned numba kernel"
)]
pub(super) fn squared_distance(left: [f32; 2], right: [f32; 2]) -> f32 {
    let x = left[0] - right[0];
    let y = left[1] - right[1];
    x * x + y * y
}

/// Gradient coefficient pulling an edge's endpoints together.
///
/// Returns zero for coincident points, whose difference vector carries no
/// direction to descend along.
pub(super) fn attractive_gradient_coefficient(
    distance_squared: f32,
    curve: CurveParameters,
) -> f64 {
    if distance_squared <= 0.0 {
        return 0.0;
    }
    let distance_squared = f64::from(distance_squared);
    let numerator = -2.0 * curve.a * curve.b * distance_squared.powf(curve.b - 1.0);
    numerator / (curve.a * distance_squared.powf(curve.b) + 1.0)
}

/// Gradient coefficient pushing a vertex away from a negative sample.
///
/// Returns zero for coincident points, matching [`repulsive_gradient`]'s
/// degenerate case.
pub(super) fn repulsive_gradient_coefficient(
    distance_squared: f32,
    curve: CurveParameters,
    repulsion_strength: f64,
) -> f64 {
    if distance_squared <= 0.0 {
        return 0.0;
    }
    let distance_squared = f64::from(distance_squared);
    let numerator = 2.0 * repulsion_strength * curve.b;
    numerator / ((0.001 + distance_squared) * (curve.a * distance_squared.powf(curve.b) + 1.0))
}

/// Per-axis repulsive gradient.
///
/// When the coefficient is positive this is the clipped scaled difference;
/// otherwise the vertex receives no repulsive push. Note that stock
/// `umap-learn` instead applies a fixed `4.0` kick to separate exactly
/// coincident points; the pinned oracle deliberately patches that kick out,
/// and this function must follow the oracle.
pub(super) fn repulsive_gradient(coefficient: f64, difference: f64) -> f64 {
    if coefficient > 0.0 {
        clip(coefficient * difference)
    } else {
        0.0
    }
}

/// Clamps a gradient step to `[-4, 4]`, the oracle's clipping range.
pub(super) fn clip(value: f64) -> f64 {
    value.clamp(-4.0, 4.0)
}

/// Advances the three-word tau RNG and returns the next signed 32-bit value.
///
/// This is bit-for-bit `umap-learn`'s `tau_rand_int`, including its use of
/// 64-bit intermediate state; the serial conformance tests assert both the
/// output stream and the final state words.
#[expect(
    clippy::cast_possible_truncation,
    reason = "umap-learn's tau RNG returns the low signed 32 bits"
)]
pub(super) fn tau_rand_int(state: &mut [i64; 3]) -> i32 {
    state[0] = (((state[0] & 4_294_967_294) << 12) & 0xFFFF_FFFF)
        ^ ((((state[0] << 13) & 0xFFFF_FFFF) ^ state[0]) >> 19);
    state[1] = (((state[1] & 4_294_967_288) << 4) & 0xFFFF_FFFF)
        ^ ((((state[1] << 2) & 0xFFFF_FFFF) ^ state[1]) >> 25);
    state[2] = (((state[2] & 4_294_967_280) << 17) & 0xFFFF_FFFF)
        ^ ((((state[2] << 3) & 0xFFFF_FFFF) ^ state[2]) >> 11);
    (state[0] ^ state[1] ^ state[2]) as i32
}
