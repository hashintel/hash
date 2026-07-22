//! The adjacency's published form: the writable builder, its matrix file, and the mapped reader.

use core::ops::Range;

use crate::{
    bitset::BitSet,
    dataset::{EdgeRowId, NodeRowId},
    file::sprs::{
        IndexVariant, SprsIndex,
        read::{SprsFile, SprsMatrixError},
    },
};

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
