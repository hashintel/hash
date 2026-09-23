//! Incident-edge lookup with separate outgoing and incoming runs.
//!
//! [`Adjacency`] records the edge rows leaving each node and arriving at it as adjacent runs of one
//! shared entry array. Naming edge rows preserves parallel edges between the same node pair. The
//! adjacency depends only on the endpoint column and node domain, allowing attribute columns to
//! change independently.
//!
//! A node pair joined both ways has the following incidence matrix, with edge row `0` the `0 → 1`
//! edge and edge row `1` the `1 → 0` edge:
//!
//! ```text
//!                    edge 0   edge 1
//! node 0 outgoing      x
//! node 0 incoming               x
//! node 1 outgoing               x
//! node 1 incoming      x
//! ```
//!
//! Each matrix row stores its `x` marks as one ascending run of edge row ids, and each edge column
//! holds exactly two marks: one outgoing at its source, one incoming at its target.
//!
//! Construction fills the runs in edge-row order after counting degrees and computing prefix sums.
//! The artifact writes as one structure-only [`crate::file::sprs`] CSR matrix: `2N` compressed rows
//! for `N` nodes, edge row ids as indices, and [`unit`](crate::file::sprs::ValueTag::Unit) values.
//! No value bytes exist on disk.
//!
//! [`AdjacencyArchive`] borrows lists from a whole-file mapping. For CSR input it validates the
//! list invariants at construction, using temporary per-direction bitsets. Lookups borrow the
//! mapped runs without allocating.
//!
//! # List contract
//!
//! - Matrix row `2i` is node row `i`'s outgoing run and row `2i + 1` its incoming run. One
//!   fencepost column serves both directions. The incident slice is contiguous.
//! - Every edge row occupies exactly one outgoing slot (at its source) and one incoming slot (at
//!   its target). A self-loop occupies both slots of its one endpoint. Merging the directions
//!   requires deduplication.
//! - Within each run the edge row ids are strictly ascending: runs are binary-searchable, and
//!   filtered merges walk them linearly.
//! - Zero-degree nodes hold two empty runs.
//! - The column dimension records the edge-domain bound `max(E, 1)`. The shape encoding terminates
//!   on zero extents. An edgeless adjacency records the smallest bound and zero entries. The edge
//!   count reads from the entry count alone.

mod artifact;

#[cfg(test)]
mod tests;

use core::ops::Deref;
use std::io;

use hashql_core::id::Id as _;
use sprs::{CsMatBase, SpIndex};

pub(crate) use self::artifact::{AdjacencyArchive, EdgeList};
use crate::{
    file::{
        WriteAs, WriteInto,
        sprs::write::{WriteSprsError, write_matrix},
    },
    identity::NodeRowId,
    integrity::{Sha256, Sha256Digest, Writer},
};

/// Places edge row `edge` into its source's outgoing and its target's incoming slot.
///
/// `cursors` holds each run's next free slot. Filling slots in edge-row order keeps each run
/// ascending.
///
/// # Panics
///
/// Panics if an endpoint's computed run is outside `cursors`, or its next slot is outside `values`
/// or the address space.
fn insert_edge<I: Copy>(
    cursors: &mut [u64],
    values: &mut [I],
    edge: I,
    source: NodeRowId,
    target: NodeRowId,
) {
    let source = source.as_usize();
    let target = target.as_usize();

    let out_slot = &mut cursors[2 * source];
    values[usize::try_from(*out_slot).expect("slots fit the address space")] = edge;
    *out_slot += 1;

    let in_slot = &mut cursors[2 * target + 1];
    values[usize::try_from(*in_slot).expect("slots fit the address space")] = edge;
    *in_slot += 1;
}

/// A unit-value array carried as its length alone.
///
/// Sparse-matrix storage requires one value slot per structural entry. A unit occupies no bytes,
/// and `n` units are recoverable from the length `n`.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct UnitSlice {
    length: usize,
}

impl Deref for UnitSlice {
    type Target = [()];

    fn deref(&self) -> &[()] {
        // SAFETY: a slice of `()` occupies zero bytes for every element count, and `()` has
        // alignment one and no initialization bytes. The pointer comes from the shared borrow of
        // `self`, is non-null and aligned, and the returned slice borrows no longer than `self`.
        // Its byte range is empty and cannot exceed `isize::MAX` or wrap the address space.
        // Therefore `from_raw_parts` may construct this shared unit slice.
        unsafe { core::slice::from_raw_parts(core::ptr::from_ref(self).cast::<()>(), self.length) }
    }
}

/// A structure-only CSR adjacency matrix with owned columns at index width `I`.
type AdjacencySparseGraph<I, Iptr> = CsMatBase<(), I, Vec<Iptr>, Vec<I>, UnitSlice, Iptr>;

/// The adjacency matrix at the narrowest index width covering its column bound.
#[derive(Debug, Clone, PartialEq, Eq)]
enum AdjacencyGraph {
    /// Two-byte edge row ids.
    U16(AdjacencySparseGraph<u16, u64>),
    /// Four-byte edge row ids.
    U32(AdjacencySparseGraph<u32, u64>),
    /// Eight-byte edge row ids.
    U64(AdjacencySparseGraph<u64, u64>),
}

/// The incident-edge adjacency of one generation, in writable form.
///
/// Construction orders every run. The fencepost and edge-row columns become the file's pointer and
/// index regions. Writing uses the narrowest unsigned index width covering `max(E, 1)`, where `E`
/// is the edge count.
///
/// Writing a zero-node adjacency returns [`WriteSprsError::ZeroDimension`]. A nonempty node domain
/// with no edges has a file representation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Adjacency(AdjacencyGraph);

impl Adjacency {
    /// Builds the adjacency over the endpoint column.
    ///
    /// `endpoints[e]` is edge row `e`'s `[source, target]` node rows. Every endpoint must lie in
    /// the `rows` node domain, and the `2 · rows + 1` fenceposts must fit an addressable
    /// allocation. The result has one outgoing and one incoming slot per edge, including
    /// self-loops.
    ///
    /// # Complexity
    ///
    /// Time and memory are O(N + E), for N node rows and E edges. A counting pass and prefix sum
    /// delimit the runs. Filling each run in ascending edge-row order establishes its strict
    /// ordering.
    ///
    /// # Panics
    ///
    /// Panics if the run-column allocation exceeds the address space or a computed endpoint slot
    /// lies outside it.
    #[must_use]
    pub(crate) fn build(rows: usize, endpoints: &[[NodeRowId; 2]]) -> Self {
        let mut fenceposts = vec![0_u64; 2 * rows + 1];

        // slot 2i + 1 counts node i's outgoing edges and slot 2i + 2 its incoming edges. Placing
        // degrees one slot after each run's start makes the prefix sum produce its fenceposts.
        for &[source, target] in endpoints {
            let source = source.as_usize();
            let target = target.as_usize();
            fenceposts[2 * source + 1] += 1;
            fenceposts[2 * target + 2] += 1;
        }
        for position in 1..fenceposts.len() {
            fenceposts[position] += fenceposts[position - 1];
        }

        // each run's cursor starts at its fencepost. The fill visits edge rows in ascending order
        // and appends within each run.
        let mut cursors = fenceposts[..fenceposts.len() - 1].to_vec();

        // sprs requires the column dimension itself to fit the index type. The narrowest covering
        // width shrinks both the resident edge-row column and its file region. A nonzero bound
        // preserves the shape of an edgeless adjacency.
        let bound = endpoints.len().max(1);
        if u16::try_from(bound).is_ok() {
            Self(AdjacencyGraph::U16(assemble(
                bound,
                fenceposts,
                &mut cursors,
                endpoints,
            )))
        } else if u32::try_from(bound).is_ok() {
            Self(AdjacencyGraph::U32(assemble(
                bound,
                fenceposts,
                &mut cursors,
                endpoints,
            )))
        } else {
            Self(AdjacencyGraph::U64(assemble(
                bound,
                fenceposts,
                &mut cursors,
                endpoints,
            )))
        }
    }

    /// Returns the node row count `N`.
    #[must_use]
    pub(crate) fn rows(&self) -> usize {
        let runs = match &self.0 {
            AdjacencyGraph::U16(graph) => graph.rows(),
            AdjacencyGraph::U32(graph) => graph.rows(),
            AdjacencyGraph::U64(graph) => graph.rows(),
        };
        // the list contract stores exactly two runs per node.
        runs.div_euclid(2)
    }

    /// Returns a node's incident-edge degree: its outgoing plus incoming slots.
    ///
    /// A self-loop counts twice, once per direction. Returns [`None`] when the platform-sized row
    /// index lies outside the node domain.
    ///
    /// # Warning
    ///
    /// On targets narrower than 64 bits, row conversion retains only the low `usize::BITS` bits. An
    /// out-of-domain row can then alias an in-domain node.
    #[must_use]
    pub(crate) fn degree(&self, node: NodeRowId) -> Option<usize> {
        /// Counts the slots incident to `node` in `graph`.
        ///
        /// Sums the outgoing and incoming slots, and returns [`None`] when the node's slot pair
        /// lies outside `graph`.
        fn incident<I>(graph: &AdjacencySparseGraph<I, u64>, node: NodeRowId) -> Option<usize>
        where
            I: SpIndex,
        {
            let outgoing = node.as_usize().checked_mul(2)?;
            let incoming = outgoing + 1;
            if incoming >= graph.rows() {
                return None;
            }

            Some(graph.outer_view(outgoing)?.nnz() + graph.outer_view(incoming)?.nnz())
        }

        match &self.0 {
            AdjacencyGraph::U16(graph) => incident(graph, node),
            AdjacencyGraph::U32(graph) => incident(graph, node),
            AdjacencyGraph::U64(graph) => incident(graph, node),
        }
    }
}

/// Fills the edge-row column at index width `I` and assembles the CSR adjacency.
///
/// `fenceposts` must be the finished degree prefix sums over the `2N` runs of `endpoints`, starting
/// at zero. `cursors` must start at each run's fencepost. `bound` must equal `max(endpoints.len(),
/// 1)` and fit `I`. The matrix's row dimension is the run count, not the node count.
///
/// # Panics
///
/// Panics if `fenceposts` is empty, an edge row cannot fit `I`, the entry allocation exceeds the
/// address space, or [`insert_edge`] encounters an out-of-range run or slot.
fn assemble<I>(
    bound: usize,
    fenceposts: Vec<u64>,
    cursors: &mut [u64],
    endpoints: &[[NodeRowId; 2]],
) -> AdjacencySparseGraph<I, u64>
where
    I: SpIndex + TryFrom<usize>,
    <I as TryFrom<usize>>::Error: core::fmt::Debug,
{
    let zero = I::try_from(0).expect("zero fits every index width");
    let mut values = vec![zero; endpoints.len() * 2];
    for (edge, &[source, target]) in endpoints.iter().enumerate() {
        let edge = I::try_from(edge).expect("edge rows lie below the checked width bound");
        insert_edge(cursors, &mut values, edge, source, target);
    }

    let runs = fenceposts.len() - 1;
    let length = values.len();

    // SAFETY: sprs requires matching entry/value lengths, monotone representable pointers, strictly
    // ascending bounded indices per run, and representable dimensions. `build` supplies zero-based
    // degree prefix sums ending at `2E`, with `runs + 1` pointers. The successful non-ZST
    // allocations bound pointers by `isize::MAX`, and their lengths fit `u64`. Each edge is
    // appended once to each endpoint direction in ascending order, including separate self-loop
    // slots. The selected index width covers `bound`, every edge index is below it, and `UnitSlice`
    // has exactly the index count. Therefore these columns satisfy `new_unchecked`'s
    // compressed-structure contract.
    unsafe {
        CsMatBase::new_unchecked(
            sprs::CompressedStorage::CSR,
            (runs, bound),
            fenceposts,
            values,
            UnitSlice { length },
        )
    }
}

impl WriteAs<crate::file::salt::artifact::Adjacency> for Adjacency {}

impl WriteInto for Adjacency {
    type Error = WriteSprsError;

    fn write_into(&self, write: impl io::Write) -> Result<Sha256Digest, WriteSprsError> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        match &self.0 {
            AdjacencyGraph::U16(matrix) => write_matrix(matrix, &mut writer)?,
            AdjacencyGraph::U32(matrix) => write_matrix(matrix, &mut writer)?,
            AdjacencyGraph::U64(matrix) => write_matrix(matrix, &mut writer)?,
        }

        Ok(writer.accumulator.finalize())
    }
}
