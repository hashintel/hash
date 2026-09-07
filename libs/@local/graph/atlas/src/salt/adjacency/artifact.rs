//! The writable builder, its matrix file, and the mapped reader that publish an adjacency.

use core::ops::Range;

use hashql_core::id::{Id as _, bit_vec::DenseBitSet};

use crate::{
    file::sprs::{
        IndexVariant, SprsIndex,
        read::{SprsFile, SprsMatrixError},
    },
    identity::{EdgeRowId, NodeRowId},
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
    Duplicate { edge: EdgeRowId },
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
    U16,
    U32,
    U64,
}

/// A published adjacency opened over its mapped sparse matrix file.
///
/// Construction checks the list contract once, covering the structure-only element types and
/// compressed structure (fencepost coverage, strictly ascending runs, in-bound indices), paired
/// runs, the domain-bound column dimension, and every edge in exactly one slot per direction. An
/// open adjacency therefore serves only valid runs and consumers re-validate nothing. The regions
/// stay in the page cache under memory pressure and off the heap.
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
        let (width, (nodes, edges)) = match file.header().index() {
            IndexVariant::U16 => (Width::U16, validate::<u16>(&file)?),
            IndexVariant::U32 => (Width::U32, validate::<u32>(&file)?),
            // The writer emits unsigned widths only. The signed index
            // types fail the element check inside, reported over the
            // described types.
            IndexVariant::U64 | IndexVariant::I16 | IndexVariant::I32 | IndexVariant::I64 => {
                (Width::U64, validate::<u64>(&file)?)
            }
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
            Width::U16 => EdgeValues::U16(self.file.indices().expect(expect)),
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
        if node.as_u64() >= self.nodes {
            return None;
        }

        Some(usize::try_from(2 * node.as_u64()).expect("resident node domains fit usize"))
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
}

/// Validates the list contract over a mapped file at index type `I`.
///
/// Returns the node and edge row counts. The matrix view re-checks the compressed structure
/// (fencepost coverage, strictly ascending runs, indices below the column bound). The walk below
/// adds the rules that the format leaves unexpressed.
///
/// - Runs pair two per node.
/// - The column dimension equals the edge-domain bound.
/// - Each edge occupies exactly one slot per direction.
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

    // Each direction gets one bit set. Strict run order rules out
    // duplicates within a run and the bit rules them out across runs, so
    // 2E valid slots force every edge into exactly one slot of each
    // direction. Every index lies below the column bound. That bound
    // equals the edge count whenever entries exist, so the bit domain
    // covers every walked value.
    let capacity = usize::try_from(edges).expect("resident edge domains fit usize");
    let mut seen = [
        DenseBitSet::new_empty(capacity),
        DenseBitSet::new_empty(capacity),
    ];

    for run in 0..usize::try_from(rows).expect("resident node domains fit usize") {
        let start = usize::try_from(fenceposts[run]).expect("slots fit the address space");
        let end = usize::try_from(fenceposts[run + 1]).expect("slots fit the address space");

        // Runs alternate outgoing (even) and incoming (odd).
        let direction = &mut seen[run & 1];

        for &value in &values[start..end] {
            let edge = EdgeRowId::from_usize(value.index());

            if direction.contains(edge) {
                return Err(InvalidAdjacencyFile::Duplicate { edge });
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
    /// Two-byte edge row ids.
    U16(&'map [u16]),
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
            Self::U16(values) => values.len(),
            Self::U32(values) => values.len(),
            Self::U64(values) => values.len(),
        }
    }

    /// Returns the edge row id in slot `index`.
    ///
    /// # Panics
    ///
    /// This panics when `index` is at or beyond [`len`](Self::len), like a slice.
    #[inline]
    #[must_use]
    const fn get(&self, index: usize) -> u64 {
        match self {
            Self::U16(values) => values[index] as u64,
            Self::U32(values) => values[index] as u64,
            Self::U64(values) => values[index],
        }
    }

    /// Narrows the array to `range`, keeping the width.
    ///
    /// # Panics
    ///
    /// This panics when `range` escapes [`len`](Self::len), like a slice.
    #[inline]
    #[must_use]
    const fn slice(&self, range: Range<usize>) -> Self {
        match self {
            Self::U16(values) => Self::U16(&values[range]),
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
    /// Iterates the edge rows in list order.
    pub(crate) fn iter(self) -> impl ExactSizeIterator<Item = EdgeRowId> {
        self.values.iter().map(EdgeRowId::new)
    }
}
