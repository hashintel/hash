//! The relation indexes' published forms and their mapped readers.
//!
//! A [`ProtectionIndex`] publishes as one [`crate::file::sprs`] file holding its
//! [`ProtectionMatrix`](super::protection::ProtectionMatrix) verbatim; the evidence pair travels as
//! an opaque 8-byte value. [`ProtectionArchive`] reopens the file over a whole-file mapping and
//! validates the index invariants once, so hard-negative mining reads the evidence from the page
//! cache without holding it on the heap.
//!
//! An [`AttractionIndex`] publishes as one [`crate::file::attraction`] file: group records over a
//! flat edge array, the same factorization the resident index stores. [`AttractionArchive`] reopens
//! it the same way and validates the index invariants once, so relation-edge sampling reads groups
//! and edges from the page cache.

use core::{error::Error, fmt, marker::PhantomData};
use std::io;

use hashql_core::id::Id;

use super::{
    EffectiveConfidence, Scored,
    attraction::{AttractionEdge, AttractionIndex, AttractionWeights},
    protection::{ProtectionIndex, ProtectionValidationError, ProtectionView, validate},
};
use crate::{
    file::{
        WriteInto,
        attraction::{
            EdgeRecord, EdgeRow, GroupRecord, NodeRow, read::AttractionFile, write::write_records,
        },
        sprs::{
            read::{SprsFile, SprsMatrixError},
            write::{WriteSprsError, write_matrix},
        },
    },
    identity::OntologyRowId,
    integrity::{Sha256, Sha256Digest, Writer},
};

impl<N> WriteInto for ProtectionIndex<N>
where
    N: Id,
{
    type Error = WriteSprsError;

    /// Writes the index as a sparse matrix file.
    ///
    /// Returns the SHA-256 of the written bytes, which is the identity the repository records for
    /// the published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails, or the index spans zero rows, which the
    /// format cannot represent: a generation without node rows publishes no artifacts.
    fn write_into(&self, write: impl io::Write) -> Result<Sha256Digest, WriteSprsError> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        write_matrix(&self.matrix(), &mut writer).map_err(|error| match error {
            error @ (WriteSprsError::Io(_) | WriteSprsError::ZeroDimension { .. }) => error,
            // A validated index is row-compressed and unsliced.
            WriteSprsError::Sliced => {
                unreachable!("a validated index's pointers begin at zero")
            }
        })?;

        Ok(writer.accumulator.finalize())
    }
}

/// An opened sparse matrix file does not hold a valid protection index.
#[derive(Debug)]
pub(crate) enum InvalidProtectionFile {
    /// The file does not hold the index's matrix layout.
    Matrix(SprsMatrixError),
    /// The matrix violates a [`ProtectionIndex`] invariant.
    Invalid(ProtectionValidationError),
}

impl From<ProtectionValidationError> for InvalidProtectionFile {
    fn from(invalid: ProtectionValidationError) -> Self {
        Self::Invalid(invalid)
    }
}

impl fmt::Display for InvalidProtectionFile {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Matrix(error) => {
                write!(fmt, "the file does not hold a protection matrix: {error}")
            }
            Self::Invalid(invalid) => invalid.fmt(fmt),
        }
    }
}

impl Error for InvalidProtectionFile {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Matrix(error) => Some(error),
            Self::Invalid(invalid) => Some(invalid),
        }
    }
}

/// A published protection index opened over its mapped file.
///
/// Construction checks the index invariants once, so an open index only serves valid views; the
/// matrix regions stay in the page cache under memory pressure and off the heap. Each
/// [`view`](Self::view) re-checks the compressed-row structure ([`SprsFile::matrix`]'s contract),
/// so stages call it once and hold the view.
#[derive(Debug)]
pub(crate) struct ProtectionArchive<N> {
    file: SprsFile,
    _marker: PhantomData<N>,
}

impl<N> ProtectionArchive<N>
where
    N: Id,
{
    /// Opens the index over its mapped file.
    ///
    /// # Errors
    ///
    /// Returns an error when the file does not hold the index's matrix layout or the matrix
    /// violates a [`ProtectionIndex`] invariant.
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(file: SprsFile) -> Result<Self, InvalidProtectionFile> {
        let matrix = file.matrix().map_err(InvalidProtectionFile::Matrix)?;
        validate(matrix)?;

        Ok(Self {
            file,
            _marker: PhantomData,
        })
    }

    /// Borrows the validated index.
    #[must_use]
    pub(crate) fn view(&self) -> ProtectionView<'_, N> {
        let matrix = self
            .file
            .matrix()
            .expect("construction viewed this immutable file's matrix");

        ProtectionView::new_unchecked(matrix)
    }
}

impl<N, E> AttractionIndex<N, E>
where
    N: NodeRow,
    E: EdgeRow,
{
    /// Writes the index as an attraction file.
    ///
    /// The file persists the index's row domains in its header, so it reopens only under the
    /// same types. `rows` is the row count of the endpoint domain the edges index into; the
    /// index does not carry it, the caller's generation does. Returns the SHA-256 of the written
    /// bytes: the identity the repository records for the published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    pub(crate) fn write_into(&self, rows: u64, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        let mut edge_offset = 0;
        let groups = self.groups().iter().map(|group| {
            let weights = group.weights();
            let record = GroupRecord::new(
                group.relation(),
                edge_offset,
                weights.coincident,
                weights.proximal,
                weights.strength,
            );

            edge_offset += group.edges().len() as u64;
            record
        });
        let edges = self.groups().iter().flat_map(|group| {
            group.edges().iter().map(|edge| {
                EdgeRecord::new(
                    edge.edge,
                    edge.source,
                    edge.target,
                    edge.confidence.value(),
                    edge.normalization,
                    edge.confidence.scored().to_bits(),
                )
            })
        });
        write_records(rows, groups, self.edge_count() as u64, edges, &mut writer)?;

        Ok(writer.accumulator.finalize())
    }
}

/// An opened attraction file does not hold a valid attraction index.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum InvalidAttractionIndex {
    /// The file holds edges but no group to own them.
    OrphanEdges { edges: u64 },
    /// The group relations break the strictly ascending order.
    UnorderedRelations { group: usize },
    /// A group's edge range is empty, out of bounds, or out of order.
    BrokenEdgeRanges { group: usize },
    /// An edge references a node row outside the corpus domain.
    RowOutOfDomain { edge: usize },
    /// An edge carries score-provenance bits this module does not speak.
    UnknownScoredBits { edge: usize },
    /// The edges within one group break the ascending `(source, target, edge)` order.
    UnorderedEdges { edge: usize },
}

impl fmt::Display for InvalidAttractionIndex {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::OrphanEdges { edges } => {
                write!(fmt, "the file holds {edges} edges but no group to own them")
            }
            Self::UnorderedRelations { group } => write!(
                fmt,
                "the relation of group {group} breaks the strictly ascending order",
            ),
            Self::BrokenEdgeRanges { group } => write!(
                fmt,
                "the edge range of group {group} is empty, out of bounds, or out of order",
            ),
            Self::RowOutOfDomain { edge } => write!(
                fmt,
                "edge {edge} references a node row outside the corpus domain",
            ),
            Self::UnknownScoredBits { edge } => write!(
                fmt,
                "edge {edge} carries score-provenance bits this module does not speak",
            ),
            Self::UnorderedEdges { edge } => write!(
                fmt,
                "edge {edge} breaks its group's ascending (source, target, edge) order",
            ),
        }
    }
}

impl Error for InvalidAttractionIndex {}

/// A published attraction index opened over its mapped file.
///
/// Construction checks every index invariant once, so an open index only serves valid groups
/// and consumers re-validate nothing. The invariants:
///
/// - relations ascend strictly
/// - edge ranges partition the edge region into non-empty spans
/// - weights and scores stay in their domains
/// - edges ascend within their group
///
/// The regions stay in the page cache under memory pressure and off the heap.
#[derive(Debug)]
pub(crate) struct AttractionArchive<N, E> {
    file: AttractionFile<N, E>,
}

impl<N, E> AttractionArchive<N, E>
where
    N: NodeRow,
    E: EdgeRow,
{
    /// Opens the index over its mapped file.
    ///
    /// # Errors
    ///
    /// Returns an error when the file violates an attraction-index invariant.
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(file: AttractionFile<N, E>) -> Result<Self, InvalidAttractionIndex> {
        let groups = file.groups();
        let edges = file.edges();
        let rows = file.rows();

        if groups.is_empty() && !edges.is_empty() {
            return Err(InvalidAttractionIndex::OrphanEdges {
                edges: edges.len() as u64,
            });
        }

        for (index, group) in groups.iter().enumerate() {
            if index > 0 && groups[index - 1].relation() >= group.relation() {
                return Err(InvalidAttractionIndex::UnorderedRelations { group: index });
            }

            let start = group.edge_offset();
            let end = groups
                .get(index + 1)
                .map_or(edges.len() as u64, GroupRecord::edge_offset);

            let contiguous = (index > 0 || start == 0) && start < end;
            if !contiguous {
                return Err(InvalidAttractionIndex::BrokenEdgeRanges { group: index });
            }
        }

        let mut previous: Option<(N, N, E)> = None;
        let mut boundaries = groups
            .iter()
            .skip(1)
            .map(GroupRecord::edge_offset)
            .peekable();
        for (index, edge) in edges.iter().enumerate() {
            // Group boundaries reset the in-group order comparison.
            if boundaries.next_if_eq(&(index as u64)).is_some() {
                previous = None;
            }

            if edge.source().as_u64() >= rows || edge.target().as_u64() >= rows {
                return Err(InvalidAttractionIndex::RowOutOfDomain { edge: index });
            }

            if Scored::from_bits(edge.scored()).is_none() {
                return Err(InvalidAttractionIndex::UnknownScoredBits { edge: index });
            }

            let key = (edge.source(), edge.target(), edge.edge());
            if previous.is_some_and(|previous| previous >= key) {
                return Err(InvalidAttractionIndex::UnorderedEdges { edge: index });
            }

            previous = Some(key);
        }

        Ok(Self { file })
    }

    /// Returns the corpus row count the edges index into.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> u64 {
        self.file.rows()
    }

    /// Returns the relation group count.
    #[inline]
    #[must_use]
    pub(crate) fn group_count(&self) -> usize {
        self.file.groups().len()
    }

    /// Returns the retained instance count over all groups.
    #[inline]
    #[must_use]
    pub(crate) fn edge_count(&self) -> usize {
        self.file.edges().len()
    }

    /// Borrows one relation group.
    ///
    /// # Panics
    ///
    /// This panics when `index` is not below [`group_count`](Self::group_count).
    #[must_use]
    pub(crate) fn group(&self, index: usize) -> AttractionGroupView<'_, N, E> {
        let groups = self.file.groups();
        let record = &groups[index];

        // Construction validated the ranges against the edge region, so
        // the narrowing repeats accepted in-bounds values.
        let start = usize::try_from(record.edge_offset())
            .expect("a validated edge offset fits the address space");
        let end = groups.get(index + 1).map_or_else(
            || self.file.edges().len(),
            |next| {
                usize::try_from(next.edge_offset())
                    .expect("a validated edge offset fits the address space")
            },
        );

        AttractionGroupView {
            record,
            records: &self.file.edges()[start..end],
        }
    }
}

/// One relation group borrowed from a mapped attraction index.
#[derive(Debug, Copy, Clone)]
pub(crate) struct AttractionGroupView<'map, N, E> {
    record: &'map GroupRecord,
    records: &'map [EdgeRecord<N, E>],
}

impl<N, E> AttractionGroupView<'_, N, E>
where
    N: NodeRow,
    E: EdgeRow,
{
    /// Returns the relation type the group's instances share.
    #[inline]
    #[must_use]
    pub(crate) const fn relation(&self) -> OntologyRowId {
        self.record.relation()
    }

    /// Returns the relation's shared weight factors.
    #[inline]
    #[must_use]
    pub(crate) const fn weights(&self) -> AttractionWeights {
        AttractionWeights {
            coincident: self.record.coincident(),
            proximal: self.record.proximal(),
            strength: self.record.strength(),
        }
    }

    /// Returns the group's retained instance count, at least one.
    #[inline]
    #[must_use]
    pub(crate) const fn len(&self) -> usize {
        self.records.len()
    }

    /// Returns one instance, ascending by `(source, target, edge)`.
    ///
    /// # Panics
    ///
    /// This panics when `offset` is not below [`len`](Self::len).
    #[must_use]
    pub(crate) fn edge(&self, offset: usize) -> AttractionEdge<N, E> {
        decode(&self.records[offset])
    }

    /// Iterates the instances, ascending by `(source, target, edge)`.
    pub(crate) fn edges(&self) -> impl ExactSizeIterator<Item = AttractionEdge<N, E>> + '_ {
        self.records.iter().map(decode)
    }
}

/// Decodes one validated edge record into the resident edge type.
fn decode<N, E>(record: &EdgeRecord<N, E>) -> AttractionEdge<N, E>
where
    N: NodeRow,
    E: EdgeRow,
{
    let scored = Scored::from_bits(record.scored())
        .expect("the mapped index validated every provenance bit at open");

    AttractionEdge {
        edge: record.edge(),
        source: record.source(),
        target: record.target(),
        confidence: EffectiveConfidence::new(record.confidence(), scored),
        normalization: record.normalization(),
    }
}
