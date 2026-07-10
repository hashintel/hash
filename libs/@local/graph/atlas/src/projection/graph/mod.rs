//! Sparse fuzzy graphs: semantic k-NN extraction, fuzzy simplicial sets, and
//! alpha blending.
//!
//! The pipeline represents every graph as a [`SparseGraph`], a CSR matrix of
//! `f32` weights with `u32` indices. This module provides the operations that
//! produce and combine them:
//!
//! - [`knn::semantic_knn`] and [`semantic_graph`] build the cosine k-NN graph over sampled
//!   embeddings with USearch/HNSW and convert it into a symmetric fuzzy graph.
//! - [`fuzzy::smooth_knn_distances`], [`fuzzy::membership_strengths`], [`fuzzy::fuzzy_graph`], and
//!   [`fuzzy::fuzzy_union`] are the individual fuzzy simplicial set stages, exposed separately so
//!   each can be checked against the pinned oracle.
//! - [`blend_and_reset`] fuses a semantic and a relation graph at a given alpha and restores each
//!   row's local connectivity.
//!
//! All stages validate their inputs and return [`GraphError`] rather than
//! panicking on malformed graphs.

mod error;
mod fuzzy;
mod knn;
#[cfg(test)]
mod tests;

use sprs::CsMatI;

pub(crate) use self::{
    error::GraphError,
    fuzzy::blend_and_reset,
    knn::{SemanticGraphOptions, semantic_graph},
};

/// A square CSR matrix of `f32` edge weights indexed by `u32` sampled rows.
pub(crate) type SparseGraph = CsMatI<f32, u32, u32>;

/// Slack accepted when validating that fuzzy weights stay within `[0, 1]`.
const GRAPH_WEIGHT_TOLERANCE: f32 = 1.0e-5;

/// Validates that a fuzzy graph is square, addressable by `u32`, and holds
/// weights within `[0, 1]` up to a small tolerance.
///
/// # Errors
///
/// Returns an error naming the first violated property.
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

/// Builds a square [`SparseGraph`] from raw CSR storage, validating the
/// structure.
///
/// # Errors
///
/// Returns [`GraphError::SparseStructure`] when the pointers, indices, and
/// values do not describe a valid CSR matrix (for example unsorted column
/// indices or pointer/value length mismatches).
pub(super) fn sparse_graph(
    rows: usize,
    indptr: Vec<u32>,
    indices: Vec<u32>,
    values: Vec<f32>,
) -> Result<SparseGraph, GraphError> {
    SparseGraph::try_new((rows, rows), indptr, indices, values)
        .map_err(|(_, _, _, error)| GraphError::SparseStructure(error.to_string()))
}

/// Merges two same-shape graphs entry by entry, keeping the larger weight.
///
/// # Errors
///
/// Returns an error when the shapes differ or the merged edge count exceeds
/// `u32` pointers.
pub(super) fn elementwise_max(
    left: &SparseGraph,
    right: &SparseGraph,
) -> Result<SparseGraph, GraphError> {
    merge_graphs(left, right, f32::max)
}

/// Merges two same-shape graphs row by row with a per-entry combinator.
///
/// Missing entries combine as `0.0`, and combined values of zero or less are
/// dropped from the output, so `combine` decides both the merged weight and
/// (via its sign) whether the entry survives.
///
/// # Errors
///
/// Returns an error when the shapes differ or the merged edge count exceeds
/// `u32` pointers.
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

    // Merge-join the two sorted row index lists.
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

/// An incremental CSR builder that fills a square graph one row at a time.
///
/// Push entries in ascending column order within each row, close every row
/// with [`GraphBuilder::finish_row`] (including empty rows), and call
/// [`GraphBuilder::finish`] after exactly `rows` closed rows.
struct GraphBuilder {
    rows: usize,
    rows_u32: u32,
    indptr: Vec<u32>,
    indices: Vec<u32>,
    values: Vec<f32>,
}

impl GraphBuilder {
    /// Creates a builder for a `rows` by `rows` graph, reserving `capacity`
    /// entries up front.
    ///
    /// # Errors
    ///
    /// Returns [`GraphError::TooManyRows`] when `rows` exceeds `u32` indices.
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

    /// Appends one entry to the row currently being built.
    ///
    /// # Errors
    ///
    /// Returns [`GraphError::NeighborOutOfBounds`] when `index` is not a valid
    /// column.
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

    /// Appends a whole row of `(column, value)` entries and closes it.
    ///
    /// # Errors
    ///
    /// Returns an error when a column is out of bounds or the edge count
    /// exceeds `u32` pointers.
    fn extend_row(&mut self, entries: &[(u32, f32)]) -> Result<(), GraphError> {
        for &(index, value) in entries {
            self.push(index, value)?;
        }
        self.finish_row()
    }

    /// Closes the current row.
    ///
    /// # Errors
    ///
    /// Returns [`GraphError::TooManyEdges`] when the accumulated edge count no
    /// longer fits `u32` pointers.
    fn finish_row(&mut self) -> Result<(), GraphError> {
        let edges = u32::try_from(self.indices.len())
            .map_err(|_error| GraphError::TooManyEdges(self.indices.len()))?;
        self.indptr.push(edges);
        Ok(())
    }

    /// Assembles the accumulated rows into a validated [`SparseGraph`].
    ///
    /// # Errors
    ///
    /// Returns [`GraphError::SparseStructure`] when the accumulated storage is
    /// not a valid CSR matrix, for example when fewer than `rows` rows were
    /// closed.
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
