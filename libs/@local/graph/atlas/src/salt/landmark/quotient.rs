//! Quotient contraction of the semantic graph.
//!
//! The corpus semantic graph contracts through the nearest-landmark assignment: every corpus edge
//! whose endpoints map to distinct landmarks contributes its weight to the directed landmark pair,
//! in double precision. Each landmark row then normalizes by its largest inflow, keeps its
//! strongest [`maximum_neighbours`](QuotientOptions::maximum_neighbours), and the two directions of
//! a pair combine by the probabilistic union `a + b - a · b` - the same symmetrization the
//! corpus-scale [`SemanticGraph`](crate::salt::semantic) is built with - so the result is a
//! symmetric graph over the landmark domain with weights in `(0, 1]` and optimization memory
//! proportional to the landmark count.
//!
//! The union treats the two directions as fuzzy memberships, not as two measurements of one
//! quantity: each is the pair's flow normalized by a *different* denominator (its own row's
//! largest inflow), so a plain sum would double-count the shared corpus edges under mismatched
//! scales, and a difference would measure asymmetry rather than affinity. The probabilistic union
//! keeps a one-sided edge at its directed value - a hub's weak judgement of a satellite never
//! erases the satellite's strong judgement of the hub - and reinforces edges both sides claim,
//! exactly as at corpus scale, so the layout optimizer sees one weight semantics at either scale.
//!
//! The corpus graph stores every edge in both rows, so each undirected corpus edge feeds both
//! directions of its landmark pair; the per-row normalization is what keeps the contraction from
//! being a plain doubling.
//!
//! The contraction accumulates in parallel, one task per landmark over that landmark's corpus rows
//! in ascending order, so the sums are bit-equal to a serial pass at any thread count.

use core::{error::Error, fmt, num::NonZero};

use hashql_core::id::{Id, IdVec};
use rayon::iter::{IntoParallelIterator as _, ParallelIterator as _};

use super::{assignment::LandmarkAssignment, select::LandmarkOrdinal};
use crate::salt::semantic::{
    SemanticGraph, SemanticGraphView, SemanticMatrix, SemanticValidationError,
};

const MAXIMUM_NEIGHBOURS: NonZero<usize> = const { NonZero::new(64).unwrap() };

/// Contraction settings.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct QuotientOptions {
    /// Strongest directed edges each landmark row keeps before the symmetric union.
    // The default is an unvalidated starting point (legacy required
    // the value as config, setting no precedent). It bounds quotient
    // memory at roughly `M · 64` directed edges before the union; the
    // layout quality criteria (trustworthiness, landmark rank
    // correlation) revise it from evidence.
    pub maximum_neighbours: NonZero<usize> = MAXIMUM_NEIGHBOURS,
}

const impl Default for QuotientOptions {
    fn default() -> Self {
        Self { .. }
    }
}

/// The contraction inputs are inconsistent or the quotient collapses.
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum QuotientError {
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

/// Corpus rows grouped by their assigned landmark, ascending within each group.
struct GroupedRows<N> {
    /// Group boundaries: landmark `l` owns `rows[starts[l]..starts[l + 1]]`.
    starts: IdVec<LandmarkOrdinal, usize>,
    rows: Vec<N>,
}

impl<N> GroupedRows<N>
where
    N: Id,
{
    /// Groups the assignment's rows by counting sort.
    fn new(assignment: &LandmarkAssignment<N>) -> Self {
        let ordinals = assignment.as_slice();

        let mut starts = IdVec::from_elem(0_usize, assignment.landmarks() + 1);
        for ordinal in ordinals {
            starts[ordinal.plus(1)] += 1;
        }

        let mut running = 0_usize;
        for slot in &mut starts {
            running += *slot;
            *slot = running;
        }

        let mut rows = vec![N::MIN; ordinals.len()];
        let mut cursors = starts.clone();
        for (row, &ordinal) in ordinals.iter_enumerated() {
            let cursor = &mut cursors[ordinal];
            rows[*cursor] = row;
            *cursor += 1;
        }

        Self { starts, rows }
    }

    /// Borrows one landmark's corpus rows, ascending.
    fn rows_of(&self, landmark: LandmarkOrdinal) -> &[N] {
        assert!(
            landmark.as_usize() + 1 < self.starts.len(),
            "the landmark is in the grouped domain"
        );

        &self.rows[self.starts[landmark]..self.starts[landmark.plus(1)]]
    }
}

/// Accumulates each landmark's directed inflows and keeps its strongest normalized neighbours.
///
/// One task per landmark accumulates into a dense per-thread scratch column - the touched list
/// records which slots to read and reset, so a task costs its own edges, not the landmark domain.
/// Rows ascend within each task, so the per-pair addition order (and the sum, bit for bit) matches
/// a serial pass at any thread count.
fn strongest_neighbours<N>(
    semantic: &SemanticGraphView<'_, N>,
    assignment: &LandmarkAssignment<N>,
    grouped: &GroupedRows<N>,
    options: QuotientOptions,
) -> IdVec<LandmarkOrdinal, Vec<(LandmarkOrdinal, f32)>>
where
    N: Id,
{
    let landmarks = assignment.landmarks();
    (0..landmarks)
        .into_par_iter()
        .map_init(
            || (IdVec::from_elem(0.0_f64, landmarks), Vec::new()),
            |(inflow, touched): &mut (IdVec<LandmarkOrdinal, f64>, _), left| {
                let left = LandmarkOrdinal::from_usize(left);
                for &row in grouped.rows_of(left) {
                    for edge in semantic.row(row) {
                        let right = assignment.as_slice()[edge.id];
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
                            reason = "a max-normalized finite weight lies in (0, 1], well inside \
                                      f32"
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
/// The landmark domain is the assignment's: the quotient has exactly
/// [`landmarks`](LandmarkAssignment::landmarks) rows.
///
/// # Errors
///
/// Returns an error when the assignment does not cover the graph's rows or when no edge crosses
/// landmark boundaries.
pub(crate) fn quotient_graph<N>(
    semantic: &SemanticGraphView<'_, N>,
    assignment: &LandmarkAssignment<N>,
    options: QuotientOptions,
) -> Result<SemanticGraph<LandmarkOrdinal>, QuotientError>
where
    N: Id,
{
    let rows = semantic.rows();
    if assignment.as_slice().len() != rows {
        return Err(QuotientError::AssignmentRows {
            expected: rows,
            actual: assignment.as_slice().len(),
        });
    }

    let landmarks = assignment.landmarks();
    let grouped = GroupedRows::new(assignment);
    let strongest_by_landmark = strongest_neighbours(semantic, assignment, &grouped, options);

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

    // Weight-descending within a key, so a pair's two mirror
    // positions fold in one order and compute bit-equal unions; the
    // clamp discharges the one representable overshoot near 1.
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

    // The sort, dedup and fill above are what make the pairs
    // compressed-sparse-row shaped: ascending and unique by (row,
    // column), every column a landmark ordinal, `indptr` monotone
    // through the entry count. All three steps are load-bearing for
    // that shape.
    let matrix = SemanticMatrix::try_new((landmarks, landmarks), indptr, indices, weights)
        .map_err(|(_, _, _, error)| error)
        .expect("mirrored sorted pairs form a compressed sparse row structure");

    Ok(SemanticGraph::new(matrix)?)
}
