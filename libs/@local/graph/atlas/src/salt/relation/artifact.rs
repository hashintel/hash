//! The relation indexes' published forms and their mapped readers.
//!
//! A [`ProtectionIndex`] publishes as one [`crate::file::sprs`] file
//! holding its [`ProtectionMatrix`](super::protection::ProtectionMatrix)
//! verbatim; the evidence pair travels as an opaque 8-byte value.
//! [`ProtectionArchive`] reopens the file over a whole-file mapping and
//! validates the index invariants once, so hard-negative mining reads
//! the evidence from the page cache without holding it on the heap.
//!
//! An [`AttractionIndex`] publishes as one [`crate::file::attraction`]
//! file: group records over a flat edge array, the same factorization
//! the resident index stores. [`AttractionArchive`] reopens it the same
//! way and validates the index invariants once, so relation-edge
//! sampling reads groups and edges from the page cache.

use core::{error::Error, fmt};
use std::io;

use zerocopy::{F32, U32, U64};

use super::{
    EffectiveConfidence, Scored,
    attraction::{AttractionEdge, AttractionIndex, AttractionWeights},
    protection::{ProtectionIndex, ProtectionValidationError, ProtectionView, validate},
};
use crate::{
    dataset::{EdgeRowId, NodeRowId, OntologyRowId},
    file::{
        WriteInto,
        attraction::{EdgeRecord, GroupRecord, read::AttractionFile, write::write_records},
        sprs::{
            read::{SprsFile, SprsMatrixError},
            write::{WriteSprsError, write_matrix},
        },
    },
    integrity::{Sha256, Sha256Digest, Writer},
};

impl WriteInto for ProtectionIndex {
    type Error = WriteSprsError;

    /// Writes the index as a sparse matrix file.
    ///
    /// Returns the SHA-256 of the written bytes: the identity the
    /// repository records for the published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails, or the index
    /// spans zero rows, which the format cannot represent: a
    /// generation without node rows publishes no artifacts.
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
/// Construction checks the index invariants once, so an open index only
/// serves valid views; the matrix regions stay in the page cache under
/// memory pressure and off the heap. Each [`view`](Self::view)
/// re-checks the compressed-row structure ([`SprsFile::matrix`]'s
/// contract), so stages call it once and hold the view.
#[derive(Debug)]
pub(crate) struct ProtectionArchive {
    file: SprsFile,
}

impl ProtectionArchive {
    /// Opens the index over its mapped file.
    ///
    /// # Errors
    ///
    /// Returns an error when the file does not hold the index's matrix
    /// layout or the matrix violates a [`ProtectionIndex`] invariant.
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(file: SprsFile) -> Result<Self, InvalidProtectionFile> {
        let matrix = file.matrix().map_err(InvalidProtectionFile::Matrix)?;
        validate(matrix)?;

        Ok(Self { file })
    }

    /// Borrows the validated index.
    #[must_use]
    pub(crate) fn view(&self) -> ProtectionView<'_> {
        let matrix = self
            .file
            .matrix()
            .expect("construction viewed this immutable file's matrix");
        ProtectionView::new_unchecked(matrix)
    }
}

impl AttractionIndex {
    /// Writes the index as an attraction file.
    ///
    /// `rows` is the corpus row domain the edges index into; the index
    /// does not carry it, the caller's generation does. Returns the
    /// SHA-256 of the written bytes: the identity the repository
    /// records for the published file.
    ///
    /// # Errors
    ///
    /// Returns an error when the underlying writer fails.
    pub(crate) fn write_into(&self, rows: u64, write: impl io::Write) -> io::Result<Sha256Digest> {
        let mut writer = Writer {
            accumulator: Sha256::new(),
            writer: write,
        };

        let mut first_edge = 0_u64;
        let groups = self.groups().iter().map(|group| {
            let weights = group.weights();
            let record = GroupRecord {
                relation: U64::new(group.relation().get()),
                first_edge: U64::new(first_edge),
                coincident: F32::new(weights.coincident),
                proximal: F32::new(weights.proximal),
                strength: F32::new(weights.strength),
                reserved: U32::new(0),
            };
            first_edge += group.edges().len() as u64;
            record
        });
        let edges = self.groups().iter().flat_map(|group| {
            group.edges().iter().map(|edge| {
                let scored = edge.confidence.scored();
                let bits = u32::from(scored.link())
                    | (u32::from(scored.source()) << 1)
                    | (u32::from(scored.target()) << 2);
                EdgeRecord {
                    edge: U64::new(edge.edge.get()),
                    source: U64::new(edge.source.get()),
                    target: U64::new(edge.target.get()),
                    confidence: F32::new(edge.confidence.value()),
                    normalization: F32::new(edge.normalization),
                    scored: U32::new(bits),
                    reserved: U32::new(0),
                }
            })
        });
        write_records(rows, groups, self.edges() as u64, edges, &mut writer)?;

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
    /// A group weight is negative or not finite.
    InvalidWeights { group: usize },
    /// An edge references a node row outside the corpus domain.
    RowOutOfDomain { edge: usize },
    /// An edge confidence lies outside `[0, 1]` or is not finite.
    InvalidConfidence { edge: usize },
    /// An edge degree normalization lies outside `(0, 1]` or is not
    /// finite.
    InvalidDegreeNormalization { edge: usize },
    /// An edge carries score-provenance bits this module does not
    /// speak.
    UnknownScoredBits { edge: usize },
    /// The edges within one group break the ascending
    /// `(source, target, edge)` order.
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
            Self::InvalidWeights { group } => {
                write!(fmt, "a weight of group {group} is negative or not finite")
            }
            Self::RowOutOfDomain { edge } => write!(
                fmt,
                "edge {edge} references a node row outside the corpus domain",
            ),
            Self::InvalidConfidence { edge } => write!(
                fmt,
                "the confidence of edge {edge} lies outside [0, 1] or is not finite",
            ),
            Self::InvalidDegreeNormalization { edge } => write!(
                fmt,
                "the degree normalization of edge {edge} lies outside (0, 1] or is not finite",
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
/// Construction checks the index invariants once - relations strictly
/// ascending, edge ranges contiguous and non-empty, weights and scores
/// in domain, edges ascending within their group - so an open index
/// only serves valid groups and consumers re-validate nothing. The
/// regions stay in the page cache under memory pressure and off the
/// heap.
#[derive(Debug)]
pub(crate) struct AttractionArchive {
    file: AttractionFile,
}

impl AttractionArchive {
    /// Opens the index over its mapped file.
    ///
    /// # Errors
    ///
    /// Returns an error when the file violates an attraction-index
    /// invariant.
    #[tracing::instrument(skip_all)]
    pub(crate) fn new(file: AttractionFile) -> Result<Self, InvalidAttractionIndex> {
        let groups = file.groups();
        let edges = file.edges();
        let rows = file.rows();

        if groups.is_empty() && !edges.is_empty() {
            return Err(InvalidAttractionIndex::OrphanEdges {
                edges: edges.len() as u64,
            });
        }

        for (index, group) in groups.iter().enumerate() {
            if index > 0 && groups[index - 1].relation.get() >= group.relation.get() {
                return Err(InvalidAttractionIndex::UnorderedRelations { group: index });
            }

            let start = group.first_edge.get();
            let end = groups
                .get(index + 1)
                .map_or(edges.len() as u64, |next| next.first_edge.get());

            let contiguous = (index > 0 || start == 0) && start < end;
            if !contiguous {
                return Err(InvalidAttractionIndex::BrokenEdgeRanges { group: index });
            }

            let valid = |weight: f32| weight.is_finite() && weight >= 0.0;
            if !(valid(group.coincident.get())
                && valid(group.proximal.get())
                && valid(group.strength.get()))
            {
                return Err(InvalidAttractionIndex::InvalidWeights { group: index });
            }
        }

        let mut previous: Option<(u64, u64, u64)> = None;
        let mut boundaries = groups
            .iter()
            .skip(1)
            .map(|group| group.first_edge.get())
            .peekable();
        for (index, edge) in edges.iter().enumerate() {
            // Group boundaries reset the in-group order comparison.
            if boundaries.next_if_eq(&(index as u64)).is_some() {
                previous = None;
            }

            if edge.source.get() >= rows || edge.target.get() >= rows {
                return Err(InvalidAttractionIndex::RowOutOfDomain { edge: index });
            }

            let confidence = edge.confidence.get();
            if !(0.0..=1.0).contains(&confidence) {
                return Err(InvalidAttractionIndex::InvalidConfidence { edge: index });
            }

            let degree = edge.normalization.get();
            if !(degree > 0.0 && degree <= 1.0) {
                return Err(InvalidAttractionIndex::InvalidDegreeNormalization { edge: index });
            }

            if edge.scored.get() > 0b111 {
                return Err(InvalidAttractionIndex::UnknownScoredBits { edge: index });
            }

            let key = (edge.source.get(), edge.target.get(), edge.edge.get());
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
    /// Panics when `index` is not below [`group_count`](Self::group_count).
    #[must_use]
    pub(crate) fn group(&self, index: usize) -> AttractionGroupView<'_> {
        let groups = self.file.groups();
        let record = &groups[index];

        // Construction validated the ranges against the edge region, so
        // the narrowing repeats accepted in-bounds values.
        let start = usize::try_from(record.first_edge.get())
            .expect("a validated edge offset fits the address space");
        let end = groups.get(index + 1).map_or_else(
            || self.file.edges().len(),
            |next| {
                usize::try_from(next.first_edge.get())
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
pub(crate) struct AttractionGroupView<'map> {
    record: &'map GroupRecord,
    records: &'map [EdgeRecord],
}

impl AttractionGroupView<'_> {
    /// Returns the relation type the group's instances share.
    #[inline]
    #[must_use]
    pub(crate) const fn relation(&self) -> OntologyRowId {
        OntologyRowId::new(self.record.relation.get())
    }

    /// Returns the relation's shared weight factors.
    #[inline]
    #[must_use]
    pub(crate) const fn weights(&self) -> AttractionWeights {
        AttractionWeights {
            coincident: self.record.coincident.get(),
            proximal: self.record.proximal.get(),
            strength: self.record.strength.get(),
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
    /// Panics when `offset` is not below [`len`](Self::len).
    #[must_use]
    pub(crate) const fn edge(&self, offset: usize) -> AttractionEdge {
        decode(&self.records[offset])
    }

    /// Iterates the instances, ascending by `(source, target, edge)`.
    pub(crate) fn edges(&self) -> impl ExactSizeIterator<Item = AttractionEdge> + '_ {
        self.records.iter().map(decode)
    }
}

/// Decodes one validated edge record into the resident edge type.
const fn decode(record: &EdgeRecord) -> AttractionEdge {
    let bits = record.scored.get();
    let scored = Scored::new(bits & 0b001 != 0, bits & 0b010 != 0, bits & 0b100 != 0);

    AttractionEdge {
        edge: EdgeRowId::new(record.edge.get()),
        source: NodeRowId::new(record.source.get()),
        target: NodeRowId::new(record.target.get()),
        confidence: EffectiveConfidence::new(record.confidence.get(), scored)
            .expect("the mapped index validated every confidence at open"),
        normalization: record.normalization.get(),
    }
}
