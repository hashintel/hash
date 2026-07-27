//! The semantic graph: fuzzy edge weights over the k-NN table.
//!
//! The deliverable is [`SemanticGraph`]: a symmetric sparse matrix over the node-row domain whose
//! entry `(i, j)` weights the semantic edge between rows `i` and `j` in `(0, 1]`. It is the
//! weighted form of the [`Knn`](super::knn::table::Knn) table: distances calibrate into directed
//! fuzzy memberships per row ([`bandwidth`]), and the directed memberships combine into one
//! undirected weight by the probabilistic union
//!
//! ```text
//! w(i, j) = p(i → j) + p(j → i) - p(i → j) · p(j → i),
//! ```
//!
//! an absent direction contributing zero, so a one-sided edge keeps its directed membership. The
//! union's support is the union of the directed supports: a row carries its `k` outgoing edges
//! plus one edge for every other row that names it, so degrees start at `k` and are bounded only
//! by the row domain - a hub named by many rows carries many edges. Every edge appears in both of
//! its rows with bit-equal weight.
//!
//! The graph is the training-side attraction structure and is consumed from its published artifact
//! by training and release evaluation alike, so backend variation in the k-NN build cannot confound
//! model comparisons ([`artifact::SemanticGraphArchive`] reopens the published file).

use hashql_core::id::Id as _;
use rayon::{
    iter::{IndexedParallelIterator as _, IntoParallelRefIterator as _, ParallelIterator as _},
    slice::{ParallelSlice as _, ParallelSliceMut as _},
};
use sprs::{CsMatI, CsMatViewI, binop::csmat_binop};

pub(crate) use self::error::SemanticValidationError;
use super::knn::table::KnnView;
use crate::identity::NodeRowId;

pub(crate) mod artifact;
mod bandwidth;
mod error;

#[cfg(test)]
mod tests;

/// The graph's matrix layout, shared with the k-NN table.
pub(crate) type SemanticMatrix = CsMatI<f32, u32, u64>;

/// A borrowed [`SemanticMatrix`].
pub(crate) type SemanticMatrixView<'view> = CsMatViewI<'view, f32, u32, u64>;

/// Smooth-kNN calibration settings.
///
/// The defaults are the established UMAP fuzzy-set kernel constants.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SmoothingOptions {
    /// Absolute tolerance on the membership-sum equation at which the bisection stops early.
    ///
    /// Defaults to `1e-5`.
    pub tolerance: f64 = 1.0e-5,
    /// Scale factor of the `σ` floor.
    ///
    /// `σ` never falls below this fraction of the row's mean distance (the corpus mean for rows
    /// without a positive distance). Defaults to `1e-3`.
    pub bandwidth_floor: f32 = 1.0e-3,
    /// Bisection iterations per row when the tolerance is not met earlier. Defaults to 64.
    pub bisection_iterations: usize = 64,
}

const impl Default for SmoothingOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// Checks every graph invariant over a borrowed matrix.
#[expect(
    clippy::float_cmp,
    reason = "the union weight is computed from commutative operations, so the two directions of \
              an edge are bit-equal by construction and validated exactly"
)]
fn validate(matrix: SemanticMatrixView<'_>) -> Result<(), SemanticValidationError> {
    if !matrix.is_csr() {
        return Err(SemanticValidationError::ColumnCompressed);
    }

    let (rows, columns) = matrix.shape();
    if rows != columns {
        return Err(SemanticValidationError::NotSquare { rows, columns });
    }

    if rows < 2 {
        return Err(SemanticValidationError::InsufficientRows { rows });
    }

    for (row, stored) in matrix.outer_iterator().enumerate() {
        for (column, &weight) in stored.iter() {
            if column == row {
                return Err(SemanticValidationError::SelfEdge { row });
            }

            if !weight.is_finite() {
                return Err(SemanticValidationError::NonFiniteWeight {
                    row,
                    column,
                    weight,
                });
            }

            if !(weight > 0.0 && weight <= 1.0) {
                return Err(SemanticValidationError::WeightOutOfRange {
                    row,
                    column,
                    weight,
                });
            }

            let reverse = matrix
                .outer_view(column)
                .and_then(|entries| entries.get(row).copied());
            let Some(reverse) = reverse else {
                return Err(SemanticValidationError::AsymmetricSupport { row, column });
            };

            if reverse != weight {
                return Err(SemanticValidationError::AsymmetricWeight {
                    row,
                    column,
                    forward: weight,
                    reverse,
                });
            }
        }
    }

    Ok(())
}

/// The symmetric fuzzy-weight graph of one generation.
///
/// Row `i` stores the weights of every semantic edge at node row `i`, keyed by the other endpoint
/// in ascending row order. Weights are finite in `(0, 1]`, no row references itself, and every edge
/// is stored in both of its rows with bit-equal weight. A row's edges are the union of the
/// directed supports: at least the `k` outgoing edges of a `k`-neighbour table, plus one for every
/// other row naming it.
#[derive(Debug, Clone)]
pub(crate) struct SemanticGraph(SemanticMatrix);

impl SemanticGraph {
    /// Validates a weight matrix against the graph invariants.
    ///
    /// # Errors
    ///
    /// Returns an error when the matrix is not row-compressed, not square over at least two rows,
    /// self-referencing, stores a weight outside the finite `(0, 1]` range, or stores an edge whose
    /// two directions are missing or unequal.
    pub(crate) fn new(matrix: SemanticMatrix) -> Result<Self, SemanticValidationError> {
        validate(matrix.view())?;
        Ok(Self(matrix))
    }

    /// Weighs a k-NN table into the symmetric semantic graph.
    ///
    /// Each row's distances calibrate a [`bandwidth`] whose exponential memberships sum to
    /// `log2(k)`; the directed memberships then combine by the probabilistic union. Rows calibrate
    /// in parallel and deterministically: every row's result lands in its own slot regardless of
    /// completion order.
    #[expect(
        clippy::cast_precision_loss,
        clippy::cast_possible_truncation,
        reason = "neighbour and entry counts stay far below exact f64 integer precision, and the \
                  corpus mean is a bandwidth floor scale whose low f32 bits are irrelevant"
    )]
    pub(crate) fn build(knn: &KnnView<'_>, options: SmoothingOptions) -> Self {
        let rows = knn.rows();
        let neighbours = knn.neighbours();
        let (_, indices, distances) = knn.matrix().into_raw_storage();

        let target = (neighbours as f64).log2();
        let corpus_mean = (distances
            .par_iter()
            .map(|&distance| f64::from(distance))
            .sum::<f64>()
            / distances.len() as f64) as f32;

        let mut memberships = vec![0.0_f32; distances.len()];
        memberships
            .par_chunks_mut(neighbours)
            .zip(distances.par_chunks(neighbours))
            .for_each_init(
                || bandwidth::RowSolver::new(neighbours),
                |solver, (memberships, distances)| {
                    let bandwidth = solver.calibrate(distances, target, corpus_mean, &options);
                    solver.memberships(bandwidth, memberships);
                },
            );

        // usize to u64 never narrows on a supported target.
        let indptr: Vec<u64> = (0..=rows).map(|row| (row * neighbours) as u64).collect();
        let directed = SemanticMatrix::try_new((rows, rows), indptr, indices.to_vec(), memberships)
            .map_err(|(_, _, _, error)| error)
            .expect("the validated k-NN table's structure carries over");

        let transposed = directed.transpose_view().to_csr();

        // (a + b) - a · b: both operations are commutative, so the two directions of an edge
        // compute bit-equal weights; the clamp discharges the one representable overshoot
        // (rounding can lift the expression a few ulps above one when both memberships
        // approach one).
        let union = csmat_binop(directed.view(), transposed.view(), |&lhs, &rhs| {
            lhs.mul_add(-rhs, lhs + rhs).min(1.0)
        });

        Self::new(union).expect("the union of validated memberships satisfies every invariant")
    }

    /// Returns the node-row count.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> usize {
        self.0.rows()
    }

    /// Borrows the graph.
    #[inline]
    #[must_use]
    pub(crate) fn view(&self) -> SemanticGraphView<'_> {
        SemanticGraphView(self.0.view())
    }

    /// Borrows the weight matrix for sparse operations.
    #[inline]
    #[must_use]
    pub(crate) fn matrix(&self) -> SemanticMatrixView<'_> {
        self.0.view()
    }
}

/// One semantic edge as seen from a row: the other endpoint and the symmetric weight.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) struct SemanticEdge {
    /// The other endpoint's node row.
    pub id: NodeRowId,
    /// The undirected fuzzy weight, finite in `(0, 1]`.
    pub weight: f32,
}

/// Borrowed rows of one validated [`SemanticGraph`].
#[derive(Debug, Clone)]
pub(crate) struct SemanticGraphView<'view>(SemanticMatrixView<'view>);

impl<'view> SemanticGraphView<'view> {
    /// Wraps a matrix whose invariants already hold.
    ///
    /// The caller promises the matrix passed [`validate`]; the wrapper performs no checks of its
    /// own.
    #[inline]
    #[must_use]
    pub(super) const fn new_unchecked(matrix: SemanticMatrixView<'view>) -> Self {
        Self(matrix)
    }

    /// Returns the node-row count.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> usize {
        self.0.rows()
    }

    /// Returns the stored edge count, counting each edge twice.
    #[inline]
    #[must_use]
    pub(crate) fn entries(&self) -> usize {
        self.0.nnz()
    }

    /// Borrows the weight matrix for sparse operations.
    #[inline]
    #[must_use]
    pub(crate) const fn matrix(&self) -> SemanticMatrixView<'view> {
        self.0
    }

    /// Returns row `row`'s edges in ascending endpoint order.
    ///
    /// # Panics
    ///
    /// Panics when `row` is outside the graph's row domain.
    pub(crate) fn row(&self, row: usize) -> impl Iterator<Item = SemanticEdge> + '_ {
        let (columns, weights) = self
            .0
            .outer_view(row)
            .expect("the caller's row lies in the graph's row domain")
            .into_raw_storage();

        columns
            .iter()
            .zip(weights)
            .map(|(&column, &weight)| SemanticEdge {
                id: NodeRowId::from_u32(column),
                weight,
            })
    }
}
