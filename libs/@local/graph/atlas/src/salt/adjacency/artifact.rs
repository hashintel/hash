use core::ops::Range;
use std::path::Path;

use hashql_core::id::{Id as _, bit_vec::DenseBitSet};

use crate::{
    file::{
        ArtifactFile,
        sprs::{
            IndexVariant, SprsIndex,
            read::{OpenSprsError, SprsFile, SprsMatrixError},
        },
    },
    identity::{EdgeRowId, NodeRowId},
};

/// A failure while validating an adjacency's sparse-matrix representation.
#[derive(Debug)]
pub(crate) enum InvalidAdjacencyFile {
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

/// A failure to open or validate a mapped adjacency.
#[derive(Debug)]
pub(crate) enum OpenAdjacencyArchiveError {
    /// The sparse matrix file failed to open.
    Open(OpenSprsError),
    /// The file does not hold a valid adjacency.
    Invalid(InvalidAdjacencyFile),
}

const impl From<OpenSprsError> for OpenAdjacencyArchiveError {
    fn from(error: OpenSprsError) -> Self {
        Self::Open(error)
    }
}

const impl From<InvalidAdjacencyFile> for OpenAdjacencyArchiveError {
    fn from(error: InvalidAdjacencyFile) -> Self {
        Self::Invalid(error)
    }
}

impl core::fmt::Display for OpenAdjacencyArchiveError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Open(error) => write!(fmt, "the sparse matrix file failed to open: {error}"),
            Self::Invalid(error) => {
                write!(fmt, "the file does not hold a valid adjacency: {error}")
            }
        }
    }
}

impl core::error::Error for OpenAdjacencyArchiveError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match self {
            Self::Open(error) => Some(error),
            Self::Invalid(error) => Some(error),
        }
    }
}

/// The stored unsigned width of an adjacency's edge row ids.
#[derive(Debug, Copy, Clone)]
enum Width {
    U16,
    U32,
    U64,
}

/// A published adjacency opened over its mapped sparse matrix file.
///
/// For CSR input, construction checks structure-only element types, compressed structure, paired
/// runs, the edge-domain bound, and exactly one slot per edge per direction. The lists borrow the
/// mapping without retaining a heap copy. Pages can be evicted and faulted back under memory
/// pressure.
///
/// Supply CSR files, as produced by [`super::Adjacency`]. Construction does not check storage order
/// and does not establish the list contract for CSC input.
///
/// # Panics
///
/// Opening a CSC file can panic during validation.
#[derive(Debug)]
pub(crate) struct AdjacencyArchive {
    file: SprsFile,
    width: Width,
    nodes: u64,
    edges: u64,
}

impl ArtifactFile for AdjacencyArchive {
    type Error = OpenAdjacencyArchiveError;

    fn open(path: impl AsRef<Path>) -> Result<Self, Self::Error> {
        let file = SprsFile::open(path)?;
        Self::new(file).map_err(From::from)
    }
}

impl AdjacencyArchive {
    /// Validates a CSR file for mapped incident-edge lookups.
    ///
    /// The file must use CSR storage. Validation checks internal list consistency, without
    /// comparing against an endpoint column.
    ///
    /// # Errors
    ///
    /// Returns [`InvalidAdjacencyFile`] for invalid element types, compressed structure, or list
    /// invariants.
    ///
    /// # Panics
    ///
    /// A CSC file can panic during run validation.
    ///
    /// # Complexity
    ///
    /// Validation takes O(N + E) time and O(E) temporary bits for N nodes and E edges in a CSR
    /// file. Successful construction retains only the mapping and scalar metadata.
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(file: SprsFile) -> Result<Self, InvalidAdjacencyFile> {
        let (width, (nodes, edges)) = match file.header().index() {
            IndexVariant::U16 => (Width::U16, validate::<u16>(&file)?),
            IndexVariant::U32 => (Width::U32, validate::<u32>(&file)?),
            // signed widths fail the element check against u64.
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

    /// Borrows the edge-row index array at its stored width.
    fn values(&self) -> EdgeValues<'_> {
        let expect = "construction validated the element types";
        match self.width {
            Width::U16 => EdgeValues::U16(self.file.indices().expect(expect)),
            Width::U32 => EdgeValues::U32(self.file.indices().expect(expect)),
            Width::U64 => EdgeValues::U64(self.file.indices().expect(expect)),
        }
    }

    /// Returns the run between fenceposts `start` and `end`.
    ///
    /// # Panics
    ///
    /// Panics if either fencepost index is outside the column or the selected fenceposts describe a
    /// reversed slot range.
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

    /// Returns the strictly ascending edge rows leaving `node`.
    ///
    /// Returns [`None`] when `node` is outside the node domain.
    #[must_use]
    pub(crate) fn outgoing(&self, node: NodeRowId) -> Option<EdgeList<'_>> {
        let posts = self.posts(node)?;
        Some(self.run(posts, posts + 1))
    }

    /// Returns the strictly ascending edge rows arriving at `node`.
    ///
    /// Returns [`None`] when `node` is outside the node domain.
    #[must_use]
    pub(crate) fn incoming(&self, node: NodeRowId) -> Option<EdgeList<'_>> {
        let posts = self.posts(node)?;
        Some(self.run(posts + 1, posts + 2))
    }
}

/// Validates incident-edge runs in a CSR file at index type `I`.
///
/// Returns the node and edge counts. The file must use CSR storage. The matrix check establishes
/// compressed structure, and the additional checks require paired runs, an edge-domain column
/// bound, a zero first fencepost, and one slot per edge per direction.
///
/// # Errors
///
/// Returns [`InvalidAdjacencyFile`] for invalid matrix or list structure, in check order.
///
/// # Panics
///
/// A CSC file can panic when its pointer count or index domain differs from the CSR interpretation.
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

    // A CSR matrix has one compressed run per row, covering every stored entry. For nonempty input
    // the checked column bound equals E, giving 2E possible (direction, edge) pairs. The walk
    // visits all 2E slots and rejects repeated pairs using one bitset per direction. Therefore
    // every edge occupies exactly one slot in each direction. For E = 0 there are no indices to
    // access in the empty bitsets.
    let capacity = usize::try_from(edges).expect("resident edge domains fit usize");
    let mut seen = [
        DenseBitSet::new_empty(capacity),
        DenseBitSet::new_empty(capacity),
    ];

    for run in 0..usize::try_from(rows).expect("resident node domains fit usize") {
        let start = usize::try_from(fenceposts[run]).expect("slots fit the address space");
        let end = usize::try_from(fenceposts[run + 1]).expect("slots fit the address space");

        // even runs are outgoing, odd runs incoming.
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

/// A borrowed edge row id array at its stored unsigned width.
///
/// Accessors widen each id to `u64`.
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
    /// Panics if `range.start > range.end` or `range.end` exceeds [`len`](Self::len).
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

/// One node's strictly ascending edge rows for a single direction.
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
