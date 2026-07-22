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

use std::io;

use sprs::CsMatViewI;

#[cfg(test)]
pub(crate) use self::artifact::EdgeList;
pub(crate) use self::artifact::{AdjacencyArchive, InvalidAdjacencyFile};
use crate::{
    file::{
        WriteInto,
        sprs::write::{WriteSprsError, write_matrix},
    },
    integrity::{Sha256, Sha256Digest, Writer},
};

/// The incident-edge adjacency of one generation, in writable form.
///
/// Construction orders every run; the fencepost and value columns are exactly the file's pointer
/// and index regions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Adjacency {
    /// `2N + 1` fenceposts.
    ///
    /// Node row `i` owns the outgoing run `fenceposts[2i] .. fenceposts[2i + 1]` and the incoming
    /// run `fenceposts[2i + 1] .. fenceposts[2i + 2]`.
    fenceposts: Vec<u64>,
    /// `2E` edge row ids, strictly ascending within each run.
    values: Vec<u64>,
}

impl Adjacency {
    /// Builds the adjacency over the endpoint column.
    ///
    /// `endpoints[e]` is edge row `e`'s `[source, target]` node rows; `rows` is the node-row domain
    /// they index into. Time and memory are `O(N + E)`: one counting pass, one prefix sum, and one
    /// fill in edge-row order, which is what makes every run strictly ascending by construction.
    ///
    /// # Panics
    ///
    /// Panics when an endpoint lies outside the `rows` domain, which the dataset row contract
    /// excludes.
    #[must_use]
    pub(crate) fn build(rows: usize, endpoints: &[[u64; 2]]) -> Self {
        let mut fenceposts = vec![0_u64; 2 * rows + 1];

        // Degrees first: slot 2i + 1 counts node i's outgoing edges and
        // slot 2i + 2 its incoming, so the prefix sum below turns the
        // counts into the run fenceposts directly.
        for &[source, target] in endpoints {
            let source = usize::try_from(source).expect("node rows fit the address space");
            let target = usize::try_from(target).expect("node rows fit the address space");
            fenceposts[2 * source + 1] += 1;
            fenceposts[2 * target + 2] += 1;
        }
        for position in 1..fenceposts.len() {
            fenceposts[position] += fenceposts[position - 1];
        }

        // Fill in edge-row order: each run's cursor starts at its
        // fencepost, and ascending edge rows land ascending in place.
        let mut cursors = fenceposts[..fenceposts.len() - 1].to_vec();
        let mut values = vec![0_u64; endpoints.len() * 2];
        for (edge, &[source, target]) in endpoints.iter().enumerate() {
            let source = usize::try_from(source).expect("node rows fit the address space");
            let target = usize::try_from(target).expect("node rows fit the address space");

            let out_slot = &mut cursors[2 * source];
            values[usize::try_from(*out_slot).expect("slots fit the address space")] = edge as u64;
            *out_slot += 1;

            let in_slot = &mut cursors[2 * target + 1];
            values[usize::try_from(*in_slot).expect("slots fit the address space")] = edge as u64;
            *in_slot += 1;
        }

        Self { fenceposts, values }
    }
}

impl WriteInto for Adjacency {
    type Error = WriteSprsError;

    /// Writes the adjacency as a structure-only sparse matrix file.
    ///
    /// At the narrowest index width covering the edge count.
    ///
    /// Returns the SHA-256 of the written bytes: the identity the repository records for the
    /// published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails, or when the adjacency spans no node rows:
    /// the corpus contract places at least one node, and an empty row domain has no on-disk form.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "the value array holds exactly two slots per edge by construction"
    )]
    fn write_into(&self, write: impl io::Write) -> Result<Sha256Digest, WriteSprsError> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        let rows = self.fenceposts.len() - 1;
        let edges = self.values.len() / 2;
        let bound = edges.max(1);
        let units = vec![(); self.values.len()];

        // The narrowest covering width halves the on-disk index region
        // for every corpus below 2^32 edges; the narrow column is an
        // E-scale transient.
        if let Ok(bound32) = u32::try_from(bound) {
            let narrow: Vec<u32> = self
                .values
                .iter()
                .map(|&value| u32::try_from(value).expect("edge rows lie below the checked bound"))
                .collect();
            let matrix = CsMatViewI::<'_, (), u32, u64>::try_new(
                (rows, bound32 as usize),
                &self.fenceposts,
                &narrow,
                &units,
            )
            .expect("the counting build establishes the compressed structure");
            write_matrix(&matrix, &mut writer)?;
        } else {
            let matrix = CsMatViewI::<'_, (), u64, u64>::try_new(
                (rows, bound),
                &self.fenceposts,
                &self.values,
                &units,
            )
            .expect("the counting build establishes the compressed structure");
            write_matrix(&matrix, &mut writer)?;
        }

        Ok(writer.accumulator.finalize())
    }
}
