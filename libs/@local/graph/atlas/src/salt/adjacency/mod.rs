//! An incident-edge adjacency lists the edge rows touching each node row.
//!
//! [`Adjacency`] is the serving contract's topology artifact. For every node row it records the
//! edge rows leaving it and the edge rows arriving at it as two adjacent runs of one shared entry
//! array.
//!
//! Every entry names an edge row rather than a node pair. The same node pair admits more than one
//! edge row, and attributes resolve through edge-row-indexed columns. Naming the edge keeps
//! parallel edges distinct and keeps the artifact stable, and the adjacency never re-publishes when
//! an attribute column changes.
//!
//! A node pair joined both ways draws the incidence picture the file compresses, with edge row `0`
//! the `0 → 1` edge and edge row `1` the `1 → 0` edge:
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
//! The artifact derives from the endpoint column in one counting pass and publishes as one
//! structure-only [`crate::file::sprs`] matrix: `2N` compressed rows over the fencepost column,
//! edge row ids as the indices, and [`unit`](crate::file::sprs::ValueTag::Unit) values, so no value
//! bytes exist on disk.
//!
//! [`AdjacencyArchive`] reopens the file over a whole-file mapping and validates the list
//! invariants once, so lookups read from the page cache without holding the lists on the heap.
//!
//! # List contract
//!
//! - Matrix row `2i` is node row `i`'s outgoing run and row `2i + 1` its incoming run, so one
//!   fencepost column serves both directions and the whole incident slice is contiguous for free.
//! - Every edge row occupies exactly one outgoing slot (at its source) and one incoming slot (at
//!   its target). A self-loop occupies both slots of its one endpoint, so a consumer merging the
//!   directions has to dedupe.
//! - Within each run the edge row ids are strictly ascending: runs are binary-searchable, and
//!   filtered merges walk them linearly.
//! - Zero-degree nodes hold two empty runs.
//! - The column dimension records the edge-domain bound `max(E, 1)`. The shape encoding terminates
//!   on zero extents, so an edgeless adjacency records the smallest bound and zero entries, and the
//!   edge count reads from the entry count alone.

mod artifact;

#[cfg(test)]
mod tests;

use core::ops::Deref;
use std::io;

use hashql_core::id::Id as _;
use sprs::{CsMatBase, SpIndex};

#[cfg(test)]
pub(crate) use self::artifact::EdgeList;
pub(crate) use self::artifact::{AdjacencyArchive, InvalidAdjacencyFile};
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
/// `cursors` holds each run's next free slot; a placement advances its run's cursor, so filling in
/// edge-row order lands ascending edge rows ascending in place.
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
/// Sparse-matrix storage wants one value slot per structural entry, and a structure-only matrix's
/// entries are units. A unit occupies no bytes, so the length is the whole value: `n` of them are
/// recoverable from `n`, and holding the count costs what holding the array would have cost.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct UnitSlice {
    length: usize,
}

impl Deref for UnitSlice {
    type Target = [()];

    fn deref(&self) -> &[()] {
        // SAFETY: `()` is zero-sized, so the slice covers no bytes at any length. The pointer
        // to `self` is non-null and trivially aligned for `()`, zero bytes are valid for reads
        // at any address, and no element count of a zero-sized type overflows `isize` in bytes.
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
/// Construction orders every run; the fencepost and value columns are exactly the file's pointer
/// and index regions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Adjacency(AdjacencyGraph);

impl Adjacency {
    /// Builds the adjacency over the endpoint column.
    ///
    /// `endpoints[e]` is edge row `e`'s `[source, target]` node rows; `rows` is the node-row domain
    /// they index into. Time and memory are `O(N + E)` over one counting pass, one prefix sum, and
    /// one fill in edge-row order, which is what makes every run strictly ascending by
    /// construction.
    ///
    /// # Panics
    ///
    /// This panics when an endpoint lies outside the `rows` domain, which the dataset row contract
    /// excludes.
    #[must_use]
    pub(crate) fn build(rows: usize, endpoints: &[[NodeRowId; 2]]) -> Self {
        let mut fenceposts = vec![0_u64; 2 * rows + 1];

        // Degrees first: slot 2i + 1 counts node i's outgoing edges and
        // slot 2i + 2 its incoming, so the prefix sum below turns the
        // counts into the run fenceposts directly.
        for &[source, target] in endpoints {
            let source = source.as_usize();
            let target = target.as_usize();
            fenceposts[2 * source + 1] += 1;
            fenceposts[2 * target + 2] += 1;
        }
        for position in 1..fenceposts.len() {
            fenceposts[position] += fenceposts[position - 1];
        }

        // Fill in edge-row order: each run's cursor starts at its
        // fencepost, and ascending edge rows land ascending in place.
        let mut cursors = fenceposts[..fenceposts.len() - 1].to_vec();

        // The narrowest covering width shrinks the value column and the
        // on-disk index region alike; `bound` stands in for the column
        // dimension so an edgeless adjacency keeps a nonzero domain.
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
        // The list contract stores two runs per node, so the halving is exact.
        runs.div_euclid(2)
    }

    /// Returns a node's incident-edge degree: its outgoing plus incoming slots.
    ///
    /// A self-loop counts twice, once per direction, matching the slot contract above. Returns
    /// [`None`] when the row lies outside the node domain.
    #[must_use]
    pub(crate) fn degree(&self, node: NodeRowId) -> Option<usize> {
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

/// Fills the value column at index width `I` and assembles the CSR adjacency.
///
/// `fenceposts` are the finished prefix sums over the `2N` runs; `cursors` start at each run's
/// fencepost. The matrix's row dimension is the run count, not the node count.
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

    // SAFETY: the counting build establishes the compressed structure: the fenceposts are a
    // prefix sum starting at zero and ending at the slot count, one entry past the run count,
    // the fill placed ascending edge rows ascending within each run, every value lies below
    // `bound`, and the unit storage length equals the value count.
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

    /// Writes the adjacency as a structure-only sparse matrix file.
    ///
    /// At the narrowest index width covering the edge count.
    ///
    /// Returns the SHA-256 of the written bytes, which is the identity the repository records for
    /// the published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails, or when the adjacency spans no node rows.
    /// The corpus contract places at least one node, and an empty row domain has no on-disk form.
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
