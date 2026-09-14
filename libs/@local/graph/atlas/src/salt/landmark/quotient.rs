//! Quotient contraction of the semantic graph.
//!
//! Let A(i) assign input row i to one of M landmarks, and let wᵢⱼ ∈ (0, 1] be a stored input edge
//! weight. For distinct landmarks a and b, the directed flow is F(a, b) = Σ_{i: A(i) = a} Σ_{j:
//! A(j) = b} wᵢⱼ, summing only stored edges. Edges inside one landmark contribute nothing. Each row
//! normalizes by its largest flow, `p(a, b) = F(a, b) / max_c F(a, c)`, and keeps its strongest
//! [`maximum_neighbours`](QuotientOptions::maximum_neighbours) entries, breaking ties by ordinal.
//! Missing and discarded directions have p = 0.
//!
//! The quotient weight is q(a, b) = p(a, b) + p(b, a) − p(a, b) · p(b, a), the probabilistic union
//! also used by [`SemanticGraph`]. Row-specific maxima put
//! the directions on different scales. Union preserves either direction's support and never lowers
//! its real-arithmetic membership. In particular, a landmark's weak normalized flow to another
//! never erases that other's strong flow back. This preserves fuzzy-membership semantics at both
//! graph scales instead of summing the shared corpus edges twice.
//!
//! A successful quotient is symmetric with weights in (0, 1]. Mirroring retained directions can
//! give one row more neighbours than its directed cap. With cap K, the result has at most 2 · M · K
//! stored directed entries. Contraction also needs the corpus-to-landmark grouping and dense
//! landmark-domain scratch columns.
//!
//! Accumulation uses `f64`. Every landmark's task visits its assigned corpus rows and their edges
//! in ascending order, preserving the per-pair addition order of a serial pass at any thread count.
//! Normalized weights narrow to `f32`, and equal-weight ordering makes both mirrored unions
//! bit-equal under the same floating-point behavior. Extreme flow ratios can underflow to zero on
//! narrowing, in which case final graph validation fails.

use core::{error::Error, fmt, num::NonZero};

use hashql_core::id::{Id, IdVec};
use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};

use super::{assignment::LandmarkAssignment, select::LandmarkOrdinal};
use crate::salt::semantic::{
    SemanticGraph, SemanticGraphView, SemanticMatrix, SemanticValidationError,
};

/// The default per-landmark directed-edge cap.
const MAXIMUM_NEIGHBOURS: NonZero<usize> = const { NonZero::new(64).unwrap() };

/// Contraction settings.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct QuotientOptions {
    /// Strongest directed edges each landmark row keeps before union, 64 by default.
    // the unvalidated default bounds retained directions at M · 64 before union. Trustworthiness and landmark rank correlation supply the measurements for revising it.
    pub maximum_neighbours: NonZero<usize> = MAXIMUM_NEIGHBOURS,
}

const impl Default for QuotientOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// The contraction inputs are inconsistent or the quotient collapses.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum QuotientError {
    /// The assignment covers a different corpus than the graph.
    AssignmentRows { expected: usize, actual: usize },
    /// No corpus edge crosses landmarks: the quotient has no edges.
    EmptyQuotient,
    /// The contracted matrix violates a [`SemanticGraph`] invariant.
    Invalid(SemanticValidationError),
}

impl From<SemanticValidationError> for QuotientError {
    fn from(invalid: SemanticValidationError) -> Self {
        Self::Invalid(invalid)
    }
}

impl fmt::Display for QuotientError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::AssignmentRows { expected, actual } => write!(
                fmt,
                "the assignment covers {actual} rows; the semantic graph covers {expected}",
            ),
            Self::EmptyQuotient => {
                fmt.write_str("no semantic edge crosses landmarks; the quotient has no edges")
            }
            Self::Invalid(invalid) => invalid.fmt(fmt),
        }
    }
}

impl Error for QuotientError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Invalid(invalid) => Some(invalid),
            Self::AssignmentRows { .. } | Self::EmptyQuotient => None,
        }
    }
}

impl<N> LandmarkAssignment<N>
where
    N: Id,
{
    /// Accumulates each landmark's directed inflows and keeps its strongest normalized neighbours.
    ///
    /// Each task state has a dense landmark-domain scratch column. The touched list limits
    /// extraction and reset to nonzero flows after allocation. [`runs`](Self::runs) preserves
    /// ascending corpus-row order within each landmark, matching a serial pass's per-pair
    /// additions.
    ///
    /// # Panics
    ///
    /// This panics when a visited row lies outside the graph or a neighbour lies outside the
    /// assignment.
    fn strongest_neighbours(
        &self,
        semantic: &SemanticGraphView<'_, N>,
        options: QuotientOptions,
    ) -> IdVec<LandmarkOrdinal, Vec<(LandmarkOrdinal, f32)>> {
        let grouped = self.runs();
        let landmarks = self.landmarks();
        (0..landmarks)
            .into_par_iter()
            .map_init(
                || (IdVec::from_elem(0.0_f64, landmarks), Vec::new()),
                |(inflow, touched): &mut (IdVec<LandmarkOrdinal, f64>, _), left| {
                    let left = LandmarkOrdinal::from_usize(left);
                    for &row in grouped.run(left) {
                        for edge in semantic.row(row) {
                            let right = self.as_slice()[edge.id];
                            if right != left {
                                let slot = &mut inflow[right];
                                if *slot == 0.0 {
                                    touched.push(right);
                                }
                                *slot += f64::from(edge.weight);
                            }
                        }
                    }

                    let mut strongest: Vec<(LandmarkOrdinal, f64)> = touched
                        .drain(..)
                        .map(|column| {
                            let weight = core::mem::replace(&mut inflow[column], 0.0);
                            (column, weight)
                        })
                        .collect();

                    let maximum = strongest
                        .iter()
                        .map(|&(_, weight)| weight)
                        .fold(0.0_f64, f64::max);
                    if maximum == 0.0 {
                        return Vec::new();
                    }

                    strongest.sort_unstable_by(
                        |&(left_column, left_weight), &(right_column, right_weight)| {
                            right_weight
                                .total_cmp(&left_weight)
                                .then_with(|| left_column.cmp(&right_column))
                        },
                    );
                    strongest.truncate(options.maximum_neighbours.get());

                    strongest
                        .into_iter()
                        .map(|(column, weight)| {
                            #[expect(
                                clippy::cast_possible_truncation,
                                reason = "a max-normalized finite weight lies in (0, 1], well \
                                          inside f32"
                            )]
                            let normalized = (weight / maximum) as f32;
                            (column, normalized)
                        })
                        .collect()
                },
            )
            .collect()
    }

    /// Contracts the corpus semantic graph into the landmark domain.
    ///
    /// The landmark domain is this assignment's: the quotient has exactly
    /// [`landmarks`](Self::landmarks) rows.
    ///
    /// # Errors
    ///
    /// Returns [`QuotientError`] for inconsistent row domains, an edgeless quotient, or a
    /// contracted matrix that fails graph validation.
    #[tracing::instrument(skip_all)]
    pub(crate) fn quotient(
        &self,
        semantic: &SemanticGraphView<'_, N>,
        options: QuotientOptions,
    ) -> Result<SemanticGraph<LandmarkOrdinal>, QuotientError> {
        let rows = semantic.rows();
        if self.as_slice().len() != rows {
            return Err(QuotientError::AssignmentRows {
                expected: rows,
                actual: self.as_slice().len(),
            });
        }

        let landmarks = self.landmarks();
        let strongest_by_landmark = self.strongest_neighbours(semantic, options);

        // Mirror every kept directed edge, then combine each (row,
        // column)'s run by the probabilistic union: a symmetric edge list
        // sorted straight into compressed sparse rows.
        let mut edges: Vec<(u32, u32, f32)> = Vec::new();
        for (left, strongest) in strongest_by_landmark.into_iter_enumerated() {
            for (right, weight) in strongest {
                edges.push((left.get(), right.get(), weight));
                edges.push((right.get(), left.get(), weight));
            }
        }

        if edges.is_empty() {
            return Err(QuotientError::EmptyQuotient);
        }

        // A pair has at most one retained membership from each direction. Descending weight order
        // makes its two mirrored positions fold those same operands in the same order. Their unions
        // are bit-equal, and the clamp enforces the upper bound of one. Final validation rejects a
        // zero from earlier underflow.
        edges.sort_unstable_by(
            |&(row_a, column_a, weight_a), &(row_b, column_b, weight_b)| {
                (row_a, column_a)
                    .cmp(&(row_b, column_b))
                    .then_with(|| weight_b.total_cmp(&weight_a))
            },
        );
        edges.dedup_by(
            |&mut (row_a, column_a, dropped), &mut (row_b, column_b, ref mut kept)| {
                if (row_a, column_a) == (row_b, column_b) {
                    *kept = kept.mul_add(-dropped, *kept + dropped).min(1.0);
                    true
                } else {
                    false
                }
            },
        );

        let mut indptr = Vec::with_capacity(landmarks + 1);
        let mut indices = Vec::with_capacity(edges.len());
        let mut weights = Vec::with_capacity(edges.len());
        indptr.push(0_u64);
        for (row, column, weight) in edges {
            while indptr.len() <= row as usize {
                indptr.push(indices.len() as u64);
            }
            indices.push(column);
            weights.push(weight);
        }
        while indptr.len() <= landmarks {
            indptr.push(indices.len() as u64);
        }

        // the sorted, deduplicated pairs give ascending unique columns in every row. The fill
        // starts indptr at zero and closes it at the entry count, including empty landmark rows.
        let matrix = SemanticMatrix::try_new((landmarks, landmarks), indptr, indices, weights)
            .map_err(|(_, _, _, error)| error)
            .expect("mirrored sorted pairs form a compressed sparse row structure");

        Ok(SemanticGraph::new(matrix)?)
    }
}
