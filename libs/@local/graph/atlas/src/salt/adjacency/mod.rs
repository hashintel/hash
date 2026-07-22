//! The incident-edge adjacency: node rows to the edge rows touching them.
//!
//! [`Adjacency`] is the serving contract's topology artifact: for every node row, the edge rows
//! leaving it and the edge rows arriving at it, as two adjacent runs of one shared value array.
//! Values are edge row ids alone - attributes resolve through edge-row-indexed columns, so the
//! adjacency never re-publishes when an attribute column changes. It derives from the endpoint
//! column in one counting pass and publishes as one structure-only [`crate::file::sprs`] matrix:
//! `2N` compressed rows over the fencepost column, edge row ids as the indices, and
//! [`unit`](crate::file::sprs::ValueTag::Unit) values, so no value bytes exist on disk.
//! [`AdjacencyArchive`] reopens the file over a whole-file mapping and validates the list
//! invariants once, so lookups read from the page cache without holding the lists on the heap.
//!
//! # List contract
//!
//! - Matrix row `2i` is node row `i`'s outgoing run and row `2i + 1` its incoming run, so one
//!   fencepost column serves both directions and the whole incident slice is contiguous for free.
//! - Every edge row occupies exactly one outgoing slot (at its source) and one incoming slot (at
//!   its target). A self-loop occupies both slots of its one endpoint, so consumers merging the
//!   directions dedupe knowingly.
//! - Within each run the edge row ids are strictly ascending: runs are binary-searchable, and
//!   filtered merges walk them linearly.
//! - Zero-degree nodes hold two empty runs.
//! - The column dimension records the edge-domain bound `max(E, 1)`: the shape encoding terminates
//!   on zero extents, so an edgeless adjacency records the smallest bound and zero entries, and the
//!   edge count reads from the entry count alone.

mod artifact;

#[cfg(test)]
mod tests;

#[cfg(test)]
pub(crate) use self::artifact::EdgeList;
pub(crate) use self::artifact::{Adjacency, AdjacencyArchive, InvalidAdjacencyFile};
