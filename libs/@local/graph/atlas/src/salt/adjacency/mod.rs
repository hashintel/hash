//! The incident-edge adjacency: node rows to the edge rows touching
//! them.
//!
//! [`Adjacency`] is the serving contract's topology artifact: for every
//! node row, the edge rows leaving it and the edge rows arriving at it,
//! as two adjacent runs of one shared value array. Values are edge row
//! ids alone - attributes resolve through edge-row-indexed columns, so
//! the adjacency never re-publishes when an attribute column changes.
//! It derives from the endpoint column in one counting pass and
//! publishes as one [`crate::file::adjacency`] file; [`MappedAdjacency`]
//! reopens the file over a whole-file mapping and validates the list
//! invariants once, so lookups read from the page cache without holding
//! the lists on the heap.
//!
//! # List contract
//!
//! - Every edge row occupies exactly one outgoing slot (at its source) and one incoming slot (at
//!   its target). A self-loop occupies both slots of its one endpoint, so consumers merging the
//!   directions dedupe knowingly.
//! - Within each run the edge row ids are strictly ascending: runs are binary-searchable, and
//!   filtered merges walk them linearly.
//! - Zero-degree nodes hold two empty runs; the whole incident slice of a node is contiguous
//!   (outgoing then incoming), so the merged view costs nothing.

use std::io;

use crate::{
    bitset::BitSet,
    dataset::{EdgeRowId, NodeRowId},
    file::adjacency::{
        EdgeWidth,
        read::{AdjacencyFile, EdgeValues},
        write::write_lists,
    },
    integrity::{Sha256, Sha256Digest, Writer},
};

#[cfg(test)]
mod tests;

/// The incident-edge adjacency of one generation, in writable form.
///
/// Construction orders every run; the fencepost and value columns are
/// exactly the file's regions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Adjacency {
    /// `2N + 1` fenceposts: node row `i` owns the outgoing run
    /// `fenceposts[2i] .. fenceposts[2i + 1]` and the incoming run
    /// `fenceposts[2i + 1] .. fenceposts[2i + 2]`.
    fenceposts: Vec<u64>,
    /// `2E` edge row ids, strictly ascending within each run.
    values: Vec<u64>,
}

impl Adjacency {
    /// Builds the adjacency over the endpoint column.
    ///
    /// `endpoints[e]` is edge row `e`'s `[source, target]` node rows;
    /// `rows` is the node-row domain they index into. Time and memory
    /// are `O(N + E)`: one counting pass, one prefix sum, and one fill
    /// in edge-row order, which is what makes every run strictly
    /// ascending by construction.
    ///
    /// # Panics
    ///
    /// Panics when an endpoint lies outside the `rows` domain, which
    /// the dataset row contract excludes.
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

    /// Writes the adjacency as an adjacency file, at the narrowest
    /// value width covering the edge count.
    ///
    /// Returns the SHA-256 of the written bytes: the identity the
    /// repository records for the published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    #[expect(
        clippy::integer_division,
        clippy::integer_division_remainder_used,
        reason = "the value array holds exactly two slots per edge by construction"
    )]
    pub(crate) fn write_into(&self, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        let edges = (self.values.len() / 2) as u64;
        write_lists(
            &self.fenceposts,
            &self.values,
            EdgeWidth::for_edges(edges),
            &mut writer,
        )?;

        Ok(writer.accumulator.finalize())
    }
}

/// An opened adjacency file does not hold a valid adjacency.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum InvalidAdjacencyFile {
    /// The fencepost column does not start at slot zero.
    Start,
    /// A fencepost precedes the one before it.
    Unordered { position: usize },
    /// The final fencepost does not close the value array.
    Coverage { last: u64 },
    /// A run's edge row ids are not strictly ascending.
    RunOrder { run: usize },
    /// A value names an edge row at or beyond the edge count.
    Domain { slot: usize },
    /// An edge row occupies two slots of one direction.
    Duplicate { edge: u64 },
}

impl core::fmt::Display for InvalidAdjacencyFile {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match *self {
            Self::Start => write!(fmt, "the fencepost column does not start at slot zero"),
            Self::Unordered { position } => write!(
                fmt,
                "the fencepost at position {position} precedes the one before it",
            ),
            Self::Coverage { last } => write!(
                fmt,
                "the final fencepost {last} does not close the value array",
            ),
            Self::RunOrder { run } => write!(
                fmt,
                "run {run} holds edge row ids out of strictly ascending order",
            ),
            Self::Domain { slot } => write!(
                fmt,
                "slot {slot} names an edge row at or beyond the edge count",
            ),
            Self::Duplicate { edge } => {
                write!(fmt, "edge row {edge} occupies two slots of one direction")
            }
        }
    }
}

impl core::error::Error for InvalidAdjacencyFile {}

/// A published adjacency opened over its mapped file.
///
/// Construction checks the list contract once - fencepost coverage,
/// strictly ascending runs, every value in the edge domain, every edge
/// in exactly one slot per direction - so an open adjacency only serves
/// valid runs and consumers re-validate nothing. The regions stay in
/// the page cache under memory pressure and off the heap.
#[derive(Debug)]
pub(crate) struct MappedAdjacency {
    file: AdjacencyFile,
}

impl MappedAdjacency {
    /// Opens the adjacency over its mapped file.
    ///
    /// # Errors
    ///
    /// Returns an error when the file violates the list contract.
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(file: AdjacencyFile) -> Result<Self, InvalidAdjacencyFile> {
        let fenceposts = file.fenceposts();
        let values = file.values();
        let edges = file.edges();

        if fenceposts.first() != Some(&0) {
            return Err(InvalidAdjacencyFile::Start);
        }
        if let Some(position) =
            (1..fenceposts.len()).find(|&position| fenceposts[position] < fenceposts[position - 1])
        {
            return Err(InvalidAdjacencyFile::Unordered { position });
        }
        let last = *fenceposts.last().expect("the column holds 2N + 1 posts");
        if last != values.len() as u64 {
            return Err(InvalidAdjacencyFile::Coverage { last });
        }

        // One bit set per direction: strict run order rules out
        // duplicates within a run, the bit rules them out across runs,
        // and 2E valid slots then force every edge into exactly one
        // slot of each direction.
        let capacity = usize::try_from(edges).expect("resident edge domains fit usize");
        let mut seen = [BitSet::new(capacity), BitSet::new(capacity)];
        for run in 0..fenceposts.len() - 1 {
            let start = usize::try_from(fenceposts[run]).expect("slots fit the address space");
            let end = usize::try_from(fenceposts[run + 1]).expect("slots fit the address space");
            // Runs alternate outgoing (even) and incoming (odd).
            let direction = &mut seen[run & 1];

            let mut previous = None;
            for slot in start..end {
                let value = values.get(slot);
                if value >= edges {
                    return Err(InvalidAdjacencyFile::Domain { slot });
                }
                if previous.is_some_and(|previous| previous >= value) {
                    return Err(InvalidAdjacencyFile::RunOrder { run });
                }
                previous = Some(value);

                let edge = usize::try_from(value).expect("checked against the edge domain");
                if direction.contains(edge) {
                    return Err(InvalidAdjacencyFile::Duplicate { edge: value });
                }
                direction.insert(edge);
            }
        }

        Ok(Self { file })
    }

    /// Returns the node row count `N`.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> u64 {
        self.file.nodes()
    }

    /// Returns the edge row count `E`.
    #[inline]
    #[must_use]
    pub(crate) fn edges(&self) -> u64 {
        self.file.edges()
    }

    /// Returns the run between fenceposts `start` and `end`.
    fn run(&self, start: usize, end: usize) -> EdgeList<'_> {
        let fenceposts = self.file.fenceposts();
        let from = usize::try_from(fenceposts[start]).expect("slots fit the address space");
        let to = usize::try_from(fenceposts[end]).expect("slots fit the address space");

        EdgeList {
            values: self.file.values().slice(from..to),
        }
    }

    /// Returns the fencepost pair index of `node`, when the node row is
    /// in domain.
    fn posts(&self, node: NodeRowId) -> Option<usize> {
        if node.get() >= self.file.nodes() {
            return None;
        }
        Some(usize::try_from(2 * node.get()).expect("resident node domains fit usize"))
    }

    /// Returns the edge rows leaving `node`, strictly ascending, when
    /// the node row is in domain.
    #[must_use]
    pub(crate) fn outgoing(&self, node: NodeRowId) -> Option<EdgeList<'_>> {
        let posts = self.posts(node)?;
        Some(self.run(posts, posts + 1))
    }

    /// Returns the edge rows arriving at `node`, strictly ascending,
    /// when the node row is in domain.
    #[must_use]
    pub(crate) fn incoming(&self, node: NodeRowId) -> Option<EdgeList<'_>> {
        let posts = self.posts(node)?;
        Some(self.run(posts + 1, posts + 2))
    }

    /// Returns every edge row touching `node` - the contiguous outgoing
    /// run followed by the incoming run - when the node row is in
    /// domain.
    ///
    /// A self-loop at `node` appears in both runs; consumers merging
    /// the directions dedupe knowingly.
    #[must_use]
    pub(crate) fn incident(&self, node: NodeRowId) -> Option<EdgeList<'_>> {
        let posts = self.posts(node)?;
        Some(self.run(posts, posts + 2))
    }

    /// Returns the number of edge slots touching `node` - the incident
    /// run's length, a self-loop counting twice - when the node row is
    /// in domain.
    #[must_use]
    pub(crate) fn degree(&self, node: NodeRowId) -> Option<usize> {
        let posts = self.posts(node)?;
        let fenceposts = self.file.fenceposts();
        let length = fenceposts[posts + 2] - fenceposts[posts];

        Some(usize::try_from(length).expect("slots fit the address space"))
    }
}

/// One node's edge rows, borrowed from the mapped value array.
#[derive(Debug, Copy, Clone)]
pub(crate) struct EdgeList<'map> {
    values: EdgeValues<'map>,
}

impl EdgeList<'_> {
    /// Returns the number of edge rows in the list.
    #[inline]
    #[must_use]
    pub(crate) const fn len(&self) -> usize {
        self.values.len()
    }

    /// Returns whether the list is empty.
    #[inline]
    #[must_use]
    pub(crate) const fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    /// Returns the edge row at `index`.
    ///
    /// # Panics
    ///
    /// Panics when `index` is at or beyond [`len`](Self::len), like a
    /// slice.
    #[inline]
    #[must_use]
    pub(crate) const fn get(&self, index: usize) -> EdgeRowId {
        EdgeRowId::new(self.values.get(index))
    }

    /// Iterates the edge rows in list order.
    pub(crate) fn iter(self) -> impl ExactSizeIterator<Item = EdgeRowId> {
        self.values.iter().map(EdgeRowId::new)
    }
}
