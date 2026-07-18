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

use core::{error::Error, fmt, num::NonZero};
use std::collections::HashMap;

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
    // layout quality gates (trustworthiness, landmark rank
    // correlation) revise it from evidence.
    pub maximum_neighbours: NonZero<usize> = const { NonZero::new(64).unwrap() },
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
    let mut directed: Vec<HashMap<LandmarkOrdinal, f64>> = vec![HashMap::new(); landmarks];
    for row in 0..rows {
        let left = assignment.as_slice()[row];
        for edge in semantic.row(row) {
            let right = assignment.as_slice()[edge.id.usize()];
            if left != right {
                *directed[left.usize()].entry(right).or_default() += f64::from(edge.weight);
            }
        }
    }

    let mut undirected = HashMap::<(LandmarkOrdinal, LandmarkOrdinal), f32>::new();
    for (left, row) in directed.into_iter().enumerate() {
        let maximum = row.values().copied().fold(0.0_f64, f64::max);
        if maximum == 0.0 {
            continue;
        }

        let mut strongest: Vec<(LandmarkOrdinal, f64)> = row.into_iter().collect();
        strongest.sort_unstable_by(
            |&(left_column, left_weight), &(right_column, right_weight)| {
                right_weight
                    .total_cmp(&left_weight)
                    .then_with(|| left_column.cmp(&right_column))
            },
        );
        strongest.truncate(options.maximum_neighbours.get());

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
            #[expect(
                clippy::cast_possible_truncation,
                reason = "a max-normalized finite weight lies in (0, 1], well inside f32"
            )]
            let normalized = (weight / maximum) as f32;
            undirected
                .entry(pair)
                .and_modify(|current| *current = current.max(normalized))
                .or_insert(normalized);
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
