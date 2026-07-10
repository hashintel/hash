//! Layout optimization for fuzzy UMAP graphs.
//!
//! Given a fused fuzzy graph and initial 2D coordinates, this module fits the
//! final layout by stochastic gradient descent over attractive edge forces and
//! repulsive negative samples. Two interchangeable optimizers share the same
//! options and edge schedules:
//!
//! - [`SerialOptimizer`] reproduces the pinned `umap-learn` oracle epoch for epoch and exists to
//!   validate conformance.
//! - [`ParallelOptimizer`] is the production optimizer. It partitions rows across threads and
//!   applies coordinate updates through atomics, trading bit-exact reproducibility for safe
//!   parallel throughput.
//!
//! Both optimizers consume [`CurveParameters`] fitted by
//! [`fit_curve_parameters`], which translate the user-facing `min_dist` and
//! `spread` options into the `1 / (1 + a * d^(2b))` low-dimensional kernel.

mod curve;
mod kernel;
mod parallel;
mod serial;
#[cfg(test)]
mod tests;

use core::{error::Error, fmt};

pub(crate) use self::{
    curve::{CurveParameters, fit_curve_parameters},
    parallel::ParallelOptimizer,
};
use super::graph::{GraphError, SparseGraph};

/// An invalid UMAP configuration, graph, or initial layout.
#[derive(Debug)]
pub enum UmapError {
    /// The input graph failed structural validation.
    Graph(GraphError),
    /// The `spread` option is not finite and positive.
    InvalidSpread(f64),
    /// The `min_distance` option is outside `[0, spread]`.
    InvalidMinDistance { min_distance: f64, spread: f64 },
    /// Levenberg-Marquardt did not converge on curve parameters.
    CurveFitFailed,
    /// Fitted curve parameters are not finite and positive.
    InvalidCurve { a: f64, b: f64 },
    /// The epoch count is zero.
    InvalidEpochs(usize),
    /// The learning rate is not finite and positive.
    InvalidLearningRate(f64),
    /// The repulsion strength is not finite and non-negative.
    InvalidRepulsion(f64),
    /// The negative sample rate is zero.
    InvalidNegativeSampleRate(usize),
    /// The graph has no positive-weight edges to optimize.
    EmptyGraph,
    /// The graph row and column counts differ.
    NonSquareGraph { rows: usize, columns: usize },
    /// The initial layout row count does not match the graph.
    LayoutLength { rows: usize, coordinates: usize },
    /// An initial coordinate is NaN or infinite.
    NonFiniteCoordinate { row: usize, axis: usize, value: f32 },
    /// All initial coordinates share one value on an axis.
    DegenerateCoordinateAxis(usize),
    /// A graph weight is not finite and positive.
    InvalidGraphWeight { offset: usize, weight: f32 },
    /// The graph has more rows than `u32` vertex indices can address.
    TooManyVertices(usize),
}

impl fmt::Display for UmapError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Graph(error) => error.fmt(formatter),
            Self::InvalidSpread(spread) => {
                write!(
                    formatter,
                    "UMAP spread must be finite and positive, got {spread}"
                )
            }
            Self::InvalidMinDistance {
                min_distance,
                spread,
            } => write!(
                formatter,
                "UMAP minimum distance must be finite and within [0, spread]; got {min_distance} \
                 with spread {spread}"
            ),
            Self::CurveFitFailed => formatter.write_str("UMAP a/b curve fitting did not converge"),
            Self::InvalidCurve { a, b } => {
                write!(
                    formatter,
                    "UMAP curve parameters must be finite and positive, got a={a}, b={b}"
                )
            }
            Self::InvalidEpochs(epochs) => {
                write!(formatter, "UMAP epoch count must be positive, got {epochs}")
            }
            Self::InvalidLearningRate(rate) => {
                write!(
                    formatter,
                    "UMAP learning rate must be finite and positive, got {rate}"
                )
            }
            Self::InvalidRepulsion(repulsion) => write!(
                formatter,
                "UMAP repulsion strength must be finite and non-negative, got {repulsion}"
            ),
            Self::InvalidNegativeSampleRate(rate) => {
                write!(
                    formatter,
                    "UMAP negative sample rate must be positive, got {rate}"
                )
            }
            Self::EmptyGraph => formatter.write_str("cannot optimize an empty UMAP graph"),
            Self::NonSquareGraph { rows, columns } => {
                write!(
                    formatter,
                    "UMAP graph must be square, got {rows} by {columns}"
                )
            }
            Self::LayoutLength { rows, coordinates } => write!(
                formatter,
                "UMAP graph has {rows} rows but the initial layout has {coordinates} coordinates"
            ),
            Self::NonFiniteCoordinate { row, axis, value } => write!(
                formatter,
                "initial UMAP coordinate at row {row}, axis {axis} is non-finite: {value}"
            ),
            Self::DegenerateCoordinateAxis(axis) => write!(
                formatter,
                "initial UMAP coordinates have no range on axis {axis}"
            ),
            Self::InvalidGraphWeight { offset, weight } => write!(
                formatter,
                "UMAP graph weight at storage offset {offset} is not finite and positive: {weight}"
            ),
            Self::TooManyVertices(vertices) => write!(
                formatter,
                "{vertices} UMAP vertices cannot be represented by the reference optimizer"
            ),
        }
    }
}

impl Error for UmapError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Graph(error) => Some(error),
            Self::InvalidSpread(_)
            | Self::InvalidMinDistance { .. }
            | Self::CurveFitFailed
            | Self::InvalidCurve { .. }
            | Self::InvalidEpochs(_)
            | Self::InvalidLearningRate(_)
            | Self::InvalidRepulsion(_)
            | Self::InvalidNegativeSampleRate(_)
            | Self::EmptyGraph
            | Self::NonSquareGraph { .. }
            | Self::LayoutLength { .. }
            | Self::NonFiniteCoordinate { .. }
            | Self::DegenerateCoordinateAxis(_)
            | Self::InvalidGraphWeight { .. }
            | Self::TooManyVertices(_) => None,
        }
    }
}

impl From<GraphError> for UmapError {
    fn from(error: GraphError) -> Self {
        Self::Graph(error)
    }
}

/// Optimization schedule shared by [`SerialOptimizer`] and
/// [`ParallelOptimizer`].
#[derive(Debug, Copy, Clone)]
pub(crate) struct UmapOptions {
    /// Number of optimization epochs.
    ///
    /// Values of ten or fewer also loosen the edge-retention threshold to the
    /// `umap-learn` default schedule; see [`kernel::optimizer_edges`].
    pub(crate) epochs: usize,
    /// Learning rate at epoch zero. It decays linearly to zero across the
    /// epoch budget.
    pub(crate) initial_learning_rate: f64,
    /// Weight applied to repulsive negative-sample updates.
    pub(crate) repulsion_strength: f64,
    /// Number of negative samples drawn per attractive edge update.
    pub(crate) negative_sample_rate: usize,
}

impl UmapOptions {
    /// Rejects schedules that would stall, diverge, or divide by zero.
    ///
    /// # Errors
    ///
    /// Returns an error when `epochs` or `negative_sample_rate` is zero, when
    /// `initial_learning_rate` is not finite and positive, or when
    /// `repulsion_strength` is not finite and non-negative.
    fn validate(self) -> Result<Self, UmapError> {
        if self.epochs == 0 {
            return Err(UmapError::InvalidEpochs(self.epochs));
        }
        if !self.initial_learning_rate.is_finite() || self.initial_learning_rate <= 0.0 {
            return Err(UmapError::InvalidLearningRate(self.initial_learning_rate));
        }
        if !self.repulsion_strength.is_finite() || self.repulsion_strength < 0.0 {
            return Err(UmapError::InvalidRepulsion(self.repulsion_strength));
        }
        if self.negative_sample_rate == 0 {
            return Err(UmapError::InvalidNegativeSampleRate(
                self.negative_sample_rate,
            ));
        }
        Ok(self)
    }
}

/// Validates the graph shape and layout length shared by both optimizers.
///
/// # Errors
///
/// Returns an error when the graph is not square, when the layout row count
/// differs from the graph, or when the graph has more rows than `u32` vertex
/// indices can address.
fn validate_optimizer_inputs(
    graph: &SparseGraph,
    initial_coordinates: &[[f32; 2]],
) -> Result<(), UmapError> {
    if graph.rows() != graph.cols() {
        return Err(UmapError::NonSquareGraph {
            rows: graph.rows(),
            columns: graph.cols(),
        });
    }
    if graph.rows() != initial_coordinates.len() {
        return Err(UmapError::LayoutLength {
            rows: graph.rows(),
            coordinates: initial_coordinates.len(),
        });
    }
    if graph.rows() > u32::MAX as usize {
        return Err(UmapError::TooManyVertices(graph.rows()));
    }
    Ok(())
}
