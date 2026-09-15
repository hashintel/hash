//! The semantic graph of fuzzy edge weights over the k-NN table.
//!
//! [`SemanticGraph`] is a symmetric sparse matrix over the node-row domain. Each stored entry `(i,
//! j)` weights the semantic edge between distinct rows `i` and `j` in `(0, 1]`.
//! [`SemanticGraph::build`] calibrates the distances in a [`Knn`](super::knn::table::Knn) table
//! into directed fuzzy memberships per row ([`bandwidth`]). The directed memberships combine into
//! an undirected weight by the probabilistic union. In mathematical notation,
//!
//! ```text
//! w(i, j) = p(i → j) + p(j → i) - p(i → j) · p(j → i).
//! ```
//!
//! Here `p(i → j)` is the calibrated membership of neighbour `j` in row `i`. An absent direction
//! contributes zero, and a one-sided edge keeps its directed membership. The union's support is the
//! union of the directed supports. A built row carries its `k` outgoing neighbours plus each
//! incoming neighbour absent from that outgoing set. Its degree lies between `k` and `n - 1` for
//! `n` node rows. A hub named by many rows can have a high degree. The graph stores every edge in
//! both of its rows with bit-equal weight.
//!
//! Publishing these attraction weights fixes the semantic input for model comparisons that reopen
//! the same artifact through [`artifact::SemanticGraphArchive`]. Rebuilding the k-NN table can
//! change that input.

use core::marker::PhantomData;

use hashql_core::id::Id;
use rayon::{
    iter::{IndexedParallelIterator as _, IntoParallelRefIterator as _, ParallelIterator as _},
    slice::{ParallelSlice as _, ParallelSliceMut as _},
};
use sprs::{CsMatI, CsMatViewI, binop::csmat_binop};

pub(crate) use self::error::SemanticValidationError;
use super::knn::table::KnnView;
use crate::math::{DNonNegative, DPositive, PositiveUnitFraction, d_positive};

pub(crate) mod artifact;
mod bandwidth;
mod error;

#[cfg(test)]
mod tests;

/// A sparse `f32` weight matrix with `u32` columns and `u64` row pointers.
pub(crate) type SemanticMatrix = CsMatI<f32, u32, u64>;

/// A borrowed [`SemanticMatrix`].
pub(crate) type SemanticMatrixView<'view> = CsMatViewI<'view, f32, u32, u64>;

/// Smooth-kNN convergence limits and the distance-scaled bandwidth floor.
///
/// Calibration targets the membership-sum equation in [`bandwidth`]. The stopping tolerance applies
/// before the bandwidth and stored-membership floors, which can raise the final sum. For validated
/// k-NN distances in `[0, 2]`, the defaults keep both trial and returned bandwidths finite and
/// positive. Custom settings must preserve that condition to implement the exponential model.
#[derive(Debug, Copy, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SmoothingOptions {
    /// Absolute membership-sum residual below which bisection stops early.
    ///
    /// The tolerance is `1.0e-5` by default. Reaching the iteration limit can leave a larger residual.
    pub tolerance: DPositive = d_positive!(1.0e-5),
    /// Scale factor of the distance-based `σ` floor.
    ///
    /// This is `1.0e-3` by default. For a finite nonnegative factor, `σ` never falls below its product with the row's mean distance (the corpus mean for rows without a positive distance). A zero or underflowed product supplies no positive floor.
    pub bandwidth_floor: f32 = 1.0e-3,
    /// Maximum bisection iterations per row.
    ///
    /// This is `64` by default. Zero iterations keep the initial trial bandwidth of `1.0` before applying the floor. Large limits can drive the trial bandwidth to zero or infinity in `f32`.
    pub bisection_iterations: usize = 64,
}

const impl Default for SmoothingOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// Checks the graph's shape, weight domain and symmetry.
///
/// # Errors
///
/// Returns [`SemanticValidationError`] when the matrix violates a graph invariant.
#[expect(
    clippy::float_cmp,
    reason = "the graph requires exact equality between finite positive weights in both directions"
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
/// in ascending row order. Weights are finite in `(0, 1]`, no row references itself, and the graph
/// stores every edge in both of its rows with bit-equal weight. The square matrix spans at least
/// two rows. [`Self::new`] also accepts empty rows and graphs with no edges. [`Self::build`]
/// establishes the k-NN support relationship described by this module.
///
/// `N` must represent every row in the matrix's domain for typed traversal.
#[derive(Debug, Clone)]
pub(crate) struct SemanticGraph<N>(SemanticMatrix, PhantomData<N>);

impl<N> SemanticGraph<N>
where
    N: Id,
{
    /// Validates a weight matrix against the graph invariants.
    ///
    /// # Errors
    ///
    /// Returns [`SemanticValidationError`] when the matrix violates a graph invariant.
    pub(crate) fn new(matrix: SemanticMatrix) -> Result<Self, SemanticValidationError> {
        validate(matrix.view())?;
        Ok(Self(matrix, PhantomData))
    }

    /// Weighs a k-NN table into the symmetric semantic graph.
    ///
    /// Calibration uses each row's distances to approach a membership sum of `log₂(k)` through a
    /// [`bandwidth`]. Tied distances can make that target unattainable, and iteration limits or the
    /// floors can also leave a residual. The directed memberships then combine by the probabilistic
    /// union.
    ///
    /// Row completion order preserves the association between each membership and its edge. With
    /// the default settings, each row's weights have a fixed arithmetic order for a given numerical
    /// environment. Cross-target bit equality is outside this contract.
    ///
    /// # Complexity
    ///
    /// For `n` rows, `k` neighbours per row and at most `b` calibration iterations, calibration
    /// takes O(n · k · (b + 1)) work. The directed matrices and union use O(n · k) additional
    /// space. Final validation checks each reverse edge by binary search, adding O(m · log n) work
    /// for `m` union entries.
    #[expect(
        clippy::cast_precision_loss,
        clippy::cast_possible_truncation,
        reason = "counts become f64 for calibration arithmetic, and the corpus mean rounds to the \
                  f32 bandwidth scale"
    )]
    pub(crate) fn build(knn: &KnnView<'_, N>, options: SmoothingOptions) -> Self {
        let rows = knn.rows();
        let neighbours = knn.neighbours();
        let (_, indices, distances) = knn.matrix().into_raw_storage();

        let target = (neighbours as f64).log2();
        // the parallel sum can vary its rounding order. Only all-zero rows use this fallback,
        // and their memberships are one for every finite positive bandwidth.
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

        // Swapping finite memberships preserves both their rounded sum and their exact product.
        // The fused operation subtracts that product from the same rounded sum in either order.
        // Therefore both directions compute bit-equal weights. The final clamp enforces the
        // unit-fraction ceiling at 1.0.
        let union = csmat_binop(directed.view(), transposed.view(), |&lhs, &rhs| {
            lhs.mul_add(-rhs, lhs + rhs).min(1.0)
        });

        Self::new(union).expect("the union of validated memberships satisfies every invariant")
    }

    /// Borrows the graph.
    #[inline]
    #[must_use]
    pub(crate) fn view(&self) -> SemanticGraphView<'_, N> {
        SemanticGraphView::new_unchecked(self.0.view())
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
pub(crate) struct SemanticEdge<N> {
    /// The other endpoint's node row.
    pub id: N,
    /// The undirected fuzzy weight, finite in `(0, 1]`.
    pub weight: PositiveUnitFraction,
}

/// Borrowed rows of one validated [`SemanticGraph`].
#[derive(Debug, Clone)]
pub(crate) struct SemanticGraphView<'view, N>(SemanticMatrixView<'view>, PhantomData<N>);

impl<'view, N> SemanticGraphView<'view, N>
where
    N: Id,
{
    /// Borrows a matrix satisfying the graph invariants.
    ///
    /// `matrix` must satisfy [`validate`].
    // These invariants govern graph correctness, not memory safety.
    #[inline]
    #[must_use]
    pub(super) const fn new_unchecked(matrix: SemanticMatrixView<'view>) -> Self {
        Self(matrix, PhantomData)
    }

    /// Returns the node-row count.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> usize {
        self.0.rows()
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
    /// This panics when [`Id::as_usize`] maps `row` outside the matrix's row domain. Iteration
    /// panics if `N` cannot represent a stored endpoint.
    pub(crate) fn row(&self, row: N) -> impl Iterator<Item = SemanticEdge<N>> + '_ {
        let (columns, weights) = self
            .0
            .outer_view(row.as_usize())
            .expect("the caller's row lies in the graph's row domain")
            .into_raw_storage();

        columns
            .iter()
            .zip(weights)
            .map(|(&column, &weight)| SemanticEdge {
                id: N::from_u32(column),
                weight: PositiveUnitFraction::new(f64::from(weight))
                    .expect("the graph validated every stored weight into (0, 1]"),
            })
    }

    /// Sums the graph's positive edge weight in double precision.
    ///
    /// Every stored entry contributes in row and endpoint order, and each undirected edge counts
    /// once per endpoint row.
    ///
    /// # Panics
    ///
    /// This panics if `N` cannot represent a matrix row.
    #[must_use]
    pub(crate) fn total_weight(&self) -> DNonNegative {
        let mut total = DNonNegative::ZERO;

        for row in 0..self.rows() {
            for edge in self.row(N::from_usize(row)) {
                total += edge.weight;
            }
        }

        total
    }
}
