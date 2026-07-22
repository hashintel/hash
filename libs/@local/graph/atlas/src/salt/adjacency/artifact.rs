//! The adjacency's published form: the writable builder, its matrix file, and the mapped reader.

use core::ops::Range;
use std::io;

use sprs::CsMatViewI;

use crate::{
    bitset::BitSet,
    dataset::{EdgeRowId, NodeRowId},
    file::{
        WriteInto,
        sprs::{
            IndexVariant, SprsIndex,
            read::{SprsFile, SprsMatrixError},
            write::{WriteSprsError, write_matrix},
        },
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

/// An opened sparse matrix file does not hold a valid adjacency.
#[derive(Debug)]
pub enum InvalidAdjacencyFile {
    /// The file fails the published adjacency shape.
    ///
    /// The bytes are not the structure-only matrix the adjacency publishes, or the compressed
    /// structure is invalid.
    Matrix(SprsMatrixError),
    /// The row dimension is odd: runs pair two per node.
    OddRows { rows: u64 },
    /// The entry count does not hold two slots per edge.
    Slots { entries: u64 },
    /// The column dimension is not the edge-domain bound.
    Bound { columns: u64, edges: u64 },
    /// The fencepost column does not start at slot zero.
    Start,
    /// An edge row occupies two slots of one direction.
    Duplicate { edge: u64 },
}

impl core::fmt::Display for InvalidAdjacencyFile {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Matrix(error) => {
                write!(
                    fmt,
                    "the file does not hold a structure-only matrix: {error}"
                )
            }
            Self::OddRows { rows } => {
                write!(fmt, "the row dimension {rows} does not pair runs per node")
            }
            Self::Slots { entries } => {
                write!(
                    fmt,
                    "the entry count {entries} does not hold two slots per edge"
                )
            }
            Self::Bound { columns, edges } => write!(
                fmt,
                "the column dimension {columns} is not the domain bound of {edges} edges",
            ),
            Self::Start => write!(fmt, "the fencepost column does not start at slot zero"),
            Self::Duplicate { edge } => {
                write!(fmt, "edge row {edge} occupies two slots of one direction")
            }
        }
    }
}

impl core::error::Error for InvalidAdjacencyFile {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match self {
            Self::Matrix(error) => Some(error),
            Self::OddRows { .. }
            | Self::Slots { .. }
            | Self::Bound { .. }
            | Self::Start
            | Self::Duplicate { .. } => None,
        }
    }
}

/// The index width an adjacency's edge row ids read at.
#[derive(Debug, Copy, Clone)]
enum Width {
    U32,
    U64,
}

/// A published adjacency opened over its mapped sparse matrix file.
///
/// Construction checks the list contract once - the structure-only element types and compressed
/// structure (fencepost coverage, strictly ascending runs, in-bound indices), paired runs, the
/// domain-bound column dimension, and every edge in exactly one slot per direction - so an open
/// adjacency only serves valid runs and consumers re-validate nothing. The regions stay in the page
/// cache under memory pressure and off the heap.
#[derive(Debug)]
pub(crate) struct AdjacencyArchive {
    file: SprsFile,
    width: Width,
    nodes: u64,
    edges: u64,
}

impl AdjacencyArchive {
    /// Opens the adjacency over its mapped sparse matrix file.
    ///
    /// # Errors
    ///
    /// Returns an error when the file violates the list contract.
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(file: SprsFile) -> Result<Self, InvalidAdjacencyFile> {
        let (width, (nodes, edges)) = match file.index() {
            IndexVariant::U32 => (Width::U32, validate::<u32>(&file)?),
            // Every index type but the writer's two fails the element
            // check inside, reported over the described types.
            IndexVariant::U16
            | IndexVariant::U64
            | IndexVariant::I16
            | IndexVariant::I32
            | IndexVariant::I64 => (Width::U64, validate::<u64>(&file)?),
        };

        Ok(Self {
            file,
            width,
            nodes,
            edges,
        })
    }

    /// Returns the node row count `N`.
    #[inline]
    #[must_use]
    pub(crate) const fn rows(&self) -> u64 {
        self.nodes
    }

    /// Returns the edge row count `E`.
    #[inline]
    #[must_use]
    pub(crate) const fn edges(&self) -> u64 {
        self.edges
    }

    /// Returns the fencepost column.
    fn fenceposts(&self) -> &[u64] {
        self.file
            .indptr()
            .expect("construction validated the element types")
    }

    /// Returns the value array at its described width.
    fn values(&self) -> EdgeValues<'_> {
        let expect = "construction validated the element types";
        match self.width {
            Width::U32 => EdgeValues::U32(self.file.indices().expect(expect)),
            Width::U64 => EdgeValues::U64(self.file.indices().expect(expect)),
        }
    }

    /// Returns the run between fenceposts `start` and `end`.
    fn run(&self, start: usize, end: usize) -> EdgeList<'_> {
        let fenceposts = self.fenceposts();
        let from = usize::try_from(fenceposts[start]).expect("slots fit the address space");
        let to = usize::try_from(fenceposts[end]).expect("slots fit the address space");

        EdgeList {
            values: self.values().slice(from..to),
        }
    }

    /// Returns the fencepost pair index of `node`, when the node row is in domain.
    fn posts(&self, node: NodeRowId) -> Option<usize> {
        if node.get() >= self.nodes {
            return None;
        }
        Some(usize::try_from(2 * node.get()).expect("resident node domains fit usize"))
    }

    /// Returns the edge rows leaving `node`, strictly ascending, when the node row is in domain.
    #[must_use]
    pub(crate) fn outgoing(&self, node: NodeRowId) -> Option<EdgeList<'_>> {
        let posts = self.posts(node)?;
        Some(self.run(posts, posts + 1))
    }

    /// Returns the edge rows arriving at `node`.
    ///
    /// Strictly ascending, when the node row is in domain.
    #[must_use]
    pub(crate) fn incoming(&self, node: NodeRowId) -> Option<EdgeList<'_>> {
        let posts = self.posts(node)?;
        Some(self.run(posts + 1, posts + 2))
    }

    /// Returns every edge row touching `node`.
    ///
    /// The contiguous outgoing run followed by the incoming run - when the node row is in domain.
    ///
    /// A self-loop at `node` appears in both runs; consumers merging the directions dedupe
    /// knowingly.
    #[must_use]
    pub(crate) fn incident(&self, node: NodeRowId) -> Option<EdgeList<'_>> {
        let posts = self.posts(node)?;
        Some(self.run(posts, posts + 2))
    }

    /// Returns the number of edge slots touching `node`.
    ///
    /// The incident run's length, a self-loop counting twice - when the node row is in domain.
    #[must_use]
    pub(crate) fn degree(&self, node: NodeRowId) -> Option<usize> {
        let posts = self.posts(node)?;
        let fenceposts = self.fenceposts();
        let length = fenceposts[posts + 2] - fenceposts[posts];

        Some(usize::try_from(length).expect("slots fit the address space"))
    }
}

/// Validates the list contract over a mapped file at index type `I`.
///
/// Returns the node and edge row counts. The compressed structure - fencepost coverage, strictly
/// ascending runs, indices below the column bound - is the matrix view's re-check; the walk below
/// adds what the format cannot know: paired runs, the domain-bound column dimension, and the
/// exactly-once slot rule.
fn validate<I>(file: &SprsFile) -> Result<(u64, u64), InvalidAdjacencyFile>
where
    I: SprsIndex + Into<u64> + Copy,
{
    file.matrix::<(), I, u64>()
        .map_err(InvalidAdjacencyFile::Matrix)?;

    let (rows, columns) = file.matrix_shape();
    if rows & 1 != 0 {
        return Err(InvalidAdjacencyFile::OddRows { rows });
    }
    let entries = file.nnz();
    if entries & 1 != 0 {
        return Err(InvalidAdjacencyFile::Slots { entries });
    }
    let edges = entries >> 1;
    if columns != edges.max(1) {
        return Err(InvalidAdjacencyFile::Bound { columns, edges });
    }

    let expect = "the matrix view validated the element types";
    let fenceposts = file.indptr::<u64>().expect(expect);
    if fenceposts.first() != Some(&0) {
        return Err(InvalidAdjacencyFile::Start);
    }
    let values = file.indices::<I>().expect(expect);

    // One bit set per direction: strict run order rules out duplicates
    // within a run, the bit rules them out across runs, and 2E valid
    // slots then force every edge into exactly one slot of each
    // direction. Every index lies below the column bound, which equals
    // the edge count whenever entries exist, so the bit domain covers
    // every walked value.
    let capacity = usize::try_from(edges).expect("resident edge domains fit usize");
    let mut seen = [BitSet::new(capacity), BitSet::new(capacity)];
    for run in 0..usize::try_from(rows).expect("resident node domains fit usize") {
        let start = usize::try_from(fenceposts[run]).expect("slots fit the address space");
        let end = usize::try_from(fenceposts[run + 1]).expect("slots fit the address space");
        // Runs alternate outgoing (even) and incoming (odd).
        let direction = &mut seen[run & 1];

        for &value in &values[start..end] {
            let value: u64 = value.into();
            let edge = usize::try_from(value).expect("checked against the edge domain");
            if direction.contains(edge) {
                return Err(InvalidAdjacencyFile::Duplicate { edge: value });
            }
            direction.insert(edge);
        }
    }

    Ok((rows >> 1, edges))
}

/// A borrowed edge row id array, at either stored width.
///
/// Value-level accessors widen to `u64`, so consumers stay width-agnostic.
#[derive(Debug, Copy, Clone)]
enum EdgeValues<'map> {
    /// Four-byte edge row ids.
    U32(&'map [u32]),
    /// Eight-byte edge row ids.
    U64(&'map [u64]),
}

impl EdgeValues<'_> {
    /// Returns the number of value slots.
    #[inline]
    #[must_use]
    const fn len(&self) -> usize {
        match self {
            Self::U32(values) => values.len(),
            Self::U64(values) => values.len(),
        }
    }

    /// Returns whether the array holds no slots.
    #[inline]
    #[must_use]
    const fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Returns the edge row id in slot `index`.
    ///
    /// # Panics
    ///
    /// Panics when `index` is at or beyond [`len`](Self::len), like a slice.
    #[inline]
    #[must_use]
    const fn get(&self, index: usize) -> u64 {
        match self {
            Self::U32(values) => values[index] as u64,
            Self::U64(values) => values[index],
        }
    }

    /// Narrows the array to `range`, keeping the width.
    ///
    /// # Panics
    ///
    /// Panics when `range` escapes [`len`](Self::len), like a slice.
    #[inline]
    #[must_use]
    const fn slice(&self, range: Range<usize>) -> Self {
        match self {
            Self::U32(values) => Self::U32(&values[range]),
            Self::U64(values) => Self::U64(&values[range]),
        }
    }

    /// Iterates the edge row ids in slot order.
    fn iter(self) -> impl ExactSizeIterator<Item = u64> {
        (0..self.len()).map(move |index| self.get(index))
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
    /// Panics when `index` is at or beyond [`len`](Self::len), like a slice.
    #[inline]
    #[must_use]
    pub(crate) const fn get(&self, index: usize) -> EdgeRowId {
        EdgeRowId::new(self.values.get(index))
    }

    /// Iterates the edge rows in list order.
    pub(crate) fn iter(self) -> impl ExactSizeIterator<Item = EdgeRowId> {
        self.values.iter().map(EdgeRowId::new)
    }

    /// Returns whether the list holds `edge`, by binary search.
    ///
    /// Correct over [`outgoing`](AdjacencyArchive::outgoing) and
    /// [`incoming`](AdjacencyArchive::incoming) lists, whose runs are strictly ascending. An
    /// [`incident`](AdjacencyArchive::incident) list concatenates two ascending runs and is not
    /// globally sorted; query its directions separately.
    #[must_use]
    pub(crate) const fn contains(&self, edge: EdgeRowId) -> bool {
        let mut low = 0;
        let mut high = self.len();
        while low < high {
            let middle = usize::midpoint(low, high);
            if self.values.get(middle) < edge.get() {
                low = middle + 1;
            } else {
                high = middle;
            }
        }

        low < self.len() && self.values.get(low) == edge.get()
    }
}
