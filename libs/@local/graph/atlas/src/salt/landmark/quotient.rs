//! Quotient contraction of the semantic graph.
//!
//! The corpus semantic graph contracts through the nearest-landmark
//! assignment: every corpus edge whose endpoints map to distinct
//! landmarks contributes its weight to the directed landmark pair, in
//! double precision. Each landmark row then normalizes by its largest
//! inflow, keeps its strongest
//! [`maximum_neighbours`](QuotientOptions::maximum_neighbours), and
//! the two directions of a pair combine by maximum, so the result is a
//! symmetric [`SemanticGraph`] over the landmark domain with weights
//! in `(0, 1]` and optimization memory proportional to the landmark
//! count.
//!
//! The corpus graph stores every edge in both rows, so each undirected
//! corpus edge feeds both directions of its landmark pair; the
//! per-row normalization is what keeps the contraction from being a
//! plain doubling.
//!
//! The contraction accumulates in parallel, one task per landmark over
//! that landmark's corpus rows in ascending order, so the sums are
//! bit-equal to a serial pass at any thread count.

use core::{error::Error, fmt, num::NonZero};
use std::collections::HashMap;

use rayon::prelude::*;

use super::{assignment::LandmarkAssignment, select::LandmarkOrdinal};
use crate::salt::semantic::{
    SemanticGraph, SemanticGraphView, SemanticMatrix, SemanticValidationError,
};

/// Contraction settings.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct QuotientOptions {
    /// Strongest directed edges each landmark row keeps before the
    /// symmetric union. Defaults to 64.
    // The default is an unvalidated starting point (legacy required
    // the value as config, setting no precedent). It bounds quotient
    // memory at roughly `M * 64` directed edges before the union; the
    // layout quality criteria (trustworthiness, landmark rank
    // correlation) revise it from evidence.
    pub maximum_neighbours: NonZero<usize> = const { NonZero::new(64).unwrap() },
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

/// Contracts the corpus semantic graph into the landmark domain.
///
/// The landmark domain is the assignment's: the quotient has exactly
/// [`landmarks`](LandmarkAssignment::landmarks) rows.
///
/// # Errors
///
/// Returns an error when the assignment does not cover the graph's
/// rows or when no edge crosses landmark boundaries.
pub(crate) fn quotient_graph(
    semantic: &SemanticGraphView<'_>,
    assignment: &LandmarkAssignment,
    options: QuotientOptions,
) -> Result<SemanticGraph, QuotientError> {
    let rows = semantic.rows();
    if assignment.as_slice().len() != rows {
        return Err(QuotientError::AssignmentRows {
            expected: rows,
            actual: assignment.as_slice().len(),
        });
    }

    let landmarks = assignment.landmarks();
    let grouped = GroupedRows::new(assignment);

    let strongest_by_landmark: Vec<Vec<(LandmarkOrdinal, f32)>> = (0..landmarks)
        .into_par_iter()
        .map(|left| {
            let mut inflow = HashMap::<LandmarkOrdinal, f64>::new();
            for &row in grouped.rows_of(left) {
                for edge in semantic.row(row) {
                    let right = assignment.as_slice()[edge.id.usize()];
                    if right.usize() != left {
                        *inflow.entry(right).or_default() += f64::from(edge.weight);
                    }
                }
            }

            let maximum = inflow.values().copied().fold(0.0_f64, f64::max);
            if maximum == 0.0 {
                return Vec::new();
            }

            let mut strongest: Vec<(LandmarkOrdinal, f64)> = inflow.into_iter().collect();
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
                        reason = "a max-normalized finite weight lies in (0, 1], well inside f32"
                    )]
                    let normalized = (weight / maximum) as f32;
                    (column, normalized)
                })
                .collect()
        })
        .collect();

    let mut undirected = HashMap::<(LandmarkOrdinal, LandmarkOrdinal), f32>::new();
    for (left, strongest) in strongest_by_landmark.into_iter().enumerate() {
        #[expect(
            clippy::cast_possible_truncation,
            reason = "positions in the ordinal-indexed table lie below the assignment's \
                      u32-bounded landmark count"
        )]
        let left = LandmarkOrdinal::new(left as u32);
        for (right, weight) in strongest {
            let pair = if left < right {
                (left, right)
            } else {
                (right, left)
            };

            undirected
                .entry(pair)
                .and_modify(|current| *current = current.max(weight))
                .or_insert(weight);
        }
    }

    if undirected.is_empty() {
        return Err(QuotientError::EmptyQuotient);
    }

    let mut rows: Vec<Vec<(LandmarkOrdinal, f32)>> = vec![Vec::new(); landmarks];
    for (&(left, right), &weight) in &undirected {
        rows[left.usize()].push((right, weight));
        rows[right.usize()].push((left, weight));
    }

    let mut indptr = Vec::with_capacity(landmarks + 1);
    let mut indices = Vec::with_capacity(2 * undirected.len());
    let mut weights = Vec::with_capacity(2 * undirected.len());
    indptr.push(0_u64);
    for row in &mut rows {
        row.sort_unstable_by_key(|&(column, _)| column);
        indices.extend(row.iter().map(|&(column, _)| column.get()));
        weights.extend(row.iter().map(|&(_, weight)| weight));
        indptr.push(indices.len() as u64);
    }

    let matrix = SemanticMatrix::try_new((landmarks, landmarks), indptr, indices, weights)
        .map_err(|(_, _, _, error)| error)
        .expect("mirrored sorted pairs form a compressed sparse row structure");

    Ok(SemanticGraph::new(matrix)?)
}

/// Corpus rows grouped by their assigned landmark, ascending within
/// each group.
struct GroupedRows {
    /// Group boundaries: landmark `l` owns `rows[starts[l]..starts[l + 1]]`.
    starts: Vec<usize>,
    rows: Vec<usize>,
}

impl GroupedRows {
    /// Groups the assignment's rows by counting sort.
    fn new(assignment: &LandmarkAssignment) -> Self {
        let ordinals = assignment.as_slice();

        let mut starts = vec![0_usize; assignment.landmarks() + 1];
        for ordinal in ordinals {
            starts[ordinal.usize() + 1] += 1;
        }
        let mut running = 0_usize;
        for slot in &mut starts {
            running += *slot;
            *slot = running;
        }

        let mut rows = vec![0_usize; ordinals.len()];
        let mut cursors = starts.clone();
        for (row, ordinal) in ordinals.iter().enumerate() {
            let cursor = &mut cursors[ordinal.usize()];
            rows[*cursor] = row;
            *cursor += 1;
        }

        Self { starts, rows }
    }

    /// Borrows one landmark's corpus rows, ascending.
    fn rows_of(&self, landmark: usize) -> &[usize] {
        assert!(
            landmark + 1 < self.starts.len(),
            "the landmark is in the grouped domain"
        );
        &self.rows[self.starts[landmark]..self.starts[landmark + 1]]
    }
}
